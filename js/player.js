import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { CFG } from './config.js';

const T = CFG.TILE;

export class Player {
  constructor(camera, domElement, mapData) {
    this.camera  = camera;
    this.mapData = mapData;

    // PointerLockControls: getObject() = yaw-wrapper (world pos)
    this.controls = new PointerLockControls(camera, domElement);
    this._yaw     = this.controls.getObject(); // moves in world space
    this._yaw.position.y = CFG.PLAYER_H;

    // Inventory
    this.keycards  = new Set();
    this.hasSlat   = false;
    this.nails     = 0;
    this.hasWeapon = false;
    this.medicines = 0;
    this.traps     = 0;

    this.hp          = 3;
    this.noise       = 0;
    this.inStorage   = false;
    this.dead        = false;
    this.escaped     = false;
    this.hitCooldown = 0;
    this.swingFrame  = 0;

    // Bob state
    this._bobT    = 0;
    this._lastBob = 0;
    this._isMoving = false;

    this.keys = {};
    window.addEventListener('keydown', e => { this.keys[e.code] = true; });
    window.addEventListener('keyup',   e => { this.keys[e.code] = false; });
  }

  // World position shortcut
  get pos() { return this._yaw.position; }

  get tileCol() { return Math.floor(this.pos.x / T); }
  get tileRow() { return Math.floor(this.pos.z / T); }
  get keycardCount() { return this.keycards.size; }
  get canEscape()    { return this.keycards.size >= CFG.KEYCARD_PIECES; }

  // Add yaw object to scene (call once after init)
  addToScene(scene) { scene.add(this._yaw); }

  setPosition(worldX, worldZ) {
    this._yaw.position.set(worldX, CFG.PLAYER_H, worldZ);
  }

  update(dt, audio) {
    if (this.dead || this.escaped) return;
    if (this.swingFrame  > 0) this.swingFrame  -= dt * 60;
    if (this.hitCooldown > 0) this.hitCooldown -= dt;

    const sprinting = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    const spd = sprinting ? CFG.SPRINT_SPD : CFG.WALK_SPD;

    // Camera world direction (flattened to XZ)
    const fwd   = new THREE.Vector3();
    const right = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    right.crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();

    let mx = 0, mz = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp'])    { mx += fwd.x;   mz += fwd.z; }
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  { mx -= fwd.x;   mz -= fwd.z; }
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  { mx -= right.x; mz -= right.z; }
    if (this.keys['KeyD'] || this.keys['ArrowRight']) { mx += right.x; mz += right.z; }

    const len = Math.hypot(mx, mz);
    this._isMoving = len > 0;
    if (len > 0) { mx /= len; mz /= len; }

    const dx = mx * spd * dt;
    const dz = mz * spd * dt;
    this._moveAxis('x', dx);
    this._moveAxis('z', dz);

    // ── Head bob ──────────────────────────────────────────
    if (this._isMoving) {
      const bobSpd = sprinting ? 14 : 9;
      this._bobT += dt * bobSpd;

      const bobY = Math.sin(this._bobT) * (sprinting ? 0.10 : 0.055);
      const bobX = Math.sin(this._bobT * 0.5) * 0.028;

      this._yaw.position.y = CFG.PLAYER_H + bobY;
      // Small side-sway on the camera itself (local)
      this.camera.position.x = bobX;

      // Trigger footstep at each downward crossing of the bob
      const bobNow = Math.sin(this._bobT);
      if (this._lastBob >= 0 && bobNow < 0) {
        this.noise = sprinting ? 7 : 3;
        audio.playStep(sprinting);
      }
      this._lastBob = bobNow;
    } else {
      // Smoothly return to neutral
      this._yaw.position.y += (CFG.PLAYER_H - this._yaw.position.y) * Math.min(1, dt * 10);
      this.camera.position.x *= (1 - Math.min(1, dt * 10));
    }

    this.noise = Math.max(0, this.noise - dt * 2);
    this.inStorage = this.mapData.isStorage(this.tileCol, this.tileRow);
  }

  _moveAxis(axis, delta) {
    const newPos = this.pos.clone();
    newPos[axis] += delta;

    const r  = 0.28;
    const cx = newPos.x, cz = newPos.z;
    const corners = [
      { x: cx - r, z: cz - r }, { x: cx + r, z: cz - r },
      { x: cx - r, z: cz + r }, { x: cx + r, z: cz + r },
    ];
    for (const c of corners) {
      if (!this.mapData.isWalkable(Math.floor(c.x / T), Math.floor(c.z / T))) return;
    }
    if (!this._canPassDoor(this.pos, newPos)) return;
    this.pos[axis] = newPos[axis];
  }

  _canPassDoor(from, to) {
    for (const door of this.mapData.doors) {
      if (door.open) continue;
      const dz  = door.dir === 'S' ? (door.row + 1) * T : door.row * T;
      const dx0 = door.col * T, dx1 = (door.col + 1) * T;
      const px  = (from.x + to.x) / 2;
      if (px < dx0 - 0.15 || px > dx1 + 0.15) continue;
      const crosses = (from.z < dz && to.z >= dz) || (from.z > dz && to.z <= dz);
      if (crosses) return false;
    }
    return true;
  }

  // ── Interaction ──────────────────────────────────────────
  tryInteract(audio, items) {
    const px = this.pos.x, pz = this.pos.z;

    // Items first
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (Math.hypot(px - it.worldX, pz - it.worldZ) < CFG.INTERACT_R) {
        this._pickUp(it, audio);
        items.splice(i, 1);
        return { action: 'pickup', item: it };
      }
    }

    // Door
    const nd = this._nearestDoor(px, pz);
    if (nd) {
      if (this.inStorage && !nd.open) {
        nd.locked = !nd.locked;
        audio.playDoor();
        return { action: nd.locked ? 'locked' : 'unlocked' };
      } else if (!nd.locked) {
        nd.open = !nd.open;
        audio.playDoor();
        return { action: nd.open ? 'open' : 'close' };
      } else {
        return { action: 'locked_hint' };
      }
    }
    return null;
  }

  _nearestDoor(px, pz) {
    let best = null, bd = CFG.INTERACT_R + 0.5;
    for (const d of this.mapData.doors) {
      const cx = (d.col + 0.5) * T;
      const cz = d.dir === 'S' ? (d.row + 1) * T : d.row * T;
      const dd = Math.hypot(px - cx, pz - cz);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  getNearestItem(items) {
    return items.find(it =>
      Math.hypot(it.worldX - this.pos.x, it.worldZ - this.pos.z) < CFG.INTERACT_R
    ) || null;
  }

  getNearestDoor() {
    return this._nearestDoor(this.pos.x, this.pos.z);
  }

  _pickUp(item, audio) {
    audio.playPickup(item.type);
    switch (item.type) {
      case 'keycard':    this.keycards.add(item.id); break;
      case 'slat':       this.hasSlat = true; break;
      case 'nail':       this.nails++; break;
      case 'medicine':   this.medicines++; break;
      case 'noise_trap': this.traps++; break;
    }
    if (item.mesh) item.mesh.parent?.remove(item.mesh);
    if (item.label) item.label.parent?.remove(item.label);
    if (item.glow)  item.glow.parent?.remove(item.glow);
  }

  tryCraft(audio) {
    if (this.hasSlat && this.nails >= 2 && !this.hasWeapon) {
      this.nails -= 2;
      this.hasWeapon = true;
      this.noise = 8;
      audio.playCraft();
      return true;
    }
    return false;
  }

  tryHeal(audio) {
    if (this.medicines > 0 && this.hp < 3) {
      this.medicines--;
      this.hp = Math.min(3, this.hp + 1);
      audio.playPickup('medicine');
      return true;
    }
    return false;
  }

  tryAttack(monsters, audio) {
    if (!this.hasWeapon || this.hitCooldown > 0) return false;
    this.swingFrame  = 20;
    this.hitCooldown = 0.75;
    audio.playSwing();
    let hit = false;
    for (const m of monsters) {
      const d = Math.hypot(this.pos.x - m.pos.x, this.pos.z - m.pos.z);
      if (d < T * 1.5) { m.stun(CFG.STUN_DUR); audio.playHit(); hit = true; }
    }
    return hit;
  }

  placeTrap(audio) {
    if (this.traps <= 0) return null;
    this.traps--;
    audio.playDrop();
    return { x: this.pos.x, z: this.pos.z, triggered: false, life: 600 };
  }

  takeDamage(audio) {
    if (this.hitCooldown > 0) return;
    this.hp--;
    this.hitCooldown = 2.0;
    audio.playScream();
    if (this.hp <= 0) this.dead = true;
  }
}
