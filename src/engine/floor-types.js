// Floor type catalogue + generators.
// Each generator returns { grid, W, H, monsters, chests, decorations, hazards,
//   bossX, bossY, boss: { defeated: false }, type, theme, intro }.
// Tile values:
//   0 = floor, 1 = wall, 2 = water, 3 = lava, 4 = grass, 5 = bridge,
//   6 = sand, 7 = stone-tile.
// Hazards (live entities) are an array of:
//   { kind: 'spike'|'arrow'|'firevent'|'lightning'|'healflower',
//     x, y, hidden, triggered, cooldown, telegraph, payload... }

import { pickMonsterType } from '../data/monsters.js';
import { rand, pick } from './helpers.js';

const W = 25, H = 25;

// ---------- Themes ----------
export const THEMES = {
  shadow:  { name: 'Shadow Halls',  wall: '#2d1b3e', floor: '#1a0f24', accent: '#3d2754', bg: '#0a0612' },
  cavern:  { name: 'Cavern Depths', wall: '#4e342e', floor: '#3e2723', accent: '#6d4c41', bg: '#1a0d08' },
  nature:  { name: 'Verdant Grove', wall: '#2e5d2a', floor: '#3a6b2c', accent: '#558b2f', bg: '#0e2a08' },
  azure:   { name: 'Sunken Halls',  wall: '#1565c0', floor: '#0d47a1', accent: '#1976d2', bg: '#04132a' },
  glacial: { name: 'Frozen Caves',  wall: '#0277bd', floor: '#01579b', accent: '#0288d1', bg: '#021a30' },
  storm:   { name: 'Storm Plateau', wall: '#1a237e', floor: '#283593', accent: '#3949ab', bg: '#0a0e30' },
  magma:   { name: 'Magma Hollow',  wall: '#bf360c', floor: '#5d1f08', accent: '#d84315', bg: '#1a0500' },
  void:    { name: 'Void Reaches',  wall: '#311b92', floor: '#1a0d5e', accent: '#4527a0', bg: '#0a0224' },
};

export function themeForFloor(f) {
  if (f <= 10) return THEMES.shadow;
  if (f <= 20) return THEMES.cavern;
  if (f <= 30) return THEMES.nature;
  if (f <= 40) return THEMES.azure;
  if (f <= 55) return THEMES.glacial;
  if (f <= 70) return THEMES.storm;
  if (f <= 85) return THEMES.magma;
  return THEMES.void;
}

// ---------- Helpers ----------
function emptyGrid(fill = 1) {
  return Array.from({ length: H }, () => Array(W).fill(fill));
}

function isOpen(g, x, y) {
  if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return false;
  return g[y][x] === 0;
}

function placeMonsters(g, count, floor, avoid = []) {
  const monsters = [];
  const blocked = new Set(avoid.map(p => `${p.x},${p.y}`));
  let tries = 0;
  while (monsters.length < count && tries < 800) {
    tries++;
    const x = 1 + Math.floor(rand() * (W - 2));
    const y = 1 + Math.floor(rand() * (H - 2));
    if (!isOpen(g, x, y)) continue;
    if (blocked.has(`${x},${y}`)) continue;
    blocked.add(`${x},${y}`);
    monsters.push({ x, y, type: pickMonsterType(floor), id: Math.random().toString(36).slice(2) });
  }
  return monsters;
}

function placeChests(g, count, avoid = []) {
  const chests = [];
  const blocked = new Set(avoid.map(p => `${p.x},${p.y}`));
  let tries = 0;
  while (chests.length < count && tries < 300) {
    tries++;
    const x = 1 + Math.floor(rand() * (W - 2));
    const y = 1 + Math.floor(rand() * (H - 2));
    if (!isOpen(g, x, y)) continue;
    if (blocked.has(`${x},${y}`)) continue;
    blocked.add(`${x},${y}`);
    chests.push({ x, y, opened: false });
  }
  return chests;
}

function scatterTorches(g, density = 0.06) {
  const decs = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (g[y][x] === 1 && g[y + 1] && g[y + 1][x] === 0 && rand() < density) {
        decs.push({ x, y, type: 'torch' });
      }
    }
  }
  return decs;
}

// Hidden traps stay invisible until the player steps on them
function makeTrap(kind, x, y, payload = {}) {
  return { kind, x, y, hidden: true, triggered: false, cooldown: 0, telegraph: 0, ...payload };
}

function scatterTraps(g, count, kinds, floor) {
  const traps = [];
  const used = new Set();
  let tries = 0;
  while (traps.length < count && tries < 400) {
    tries++;
    const x = 2 + Math.floor(rand() * (W - 4));
    const y = 2 + Math.floor(rand() * (H - 4));
    if (!isOpen(g, x, y)) continue;
    const k = `${x},${y}`;
    if (used.has(k)) continue;
    used.add(k);
    const kind = pick(kinds);
    const dmg = Math.floor(15 * (1 + floor * 0.12));
    if (kind === 'spike') traps.push(makeTrap('spike', x, y, { dmg }));
    else if (kind === 'arrow') traps.push(makeTrap('arrow', x, y, { dmg, dir: pick([0, 1, 2, 3]) }));
    else if (kind === 'firevent') traps.push(makeTrap('firevent', x, y, { dmg, cycle: 2.5 }));
  }
  return traps;
}

// ---------- 1. MAZE (carved corridors) ----------
function genMazeType(floor) {
  const g = emptyGrid(1);
  function carve(x, y) {
    g[y][x] = 0;
    const dirs = [[0, -2], [2, 0], [0, 2], [-2, 0]].sort(() => rand() - 0.5);
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx > 0 && nx < W - 1 && ny > 0 && ny < H - 1 && g[ny][nx] === 1) {
        g[y + dy / 2][x + dx / 2] = 0;
        carve(nx, ny);
      }
    }
  }
  carve(1, 1);
  // Boss alcove (bottom-right)
  for (let y = H - 5; y < H - 1; y++) for (let x = W - 5; x < W - 1; x++) g[y][x] = 0;
  g[H - 6][W - 3] = 0;
  const bossX = W - 3, bossY = H - 3;
  const avoid = [{ x: 1, y: 1 }, { x: bossX, y: bossY }];
  const monsters = placeMonsters(g, Math.min(7 + Math.floor(floor / 3), 18), floor, avoid);
  const chests = placeChests(g, Math.max(2, Math.min(2 + Math.floor(floor / 8), 6)));
  return {
    grid: g, W, H, monsters, chests, decorations: scatterTorches(g),
    hazards: [], bossX, bossY, boss: { defeated: false },
    type: 'maze', intro: 'A twisting maze. Find the boss at the far end.',
  };
}

// ---------- 2. CAVE (branching, only one path leads to boss) ----------
function genCaveType(floor) {
  // Carve a tree of corridors from spawn; pick one leaf as boss room, others as dead-end alcoves.
  const g = emptyGrid(1);
  const branches = [];
  function carve(x, y, depth, parentDir = -1) {
    g[y][x] = 0;
    if (depth <= 0) { branches.push({ x, y, depth }); return; }
    const dirs = [[0, -2], [2, 0], [0, 2], [-2, 0]].sort(() => rand() - 0.5);
    let carved = 0;
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx > 0 && nx < W - 1 && ny > 0 && ny < H - 1 && g[ny][nx] === 1) {
        // Prefer wide hallways: 70% chance to clear adjacent tile
        g[y + dy / 2][x + dx / 2] = 0;
        if (rand() < 0.55) {
          const sx = nx + (dy === 0 ? 0 : 1), sy = ny + (dy === 0 ? 1 : 0);
          if (sx > 0 && sy > 0 && sx < W - 1 && sy < H - 1 && g[sy][sx] === 1) g[sy][sx] = 0;
        }
        carve(nx, ny, depth - 1);
        carved++;
        if (carved >= 3 && rand() < 0.5) break; // limit branching width
      }
    }
    if (carved === 0) branches.push({ x, y, depth });
  }
  carve(1, 1, 9);
  // Pick the deepest leaf as boss room (carves a 3x3 alcove)
  branches.sort((a, b) => a.depth - b.depth);
  const bossLeaf = branches[0] || { x: W - 3, y: H - 3 };
  const bossX = Math.min(W - 2, Math.max(2, bossLeaf.x));
  const bossY = Math.min(H - 2, Math.max(2, bossLeaf.y));
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = bossX + dx, ny = bossY + dy;
    if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1) g[ny][nx] = 0;
  }
  // Other leaves become decorative dead-ends (just leave them open with maybe a chest)
  const deadEnds = branches.slice(1, 5);
  const chestSpots = deadEnds.map(d => ({ x: d.x, y: d.y }));
  const monsters = placeMonsters(g, Math.min(8 + Math.floor(floor / 3), 20), floor, [{ x: 1, y: 1 }, { x: bossX, y: bossY }]);
  const fixedChests = chestSpots.slice(0, 3).filter(s => isOpen(g, s.x, s.y)).map(s => ({ x: s.x, y: s.y, opened: false }));
  return {
    grid: g, W, H, monsters,
    chests: fixedChests.length ? fixedChests : placeChests(g, 2),
    decorations: scatterTorches(g, 0.04),
    hazards: [], bossX, bossY, boss: { defeated: false },
    type: 'cave', intro: 'Branching caves. Only one path leads to the boss — choose wisely.',
  };
}

// ---------- 3. OPEN ROOM (single arena with pillars) ----------
function genOpenRoomType(floor) {
  const g = emptyGrid(0);
  // Border walls
  for (let x = 0; x < W; x++) { g[0][x] = 1; g[H - 1][x] = 1; }
  for (let y = 0; y < H; y++) { g[y][0] = 1; g[y][W - 1] = 1; }
  // Random pillars
  const pillarCount = 6 + Math.floor(rand() * 5);
  for (let i = 0; i < pillarCount; i++) {
    const x = 3 + Math.floor(rand() * (W - 6));
    const y = 3 + Math.floor(rand() * (H - 6));
    // 2x2 pillar
    g[y][x] = 1; g[y][x + 1] = 1; g[y + 1][x] = 1; g[y + 1][x + 1] = 1;
  }
  const bossX = W - 4, bossY = H - 4;
  // Make sure boss area is open
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = bossX + dx, ny = bossY + dy;
    if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1) g[ny][nx] = 0;
  }
  // Spawn area
  for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) g[1 + dy][1 + dx] = 0;
  const monsters = placeMonsters(g, Math.min(9 + Math.floor(floor / 3), 22), floor, [{ x: 1, y: 1 }, { x: bossX, y: bossY }]);
  const chests = placeChests(g, 3);
  return {
    grid: g, W, H, monsters, chests, decorations: scatterTorches(g, 0.03),
    hazards: [], bossX, bossY, boss: { defeated: false },
    type: 'open', intro: 'A wide chamber with pillars. Use cover wisely.',
  };
}

// ---------- 4. PILLARED HALL (long room, regular columns) ----------
function genPillarHallType(floor) {
  const g = emptyGrid(0);
  for (let x = 0; x < W; x++) { g[0][x] = 1; g[H - 1][x] = 1; }
  for (let y = 0; y < H; y++) { g[y][0] = 1; g[y][W - 1] = 1; }
  // Regular columns in 4 rows
  for (const py of [5, 10, 15, 20]) {
    for (let px = 4; px < W - 2; px += 4) {
      g[py][px] = 1;
      g[py][px + 1] = 1;
    }
  }
  const bossX = W - 4, bossY = H - 4;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = bossX + dx, ny = bossY + dy;
    if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1) g[ny][nx] = 0;
  }
  const monsters = placeMonsters(g, Math.min(8 + Math.floor(floor / 3), 20), floor, [{ x: 1, y: 1 }, { x: bossX, y: bossY }]);
  const chests = placeChests(g, 3);
  return {
    grid: g, W, H, monsters, chests, decorations: scatterTorches(g, 0.08),
    hazards: [], bossX, bossY, boss: { defeated: false },
    type: 'hall', intro: 'Ancient pillared hall. Watch the sightlines.',
  };
}

// ---------- 5. RIVER (water hazard with bridges) ----------
function genRiverType(floor) {
  const g = emptyGrid(0);
  for (let x = 0; x < W; x++) { g[0][x] = 1; g[H - 1][x] = 1; }
  for (let y = 0; y < H; y++) { g[y][0] = 1; g[y][W - 1] = 1; }
  // Horizontal river bands
  const rivers = [8, 16];
  for (const ry of rivers) {
    for (let x = 1; x < W - 1; x++) g[ry][x] = 2; // water
    for (let x = 1; x < W - 1; x++) g[ry + 1][x] = 2;
  }
  // Bridges: 2-3 per river
  const bridgeCount = 2 + Math.floor(rand() * 2);
  for (const ry of rivers) {
    const cols = new Set();
    while (cols.size < bridgeCount) cols.add(3 + Math.floor(rand() * (W - 6)));
    for (const c of cols) {
      g[ry][c] = 5; // bridge
      g[ry + 1][c] = 5;
    }
  }
  const bossX = W - 4, bossY = H - 4;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = bossX + dx, ny = bossY + dy;
    if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && g[ny][nx] !== 5) {
      g[ny][nx] = 0;
    }
  }
  const avoidWater = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === 2) avoidWater.push({ x, y });
  const monsters = placeMonsters(g, Math.min(8 + Math.floor(floor / 3), 18), floor, [...avoidWater, { x: 1, y: 1 }, { x: bossX, y: bossY }]);
  const chests = placeChests(g, 3, avoidWater);
  return {
    grid: g, W, H, monsters, chests, decorations: scatterTorches(g, 0.04),
    hazards: [], bossX, bossY, boss: { defeated: false },
    type: 'river', intro: 'Cross the rivers carefully. Stick to the bridges.',
  };
}

// ---------- 6. MAGMA CHAMBER (lava pits) ----------
function genMagmaType(floor) {
  const g = emptyGrid(0);
  for (let x = 0; x < W; x++) { g[0][x] = 1; g[H - 1][x] = 1; }
  for (let y = 0; y < H; y++) { g[y][0] = 1; g[y][W - 1] = 1; }
  // Random lava blobs
  const blobs = 5 + Math.floor(rand() * 4);
  for (let i = 0; i < blobs; i++) {
    const cx = 3 + Math.floor(rand() * (W - 6));
    const cy = 3 + Math.floor(rand() * (H - 6));
    const size = 2 + Math.floor(rand() * 3);
    for (let dy = -size; dy <= size; dy++) for (let dx = -size; dx <= size; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && Math.hypot(dx, dy) <= size) {
        g[ny][nx] = 3; // lava
      }
    }
  }
  // Carve safe paths
  for (let x = 1; x < W - 1; x++) g[1][x] = 0;
  for (let y = 1; y < H - 1; y++) g[y][1] = 0;
  const bossX = W - 4, bossY = H - 4;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = bossX + dx, ny = bossY + dy;
    if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1) g[ny][nx] = 0;
  }
  const avoidLava = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === 3) avoidLava.push({ x, y });
  const monsters = placeMonsters(g, Math.min(7 + Math.floor(floor / 3), 18), floor, [...avoidLava, { x: 1, y: 1 }, { x: bossX, y: bossY }]);
  const chests = placeChests(g, 3, avoidLava);
  return {
    grid: g, W, H, monsters, chests, decorations: [],
    hazards: scatterTraps(g, 4, ['firevent'], floor),
    bossX, bossY, boss: { defeated: false },
    type: 'magma', intro: 'Step around the lava. Firevents lurk in the open.',
  };
}

// ---------- 7. STORM FIELD (open, lightning strikes) ----------
function genStormType(floor) {
  const g = emptyGrid(0);
  for (let x = 0; x < W; x++) { g[0][x] = 1; g[H - 1][x] = 1; }
  for (let y = 0; y < H; y++) { g[y][0] = 1; g[y][W - 1] = 1; }
  // A few scattered rocks
  for (let i = 0; i < 8; i++) {
    const x = 2 + Math.floor(rand() * (W - 4));
    const y = 2 + Math.floor(rand() * (H - 4));
    g[y][x] = 1;
  }
  const bossX = W - 4, bossY = H - 4;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = bossX + dx, ny = bossY + dy;
    if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1) g[ny][nx] = 0;
  }
  const monsters = placeMonsters(g, Math.min(8 + Math.floor(floor / 3), 20), floor, [{ x: 1, y: 1 }, { x: bossX, y: bossY }]);
  const chests = placeChests(g, 3);
  // Lightning hazards spawn dynamically — start with none, they're generated each tick
  return {
    grid: g, W, H, monsters, chests, decorations: [],
    hazards: [], bossX, bossY, boss: { defeated: false },
    type: 'storm', intro: 'Lightning falls from above. Watch for warning circles.',
    stormTimer: 0,
  };
}

// ---------- 8. GARDEN (open, plants, healing flowers) ----------
function genGardenType(floor) {
  const g = emptyGrid(4); // grass everywhere
  for (let x = 0; x < W; x++) { g[0][x] = 1; g[H - 1][x] = 1; }
  for (let y = 0; y < H; y++) { g[y][0] = 1; g[y][W - 1] = 1; }
  // Plant clusters (walls of bushes)
  for (let i = 0; i < 10; i++) {
    const x = 3 + Math.floor(rand() * (W - 6));
    const y = 3 + Math.floor(rand() * (H - 6));
    g[y][x] = 1;
    if (rand() < 0.5) g[y][x + 1] = 1;
    if (rand() < 0.5) g[y + 1][x] = 1;
  }
  const bossX = W - 4, bossY = H - 4;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = bossX + dx, ny = bossY + dy;
    if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1) g[ny][nx] = 4;
  }
  const monsters = placeMonsters(g, Math.min(8 + Math.floor(floor / 3), 20), floor, [{ x: 1, y: 1 }, { x: bossX, y: bossY }]);
  const chests = placeChests(g, 3);
  // Healing flowers — stepping on them heals you, then they wilt
  const hazards = [];
  for (let i = 0; i < 4; i++) {
    let tries = 0;
    while (tries++ < 50) {
      const x = 2 + Math.floor(rand() * (W - 4));
      const y = 2 + Math.floor(rand() * (H - 4));
      if (g[y][x] === 4) { hazards.push({ kind: 'healflower', x, y, hidden: false, triggered: false, heal: 0.15 }); break; }
    }
  }
  return {
    grid: g, W, H, monsters, chests, decorations: [],
    hazards, bossX, bossY, boss: { defeated: false },
    type: 'garden', intro: 'A wild garden. Stepping on glowing flowers will heal you.',
  };
}

// ---------- 9. GAUNTLET (narrow corridor with traps) ----------
function genGauntletType(floor) {
  const g = emptyGrid(1);
  // Carve a 3-tile-wide S-shaped corridor
  for (let x = 1; x < W - 1; x++) {
    g[3][x] = 0; g[4][x] = 0; g[5][x] = 0;
  }
  for (let y = 5; y < 15; y++) {
    g[y][W - 6] = 0; g[y][W - 7] = 0; g[y][W - 8] = 0;
  }
  for (let x = 1; x < W - 5; x++) {
    g[15][x] = 0; g[16][x] = 0; g[17][x] = 0;
  }
  for (let y = 17; y < 23; y++) {
    g[y][3] = 0; g[y][4] = 0; g[y][5] = 0;
  }
  for (let x = 5; x < W - 1; x++) {
    g[21][x] = 0; g[22][x] = 0; g[23][x] = 0;
  }
  const bossX = W - 3, bossY = 22;
  const monsters = placeMonsters(g, Math.min(6 + Math.floor(floor / 4), 14), floor, [{ x: 1, y: 4 }, { x: bossX, y: bossY }]);
  return {
    grid: g, W, H, monsters, chests: placeChests(g, 2),
    decorations: scatterTorches(g, 0.1),
    hazards: scatterTraps(g, 8 + Math.floor(floor / 10), ['spike', 'arrow', 'firevent'], floor),
    bossX, bossY, boss: { defeated: false },
    type: 'gauntlet', intro: 'A narrow gauntlet. Hidden traps lie in wait — every step could hurt.',
  };
}

// ---------- 10. BOSS ARENA (every 10th floor) ----------
function genBossArenaType(floor) {
  const g = emptyGrid(0);
  for (let x = 0; x < W; x++) { g[0][x] = 1; g[H - 1][x] = 1; }
  for (let y = 0; y < H; y++) { g[y][0] = 1; g[y][W - 1] = 1; }
  // Decorative pillars at corners
  for (const [px, py] of [[4, 4], [W - 5, 4], [4, H - 5], [W - 5, H - 5]]) {
    g[py][px] = 1; g[py][px + 1] = 1; g[py + 1][px] = 1; g[py + 1][px + 1] = 1;
  }
  const bossX = Math.floor(W / 2), bossY = Math.floor(H / 2);
  // A few minion spawns near boss
  const monsters = placeMonsters(g, 3 + Math.floor(floor / 15), floor, [{ x: 1, y: 1 }, { x: bossX, y: bossY }]);
  const chests = placeChests(g, 2);
  return {
    grid: g, W, H, monsters, chests, decorations: scatterTorches(g, 0.05),
    hazards: [], bossX, bossY, boss: { defeated: false },
    type: 'boss_arena', intro: 'A grand chamber. The boss awaits at the center.',
  };
}

// ---------- Dispatcher ----------
// Boss arena on every floor divisible by 10.
// Other floors cycle through the 9 remaining types using a deterministic offset
// so each tier of 10 floors feels different.
const NON_BOSS_GENS = [
  genMazeType, genCaveType, genOpenRoomType, genPillarHallType,
  genRiverType, genMagmaType, genStormType, genGardenType, genGauntletType,
];
const NON_BOSS_NAMES = ['maze', 'cave', 'open', 'hall', 'river', 'magma', 'storm', 'garden', 'gauntlet'];

export function pickFloorType(floor) {
  if (floor % 10 === 0) return 'boss_arena';
  // Mix by tier — each tier rotates differently
  const tier = Math.floor((floor - 1) / 10);
  const slot = (floor - 1) % 10; // 0..8 for non-boss floors
  const idx = (slot + tier * 3) % NON_BOSS_GENS.length;
  return NON_BOSS_NAMES[idx];
}

export function generateFloorOfType(type, floor) {
  const theme = themeForFloor(floor);
  let res;
  if (type === 'boss_arena') res = genBossArenaType(floor);
  else {
    const idx = NON_BOSS_NAMES.indexOf(type);
    res = (idx >= 0 ? NON_BOSS_GENS[idx] : genMazeType)(floor);
  }
  res.theme = theme;
  return res;
}

// Convenience: pick + generate.
export function generateFloor(floor) {
  return generateFloorOfType(pickFloorType(floor), floor);
}

// ---------- Live hazard updates ----------
// Called each frame from main. dt in seconds. Returns array of damage events
// of the form { x, y, dmg, kind } that the caller can apply to the player if
// they're in range. Hazards mutate themselves (cooldowns, telegraphs).
//
// For STORM floors, this also occasionally spawns new lightning warnings.
export function updateHazards(state, dt, playerTileX, playerTileY, playerPxX, playerPxY) {
  const events = [];
  if (!state) return events;

  // Storm-field: spawn lightning at random open tiles
  if (state.type === 'storm') {
    state.stormTimer = (state.stormTimer || 0) - dt;
    if (state.stormTimer <= 0) {
      state.stormTimer = 1.6 + rand() * 1.4;
      // Drop 1-3 lightning warnings near the player
      const count = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i++) {
        const tx = clampTile(playerTileX + Math.floor((rand() - 0.5) * 10));
        const ty = clampTile(playerTileY + Math.floor((rand() - 0.5) * 10));
        if (tx <= 0 || ty <= 0 || tx >= W - 1 || ty >= H - 1) continue;
        if (state.grid[ty][tx] !== 0) continue;
        state.hazards.push({
          kind: 'lightning', x: tx, y: ty,
          hidden: false, triggered: false,
          telegraph: 0.9, // seconds of warning circle
          dmg: Math.floor(30 * (1 + (state.floor || 1) * 0.1)),
          cooldown: 0,
        });
      }
    }
  }

  for (let i = state.hazards.length - 1; i >= 0; i--) {
    const h = state.hazards[i];

    // Reveal hidden traps when the player steps on them
    if (h.hidden && h.x === playerTileX && h.y === playerTileY) {
      h.hidden = false;
      h.triggered = true;
      if (h.kind === 'spike') {
        events.push({ kind: 'spike', dmg: h.dmg });
      } else if (h.kind === 'arrow') {
        // Fires a single arrow projectile from the trap's edge
        h.fireNow = true;
      } else if (h.kind === 'firevent') {
        h.cooldown = 0.1; // imminent burst
      }
    }

    // Spike trap — re-arms after 1.2s, hurts on every step
    if (h.kind === 'spike' && !h.hidden) {
      h.cooldown = Math.max(0, h.cooldown - dt);
      if (h.cooldown === 0 && h.x === playerTileX && h.y === playerTileY) {
        events.push({ kind: 'spike', dmg: h.dmg });
        h.cooldown = 1.2;
      }
    }

    // Firevent — periodic burst on its own tile and adjacent tiles
    if (h.kind === 'firevent' && !h.hidden) {
      h.cycle = h.cycle || 2.5;
      h.cooldown -= dt;
      if (h.cooldown <= 0) {
        h.cooldown = h.cycle;
        h.burst = 0.35; // burst lasts a third of a second
      }
      if (h.burst > 0) {
        h.burst -= dt;
        if (Math.hypot(h.x - playerTileX, h.y - playerTileY) <= 1) {
          events.push({ kind: 'firevent', dmg: Math.floor(h.dmg * dt * 6) }); // damage-per-tick
        }
      }
    }

    // Lightning warning, then strike, then expire
    if (h.kind === 'lightning') {
      h.telegraph -= dt;
      if (h.telegraph <= 0 && !h.triggered) {
        h.triggered = true;
        h.strikeFlash = 0.25;
        if (h.x === playerTileX && h.y === playerTileY) {
          events.push({ kind: 'lightning', dmg: h.dmg });
        }
      }
      if (h.triggered) {
        h.strikeFlash -= dt;
        if (h.strikeFlash <= 0) state.hazards.splice(i, 1);
      }
    }

    // Heal flower — heal player once, then wilt
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