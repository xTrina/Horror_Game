// ============================================================
//  MAP GENERATION
//  Layout per block:
//    Col pattern (4 tiles): [S][S][S][X]   (3 storages + 1 cross-corridor)
//    Row pattern (5 tiles): [b][b][c][b][b] (2 back + corridor + 2 back) sides
//  Total: BLOCK_COLS*4+2 wide × BLOCK_ROWS*5+2 tall
//  Storages: BLOCK_ROWS * BLOCK_COLS * 6 = 90
// ============================================================

class GameMap {
  constructor(seed) {
    this.rng   = mulberry32(seed);
    this.cols  = CFG.BLOCK_COLS * 4 + 2;
    this.rows  = CFG.BLOCK_ROWS * 5 + 2;
    this.tiles = [];
    this.storages   = [];   // {x,y,w,h,open,items:[]}
    this.corridors  = [];   // list of walkable {x,y} positions
    this.exitPos    = null;
    this._build();
    this._placeItems();
    this._placeExit();
  }

  _build() {
    const W = this.cols, H = this.rows;
    // Fill with walls
    this.tiles = Array.from({length: H}, () => new Uint8Array(W).fill(T.WALL));

    // For each block-row
    for (let br = 0; br < CFG.BLOCK_ROWS; br++) {
      const rowBase = 1 + br * 5;  // top of this block-row in tile coords
      const corridorRow = rowBase + 2;  // main horizontal corridor

      // Carve main horizontal corridor (full width)
      for (let x = 0; x < W; x++) {
        this.tiles[corridorRow][x] = T.FLOOR;
      }

      // For each block-col
      for (let bc = 0; bc < CFG.BLOCK_COLS; bc++) {
        const colBase = 1 + bc * 4;  // left edge of this block-col

        // Cross-corridor column (col 3 in block = colBase+3)
        const crossCol = colBase + 3;
        for (let y = 1; y < H - 1; y++) {
          this.tiles[y][crossCol] = T.FLOOR;
        }

        // Carve 3 storages per side (top & bottom of corridor)
        for (let si = 0; si < 3; si++) {
          const sx = colBase + si;

          // TOP storage (rows 0..1 of block, door at row 1)
          this.tiles[rowBase    ][sx] = T.STORAGE;
          this.tiles[rowBase + 1][sx] = T.STORAGE;
          // door tile is the corridor tile, but we record the storage
          this.storages.push({
            x: sx, y: rowBase, w: 1, h: 2,
            doorX: sx, doorY: corridorRow,
            open: false, items: [], side: 'top', br, bc, si
          });

          // BOTTOM storage (rows 3..4 of block, door at row 3)
          this.tiles[rowBase + 3][sx] = T.STORAGE;
          this.tiles[rowBase + 4][sx] = T.STORAGE;
          this.storages.push({
            x: sx, y: rowBase + 3, w: 1, h: 2,
            doorX: sx, doorY: corridorRow,
            open: false, items: [], side: 'bottom', br, bc, si
          });
        }
      }
    }

    // Add outer border wall (already walls by default)
    // Connect leftmost column as corridor border
    for (let y = 1; y < H - 1; y++) {
      if (this.tiles[y][1] === T.FLOOR) this.tiles[y][0] = T.FLOOR; // extend corridor edge
    }

    // Build corridors list
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (this.tiles[y][x] === T.FLOOR) {
          this.corridors.push({x, y});
        }
      }
    }
  }

  _placeItems() {
    // Shuffle storages
    const storages = [...this.storages];
    shuffle(storages, this.rng);

    // Place keycard pieces in first 4 storages
    const pieceNames = ['key_A','key_B','key_C','key_D'];
    for (let i = 0; i < CFG.KEYCARD_PIECES; i++) {
      storages[i].items.push({type: 'keycard', id: pieceNames[i]});
    }

    // Scatter slats, nails, other items
    const extras = [];
    for (let i = 0; i < 8; i++)  extras.push({type: CFG.SLAT_ID});
    for (let i = 0; i < 10; i++) extras.push({type: CFG.NAIL_ID});
    for (let i = 0; i < 5; i++)  extras.push({type: 'medicine'});
    for (let i = 0; i < 4; i++)  extras.push({type: 'noise_trap'});

    for (let i = 0; i < extras.length; i++) {
      storages[(i + CFG.KEYCARD_PIECES) % storages.length].items.push(extras[i]);
    }
  }

  _placeExit() {
    // Exit is placed randomly in a corridor near walls
    const candidates = this.corridors.filter(p =>
      (p.x === 1 || p.x === this.cols - 2 || p.y === 1 || p.y === this.rows - 2)
    );
    const pos = candidates[Math.floor(this.rng() * candidates.length)];
    this.exitPos = pos;
    this.tiles[pos.y][pos.x] = T.FLOOR; // stays as floor but marked
  }

  isWalkable(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return false;
    return this.tiles[ty][tx] !== T.WALL;
  }

  isStorage(tx, ty) {
    return this.tiles[ty] && this.tiles[ty][tx] === T.STORAGE;
  }

  getStorageAt(px, py) {
    // px/py in pixels → tile
    const tx = Math.floor(px / CFG.TILE);
    const ty = Math.floor(py / CFG.TILE);
    return this.storages.find(s =>
      tx >= s.x && tx < s.x + s.w && ty >= s.y && ty < s.y + s.h
    ) || null;
  }

  getNearbyStorage(px, py, range = 1.2) {
    const tx = px / CFG.TILE;
    const ty = py / CFG.TILE;
    return this.storages.find(s => {
      const cx = s.x + 0.5;
      const cy = s.y + (s.side === 'top' ? 1.5 : 0.5);
      return Math.hypot(tx - cx, ty - cy) < range;
    }) || null;
  }

  getRandomCorridorPos() {
    const pos = this.corridors[Math.floor(this.rng() * this.corridors.length)];
    return { x: (pos.x + 0.5) * CFG.TILE, y: (pos.y + 0.5) * CFG.TILE };
  }

  isInSafeZone(tx, ty) {
    return this.tiles[ty] && this.tiles[ty][tx] === T.STORAGE;
  }
}

// ─── helpers (global, used by map.js and game.js) ─────────
function mulberry32(seed) {
  return function() {
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
