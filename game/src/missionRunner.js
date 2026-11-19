// Port Solano — mission runtime: progression, objectives, waypoints.
// Turns the pure mission data into play: a glowing waypoint beacon, a
// courier van to chase, a limousine to defend, enemies to eliminate,
// timers, and rewards. The Game owns the systems; this module owns the
// mission state machine.
import * as THREE from 'three';
import { MISSIONS, missionById } from './missions.js';
import { makeCarModel } from './vehicles.js';

export class MissionRunner {
  constructor(scene, systems) {
    this.scene = scene;
    this.systems = systems; // { city, combat, police, hud, sound, traffic }
    this.active = null; // { mission, objectiveIndex, state }
    this.completedIds = [];
    this.beacon = null;
    this.van = null;
    this.limo = null;
    this.dwell = 0;
    this.timerLeft = 0;
    this._buildBeacon();
  }

  _buildBeacon() {
    const group = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd83a, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 30;
    group.add(beam);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.6),
      new THREE.MeshBasicMaterial({ color: 0xffd83a }),
    );
    diamond.position.y = 12;
    group.add(diamond);
    this.beaconDiamond = diamond;
    group.visible = false;
    this.scene.add(group);
    this.beacon = group;
  }

  start(missionId) {
    const mission = missionById(missionId);
    if (!mission) return null;
    this.stop();
    this.active = { mission, objectiveIndex: 0, state: 'running' };
    this.dwell = 0;
    this.timerLeft = 0;
    this._enterObjective();
    this.systems.hud.notify(`Mission: ${mission.title}`, mission.briefing);
    this.systems.hud.setObjective(this._currentObjectiveText());
    if (this.systems.sound) this.systems.sound.missionStart();
    return this.active;
  }

  stop() {
    if (this.van) { this.scene.remove(this.van.mesh); this.van = null; }
    if (this.limo) { this.scene.remove(this.limo.mesh); this.limo = null; }
    this.systems.combat.clearEnemies();
    if (this.beacon) this.beacon.visible = false;
    this.active = null;
  }

  currentObjective() {
    if (!this.active) return null;
    return this.active.mission.objectives[this.active.objectiveIndex] || null;
  }

  _currentObjectiveText() {
    const o = this.currentObjective();
    if (!o) return '';
    return `${this.active.mission.title} — ${o.text}`;
  }

  _enterObjective() {
    const o = this.currentObjective();
    if (!o) { this._completeMission(); return; }
    this.beacon.visible = true;
    this.beacon.position.set(o.target.x, 0, o.target.z);
    this.dwell = 0;
    if (o.type === 'timed') this.timerLeft = o.seconds || 120;
    if (o.type === 'eliminate') {
      const places = [];
      for (let i = 0; i < (o.count || 3); i += 1) {
        places.push([o.target.x + (i - 1) * 6, o.target.z + ((i % 2) * 8 - 4)]);
      }
      this.systems.combat.spawnEnemies(places);
    }
    if (o.type === 'chase') this._spawnVan(o.target);
    if (o.type === 'defend') this._spawnLimo(o.target);
    this.systems.hud.setObjective(this._currentObjectiveText());
  }

  _spawnVan(target) {
    const mesh = makeCarModel(0xd8d8d8, 'truck');
    mesh.position.set(target.x, 0, target.z);
    this.scene.add(mesh);
    this.van = { mesh, x: target.x, z: target.z, heading: 0, speed: 11, route: this._loopRoute(target) };
  }

  // A simple rectangular loop around the port district for the van.
  _loopRoute(start) {
    const pts = [
      { x: 120, z: -24 }, { x: 120, z: 72 }, { x: 192, z: 72 }, { x: 192, z: -24 },
    ];
    return { points: pts, index: 0 };
  }

  _spawnLimo(target) {
    const mesh = makeCarModel(0x1a1a1a, 'sedan');
    mesh.scale.set(1.15, 1, 1.35);
    mesh.position.set(target.x, 0, target.z);
    this.scene.add(mesh);
    this.limo = {
      mesh, x: target.x, z: target.z, health: 100,
      path: [{ x: -72, z: 144 }, { x: -24, z: 144 }, { x: -24, z: 48 }, { x: 24, z: 48 }, { x: 24, z: -24 }, { x: 48, z: -24 }],
      index: 0, speed: 9,
    };
  }

  _completeObjective() {
    const o = this.currentObjective();
    if (this.systems.sound) this.systems.sound.pickup();
    if (o.type === 'chase' && this.van) {
      // The van drops its cash where it was rammed.
      const drop = { x: this.van.x, z: this.van.z };
      this.scene.remove(this.van.mesh);
      this.van = null;
      // The next objective (collect the cash) points at the drop.
      const next = this.active.mission.objectives[this.active.objectiveIndex + 1];
      if (next) next.target = drop;
    }
    if (o.type === 'defend' && this.limo) {
      this.scene.remove(this.limo.mesh);
      this.limo = null;
    }
    this.systems.combat.clearEnemies();
    this.active.objectiveIndex += 1;
    if (this.active.objectiveIndex >= this.active.mission.objectives.length) {
      this._completeMission();
    } else {
      this._enterObjective();
    }
  }

  _completeMission() {
    const m = this.active.mission;
    this.completedIds.push(m.id);
    this.active = null;
    this.beacon.visible = false;
    this.systems.hud.notify('Mission complete', `${m.title} — $${m.reward.toLocaleString()} earned`);
    if (this.systems.sound) this.systems.sound.cash();
    if (this.onMissionComplete) this.onMissionComplete(m);
  }

  failMission(reason) {
    if (!this.active) return;
    const title = this.active.mission.title;
    this.stop();
    this.systems.hud.notify('Mission failed', `${title} — ${reason}. Press R to retry.`);
    if (this.onMissionFailed) this.onMissionFailed(title, reason);
  }

  retry() {
    if (this._lastFailedId) return this.start(this._lastFailedId);
    return null;
  }

  update(dt, playerPos, playerInCar, playerSpeed) {
    if (!this.active) return;
    const o = this.currentObjective();
    if (!o) return;
    // Beacon bob.
    if (this.beacon.visible) {
      this.beaconDiamond.position.y = 12 + Math.sin(performance.now() / 400) * 1.2;
      this.beaconDiamond.rotation.y += dt * 1.5;
    }
    const dist = Math.hypot(playerPos.x - o.target.x, playerPos.z - o.target.z);

    if (o.type === 'timed') {
      this.timerLeft -= dt;
      this.systems.hud.setTimer(Math.max(0, Math.ceil(this.timerLeft)));
      if (this.timerLeft <= 0) { this._lastFailedId = this.active.mission.id; this.failMission('out of time'); return; }
    } else {
      this.systems.hud.setTimer(null);
    }

    if (this.van) this._updateVan(dt, playerPos);
    if (this.limo) this._updateLimo(dt);

    switch (o.type) {
      case 'goto':
      case 'delivery':
        if (dist < (o.radius || 8)) this._completeObjective();
        break;
      case 'timed':
        if (dist < (o.radius || 10)) this._completeObjective();
        break;
      case 'heist':
        if (dist < (o.radius || 6)) {
          this.dwell += dt;
          this.systems.hud.setChannel(this.dwell / 2.5, 'Grabbing the ledger…');
          if (this.dwell >= 2.5) { this.systems.hud.setChannel(null); this._completeObjective(); }
        } else {
          this.dwell = 0;
          this.systems.hud.setChannel(null);
        }
        break;
      case 'eliminate':
        if (this.systems.combat.aliveEnemies.length === 0) this._completeObjective();
        break;
      case 'chase':
        if (this.van && Math.hypot(playerPos.x - this.van.x, playerPos.z - this.van.z) < 12) {
          this._completeObjective();
        }
        break;
      case 'escape':
        if (dist < (o.radius || 10) && this.systems.police.stars === 0) this._completeObjective();
        else if (dist < (o.radius || 10)) this.systems.hud.setObjective(`${this._currentObjectiveText()} — lose the cops first!`);
        break;
      case 'defend':
        if (this.limo) {
          const ld = Math.hypot(this.limo.x - o.target.x, this.limo.z - o.target.z);
          if (ld < (o.radius || 12)) this._completeObjective();
          else if (this.limo.health <= 0) { this._lastFailedId = this.active.mission.id; this.failMission('the limousine was destroyed'); }
        }
        break;
      default:
        break;
    }
  }

  _updateVan(dt, playerPos) {
    const van = this.van;
    const route = van.route;
    const next = route.points[route.index];
    const dx = next.x - van.x, dz = next.z - van.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4) { route.index = (route.index + 1) % route.points.length; return; }
    const heading = Math.atan2(dx, dz);
    van.heading = heading;
    van.x += Math.sin(heading) * van.speed * dt;
    van.z += Math.cos(heading) * van.speed * dt;
    van.mesh.position.set(van.x, 0, van.z);
    van.mesh.rotation.y = heading;
    // Rammed by the player: the van swerves and slows briefly.
    const pd = Math.hypot(playerPos.x - van.x, playerPos.z - van.z);
    if (pd < 4) van.speed = Math.max(5, van.speed - dt * 8);
    else van.speed += (11 - van.speed) * dt;
  }

  _updateLimo(dt) {
    const limo = this.limo;
    const next = limo.path[limo.index];
    if (!next) return;
    const dx = next.x - limo.x, dz = next.z - limo.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 3) { limo.index += 1; return; }
    const heading = Math.atan2(dx, dz);
    limo.x += Math.sin(heading) * limo.speed * dt;
    limo.z += Math.cos(heading) * limo.speed * dt;
    limo.mesh.position.set(limo.x, 0, limo.z);
    limo.mesh.rotation.y = heading;
    // Ambushers shoot at the limo from time to time.
    if (Math.random() < dt * 0.25 && this.systems.combat.aliveEnemies.length < 2) {
      this.systems.combat.spawnEnemies([[limo.x + 14, limo.z + 6]]);
    }
    for (const e of this.systems.combat.aliveEnemies) {
      const ed = Math.hypot(e.x - limo.x, e.z - limo.z);
      if (ed < 20 && Math.random() < dt * 0.5) limo.health -= dt * 6;
    }
  }

  get nextMission() {
    const done = new Set(this.completedIds);
    return MISSIONS.find((m) => !done.has(m.id)) || null;
  }
}
