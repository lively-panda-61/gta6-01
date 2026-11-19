// Port Solano — synthesized sound, no audio files.
// Everything is WebAudio oscillators and filtered noise, built at runtime,
// so the game ships no sound assets and makes no network request.
// The AudioContext is created only after the first user gesture (the
// start button), which is also what browsers require.
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.musicTimer = null;
    this.muted = false;
    this.sirenOn = false;
    this._sirenOsc = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    this.startMusic();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.35;
  }

  _noiseBuffer(seconds = 1) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _tone({ freq = 440, type = 'sine', dur = 0.2, vol = 0.3, slideTo = null, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  _noise({ dur = 0.2, vol = 0.3, freq = 1000, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur + 0.1);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  shoot() { this._noise({ dur: 0.12, vol: 0.5, freq: 3200 }); this._tone({ freq: 180, type: 'square', dur: 0.08, vol: 0.18 }); }
  hit() { this._tone({ freq: 1200, type: 'square', dur: 0.05, vol: 0.15 }); }
  pickup() { this._tone({ freq: 660, dur: 0.1, vol: 0.25 }); this._tone({ freq: 990, dur: 0.16, vol: 0.25, delay: 0.09 }); }
  cash() { this._tone({ freq: 880, dur: 0.08, vol: 0.2 }); this._tone({ freq: 1174, dur: 0.08, vol: 0.2, delay: 0.07 }); this._tone({ freq: 1568, dur: 0.18, vol: 0.22, delay: 0.14 }); }
  crash() { this._noise({ dur: 0.3, vol: 0.5, freq: 700 }); }
  engineStart() { this._tone({ freq: 90, type: 'sawtooth', dur: 0.5, vol: 0.2, slideTo: 160 }); }
  door() { this._noise({ dur: 0.08, vol: 0.2, freq: 900 }); }
  click() { this._tone({ freq: 1400, dur: 0.04, vol: 0.12 }); }
  missionStart() { this._tone({ freq: 523, dur: 0.12, vol: 0.22 }); this._tone({ freq: 784, dur: 0.2, vol: 0.22, delay: 0.1 }); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => this._tone({ freq: f, dur: 0.16, vol: 0.22, delay: i * 0.09 })); }
  wantedUp() { this._tone({ freq: 220, type: 'sawtooth', dur: 0.3, vol: 0.2, slideTo: 110 }); }

  setEngine(speed01) {
    if (!this.ctx) return;
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    }
    const target = speed01 > 0.02 ? 0.05 + speed01 * 0.06 : 0;
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(70 + speed01 * 160, this.ctx.currentTime, 0.1);
  }

  setSiren(on) {
    if (!this.ctx || on === this.sirenOn) return;
    this.sirenOn = on;
    if (on) {
      this._sirenOsc = this.ctx.createOscillator();
      this._sirenOsc.type = 'triangle';
      const gain = this.ctx.createGain();
      gain.gain.value = 0.045;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.8;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 320;
      lfo.connect(lfoGain).connect(this._sirenOsc.frequency);
      this._sirenOsc.frequency.value = 950;
      this._sirenOsc.connect(gain).connect(this.master);
      this._sirenOsc.start();
      lfo.start();
      this._sirenLfo = lfo;
    } else if (this._sirenOsc) {
      try { this._sirenOsc.stop(); this._sirenLfo.stop(); } catch { /* already stopped */ }
      this._sirenOsc = null;
    }
  }

  // A lazy bassline: root notes drifting over a minor groove, quiet enough
  // to sit under the game. Scheduled a bar at a time.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const roots = [55, 55, 65.41, 49, 55, 55, 73.42, 61.74];
    let bar = 0;
    const scheduleBar = () => {
      if (!this.ctx) return;
      const root = roots[bar % roots.length];
      bar += 1;
      for (let beat = 0; beat < 4; beat += 1) {
        const delay = beat * 0.42;
        this._tone({ freq: root, type: 'triangle', dur: 0.4, vol: 0.07, delay });
        if (beat % 2 === 0) this._tone({ freq: root * 1.5, type: 'sine', dur: 0.2, vol: 0.05, delay: delay + 0.21 });
      }
    };
    scheduleBar();
    this.musicTimer = window.setInterval(scheduleBar, 1680);
  }
}
