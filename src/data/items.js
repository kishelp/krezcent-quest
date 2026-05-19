export const ITEMS = {
  full_potion: { g: 'S', n: 'Full Potion', e: 'fullRestore', price: 800, shopSells: true, desc: 'Full HP, mana, energy' },
  double: { g: 'S', n: 'Double', e: 'double10s', price: 1200, shopSells: false, desc: 'Double stats 10s' },
  heal_potion_a: { g: 'A', n: 'Greater Heal Potion', e: 'heal30', price: 250, shopSells: true, desc: '+30% HP' },
  mana_potion_a: { g: 'A', n: 'Greater Mana Potion', e: 'mana30', price: 220, shopSells: true, desc: '+30% mana' },
  energy_potion_a: { g: 'A', n: 'Greater Energy Potion', e: 'energy30', price: 200, shopSells: true, desc: '+30% energy' },
  exp_upgrade: { g: 'A', n: 'Experience Stone', e: 'levelUp', price: 600, shopSells: false, desc: 'Instant +1 level' },
  affinity_upgrade: { g: 'A', n: 'Affinity Stone', e: 'affinityUp', price: 500, shopSells: false, desc: '+1 affinity level' },
  heal_potion_b: { g: 'B', n: 'Heal Potion', e: 'heal20', price: 120, shopSells: true, desc: '+20% HP' },
  mana_potion_b: { g: 'B', n: 'Mana Potion', e: 'mana20', price: 110, shopSells: true, desc: '+20% mana' },
  energy_potion_b: { g: 'B', n: 'Energy Potion', e: 'energy20', price: 100, shopSells: true, desc: '+20% energy' },
  attr_remove: { g: 'B', n: 'Attribute Scrubber', e: 'removeAttr', price: 400, shopSells: false, desc: 'Remove one attribute' },
  heal_potion_c: { g: 'C', n: 'Lesser Heal Potion', e: 'heal10', price: 50, shopSells: true, desc: '+10% HP' },
  mana_potion_c: { g: 'C', n: 'Lesser Mana Potion', e: 'mana10', price: 45, shopSells: true, desc: '+10% mana' },
  energy_potion_c: { g: 'C', n: 'Lesser Energy Potion', e: 'energy10', price: 40, shopSells: true, desc: '+10% energy' },
  coin_flip: { g: 'D', n: 'Lucky Coin', e: 'coinFlip', price: 25, shopSells: true, desc: 'Heads: dbl dmg / Tails: -50% HP' },
  small_bandage: { g: 'D', n: 'Bandage', e: 'heal7', price: 15, shopSells: true, desc: '+7% HP' },
  heal_potion_e: { g: 'E', n: 'Tiny Heal', e: 'heal5', price: 8, shopSells: true, desc: '+5% HP' },
  mana_potion_e: { g: 'E', n: 'Tiny Mana', e: 'mana5', price: 7, shopSells: true, desc: '+5% mana' },
  energy_potion_e: { g: 'E', n: 'Tiny Energy', e: 'energy5', price: 6, shopSells: true, desc: '+5% energy' },
  pass_out: { g: 'F', n: 'Pass Out', e: 'kill', price: 1, shopSells: false, desc: 'You die.' },
  stale_bread: { g: 'F', n: 'Stale Bread', e: 'heal2', price: 2, shopSells: true, desc: '+2% HP' },
};

export const MONSTER_DROP_VALUE = { F: 3, E: 8, D: 18, C: 40, B: 90, A: 180, S: 400 };

export const ADMIN_CODES = {
  KISHEL_DEV: {
    note: 'Developer god preset',
    attrs: [
      { key: 'slash', grade: 'S' }, { key: 'replenish', grade: 'S' },
      { key: 'control', grade: 'S' }, { key: 'timestop', grade: 'S' },
      { key: 'lifesteal', grade: 'A' }, { key: 'boost', grade: 'A' },
      { key: 'heal', grade: 'C' },
    ],
    affs: {
      Light: { level: 50, sub: 'Time', subLevel: 30 },
      Darkness: { level: 50, sub: 'Space', subLevel: 30 },
      Fire: { level: 30, sub: 'Lava', subLevel: 20 },
    },
    bonusLevel: 30,
    bonusCoins: 5000,
  },
};