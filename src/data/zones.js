// Zone definitions for the overworld (non-dungeon) areas.
// Coordinates are in canvas pixels; collision walls are listed per-zone.
// Building positions live here too so render code can use them as anchors.

export const ZONES = {
  starting: {
    w: 1600, h: 900,
    walls: [
      // Border
      { x: 0, y: 0,   w: 1600, h: 30 },
      { x: 0, y: 870, w: 1600, h: 30 },
      { x: 0, y: 0,   w: 30,   h: 900 },
      // Right wall — gap from y=400-500 leads to the hub
      { x: 1570, y: 0,   w: 30, h: 400 },
      { x: 1570, y: 500, w: 30, h: 400 },
    ],
    spawn: { x: 120, y: 450 },
  },
  hub: {
    w: 2200, h: 1100,
    walls: [
      // Border
      { x: 0, y: 0,    w: 2200, h: 30 },
      { x: 0, y: 1070, w: 2200, h: 30 },
      // Right wall (no exit through this side)
      { x: 2170, y: 0, w: 30, h: 1100 },
      // Left wall — gap from y=500-600 leads back to starting field
      { x: 0, y: 0,   w: 30, h: 500 },
      { x: 0, y: 600, w: 30, h: 500 },
    ],
    spawn: { x: 130, y: 550 },
    // Building anchors (top-left corners + size). Renderer reads from this list;
    // NPC interaction points are anchored to these too.
    buildings: [
      { kind: 'shop',         x: 250,  y: 150, w: 180, h: 160, color: '#9c5d3b', label: 'SHOP' },
      { kind: 'dungeon',      x: 600,  y: 150, w: 180, h: 160, color: '#5b2c6f', label: 'DUNGEON' },
      { kind: 'pvp',          x: 950,  y: 150, w: 180, h: 160, color: '#9c2222', label: 'PVP' },
      { kind: 'save',         x: 1300, y: 150, w: 180, h: 160, color: '#1e5b8a', label: 'SAVE' },
      { kind: 'party',        x: 1650, y: 150, w: 180, h: 160, color: '#1b5e20', label: 'PARTY' },
      { kind: 'blacksmith',   x: 250,  y: 750, w: 180, h: 160, color: '#3e2723', label: 'BLACKSMITH' },
      { kind: 'trainer',      x: 600,  y: 750, w: 180, h: 160, color: '#4a148c', label: 'TRAINER' },
      { kind: 'mystery',      x: 950,  y: 750, w: 180, h: 160, color: '#bf360c', label: 'BOXES' },
    ],
  },
};