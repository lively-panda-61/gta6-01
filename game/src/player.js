// Port Solano — the player on foot.
// A third-person character with walk/sprint, a camera that orbits on mouse
// drag (or pointer lock), and an aim mode. When driving, the car owns the
// camera instead; this module only handles the on-foot half.
import * as THREE from 'three';
import { TUNING } from './config.js';
import { makePersonModel } from './pedestrians.js';

export class Player {
  constructor(scene, city) {
    this.city = city;
    this.mesh = makePersonModel(0x2e6ac2, 0xe8b88a);
    this.mesh.scale.setScalar(1.05);
    scene.add(this.mesh);
    this.x = 24;
    this.z = 96;
    this.heading = 0; // facing direction
    this.camYaw = 0; // camera orbit
    this.camPitch = 0.32;
    this.health = TUNING.playerHealth;
    this.armor = 0;
    this.walkPhase = 0;
    this.moving = false;
    this.aiming = false;
    this.gun = null;
    this._buildGun();
  }

  _buildGun() {
    const gun = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.55),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    barrel.position.set(0.3, 1.15, 0.35);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.25, 0.12),
      new THREE.MeshLambertMaterial({ color: 0x3a2a1a }));
    grip.position.set(0.3, 1.0, 0.12);
    gun.add(barrel, grip);
    this.mesh.add(gun);
    this.gun = gun;
  }

  get position() { return { x: this.x, z: this.z }; }

  damage(amount) {
    let rest = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, rest);
      this.armor -= absorbed;
      rest -= absorbed;
    }
    this.health -= rest;
    return this.health <= 0;
  }

  heal(amount) {
    this.health = Math.min(TUNING.playerHealth, this.health + amount);
  }

  update(dt, axes, sprint, mouseDX, mouseDY, aiming) {
    this.camYaw -= mouseDX * 0.0032;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + mouseDY * 0.0022, -0.1, 1.1);
    this.aiming = aiming;
    const speed = sprint ? TUNING.playerSprintSpeed : TUNING.playerWalkSpeed;
    const moving = axes.x !== 0 || axes.y !== 0;
    this.moving = moving;
    if (moving) {
      // Movement is relative to the camera yaw.
      const forward = new THREE.Vector2(-Math.sin(this.camYaw), -Math.cos(this.camYaw));
      const right = new THREE.Vector2(-forward.y, forward.x);
      const mx = forward.x * axes.y + right.x * axes.x;
      const mz = forward.y * axes.y + right.y * axes.x;
      const len = Math.hypot(mx, mz) || 1;
      const step = speed * dt;
      const nx = this.x + (mx / len) * step;
      const nz = this.z + (mz / len) * step;
      const fixed = this.city.collideCircle(nx, nz, 0.6);
      const clamped = this.city.clampToCity(fixed.x, fixed.z, 2);
      this.x = clamped.x;
      this.z = clamped.z;
      this.heading = Math.atan2(mx, mz);
      this.walkPhase += dt * speed * 1.6;
    }
    const swing = moving ? Math.sin(this.walkPhase) * 0.55 : 0;
    this.mesh.userData.legL.rotation.x = swing;
    this.mesh.userData.legR.rotation.x = -swing;
    this.mesh.userData.armL.rotation.x = this.aiming ? -1.2 : -swing * 0.7;
    this.mesh.userData.armR.rotation.x = this.aiming ? -1.2 : swing * 0.7;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.aiming ? this.camYaw + Math.PI : this.heading;
    return { x: this.x, z: this.z, heading: this.heading };
  }

  // Third-person camera: behind and above, looking at the player's head.
  cameraPose() {
    const dist = this.aiming ? 4.5 : 7.5;
    const cx = this.x + Math.sin(this.camYaw) * dist;
    const cz = this.z + Math.cos(this.camYaw) * dist;
    const cy = 2.2 + Math.sin(this.camPitch) * dist * 0.9;
    return {
      position: new THREE.Vector3(cx, cy, cz),
      lookAt: new THREE.Vector3(this.x, 1.6, this.z),
    };
  }

  aimDirection(camera) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    return dir;
  }
}
