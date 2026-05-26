// ============================================================================
// KREZCENT QUEST — ITEMS, DROP VALUES, DEV CODES (Update 6)
// ============================================================================
// Item fields: g=grade, n=name, e=effect-key (handled in main.jsx useItem),
//   price, shopSells (sold in General Store), desc, stack (stackable in
//   inventory; capped at MAX_STACK then spills to a new slot).
// ============================================================================

export const MAX_STACK = 99;

export const ITEMS = {
  // ---------------- S ----------------
  full_potion:    { g: 'S', n: 'Full Potion',          e: 'fullRestore', price: 800,  shopSells: true,  stack: true, desc: 'Full HP, mana, energy' },
  double:         { g: 'S', n: 'Double',               e: 'double10s',   price: 1200, shopSells: false, stack: true, desc: 'Double stats 10s' },
  elixir:         { g: 'S', n: 'Grand Elixir',         e: 'fullRestore', price: 900,  shopSells: true,  stack: true, desc: 'Full HP, mana & energy' },
  phoenix_tear:   { g: 'S', n: 'Phoenix Tear',         e: 'reviveBuff',  price: 1500, shopSells: true,  stack: true, desc: '5s: survive lethal hits at 1 HP' },
  // ---------------- A ----------------
  heal_potion_a:  { g: 'A', n: 'Greater Heal Potion',  e: 'heal30',      price: 250,  shopSells: true,  stack: true, desc: '+30% HP' },
  mana_potion_a:  { g: 'A', n: 'Greater Mana Potion',  e: 'mana30',      price: 220,  shopSells: true,  stack: true, desc: '+30% mana' },
  energy_potion_a:{ g: 'A', n: 'Greater Energy Potion',e: 'energy30',    price: 200,  shopSells: true,  stack: true, desc: '+30% energy' },
  exp_upgrade:    { g: 'A', n: 'Experience Stone',     e: 'levelUp',     price: 600,  shopSells: true,  stack: true, desc: 'Instant +1 level' },
  affinity_upgrade:{g: 'A', n: 'Affinity Stone',       e: 'affinityUp',  price: 500,  shopSells: true,  stack: true, desc: '+1 affinity level' },
  power_draught:  { g: 'A', n: 'Power Draught',        e: 'boost15s',    price: 300,  shopSells: true,  stack: true, desc: '+20% damage for 15s' },
  swift_tonic:    { g: 'A', n: 'Swift Tonic',          e: 'haste15s',    price: 280,  shopSells: true,  stack: true, desc: '+25% move speed for 15s' },
  iron_tonic:     { g: 'A', n: 'Iron Tonic',           e: 'guard15s',    price: 280,  shopSells: true,  stack: true, desc: '-25% damage taken for 15s' },
  // ---------------- B ----------------
  heal_potion_b:  { g: 'B', n: 'Heal Potion',          e: 'heal20',      price: 120,  shopSells: true,  stack: true, desc: '+20% HP' },
  mana_potion_b:  { g: 'B', n: 'Mana Potion',          e: 'mana20',      price: 110,  shopSells: true,  stack: true, desc: '+20% mana' },
  energy_potion_b:{ g: 'B', n: 'Energy Potion',        e: 'energy20',    price: 100,  shopSells: true,  stack: true, desc: '+20% energy' },
  attr_remove:    { g: 'B', n: 'Attribute Scrubber',   e: 'removeAttr',  price: 400,  shopSells: true,  stack: true, desc: 'Remove one attribute' },
  shield_flask:   { g: 'B', n: 'Shield Flask',         e: 'shield150',   price: 150,  shopSells: true,  stack: true, desc: 'Gain a 150 HP shield' },
  cleanse_vial:   { g: 'B', n: 'Cleanse Vial',         e: 'cleanse',     price: 130,  shopSells: true,  stack: true, desc: 'Clear all status effects' },
  // ---------------- C ----------------
  heal_potion_c:  { g: 'C', n: 'Lesser Heal Potion',   e: 'heal10',      price: 50,   shopSells: true,  stack: true, desc: '+10% HP' },
  mana_potion_c:  { g: 'C', n: 'Lesser Mana Potion',   e: 'mana10',      price: 45,   shopSells: true,  stack: true, desc: '+10% mana' },
  energy_potion_c:{ g: 'C', n: 'Lesser Energy Potion', e: 'energy10',    price: 40,   shopSells: true,  stack: true, desc: '+10% energy' },
  trail_ration:   { g: 'C', n: 'Trail Ration',         e: 'heal12',      price: 55,   shopSells: true,  stack: true, desc: '+12% HP' },
  smoke_bomb:     { g: 'C', n: 'Smoke Bomb',           e: 'blindAll',    price: 60,   shopSells: true,  stack: true, desc: 'Blind nearby enemies' },
  // ---------------- D ----------------
  coin_flip:      { g: 'D', n: 'Lucky Coin',           e: 'coinFlip',    price: 25,   shopSells: true,  stack: true, desc: 'Heads: dbl dmg / Tails: -50% HP' },
  small_bandage:  { g: 'D', n: 'Bandage',              e: 'heal7',       price: 15,   shopSells: true,  stack: true, desc: '+7% HP' },
  throwing_rock:  { g: 'D', n: 'Throwing Rock',        e: 'rockHit',     price: 10,   shopSells: true,  stack: true, desc: 'Hurl for 20 damage' },
  // ---------------- E ----------------
  heal_potion_e:  { g: 'E', n: 'Tiny Heal',            e: 'heal5',       price: 8,    shopSells: true,  stack: true, desc: '+5% HP' },
  mana_potion_e:  { g: 'E', n: 'Tiny Mana',            e: 'mana5',       price: 7,    shopSells: true,  stack: true, desc: '+5% mana' },
  energy_potion_e:{ g: 'E', n: 'Tiny Energy',          e: 'energy5',     price: 6,    shopSells: true,  stack: true, desc: '+5% energy' },
  // ---------------- F ----------------
  pass_out:       { g: 'F', n: 'Pass Out',             e: 'kill',        price: 1,    shopSells: false, stack: true, desc: 'You die.' },
  stale_bread:    { g: 'F', n: 'Stale Bread',          e: 'heal2',       price: 2,    shopSells: true,  stack: true, desc: '+2% HP' },
  apple:          { g: 'F', n: 'Apple',                e: 'heal3',       price: 3,    shopSells: true,  stack: true, desc: '+3% HP' },
};

export const MONSTER_DROP_VALUE = { F: 3, E: 8, D: 18, C: 40, B: 90, A: 180, S: 400 };

// ============================================================================
// DEV / ADMIN CODES — enter as the "code" in the creator to spawn a preset.
//   allAffinities   : grant EVERY main + sub affinity
//   maxAllAbilities : every affinity at level 100 (every ability unlocked)
//   bonusLevel/bonusCoins : added on top of base (level 1, 100 coins)
//   setCoins        : overrides coins to exactly this value
// ============================================================================
export const ADMIN_CODES = {
  // God preset: 30 attrs, every affinity, every ability maxed, 1B coins.
  KISHEL_DEV: {
    note: 'God preset — 30 attrs, ALL affinities maxed, 1,000,000,000 coins',
    attrs: [
      { key: 'slash', grade: 'S' }, { key: 'replenish', grade: 'S' }, { key: 'control', grade: 'S' },
      { key: 'timestop', grade: 'S' }, { key: 'apex', grade: 'S' }, { key: 'immortal', grade: 'S' },
      { key: 'rewind', grade: 'S' }, { key: 'annihilate', grade: 'S' }, { key: 'dominion', grade: 'S' },
      { key: 'ascend', grade: 'S' },
      { key: 'boost', grade: 'A' }, { key: 'lifesteal', grade: 'A' }, { key: 'overcharge', grade: 'A' },
      { key: 'vanish', grade: 'A' }, { key: 'bulwark', grade: 'A' }, { key: 'clone', grade: 'A' },
      { key: 'frenzy', grade: 'B' }, { key: 'blink', grade: 'B' }, { key: 'fortify', grade: 'B' },
      { key: 'siphon', grade: 'B' }, { key: 'quake', grade: 'B' }, { key: 'mirror', grade: 'B' },
      { key: 'heal', grade: 'C' }, { key: 'regen', grade: 'C' }, { key: 'cleanse', grade: 'C' },
      { key: 'focus', grade: 'C' }, { key: 'warcry', grade: 'C' },
      { key: 'roll', grade: 'E' }, { key: 'sidestep', grade: 'E' }, { key: 'charge', grade: 'F' },
    ],
    affs: {},
    allAffinities: true,
    maxAllAbilities: true,
    bonusLevel: 99,
    setCoins: 1000000000,
  },

  // Balanced testing preset.
  STABLE_DEV: {
    note: 'Balanced test — Fire/Lightning/Air/Poison Gas @Lv1, +5000 coins',
    attrs: [
      { key: 'boost', grade: 'A' }, { key: 'lifesteal', grade: 'A' },
      { key: 'overcharge', grade: 'A' }, { key: 'bulwark', grade: 'A' },
      { key: 'frenzy', grade: 'B' },
      { key: 'heal', grade: 'C' },
    ],
    affs: {
      Fire: { level: 1 },
      Air: { level: 1 },
      Water: { level: 1, sub: 'Lightning', subLevel: 1 },
      Earth: { level: 1, sub: 'Poison Gas', subLevel: 1 },
    },
    bonusLevel: 0,
    bonusCoins: 5000,
  },

  // Glass cannon caster.
  ARCANE_DEV: {
    note: 'Glass cannon — high-level casters, big coins, fragile build',
    attrs: [
      { key: 'overcharge', grade: 'A' }, { key: 'boost', grade: 'A' },
      { key: 'focus', grade: 'C' }, { key: 'surge', grade: 'C' },
      { key: 'manamore', grade: 'C' }, { key: 'blink', grade: 'B' },
    ],
    affs: {
      Fire: { level: 60, sub: 'Lava', subLevel: 50 },
      Light: { level: 60, sub: 'Time', subLevel: 50 },
      Darkness: { level: 60, sub: 'Space', subLevel: 50 },
    },
    bonusLevel: 59,
    bonusCoins: 50000,
  },

  // Bruiser / tank.
  TANK_DEV: {
    note: 'Bruiser — defensive attrs, mid affinities, durable',
    attrs: [
      { key: 'bulwark', grade: 'A' }, { key: 'fortify', grade: 'B' },
      { key: 'ironskin', grade: 'D' }, { key: 'regen', grade: 'C' },
      { key: 'warcry', grade: 'C' }, { key: 'quake', grade: 'B' },
      { key: 'parry', grade: 'D' },
    ],
    affs: {
      Earth: { level: 40, sub: 'Metal', subLevel: 30 },
      Water: { level: 40, sub: 'Ice', subLevel: 30 },
    },
    bonusLevel: 39,
    bonusCoins: 20000,
  },

  // Low-level but rich speedrun scout.
  SCOUT_DEV: {
    note: 'Speedrun scout — Lv5, mobility attrs, 9999 coins',
    attrs: [
      { key: 'blink', grade: 'B' }, { key: 'quickstep', grade: 'D' },
      { key: 'footwork', grade: 'C' }, { key: 'vanish', grade: 'A' },
    ],
    affs: {
      Air: { level: 20 },
      Darkness: { level: 20, sub: 'Space', subLevel: 20 },
    },
    bonusLevel: 4,
    bonusCoins: 9999,
  },
};