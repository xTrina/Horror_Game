// ============================================================
//  GAME  –  Main loop, state, input
// ============================================================

const STATE = { MENU: 'menu', PLAY: 'play', DEAD: 'dead', ESCAPED: 'escaped' };

class Game {
  constructor() {
    this.canvas   = document.getElementById('gameCanvas');
    this.state    = STATE.MENU;
    this.audio    = new AudioManager();
    this.renderer = new Renderer(this.canvas);
    this.ui       = new UI(this.canvas);
    this.keys     = {};
    this.traps    = [];
    this.killedMonster = false;
    this.lastKillerType = null;
    this.proximityAlpha = 0;
    this._lastTime = 0;
    this._frameAcc = 0;
    this.seed      = Date.now();

    this._bindInput();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    requestAnimationFrame(ts => this._loop(ts));
  }

  _resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  _bindInput() {
    window.addEventListener('keydown', e => {
      this.keys[e.key] = true;

      if (this.state === STATE.MENU) {
        this._startGame();
        return;
      }
      if ((this.state === STATE.DEAD || this.state === STATE.ESCAPED) && e.key === 'r' || e.key === 'R') {
        this._startGame();
        return;
      }
      if (this.state !== STATE.PLAY) return;

      // Interact / search storage
      if (e.key === 'e' || e.key === 'E') {
        this._interactStorage();
      }
      // Craft
      if (e.key === 'c' || e.key === 'C') {
        if (this.player.tryCraft()) {
          this.audio.playCraft();
          this.player.noise = CFG.CRAFT_NOISE;
          this.ui.notify('⚒ Spiked Club crafted!', '#ffcc00');
        }
      }
      // Heal
      if (e.key === 'h' || e.key === 'H') {
        if (this.player.tryHeal()) {
          this.ui.notify('💊 Healed!', '#00ff88');
        }
      }
      // Attack
      if (e.key === 'f' || e.key === 'F' || e.key === ' ') {
        if (this.player.tryAttack(this.monsters, this.audio)) {
          const hit = this.monsters.some(m => Math.hypot(this.player.x - m.x, this.player.y - m.y) < CFG.TILE * 1.5);
          if (hit) this.renderer.triggerShake(12);
        }
      }
      // Place noise trap
      if (e.key === 't' || e.key === 'T') {
        const trap = this.player.placeNoiseTrap(this.map, this.audio);
        if (trap) this.traps.push(trap);
      }
      // Mute
      if (e.key === 'm' || e.key === 'M') {
        const muted = this.audio.toggleMute();
        this.ui.notify(muted ? '🔇 Sound OFF' : '🔊 Sound ON', '#aaa', 80);
      }
      // Check exit
      this._checkExit();
    });

    window.addEventListener('keyup', e => { this.keys[e.key] = false; });

    // Click to start from menu
    this.canvas.addEventListener('click', () => {
      if (this.state === STATE.MENU) this._startGame();
    });
  }

  _startGame() {
    this.seed = Date.now();
    this.map  = new GameMap(this.seed);
    const startPos = this.map.getRandomCorridorPos();
    this.player    = new Player(startPos.x, startPos.y);

    // RNG for monster AI
    const monsterRng = mulberry32(this.seed + 1);
    this.monsters    = spawnMonsters(this.map, startPos.x, startPos.y, monsterRng);

    this.traps          = [];
    this.killedMonster  = false;
    this.lastKillerType = null;
    this.state          = STATE.PLAY;
    this.audio._resume();
    this.ui.showControls = true;
    this.ui.controlTimer = 400;
  }

  _interactStorage() {
    const s = this.map.getNearbyStorage(this.player.x, this.player.y, 1.5);
    if (s && s.items.length > 0) {
      const before = this.player.keycardCount;
      this.player.collectItems(s);
      const after = this.player.keycardCount;
      if (after > before) {
        this.audio.playPickup('keycard');
        this.ui.notify(`🗝 Keycard piece collected! (${after}/${CFG.KEYCARD_PIECES})`, '#00ff88');
        if (after >= CFG.KEYCARD_PIECES) {
          this.ui.notify('🗝🗝🗝🗝 ALL KEYCARD PIECES! Find the EXIT!', '#ffff00', 300);
        }
      } else {
        this.audio.playPickup('item');
        this.ui.notify('📦 Items found!', '#aaccff');
      }
    }
  }

  _checkExit() {
    if (!this.player.canEscape) return;
    const ex = this.map.exitPos;
    if (!ex) return;
    const dist = Math.hypot(
      this.player.x - (ex.x + 0.5) * CFG.TILE,
      this.player.y - (ex.y + 0.5) * CFG.TILE
    );
    if (dist < CFG.TILE * 1.5) {
      this.player.escaped = true;
      this.state = STATE.ESCAPED;
      this.audio.playEscape();
    }
  }

  // ─── Main loop ───────────────────────────────────────────
  _loop(ts) {
    requestAnimationFrame(t => this._loop(t));
    const dt = Math.min(ts - this._lastTime, 50);
    this._lastTime = ts;
    this._frameAcc += dt;

    // Fixed 60 fps tick
    const tickMs = 1000 / CFG.FPS_TARGET;
    while (this._frameAcc >= tickMs) {
      this._frameAcc -= tickMs;
      if (this.state === STATE.PLAY) this._tick();
    }

    this._draw();
  }

  _tick() {
    const p = this.player;
    const m = this.monsters;

    p.update(this.keys, this.map, m, this.audio);

    if (p.dead) {
      this.state = STATE.DEAD;
      this.lastKillerType = this._closestMonsterType(p);
      return;
    }
    if (p.escaped) {
      this.state = STATE.ESCAPED;
      return;
    }

    // Auto-check exit when on exit tile
    this._checkExitAuto(p);

    // Update monsters
    for (const mon of m) {
      mon.update(p, this.map, this.audio, this.traps);
    }

    // Check if monster is stunned to death (5 hits = optional kill)
    for (let i = m.length - 1; i >= 0; i--) {
      if (m[i].stunTimer > 1000) {   // won't happen normally — just a placeholder
        m.splice(i, 1);
        this.killedMonster = true;
        this.ui.notify('💀 Monster destroyed!', '#ff4400', 200);
      }
    }

    // Decay noise traps
    for (let i = this.traps.length - 1; i >= 0; i--) {
      this.traps[i].life--;
      if (this.traps[i].life <= 0) this.traps.splice(i, 1);
    }

    // Proximity effect
    const closestDist = m.reduce((min, mon) =>
      Math.min(min, Math.hypot(p.x - mon.x, p.y - mon.y)), Infinity);
    const targetAlpha = closestDist < CFG.HEARTBEAT_DIST * CFG.TILE
      ? 1 - (closestDist / (CFG.HEARTBEAT_DIST * CFG.TILE))
      : 0;
    this.proximityAlpha += (targetAlpha - this.proximityAlpha) * 0.05;
    this.audio.setHeartbeat(closestDist < CFG.HEARTBEAT_DIST * CFG.TILE && !p.inStorage);

    // Update flickering
    this.renderer.updateFlicker(this.map);
  }

  _checkExitAuto(p) {
    if (!p.canEscape || !this.map.exitPos) return;
    const ex = this.map.exitPos;
    const dist = Math.hypot(
      p.x - (ex.x + 0.5) * CFG.TILE,
      p.y - (ex.y + 0.5) * CFG.TILE
    );
    if (dist < CFG.TILE * 0.9) {
      p.escaped = true;
      this.state = STATE.ESCAPED;
      this.audio.playEscape();
    }
  }

  _closestMonsterType(p) {
    let best = null, bestDist = Infinity;
    for (const m of this.monsters) {
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < bestDist) { bestDist = d; best = m.type; }
    }
    return best;
  }

  // ─── Drawing ─────────────────────────────────────────────
  _draw() {
    const ctx = this.ctx2d || (this.ctx2d = this.canvas.getContext('2d'));

    if (this.state === STATE.MENU) {
      this.ui.drawMainMenu(ctx);
      return;
    }

    if (this.state === STATE.DEAD) {
      this._drawGameFrame();
      this.ui.drawDeathEnd(ctx, this.lastKillerType);
      return;
    }

    if (this.state === STATE.ESCAPED) {
      this._drawGameFrame();
      this.ui.drawEscapeEnd(ctx, this.killedMonster);
      return;
    }

    // Normal gameplay
    this._drawGameFrame();
    this.ui.drawHUD(this.player, this.monsters);
    if (this.proximityAlpha > 0.05) {
      this.ui.drawProximityEffect(this.proximityAlpha);
    }
  }

  _drawGameFrame() {
    this.renderer.updateCamera(this.player);
    this.renderer.draw(this.map, this.player, this.monsters, this.traps);
    this.renderer.drawVignette(this.ctx2d || this.canvas.getContext('2d'));
  }
}

// ─── Boot ────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  window._game = new Game();
});
