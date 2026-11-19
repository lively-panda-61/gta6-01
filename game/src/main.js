// Port Solano — the game itself: bootstrap, loop, and wiring.
// Owns the renderer, the state machine (menu / playing / paused /
// game over), the player/car switch, shooting, stealing, saving, and the
// debug hooks the test suite drives through window.__game.
import * as THREE from 'three';
import { TUNING } from './config.js';
import { buildCity } from './city.js';
import { TrafficSystem, PlayerCar, makeCarModel } from './vehicles.js';
import { PedestrianSystem } from './pedestrians.js';
import { Player } from './player.js';
import { CombatSystem } from './combat.js';
import { PoliceSystem } from './police.js';
import { MissionRunner } from './missionRunner.js';
import { MISSIONS } from './missions.js';
import { Hud } from './hud.js';
import { SoundEngine } from './audio.js';
import { Input } from './input.js';
import { createSaveSystem, defaultSave } from './save.js';
import { applyShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || 1337);

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.phase = 'menu';
    this.ready = false;
    this.cash = 250;
    this.stats = { carsStolen: 0, missionsDone: 0, wantedMax: 0, distanceDriven: 0 };
    this.clockMinutes = 1000; // 16:40, golden hour
    this.inCar = false;
    this.playerCar = null;
    this.vistaCamera = null;
    this.autoDrive = false; // screenshot staging drives the car itself
    this.shootCooldown = 0;
    this.elapsed = 0;
    this.paused = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(24, 8, 110);

    this.city = buildCity(this.scene, SEED);
    this.traffic = new TrafficSystem(this.scene, this.city);
    this.peds = new PedestrianSystem(this.scene, this.city);
    this.player = new Player(this.scene, this.city);
    this.combat = new CombatSystem(this.scene, this.camera);
    this.sound = new SoundEngine();
    this.input = new Input(canvas);
    this.input.onFirstGesture = () => this.sound.unlock();
    this.police = new PoliceSystem(this.scene, this.city, this.sound);
    this.hud = new Hud();
    this.missions = new MissionRunner(this.scene, {
      city: this.city, combat: this.combat, police: this.police,
      hud: this.hud, sound: this.sound, traffic: this.traffic,
    });
    this.missions.onMissionComplete = (m) => this._onMissionComplete(m);
    this.missions.onMissionFailed = () => { /* retry with R */ };
    this.saves = createSaveSystem(window.localStorage);

    this._camPos = new THREE.Vector3(24, 8, 110);
    this._camLook = new THREE.Vector3(24, 1.6, 96);
    this._wireMenu();
    this._wireResize();
    this._updateHudStatic();
    this.ready = true;
  }

  // --- Menu / phases ------------------------------------------------------
  _wireMenu() {
    const $ = (id) => document.getElementById(id);
    $('btn-new').addEventListener('click', () => {
      this.sound.unlock();
      this.sound.click();
      this.startPlaying();
    });
    const save = this.saves.load();
    if (save) {
      $('btn-continue').style.display = 'inline-block';
      $('btn-continue').addEventListener('click', () => {
        this.sound.unlock();
        this.sound.click();
        this._loadSave(save);
        this.startPlaying();
      });
    }
    $('btn-save').addEventListener('click', () => { this.saveGame(); this.sound.click(); });
    $('btn-resume').addEventListener('click', () => this.togglePause(false));
    $('btn-restart').addEventListener('click', () => window.location.reload());
    $('btn-retry').addEventListener('click', () => this._respawn());
    $('btn-mute').addEventListener('click', () => {
      this.sound.setMuted(!this.sound.muted);
      $('btn-mute').textContent = this.sound.muted ? 'Unmute (M)' : 'Mute (M)';
    });
    $('screen-start').style.display = 'flex';
  }

  _wireResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  startPlaying({ silent = false } = {}) {
    this.phase = 'playing';
    document.getElementById('screen-start').style.display = 'none';
    document.getElementById('screen-gameover').style.display = 'none';
    document.getElementById('screen-pause').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    if (!silent) this.hud.notify('Port Solano', 'Press N to start the next job. E steals a car. Good luck, Vex.');
    this._updateHudStatic();
  }

  togglePause(force) {
    if (this.phase !== 'playing' && this.phase !== 'paused') return;
    this.paused = force !== undefined ? force : !this.paused;
    this.phase = this.paused ? 'paused' : 'playing';
    document.getElementById('screen-pause').style.display = this.paused ? 'flex' : 'none';
  }

  // --- Player / car ---------------------------------------------------------
  playerPos() {
    if (this.inCar && this.playerCar) return { x: this.playerCar.x, z: this.playerCar.z };
    return { x: this.player.x, z: this.player.z };
  }

  teleportPlayer(x, z, heading = 0) {
    this.player.x = x;
    this.player.z = z;
    this.player.camYaw = heading;
    this.player.mesh.position.set(x, 0, z);
  }

  placePlayerInCar(x, z, heading, kind = 'sedan') {
    const mesh = makeCarModel(kind === 'sports' ? 0xc23a2e : 0x2e6ac2, kind);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.playerCar = new PlayerCar(mesh, this.city);
    this.playerCar.heading = heading;
    this.player.mesh.visible = false;
    this.inCar = true;
    this.sound.engineStart();
  }

  _enterCar(car) {
    // car: { mesh, x, z, kind } — a parked car or a hijacked traffic car.
    if (car.mesh && car.mesh.parent) car.mesh.parent.remove(car.mesh);
    const mesh = car.mesh;
    mesh.visible = true;
    this.scene.add(mesh);
    this.playerCar = new PlayerCar(mesh, this.city);
    this.playerCar.heading = mesh.rotation.y;
    this.playerCar.x = mesh.position.x;
    this.playerCar.z = mesh.position.z;
    this.player.mesh.visible = false;
    this.inCar = true;
    this.stats.carsStolen += 1;
    this.police.addWanted(1, 'car theft');
    this.sound.door();
    this.sound.engineStart();
    this.hud.notify('Car stolen', 'The police are on their way. Drive.');
  }

  _exitCar() {
    if (!this.playerCar) return;
    const { x, z, heading } = this.playerCar;
    this.teleportPlayer(x + Math.sin(heading + Math.PI / 2) * 2.5, z + Math.cos(heading + Math.PI / 2) * 2.5, heading);
    this.player.mesh.visible = true;
    this.playerCar = null;
    this.inCar = false;
    this.sound.door();
  }

  _tryEnterCar() {
    const pos = this.playerPos();
    const parked = this.traffic.nearestParked(pos.x, pos.z, 5);
    if (parked) {
      parked.taken = true;
      this._enterCar({ mesh: parked.mesh, x: parked.x, z: parked.z, kind: parked.kind });
      return;
    }
    const moving = this.traffic.nearestTraffic(pos.x, pos.z, 6);
    if (moving) {
      this.traffic.removeTrafficCar(moving);
      this._enterCar({ mesh: moving.mesh, x: moving.x, z: moving.z, kind: moving.mesh.userData.kind });
    }
  }

  // --- Shooting ---------------------------------------------------------------
  _fireWeapon() {
    if (this.shootCooldown > 0) return;
    this.shootCooldown = 0.22;
    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const hittables = [
      ...this.combat.enemies.filter((e) => e.alive).map((e) => e.mesh),
      ...this.peds.peds.filter((p) => p.alive).map((p) => p.mesh),
    ];
    const hit = this.combat.shoot(origin, dir, hittables);
    this.sound.shoot();
    this.police.addWanted(1, 'gunfire');
    this.peds.scareAll(this.player.x, this.player.z);
    if (hit && hit.object) {
      const ref = hit.object.userData.targetRef || hit.object.parent?.userData?.targetRef;
      if (ref && ref instanceof Object && 'health' in ref && this.combat.enemies.includes(ref)) {
        const killed = ref.damage(34);
        this.sound.hit();
        if (killed) this.hud.notify('Target down', 'One less of Marlow\'s crew.');
      } else if (ref && this.peds.peds.includes(ref)) {
        ref.die();
        this.police.addWanted(2, 'pedestrian down');
      }
    }
  }

  // --- Missions / save -----------------------------------------------------------
  _onMissionComplete(mission) {
    this.cash += mission.reward;
    this.stats.missionsDone += 1;
    this.saveGame();
    this._updateHudStatic();
    if (this.missions.nextMission) {
      this.hud.notify('Next job available', `${this.missions.nextMission.title} — press N to start.`);
    } else {
      this.hud.notify('Story complete', 'Marlow is finished. Port Solano is yours, Vex.');
    }
  }

  saveGame() {
    const state = {
      ...defaultSave(),
      cash: this.cash,
      completedMissions: [...this.missions.completedIds],
      activeMissionId: this.missions.active ? this.missions.active.mission.id : null,
      stats: { ...this.stats },
      player: { x: this.player.x, z: this.player.z, heading: this.player.heading, health: this.player.health },
    };
    this.saves.save(state);
    this.hud.notify('Saved', 'Progress saved to this browser.');
    return state;
  }

  _loadSave(save) {
    this.cash = save.cash || 250;
    this.missions.completedIds = [...(save.completedMissions || [])];
    this.stats = { ...defaultSave().stats, ...(save.stats || {}) };
    if (save.player) {
      this.teleportPlayer(save.player.x, save.player.z, save.player.heading || 0);
      this.player.health = save.player.health || 100;
    }
    if (save.activeMissionId) this.missions.start(save.activeMissionId);
  }

  _respawn() {
    this.player.health = 100;
    this.player.armor = 50;
    this.police.clearWanted();
    this.teleportPlayer(24, 96, 0);
    this.phase = 'playing';
    document.getElementById('screen-gameover').style.display = 'none';
    this.hud.notify('Back on your feet', 'The hospital patched you up. Armor restocked.');
  }

  _busted() {
    const fine = Math.min(this.cash, 500);
    this.cash -= fine;
    this.police.clearWanted();
    this.teleportPlayer(24, 96, 0);
    this.hud.notify('Busted', `The police took $${fine} and let you walk.`);
    this._updateHudStatic();
  }

  setVistaCamera(pos, lookAt) {
    this.vistaCamera = { pos: new THREE.Vector3(pos.x, pos.y, pos.z), lookAt: new THREE.Vector3(lookAt.x, lookAt.y, lookAt.z) };
  }

  _updateHudStatic() {
    this.hud.setCash(this.cash);
    this.hud.setMissionList(MISSIONS, this.missions.completedIds, this.missions.active?.mission.id || null);
  }

  // --- Debug hooks (tests + screenshot staging) ----------------------------------
  state() {
    const pos = this.playerPos();
    return {
      phase: this.phase,
      ready: this.ready,
      buildings: this.city.buildingCount,
      trafficCars: this.traffic.cars.length,
      pedestrians: this.peds.aliveCount,
      missionCount: MISSIONS.length,
      player: { x: pos.x, z: pos.z },
      inCar: this.inCar,
      speedKmh: this.inCar && this.playerCar ? this.playerCar.speedKmh : 0,
      wanted: this.police.stars,
      objective: this.missions.active ? this.missions._currentObjectiveText() : '',
      cash: this.cash,
    };
  }

  debugPlaceByCar() {
    const pos = this.playerPos();
    const parked = this.traffic.nearestParked(pos.x, pos.z, 500);
    if (!parked) return false;
    this.teleportPlayer(parked.x + 2.5, parked.z, 0);
    return true;
  }

  debugStartMission(index) {
    const mission = MISSIONS[index];
    if (!mission) return null;
    const started = this.missions.start(mission.id);
    return started ? { active: true, title: mission.title } : null;
  }

  // --- Main loop -------------------------------------------------------------------
  start() {
    const clock = new THREE.Clock();
    this._acc = 0;
    const STEP = 1 / 60;
    const loop = () => {
      requestAnimationFrame(loop);
      // Fixed-step physics: under a slow renderer (software GL) a frame
      // can take half a second, so advance the world in 1/60s slices
      // instead of one huge capped delta — otherwise the game would run
      // in slow motion and the player would barely move.
      const dt = Math.min(clock.getDelta(), 0.25);
      this.elapsed += dt;
      if (this.phase === 'playing' && !this.paused) {
        this._acc += dt;
        let n = 0;
        while (this._acc >= STEP && n < 16) {
          this.update(STEP);
          this._acc -= STEP;
          n += 1;
        }
        if (n === 16) this._acc = 0;
      } else {
        this.city.update(this.elapsed, dt);
      }
      this.renderer.render(this.scene, this.camera);
    };
    loop();
    if (SHOT) applyShot(this, SHOT);
  }

  update(dt) {
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.clockMinutes += dt / 3;
    let axes = this.input.axes();
    if (this.autoDrive && this.inCar) axes = { x: 0, y: 1 };
    const mouse = this.input.consumeMouse();
    const aiming = this.input.mouseDown || this.input.down('ShiftLeft');

    // Global keys.
    if (this.input.wasPressed('KeyP') || this.input.wasPressed('Escape')) this.togglePause();
    if (this.input.wasPressed('KeyM')) this.sound.setMuted(!this.sound.muted);
    if (this.input.wasPressed('KeyN') && !this.missions.active && this.missions.nextMission) {
      this.missions.start(this.missions.nextMission.id);
      this._updateHudStatic();
    }
    if (this.input.wasPressed('KeyR') && !this.missions.active && this.missions._lastFailedId) {
      this.missions.start(this.missions._lastFailedId);
    }
    if (this.input.wasPressed('KeyE')) {
      if (this.inCar) this._exitCar();
      else this._tryEnterCar();
    }
    if (this.input.wasPressed('KeyF') && this.inCar) this._exitCar();
    if (this.input.consumeClick()) this._fireWeapon();

    // Player or car.
    if (this.inCar && this.playerCar) {
      this.playerCar.update(dt, axes, this.input.down('Space'));
      this.stats.distanceDriven += Math.abs(this.playerCar.speed) * dt;
      this.sound.setEngine(Math.abs(this.playerCar.speed) / this.playerCar.maxSpeed);
      // Ram pedestrians.
      for (const p of this.peds.peds) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x - this.playerCar.x, p.z - this.playerCar.z);
        if (d < 1.8 && Math.abs(this.playerCar.speed) > 3) {
          p.die();
          this.police.addWanted(1, 'hit and run');
          this.sound.crash();
        }
      }
      // Bump traffic cars.
      for (const c of this.traffic.cars) {
        const d = Math.hypot(c.x - this.playerCar.x, c.z - this.playerCar.z);
        if (d < 3.4) {
          this.playerCar.speed *= 0.7;
          c.speed = Math.max(0, c.speed - 4);
        }
      }
    } else {
      this.player.update(dt, axes, this.input.down('ShiftLeft'), mouse.dx, mouse.dy, aiming);
      this.sound.setEngine(0);
    }

    // World systems.
    this.city.update(this.elapsed, dt);
    this.traffic.update(dt);
    this.peds.update(dt);
    this.combat.update(dt, this.playerPos(), (dmg) => {
      const dead = this.player.damage(dmg);
      this.hud.flashDamage();
      if (dead) this._gameOver();
    });
    this.police.update(dt, this.playerPos(), this.inCar ? Math.abs(this.playerCar?.speed || 0) : 0, this.inCar, () => this._busted());
    this.stats.wantedMax = Math.max(this.stats.wantedMax, this.police.stars);
    this.missions.update(dt, this.playerPos(), this.inCar, this.inCar && this.playerCar ? this.playerCar.speed : 0);

    // Camera.
    this._updateCamera(dt);
    // HUD.
    const pos = this.playerPos();
    this.hud.setStars(this.police.stars);
    this.hud.setHealth(this.player.health, this.player.armor);
    this.hud.setCash(this.cash);
    this.hud.setClock(this.clockMinutes);
    this.hud.setSpeed(this.inCar && this.playerCar ? this.playerCar.speedKmh : 0, this.inCar);
    const near = this.inCar ? null : this.traffic.nearestParked(pos.x, pos.z, 5) || this.traffic.nearestTraffic(pos.x, pos.z, 6);
    this.hud.setPrompt(near ? 'Press E to steal the car' : '');
    this.hud.drawMinimap({
      player: { x: pos.x, z: pos.z, heading: this.inCar ? this.playerCar.heading : this.player.heading },
      police: this.police.cars.map((c) => ({ x: c.x, z: c.z })),
      traffic: this.traffic.cars.map((c) => ({ x: c.x, z: c.z })),
      waypoint: this.missions.active ? this.missions.currentObjective()?.target || null : null,
    });
    this.input.endFrame();
  }

  _updateCamera(dt) {
    let targetPos, targetLook;
    if (this.vistaCamera) {
      targetPos = this.vistaCamera.pos;
      targetLook = this.vistaCamera.lookAt;
    } else if (this.inCar && this.playerCar) {
      const h = this.playerCar.heading;
      const fx = Math.sin(h), fz = Math.cos(h);
      targetPos = new THREE.Vector3(
        this.playerCar.x - fx * 7.5, 3.8, this.playerCar.z - fz * 7.5,
      );
      targetLook = new THREE.Vector3(
        this.playerCar.x + fx * 6, 1.8, this.playerCar.z + fz * 6,
      );
    } else {
      const pose = this.player.cameraPose();
      targetPos = pose.position;
      targetLook = pose.lookAt;
    }
    const k = 1 - Math.exp(-dt * 7);
    this._camPos.lerp(targetPos, k);
    this._camLook.lerp(targetLook, k);
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camLook);
  }

  _gameOver() {
    this.phase = 'gameover';
    document.getElementById('screen-gameover').style.display = 'flex';
    this.hud.notify('Wasted', 'Marlow\'s crew got the better of you.');
  }
}

const game = new Game(document.getElementById('game'));
window.__game = game;
game.start();
