// Port Solano — vehicles: car models, traffic AI, arcade driving.
// A car is a group of boxes built at runtime (no model files): body,
// cabin, wheels, lights. Traffic cars follow the road grid; the player's
// car uses arcade physics with drift.
import * as THREE from 'three';
import { ROAD_LINES, TUNING } from './config.js';
import { makeRng } from './rng.js';

const CAR_COLORS = [0xc23a2e, 0x2e6ac2, 0xe0b83a, 0x3a9a5a, 0x8a4a9a, 0xd8d8d8, 0x2a2a2a, 0x7ab8c8];

export function makeCarModel(color, kind = 'sedan') {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

  const len = kind === 'truck' ? 5.4 : kind === 'sports' ? 4.2 : 4.6;
  const wid = kind === 'truck' ? 2.2 : 2.0;
  const bodyH = kind === 'sports' ? 0.55 : 0.75;

  const body = new THREE.Mesh(new THREE.BoxGeometry(wid, bodyH, len), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.85, 0.6, len * 0.45), glassMat);
  cabin.position.set(0, bodyH + 0.55, kind === 'truck' ? 0.6 : -0.2);
  cabin.castShadow = true;
  group.add(cabin);

  if (kind === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.9, 0.08, 0.4), darkMat);
    spoiler.position.set(0, 1.05, -len / 2 + 0.2);
    group.add(spoiler);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.3),
      new THREE.MeshLambertMaterial({ color: 0xffd83a, emissive: 0x666600 }));
    sign.position.set(0, 1.5, 0);
    group.add(sign);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-wid / 2, len / 2 - 0.9], [wid / 2, len / 2 - 0.9], [-wid / 2, -len / 2 + 0.9], [wid / 2, -len / 2 + 0.9]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }

  // Headlights and taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8 });
  for (const hx of [-wid / 2 + 0.35, wid / 2 - 0.35]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), headMat);
    h.position.set(hx, 0.62, len / 2 + 0.01);
    group.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const tx of [-wid / 2 + 0.35, wid / 2 - 0.35]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tailMat);
    t.position.set(tx, 0.62, -len / 2 - 0.01);
    group.add(t);
  }

  group.userData = { kind, wheels, len, wid };
  return group;
}

// A traffic car: drives the road grid, turns at intersections, slows for
// the car ahead. Movement is axis-aligned, like a real street grid.
export class TrafficCar {
  constructor(scene, rng, city) {
    this.city = city;
    const kind = rng.pick(['sedan', 'sedan', 'sedan', 'taxi', 'truck', 'sports']);
    const color = kind === 'taxi' ? 0xe8c832 : rng.pick(CAR_COLORS);
    this.mesh = makeCarModel(color, kind);
    this.mesh.userData.taxiSign = kind === 'taxi';
    scene.add(this.mesh);
    // Start on a random road.
    const line = rng.pick(ROAD_LINES);
    const along = rng.range(-210, 210);
    const horizontal = rng.chance(0.5);
    this.x = horizontal ? along : line;
    this.z = horizontal ? line : along;
    this.heading = horizontal ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
    this.speed = rng.range(8, 13);
    this.targetSpeed = this.speed;
    this.horizontal = horizontal;
    this.length = 4.6;
  }

  get position() { return this.mesh.position; }

  update(dt, others) {
    // Slow for the car ahead.
    let ahead = Infinity;
    for (const o of others) {
      if (o === this) continue;
      const dx = o.x - this.x, dz = o.z - this.z;
      const forward = this.horizontal
        ? (Math.abs(this.heading) < 0.01 ? dx : -dx)
        : (this.heading > 0 ? dz : -dz);
      const lateral = this.horizontal ? Math.abs(dz) : Math.abs(dx);
      if (forward > 0 && forward < 14 && lateral < 3) ahead = Math.min(ahead, forward);
    }
    this.targetSpeed = ahead < 10 ? 0 : 11;
    this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * 1.5);
    const step = this.speed * dt;
    if (this.horizontal) this.x += Math.cos(this.heading) * step;
    else this.z += Math.sin(this.heading) * step;

    // At an intersection, sometimes turn onto the cross street.
    const nearLine = (v) => ROAD_LINES.find((l) => Math.abs(v - l) < 1.2);
    if (this.horizontal) {
      const cross = nearLine(this.x);
      if (cross !== undefined && Math.random() < 0.02) {
        this.horizontal = false;
        this.z = cross;
        this.heading = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      }
    } else {
      const cross = nearLine(this.z);
      if (cross !== undefined && Math.random() < 0.02) {
        this.horizontal = true;
        this.x = cross;
        this.heading = Math.random() < 0.5 ? 0 : Math.PI;
      }
    }
    // Wrap around the city edge.
    if (this.x > 235) this.x = -235;
    if (this.x < -235) this.x = 235;
    if (this.z > 235) this.z = -235;
    if (this.z < -235) this.z = 235;

    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.horizontal
      ? (Math.abs(this.heading) < 0.01 ? 0 : Math.PI)
      : (this.heading > 0 ? Math.PI / 2 : -Math.PI / 2);
    // Spin the wheels.
    const spin = (this.speed * dt) / 0.36;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
  }
}

export class TrafficSystem {
  constructor(scene, city, seed = 99) {
    this.rng = makeRng(seed);
    this.cars = [];
    for (let i = 0; i < TUNING.trafficCount; i += 1) {
      this.cars.push(new TrafficCar(scene, this.rng, city));
    }
    // A few parked cars the player can steal.
    this.parked = [];
    const spots = [[24, 120], [-24, -96], [72, 24], [-72, 72], [120, -24], [-120, -168], [48, 144], [-48, -144]];
    spots.forEach(([x, z], i) => {
      const kind = i % 3 === 0 ? 'sports' : 'sedan';
      const mesh = makeCarModel(this.rng.pick(CAR_COLORS), kind);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = this.rng.range(0, Math.PI * 2);
      scene.add(mesh);
      this.parked.push({ mesh, x, z, kind, taken: false });
    });
  }

  update(dt) {
    for (const car of this.cars) car.update(dt, this.cars);
  }

  nearestParked(x, z, maxDist = 5) {
    let best = null, bestD = maxDist;
    for (const p of this.parked) {
      if (p.taken) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { best = p; bestD = d; }
    }
    return best;
  }

  nearestTraffic(x, z, maxDist = 6) {
    let best = null, bestD = maxDist;
    for (const c of this.cars) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  removeTrafficCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    car.mesh.visible = false;
  }
}

// The player's car: arcade handling with acceleration, braking, reverse,
// steering that tightens at low speed, and a handbrake drift.
export class PlayerCar {
  constructor(mesh, city) {
    this.mesh = mesh;
    this.city = city;
    this.x = mesh.position.x;
    this.z = mesh.position.z;
    this.heading = 0;
    this.speed = 0;
    this.health = 100;
    this.kind = mesh.userData.kind || 'sedan';
  }

  get maxSpeed() { return this.kind === 'sports' ? 46 : this.kind === 'truck' ? 30 : TUNING.carMaxSpeed; }

  update(dt, axes, handbrake) {
    const steerTarget = -axes.x * TUNING.carSteer * Math.min(1, Math.abs(this.speed) / 8 + 0.35);
    const steer = THREE.MathUtils.clamp(steerTarget, -0.6, 0.6);
    if (axes.y > 0) this.speed += TUNING.carAccel * dt;
    else if (axes.y < 0) this.speed -= (this.speed > 0.5 ? TUNING.carBrake : TUNING.carAccel * 0.6) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 6 * dt);
    this.speed = THREE.MathUtils.clamp(this.speed, -TUNING.carMaxReverse, this.maxSpeed);
    if (handbrake) this.speed *= Math.max(0, 1 - dt * 1.2);
    this.heading += steer * (this.speed / 8) * dt * (this.speed >= 0 ? 1 : -1);
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const fixed = this.city.collideCircle(nx, nz, 1.6);
    const clamped = this.city.clampToCity(fixed.x, fixed.z, 3);
    if ((fixed.x !== nx || fixed.z !== nz) && Math.abs(this.speed) > 4) {
      this.speed *= 0.55; // a thud into a wall
    }
    this.x = clamped.x;
    this.z = clamped.z;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const spin = (this.speed * dt) / 0.36;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    // Body roll into corners.
    this.mesh.rotation.z = THREE.MathUtils.clamp(-steer * this.speed * 0.004, -0.06, 0.06);
  }

  get speedKmh() { return Math.abs(this.speed) * 3.6; }
}
