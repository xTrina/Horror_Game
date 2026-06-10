import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { CFG, TILE_TYPE as TT } from './config.js';

const T  = CFG.TILE;
const WH = CFG.WALL_H;

export class Player {
  constructor(camera, renderer, mapData) {
    this.camera   = camera;
    this.mapData  = mapData;
    this.controls = new PointerLockControls(camera, renderer.domElement);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2(); // XZ velocity

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

    this.keys = {};
    this._bindKeys();
  }

  _bindKeys() {
    window.addEventListener('keydown', e => { this.keys[e.code] = true; });
    window.addEventListener('keyup',   e => { this.keys[e.code] = false; });
  }

  get tileCol() { return Math.floor(this.pos.x / T); }
  get tileRow() { return Math.floor(this.pos.z / T); }
  get keycardCount() { return this.keycards.size; }
  get canEscape()    { return this.keycards.size >= CFG.KEYCARD_PIECES; }

  setPosition(worldX, worldZ) {
    this.pos.set(worldX, CFG.PLAYER_H, worldZ);
    this.camera.position.copy(this.pos);
  }

  update(dt, audio) {
    if (this.dead || this.escaped) return;
    if (this.swingFrame > 0) { this.swingFrame -= dt * 60; }
    if (this.hitCooldown > 0) { this.hitCooldown -= dt; }

    const sprinting = (this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    const spd = sprinting ? CFG.SPRINT_SPD : CFG.WALK_SPD;

    // Movement input
    const fwd  = new THREE.Vector3();
    const right = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    right.crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();

    let moveX = 0, moveZ = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp'])    { moveX += fwd.x; moveZ += fwd.z; }
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  { moveX -= fwd.x; moveZ -= fwd.z; }
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  { moveX -= right.x; moveZ -= right.z; }
    if (this.keys['KeyD'] || this.keys['ArrowRight']) { moveX += right.x; moveZ += right.z; }

    const len = Math.hypot(moveX, moveZ);
    if (len > 0) { moveX /= len; moveZ /= len; }

    const dx = moveX * spd * dt;
    const dz = moveZ * spd * dt;

    // Resolve collisions on each axis separately
    this._moveAxis('x', dx);
    this._moveAxis('z', dz);

    // Footstep noise
    if (len > 0) {
      this._stepTimer = (this._stepTimer || 0) + dt;
      const interval = sprinting ? 0.22 : 0.40;
      if (this._stepTimer >= interval) {
        this._stepTimer = 0;
        this.noise = sprinting ? 7 : 3;
        audio.playStep(sprinting);
      }
    }
    this.noise = Math.max(0, this.noise - dt * 2);

    // Storage check
    this.inStorage = this.mapData.isStorage(this.tileCol, this.tileRow);

    // Camera follows pos
    this.camera.position.copy(this.pos);
  }

  _moveAxis(axis, delta) {
    const map = this.mapData;
    const newPos = this.pos.clone();
    newPos[axis] += delta;

    const r = 0.3; // player radius
    const cx = newPos.x, cz = newPos.z;
    const corners = [
      { x: cx - r, z: cz - r }, { x: cx + r, z: cz - r },
      { x: cx - r, z: cz + r }, { x: cx + r, z: cz + r },
    ];

    for (const c of corners) {
      const tc = Math.floor(c.x / T);
      const tr = Math.floor(c.z / T);
      if (!map.isWalkable(tc, tr)) return; // blocked
    }

    // Check door collision
    if (!this._canPassDoor(this.pos, newPos)) return;

    this.pos[axis] = newPos[axis];
  }

  _canPassDoor(from, to) {
    // Doors are z-axis barriers (N/S doors block z movement)
    for (const door of this.mapData.doors) {
      if (door.open) continue;
      const dz = door.dir === 'S' ? (door.row + 1) * T : door.row * T;
      const dx0 = door.col * T, dx1 = (door.col + 1) * T;

      // Check if movement crosses this z-line within the door's x range
      const playerX = (from.x + to.x) / 2;
      if (playerX < dx0 - 0.1 || playerX > dx1 + 0.1) continue;

      const crossesZ = (from.z < dz && to.z >= dz) || (from.z > dz && to.z <= dz);
      if (crossesZ) return false;
    }
    return true;
  }

  tryInteract(audio, items, monsters) {
    const px = this.pos.x, pz = this.pos.z;

    // Items
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const d = Math.hypot(px - item.worldX, pz - item.worldZ);
      if (d < CFG.INTERACT_R) {
        this._pickUp(item, audio);
        items.splice(i, 1);
        return { action: 'pickup', item };
      }
    }

    // Doors
    const nearDoor = this._nearestDoor(px, pz);
    if (nearDoor) {
      if (this.inStorage && !nearDoor.open) {
        // Lock/unlock
        nearDoor.locked = !nearDoor.locked;
        audio.playDoor();
        return { action: nearDoor.locked ? 'locked' : 'unlocked' };
      } else if (!nearDoor.locked) {
        nearDoor.open = !nearDoor.open;
        audio.playDoor();
        return { action: nearDoor.open ? 'open' : 'close' };
      } else {
        return { action: 'locked_hint' };
      }
    }
    return null;
  }

  _nearestDoor(px, pz) {
    let best = null, bd = CFG.INTERACT_R;
    for (const d of this.mapData.doors) {
      const doorX = (d.col + 0.5) * T;
      const doorZ = d.dir === 'S' ? (d.row + 1) * T : d.row * T;
      const dist  = Math.hypot(px - doorX, pz - doorZ);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
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
