// ============================================================
//  STORAGE NIGHTMARE – Config & Constants
// ============================================================

// Polyfill roundRect for Safari < 15.4
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    r = Math.min(r, w/2, h/2);
    this.beginPath();
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.arcTo(x + w, y, x + w, y + r, r);
    this.lineTo(x + w, y + h - r);
    this.arcTo(x + w, y + h, x + w - r, y + h, r);
    this.lineTo(x + r, y + h);
    this.arcTo(x, y + h, x, y + h - r, r);
    this.lineTo(x, y + r);
    this.arcTo(x, y, x + r, y, r);
    this.closePath();
    return this;
  };
}

const CFG = {
  // tile
  TILE:       48,
  // map blocks
  BLOCK_ROWS: 3,   // 3 "row-blocks" of storages
  BLOCK_COLS: 5,   // 5 "col-blocks" = 90 storages total
  // movement
  WALK_SPEED:   1.8,
  SPRINT_SPEED: 3.2,
  // flashlight
  FL_RADIUS: 220,
  FL_ANGLE:  Math.PI * 0.38,   // ~68°
  // monsters
  BLIND_SPEED:   1.1,
  DEAF_SPEED:    1.0,
  STALKER_SPEED: 0.7,
  MONSTER_SAFE_DIST: 2.5,      // tiles away from safe-zone entrance
  STUN_DURATION: 180,          // frames
  // items
  KEYCARD_PIECES:  4,
  SLAT_ID:         'slat',
  NAIL_ID:         'nail',
  // sound ranges (in tiles)
  SPRINT_NOISE:    6,
  CRAFT_NOISE:     8,
  DOOR_NOISE:      5,
  // misc
  HEARTBEAT_DIST:  6,          // tiles – start heartbeat
  JUMPSCREEEN_DIST:1.6,        // tiles – trigger jump scare
  FPS_TARGET:      60,
};

// Tile type IDs
const T = {
  WALL:    0,
  FLOOR:   1,   // corridor
  STORAGE: 2,   // interior of a storage unit
  DOOR:    3,   // storage door tile (on corridor side)
};

// Monster type IDs
const M = {
  BLIND:   'blind',
  DEAF:    'deaf',
  STALKER: 'stalker',
};
