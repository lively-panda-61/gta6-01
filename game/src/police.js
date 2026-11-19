// Port Solano — the wanted system and the police.
// Stars 0-5. Crimes raise them; they decay when the player lies low.
// Police cars spawn at the city edge and chase; at 3+ stars they set
// roadblocks ahead of the player; at 4+ a helicopter joins with a
// searchlight. Busted (a police car touches the player on foot at 1+
// stars while the player is slow) costs cash and drops the stars.
import * as THREE from 'three';
import { TUNING } from './config.js';
import { makeCarModel } from './vehicles.js';
import { makeRng } from './rng.js';

export class PoliceCar {
  constructor(scene, x, z) {
    this.mesh = makeCarModel(0x1a1a22, 'sedan');
    // Police livery: white doors, light bar.
    const doorMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.5, 2.4), doorMat);
    door.position.y = 0.6;
    this.mesh.add(door);
    const barMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 0.4), barMat);
    bar.position.set(0, 1.45, -0.2);
    this.mesh.add(bar);
    this.lightBar = bar;
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.heading = 0;
    this.speed = 0;
    this.maxSpeed = 30;
    this.flashPhase = Math.random() * 6;
  }

  update(dt, target, city) {
    const dx = target.x - this.x, dz = target.z - this.z;
    const dist = Math.hypot(dx, dz) || 1;
    const wantHeading = Math.atan2(dx, dz);
    let diff = wantHeading - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += THREE.MathUtils.clamp(diff, -1.8 * dt, 1.8 * dt);
    this.speed += ((dist > 8 ? this.maxSpeed : 6) - this.speed) * Math.min(1, dt * 0.8);
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const fixed = city.collideCircle(nx, nz, 1.6);
    this.x = fixed.x; this.z = fixed.z;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    this.flashPhase += dt * 8;
    this.lightBar.material.color.setHex(Math.sin(this.flashPhase) > 0 ? 0xff2222 : 0x2244ff);
    return dist;
  }

  remove(scene) { scene.remove(this.mesh); }
}

export class Helicopter {
  constructor(scene) {
    this.group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 6), bodyMat);
    body.castShadow = true;
    this.group.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 5), bodyMat);
    tail.position.set(0, 0.3, -5);
    this.group.add(tail);
    const rotorMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    this.rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.5), rotorMat);
    this.rotor.position.y = 1.2;
    this.group.add(this.rotor);
    this.spot = new THREE.SpotLight(0xfff2c8, 400, 90, 0.35, 0.5);
    this.spot.position.set(0, -1, 0);
    this.group.add(this.spot);
    this.spotTarget = new THREE.Object3D();
    this.group.add(this.spotTarget);
    this.spot.target = this.spotTarget;
    scene.add(this.group);
    this.group.visible = false;
  }

  update(dt, target) {
    this.group.visible = true;
    this.group.position.set(target.x + 14, 42, target.z + 14);
    this.rotor.rotation.y += dt * 22;
    this.spotTarget.position.set(target.x - this.group.position.x, -42, target.z - this.group.position.z);
  }

  hide() { this.group.visible = false; }
}

export class PoliceSystem {
  constructor(scene, city, sound) {
    this.scene = scene;
    this.city = city;
    this.sound = sound;
    this.rng = makeRng(4242);
    this.wanted = 0;
    this.cars = [];
    this.heli = new Helicopter(scene);
    this.heat = 0; // seconds since last crime
    this.spawnTimer = 0;
    this.roadblocks = [];
    this.bustedTimer = 0;
  }

  get stars() { return this.wanted; }

  addWanted(n, reason) {
    const before = this.wanted;
    this.wanted = Math.min(5, this.wanted + n);
    this.heat = 0;
    if (this.wanted > before && this.sound) this.sound.wantedUp();
    return { before, after: this.wanted, reason };
  }

  clearWanted() {
    this.wanted = 0;
    this.heat = 0;
    this._despawnAll();
  }

  _despawnAll() {
    for (const c of this.cars) c.remove(this.scene);
    this.cars = [];
    for (const r of this.roadblocks) this.scene.remove(r);
    this.roadblocks = [];
    this.heli.hide();
  }

  _spawnPositionNear(target) {
    const angle = this.rng.range(0, Math.PI * 2);
    const dist = this.rng.range(60, 90);
    const p = this.city.clampToCity(target.x + Math.sin(angle) * dist, target.z + Math.cos(angle) * dist, 6);
    return p;
  }

  // Spawn N police cars near a position at once (screenshot staging).
  spawnNear(target, count) {
    for (let i = 0; i < count; i += 1) {
      const p = this._spawnPositionNear(target);
      this.cars.push(new PoliceCar(this.scene, p.x, p.z));
    }
    return this.cars.length;
  }

  _desiredCarCount() {
    return this.wanted === 0 ? 0 : this.wanted + 1;
  }

  _makeRoadblock(target, heading) {
    const ahead = 26;
    const cx = target.x + Math.sin(heading) * ahead;
    const cz = target.z + Math.cos(heading) * ahead;
    const group = new THREE.Group();
    for (let i = -1; i <= 1; i += 1) {
      const car = makeCarModel(0x1a1a22, 'sedan');
      car.position.set(i * 4.4, 0, 0);
      car.rotation.y = Math.PI / 2;
      group.add(car);
    }
    group.position.set(cx, 0, cz);
    group.rotation.y = heading;
    this.scene.add(group);
    this.roadblocks.push(group);
  }

  update(dt, playerPos, playerSpeed, playerInCar, onBusted) {
    this.heat += dt;
    if (this.wanted > 0 && this.heat > TUNING.wantedDecaySeconds) {
      this.wanted -= 1;
      this.heat = 0;
      if (this.wanted === 0) this._despawnAll();
    }
    const want = this._desiredCarCount();
    this.spawnTimer -= dt;
    if (this.cars.length < want && this.spawnTimer <= 0) {
      this.spawnTimer = TUNING.policeResponseSeconds;
      const p = this._spawnPositionNear(playerPos);
      this.cars.push(new PoliceCar(this.scene, p.x, p.z));
    }
    while (this.cars.length > want) {
      const c = this.cars.pop();
      c.remove(this.scene);
    }
    let minDist = Infinity;
    for (const c of this.cars) {
      const d = c.update(dt, playerPos, this.city);
      minDist = Math.min(minDist, d);
    }
    // Roadblocks at 3+ stars, one at a time, ahead of the player.
    if (this.wanted >= 3 && this.roadblocks.length === 0 && playerInCar) {
      this._makeRoadblock(playerPos, Math.atan2(playerPos.x, playerPos.z));
    }
    if (this.wanted < 3 && this.roadblocks.length) {
      for (const r of this.roadblocks) this.scene.remove(r);
      this.roadblocks = [];
    }
    // Helicopter at 4+ stars.
    if (this.wanted >= 4) this.heli.update(dt, playerPos);
    else this.heli.hide();
    if (this.sound) this.sound.setSiren(this.wanted >= 2);
    // Busted: a police car touches the slow player on foot.
    if (!playerInCar && this.wanted > 0 && minDist < 2.2 && playerSpeed < 2) {
      this.bustedTimer += dt;
      if (this.bustedTimer > 1.2) {
        this.bustedTimer = 0;
        onBusted();
      }
    } else {
      this.bustedTimer = 0;
    }
  }
}
