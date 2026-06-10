import * as THREE from 'three';
import { CFG, MON, TILE_TYPE as TT } from './config.js';

const T = CFG.TILE;

// ── Monster mesh builder ─────────────────────────────────
function buildMonsterMesh(type) {
  const group = new THREE.Group();

  let bodyColor, headColor, eyeColor;
  switch (type) {
    case MON.BLIND:   bodyColor = 0xc8b89a; headColor = 0xd4c4aa; eyeColor = 0x333333; break;
    case MON.DEAF:    bodyColor = 0x1a1a2a; headColor = 0x2a2a3a; eyeColor = 0xff0000; break;
    case MON.STALKER: bodyColor = 0x150022; headColor = 0x200030; eyeColor = 0xffffff; break;
  }

  // Body
  const bodyGeo = new THREE.CapsuleGeometry(0.32, 1.0, 4, 8);
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const body    = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 1.0;
  body.castShadow = true;
  group.add(body);

  // Head
  const headGeo = new THREE.SphereGeometry(0.28, 8, 8);
  const headMat = new THREE.MeshLambertMaterial({ color: headColor });
  const head    = new THREE.Mesh(headGeo, headMat);
  head.position.y = 2.0;
  head.castShadow = true;
  group.add(head);

  // Eyes
  const eyeGeo  = new THREE.SphereGeometry(0.07, 6, 6);
  const eyeMat  = new THREE.MeshStandardMaterial({ color: eyeColor, emissive: eyeColor, emissiveIntensity: 2 });
  const eyeL    = new THREE.Mesh(eyeGeo, eyeMat);
  const eyeR    = new THREE.Mesh(eyeGeo.clone(), eyeMat.clone());
  eyeL.position.set(-0.1, 2.05, 0.24);
  eyeR.position.set( 0.1, 2.05, 0.24);
  group.add(eyeL, eyeR);

  if (type === MON.BLIND) {
    // Stitch lines over eyes
    const stMat = new THREE.LineBasicMaterial({ color: 0x111111 });
    for (const side of [-0.1, 0.1]) {
      const pts = [new THREE.Vector3(side-0.08, 2.1, 0.28), new THREE.Vector3(side+0.08, 2.0, 0.28)];
      const sg  = new THREE.BufferGeometry().setFromPoints(pts);
      group.add(new THREE.Line(sg, stMat));
    }
    // Long arms
    for (const side of [-1, 1]) {
      const armGeo = new THREE.CapsuleGeometry(0.07, 0.9, 4, 6);
      const armMat = new THREE.MeshLambertMaterial({ color: bodyColor });
      const arm    = new THREE.Mesh(armGeo, armMat);
      arm.position.set(side * 0.5, 0.7, 0);
      arm.rotation.z = side * 0.5;
      arm.castShadow = true;
      group.add(arm);
    }
  }

  if (type === MON.STALKER) {
    // Tendrils
    const tMat = new THREE.LineBasicMaterial({ color: 0x660099 });
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const pts = [
        new THREE.Vector3(0, 1.0, 0),
        new THREE.Vector3(Math.cos(angle) * 0.6, 0.4, Math.sin(angle) * 0.6),
        new THREE.Vector3(Math.cos(angle) * 1.0, 0.1, Math.sin(angle) * 1.0),
      ];
      const tg = new THREE.BufferGeometry().setFromPoints(pts);
      group.add(new THREE.Line(tg, tMat));
    }
  }

  group._eyeL = eyeL;
  group._eyeR = eyeR;
  group._body = body;
  group._head = head;
  return group;
}

// ── Monster class ─────────────────────────────────────────
export class Monster {
  constructor(worldX, worldZ, type, rng) {
    this.pos  = new THREE.Vector3(worldX, 0, worldZ);
    this.type = type;
    this.rng  = rng;

    this.speed      = type === MON.BLIND ? CFG.BLIND_SPD : type === MON.DEAF ? CFG.DEAF_SPD : CFG.STALKER_SPD;
    this.stunTimer  = 0;        // frames
    this.chaseTimer = 0;
    this.chasing    = false;
    this.targetX    = worldX;
    this.targetZ    = worldZ;
    this.wanderTimer= 0;
    this.flickerT   = 0;
    this.visible    = true;
    this.angle      = 0;

    this.mesh = buildMonsterMesh(type);
    this.mesh.position.copy(this.pos);
  }

  get tileCol() { return Math.floor(this.pos.x / T); }
  get tileRow() { return Math.floor(this.pos.z / T); }

  update(dt, player, mapData, audio, traps) {
    if (this.stunTimer > 0) {
      this.stunTimer -= dt * 60;
      this.visible = (Math.floor(this.stunTimer / 3) % 2) === 0;
      this.mesh.visible = this.visible;
      return;
    }
    this.mesh.visible = true;

    // Safe zone: player in storage → back off
    if (player.inStorage) {
      this._enforceBackOff(mapData);
    }

    // Per-type perception
    switch (this.type) {
      case MON.BLIND:   this._updateBlind(dt, player, traps); break;
      case MON.DEAF:    this._updateDeaf(dt, player, mapData); break;
      case MON.STALKER: this._updateStalker(dt, player, mapData, audio); break;
    }

    // Move
    const spd = this.speed * dt;
    const dx  = this.targetX - this.pos.x;
    const dz  = this.targetZ - this.pos.z;
    const d   = Math.hypot(dx, dz);
    if (d > 0.3) {
      this.angle = Math.atan2(dx, dz);
      const nx = this.pos.x + (dx / d) * spd;
      const nz = this.pos.z + (dz / d) * spd;
      const tc = Math.floor(nx / T), tr = Math.floor(nz / T);
      if (mapData.isWalkable(tc, tr) && !mapData.isStorage(tc, tr)) {
        this.pos.x = nx; this.pos.z = nz;
      }
    }

    // Bob animation
    this._animT = (this._animT || 0) + dt;
    this.mesh.position.set(this.pos.x, Math.sin(this._animT * 4) * 0.05, this.pos.z);
    this.mesh.rotation.y = this.angle;

    // Attack range
    const dist = Math.hypot(this.pos.x - player.pos.x, this.pos.z - player.pos.z);
    if (dist < 0.9 && !player.inStorage) {
      player.takeDamage(audio);
    }
  }

  _updateBlind(dt, player, traps) {
    // Check noise traps
    for (const trap of traps) {
      if (!trap.triggered) {
        const d = Math.hypot(this.pos.x - trap.x, this.pos.z - trap.z);
        if (d < 9 * T) {
          trap.triggered = true;
          this.targetX = trap.x; this.targetZ = trap.z;
          this.chasing = true; this.chaseTimer = 200;
        }
      }
    }
    const dist = Math.hypot(this.pos.x - player.pos.x, this.pos.z - player.pos.z);
    if (player.noise > 0.5 && dist < 9 * T) {
      this.targetX = player.pos.x + (this.rng() - 0.5) * T * player.noise * 0.3;
      this.targetZ = player.pos.z + (this.rng() - 0.5) * T * player.noise * 0.3;
      this.chasing = true; this.chaseTimer = 180;
    } else if (this.chaseTimer > 0) {
      this.chaseTimer -= dt * 60;
      if (this.chaseTimer <= 0) this.chasing = false;
    }
    if (!this.chasing) this._wander(dt);
  }

  _updateDeaf(dt, player, mapData) {
    const mc = this.tileCol, mr = this.tileRow;
    const pc = player.tileCol, pr = player.tileRow;
    const dist = Math.hypot(this.pos.x - player.pos.x, this.pos.z - player.pos.z);
    const sameLine = (mc === pc || mr === pr) && dist < 12 * T;

    if (sameLine && this._hasLOS(mapData, mc, mr, pc, pr)) {
      this.targetX = player.pos.x; this.targetZ = player.pos.z;
      this.chasing = true; this.chaseTimer = 240;
    } else if (this.chaseTimer > 0) {
      this.chaseTimer -= dt * 60;
      if (this.chaseTimer <= 0) this.chasing = false;
    }
    if (!this.chasing) this._wander(dt);
  }

  _hasLOS(mapData, x0, y0, x1, y1) {
    const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
    let cx = x0, cy = y0;
    while (cx !== x1 || cy !== y1) {
      cx += sx; cy += sy;
      if (!mapData.isWalkable(cx, cy)) return false;
    }
    return true;
  }

  _updateStalker(dt, player, mapData, audio) {
    this.flickerT += dt;
    // Teleport every 8-14s
    if (this.flickerT > 8 + this.rng() * 6) {
      this.flickerT = 0;
      const angle = this.rng() * Math.PI * 2;
      const dist  = (4 + this.rng() * 4) * T;
      const tx = player.pos.x + Math.cos(angle) * dist;
      const tz = player.pos.z + Math.sin(angle) * dist;
      const tc = Math.floor(tx / T), tr = Math.floor(tz / T);
      if (mapData.isWalkable(tc, tr) && !mapData.isStorage(tc, tr)) {
        this.pos.x = (tc + 0.5) * T; this.pos.z = (tr + 0.5) * T;
        audio.playTeleport();
      }
    }
    const dist = Math.hypot(this.pos.x - player.pos.x, this.pos.z - player.pos.z);
    if (dist < 6 * T) { this.targetX = player.pos.x; this.targetZ = player.pos.z; this.chasing = true; }
    else this.chasing = false;
    if (!this.chasing) this._wander(dt);

    // Flicker mesh
    this.mesh.visible = Math.random() > 0.04;
  }

  _enforceBackOff(mapData) {
    // Must stay out of storage tiles
    if (mapData.isStorage(this.tileCol, this.tileRow)) {
      const corr = mapData.corridorCentres();
      const near = corr.reduce((b, c) => {
        const d = Math.hypot(this.pos.x - c.x, this.pos.z - c.z);
        return d < b.d ? { d, c } : b;
      }, { d: Infinity, c: null });
      if (near.c) { this.pos.x = near.c.x; this.pos.z = near.c.z; }
    }
  }

  _wander(dt) {
    this.wanderTimer -= dt;
    const d = Math.hypot(this.pos.x - this.targetX, this.pos.z - this.targetZ);
    if (this.wanderTimer <= 0 || d < T * 0.5) {
      const corr = this.mapData_ref?.corridorCentres?.() || [];
      this.wanderTimer = 2 + this.rng() * 3;
      // pick random corridor near current position
      const nearby = [];
      for (let dr = -3; dr <= 3; dr++)
        for (let dc = -3; dc <= 3; dc++) {
          const c = this.tileCol + dc, r = this.tileRow + dr;
          // Simple: just pick random offset
        }
      this.targetX = this.pos.x + (this.rng() - 0.5) * T * 4;
      this.targetZ = this.pos.z + (this.rng() - 0.5) * T * 4;
    }
  }

  stun(frames) {
    this.stunTimer = frames;
    this.chasing   = false;
  }
}

export function spawnMonsters(mapData, playerX, playerZ, rng) {
  const monsters = [];
  for (const type of [MON.BLIND, MON.DEAF, MON.STALKER]) {
    let pos;
    do { pos = mapData.randomCorridorPos(rng); }
    while (Math.hypot(pos.x - playerX, pos.z - playerZ) < T * 8);
    const m = new Monster(pos.x, pos.z, type, rng);
    m.mapData_ref = mapData; // for wander
    monsters.push(m);
  }
  return monsters;
}
