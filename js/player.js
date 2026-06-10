// ============================================================
//  PLAYER
// ============================================================

class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.angle   = 0;
    this.radius  = 14;
    this.speed   = CFG.WALK_SPEED;
    this.sprinting = false;

    // Inventory
    this.keycards    = new Set();   // 'key_A' .. 'key_D'
    this.hasSlat     = false;
    this.nailCount   = 0;
    this.hasWeapon   = false;       // slat + nails crafted
    this.medicines   = 0;
    this.noiseTraps  = 0;

    // State
    this.hp          = 3;
    this.inStorage   = false;
    this.currentStorage = null;
    this.stunFrame   = 0;           // frames until weapon swing ends
    this.hitCooldown = 0;
    this.dead        = false;
    this.escaped     = false;
    this.noise       = 0;           // current noise level (0-10), decays

    this.stepTimer   = 0;
    this.moving      = false;
  }

  update(keys, map, monsters, audio) {
    if (this.dead || this.escaped) return;

    // Weapon swing
    if (this.stunFrame > 0) { this.stunFrame--; return; }
    if (this.hitCooldown > 0) this.hitCooldown--;

    let dx = 0, dy = 0;
    if (keys['ArrowUp']    || keys['w'] || keys['W']) dy -= 1;
    if (keys['ArrowDown']  || keys['s'] || keys['S']) dy += 1;
    if (keys['ArrowLeft']  || keys['a'] || keys['A']) dx -= 1;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) dx += 1;

    this.sprinting = (keys['Shift'] || keys['ShiftLeft'] || keys['ShiftRight']) && (dx || dy);
    const spd = this.sprinting ? CFG.SPRINT_SPEED : CFG.WALK_SPEED;

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx = dx / len * spd;
      dy = dy / len * spd;
      this.angle = Math.atan2(dy, dx);
      this.moving = true;

      // Collision
      const nx = this.x + dx;
      const ny = this.y + dy;
      if (map.isWalkable(Math.floor(nx / CFG.TILE), Math.floor(this.y / CFG.TILE))) this.x = nx;
      if (map.isWalkable(Math.floor(this.x / CFG.TILE), Math.floor(ny / CFG.TILE))) this.y = ny;

      // Footstep noise
      this.stepTimer++;
      const stepInterval = this.sprinting ? 12 : 22;
      if (this.stepTimer >= stepInterval) {
        this.stepTimer = 0;
        this.noise = this.sprinting ? 7 : 3;
        audio.playStep(this.sprinting);
      }
    } else {
      this.moving = false;
      this.noise = Math.max(0, this.noise - 0.1);
    }

    // Check storage
    const tx = Math.floor(this.x / CFG.TILE);
    const ty = Math.floor(this.y / CFG.TILE);
    this.inStorage = map.isStorage(tx, ty);
    this.currentStorage = this.inStorage ? map.getStorageAt(this.x, this.y) : null;

    // Noise decay
    this.noise = Math.max(0, this.noise - 0.05);
  }

  collectItems(storage) {
    for (const item of storage.items) {
      switch (item.type) {
        case 'keycard':  this.keycards.add(item.id); break;
        case CFG.SLAT_ID: this.hasSlat = true; break;
        case CFG.NAIL_ID: this.nailCount++; break;
        case 'medicine': this.medicines++; break;
        case 'noise_trap': this.noiseTraps++; break;
      }
    }
    storage.items = [];
  }

  tryHeal() {
    if (this.medicines > 0 && this.hp < 3) {
      this.medicines--;
      this.hp = Math.min(3, this.hp + 1);
      return true;
    }
    return false;
  }

  tryCraft() {
    if (this.hasSlat && this.nailCount >= 2 && !this.hasWeapon) {
      this.nailCount -= 2;
      this.hasWeapon = true;
      return true;
    }
    return false;
  }

  tryAttack(monsters, audio) {
    if (!this.hasWeapon || this.hitCooldown > 0) return false;
    this.stunFrame = 20;
    this.hitCooldown = 45;
    audio.playSwing();
    for (const m of monsters) {
      const dist = Math.hypot(this.x - m.x, this.y - m.y);
      if (dist < CFG.TILE * 1.5) {
        m.stun(CFG.STUN_DURATION);
        audio.playHit();
      }
    }
    return true;
  }

  placeNoiseTrap(map, audio) {
    if (this.noiseTraps <= 0) return null;
    this.noiseTraps--;
    audio.playDrop();
    return { x: this.x, y: this.y, triggered: false, life: 600 };
  }

  takeDamage(audio) {
    if (this.hitCooldown > 0) return;
    this.hp--;
    this.hitCooldown = 120;
    audio.playScream();
    if (this.hp <= 0) this.dead = true;
  }

  get keycardCount() { return this.keycards.size; }
  get canEscape() { return this.keycards.size >= CFG.KEYCARD_PIECES; }
}
