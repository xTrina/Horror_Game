import * as THREE from 'three';
import { CFG, TILE_TYPE as TT } from './config.js';

const T  = CFG.TILE;
const WH = CFG.WALL_H;

// ── Canvas textures ───────────────────────────────────────
function makeCanvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const floorTex = makeCanvasTex(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#1a1a1e';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#2a2a30';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i*32, 0); ctx.lineTo(i*32, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i*32); ctx.lineTo(w, i*32); ctx.stroke();
  }
});
floorTex.repeat.set(T / 2, T / 2);

const wallTex = makeCanvasTex(128, 64, (ctx, w, h) => {
  ctx.fillStyle = '#252520';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#18180f';
  ctx.lineWidth = 2;
  // Brick rows
  for (let row = 0; row < 2; row++) {
    const y = row * 32;
    ctx.beginPath(); ctx.moveTo(0, y + 30); ctx.lineTo(w, y + 30); ctx.stroke();
    const offset = row % 2 === 0 ? 0 : 42;
    for (let i = -1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(offset + i * 42, y); ctx.lineTo(offset + i * 42, y + 30);
      ctx.stroke();
    }
  }
});
wallTex.repeat.set(T / 2, WH / 1.5);

const storageTex = makeCanvasTex(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#0d1219';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#1e2840';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i*32, 0); ctx.lineTo(i*32, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i*32); ctx.lineTo(w, i*32); ctx.stroke();
  }
});
storageTex.repeat.set(T / 2, T / 2);

const ceilTex = makeCanvasTex(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#111115';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#1a1a20';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath(); ctx.moveTo(i*16, 0); ctx.lineTo(i*16, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i*16); ctx.lineTo(w, i*16); ctx.stroke();
  }
});
ceilTex.repeat.set(T / 2, T / 2);

const doorTex = makeCanvasTex(64, 128, (ctx, w, h) => {
  ctx.fillStyle = '#2a2a35';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#444460';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  ctx.beginPath(); ctx.moveTo(w/2, 4); ctx.lineTo(w/2, h-4); ctx.stroke();
  // Handle
  ctx.fillStyle = '#888';
  ctx.beginPath(); ctx.arc(w*0.75, h*0.5, 5, 0, Math.PI*2); ctx.fill();
});

// ── Materials ─────────────────────────────────────────────
const mFloor   = new THREE.MeshLambertMaterial({ map: floorTex });
const mWall    = new THREE.MeshLambertMaterial({ map: wallTex, side: THREE.FrontSide });
const mStorage = new THREE.MeshLambertMaterial({ map: storageTex });
const mCeil    = new THREE.MeshLambertMaterial({ map: ceilTex });
const mDoor    = new THREE.MeshLambertMaterial({ map: doorTex, side: THREE.DoubleSide });
const mDoorFrame = new THREE.MeshLambertMaterial({ color: 0x444455 });

// ── Scene builder ─────────────────────────────────────────
export function buildScene(scene, mapData) {
  const { grid, rows, cols } = mapData;
  const doorPositions = new Set(
    mapData.doors.map(d => `${d.col},${d.row},${d.dir}`)
  );

  // Helper: add a wall-face quad
  function addFace(x, y, z, rotY, mat, width = T, height = WH) {
    const geo  = new THREE.PlaneGeometry(width, height);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = grid[r][c];
      if (tile === TT.WALL) continue;

      const wx = (c + 0.5) * T;
      const wz = (r + 0.5) * T;
      const floorMat = tile === TT.STORAGE ? mStorage : mFloor;

      // Floor
      const fGeo = new THREE.PlaneGeometry(T, T);
      const fMesh = new THREE.Mesh(fGeo, floorMat);
      fMesh.rotation.x = -Math.PI / 2;
      fMesh.position.set(wx, 0, wz);
      fMesh.receiveShadow = true;
      scene.add(fMesh);

      // Ceiling
      const cGeo = new THREE.PlaneGeometry(T, T);
      const cMesh = new THREE.Mesh(cGeo, mCeil);
      cMesh.rotation.x = Math.PI / 2;
      cMesh.position.set(wx, WH, wz);
      scene.add(cMesh);

      // Ceiling light strip (every few tiles)
      if ((c * 3 + r * 7) % 11 === 0 && tile === TT.FLOOR) {
        const lg = new THREE.PlaneGeometry(T * 0.6, T * 0.12);
        const lm = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
        const lmesh = new THREE.Mesh(lg, lm);
        lmesh.rotation.x = Math.PI / 2;
        lmesh.position.set(wx, WH - 0.01, wz);
        lmesh.userData.isLight = true;
        scene.add(lmesh);
      }

      // Walls – check 4 neighbours
      const neighbours = [
        { dc: 0, dr: -1, rotY: 0,             wx: wx,          wz: r * T,           dir: 'N', nc: c, nr: r - 1 },
        { dc: 0, dr: +1, rotY: Math.PI,        wx: wx,          wz: (r + 1) * T,     dir: 'S', nc: c, nr: r + 1 },
        { dc: -1, dr: 0, rotY: Math.PI / 2,   wx: c * T,       wz: wz,              dir: 'W', nc: c - 1, nr: r },
        { dc: +1, dr: 0, rotY: -Math.PI / 2,  wx: (c + 1) * T, wz: wz,              dir: 'E', nc: c + 1, nr: r },
      ];

      for (const nb of neighbours) {
        const nt = grid[nb.nr]?.[nb.nc];
        if (nt === undefined || nt === TT.WALL) {
          addFace(nb.wx, WH / 2, nb.wz, nb.rotY, mWall);
        }
        // Gap for door openings – skip wall face, door mesh is placed separately
        // (doors are between FLOOR and STORAGE)
      }
    }
  }

  // ── Doors ────────────────────────────────────────────────
  const doorMeshes = [];

  for (const door of mapData.doors) {
    const { col, row, dir } = door;

    // World position of door boundary
    let pivotX, pivotZ, openRotY, closedRotY = 0;
    if (dir === 'S') {
      // Between storage(col,row) [south face] and corridor at row+1
      pivotX   = col * T;
      pivotZ   = (row + 1) * T;
      openRotY = -Math.PI / 2;  // swings into storage (northward)
    } else {
      // dir === 'N': between corridor and storage(col,row) [north face]
      pivotX   = col * T;
      pivotZ   = row * T;
      openRotY = Math.PI / 2;   // swings into storage (southward)
    }

    // Door frame
    const frameW = 0.15;
    const addFrame = (ox, oy, oz, fw, fh, fd) => {
      const fg = new THREE.BoxGeometry(fw, fh, fd);
      const fm = new THREE.Mesh(fg, mDoorFrame);
      fm.position.set(pivotX + ox, oy, pivotZ + oz);
      scene.add(fm);
    };
    // Left post
    addFrame(0,          WH / 2, T / 2, frameW, WH, frameW);
    // Right post
    addFrame(T,          WH / 2, T / 2, frameW, WH, frameW);
    // Top bar
    addFrame(T / 2,      WH,     T / 2, T + frameW * 2, frameW, frameW);

    // Door pivot group
    const pivot = new THREE.Group();
    pivot.position.set(pivotX, 0, pivotZ);

    const dGeo  = new THREE.BoxGeometry(T - 0.1, WH - 0.1, 0.1);
    const dMesh = new THREE.Mesh(dGeo, mDoor);
    dMesh.position.set(T / 2, WH / 2, 0);
    dMesh.castShadow = true;
    pivot.add(dMesh);
    scene.add(pivot);

    door._pivot    = pivot;
    door._openRotY = openRotY;
    doorMeshes.push(door);
  }

  // ── Exit marker geometry ─────────────────────────────────
  const exitGeo  = new THREE.CircleGeometry(T * 0.35, 16);
  const exitMat  = new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 0.8 });
  const exitMesh = new THREE.Mesh(exitGeo, exitMat);
  exitMesh.rotation.x = -Math.PI / 2;
  const et = mapData.exitTile;
  exitMesh.position.set((et.x + 0.5) * T, 0.02, (et.y + 0.5) * T);
  scene.add(exitMesh);

  return { exitMesh };
}

// Animate door open/close (call in game loop)
export function animateDoors(mapData, dt) {
  for (const door of mapData.doors) {
    if (!door._pivot) continue;
    const target = door.open ? door._openRotY : 0;
    door._pivot.rotation.y += (target - door._pivot.rotation.y) * Math.min(1, dt * 8);
  }
}

// Ceiling light flicker
export function flickerLights(scene, lights, t) {
  for (const pl of lights) {
    if (Math.random() < 0.003) {
      pl.intensity = Math.random() < 0.3 ? 0 : 0.15 + Math.random() * 0.1;
    }
  }
}
