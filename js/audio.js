export class Audio3D {
  constructor() {
    this.ctx    = null;
    this.master = null;
    this.muted  = false;
    this._hbInterval = null;
    this._init();
  }

  _init() {
    try {
      this.ctx    = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
      this._startDrone();
    } catch(e) { console.warn('Audio unavailable'); }
  }

  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume(); }

  _startDrone() {
    if (!this.ctx) return;
    for (const f of [40, 42.5, 55, 57.5]) {
      const osc = this.ctx.createOscillator();
      const g   = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      g.gain.value = 0.035;
      osc.connect(g); g.connect(this.master);
      const lfo = this.ctx.createOscillator();
      const lg  = this.ctx.createGain();
      lfo.frequency.value = 0.05 + Math.random() * 0.08;
      lg.gain.value = 2.5;
      lfo.connect(lg); lg.connect(osc.frequency);
      lfo.start(); osc.start();
    }
  }

  setHeartbeat(on) {
    if (on === !!this._hbInterval) return;
    if (on) { this._hbInterval = setInterval(() => this._beat(), 650); }
    else    { clearInterval(this._hbInterval); this._hbInterval = null; }
  }

  _beat() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.value = 55; o.type = 'sine';
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.2);
  }

  playStep(sprint) {
    if (!this.ctx || this.muted) return;
    this.resume();
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.04), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
    const src = this.ctx.createBufferSource();
    const bpf = this.ctx.createBiquadFilter();
    const g   = this.ctx.createGain();
    bpf.type = 'bandpass'; bpf.frequency.value = sprint ? 900 : 500; bpf.Q.value = 3;
    g.gain.value = sprint ? 0.18 : 0.09;
    src.buffer = buf;
    src.connect(bpf); bpf.connect(g); g.connect(this.master);
    src.start(t);
  }

  playSwing() {
    if (!this.ctx || this.muted) return; this.resume();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.15);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.25);
  }

  playHit() {
    if (!this.ctx || this.muted) return; this.resume();
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'square'; o.frequency.value = 120 + i * 30;
      g.gain.setValueAtTime(0.22, t + i*0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + i*0.03 + 0.1);
      o.connect(g); g.connect(this.master); o.start(t+i*0.03); o.stop(t+i*0.03+0.15);
    }
  }

  playScream() {
    if (!this.ctx || this.muted) return; this.resume();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(600, t);
    o.frequency.exponentialRampToValueAtTime(200, t + 0.6);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.8);
  }

  playDoor() {
    if (!this.ctx || this.muted) return; this.resume();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(80, t);
    o.frequency.linearRampToValueAtTime(200, t + 0.25);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.4);
  }

  playPickup(type) {
    if (!this.ctx || this.muted) return; this.resume();
    const t = this.ctx.currentTime;
    const freqs = type === 'keycard' ? [523, 659, 784, 1047] : [392, 523];
    freqs.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.14, t+i*0.07);
      g.gain.exponentialRampToValueAtTime(0.001, t+i*0.07+0.12);
      o.connect(g); g.connect(this.master); o.start(t+i*0.07); o.stop(t+i*0.07+0.15);
    });
  }

  playCraft() {
    if (!this.ctx || this.muted) return; this.resume();
    const t = this.ctx.currentTime;
    [200,400,600].forEach((f,i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.18, t+i*0.09);
      g.gain.exponentialRampToValueAtTime(0.001, t+i*0.09+0.1);
      o.connect(g); g.connect(this.master); o.start(t+i*0.09); o.stop(t+i*0.09+0.12);
    });
  }

  playDrop() {
    if (!this.ctx || this.muted) return; this.resume();
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.08), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
    const src = this.ctx.createBufferSource();
    const g   = this.ctx.createGain();
    g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.buffer = buf; src.connect(g); g.connect(this.master); src.start(t);
  }

  playTeleport() {
    if (!this.ctx || this.muted) return; this.resume();
    const t = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = 200 + i * 100;
      g.gain.setValueAtTime(0.05, t+i*0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t+i*0.04+0.07);
      o.connect(g); g.connect(this.master); o.start(t+i*0.04); o.stop(t+i*0.04+0.09);
    }
  }

  playJumpScare() {
    if (!this.ctx) return; this.resume();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(20, t + 0.5);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.7);

    const os = this.ctx.createOscillator();
    const gs = this.ctx.createGain();
    os.type = 'sawtooth';
    os.frequency.setValueAtTime(1200, t);
    os.frequency.exponentialRampToValueAtTime(400, t + 0.4);
    gs.gain.setValueAtTime(0.6, t);
    gs.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    os.connect(gs); gs.connect(this.master); os.start(t); os.stop(t + 0.5);
  }

  playEscape() {
    if (!this.ctx) return; this.resume();
    const t = this.ctx.currentTime;
    [523,659,784,1047,1319].forEach((f,i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.28, t+i*0.11);
      g.gain.exponentialRampToValueAtTime(0.001, t+i*0.11+0.22);
      o.connect(g); g.connect(this.master); o.start(t+i*0.11); o.stop(t+i*0.11+0.25);
    });
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.7;
    return this.muted;
  }
}
