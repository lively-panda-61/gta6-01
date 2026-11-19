// Port Solano — combat: hitscan shooting, tracers, muzzle flash, and the
// rival-gang enemies who fight back during combat missions.
import * as THREE from 'three';
import { TUNING } from './config.js';
import { makePersonModel } from './pedestrians.js';

export class Enemy {
  constructor(scene, x, z) {
    this.mesh = makePersonModel(0x8a2a2a, 0xc88a5a);
    this.mesh.scale.setScalar(1.05);
    this.mesh.userData.isTarget = true;
    this.mesh.userData.targetRef = this;
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.health = TUNING.enemyHealth;
    this.alive = true;
    this.shootCooldown = 1 + Math.random();
    this.walkPhase = Math.random() * 6;
    this.mesh.position.set(x, 0, z);
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && this.alive) {
      this.alive = false;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.3;
      return true;
    }
    return false;
  }

  // Strafe and shoot at the player with poor aim.
  update(dt, playerPos, onShoot) {
    if (!this.alive) return;
    const dx = playerPos.x - this.x, dz = playerPos.z - this.z;
    const dist = Math.hypot(dx, dz) || 1;
    this.mesh.rotation.y = Math.atan2(dx, dz);
    if (dist > 14) {
      this.x += (dx / dist) * 3.2 * dt;
      this.z += (dz / dist) * 3.2 * dt;
      this.walkPhase += dt * 5;
      this.mesh.userData.legL.rotation.x = Math.sin(this.walkPhase) * 0.5;
      this.mesh.userData.legR.rotation.x = -Math.sin(this.walkPhase) * 0.5;
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.shootCooldown -= dt;
    if (this.shootCooldown <= 0 && dist < 45) {
      this.shootCooldown = 1.1 + Math.random() * 0.9;
      onShoot(this, dist);
    }
  }
}

export class CombatSystem {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.enemies = [];
    this.raycaster = new THREE.Raycaster();
    this.muzzle = new THREE.PointLight(0xffc860, 0, 12);
    scene.add(this.muzzle);
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
    this.tracers = [];
    this.shotsFired = 0;
  }

  spawnEnemies(places) {
    for (const [x, z] of places) {
      this.enemies.push(new Enemy(this.scene, x, z));
    }
    return this.enemies;
  }

  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }

  get aliveEnemies() { return this.enemies.filter((e) => e.alive); }

  // Hitscan shot from the camera centre. Returns what it hit, if anything.
  shoot(origin, direction, hittables) {
    this.shotsFired += 1;
    this.muzzle.position.copy(origin).addScaledVector(direction, 1.2);
    this.muzzle.intensity = 60;
    window.setTimeout(() => { this.muzzle.intensity = 0; }, 60);
    this.raycaster.set(origin, direction);
    this.raycaster.far = TUNING.pistolRange;
    const targets = [];
    for (const h of hittables) {
      if (h.mesh) targets.push(h.mesh);
    }
    const hits = this.raycaster.intersectObjects(targets, true);
    let end = origin.clone().addScaledVector(direction, TUNING.pistolRange);
    let hit = null;
    if (hits.length) {
      const first = hits[0];
      end = first.point.clone();
      // Walk up to the object that owns userData.
      let obj = first.object;
      while (obj && !obj.userData.isTarget && obj.parent) obj = obj.parent;
      hit = { point: first.point, object: obj, distance: first.distance };
    }
    this._spawnTracer(origin, end);
    return hit;
  }

  _spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, this.tracerMat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  enemyShoot(enemy, playerPos, damagePlayer) {
    const from = new THREE.Vector3(enemy.x, 1.4, enemy.z);
    const to = new THREE.Vector3(playerPos.x, 1.2, playerPos.z);
    // Enemies miss most of the time at range.
    const dist = from.distanceTo(to);
    const spread = 1.5 + dist * 0.05;
    to.x += (Math.random() - 0.5) * spread;
    to.y += (Math.random() - 0.5) * spread * 0.5;
    to.z += (Math.random() - 0.5) * spread;
    this._spawnTracer(from, to);
    const hitChance = Math.max(0.08, 0.35 - dist * 0.006);
    if (Math.random() < hitChance) damagePlayer(8 + Math.floor(Math.random() * 8));
  }

  update(dt, playerPos, damagePlayer) {
    for (const e of this.enemies) e.update(dt, playerPos, (enemy, dist) => this.enemyShoot(enemy, playerPos, damagePlayer));
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }
}
