// ============================================================
//  UI  –  HUD, Menus, Endings
// ============================================================

class UI {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.messageQueue = [];
    this.messageTimer = 0;
    this.currentMsg   = null;
    this.showControls = true;
    this.controlTimer = 400;
    this.notification = null;
    this.notifTimer = 0;
  }

  get vw() { return this.canvas.width; }
  get vh() { return this.canvas.height; }

  // ─── HUD ─────────────────────────────────────────────────
  drawHUD(player, monsters) {
    const ctx = this.ctx;
    const margin = 14;

    // ── Keycard progress ──────────────────────────────────
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(margin, margin, 160, 38, 6);
    ctx.fill();

    ctx.fillStyle = '#aac8ff';
    ctx.font      = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('KEY CARDS', margin + 8, margin + 14);

    for (let i = 0; i < CFG.KEYCARD_PIECES; i++) {
      const collected = i < player.keycardCount;
      ctx.fillStyle = collected ? '#00ff88' : '#334455';
      ctx.beginPath();
      ctx.roundRect(margin + 8 + i * 34, margin + 18, 28, 14, 3);
      ctx.fill();
      if (collected) {
        ctx.fillStyle = '#003322';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('✓', margin + 8 + i * 34 + 14, margin + 28);
      }
    }

    // ── Inventory bar ─────────────────────────────────────
    const invY = margin + 48;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(margin, invY, 200, 36, 6);
    ctx.fill();

    ctx.fillStyle = '#aaa';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';

    let invItems = [];
    if (player.hasWeapon)  invItems.push('⚒ CLUB');
    else if (player.hasSlat) invItems.push('🪵 SLAT');
    if (player.nailCount)  invItems.push(`📌×${player.nailCount}`);
    if (player.medicines)  invItems.push(`💊×${player.medicines}`);
    if (player.noiseTraps) invItems.push(`🔊×${player.noiseTraps}`);
    if (!invItems.length)  invItems.push('(empty)');

    ctx.fillStyle = '#cccccc';
    ctx.fillText(invItems.join('  '), margin + 8, invY + 22);

    // ── Proximity warning ────────────────────────────────
    const nearDist = CFG.HEARTBEAT_DIST * CFG.TILE;

    ctx.restore();

    // ── Controls hint ────────────────────────────────────
    if (this.showControls && this.controlTimer > 0) {
      this.controlTimer--;
      const alpha = Math.min(1, this.controlTimer / 60);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(this.vw / 2 - 180, this.vh - 100, 360, 80);
      ctx.fillStyle = '#888';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      const lines = [
        'WASD / Arrows = Move  |  Shift = Sprint',
        'E = Enter/Search Storage  |  F = Attack',
        'H = Heal  |  C = Craft weapon  |  T = Drop noise trap',
        'M = Mute sound'
      ];
      lines.forEach((l, i) => ctx.fillText(l, this.vw / 2, this.vh - 85 + i * 16));
      ctx.restore();
    }

    // ── In-storage prompt ────────────────────────────────
    if (player.inStorage && player.currentStorage && player.currentStorage.items.length > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,80,40,0.8)';
      ctx.beginPath();
      ctx.roundRect(this.vw / 2 - 120, this.vh - 60, 240, 30, 6);
      ctx.fill();
      ctx.fillStyle = '#00ff88';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[E] Search storage for items', this.vw / 2, this.vh - 40);
      ctx.restore();
    }

    // ── Craft prompt ────────────────────────────────────
    if (player.hasSlat && player.nailCount >= 2 && !player.hasWeapon) {
      ctx.save();
      ctx.fillStyle = 'rgba(80,60,0,0.8)';
      ctx.beginPath();
      ctx.roundRect(this.vw / 2 - 120, this.vh - 100, 240, 30, 6);
      ctx.fill();
      ctx.fillStyle = '#ffcc00';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[C] Craft Spiked Club!', this.vw / 2, this.vh - 80);
      ctx.restore();
    }

    // ── Exit prompt ────────────────────────────────────
    this._drawNotification();

    // ── Safe zone indicator ─────────────────────────────
    if (player.inStorage) {
      const pulse = 0.4 + 0.2 * Math.sin(Date.now() / 400);
      ctx.save();
      ctx.strokeStyle = `rgba(0,180,80,${pulse})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(3, 3, this.vw - 6, this.vh - 6);
      ctx.fillStyle = `rgba(0,100,40,${pulse * 0.3})`;
      ctx.fillRect(3, 3, this.vw - 6, this.vh - 6);
      ctx.fillStyle = `rgba(0,220,100,${pulse})`;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('◉ SAFE ZONE', this.vw / 2, 22);
      ctx.restore();
    }

    // Mute indicator
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.roundRect(this.vw - 50, margin, 36, 20, 4);
    ctx.fill();
    ctx.fillStyle = '#666';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[M]🔇', this.vw - 32, margin + 14);
    ctx.restore();
  }

  notify(text, color = '#ffcc00', duration = 150) {
    this.notification = { text, color };
    this.notifTimer = duration;
  }

  _drawNotification() {
    if (!this.notification || this.notifTimer <= 0) return;
    this.notifTimer--;
    const alpha = Math.min(1, this.notifTimer / 30);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.roundRect(this.vw / 2 - 160, 80, 320, 34, 6);
    ctx.fill();
    ctx.fillStyle = this.notification.color;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.notification.text, this.vw / 2, 103);
    ctx.restore();
    if (this.notifTimer <= 0) this.notification = null;
  }

  // ─── Heartbeat / proximity overlay ───────────────────────
  drawProximityEffect(alpha) {
    const ctx = this.ctx;
    const vig = ctx.createRadialGradient(this.vw/2, this.vh/2, 0, this.vw/2, this.vh/2, Math.max(this.vw, this.vh));
    vig.addColorStop(0,   'rgba(0,0,0,0)');
    vig.addColorStop(0.7, `rgba(100,0,0,${alpha * 0.2})`);
    vig.addColorStop(1,   `rgba(180,0,0,${alpha * 0.5})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.vw, this.vh);
  }

  // ─── Main menu ───────────────────────────────────────────
  drawMainMenu(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.vw, this.vh);

    // Title
    const t = Date.now() / 1000;
    ctx.save();
    ctx.translate(this.vw / 2, this.vh / 2 - 80);
    ctx.rotate(Math.sin(t * 0.5) * 0.01);

    const flicker = 0.85 + 0.15 * Math.sin(t * 12 + Math.random() * 0.5);
    ctx.fillStyle = `rgba(200,0,0,${flicker})`;
    ctx.font = 'bold 52px monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 30;
    ctx.fillText('STORAGE', 0, 0);
    ctx.fillText('NIGHTMARE', 0, 58);
    ctx.restore();

    ctx.fillStyle = '#555';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 0;
    ctx.fillText('Escape the storage facility before they find you.', this.vw / 2, this.vh / 2 + 20);
    ctx.fillText('Collect 4 keycard pieces. Find the exit.', this.vw / 2, this.vh / 2 + 40);

    ctx.fillStyle = `rgba(180,180,100,${0.6 + 0.4 * Math.sin(t * 2)})`;
    ctx.font = 'bold 16px monospace';
    ctx.fillText('[ CLICK OR PRESS ANY KEY TO START ]', this.vw / 2, this.vh / 2 + 100);

    ctx.fillStyle = '#333';
    ctx.font = '10px monospace';
    ctx.fillText('WARNING: Contains jump scares and disturbing imagery', this.vw / 2, this.vh - 20);

    // Ambient monsters in background
    this._drawMenuMonsters(ctx, t);
  }

  _drawMenuMonsters(ctx, t) {
    const positions = [
      {x: 80,  y: 100, type: M.BLIND},
      {x: this.vw - 80, y: this.vh - 100, type: M.DEAF},
      {x: this.vw - 100, y: 120, type: M.STALKER},
    ];
    for (const p of positions) {
      ctx.save();
      ctx.globalAlpha = 0.15 + 0.05 * Math.sin(t + p.x);
      ctx.translate(p.x, p.y);
      ctx.scale(1.5, 1.5);
      const fake = {x:0, y:0, angle: 0, type: p.type, radius: 20, stunTimer: 0};
      // Inline draw (renderer not available here, just shadow)
      ctx.fillStyle = '#440000';
      ctx.beginPath();
      ctx.ellipse(0, 0, 20, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ─── End screens ─────────────────────────────────────────
  drawEscapeEnd(ctx, playerKilledMonster) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, this.vw, this.vh);

    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 20;
    ctx.fillText(playerKilledMonster ? '★ MONSTER SLAYER ★' : '◆ ESCAPED ◆', this.vw/2, this.vh/2 - 60);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#aaa';
    ctx.font = '16px monospace';
    if (playerKilledMonster) {
      ctx.fillText('You fought back and escaped the nightmare.', this.vw/2, this.vh/2);
      ctx.fillText('They will never forget your name.', this.vw/2, this.vh/2 + 30);
    } else {
      ctx.fillText('You slipped into the night without a sound.', this.vw/2, this.vh/2);
      ctx.fillText('The darkness didn\'t follow.', this.vw/2, this.vh/2 + 30);
    }

    ctx.fillStyle = '#ff6600';
    ctx.font = '20px monospace';
    ctx.fillText('🏆 COSMETIC UNLOCKED: Storage Survivor Badge', this.vw/2, this.vh/2 + 80);

    ctx.fillStyle = '#555';
    ctx.font = '13px monospace';
    ctx.fillText('[ Press R to play again ]', this.vw/2, this.vh/2 + 140);
  }

  drawDeathEnd(ctx, monsterType) {
    const t = Date.now() / 1000;
    ctx.fillStyle = `rgba(${Math.floor(30 + 20 * Math.sin(t))},0,0,0.95)`;
    ctx.fillRect(0, 0, this.vw, this.vh);

    ctx.fillStyle = `rgba(180,0,0,${0.7 + 0.3 * Math.sin(t * 3)})`;
    ctx.font = 'bold 50px monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 40;
    ctx.fillText('YOU DIED', this.vw/2, this.vh/2 - 40);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#555';
    ctx.font = '14px monospace';
    const msgs = {
      [M.BLIND]: 'It heard your heartbeat in the dark.',
      [M.DEAF]:  'It saw you. You couldn\'t hide.',
      [M.STALKER]: 'It was already behind you.',
    };
    ctx.fillText(msgs[monsterType] || 'The darkness consumed you.', this.vw/2, this.vh/2 + 20);

    ctx.fillStyle = `rgba(100,0,0,${0.5 + 0.3 * Math.sin(t * 2)})`;
    ctx.font = '13px monospace';
    ctx.fillText('[ Press R to try again ]', this.vw/2, this.vh/2 + 80);
  }
}
