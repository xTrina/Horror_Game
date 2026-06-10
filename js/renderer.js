// ============================================================
//  RENDERER  –  Canvas 2D with dynamic lighting & monster art
// ============================================================

class Renderer {
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.camX    = 0;
    this.camY    = 0;
    this.flickerMap = {};  // tileKey → brightness
    this.flickerTimer = 0;
    this.jumpScareAlpha   = 0;
    this.jumpScareMonster = null;
    this.jumpScareTimer   = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.shakeTimer = 0;
    this._buildPalette();

    window.addEventListener('jumpscare', e => this._onJumpScare(e.detail.type));
  }

  _buildPalette() {
    this.pal = {
      wall:        '#1a1008',
      floor:       '#1c1c22',
      storage:     '#141820',
      storageDoor: '#232840',
      exit:        '#003300',
      doorOpen:    '#1a2a1a',
    };
  }

  resize(w, h) {
    this.canvas.width  = w;
    this.canvas.height = h;
  }

  get vw() { return this.canvas.width; }
  get vh() { return this.canvas.height; }

  updateCamera(player) {
    this.camX = player.x - this.vw / 2;
    this.camY = player.y - this.vh / 2;
  }

  updateFlicker(map) {
    this.flickerTimer++;
    if (this.flickerTimer % 3 !== 0) return;

    // Each corridor tile has a "light" that can flicker
    if (this.flickerTimer % 60 === 0) {
      // Randomly toggle some lights
      const c = map.corridors[Math.floor(Math.random() * map.corridors.length)];
      const key = `${c.x},${c.y}`;
      this.flickerMap[key] = Math.random() < 0.3 ? 0.2 + Math.random() * 0.4 : 1.0;
    }
    // Slowly restore
    for (const k in this.flickerMap) {
      this.flickerMap[k] = Math.min(1.0, this.flickerMap[k] + 0.02);
      if (this.flickerMap[k] >= 0.99) delete this.flickerMap[k];
    }
  }

  updateScreenShake() {
    if (this.shakeTimer > 0) {
      this.shakeTimer--;
      const s = this.shakeTimer * 0.3;
      this.shakeX = (Math.random() - 0.5) * s;
      this.shakeY = (Math.random() - 0.5) * s;
    } else {
      this.shakeX = this.shakeY = 0;
    }
  }

  triggerShake(intensity = 20) { this.shakeTimer = intensity; }

  _onJumpScare(type) {
    this.jumpScareAlpha   = 1.0;
    this.jumpScareMonster = type;
    this.jumpScareTimer   = 90;
    this.triggerShake(30);
  }

  // ─── Main draw ───────────────────────────────────────────
  draw(map, player, monsters, traps) {
    const ctx = this.ctx;
    const T   = CFG.TILE;

    this.updateScreenShake();

    ctx.save();
    ctx.translate(Math.round(this.shakeX), Math.round(this.shakeY));

    // Black background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.vw, this.vh);

    ctx.save();
    ctx.translate(-this.camX, -this.camY);

    // ── Draw tiles ──────────────────────────────────────────
    const startCol = Math.max(0, Math.floor(this.camX / T));
    const endCol   = Math.min(map.cols - 1, Math.ceil((this.camX + this.vw) / T));
    const startRow = Math.max(0, Math.floor(this.camY / T));
    const endRow   = Math.min(map.rows - 1, Math.ceil((this.camY + this.vh) / T));

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const tile = map.tiles[r][c];
        const px = c * T, py = r * T;

        switch (tile) {
          case 0: // WALL
            this._drawWall(ctx, px, py, T); break;
          case 1: // FLOOR/CORRIDOR
            this._drawFloor(ctx, px, py, T, c, r); break;
          case 2: // STORAGE
            this._drawStorage(ctx, px, py, T); break;
        }
      }
    }

    // Exit marker
    if (map.exitPos) {
      const ex = map.exitPos.x * T + T/2;
      const ey = map.exitPos.y * T + T/2;
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 300);
      ctx.beginPath();
      ctx.arc(ex, ey, T * 0.4 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,200,50,${0.7 * pulse})`;
      ctx.fill();
      ctx.strokeStyle = '#00ff44';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#00ff44';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('EXIT', ex, ey + 4);
    }

    // Storage door indicators
    for (const s of map.storages) {
      if (s.items.length > 0) {
        const ix = (s.x + 0.5) * T;
        const iy = (s.side === 'top' ? s.y + 1 : s.y) * T + T / 2;
        const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 500 + s.x);
        ctx.fillStyle = `rgba(255,220,50,${pulse * 0.8})`;
        ctx.beginPath();
        ctx.arc(ix, iy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Noise traps
    for (const trap of traps) {
      if (!trap.triggered) {
        ctx.fillStyle = '#ff6600';
        ctx.beginPath();
        ctx.arc(trap.x, trap.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Monsters
    for (const m of monsters) {
      if (m.visible) this._drawMonster(ctx, m);
    }

    // Player
    this._drawPlayer(ctx, player);

    ctx.restore();  // camera transform

    // ── Lighting overlay ────────────────────────────────────
    this._drawLighting(ctx, player, monsters);

    // ── Jump scare overlay ──────────────────────────────────
    if (this.jumpScareTimer > 0) {
      this._drawJumpScare(ctx);
    }

    ctx.restore();  // shake transform
  }

  // ─── Tile drawing ────────────────────────────────────────
  _drawWall(ctx, x, y, T) {
    ctx.fillStyle = '#0e0a06';
    ctx.fillRect(x, y, T, T);
    // Brick-ish texture
    ctx.strokeStyle = '#1a1208';
    ctx.lineWidth = 1;
    if (y % (T * 2) === 0) {
      ctx.beginPath();
      ctx.moveTo(x, y + T/2);
      ctx.lineTo(x + T, y + T/2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + T/2, y);
      ctx.lineTo(x + T/2, y + T/2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y + T/2);
      ctx.lineTo(x + T, y + T/2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + T/4, y + T/2);
      ctx.lineTo(x + T/4, y + T);
      ctx.stroke();
    }
  }

  _drawFloor(ctx, x, y, T, c, r) {
    const key = `${c},${r}`;
    const brightness = this.flickerMap[key] !== undefined ? this.flickerMap[key] : 1.0;
    const base = Math.floor(28 * brightness);
    ctx.fillStyle = `rgb(${base},${base},${Math.floor(base * 1.1)})`;
    ctx.fillRect(x, y, T, T);

    // Grid lines
    ctx.strokeStyle = `rgba(60,60,80,${0.4 * brightness})`;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, T, T);

    // Occasional ceiling light
    if ((c + r * 7) % 11 === 0) {
      const alpha = Math.max(0.1, brightness * 0.6);
      ctx.fillStyle = `rgba(200,200,160,${alpha})`;
      ctx.fillRect(x + T * 0.3, y + T * 0.05, T * 0.4, T * 0.1);
    }
  }

  _drawStorage(ctx, x, y, T) {
    ctx.fillStyle = '#0d1219';
    ctx.fillRect(x, y, T, T);
    ctx.strokeStyle = '#1e2840';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2, y + 2, T - 4, T - 4);
    // Metal grid texture
    ctx.strokeStyle = '#151c28';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x + (T / 3) * i, y);
      ctx.lineTo(x + (T / 3) * i, y + T);
      ctx.stroke();
    }
  }

  // ─── Player ──────────────────────────────────────────────
  _drawPlayer(ctx, player) {
    const x = player.x, y = player.y;

    // Body
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(player.angle);

    ctx.fillStyle = player.inStorage ? '#4a7a4a' : '#4a6a8a';
    ctx.beginPath();
    ctx.ellipse(0, 0, player.radius * 0.7, player.radius, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8ab4cc';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Direction indicator
    ctx.fillStyle = '#ddeeff';
    ctx.beginPath();
    ctx.arc(player.radius * 0.5, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    // Weapon if carrying
    if (player.hasWeapon) {
      ctx.fillStyle = '#8b6914';
      ctx.fillRect(player.radius * 0.6, -2, player.radius * 0.8, 4);
      ctx.fillStyle = '#aaa';
      ctx.fillRect(player.radius * 1.1, -2, 4, 4);
    }

    ctx.restore();

    // HP indicator
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < player.hp ? '#cc2222' : '#333';
      ctx.beginPath();
      ctx.arc(x - 16 + i * 16, y - player.radius - 8, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ─── Monster visuals ────────────────────────────────────
  _drawMonster(ctx, m) {
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.angle);

    switch (m.type) {
      case M.BLIND:   this._drawBlind(ctx, m); break;
      case M.DEAF:    this._drawDeaf(ctx, m);  break;
      case M.STALKER: this._drawStalker(ctx, m); break;
    }
    ctx.restore();
  }

  _drawBlind(ctx, m) {
    const r = m.radius;
    const t = Date.now() / 1000;

    // Pale, corpse-like body
    ctx.fillStyle = '#c8b89a';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.7, r, 0, 0, Math.PI * 2);
    ctx.fill();

    // Long dangling arms
    ctx.strokeStyle = '#b09070';
    ctx.lineWidth = 4;
    [-1, 1].forEach(side => {
      ctx.beginPath();
      ctx.moveTo(side * r * 0.6, -r * 0.3);
      ctx.bezierCurveTo(
        side * r * 1.5, r * 0.2,
        side * r * 1.8, r * 0.8 + Math.sin(t * 2) * 4,
        side * r * 1.2, r * 1.4 + Math.sin(t * 2) * 4
      );
      ctx.stroke();
    });

    // Stitched-shut eyes (X marks)
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    [-1, 1].forEach(side => {
      const ex = side * r * 0.28, ey = -r * 0.3;
      ctx.beginPath();
      ctx.moveTo(ex - 5, ey - 4); ctx.lineTo(ex + 5, ey + 4);
      ctx.moveTo(ex + 5, ey - 4); ctx.lineTo(ex - 5, ey + 4);
      ctx.stroke();
    });

    // Gaping mouth – open/close
    const mouthOpen = 0.5 + 0.5 * Math.abs(Math.sin(t * 1.5));
    ctx.fillStyle = '#1a0a0a';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.2, r * 0.35, r * 0.2 * mouthOpen, 0, 0, Math.PI * 2);
    ctx.fill();

    // Teeth
    ctx.fillStyle = '#f0e8d0';
    for (let i = -2; i <= 2; i++) {
      ctx.fillRect(i * 5 - 2, r * 0.1, 4, r * 0.12 * mouthOpen);
    }

    // Stun flash
    if (m.stunTimer > 0 && m.stunTimer % 4 < 2) {
      ctx.fillStyle = 'rgba(255,100,100,0.5)';
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawDeaf(ctx, m) {
    const r = m.radius;
    const t = Date.now() / 1000;

    // Dark, suited figure
    ctx.fillStyle = '#1a1a2a';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.75, r, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = '#2a2a3a';
    ctx.beginPath();
    ctx.arc(0, -r * 0.55, r * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Missing ears (holes)
    [-1, 1].forEach(side => {
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(side * r * 0.48, -r * 0.55, 5, 0, Math.PI * 2);
      ctx.fill();
      // Seeping black goop
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(side * r * 0.48 - 2, -r * 0.55, 4, 10);
    });

    // Glowing red eyes
    const eyeGlow = 0.7 + 0.3 * Math.sin(t * 3);
    [-1, 1].forEach(side => {
      const ex = side * r * 0.22, ey = -r * 0.62;
      ctx.fillStyle = `rgba(255,0,0,${eyeGlow})`;
      ctx.beginPath();
      ctx.arc(ex, ey, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,150,100,0.8)';
      ctx.beginPath();
      ctx.arc(ex, ey, 3, 0, Math.PI * 2);
      ctx.fill();
      // Glow halo
      const grd = ctx.createRadialGradient(ex, ey, 2, ex, ey, 14);
      grd.addColorStop(0, `rgba(255,0,0,${eyeGlow * 0.6})`);
      grd.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(ex, ey, 14, 0, Math.PI * 2);
      ctx.fill();
    });

    if (m.stunTimer > 0 && m.stunTimer % 4 < 2) {
      ctx.fillStyle = 'rgba(255,100,100,0.5)';
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawStalker(ctx, m) {
    const r = m.radius;
    const t = Date.now() / 1000;
    const glitch = Math.random() < 0.08;

    // Shadow / distortion body
    const alpha = 0.5 + 0.4 * Math.abs(Math.sin(t * 4)) + (glitch ? 0.5 : 0);
    ctx.globalAlpha = Math.min(1, alpha);

    ctx.fillStyle = '#1a002a';
    ctx.beginPath();
    ctx.ellipse(glitch ? (Math.random()-0.5)*6 : 0, 0, r * 0.7, r, 0, 0, Math.PI * 2);
    ctx.fill();

    // Multiple glitchy copies
    if (glitch) {
      ctx.fillStyle = 'rgba(100,0,180,0.4)';
      ctx.beginPath();
      ctx.ellipse((Math.random()-0.5)*20, (Math.random()-0.5)*10, r * 0.7, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // White cracked eyes
    const eyeBlink = Math.random() < 0.02 ? 0 : 1;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.fillStyle = '#ffffff';
    [-1, 1].forEach(side => {
      const ex = side * r * 0.25, ey = -r * 0.3;
      ctx.beginPath();
      ctx.ellipse(ex, ey * eyeBlink, 7, 5 * eyeBlink, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(ex, ey * eyeBlink, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Tendrils
    ctx.strokeStyle = `rgba(80,0,120,${alpha * 0.8})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + t;
      const len = r * (1.5 + 0.5 * Math.sin(t * 3 + i));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(
        Math.cos(angle + 0.5) * len * 0.5, Math.sin(angle + 0.5) * len * 0.5,
        Math.cos(angle - 0.5) * len * 0.8, Math.sin(angle - 0.5) * len * 0.8,
        Math.cos(angle) * len, Math.sin(angle) * len
      );
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  // ─── Lighting overlay (darkness + flashlight) ──────────────
  _drawLighting(ctx, player, monsters) {
    const offscreen = document.createElement('canvas');
    offscreen.width  = this.vw;
    offscreen.height = this.vh;
    const octx = offscreen.getContext('2d');

    // Fill with darkness
    octx.fillStyle = 'rgba(0,0,0,0.94)';
    octx.fillRect(0, 0, this.vw, this.vh);

    const px = player.x - this.camX;
    const py = player.y - this.camY;

    // ── Flashlight cone ────────────────────────────────────
    octx.globalCompositeOperation = 'destination-out';

    const flAngle = player.angle;
    const flRadius = CFG.FL_RADIUS;
    const halfAngle = CFG.FL_ANGLE;

    const grad = octx.createRadialGradient(px, py, 0, px, py, flRadius);
    grad.addColorStop(0,    'rgba(255,255,255,1)');
    grad.addColorStop(0.6,  'rgba(255,255,255,0.85)');
    grad.addColorStop(0.85, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1,    'rgba(255,255,255,0)');

    octx.fillStyle = grad;
    octx.beginPath();
    octx.moveTo(px, py);
    octx.arc(px, py, flRadius, flAngle - halfAngle, flAngle + halfAngle);
    octx.closePath();
    octx.fill();

    // Tiny ambient glow around player
    const aGrad = octx.createRadialGradient(px, py, 0, px, py, 40);
    aGrad.addColorStop(0, 'rgba(255,255,255,0.35)');
    aGrad.addColorStop(1, 'rgba(255,255,255,0)');
    octx.fillStyle = aGrad;
    octx.beginPath();
    octx.arc(px, py, 40, 0, Math.PI * 2);
    octx.fill();

    // Monster glowing eyes pierce darkness slightly
    for (const m of monsters) {
      if (!m.visible) continue;
      const mx = m.x - this.camX;
      const my = m.y - this.camY;
      const eyeGrad = octx.createRadialGradient(mx, my, 0, mx, my, 30);
      eyeGrad.addColorStop(0, 'rgba(255,50,50,0.4)');
      eyeGrad.addColorStop(1, 'rgba(255,50,50,0)');
      octx.fillStyle = eyeGrad;
      octx.beginPath();
      octx.arc(mx, my, 30, 0, Math.PI * 2);
      octx.fill();
    }

    // Storage safe zone gets a faint blue tint
    if (player.inStorage) {
      octx.globalCompositeOperation = 'destination-out';
      const safeGrad = octx.createRadialGradient(px, py, 0, px, py, 80);
      safeGrad.addColorStop(0, 'rgba(100,150,255,0.5)');
      safeGrad.addColorStop(1, 'rgba(0,0,0,0)');
      octx.fillStyle = safeGrad;
      octx.beginPath();
      octx.arc(px, py, 80, 0, Math.PI * 2);
      octx.fill();
    }

    ctx.drawImage(offscreen, 0, 0);
  }

  // ─── Jump scare flash ────────────────────────────────────
  _drawJumpScare(ctx) {
    this.jumpScareTimer--;
    if (this.jumpScareTimer <= 0) { this.jumpScareAlpha = 0; return; }

    const progress = this.jumpScareTimer / 90;
    const alpha = Math.min(1, progress * 2);

    // Red flash
    ctx.fillStyle = `rgba(180,0,0,${alpha * 0.6})`;
    ctx.fillRect(0, 0, this.vw, this.vh);

    // Monster face overlay (drawn large in screen center)
    if (this.jumpScareTimer > 30) {
      ctx.save();
      const cx = this.vw / 2, cy = this.vh / 2;
      const scale = 4 + (1 - progress) * 3;
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);

      const fakeMonster = {
        x: 0, y: 0, angle: 0,
        type: this.jumpScareMonster,
        radius: 22,
        stunTimer: 0
      };
      switch (this.jumpScareMonster) {
        case M.BLIND:   this._drawBlind(ctx, fakeMonster); break;
        case M.DEAF:    this._drawDeaf(ctx, fakeMonster);  break;
        case M.STALKER: this._drawStalker(ctx, fakeMonster); break;
      }
      ctx.restore();
    }

    // Vignette
    const vig = ctx.createRadialGradient(this.vw/2, this.vh/2, this.vh*0.2, this.vw/2, this.vh/2, this.vh);
    vig.addColorStop(0,   'rgba(0,0,0,0)');
    vig.addColorStop(1,   `rgba(0,0,0,${alpha * 0.9})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.vw, this.vh);
  }

  // ─── Static vignette ─────────────────────────────────────
  drawVignette(ctx) {
    const vig = ctx.createRadialGradient(this.vw/2, this.vh/2, this.vh*0.3, this.vw/2, this.vh/2, this.vh*0.8);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.vw, this.vh);
  }
}
