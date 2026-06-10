// ============================================================
//  AUDIO  –  Pure Web Audio API (no external files needed)
// ============================================================

class AudioManager {
  constructor() {
    this.ctx     = null;
    this.master  = null;
    this.droneNode = null;
    this.heartbeat = null;
    this.heartbeatActive = false;
    this.jumpScarePlaying = false;
    this.muted = false;
    this._init();
  }

  _init() {
    try {
      this.ctx    = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
      this._startAmbient();
    } catch(e) { console.warn('Audio unavailable', e); }
  }

  _resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ─── Ambient horror drone ─────────────────────────────────
  _startAmbient() {
    if (!this.ctx) return;
    const freqs   = [40, 42, 55, 57];
    for (const f of freqs) {
      const osc = this.ctx.createOscillator();
      const g   = this.ctx.createGain();
      osc.type  = 'sawtooth';
      osc.frequency.value = f;
      g.gain.value = 0.04;
      osc.connect(g); g.connect(this.master);
      osc.start();

      // slow LFO wobble
      const lfo = this.ctx.createOscillator();
      const lg  = this.ctx.createGain();
      lfo.frequency.value = 0.05 + Math.random() * 0.1;
      lg.gain.value = 3;
      lfo.connect(lg); lg.connect(osc.frequency);
      lfo.start();
    }
  }

  // ─── Heartbeat (proximity) ────────────────────────────────
  setHeartbeat(on) {
    if (on === this.heartbeatActive) return;
    this.heartbeatActive = on;
    if (!this.ctx) return;
    if (on) {
      this._hbInterval = setInterval(() => this._beatOnce(), 600);
    } else {
      clearInterval(this._hbInterval);
    }
  }

  _beatOnce() {
    if (!this.ctx || this.muted) return;
    const t   = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.frequency.value = 60;
    osc.type = 'sine';
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.2);
  }

  // ─── Footstep ────────────────────────────────────────────
  playStep(sprinting) {
    if (!this.ctx || this.muted) return;
    this._resume();
    const t   = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.05, this.ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
    const src = this.ctx.createBufferSource();
    const bpf = this.ctx.createBiquadFilter();
    const g   = this.ctx.createGain();
    bpf.type = 'bandpass';
    bpf.frequency.value = sprinting ? 900 : 500;
    bpf.Q.value = 3;
    g.gain.setValueAtTime(sprinting ? 0.18 : 0.08, t);
    src.buffer = buf;
    src.connect(bpf); bpf.connect(g); g.connect(this.master);
    src.start(t);
  }

  // ─── Weapon swing ────────────────────────────────────────
  playSwing() {
    if (!this.ctx || this.muted) return;
    this._resume();
    const t   = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.15);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.25);
  }

  // ─── Hit on monster ──────────────────────────────────────
  playHit() {
    if (!this.ctx || this.muted) return;
    this._resume();
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const g   = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 120 + i * 30;
      g.gain.setValueAtTime(0.25, t + i * 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.03 + 0.1);
      osc.connect(g); g.connect(this.master);
      osc.start(t + i * 0.03); osc.stop(t + i * 0.03 + 0.15);
    }
  }

  // ─── Player scream ───────────────────────────────────────
  playScream() {
    if (!this.ctx || this.muted) return;
    this._resume();
    const t   = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.6);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.8);
  }

  // ─── Door open/close ─────────────────────────────────────
  playDoor() {
    if (!this.ctx || this.muted) return;
    this._resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.linearRampToValueAtTime(200, t + 0.3);
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.4);
  }

  // ─── Noise trap drop ─────────────────────────────────────
  playDrop() {
    if (!this.ctx || this.muted) return;
    this._resume();
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.1, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
    const src = this.ctx.createBufferSource();
    const g   = this.ctx.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    src.buffer = buf;
    src.connect(g); g.connect(this.master);
    src.start(t);
  }

  // ─── Stalker teleport ────────────────────────────────────
  playTeleport() {
    if (!this.ctx || this.muted) return;
    this._resume();
    const t = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const osc = this.ctx.createOscillator();
      const g   = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 200 + i * 100;
      g.gain.setValueAtTime(0.05, t + i * 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.04 + 0.08);
      osc.connect(g); g.connect(this.master);
      osc.start(t + i * 0.04); osc.stop(t + i * 0.04 + 0.1);
    }
  }

  // ─── Jumpscare STING ─────────────────────────────────────
  triggerJumpScare(monsterType) {
    if (!this.ctx || this.muted || this.jumpScarePlaying) return;
    this._resume();
    this.jumpScarePlaying = true;
    setTimeout(() => { this.jumpScarePlaying = false; }, 2500);

    const t = this.ctx.currentTime;
    // Low bass boom
    const bass = this.ctx.createOscillator();
    const bg   = this.ctx.createGain();
    bass.type = 'sawtooth';
    bass.frequency.setValueAtTime(80, t);
    bass.frequency.exponentialRampToValueAtTime(20, t + 0.5);
    bg.gain.setValueAtTime(0.8, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    bass.connect(bg); bg.connect(this.master);
    bass.start(t); bass.stop(t + 0.7);

    // High screech
    const screech = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    screech.type = 'sawtooth';
    screech.frequency.setValueAtTime(1200, t);
    screech.frequency.exponentialRampToValueAtTime(400, t + 0.4);
    sg.gain.setValueAtTime(0.6, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    screech.connect(sg); sg.connect(this.master);
    screech.start(t); screech.stop(t + 0.5);

    // Trigger visual jumpscare via global event
    window.dispatchEvent(new CustomEvent('jumpscare', {detail: {type: monsterType}}));
  }

  // ─── Item pickup jingle ──────────────────────────────────
  playPickup(type) {
    if (!this.ctx || this.muted) return;
    this._resume();
    const t = this.ctx.currentTime;
    const freqs = type === 'keycard' ? [523, 659, 784, 1047] : [392, 523];
    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g   = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.15, t + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.15);
      osc.connect(g); g.connect(this.master);
      osc.start(t + i * 0.08); osc.stop(t + i * 0.08 + 0.2);
    });
  }

  // ─── Craft sound ─────────────────────────────────────────
  playCraft() {
    if (!this.ctx || this.muted) return;
    this._resume();
    const t = this.ctx.currentTime;
    [200, 400, 600].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g   = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.2, t + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.12);
      osc.connect(g); g.connect(this.master);
      osc.start(t + i * 0.1); osc.stop(t + i * 0.1 + 0.15);
    });
  }

  // ─── Win / escape fanfare ────────────────────────────────
  playEscape() {
    if (!this.ctx) return;
    this._resume();
    const t = this.ctx.currentTime;
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g   = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.3, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.25);
      osc.connect(g); g.connect(this.master);
      osc.start(t + i * 0.12); osc.stop(t + i * 0.12 + 0.3);
    });
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.7;
    return this.muted;
  }
}
