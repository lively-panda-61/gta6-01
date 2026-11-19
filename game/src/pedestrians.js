// Port Solano — pedestrians.
// Simple figures that stroll the sidewalks, pause at corners, and run
// away screaming (well: running) when a gun goes off nearby.
import * as THREE from 'three';
import { ROAD_LINES, TUNING } from './config.js';
import { makeRng } from './rng.js';

const SHIRT_COLORS = [0xc23a2e, 0x2e6ac2, 0xe0b83a, 0x3a9a5a, 0x8a4a9a, 0xd8d8d8, 0x2a2a2a, 0xe08a5a];
const SKIN_COLORS = [0xe8b88a, 0xc88a5a, 0x8a5a3a, 0xf0c8a0];

export function makePersonModel(shirt, skin) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2a3242 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.32), shirtMat);
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skinMat);
  head.position.y = 1.65;
  head.castShadow = true;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.22), pantsMat);
  legL.position.set(-0.14, 0.33, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.18), shirtMat);
  armL.position.set(-0.36, 1.05, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.36;
  g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

export class Pedestrian {
  constructor(scene, rng, city) {
    this.city = city;
    this.mesh = makePersonModel(rng.pick(SHIRT_COLORS), rng.pick(SKIN_COLORS));
    this.mesh.userData.isTarget = true;
    this.mesh.userData.targetRef = this;
    scene.add(this.mesh);
    // Start on a sidewalk next to a road.
    const line = rng.pick(ROAD_LINES);
    const along = rng.range(-210, 210);
    if (rng.chance(0.5)) { this.x = along; this.z = line + 7.5; }
    else { this.x = line + 7.5; this.z = along; }
    this.heading = rng.range(0, Math.PI * 2);
    this.speed = rng.range(1.2, 2.2);
    this.walkPhase = rng.range(0, Math.PI * 2);
    this.fleeing = 0;
    this.alive = true;
    this.health = 100;
  }

  scare(x, z) {
    const d = Math.hypot(this.x - x, this.z - z);
    if (d < 30) {
      this.fleeing = 3;
      this.heading = Math.atan2(this.x - x, this.z - z);
    }
  }

  update(dt) {
    if (!this.alive) return;
    if (this.fleeing > 0) {
      this.fleeing -= dt;
      this.speed = 5;
    } else {
      this.speed += (1.6 - this.speed) * dt;
    }
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    // Stay inside the city; bounce off the edge.
    if (Math.abs(this.x) > 232 || Math.abs(this.z) > 232) this.heading += Math.PI;
    const fixed = this.city.collideCircle(this.x, this.z, 0.5);
    this.x = fixed.x; this.z = fixed.z;
    this.walkPhase += dt * this.speed * 2.2;
    const swing = Math.sin(this.walkPhase) * 0.5;
    this.mesh.userData.legL.rotation.x = swing;
    this.mesh.userData.legR.rotation.x = -swing;
    this.mesh.userData.armL.rotation.x = -swing * 0.7;
    this.mesh.userData.armR.rotation.x = swing * 0.7;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  die() {
    this.alive = false;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.3;
  }
}

export class PedestrianSystem {
  constructor(scene, city, seed = 7) {
    this.rng = makeRng(seed);
    this.peds = [];
    for (let i = 0; i < TUNING.pedestrianCount; i += 1) {
      this.peds.push(new Pedestrian(scene, this.rng, city));
    }
  }

  update(dt) {
    for (const p of this.peds) p.update(dt);
  }

  scareAll(x, z) {
    for (const p of this.peds) p.scare(x, z);
  }

  get aliveCount() { return this.peds.filter((p) => p.alive).length; }

  nearestAlive(x, z, maxDist = 60) {
    let best = null, bestD = maxDist;
    for (const p of this.peds) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { best = p; bestD = d; }
    }
    return best;
  }
}
