import { CFG, TILE_TYPE as TT } from './config.js';

// ── seeded RNG ────────────────────────────────────────────
export function rng32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ── Map generation ────────────────────────────────────────
// Layout:
//   BLOCK_COLS blocks wide, each block = 3 storage cols + 1 cross-corridor (4 tiles)
//   BLOCK_ROWS blocks tall, each block = 2 storage (top) + 1 corridor + 2 storage (bot) = 5 tiles
//   Plus 1-tile outer wall on each side.
//   Total 90 storage units.

export class MapData {
  constructor(seed) {
    this.rng  = rng32(seed);
    this.cols = CFG.BLOCK_COLS * 4 + 2;
    this.rows = CFG.BLOCK_ROWS * 5 + 2;
    this.grid = [];
    this.storages = [];   // {tileX, tileY, w:1, h:2, side:'top'|'bot', doorCol, doorRow}
    this.doors    = [];   // {col, row, dir:'N'|'S', open:false, locked:false, storageIdx}
    this.items    = [];   // {tileX, tileY, type, id?}
    this.exitTile = null;
    this._build();
    this._placeDoors();
    this._placeItems();
    this._placeExit();
  }

  _build() {
    const { cols, rows } = this;
    this.grid = Array.from({ length: rows }, () => new Uint8Array(cols).fill(TT.WALL));

    for (let br = 0; br < CFG.BLOCK_ROWS; br++) {
      const base = 1 + br * 5;
      const corrRow = base + 2;

      // full horizontal corridor
      for (let x = 0; x < cols; x++) this.grid[corrRow][x] = TT.FLOOR;

      for (let bc = 0; bc < CFG.BLOCK_COLS; bc++) {
        const colBase = 1 + bc * 4;
        const crossCol = colBase + 3;

        // vertical cross-corridor
        for (let y = 1; y < rows - 1; y++) this.grid[y][crossCol] = TT.FLOOR;

        for (let si = 0; si < 3; si++) {
          const sx = colBase + si;
          // top storage (rows base, base+1)
          this.grid[base    ][sx] = TT.STORAGE;
          this.grid[base + 1][sx] = TT.STORAGE;
          this.storages.push({ tileX: sx, tileY: base, w: 1, h: 2, side: 'top', corrRow });

          // bottom storage (rows base+3, base+4)
          this.grid[base + 3][sx] = TT.STORAGE;
          this.grid[base + 4][sx] = TT.STORAGE;
          this.storages.push({ tileX: sx, tileY: base + 3, w: 1, h: 2, side: 'bot', corrRow });
        }
      }
    }
  }

  _placeDoors() {
    // Each storage has one door at the corridor boundary
    this.storages.forEach((s, idx) => {
      if (s.side === 'top') {
        // Storage rows s.tileY, s.tileY+1. Corridor is at s.corrRow = s.tileY+2.
        // Door boundary: between row s.tileY+1 (storage) and s.corrRow (floor)
        // → south face of storage tile (s.tileX, s.tileY+1), i.e. at z = (s.corrRow)*TILE
        this.doors.push({ col: s.tileX, row: s.tileY + 1, dir: 'S', open: false, locked: false, storageIdx: idx });
      } else {
        // Bottom storage: rows s.tileY, s.tileY+1. Corridor at s.corrRow = s.tileY-2.
        // Actually s.corrRow = base+2 and s.tileY = base+3
        // Door: between corridor (s.tileY-1 = corrRow) and storage (s.tileY)
        // → north face of storage tile (s.tileX, s.tileY), at z = s.tileY*TILE
        this.doors.push({ col: s.tileX, row: s.tileY, dir: 'N', open: false, locked: false, storageIdx: idx });
      }
    });
  }

  _placeItems() {
    const stCopy = [...this.storages];
    shuffle(stCopy, this.rng);

    const keycards = ['key_A', 'key_B', 'key_C', 'key_D'];
    keycards.forEach((id, i) => {
      const s = stCopy[i];
      this.items.push({ tileX: s.tileX, tileY: s.tileY, type: 'keycard', id });
    });

    const extras = [
      ...Array(6).fill('slat'),
      ...Array(8).fill('nail'),
      ...Array(4).fill('medicine'),
      ...Array(3).fill('noise_trap'),
    ];
    extras.forEach((type, i) => {
      const s = stCopy[(i + 4) % stCopy.length];
      this.items.push({ tileX: s.tileX, tileY: s.tileY + 1, type });
    });
  }

  _placeExit() {
    // Place exit at a random corridor tile near the map edge
    const edge = [];
    for (let x = 1; x < this.cols - 1; x++) {
      if (this.grid[1][x] === TT.FLOOR) edge.push({ x, y: 1 });
      if (this.grid[this.rows - 2][x] === TT.FLOOR) edge.push({ x, y: this.rows - 2 });
    }
    this.exitTile = edge[Math.floor(this.rng() * edge.length)];
  }

  isWalkable(col, row) {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return false;
    return this.grid[row][col] !== TT.WALL;
  }

  isStorage(col, row) {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return false;
    return this.grid[row][col] === TT.STORAGE;
  }

  // Returns the door object blocking the boundary between (col,row) and its
  // northern / southern neighbor, or null.
  getDoorAt(col, row, dir) {
    return this.doors.find(d => d.col === col && d.row === row && d.dir === dir) || null;
  }

  // All corridor tile centres (world XZ)
  corridorCentres() {
    const out = [];
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++)
        if (this.grid[r][c] === TT.FLOOR)
          out.push({ x: (c + 0.5) * CFG.TILE, z: (r + 0.5) * CFG.TILE });
    return out;
  }

  randomCorridorPos(rng) {
    const cc = this.corridorCentres();
    return cc[Math.floor(rng() * cc.length)];
  }
}
