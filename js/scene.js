import * as THREE from 'three';
import { CFG, TILE_TYPE as TT } from './config.js';

const T  = CFG.TILE;
const WH = CFG.WALL_H;

// ── Canvas textures ───────────────────────────────────────
function makeTex(w, h, fn) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  fn(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const floorTex = makeTex(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#1c1c22';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#2a2a35';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i*64, 0); ctx.lineTo(i*64, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i*64); ctx.lineTo(w, i*64); ctx.stroke();
  }
  // Slight grime patches
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  for (let i = 0; i < 8; i++) ctx.fillRect(Math.random()*w, Math.random()*h, 20+Math.random()*40, 2+Math.random()*8);
});
floorTex.repeat.set(T / 2, T / 2);

const wallTex = makeTex(256, 128, (ctx, w, h) => {
  ctx.fillStyle = '#26241e';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#19170e';
  ctx.lineWidth = 2;
  // 3 brick rows
  for (let row = 0; row < 3; row++) {
    const y0 = row * 40, y1 = y0 + 36;
    ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(w, y1); ctx.stroke();
    const off = (row % 2) * 46;
    for (let i = -1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(off + i*62, y0); ctx.lineTo(off + i*62, y1); ctx.stroke();
    }
  }
  // Stain
  ctx.fillStyle = 'rgba(10,8,5,0.35)';
  ctx.fillRect(0, 0, w, 12);
  ctx.fillRect(0, h-16, w, 16);
});
wallTex.repeat.set(T / 1.5, WH / 1.5);

const storageTex = makeTex(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#0e1320';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#1a2338';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i*64, 0); ctx.lineTo(i*64, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i*64); ctx.lineTo(w, i*64); ctx.stroke();
  }
});
storageTex.repeat.set(T / 2, T / 2);

const ceilTex = makeTex(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#111116';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#191920';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath(); ctx.moveTo(i*16, 0); ctx.lineTo(i*16, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i*16); ctx.lineTo(w, i*16); ctx.stroke();
  }
});
ceilTex.repeat.set(T / 2, T / 2);

const doorTex = makeTex(128, 256, (ctx, w, h) => {
  ctx.fillStyle = '#3a3845';
  ctx.fillRect(0, 0, w, h);
  // Panels
  ctx.strokeStyle = '#5a5870';
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, w-16, h/2-12);
  ctx.strokeRect(8, h/2+4, w-16, h/2-12);
  // Horizontal bands (shutter style)
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i%2===0 ? '#3f3c4e' : '#36334a';
    ctx.fillRect(1, 1 + i*(h/8), w-2, h/8);
  }
  ctx.strokeStyle = '#6a6888';
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 8; i++) {
    ctx.beginPath(); ctx.moveTo(1, i*(h/8)); ctx.lineTo(w-1, i*(h/8)); ctx.stroke();
  }
  // Handle
  ctx.fillStyle = '#c8c4a0';
  ctx.fillRect(w*0.72, h*0.47, 14, 6);
  ctx.fillRect(w*0.72 + 4, h*0.43, 6, 14);
});

// Materials
const mFloor   = new THREE.MeshLambertMaterial({ map: floorTex });
const mWall    = new THREE.MeshLambertMaterial({ map: wallTex });
const mStorage = new THREE.MeshLambertMaterial({ map: storageTex });
const mCeil    = new THREE.MeshLambertMaterial({ map: ceilTex });
const mDoor    = new THREE.MeshLambertMaterial({ map: doorTex, side: THREE.DoubleSide });
const mFrame   = new THREE.MeshLambertMaterial({ color: 0x555566 });
const mLight   = new THREE.MeshBasicMaterial({ color: 0xddddaa });

// ── Build 3D scene from MapData ───────────────────────────
export function buildScene(scene, mapData) {
  const { grid, rows, cols } = mapData;

  function addPlane(x, y, z, rotX, rotY, mat, w = T, h = WH) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.x = rotX; m.rotation.y = rotY;
    m.receiveShadow = true;
    scene.add(m);
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = grid[r][c];
      if (tile === TT.WALL) continue;

      const wx = (c + 0.5) * T, wz = (r + 0.5) * T;
      const fm = tile === TT.STORAGE ? mStorage : mFloor;

      // Floor
      addPlane(wx, 0,  wz, -Math.PI / 2, 0, fm, T, T);
      // Ceiling
      addPlane(wx, WH, wz,  Math.PI / 2, 0, mCeil, T, T);

      // Ceiling light strip (occasional)
      if ((c * 3 + r * 7) % 11 === 0 && tile === TT.FLOOR) {
        const lm = new THREE.Mesh(new THREE.PlaneGeometry(T * 0.55, T * 0.14), mLight);
        lm.rotation.x = Math.PI / 2;
        lm.position.set(wx, WH - 0.01, wz);
        scene.add(lm);
      }

      // Walls on all 4 sides
      const sides = [
        { dc: 0, dr: -1, wx: wx,          wz: r * T,           ry: 0             },  // N
        { dc: 0, dr: +1, wx: wx,          wz: (r + 1) * T,     ry: Math.PI       },  // S
        { dc: -1, dr: 0, wx: c * T,       wz: wz,              ry:  Math.PI / 2  },  // W
        { dc: +1, dr: 0, wx: (c + 1) * T, wz: wz,              ry: -Math.PI / 2  },  // E
      ];

      for (const s of sides) {
        const nt = grid[r + s.dr]?.[c + s.dc];
        if (nt === undefined || nt === TT.WALL) {
          addPlane(s.wx, WH / 2, s.wz, 0, s.ry, mWall);
        }
        // FLOOR↔STORAGE boundary: no wall (door goes here)
      }
    }
  }

  // ── Doors ─────────────────────────────────────────────────
  for (const door of mapData.doors) {
    _buildDoor(scene, door);
  }

  // Exit marker
  const et = mapData.exitTile;
  const exitMesh = new THREE.Mesh(
    new THREE.CircleGeometry(T * 0.38, 20),
    new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 0.85 })
  );
  exitMesh.rotation.x = -Math.PI / 2;
  exitMesh.position.set((et.x + 0.5) * T, 0.02, (et.y + 0.5) * T);
  scene.add(exitMesh);

  // EXIT text sprite
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 32;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#00ff44';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EXIT', 64, 16);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true }));
  spr.scale.set(1.2, 0.3, 1);
  spr.position.set((et.x + 0.5) * T, 0.6, (et.y + 0.5) * T);
  scene.add(spr);
}

function _buildDoor(scene, door) {
  const { col, row, dir } = door;
  const T = CFG.TILE, WH = CFG.WALL_H;

  // Pivot position (west corner of opening at the wall boundary)
  const pivotX = col * T;
  const pivotZ = dir === 'S' ? (row + 1) * T : row * T;
  // Which direction does open swing into storage?
  // dir='S': storage is north (lower z) → open rotY = -π/2
  // dir='N': storage is south (higher z) → open rotY = +π/2
  door._openRotY   = dir === 'S' ? -Math.PI / 2 : Math.PI / 2;

  // Door frame posts (left, right, top)
  const fw = 0.14;
  function addFramePart(ox, oy, oz, bw, bh, bd) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mFrame);
    m.position.set(pivotX + ox, oy, pivotZ + oz);
    m.castShadow = true;
    scene.add(m);
  }
  addFramePart(0,         WH / 2,     T / 2,   fw, WH, fw);       // left post
  addFramePart(T,         WH / 2,     T / 2,   fw, WH, fw);       // right post
  addFramePart(T / 2,     WH + fw/2,  T / 2,   T + fw * 2, fw, fw); // top bar

  // Door pivot group
  const pivot = new THREE.Group();
  pivot.position.set(pivotX, 0, pivotZ);

  // Door panel: width = T-0.18, height = WH - 0.06
  const dw = T - 0.18, dh = WH - 0.06;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.1), mDoor);
  panel.position.set(T / 2, WH / 2, 0);
  panel.castShadow = true;
  pivot.add(panel);
  scene.add(pivot);

  door._pivot = pivot;
}

// ── Animate doors smoothly ────────────────────────────────
export function animateDoors(mapData, dt) {
  for (const door of mapData.doors) {
    if (!door._pivot) continue;
    const target = door.open ? door._openRotY : 0;
    const cur    = door._pivot.rotation.y;
    const diff   = target - cur;
    if (Math.abs(diff) > 0.001) {
      door._pivot.rotation.y += diff * Math.min(1, dt * 10);
    }
  }
}

// ── Corridor point lights (returned for flickering) ──────
export function addCorridorLights(scene, mapData) {
  const lights = [];
  const centres = mapData.corridorCentres();
  centres.forEach((c, i) => {
    if (i % 10 !== 0) return;
    const pl = new THREE.PointLight(0xffeecc, 0.18, T * 3.5);
    pl.position.set(c.x, WH - 0.25, c.z);
    scene.add(pl);
    lights.push(pl);
  });
  return lights;
}
