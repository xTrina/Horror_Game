// ============================================================
//  MONSTERS  (3 types with distinct AI)
// ============================================================

class Monster {
  constructor(x, y, type, rng) {
    this.x      = x;
    this.y      = y;
    this.type   = type;
    this.rng    = rng;
    this.angle  = 0;
    this.radius = 16;
    this.stunTimer   = 0;
    this.chaseTimer  = 0;   // frames left chasing last known pos
    this.targetX = x;
    this.targetY = y;
    this.lastKnownX = x;
    this.lastKnownY = y;
    this.wanderTimer = 0;
    this.jumpScareTriggered = false;
    this.visible = true;   // for Stalker flicker
    this.flickerTimer = 0;
    this.patrolPoints = [];
    this.patrolIdx   = 0;

    // per-type
    switch (type) {
      case M.BLIND:   this.speed = CFG.BLIND_SPEED;   this.sightRange = 0;   this.hearRange = 9; break;
      case M.DEAF:    this.speed = CFG.DEAF_SPEED;    this.sightRange = 12;  this.hearRange = 0; break;
      case M.STALKER: this.speed = CFG.STALKER_SPEED; this.sightRange = 5;   this.hearRange = 5; break;
    }

    this.chasing = false;
  }

  // Called each frame
  update(player, map, audio, traps) {
    if (this.stunTimer > 0) { this.stunTimer--; this.visible = this.stunTimer % 6 < 3; return; }
    this.visible = true;

    const dist = Math.hypot(this.x - player.x, this.y - player.y);

    // ── SAFE ZONE enforcement ──────────────────────────────
    const ptx = Math.floor(player.x / CFG.TILE);
    const pty = Math.floor(player.y / CFG.TILE);
    if (map.isStorage(ptx, pty)) {
      // Monster must stay at least MONSTER_SAFE_DIST tiles from any storage tile adjacent
      this._enforceNoStorageCamping(map);
    }

    // ── Monster-specific perception ───────────────────────
    switch (this.type) {
      case M.BLIND:   this._updateBlind(player, map, audio, dist, traps); break;
      case M.DEAF:    this._updateDeaf(player, map, audio, dist); break;
      case M.STALKER: this._updateStalker(player, map, audio, dist); break;
    }

    // ── Move toward target ────────────────────────────────
    if (this.chasing || this.type === M.STALKER) {
      this._moveToward(this.targetX, this.targetY, map);
    } else {
      this._wander(map);
    }

    // ── Attack player if close ────────────────────────────
    if (dist < CFG.TILE * CFG.JUMPSCREEEN_DIST && !map.isStorage(ptx, pty)) {
      if (!this.jumpScareTriggered) {
        this.jumpScareTriggered = true;
        audio.triggerJumpScare(this.type);
        setTimeout(() => { this.jumpScareTriggered = false; }, 3000);
      }
      if (dist < this.radius + player.radius + 4) {
        player.takeDamage(audio);
      }
    }
  }

  // ─── Blind: only hears ────────────────────────────────────
  _updateBlind(player, map, audio, dist, traps) {
    // Check noise traps
    for (const trap of traps) {
      if (!trap.triggered) {
        const td = Math.hypot(this.x - trap.x, this.y - trap.y);
        if (td < this.hearRange * CFG.TILE) {
          trap.triggered = true;
          this.lastKnownX = trap.x;
          this.lastKnownY = trap.y;
          this.targetX    = trap.x;
          this.targetY    = trap.y;
          this.chasing    = true;
          this.chaseTimer = 200;
        }
      }
    }

    const noise = player.noise + (player.sprinting ? 4 : 0);
    if (noise > 0.5 && dist < this.hearRange * CFG.TILE) {
      this.lastKnownX = player.x + (this.rng() - 0.5) * CFG.TILE * noise * 0.3;
      this.lastKnownY = player.y + (this.rng() - 0.5) * CFG.TILE * noise * 0.3;
      this.targetX = this.lastKnownX;
      this.targetY = this.lastKnownY;
      this.chasing = true;
      this.chaseTimer = 180;
    } else if (this.chaseTimer > 0) {
      this.chaseTimer--;
      if (this.chaseTimer <= 0) this.chasing = false;
    }
  }

  // ─── Deaf: only sees (same corridor line of sight) ───────
  _updateDeaf(player, map, audio, dist) {
    const mx = Math.floor(this.x / CFG.TILE);
    const my = Math.floor(this.y / CFG.TILE);
    const px = Math.floor(player.x / CFG.TILE);
    const py = Math.floor(player.y / CFG.TILE);

    // Line-of-sight: must be in same row OR same column AND within range
    const sameRow = my === py;
    const sameCol = mx === px;
    if ((sameRow || sameCol) && dist < this.sightRange * CFG.TILE) {
      // Check clear line
      if (this._hasLineOfSight(map, mx, my, px, py)) {
        this.targetX = player.x;
        this.targetY = player.y;
        this.lastKnownX = player.x;
        this.lastKnownY = player.y;
        this.chasing = true;
        this.chaseTimer = 240;
      }
    } else if (this.chaseTimer > 0) {
      this.chaseTimer--;
      if (this.chaseTimer <= 0) this.chasing = false;
    }
  }

  _hasLineOfSight(map, x0, y0, x1, y1) {
    const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
    let cx = x0, cy = y0;
    while (cx !== x1 || cy !== y1) {
      cx += dx; cy += dy;
      if (!map.isWalkable(cx, cy)) return false;
    }
    return true;
  }

  // ─── Stalker: random teleport + slow stalk ───────────────
  _updateStalker(player, map, audio, dist) {
    this.flickerTimer++;

    // Random teleport every ~8-12 seconds
    if (this.flickerTimer > 480 + Math.floor(this.rng() * 240)) {
      this.flickerTimer = 0;
      // Teleport to a random corridor tile near player (4-8 tiles away)
      const angle  = this.rng() * Math.PI * 2;
      const tdist  = (4 + this.rng() * 4) * CFG.TILE;
      let tx = player.x + Math.cos(angle) * tdist;
      let ty = player.y + Math.sin(angle) * tdist;
      // Snap to nearest walkable tile
      const ntx = Math.floor(tx / CFG.TILE);
      const nty = Math.floor(ty / CFG.TILE);
      if (map.isWalkable(ntx, nty) && !map.isStorage(ntx, nty)) {
        this.x = (ntx + 0.5) * CFG.TILE;
        this.y = (nty + 0.5) * CFG.TILE;
        audio.playTeleport();
      }
    }

    // Always slowly stalks toward player
    if (dist < this.sightRange * CFG.TILE) {
      this.targetX = player.x;
      this.targetY = player.y;
      this.chasing = true;
    } else {
      this.chasing = false;
    }
  }

  // ─── Safe zone enforcement ───────────────────────────────
  _enforceNoStorageCamping(map) {
    // Find nearest storage tile; if monster is within MONSTER_SAFE_DIST, push away
    const tx = Math.floor(this.x / CFG.TILE);
    const ty = Math.floor(this.y / CFG.TILE);
    const safeDist = CFG.MONSTER_SAFE_DIST * CFG.TILE;

    for (const s of map.storages) {
      const sx = (s.x + 0.5) * CFG.TILE;
      const sy = (s.y + (s.side === 'top' ? 0.5 : 1.5)) * CFG.TILE;
      const d  = Math.hypot(this.x - sx, this.y - sy);
      if (d < safeDist) {
        const ang = Math.atan2(this.y - sy, this.x - sx);
        this.x = sx + Math.cos(ang) * safeDist;
        this.y = sy + Math.sin(ang) * safeDist;
        // Snap back to corridor
        const ntx = Math.floor(this.x / CFG.TILE);
        const nty = Math.floor(this.y / CFG.TILE);
        if (!map.isWalkable(ntx, nty)) {
          // Find nearest corridor tile
          const near = map.corridors.reduce((best, c) => {
            const cd = Math.hypot(this.x - c.x * CFG.TILE, this.y - c.y * CFG.TILE);
            return cd < best.d ? {d: cd, c} : best;
          }, {d: Infinity, c: null});
          if (near.c) { this.x = (near.c.x + 0.5) * CFG.TILE; this.y = (near.c.y + 0.5) * CFG.TILE; }
        }
        break;
      }
    }
  }

  // ─── Movement helpers ────────────────────────────────────
  _moveToward(tx, ty, map) {
    const dist = Math.hypot(this.x - tx, this.y - ty);
    if (dist < 4) return;
    const angle = Math.atan2(ty - this.y, tx - this.x);
    this.angle = angle;
    const spd = this.stunTimer > 0 ? 0 : this.speed;
    const nx = this.x + Math.cos(angle) * spd;
    const ny = this.y + Math.sin(angle) * spd;
    const ntx = Math.floor(nx / CFG.TILE);
    const nty = Math.floor(ny / CFG.TILE);
    if (map.isWalkable(ntx, Math.floor(this.y / CFG.TILE)) && !map.isStorage(ntx, Math.floor(this.y / CFG.TILE))) {
      this.x = nx;
    }
    if (map.isWalkable(Math.floor(this.x / CFG.TILE), nty) && !map.isStorage(Math.floor(this.x / CFG.TILE), nty)) {
      this.y = ny;
    }
  }

  _wander(map) {
    this.wanderTimer--;
    if (this.wanderTimer <= 0 || !map.isWalkable(
        Math.floor(this.targetX / CFG.TILE), Math.floor(this.targetY / CFG.TILE))) {
      // Pick random corridor
      const c = map.corridors[Math.floor(this.rng() * map.corridors.length)];
      this.targetX = (c.x + 0.5) * CFG.TILE;
      this.targetY = (c.y + 0.5) * CFG.TILE;
      this.wanderTimer = 120 + Math.floor(this.rng() * 180);
    }
    this._moveToward(this.targetX, this.targetY, map);
  }

  stun(frames) {
    this.stunTimer = frames;
    this.chasing   = false;
  }
}

// ─── Factory ─────────────────────────────────────────────
function spawnMonsters(map, playerX, playerY, rng) {
  const types = [M.BLIND, M.DEAF, M.STALKER];
  const monsters = [];

  for (const type of types) {
    let pos;
    // Spawn far from player (at least 8 tiles)
    do {
      pos = map.getRandomCorridorPos();
    } while (Math.hypot(pos.x - playerX, pos.y - playerY) < CFG.TILE * 8);

    monsters.push(new Monster(pos.x, pos.y, type, rng));
  }
  return monsters;
}
