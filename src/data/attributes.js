// ============================================================================
// KREZCENT QUEST — ATTRIBUTES (Update 5)
// ============================================================================
// 10 attributes per grade, F (weakest) -> S (strongest) = 70 total.
// Fields:  g = grade,  n = name,  d = description,  e = energy cost
//          (e: 999 = consumes ALL energy)
// Power and energy cost scale UP with grade. main.jsx implements each key
// in applyAttrEffect(). Every key below has (or will have) a handler.
// NOTE: all keys that existed before Update 5 are preserved verbatim so that
// existing saved characters keep working.
// ============================================================================

export const ATTRS = {
  // ---------------- F GRADE (cheap, minor effects) ----------------
  rest: { g: 'F', n: 'Rest',      d: 'Sleep 2s, regain 8% HP',            e: 0 , cd: 6 },
  charge: { g: 'F', n: 'Charge',    d: '+10% move speed for 3s',            e: 5 , cd: 6 },
  thorn: { g: 'F', n: 'Thorn',     d: '+5% damage next hit, -3% HP',       e: 3 , cd: 2 },
  spark: { g: 'F', n: 'Spark',     d: 'Zap target for 8 damage',           e: 4 , cd: 2 },
  twitch: { g: 'F', n: 'Twitch',    d: 'Tiny instant 24px hop any way',     e: 2 , cd: 1.5 },
  flick: { g: 'F', n: 'Flick',     d: 'Flick a pebble: 6 damage',          e: 2 , cd: 2 },
  whistle: { g: 'F', n: 'Whistle',   d: 'Distract nearest enemy 1s',         e: 3 , cd: 4 },
  stretch: { g: 'F', n: 'Stretch',   d: 'Regain 5% energy over 2s',          e: 0 , cd: 5 },
  pebble: { g: 'F', n: 'Pebble',    d: 'Toss a rock, 10 damage + tiny stun',e: 5 , cd: 2 },
  hop: { g: 'F', n: 'Hop',       d: 'Short forward hop, brief i-frames', e: 4 , cd: 3 },

  // ---------------- E GRADE (mobility & light utility) ----------------
  trouble: { g: 'E', n: 'Trouble',   d: 'Dash left',                         e: 8 , cd: 3 },
  fold: { g: 'E', n: 'Fold',      d: 'Dash right',                        e: 8 , cd: 3 },
  trip: { g: 'E', n: 'Trip',      d: 'Dash backward',                     e: 8 , cd: 3 },
  click: { g: 'E', n: 'Click',     d: 'Dash forward',                      e: 8 , cd: 3 },
  roll: { g: 'E', n: 'Roll',      d: 'Long dodge with 1s invuln',         e: 12 , cd: 3 },
  sidestep: { g: 'E', n: 'Sidestep',  d: 'Quick strafe + 0.5s invuln',        e: 9 , cd: 4 },
  vault: { g: 'E', n: 'Vault',     d: 'Leap 150px toward aim',             e: 11 , cd: 5 },
  jab: { g: 'E', n: 'Jab',       d: 'Quick poke: 18 damage',             e: 9 , cd: 3 },
  smokelet: { g: 'E', n: 'Smokelet',  d: 'Brief 1s blind on nearest enemy',   e: 10 , cd: 3 },
  dartstep: { g: 'E', n: 'Dartstep',  d: 'Dash to aim + 12 damage on arrival',e: 13 , cd: 4 },

  // ---------------- D GRADE (control begins) ----------------
  confuse: { g: 'D', n: 'Confuse',   d: 'Stun target 3s',                    e: 15 , cd: 5 },
  direct: { g: 'D', n: 'Direct',    d: 'Next attack cannot miss',           e: 10 , cd: 5 },
  fuse: { g: 'D', n: 'Fuse',      d: 'Drop a bomb, explodes in 3s (80)',  e: 18 , cd: 5 },
  smoke: { g: 'D', n: 'Smoke',     d: 'Blind nearest enemy 1.5s',          e: 12 , cd: 5 },
  snare: { g: 'D', n: 'Snare',     d: 'Root nearest enemy 2s',             e: 16 , cd: 8 },
  dazzle: { g: 'D', n: 'Dazzle',    d: 'Blind all nearby enemies 1.5s',     e: 19 , cd: 7 },
  quickstep: { g: 'D', n: 'Quickstep', d: '+25% speed for 4s',                 e: 14 , cd: 6 },
  parry: { g: 'D', n: 'Parry',     d: 'Block + reflect next melee hit',    e: 16 , cd: 8 },
  bashlet: { g: 'D', n: 'Bashlet',   d: 'Shove nearest enemy back + 20 dmg', e: 15 , cd: 5 },
  ironskin: { g: 'D', n: 'Iron Skin', d: '-25% damage taken for 4s',          e: 18 , cd: 9 },

  // ---------------- C GRADE (sustain & buffs) ----------------
  heal: { g: 'C', n: 'Heal',      d: 'Restore 15% max HP',                e: 20 , cd: 10 },
  manamore: { g: 'C', n: 'Manamore',  d: '+30% mana, -30% energy',            e: 0 , cd: 7 },
  barrier: { g: 'C', n: 'Barrier',   d: 'Block next 80 damage',              e: 18 , cd: 7 },
  surge: { g: 'C', n: 'Surge',     d: 'Restore 25% energy',                e: 0 , cd: 7 },
  regen: { g: 'C', n: 'Regen',     d: 'Heal 3% max HP/sec for 5s',         e: 22 , cd: 12 },
  cleanse: { g: 'C', n: 'Cleanse',   d: 'Remove all debuffs on self',        e: 18 , cd: 10 },
  focus: { g: 'C', n: 'Focus',     d: '+20% affinity damage for 5s',       e: 24 , cd: 9 },
  warcry: { g: 'C', n: 'War Cry',   d: 'Fear all nearby enemies 2s',        e: 26 , cd: 12 },
  lull: { g: 'C', n: 'Lull',      d: 'Slow all nearby enemies 40% for 4s',e: 23 , cd: 8 },
  footwork: { g: 'C', n: 'Footwork',  d: '+15% speed + 0.4s i-frame dashes 6s',e: 21 , cd: 8 },

  // ---------------- B GRADE (strong utility) ----------------
  dust: { g: 'B', n: 'Dust',      d: 'Blind target 4s',                   e: 22 , cd: 10 },
  steal: { g: 'B', n: 'Steal',     d: 'Steal an item (all energy)',        e: 999 , cd: 10 },
  sky: { g: 'B', n: 'Sky',       d: 'Jump, evade all attacks 4s',        e: 25 , cd: 10 },
  rage: { g: 'B', n: 'Rage',      d: '+30% damage for 5s',                e: 25 , cd: 10 },
  frenzy: { g: 'B', n: 'Frenzy',    d: '+40% attack speed for 5s',          e: 27 , cd: 14 },
  blink: { g: 'B', n: 'Blink',     d: 'Teleport to aim (250px)',           e: 24 , cd: 7 },
  fortify: { g: 'B', n: 'Fortify',   d: 'Block next 200 damage',             e: 28 , cd: 14 },
  siphon: { g: 'B', n: 'Siphon',    d: 'Drain 12% of nearest enemy HP',     e: 26 , cd: 9 },
  quake: { g: 'B', n: 'Quake',     d: 'Stun all nearby enemies 1.5s',      e: 30 , cd: 12 },
  mirror: { g: 'B', n: 'Mirror',    d: 'Reflect projectiles for 3s',        e: 28 , cd: 14 },

  // ---------------- A GRADE (powerful) ----------------
  boost: { g: 'A', n: 'Boost',     d: '+20% damage for 3s',                e: 30 , cd: 10 },
  reflect: { g: 'A', n: 'Reflect',   d: 'Reflect next attack + 50 shield',   e: 30 , cd: 14 },
  recycle: { g: 'A', n: 'Recycle',   d: 'Next skill costs half energy',      e: 15 , cd: 14 },
  pressure: { g: 'A', n: 'Pressure',  d: 'Slow all enemies -70% for 4s',      e: 35 , cd: 14 },
  lifesteal: { g: 'A', n: 'LifeSteal', d: 'Drain 20% of target max HP',        e: 35 , cd: 10 },
  clone: { g: 'A', n: 'Clone',     d: 'Decoy + 120 shield for 6s',         e: 30 , cd: 14 },
  overcharge: { g: 'A', n: 'Overcharge',d: '+50% damage but -5% HP/sec for 4s', e: 32 , cd: 18 },
  vanish: { g: 'A', n: 'Vanish',    d: 'Invisible & untargetable 3s',       e: 34 , cd: 18 },
  bulwark: { g: 'A', n: 'Bulwark',   d: '-60% damage taken for 4s',          e: 36 , cd: 16 },
  execute: { g: 'A', n: 'Execute',   d: 'Kill target below 25% HP',          e: 40 , cd: 14 },

  // ---------------- S GRADE (ultimate) ----------------
  control: { g: 'S', n: 'Control',   d: 'Take over an enemy 4s',             e: 50 , cd: 18 },
  replenish: { g: 'S', n: 'Replenish', d: 'Full HP and mana',                  e: 0 , cd: 14 },
  slash: { g: 'S', n: 'Slash',     d: 'Instantly kill target (all energy)',e: 999 , cd: 45 },
  timestop: { g: 'S', n: 'TimeStop',  d: 'Freeze all enemies 4s',             e: 60 , cd: 40 },
  apex: { g: 'S', n: 'Apex',      d: '+80% damage for 6s',                e: 55 , cd: 30 },
  rewind: { g: 'S', n: 'Rewind',    d: 'Restore HP/mana/energy to 4s ago',  e: 50 , cd: 45 },
  immortal: { g: 'S', n: 'Immortal',  d: 'Cannot drop below 1 HP for 5s',     e: 60 , cd: 40 },
  annihilate: { g: 'S', n: 'Annihilate',d: 'Massive 600 blast at aim',          e: 65 , cd: 35 },
  dominion: { g: 'S', n: 'Dominion',  d: 'Stun + 50% slow ALL enemies 5s',    e: 65 , cd: 30 },
  ascend: { g: 'S', n: 'Ascend',    d: 'Full heal + invuln + 2x dmg 4s',    e: 70 , cd: 60 },
};

// Auto-built lookup by grade.
export const ATTRS_BY_GRADE = Object.entries(ATTRS).reduce((a, [k, v]) => {
  (a[v.g] ||= []).push(k); return a;
}, {});