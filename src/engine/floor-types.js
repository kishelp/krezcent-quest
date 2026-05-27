// Floor type generators. Each is built with its own dedicated algorithm —
// shape, layout, and feel are designed per-type rather than variants of a maze.
//
// Each generator returns:
//   { grid, W, H, monsters, chests, decorations, hazards,
//     bossX, bossY, boss: { defeated: false }, type, intro,
//     spawn: { x, y },  // pixel coords for player start
//     fogOfWar: boolean,
//     rooms: [{ x, y, w, h }]  // optional, used for LOS reveal
//   }
//
// Tile values:
//   0 = floor, 1 = wall, 2 = water, 3 = lava, 4 = grass, 5 = bridge,
//   6 = sand, 7 = stone-tile, 8 = trap floor (cracked), 9 = door, 10 = grave,
//   11 = pit edge.

import { pickMonsterType } from '../data/monsters.js';
import { rand, pick } from './helpers.js';

const W = 27, H = 27;

// ---------- Themes ----------
export const THEMES = {
  shadow:  { name: 'Shadow Halls',  wall: '#2d1b3e', floor: '#1a0f24', accent: '#3d2754', bg: '#0a0612' },
  crypt:   { name: 'Crypt of Bones', wall: '#3e2a3a', floor: '#221820', accent: '#5d4054', bg: '#100810' },
  cavern:  { name: 'Cavern Depths', wall: '#4e342e', floor: '#3e2723', accent: '#6d4c41', bg: '#1a0d08' },
  nature:  { name: 'Verdant Grove', wall: '#2e5d2a', floor: '#3a6b2c', accent: '#558b2f', bg: '#0e2a08' },
  azure:   { name: 'Sunken Halls',  wall: '#1565c0', floor: '#0d47a1', accent: '#1976d2', bg: '#04132a' },
  glacial: { name: 'Frozen Caves',  wall: '#0277bd', floor: '#01579b', accent: '#0288d1', bg: '#021a30' },
  storm:   { name: 'Storm Plateau', wall: '#1a237e', floor: '#283593', accent: '#3949ab', bg: '#0a0e30' },
  magma:   { name: 'Magma Hollow',  wall: '#bf360c', floor: '#5d1f08', accent: '#d84315', bg: '#1a0500' },
  void:    { name: 'Void Reaches',  wall: '#311b92', floor: '#1a0d5e', accent: '#4527a0', bg: '#0a0224' },
};

import { floorTheme as _floorTheme, floorLayout as _floorLayout } from '../data/floors.js';

export function themeForFloor(f) {
  return _floorTheme(f);
}

// ---------- Small helpers ----------
function emptyGrid(fill = 1) {
  return Array.from({ length: H }, () => Array(W).fill(fill));
}
function inBounds(x, y) { return x > 0 && y > 0 && x < W - 1 && y < H - 1; }
function isWalkableTile(t) {
  return t === 0 || t === 4 || t === 5 || t === 6 || t === 7 || t === 8 || t === 9 || t === 10;
}
function isOpen(g, x, y) {
  if (!inBounds(x, y)) return false;
  return isWalkableTile(g[y][x]);
}

function placeMonsters(g, count, floor, blocked = []) {
  const monsters = [];
  const used = new Set(blocked.map(p => `${p.x},${p.y}`));
  let tries = 0;
  while (monsters.length < count && tries < 1200) {
    tries++;
    const x = 1 + Math.floor(rand() * (W - 2));
    const y = 1 + Math.floor(rand() * (H - 2));
    if (!isOpen(g, x, y)) continue;
    const k = `${x},${y}`;
    if (used.has(k)) continue;
    used.add(k);
    monsters.push({ x, y, type: pickMonsterType(floor), id: Math.random().toString(36).slice(2) });
  }
  return monsters;
}

function placeChests(g, count, blocked = []) {
  const chests = [];
  const used = new Set(blocked.map(p => `${p.x},${p.y}`));
  let tries = 0;
  while (chests.length < count && tries < 600) {
    tries++;
    const x = 1 + Math.floor(rand() * (W - 2));
    const y = 1 + Math.floor(rand() * (H - 2));
    if (!isOpen(g, x, y)) continue;
    const k = `${x},${y}`;
    if (used.has(k)) continue;
    used.add(k);
    chests.push({ x, y, opened: false });
  }
  return chests;
}

function makeTrap(kind, x, y, payload = {}) {
  return { kind, x, y, hidden: true, triggered: false, cooldown: 0, telegraph: 0, ...payload };
}
function trapDmg(floor) { return Math.floor(15 * (1 + floor * 0.12)); }

function findFirstOpen(g) {
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (isOpen(g, x, y)) return { x, y };
    }
  }
  return { x: 1, y: 1 };
}

function tileCenterPx(tileX, tileY) {
  return { x: tileX * 40 + 20, y: tileY * 40 + 20 };
}

// ---------- 1. MAZE ----------
// Classic recursive-backtracker corridors. Tight twisty paths.
function genMaze(floor) {
  const g = emptyGrid(1);
  function carve(x, y) {
    g[y][x] = 0;
    const dirs = [[0, -2], [2, 0], [0, 2], [-2, 0]].sort(() => rand() - 0.5);
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (inBounds(nx, ny) && g[ny][nx] === 1) {
        g[y + dy / 2][x + dx / 2] = 0;
        carve(nx, ny);
      }
    }
  }
  carve(1, 1);
  // Boss alcove in far corner
  for (let y = H - 5; y < H - 1; y++) for (let x = W - 5; x < W - 1; x++) g[y][x] = 0;
  g[H - 6][W - 3] = 0;
  const bossX = W - 3, bossY = H - 3;
  const spawn = tileCenterPx(1, 1);
  const monsters = placeMonsters(g, Math.min(7 + Math.floor(floor / 3), 18), floor, [{ x: 1, y: 1 }, { x: bossX, y: bossY }]);
  const chests = placeChests(g, Math.max(2, Math.min(2 + Math.floor(floor / 8), 6)));
  return {
    grid: g, W, H, monsters, chests, decorations: scatterTorches(g, 0.05),
    hazards: [], bossX, bossY, boss: { defeated: false },
    type: 'maze', intro: 'A twisting maze. Find the boss alcove in the far corner.',
    spawn, fogOfWar: false,
  };
}

// ---------- 2. CRYPT ----------
// Long parallel halls connected by perpendicular crossways, lined with grave markers.
// Boss in the deepest hall. Fog of war: only see the hall you're in.
function genCrypt(floor) {
  const g = emptyGrid(1);
  // Carve 4 long horizontal halls (each 3 wide)
  const hallYs = [4, 10, 16, 22];
  for (const hy of hallYs) {
    for (let x = 2; x < W - 2; x++) {
      g[hy][x] = 0; g[hy + 1][x] = 0;
    }
  }
  // Connect halls with vertical passages
  const verts = [4, 12, 20];
  for (const vx of verts) {
    for (let y = 4; y <= 23; y++) g[y][vx] = 0;
  }
  // Add grave markers along the walls between halls
  for (const hy of hallYs) {
    for (let x = 3; x < W - 3; x += 2) {
      if (g[hy - 1][x] === 1 && rand() < 0.6) g[hy - 1][x] = 10; // grave
      if (g[hy + 2][x] === 1 && rand() < 0.6) g[hy + 2][x] = 10;
    }
  }
  // Doors at hall ends
  g[4][2] = 9; g[22][W - 3] = 9;
  const spawn = tileCenterPx(3, 4);
  const bossX = W - 4, bossY = 22;
  const monsters = placeMonsters(g, Math.min(8 + Math.floor(floor / 3), 18), floor, [{ x: 3, y: 4 }, { x: bossX, y: bossY }]);
  const chests = placeChests(g, 3);
  // Rooms for LOS: each hall is a room
  const rooms = hallYs.map(hy => ({ x: 2, y: hy, w: W - 4, h: 2 }));
  return {
    grid: g, W, H, monsters, chests,
    decorations: scatterTorches(g, 0.08),
    hazards: [],
    bossX, bossY, boss: { defeated: false },
    type: 'crypt', intro: 'A crypt of forgotten heroes. Move through the halls — the boss waits at the far end.',
    spawn, fogOfWar: true, rooms,
  };
}

// ---------- 3. CAVE NETWORK ----------
// Several round chambers connected by ONE chosen corridor each — but extra dead-end
// corridors also exist. Player must explore to find the real path. Boss in the
// farthest chamber. Fog of war hides unexplored chambers.
function genCave(floor) {
  const g = emptyGrid(1);
  // Plant 5-6 rooms at semi-random positions
  const roomCount = 5 + Math.floor(rand() * 2);
  const rooms = [];
  const targets = [
    { cx: 4, cy: 4 },
    { cx: W - 5, cy: 4 },
    { cx: 4, cy: H - 5 },
    { cx: W - 5, cy: H - 5 },
    { cx: Math.floor(W / 2), cy: Math.floor(H / 2) },
    { cx: Math.floor(W / 2), cy: 5 },
  ];
  for (let i = 0; i < roomCount; i++) {
    const t = targets[i];
    const r = 2 + Math.floor(rand() * 2);
    rooms.push({ cx: t.cx, cy: t.cy, r });
    // Carve circular room
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          const nx = t.cx + dx, ny = t.cy + dy;
          if (inBounds(nx, ny)) g[ny][nx] = 0;
        }
      }
    }
  }
  // Choose a "true path" by connecting rooms in a chain: 0 -> 1 -> ... -> last
  // The last room is the boss room. Player starts in room 0.
  // ALSO carve some dead-end branches off the corridors.
  function carveCorridor(ax, ay, bx, by) {
    let x = ax, y = ay;
    while (x !== bx) {
      g[y][x] = 0;
      if (inBounds(x, y + 1)) g[y + 1][x] = 0;
      x += x < bx ? 1 : -1;
    }
    while (y !== by) {
      g[y][x] = 0;
      if (inBounds(x + 1, y)) g[y][x + 1] = 0;
      y += y < by ? 1 : -1;
    }
    g[y][x] = 0;
  }
  for (let i = 0; i < rooms.length - 1; i++) {
    carveCorridor(rooms[i].cx, rooms[i].cy, rooms[i + 1].cx, rooms[i + 1].cy);
  }
  // Dead-end branches: from the first 2 corridors, branch out short stubs that lead nowhere
  for (let i = 0; i < 2; i++) {
    const room = rooms[i];
    const stubLen = 4 + Math.floor(rand() * 3);
    const stubDir = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    let sx = room.cx + stubDir[0] * (room.r + 1);
    let sy = room.cy + stubDir[1] * (room.r + 1);
    for (let s = 0; s < stubLen; s++) {
      if (!inBounds(sx, sy)) break;
      g[sy][sx] = 0;
      sx += stubDir[0]; sy += stubDir[1];
    }
  }
  const start = rooms[0];
  const last = rooms[rooms.length - 1];
  const spawn = tileCenterPx(start.cx, start.cy);
  const bossX = last.cx, bossY = last.cy;
  const monsters = placeMonsters(g, Math.min(8 + Math.floor(floor / 3), 20), floor, [{ x: start.cx, y: start.cy }, { x: bossX, y: bossY }]);
  // Place a chest in each mid-chain room
  const chests = [];
  for (let i = 1; i < rooms.length - 1; i++) {
    if (rand() < 0.6) chests.push({ x: rooms[i].cx, y: rooms[i].cy + 1, opened: false });
  }
  const fogRooms = rooms.map(r => ({ x: r.cx - r.r, y: r.cy - r.r, w: r.r * 2 + 1, h: r.r * 2 + 1 }));
  return {
    grid: g, W, H, monsters, chests, decorations: scatterTorches(g, 0.04),
    hazards: [],
    bossX, bossY, boss: { defeated: false },
    type: 'cave', intro: 'Branching caves. Some passages lead nowhere — find the right path to the boss.',
    spawn, fogOfWar: true, rooms: fogRooms,
  };
}

// ---------- 4. PILLARED HALL ----------
// Single huge rectangular hall with regular rows of fat columns. Long sight-lines.
function genPillarHall(floor) {
  const g = emptyGrid(0);
  // Border
  for (let x = 0; x < W; x++) { g[0][x] = 1; g[H - 1][x] = 1; }
  for (let y = 0; y < H; y++) { g[y][0] = 1; g[y][W - 1] = 1; }
  // Pillar grid: 2x2 pillars at regular intervals
  for (let py = 5; py < H - 4; py += 5) {
    for (let px = 5; px < W - 4; px += 5) {
      g[py][px] = 1; g[py][px + 1] = 1;
      g[py + 1][px] = 1; g[py + 1][px + 1] = 1;
    }
  }
  const spawn = tileCenterPx(2, 2);
  const bossX = W - 4, bossY = H - 4;
  // Clear boss area
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (inBounds(bossX + dx, bossY + dy)) g[bossY + dy][bossX + dx] = 0;
  }
  const monsters = placeMonsters(g, Math.min(10 + Math.floor(floor / 3), 22), floor, [{ x: 2, y: 2 }, { x: bossX, y: bossY }]);
  const chests = placeChests(g, 3);
  return {
    grid: g, W, H, monsters, chests, decorations: scatterTorches(g, 0.1),
    hazards: [],
    bossX, bossY, boss: { defeated: false },
    type: 'hall', intro: 'A grand columned hall. Use the pillars for cover.',
    spawn, fogOfWar: false,
  };
}

// ---------- 5. OPEN ARENA ----------
// Wide circular arena with NO interior walls, just a curved boundary. Pure
// combat space. Boss in the center, monsters scattered.
function genArena(floor) {
  const g = emptyGrid(1);
  const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
  const radius = Math.min(cx, cy) - 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= radius) g[y][x] = 7; // stone tile floor
    }
  }
  // Ring boundary: anything within 0.7 of the radius edge becomes wall
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > radius - 0.5 && d <= radius + 0.5) g[y][x] = 1;
    }
  }
  // Place 4 brazier decorations evenly around
  const decorations = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const tx = Math.round(cx + Math.cos(a) * (radius - 4));
    const ty = Math.round(cy + Math.sin(a) * (radius - 4));
    decorations.push({ x: tx, y: ty, type: 'torch' });
  }
  const spawn = tileCenterPx(cx - radius + 3, cy);
  const bossX = cx, bossY = cy;
  const monsters = placeMonsters(g, Math.min(8 + Math.floor(floor / 3), 18), floor, [{ x: cx, y: cy }]);
  const chests = placeChests(g, 2);
  return {
    grid: g, W, H, monsters, chests, decorations,
    hazards: [],
    bossX, bossY, boss: { defeated: false },
    type: 'arena', intro: 'A circular combat arena. No cover, no escape. Just you and them.',
    spawn, fogOfWar: false,
  };
}

// ---------- 6. RIVER CROSSING ----------
// Three horizontal water bands with sparse bridges. Player works from top to bottom.
function genRiver(floor) {
  const g = emptyGrid(0);
  for (let x = 0; x < W; x++) { g[0][x] = 1; g[H - 1][x] = 1; }
  for (let y = 0; y < H; y++) { g[y][0] = 1; g[y][W - 1] = 1; }
  const rivers = [7, 14, 21];
  for (const ry of rivers) {
    for (let x = 1; x < W - 1; x++) { g[ry][x] = 2; g[ry + 1][x] = 2; }
    // Two bridges per river at random columns
    const bridgeXs = new Set();
    while (bridgeXs.size < 2) bridgeXs.add(3 + Math.floor(rand() * (W - 6)));
    for (const bx of bridgeXs) { g[ry][bx] = 5; g[ry + 1][bx] = 5; }
  }
  // Boss area near the bottom — clear it
  const bossX = W - 4, bossY = H - 4;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (inBounds(bossX + dx, bossY + dy) && g[bossY + dy][bossX + dx] === 2) g[bossY + dy][bossX + dx] = 0;
    if (inBounds(bossX + dx, bossY + dy) && g[bossY + dy][bossX + dx] !== 5) g[bossY + dy][bossX + dx] = 0;
  }
  const spawn = tileCenterPx(2, 2);
  // Don't spawn monsters on water
  const waterTiles = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === 2) waterTiles.push({ x, y });
  const monsters = placeMonsters(g, Math.min(8 + Math.floor(floor / 3), 16), floor, [{ x: 2, y: 2 }, { x: bossX, y: bossY }, ...waterTiles]);
  const chests = placeChests(g, 3, waterTiles);
  return {
    grid: g, W, H, monsters, chests, decorations: [],
    hazards: [],
    bossX, bossY, boss: { defeated: false },
    type: 'river', intro: 'Three rivers split this floor. Find the bridges.',
    spawn, fogOfWar: false,
  };
}

// ---------- 7. MAGMA CHAMBER ----------
// Large open room flooded with lava, with a network of safe "stone island" platforms
// connected by narrow walkways. Fire vents scattered. Fog of war for tension.
function genMagma(floor) {
  const g = emptyGrid(3); // start everything as lava
  // Border walls
  for (let x = 0; x < W; x++) { g[0][x] = 1; g[H - 1][x] = 1; }
  for (let y = 0; y < H; y++) { g[y][0] = 1; g[y][W - 1] = 1; }
  // Carve 6-8 stone "islands"
  const islands = [];
  const islandCount = 6 + Math.floor(rand() * 3);
  const attempts = 30;
  for (let i = 0; i < attempts && islands.length < islandCount; i++) {
    const cx = 3 + Math.floor(rand() * (W - 6));
    const cy = 3 + Math.floor(rand() * (H - 6));
    const r = 2 + Math.floor(rand() * 2);
    // Avoid overlap with existing islands
    let ok = true;
    for (const isl of islands) if (Math.hypot(isl.cx - cx, isl.cy - cy) < isl.r + r + 1) { ok = false; break; }
    if (!ok) continue;
    islands.push({ cx, cy, r });
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          const nx = cx + dx, ny = cy + dy;
          if (inBounds(nx, ny)) g[ny][nx] = 7; // stone tile
        }
      }
    }
  }
  // Connect islands with narrow walkways (1 tile wide)
  for (let i = 0; i < islands.length - 1; i++) {
    let x = islands[i].cx, y = islands[i].cy;
    const tx = islands[i + 1].cx, ty = islands[i + 1].cy;
    while (x !== tx) { g[y][x] = 7; x += x < tx ? 1 : -1; }
    while (y !== ty) { g[y][x] = 7; y += y < ty ? 1 : -1; }
  }
  // Fire vent traps on a few islands (visible burnt tiles, but trap stays hidden until stepped on)
  const hazards = [];
  for (let i = 1; i < islands.length - 1; i++) {
    if (rand() < 0.7) {
      const isl = islands[i];
      hazards.push(makeTrap('firevent', isl.cx, isl.cy, { dmg: trapDmg(floor), cycle: 2.5 }));
    }
  }
  const spawn = tileCenterPx(islands[0].cx, islands[0].cy);
  const lastIsl = islands[islands.length - 1];
  const bossX = lastIsl.cx, bossY = lastIsl.cy;
  // Expand boss island
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (inBounds(bossX + dx, bossY + dy)) g[bossY + dy][bossX + dx] = 7;
  }
  const lavaTiles = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === 3) lavaTiles.push({ x, y });
  const monsters = placeMonsters(g, Math.min(7 + Math.floor(floor / 3), 16), floor, [{ x: islands[0].cx, y: islands[0].cy }, { x: bossX, y: bossY }, ...lavaTiles]);
  const chests = placeChests(g, 2, lavaTiles);
  const rooms = islands.map(isl => ({ x: isl.cx - isl.r, y: isl.cy - isl.r, w: isl.r * 2 + 1, h: isl.r * 2 + 1 }));
  return {
    grid: g, W, H, monsters, chests, decorations: [],
    hazards,
    bossX, bossY, boss: { defeated: false },
    type: 'magma', intro: 'Stone islands in a sea of lava. Stay on the path.',
    spawn, fogOfWar: true, rooms,
  };
}

// ---------- 8. STORM PLATEAU ----------
// Open windswept plateau — almost no walls, just scattered rocks. Lightning strikes
// constantly from the sky (warning circles fall first). High visibility but high danger.
function genStorm(floor) {
  const g = emptyGrid(0);
  for (let x = 0; x < W; x++) { g[0][x] = 1; g[H - 1][x] = 1; }
  for (let y = 0; y < H; y++) { g[y][0] = 1; g[y][W - 1] = 1; }
  // A few rock obstacles scattered as cover
  for (let i = 0; i < 12; i++) {
    const x = 2 + Math.floor(rand() * (W - 4));
    const y = 2 + Math.floor(rand() * (H - 4));
    g[y][x] = 1;
    if (rand() < 0.4) g[y][x + 1] = 1;
  }
  const spawn = tileCenterPx(2, 2);
  const bossX = W - 4, bossY = H - 4;
  // Clear boss area
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (inBounds(bossX + dx, bossY + dy)) g[bossY + dy][bossX + dx] = 0;
  }
  const monsters = placeMonsters(g, Math.min(8 + Math.floor(floor / 3), 20), floor, [{ x: 2, y: 2 }, { x: bossX, y: bossY }]);
  const chests = placeChests(g, 3);
  return {
    grid: g, W, H, monsters, chests, decorations: [],
    hazards: [], // lightning spawns dynamically — see updateHazards
    bossX, bossY, boss: { defeated: false },
    type: 'storm', intro: 'A windswept plateau. Lightning falls from above — watch for warning circles.',
    spawn, fogOfWar: false, stormTimer: 0,
  };
}

// ---------- 9. GARDEN ----------
// Lush open garden with grass tiles, decorative bush walls, and healing flowers.
// Combat-friendly with periodic safe spots.
function genGarden(floor) {
  const g = emptyGrid(4); // grass everywhere
  for (let x = 0; x < W; x++) { g[0][x] = 1; g[H - 1][x] = 1; }
  for (let y = 0; y < H; y++) { g[y][0] = 1; g[y][W - 1] = 1; }
  // Hedge clusters
  for (let i = 0; i < 14; i++) {
    const x = 3 + Math.floor(rand() * (W - 6));
    const y = 3 + Math.floor(rand() * (H - 6));
    g[y][x] = 1;
    if (rand() < 0.5) g[y][x + 1] = 1;
    if (rand() < 0.5) g[y + 1][x] = 1;
  }
  const spawn = tileCenterPx(2, 2);
  const bossX = W - 4, bossY = H - 4;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (inBounds(bossX + dx, bossY + dy)) g[bossY + dy][bossX + dx] = 4;
  }
  const monsters = placeMonsters(g, Math.min(8 + Math.floor(floor / 3), 20), floor, [{ x: 2, y: 2 }, { x: bossX, y: bossY }]);
  const chests = placeChests(g, 3);
  // Healing flowers
  const hazards = [];
  for (let i = 0; i < 5; i++) {
    let tries = 0;
    while (tries++ < 50) {
      const x = 2 + Math.floor(rand() * (W - 4));
      const y = 2 + Math.floor(rand() * (H - 4));
      if (g[y][x] === 4) {
        hazards.push({ kind: 'healflower', x, y, hidden: false, triggered: false, heal: 0.15 });
        break;
      }
    }
  }
  return {
    grid: g, W, H, monsters, chests, decorations: [],
    hazards,
    bossX, bossY, boss: { defeated: false },
    type: 'garden', intro: 'A wild garden. Glowing flowers will heal you when you step on them.',
    spawn, fogOfWar: false,
  };
}

// ---------- 10. GAUNTLET ----------
// Hand-crafted linear corridor 3 tiles wide, snaking through the map with
// hidden traps every few steps. Linear path, no branches. Fog of war for tension.
function genGauntlet(floor) {
  const g = emptyGrid(1);
  // Carve a hand-crafted S-path, ensuring the carve order matches the play order.
  const path = [];
  // Segment 1: across the top going right
  for (let x = 2; x < W - 2; x++) path.push({ x, y: 3 });
  // Segment 2: down on the right side
  for (let y = 4; y < 11; y++) path.push({ x: W - 4, y });
  // Segment 3: across going left
  for (let x = W - 4; x >= 3; x--) path.push({ x, y: 11 });
  // Segment 4: down on the left
  for (let y = 12; y < 19; y++) path.push({ x: 3, y });
  // Segment 5: across going right
  for (let x = 3; x < W - 2; x++) path.push({ x, y: 19 });
  // Segment 6: down to boss room
  for (let y = 20; y < H - 3; y++) path.push({ x: W - 4, y });

  // Carve 3-wide corridor around the centerline path
  for (const p of path) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = p.x + dx, ny = p.y + dy;
        if (inBounds(nx, ny)) g[ny][nx] = 0;
      }
    }
  }
  // Boss room at the very end — a 5x5 chamber
  const last = path[path.length - 1];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (inBounds(last.x + dx, last.y + dy)) g[last.y + dy][last.x + dx] = 0;
  }
  const bossX = last.x, bossY = last.y;
  // Spawn at the BEGINNING of the path, guaranteed walkable
  const start = path[0];
  const spawn = tileCenterPx(start.x, start.y);
  // Scatter traps along the path (skip first 5 tiles so the player isn't insta-killed)
  const hazards = [];
  for (let i = 5; i < path.length - 5; i += 1 + Math.floor(rand() * 3)) {
    const p = path[i];
    const kind = pick(['spike', 'arrow', 'firevent']);
    if (kind === 'spike') hazards.push(makeTrap('spike', p.x, p.y, { dmg: trapDmg(floor) }));
    else if (kind === 'arrow') hazards.push(makeTrap('arrow', p.x, p.y, { dmg: trapDmg(floor), dir: pick([0, 1, 2, 3]) }));
    else hazards.push(makeTrap('firevent', p.x, p.y, { dmg: trapDmg(floor), cycle: 2.5 }));
  }
  // Mark trap tiles as cracked floor (8) so they're visible AFTER triggering — but the
  // hazard data stays hidden until stepped on. We draw cracked tiles in render.
  // (We don't change the grid here — the hazard hidden flag handles reveal logic.)
  // Monsters at chokepoints along the path
  const monsters = [];
  const monsterCount = Math.min(6 + Math.floor(floor / 4), 12);
  const monsterStep = Math.floor(path.length / (monsterCount + 1));
  for (let i = 1; i <= monsterCount; i++) {
    const p = path[i * monsterStep];
    if (p) monsters.push({ x: p.x, y: p.y, type: pickMonsterType(floor), id: Math.random().toString(36).slice(2) });
  }
  // 1 chest tucked partway in
  const midPoint = path[Math.floor(path.length / 2)];
  const chests = [{ x: midPoint.x, y: midPoint.y - 1, opened: false }];
  // Rooms for fog: chunks of the path
  const rooms = [];
  for (let i = 0; i < path.length; i += 6) {
    const p = path[i];
    rooms.push({ x: p.x - 2, y: p.y - 2, w: 5, h: 5 });
  }
  return {
    grid: g, W, H, monsters, chests, decorations: scatterTorches(g, 0.12),
    hazards,
    bossX, bossY, boss: { defeated: false },
    type: 'gauntlet', intro: 'A narrow gauntlet riddled with hidden traps. Move carefully.',
    spawn, fogOfWar: true, rooms,
  };
}

// ---------- 11. BOSS ARENA (every 10th floor) ----------
// Wide stone chamber. Just the boss and a few summons, no clutter.
function genBossArena(floor) {
  const g = emptyGrid(0);
  for (let x = 0; x < W; x++) { g[0][x] = 1; g[H - 1][x] = 1; }
  for (let y = 0; y < H; y++) { g[y][0] = 1; g[y][W - 1] = 1; }
  // Stone tile floor everywhere inside
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) g[y][x] = 7;
  // Decorative corner pillars
  for (const [px, py] of [[4, 4], [W - 5, 4], [4, H - 5], [W - 5, H - 5]]) {
    g[py][px] = 1; g[py][px + 1] = 1;
    g[py + 1][px] = 1; g[py + 1][px + 1] = 1;
  }
  const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
  const spawn = tileCenterPx(2, cy);
  const bossX = cx, bossY = cy;
  const monsters = placeMonsters(g, 3 + Math.floor(floor / 15), floor, [{ x: 2, y: cy }, { x: bossX, y: bossY }]);
  const chests = placeChests(g, 2);
  return {
    grid: g, W, H, monsters, chests, decorations: scatterTorches(g, 0.08),
    hazards: [],
    bossX, bossY, boss: { defeated: false },
    type: 'boss_arena', intro: 'A grand chamber. The boss waits at the center.',
    spawn, fogOfWar: false,
  };
}

// ---------- Torch decoration helper ----------
function scatterTorches(g, density = 0.06) {
  const decs = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (g[y][x] === 1 && g[y + 1] && isWalkableTile(g[y + 1][x]) && rand() < density) {
        decs.push({ x, y, type: 'torch' });
      }
    }
  }
  return decs;
}

// ---------- Dispatcher ----------
// Boss arena every 10 floors. Otherwise cycle through 10 unique types by tier.
const NON_BOSS_GENS = [
  genMaze, genCrypt, genCave, genPillarHall, genArena,
  genRiver, genMagma, genStorm, genGarden, genGauntlet,
];
const NON_BOSS_NAMES = ['maze', 'crypt', 'cave', 'hall', 'arena', 'river', 'magma', 'storm', 'garden', 'gauntlet'];

export function pickFloorType(floor) {
  if (floor % 10 === 0) return 'boss_arena';
  const layout = _floorLayout(floor);
  return NON_BOSS_NAMES.includes(layout) ? layout : 'maze';
}

export function generateFloorOfType(type, floor) {
  const theme = themeForFloor(floor);
  let res;
  if (type === 'boss_arena') res = genBossArena(floor);
  else {
    const idx = NON_BOSS_NAMES.indexOf(type);
    res = (idx >= 0 ? NON_BOSS_GENS[idx] : genMaze)(floor);
  }
  res.theme = theme;
  // Fallback: if for some reason the spawn tile is a wall, find a safe spot.
  if (res.spawn) {
    const gx = Math.floor(res.spawn.x / 40), gy = Math.floor(res.spawn.y / 40);
    if (!isOpen(res.grid, gx, gy)) {
      const safe = findFirstOpen(res.grid);
      res.spawn = tileCenterPx(safe.x, safe.y);
    }
  }
  // Initialize fog if applicable: revealed tiles set, starts with spawn-area
  if (res.fogOfWar) {
    res.revealed = new Set();
    // Reveal a small area around spawn
    const sx = Math.floor(res.spawn.x / 40), sy = Math.floor(res.spawn.y / 40);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const nx = sx + dx, ny = sy + dy;
      if (inBounds(nx, ny)) res.revealed.add(`${nx},${ny}`);
    }
  }
  return res;
}

export function generateFloor(floor) {
  return generateFloorOfType(pickFloorType(floor), floor);
}

// ---------- Fog-of-war update ----------
// Reveal tiles within `radius` of the player's tile, and reveal a whole room
// if the player enters one. Returns nothing — mutates state.revealed.
export function updateFog(state, playerTileX, playerTileY, radius = 5) {
  if (!state.fogOfWar || !state.revealed) return;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const nx = playerTileX + dx, ny = playerTileY + dy;
      if (nx < 0 || ny < 0 || nx >= state.W || ny >= state.H) continue;
      state.revealed.add(`${nx},${ny}`);
    }
  }
  // Whole-room reveal
  if (state.rooms) {
    for (const r of state.rooms) {
      if (playerTileX >= r.x && playerTileX < r.x + r.w &&
          playerTileY >= r.y && playerTileY < r.y + r.h) {
        for (let y = r.y - 1; y <= r.y + r.h; y++) {
          for (let x = r.x - 1; x <= r.x + r.w; x++) {
            if (x < 0 || y < 0 || x >= state.W || y >= state.H) continue;
            state.revealed.add(`${x},${y}`);
          }
        }
      }
    }
  }
}

// ---------- Live hazard updates ----------
export function updateHazards(state, dt, playerTileX, playerTileY, playerPxX, playerPxY) {
  const events = [];
  if (!state) return events;

  // Storm-field: spawn lightning warnings near the player
  if (state.type === 'storm') {
    state.stormTimer = (state.stormTimer || 0) - dt;
    if (state.stormTimer <= 0) {
      state.stormTimer = 1.6 + rand() * 1.4;
      const count = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i++) {
        const tx = clampTile(playerTileX + Math.floor((rand() - 0.5) * 10));
        const ty = clampTile(playerTileY + Math.floor((rand() - 0.5) * 10));
        if (!inBounds(tx, ty)) continue;
        if (state.grid[ty][tx] !== 0) continue;
        state.hazards.push({
          kind: 'lightning', x: tx, y: ty,
          hidden: false, triggered: false,
          telegraph: 0.9,
          dmg: Math.floor(30 * (1 + (state.floor || 1) * 0.1)),
          cooldown: 0,
        });
      }
    }
  }

  for (let i = state.hazards.length - 1; i >= 0; i--) {
    const h = state.hazards[i];

    if (h.hidden && h.x === playerTileX && h.y === playerTileY) {
      h.hidden = false;
      h.triggered = true;
      if (h.kind === 'spike') events.push({ kind: 'spike', dmg: h.dmg });
      else if (h.kind === 'arrow') h.fireNow = true;
      else if (h.kind === 'firevent') h.cooldown = 0.1;
    }
    if (h.kind === 'spike' && !h.hidden) {
      h.cooldown = Math.max(0, h.cooldown - dt);
      if (h.cooldown === 0 && h.x === playerTileX && h.y === playerTileY) {
        events.push({ kind: 'spike', dmg: h.dmg });
        h.cooldown = 1.2;
      }
    }
    if (h.kind === 'firevent' && !h.hidden) {
      h.cycle = h.cycle || 2.5;
      h.cooldown -= dt;
      if (h.cooldown <= 0) {
        h.cooldown = h.cycle;
        h.burst = 0.35;
      }
      if (h.burst > 0) {
        h.burst -= dt;
        if (Math.hypot(h.x - playerTileX, h.y - playerTileY) <= 1) {
          events.push({ kind: 'firevent', dmg: Math.floor(h.dmg * dt * 6) });
        }
      }
    }
    if (h.kind === 'lightning') {
      h.telegraph -= dt;
      if (h.telegraph <= 0 && !h.triggered) {
        h.triggered = true;
        h.strikeFlash = 0.25;
        if (h.x === playerTileX && h.y === playerTileY) events.push({ kind: 'lightning', dmg: h.dmg });
      }
      if (h.triggered) {
        h.strikeFlash -= dt;
        if (h.strikeFlash <= 0) state.hazards.splice(i, 1);
      }
    }
    if (h.kind === 'healflower' && !h.triggered) {
      if (h.x === playerTileX && h.y === playerTileY) {
        h.triggered = true;
        events.push({ kind: 'healflower', heal: h.heal });
      }
    }
  }
  return events;
}

function clampTile(v) { return Math.max(0, Math.min(W - 1, v)); }