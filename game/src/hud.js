// Port Solano — the HUD: DOM panels plus a live 2D minimap.
// The minimap redraws the city grid from the same layout constants the
// city builder uses, with blips for the player, police, traffic and the
// mission waypoint. All text is plain DOM so it stays crisp in screenshots.
import { ROAD_LINES, WATER } from './config.js';

export class Hud {
  constructor() {
    this.el = {
      stars: document.getElementById('hud-stars'),
      health: document.getElementById('hud-health-fill'),
      armor: document.getElementById('hud-armor-fill'),
      cash: document.getElementById('hud-cash'),
      clock: document.getElementById('hud-clock'),
      speed: document.getElementById('hud-speed'),
      objective: document.getElementById('hud-objective'),
      missionList: document.getElementById('hud-missions'),
      toast: document.getElementById('hud-toast'),
      toastTitle: document.getElementById('hud-toast-title'),
      toastBody: document.getElementById('hud-toast-body'),
      prompt: document.getElementById('hud-prompt'),
      timer: document.getElementById('hud-timer'),
      channel: document.getElementById('hud-channel'),
      channelFill: document.getElementById('hud-channel-fill'),
      channelText: document.getElementById('hud-channel-text'),
      damage: document.getElementById('hud-damage'),
      minimap: document.getElementById('hud-minimap'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = null;
    this.channelVisible = false;
  }

  setStars(n) {
    const full = '★'.repeat(n);
    const empty = '☆'.repeat(Math.max(0, 5 - n));
    this.el.stars.textContent = full + empty;
    this.el.stars.classList.toggle('hot', n >= 3);
  }

  setHealth(hp, armor) {
    this.el.health.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    this.el.armor.style.width = `${Math.max(0, Math.min(100, armor))}%`;
  }

  setCash(cash) {
    this.el.cash.textContent = `$${cash.toLocaleString()}`;
  }

  setClock(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    this.el.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  setSpeed(kmh, inCar) {
    this.el.speed.textContent = inCar ? `${Math.round(kmh)} km/h` : '';
  }

  setObjective(text) {
    this.el.objective.textContent = text || '';
  }

  setTimer(seconds) {
    if (seconds === null || seconds === undefined) {
      this.el.timer.textContent = '';
      return;
    }
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    this.el.timer.textContent = `${m}:${String(s).padStart(2, '0')}`;
    this.el.timer.classList.toggle('urgent', seconds <= 30);
  }

  setChannel(progress, text) {
    if (progress === null || progress === undefined) {
      this.el.channel.style.display = 'none';
      return;
    }
    this.el.channel.style.display = 'block';
    this.el.channelFill.style.width = `${Math.min(100, progress * 100)}%`;
    this.el.channelText.textContent = text || '';
  }

  setPrompt(text) {
    this.el.prompt.textContent = text || '';
  }

  setMissionList(missions, completedIds, activeId) {
    const done = new Set(completedIds);
    this.el.missionList.innerHTML = missions.map((m) => {
      const cls = m.id === activeId ? 'active' : done.has(m.id) ? 'done' : '';
      const mark = done.has(m.id) ? '✓' : m.id === activeId ? '►' : '·';
      return `<div class="mission ${cls}"><span>${mark}</span> ${m.title} <em>$${m.reward.toLocaleString()}</em></div>`;
    }).join('');
  }

  notify(title, body) {
    this.el.toastTitle.textContent = title;
    this.el.toastBody.textContent = body;
    this.el.toast.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), 5200);
  }

  flashDamage() {
    this.el.damage.classList.add('show');
    setTimeout(() => this.el.damage.classList.remove('show'), 180);
  }

  // Minimap: 220x220 canvas, north up. Roads, water, plaza, then blips.
  drawMinimap(state) {
    const ctx = this.mapCtx;
    const S = 220;
    const toMap = (v) => ((v + 240) / 480) * S;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#20241f';
    ctx.fillRect(0, 0, S, S);
    // Water.
    ctx.fillStyle = '#2e7f9e';
    ctx.fillRect(0, toMap(WATER.z0), S, S - toMap(WATER.z0));
    // Blocks.
    ctx.fillStyle = '#3a3d3a';
    for (let bx = -192; bx <= 192; bx += 48) {
      for (let bz = -192; bz <= 192; bz += 48) {
        ctx.fillRect(toMap(bx - 18), toMap(bz - 18), (36 / 480) * S, (36 / 480) * S);
      }
    }
    // Roads.
    ctx.strokeStyle = '#6a6a6a';
    ctx.lineWidth = 2;
    for (const line of ROAD_LINES) {
      ctx.beginPath(); ctx.moveTo(0, toMap(line)); ctx.lineTo(S, toMap(line)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(toMap(line), 0); ctx.lineTo(toMap(line), S); ctx.stroke();
    }
    const blip = (x, z, color, r = 4) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(toMap(x), toMap(z), r, 0, Math.PI * 2);
      ctx.fill();
    };
    if (state.waypoint) blip(state.waypoint.x, state.waypoint.z, '#ffd83a', 6);
    for (const c of state.police || []) blip(c.x, c.z, '#ff4444', 3.5);
    for (const c of state.traffic || []) blip(c.x, c.z, '#9aa0a8', 2.5);
    // Player arrow.
    const px = toMap(state.player.x), pz = toMap(state.player.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(state.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
