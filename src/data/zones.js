// ============================================================================
// KREZCENT QUEST — ZONE DEFINITIONS (Update 9: Fantasy Hub Restyle)
// ============================================================================
// Coordinates are canvas pixels. Each overworld zone lists collision walls,
// the player spawn, and decorative/structural metadata the renderer uses.
//
// The hub is now a fantasy plaza: a central fountain, stone paths, gardens,
// and themed GATES. Stepping onto a gate teleports the player into a small
// decorated INTERIOR zone for that destination, where a unique interaction
// point (an altar/desk/portal) opens the relevant menu.
// ============================================================================

export const ZONES = {
  starting: {
    w: 1600, h: 900,
    walls: [
      { x: 0, y: 0,   w: 1600, h: 30 },
      { x: 0, y: 870, w: 1600, h: 30 },
      { x: 0, y: 0,   w: 30,   h: 900 },
      { x: 1570, y: 0,   w: 30, h: 400 },
      { x: 1570, y: 500, w: 30, h: 400 },
    ],
    spawn: { x: 120, y: 450 },
  },

  // ----------------------------- THE HUB -----------------------------
  hub: {
    w: 2400, h: 1400,
    bg: '#10131c',
    walls: [
      // Outer border
      { x: 0, y: 0,    w: 2400, h: 30 },
      { x: 0, y: 1370, w: 2400, h: 30 },
      { x: 2370, y: 0, w: 30,   h: 1400 },
      // Left wall — gap (y 660-740) leads back to the starting field
      { x: 0, y: 0,   w: 30, h: 660 },
      { x: 0, y: 740, w: 30, h: 660 },
    ],
    spawn: { x: 130, y: 700 },
    // Central plaza fountain (decorative anchor + collision)
    fountain: { x: 1200, y: 700, r: 90 },
    // Decorative props: trees, lampposts, banners, flowerbeds, statues, crates.
    // (Kept off the paths and away from gate columns so nothing overlaps.)
    decor: [
      // Garden ring around the fountain
      { kind: 'flowerbed', x: 1080, y: 560 }, { kind: 'flowerbed', x: 1320, y: 560 },
      { kind: 'flowerbed', x: 1080, y: 840 }, { kind: 'flowerbed', x: 1320, y: 840 },
      // Tree groves in the corners
      { kind: 'tree', x: 250, y: 220 }, { kind: 'tree', x: 320, y: 270 }, { kind: 'tree', x: 200, y: 300 },
      { kind: 'tree', x: 2150, y: 220 }, { kind: 'tree', x: 2080, y: 270 }, { kind: 'tree', x: 2200, y: 300 },
      { kind: 'tree', x: 250, y: 1180 }, { kind: 'tree', x: 200, y: 1130 },
      { kind: 'tree', x: 2150, y: 1180 }, { kind: 'tree', x: 2200, y: 1130 },
      // Lampposts flanking the gate columns (top + bottom rows)
      { kind: 'lamp', x: 660, y: 460 }, { kind: 'lamp', x: 1020, y: 460 },
      { kind: 'lamp', x: 1380, y: 460 }, { kind: 'lamp', x: 1740, y: 460 },
      { kind: 'lamp', x: 660, y: 940 }, { kind: 'lamp', x: 1020, y: 940 },
      { kind: 'lamp', x: 1380, y: 940 }, { kind: 'lamp', x: 1740, y: 940 },
      // Hero statue near the entrance
      { kind: 'statue', x: 280, y: 700 },
    ],
    // Stone path segments (drawn under everything). Each is a rect.
    // Layout: a horizontal avenue across the spawn row, a vertical avenue through
    // the plaza, and one centered spur up/down to each gate column.
    // Gate columns (center x): 520, 880, 1520, 1880.  Rows (center y): 340 / 1060.
    paths: [
      // Main horizontal avenue (spans the full width at the spawn row)
      { x: 60, y: 660, w: 2280, h: 80 },
      // Vertical avenue through the plaza (connects top & bottom rows)
      { x: 1160, y: 300, w: 80, h: 800 },
      // Top-row spurs (centered on each gate column: x = colCenter - 40)
      { x: 480,  y: 340, w: 80, h: 360 },  // shop column (520)
      { x: 840,  y: 340, w: 80, h: 360 },  // dungeon column (880)
      { x: 1480, y: 340, w: 80, h: 360 },  // pvp column (1520)
      { x: 1880, y: 340, w: 80, h: 360 },  // settings column (1920)
      // Bottom-row spurs
      { x: 480,  y: 700, w: 80, h: 360 },  // blacksmith column (520)
      { x: 840,  y: 700, w: 80, h: 360 },  // trainer column (880)
      { x: 1480, y: 700, w: 80, h: 360 },  // mystery column (1520)
      { x: 1880, y: 700, w: 80, h: 360 },  // tavern column (1920)
      // Cross-connectors so the gate columns join the horizontal avenue
      { x: 480,  y: 660, w: 1440, h: 80 },
    ],
    // GATES — stepping onto a gate teleports to that interior zone.
    // All gate centers sit exactly on the center of their path spur (col - 0).
    gates: [
      // Top row (y = 340)
      { kind: 'shop',       to: 'int_shop',       x: 520,  y: 340, label: 'Market',   color: '#c9892f', arch: 'cloth' },
      { kind: 'dungeon',    to: 'int_dungeon',    x: 880,  y: 340, label: 'Dungeon',  color: '#7b3ff2', arch: 'stone' },
      { kind: 'pvp',        to: 'int_pvp',        x: 1520, y: 340, label: 'Arena',    color: '#c0392b', arch: 'iron' },
      { kind: 'settings',   to: 'int_settings',   x: 1920, y: 340, label: 'Lodge',    color: '#34607a', arch: 'wood' },
      // Bottom row (y = 1060)
      { kind: 'blacksmith', to: 'int_blacksmith', x: 520,  y: 1060, label: 'Forge',   color: '#d35400', arch: 'forge' },
      { kind: 'trainer',    to: 'int_trainer',    x: 880,  y: 1060, label: 'Sanctum', color: '#8e44ad', arch: 'rune' },
      { kind: 'mystery',    to: 'int_mystery',    x: 1520, y: 1060, label: 'Curios',  color: '#16a085', arch: 'tent' },
      { kind: 'party',      to: null,             x: 1920, y: 1060, label: 'Tavern',  color: '#2980b9', arch: 'wood' },
    ],
  },
};

// ----------------------------- INTERIOR ZONES -----------------------------
// Small rooms reached via hub gates. Each has a themed floor/wall palette, a
// scattering of decor, an exit pad (back to the hub), and one interaction
// "focus" (altar/desk/portal/anvil) that opens the destination's menu.
export const INTERIORS = {
  int_shop: {
    w: 760, h: 560, floor: '#3a2c1c', wall: '#241a10', accent: '#c9892f',
    name: 'The Market Stalls',
    focus: { x: 380, y: 200, kind: 'merchant', prompt: 'Browse Wares [SPACE]', action: 'shop' },
    decor: [
      { kind: 'stall', x: 200, y: 180 }, { kind: 'stall', x: 560, y: 180 },
      { kind: 'crates', x: 150, y: 380 }, { kind: 'barrel', x: 620, y: 380 },
      { kind: 'rug', x: 380, y: 320 }, { kind: 'lamp', x: 250, y: 300 }, { kind: 'lamp', x: 510, y: 300 },
    ],
  },
  int_blacksmith: {
    w: 720, h: 540, floor: '#2a2420', wall: '#16110d', accent: '#d35400',
    name: 'The Forge',
    focus: { x: 360, y: 200, kind: 'anvil', prompt: 'Use the Forge [SPACE]', action: 'blacksmith' },
    decor: [
      { kind: 'furnace', x: 360, y: 120 }, { kind: 'anvil_deco', x: 200, y: 360 },
      { kind: 'weaponrack', x: 560, y: 200 }, { kind: 'barrel', x: 150, y: 420 },
      { kind: 'lamp', x: 250, y: 300 }, { kind: 'lamp', x: 470, y: 300 },
    ],
  },
  int_trainer: {
    w: 720, h: 560, floor: '#241830', wall: '#140a1e', accent: '#8e44ad',
    name: 'The Sanctum',
    focus: { x: 360, y: 180, kind: 'altar', prompt: 'Train Attributes [SPACE]', action: 'trainer' },
    decor: [
      { kind: 'pillar', x: 180, y: 220 }, { kind: 'pillar', x: 540, y: 220 },
      { kind: 'pillar', x: 180, y: 420 }, { kind: 'pillar', x: 540, y: 420 },
      { kind: 'runeglow', x: 360, y: 360 }, { kind: 'candles', x: 360, y: 120 },
    ],
  },
  int_dungeon: {
    w: 720, h: 540, floor: '#2a1230', wall: '#180a1c', accent: '#7b3ff2',
    name: 'The Dungeon Descent',
    focus: { x: 360, y: 200, kind: 'portal', prompt: 'Choose a Floor [SPACE]', action: 'dungeon_select' },
    decor: [
      { kind: 'pillar', x: 180, y: 200 }, { kind: 'pillar', x: 540, y: 200 },
      { kind: 'bones', x: 200, y: 400 }, { kind: 'bones', x: 520, y: 400 },
      { kind: 'torch', x: 240, y: 160 }, { kind: 'torch', x: 480, y: 160 },
    ],
  },
  int_pvp: {
    w: 760, h: 560, floor: '#3a1414', wall: '#1c0808', accent: '#c0392b',
    name: 'The Arena Gate',
    focus: { x: 380, y: 200, kind: 'banner_post', prompt: 'Enter the Arena [SPACE]', action: 'pvp' },
    decor: [
      { kind: 'banner', x: 240, y: 160 }, { kind: 'banner', x: 520, y: 160 },
      { kind: 'weaponrack', x: 180, y: 360 }, { kind: 'weaponrack', x: 580, y: 360 },
      { kind: 'torch', x: 300, y: 300 }, { kind: 'torch', x: 460, y: 300 },
    ],
  },
  int_mystery: {
    w: 700, h: 520, floor: '#13302a', wall: '#0a1a16', accent: '#16a085',
    name: 'The Curio Tent',
    focus: { x: 350, y: 190, kind: 'crystalball', prompt: 'Open a Mystery Box [SPACE]', action: 'mystery' },
    decor: [
      { kind: 'rug', x: 350, y: 300 }, { kind: 'candles', x: 200, y: 220 }, { kind: 'candles', x: 500, y: 220 },
      { kind: 'crates', x: 160, y: 380 }, { kind: 'crates', x: 540, y: 380 },
    ],
  },
  int_settings: {
    w: 680, h: 500, floor: '#1c2630', wall: '#0e151c', accent: '#34607a',
    name: 'The Quiet Lodge',
    focus: { x: 340, y: 190, kind: 'desk', prompt: 'Open Settings [SPACE]', action: 'settings' },
    decor: [
      { kind: 'fireplace', x: 340, y: 110 }, { kind: 'rug', x: 340, y: 300 },
      { kind: 'bookshelf', x: 160, y: 200 }, { kind: 'bookshelf', x: 520, y: 200 },
      { kind: 'lamp', x: 220, y: 320 }, { kind: 'lamp', x: 460, y: 320 },
    ],
  },
};