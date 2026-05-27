import './index.css';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

import { ATTRS, ATTRS_BY_GRADE } from './data/attributes.js';
import { AFFS, SUB_WEAK, SUB_COLOR, ABILITIES, SUB_ABILITIES } from './data/affinities.js';
import { WEAPONS, STARTER_WEAPONS, DROPPABLE_WEAPONS, weaponDamageAt, weaponUpgradeCost, weaponMaxOutCost, MAX_WEAPON_LEVEL } from './data/weapons.js';
import { ARMORS, ARMOR_SHOP, DROPPABLE_ARMORS, armorReductionAt, armorMoveMod, armorUpgradeCost, MAX_ARMOR_LEVEL } from './data/armor.js';
import { ITEMS, MONSTER_DROP_VALUE, ADMIN_CODES, MAX_STACK } from './data/items.js';
import { MONSTER_TYPES } from './data/monsters.js';
import { bossForFloor, BOSS_AI_PATTERNS } from './data/bosses.js';
import { MYSTERY_BOXES, ATTRIBUTE_TRAINER, WEAPON_SHOP, rollMysteryBoxGrade, rollMysteryBoxWeapon } from './data/shops.js';
import { ZONES, INTERIORS } from './data/zones.js';

import { AudioMgr } from './engine/audio.js';
import { StorageMgr } from './engine/storage.js';
import { SaveAdapter } from './engine/save-adapter.js';
import { generateFloor, updateHazards, updateFog, themeForFloor } from './engine/floor-gen.js';
import { floorEffect, floorTheme } from './data/floors.js';
import {
  rand, pick, clamp,
  rollCharacterAttrs, rollCharacterAffinities, pickAttrByGrade,
  affinityMultiplier, floorLootGrade, rollItemOfGrade, simpleHash
} from './engine/helpers.js';

const MAX_EQUIPPED_ATTRS = 7;
const MAX_LEARNED_ATTRS = 25;
const MAX_EQUIPPED_ABILITIES = 5;

function migrateChar(c) {
  if (!c) return c;
  if (!c.expression) c.expression = 'neutral';
  if (!c.outfit) c.outfit = 'tunic';
  if (!c.clothColor) c.clothColor = '#5b21b6';
  if (!c.equippedAttrs) c.equippedAttrs = (c.attrs || []).slice(0, MAX_EQUIPPED_ATTRS).map(a => a.key);
  if (!c.knownAbilities) c.knownAbilities = {};
  for (const [aff, data] of Object.entries(c.affinities || {})) {
    const list = ABILITIES[aff] || [];
    c.knownAbilities[aff] = list.filter(a => a.lvl <= data.level).map(a => a.n);
    if (data.sub) {
      const slist = SUB_ABILITIES[data.sub] || [];
      c.knownAbilities[data.sub] = slist.filter(a => a.lvl <= (data.subLevel || 1)).map(a => a.n);
    }
  }
  if (!c.equippedAbilityList) c.equippedAbilityList = [];
  if (!c.ownedWeapons) c.ownedWeapons = [c.weapon];
  if (!c.ownedWeapons.includes(c.weapon)) c.ownedWeapons.push(c.weapon);
  // Weapon upgrade levels (Update 8): every owned weapon defaults to level 1.
  if (!c.weaponLevels) c.weaponLevels = {};
  for (const wk of c.ownedWeapons) { if (!c.weaponLevels[wk]) c.weaponLevels[wk] = 1; }
  // Armor (Update 9): owned set, per-armor levels, currently-equipped (none by default).
  if (!c.ownedArmors) c.ownedArmors = [];
  if (!c.armorLevels) c.armorLevels = {};
  for (const ak of c.ownedArmors) { if (!c.armorLevels[ak]) c.armorLevels[ak] = 1; }
  if (c.armor === undefined) c.armor = null;
  if (!c.statusEffects) c.statusEffects = [];
  if (c.maxCoins == null || c.maxCoins < c.coins) c.maxCoins = c.coins;
  return c;
}

function KrezcentQuest() {
  const [screen, setScreen] = useState('login');
  const [account, setAccount] = useState(null);
  const [char, setChar] = useState(null);
  const [msg, setMsg] = useState('');
  const [modal, setModal] = useState(null);
  const [shopTab, setShopTab] = useState('buy');
  const [pvpOpp, setPvpOpp] = useState(null);
  const [loadoutTab, setLoadoutTab] = useState('abilities');
  const [loadoutAffFilter, setLoadoutAffFilter] = useState('All');
  const [boxSpin, setBoxSpin] = useState(null);
  const [trainerGrade, setTrainerGrade] = useState('F');
  const [vp, setVp] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 1024, h: typeof window !== 'undefined' ? window.innerHeight : 768 });

  // Lightweight tick state for HUD only — modals don't subscribe to this
  const [hudTick, setHudTick] = useState(0);

  const world = useRef({
    zone: null, floor: 1,
    player: { x: 100, y: 400, dir: 0, speed: 220, lastAttack: 0, invuln: 0, sky: 0, stun: 0, blind: 0, slow: 0, shield: 0, buffs: {}, cooldowns: {}, animTime: 0, moving: false, tileX: 0, tileY: 0 },
    maze: null,
    npcs: [],
    projectiles: [],
    effects: [],
    keys: {}, mouse: { x: 0, y: 0 },
    lastFrame: 0,
    interactPrompt: '',
    floats: [],
    timeOfDay: 0,
  });
  const charRef = useRef(null);
  const modalRef = useRef(null);
  const screenRef = useRef('login');
  const vpRef = useRef(vp);
  const canvasRef = useRef(null);

  useEffect(() => { charRef.current = char; }, [char]);
  useEffect(() => { modalRef.current = modal; }, [modal]);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { vpRef.current = vp; }, [vp]);

  // Auto-dismiss the notification toast after 5 seconds (Update 10).
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(''), 5000);
    return () => clearTimeout(t);
  }, [msg]);

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const kd = (e) => {
      const w = world.current;
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      w.keys[key] = true;
      if (e.key === 'Tab') { e.preventDefault(); if (charRef.current) setModal(m => m === 'inventory' ? null : 'inventory'); return; }
      if (key === 'c' && screenRef.current === 'world') { setModal(m => m === 'stats' ? null : 'stats'); return; }
      if (key === 'l' && screenRef.current === 'world') { setModal(m => m === 'loadout' ? null : 'loadout'); return; }
      if (e.key === 'Escape') { setModal(null); return; }
      if (screenRef.current === 'world' && !modalRef.current) {
        if (e.key === ' ') { e.preventDefault(); tryInteract(); }
        if (key === 'j') doBasicAttack();
        if (['1','2','3','4','5','6','7'].includes(e.key)) useAttribute(parseInt(e.key) - 1);
        if (['q','e','r','f','g'].includes(key)) useAffinitySlot(key);
      }
    };
    const ku = (e) => { world.current.keys[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  // Game loop — no longer triggers React re-renders for modals
  useEffect(() => {
    if (screen !== 'world') return;
    let raf;
    const loop = (t) => {
      const w = world.current;
      const dt = Math.min(0.05, (t - (w.lastFrame || t)) / 1000);
      w.lastFrame = t;
      try {
        if (!modalRef.current) update(dt);
        drawWorld();
      } catch (err) {
        // A single bad frame must never permanently freeze the game loop.
        console.error('[game loop] recovered from error:', err);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [screen]);

  // HUD updates at 4fps (just for HP bars, status icons) — does NOT cause modal scroll resets
  useEffect(() => {
    if (screen !== 'world') return;
    const i = setInterval(() => {
      if (!modalRef.current) setHudTick(t => (t + 1) % 1000);
    }, 250);
    return () => clearInterval(i);
  }, [screen]);

  useEffect(() => {
    if (screen !== 'world') return;
    const i = setInterval(() => saveCharacter(), 30000);
    return () => clearInterval(i);
  }, [screen, account]);

  function update(dt) {
    const w = world.current;
    const c = charRef.current;
    if (!c) return;
    const p = w.player;
    w.timeOfDay += dt;
    c.mana = clamp(c.mana + c.maxMana * 0.05 * dt * (hasStatus(c, 'curse') ? 0.5 : 1), 0, c.maxMana);
    c.energy = clamp(c.energy + c.maxEnergy * 0.05 * dt, 0, c.maxEnergy);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.sky > 0) p.sky -= dt;
    if (p.stun > 0) p.stun -= dt;
    if (p.blind > 0) p.blind -= dt;
    if (p.slow > 0) p.slow -= dt;
    if (p.confused > 0) p.confused -= dt;
    if (p.silenced > 0) p.silenced -= dt;
    if (p.slipTimer > 0) p.slipTimer -= dt;
    for (const k of Object.keys(p.buffs)) { p.buffs[k] -= dt; if (p.buffs[k] <= 0) delete p.buffs[k]; }
    // Tick ability/attribute cooldowns
    if (p.cooldowns) { for (const k of Object.keys(p.cooldowns)) { p.cooldowns[k] -= dt; if (p.cooldowns[k] <= 0) delete p.cooldowns[k]; } }
    // Update 5 attribute buffs
    if (p.buffs.regen) c.hp = clamp(c.hp + c.maxHp * 0.03 * dt, 0, c.maxHp);
    if (p.buffs.energyRegen) c.energy = clamp(c.energy + c.maxEnergy * 0.025 * dt, 0, c.maxEnergy);
    if (p.buffs.overcharge) { c.hp = Math.max(1, c.hp - c.maxHp * 0.05 * dt); }
    // Rewind snapshot ring buffer (~4s ago)
    p.rewindAcc = (p.rewindAcc || 0) + dt;
    if (p.rewindAcc >= 0.5) {
      p.rewindAcc = 0;
      p.rewindHistory = p.rewindHistory || [];
      p.rewindHistory.push({ hp: c.hp, mana: c.mana, energy: c.energy });
      if (p.rewindHistory.length > 8) p.rewindHistory.shift();
      p.rewindSnap = p.rewindHistory[0];
    }
    tickPlayerStatuses(c, dt);

    let moving = false;
    if (p.stun <= 0) {
      let dx = 0, dy = 0;
      if (w.keys['w'] || w.keys['arrowup']) dy -= 1;
      if (w.keys['s'] || w.keys['arrowdown']) dy += 1;
      if (w.keys['a'] || w.keys['arrowleft']) dx -= 1;
      if (w.keys['d'] || w.keys['arrowright']) dx += 1;
      if (dx || dy) {
        moving = true;
        if (p.confused > 0) { dx = -dx; dy = -dy; }
        const len = Math.hypot(dx, dy);
        dx /= len; dy /= len;
        p.dir = Math.atan2(dy, dx);
        let spd = p.speed;
        if (c.armor) spd *= armorMoveMod(c.armor);
        if (p.buffs.charge) spd *= 1.1;
        if (p.buffs.quickstep) spd *= 1.25;
        if (p.buffs.footwork) spd *= 1.15;
        if (p.slow > 0) spd *= 0.5;
        if (p.sky > 0) spd *= 1.3;
        if (hasStatus(c, 'freeze')) spd *= 0.55;
        const nx = p.x + dx * spd * dt;
        const ny = p.y + dy * spd * dt;
        if (!collidesWall(nx, p.y, false)) p.x = nx;
        if (!collidesWall(p.x, ny, false)) p.y = ny;
        if (p.slipTimer > 0) { p.slipVx = dx * spd; p.slipVy = dy * spd; }
      }
    }
    // Slippery ice: glide a bit after releasing keys
    if (p.slipTimer > 0 && !moving && (Math.abs(p.slipVx || 0) > 1 || Math.abs(p.slipVy || 0) > 1)) {
      const sx = p.x + (p.slipVx || 0) * dt, sy = p.y + (p.slipVy || 0) * dt;
      if (!collidesWall(sx, p.y, false)) p.x = sx;
      if (!collidesWall(p.x, sy, false)) p.y = sy;
      p.slipVx = (p.slipVx || 0) * 0.92; p.slipVy = (p.slipVy || 0) * 0.92;
    }
    p.moving = moving;
    if (moving) p.animTime += dt; else p.animTime = 0;
    p.tileX = Math.floor(p.x / 40);
    p.tileY = Math.floor(p.y / 40);

    if (w.maze) {
      const fx = w.maze.floorEffect;
      // Fog of war — maze and 'darkness' floors use a tighter vision radius
      const fogRadius = (w.maze.type === 'maze' || fx === 'darkness') ? 3 : 5;
      updateFog(w.maze, p.tileX, p.tileY, fogRadius);

      // Per-floor environmental effect
      applyFloorEffect(w, c, p, dt, fx);

      // Collectable loot pickups — grab on walk-over.
      if (w.maze.loot) {
        for (const orb of w.maze.loot) {
          if (orb.taken) continue;
          if (Math.hypot(orb.x * 40 + 20 - p.x, orb.y * 40 + 20 - p.y) < 30) collectFloorLoot(orb);
        }
      }

      // Magma/lava tiles (tile 3) burn the player while standing on them
      const standTile = w.maze.grid[p.tileY] ? w.maze.grid[p.tileY][p.tileX] : undefined;
      if (standTile === 3) {
        w.lavaBurnAcc = (w.lavaBurnAcc || 0) + dt;
        if (w.lavaBurnAcc >= 0.5) {
          w.lavaBurnAcc = 0;
          damagePlayer(Math.ceil(c.maxHp * 0.02), 'Fire');
          addFloat(p.x, p.y - 30, 'BURN', '#ff7043');
        }
      } else {
        w.lavaBurnAcc = 0;
      }

      // Hazards
      const events = updateHazards(w.maze, dt, p.tileX, p.tileY, p.x, p.y);
      for (const ev of events) {
        if (ev.kind === 'spike') damagePlayer(ev.dmg, null);
        else if (ev.kind === 'firevent') damagePlayer(ev.dmg, 'Fire');
        else if (ev.kind === 'lightning') damagePlayer(ev.dmg, 'Lightning');
        else if (ev.kind === 'healflower') {
          c.hp = clamp(c.hp + c.maxHp * ev.heal, 0, c.maxHp);
          addFloat(p.x, p.y - 30, '+heal', '#69f0ae');
        }
      }
      // Spawn arrow projectiles
      for (const h of w.maze.hazards) {
        if (h.kind === 'arrow' && h.fireNow) {
          h.fireNow = false;
          const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
          const [adx, ady] = dirs[h.dir % 4];
          w.projectiles.push({
            x: h.x * 40 + 20, y: h.y * 40 + 20,
            vx: adx * 280, vy: ady * 280, life: 1.6,
            dmg: h.dmg, aff: null, fromPlayer: false, color: '#fff59d',
          });
        }
      }
    }

    // Projectiles
    w.projectiles = w.projectiles.filter(pr => {
      // Homing: gently steer toward the nearest living monster
      if (pr.homing && pr.fromPlayer && w.maze) {
        let best = null, bd = 1e9;
        for (const m of w.maze.monsters) { if (m.hp <= 0) continue; const d = Math.hypot(m.x * 40 + 20 - pr.x, m.y * 40 + 20 - pr.y); if (d < bd) { bd = d; best = m; } }
        if (best) {
          const sp = Math.hypot(pr.vx, pr.vy) || 400;
          const cur2 = Math.atan2(pr.vy, pr.vx);
          const want = Math.atan2(best.y * 40 + 20 - pr.y, best.x * 40 + 20 - pr.x);
          let da = want - cur2; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
          const na = cur2 + Math.max(-0.14, Math.min(0.14, da));
          pr.vx = Math.cos(na) * sp; pr.vy = Math.sin(na) * sp;
        }
      }
      // Return arc (boomerang / chakram): curve back to the player past the apex
      if (pr.returns && pr.fromPlayer) {
        pr.age = (pr.age || 0) + dt;
        if (pr.age > pr.turnAt) {
          if (!pr.cleared && pr.hitSet) { pr.hitSet.clear(); pr.cleared = true; }
          const sp = Math.hypot(pr.vx, pr.vy) || 320;
          const a = Math.atan2(p.y - pr.y, p.x - pr.x);
          pr.vx = Math.cos(a) * sp; pr.vy = Math.sin(a) * sp;
          if (Math.hypot(pr.x - p.x, pr.y - p.y) < 24) return false;
        }
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      pr.spin = (pr.spin || 0) + dt * 18;
      if (pr.life <= 0) { if (pr.explodeRadius) explodeProjectile(pr); return false; }
      if (collidesWall(pr.x, pr.y, true)) {
        if (pr.bounces && pr.bounces > 0) {
          pr.bounces -= 1;
          if (!collidesWall(pr.x - pr.vx * dt * 2, pr.y, true)) pr.vx = -pr.vx;
          else if (!collidesWall(pr.x, pr.y - pr.vy * dt * 2, true)) pr.vy = -pr.vy;
          else { pr.vx = -pr.vx; pr.vy = -pr.vy; }
          pr.x += pr.vx * dt; pr.y += pr.vy * dt;
        } else { if (pr.explodeRadius) explodeProjectile(pr); return false; }
      }
      if (pr.fromPlayer && w.maze) {
        for (const m of w.maze.monsters) {
          if (m.hp <= 0) continue;
          if (pr.hitSet && pr.hitSet.has(m)) continue;
          const mx = m.x * 40 + 20, my = m.y * 40 + 20;
          if (Math.hypot(pr.x - mx, pr.y - my) < 22) {
            let d = pr.dmg;
            if (pr.pierceRamp) d *= (1 + (pr.pierced || 0) * pr.pierceRamp);
            if (pr.longshot) d *= 1 + pr.longshot * Math.min(1, Math.hypot(pr.x - pr.ox, pr.y - pr.oy) / (pr.maxRange || 300));
            damageMonster(m, d, pr.aff);
            if (pr.poison) applyMonsterDot(m, pr.poison.dps, pr.poison.dur, '#9ccc65');
            if (pr.knockback) pushMonster(m, p.x, p.y, pr.knockback);
            if (pr.explodeRadius) { explodeProjectile(pr); return false; }
            if (pr.pierce) { pr.pierced = (pr.pierced || 0) + 1; if (pr.hitSet) pr.hitSet.add(m); }
            else return false;
          }
        }
        if (!w.maze.boss.defeated && w.maze.bossHp != null && !pr.hitBoss) {
          if (Math.hypot(pr.x - w.maze.bossPx, pr.y - w.maze.bossPy) < 35) {
            let d = pr.dmg;
            if (pr.pierceRamp) d *= (1 + (pr.pierced || 0) * pr.pierceRamp);
            if (pr.longshot) d *= 1 + pr.longshot * Math.min(1, Math.hypot(pr.x - pr.ox, pr.y - pr.oy) / (pr.maxRange || 300));
            damageBoss(d, pr.aff);
            if (pr.explodeRadius) { explodeProjectile(pr); return false; }
            if (pr.pierce) pr.hitBoss = true; else return false;
          }
        }
      } else if (!pr.fromPlayer) {
        if (Math.hypot(pr.x - p.x, pr.y - p.y) < 18 && p.invuln <= 0 && p.sky <= 0) {
          damagePlayer(pr.dmg, pr.aff);
          applyOnHitStatus(c, pr.onHitStatus);
          return false;
        }
      }
      return true;
    });

    w.effects = w.effects.filter(ef => {
      if (ef.life0 === undefined) ef.life0 = ef.life;
      ef.life -= dt;
      // Orbit/nova that follow the player track its position each frame
      if (ef.follow) { ef.x = p.x; ef.y = p.y; }
      // Lingering damage fields tick every 0.3s; each tick deals 35% of listed damage.
      if (ef.type === 'field' && ef.fromPlayer && w.maze) {
        ef.tickAcc = (ef.tickAcc || 0) + dt;
        if (ef.tickAcc >= 0.3) {
          ef.tickAcc = 0;
          const per = ef.dmg * 0.35;
          for (const m of w.maze.monsters) { if (m.hp <= 0) continue; if (Math.hypot(m.x * 40 + 20 - ef.x, m.y * 40 + 20 - ef.y) < ef.radius) damageMonster(m, per, ef.aff); }
          if (!w.maze.boss.defeated && w.maze.bossHp != null && Math.hypot(w.maze.bossPx - ef.x, w.maze.bossPy - ef.y) < ef.radius + 20) damageBoss(per, ef.aff);
        }
      }
      // Boss-owned lingering fields tick damage onto the player
      if (ef.type === 'field' && !ef.fromPlayer && w.maze) {
        ef.tickAcc = (ef.tickAcc || 0) + dt;
        if (ef.tickAcc >= 0.4) {
          ef.tickAcc = 0;
          if (Math.hypot(ef.x - p.x, ef.y - p.y) < ef.radius && p.invuln <= 0 && p.sky <= 0) damagePlayer(ef.dmg * 0.18, ef.aff);
        }
      }
      if (ef.delay !== undefined) {
        ef.delay -= dt;
        if (ef.delay <= 0 && !ef.detonated) {
          ef.detonated = true;
          if (ef.fromPlayer && w.maze) {
            for (const m of w.maze.monsters) {
              if (m.hp <= 0) continue;
              const mx = m.x * 40 + 20, my = m.y * 40 + 20;
              if (Math.hypot(ef.x - mx, ef.y - my) < ef.radius) damageMonster(m, ef.dmg, ef.aff);
            }
            if (!w.maze.boss.defeated && w.maze.bossHp != null) {
              if (Math.hypot(ef.x - w.maze.bossPx, ef.y - w.maze.bossPy) < ef.radius + 20) damageBoss(ef.dmg, ef.aff);
            }
          } else if (!ef.fromPlayer) {
            if (Math.hypot(ef.x - p.x, ef.y - p.y) < ef.radius && p.invuln <= 0 && p.sky <= 0) damagePlayer(ef.dmg, ef.aff);
          }
        }
      }
      return ef.life > 0;
    });

    if (w.maze) {
      // Monsters
      for (const m of w.maze.monsters) {
        if (m.hp == null) {
          const t = MONSTER_TYPES[m.type];
          const fm = 1 + (w.floor - 1) * 0.18;
          m.hp = t.hp * fm; m.maxHp = m.hp; m.dmg = t.dmg * fm;
          m.aff = t.aff; m.aiCooldown = rand() * 0.8; m.stun = 0; m.slow = 0; m.animTime = 0;
          m.lunge = 0; m.lungeTarget = null;
        }
        if (m.hp <= 0) continue;
        if (m.dots && m.dots.length) {
          for (const d of m.dots) { d.t -= dt; d.acc += dt; if (d.acc >= 0.5) { const tk = Math.ceil(d.dps * d.acc); m.hp -= tk; addFloat(m.x * 40 + 20, m.y * 40 + 8, '-' + tk, d.color); d.acc = 0; } }
          m.dots = m.dots.filter(d => d.t > 0);
          if (m.hp <= 0) { onMonsterDeath(m); continue; }
        }
        if (m.freeze > 0) m.freeze -= dt;
        if (m.stun > 0) { m.stun -= dt; continue; }
        if (m.slow > 0) m.slow -= dt;
        const t = MONSTER_TYPES[m.type];
        const wallphase = !!t.wallphase;
        const mx = m.x * 40 + 20, my = m.y * 40 + 20;
        const distToPlayer = Math.hypot(p.x - mx, p.y - my);
        const range = t.ranged ? 260 : 280;
        m.animTime += dt;

        if (m.lunge > 0) {
          m.lunge -= dt;
          if (m.lunge <= 0 && m.lungeTarget) {
            const ldx = p.x - m.lungeTarget.x, ldy = p.y - m.lungeTarget.y;
            if (Math.hypot(ldx, ldy) < 55 && p.invuln <= 0 && p.sky <= 0) {
              damagePlayer(m.dmg, m.aff);
              applyOnHitStatus(c, t.attack);
              applyKnockback(p, t.attack, ldx, ldy);
            }
            m.lungeTarget = null;
          }
          continue;
        }

        if (distToPlayer < range && p.sky <= 0) {
          const dxn = (p.x - mx) / distToPlayer, dyn = (p.y - my) / distToPlayer;
          let spd = t.spd * 60;
          if (m.slow > 0) spd *= 0.4;
          const stepX = m.x + dxn * spd * dt / 40;
          const stepY = m.y + dyn * spd * dt / 40;
          if (wallphase || canMonsterStand(stepX, m.y)) m.x = stepX;
          if (wallphase || canMonsterStand(m.x, stepY)) m.y = stepY;
          m.aiCooldown -= dt;
          if (m.aiCooldown <= 0) {
            m.aiCooldown = 1.5;
            if (t.ranged && distToPlayer > 70 && distToPlayer < range) {
              const ang = Math.atan2(p.y - my, p.x - mx);
              w.projectiles.push({
                x: mx, y: my,
                vx: Math.cos(ang) * 200, vy: Math.sin(ang) * 200,
                life: 2.5, dmg: m.dmg, aff: m.aff, fromPlayer: false,
                color: m.aff ? (AFFS[m.aff]?.color || SUB_COLOR[m.aff] || '#fff') : '#fff',
                onHitStatus: t.attack,
              });
            } else if (distToPlayer < 60) {
              m.lunge = 0.35;
              m.lungeTarget = { x: p.x, y: p.y };
            }
          }
        }
      }

      if (w.maze.boss && !w.maze.boss.defeated) {
        if (w.maze.bossHp == null) initBoss(w);
        if (w.maze.bossDots && w.maze.bossDots.length) {
          for (const d of w.maze.bossDots) { d.t -= dt; d.acc += dt; if (d.acc >= 0.5) { const tk = Math.ceil(d.dps * d.acc); w.maze.bossHp -= tk; addFloat(w.maze.bossPx, w.maze.bossPy - 30, '-' + tk, d.color); d.acc = 0; } }
          w.maze.bossDots = w.maze.bossDots.filter(d => d.t > 0);
          if (w.maze.bossHp <= 0) onBossDefeat();
        }
        if (!w.maze.boss.defeated) updateBoss(w, c, p, dt);
      }
    }

    w.floats = w.floats.map(f => ({ ...f, life: f.life - dt, y: f.y - dt * 30 })).filter(f => f.life > 0);
    if (w.gateCooldown) { w.gateCooldown -= dt; if (w.gateCooldown <= 0) w.gateCooldown = 0; }
    if (c && (c.maxCoins == null || c.coins > c.maxCoins)) c.maxCoins = c.coins;
    updateInteractPrompt();
    checkZoneTransitions();
  }

  function hasStatus(c, kind) { return (c.statusEffects || []).some(s => s.kind === kind); }
  function isStatusImmune(p) { return p.buffs && p.buffs.statusImmune > 0; }

  function addStatus(c, status) {
    c.statusEffects = c.statusEffects || [];
    const existing = c.statusEffects.find(s => s.kind === status.kind);
    if (existing) { existing.dur = Math.max(existing.dur, status.dur); Object.assign(existing, status); }
    else c.statusEffects.push({ ...status });
  }
  function tickPlayerStatuses(c, dt) {
    if (!c.statusEffects) return;
    for (let i = c.statusEffects.length - 1; i >= 0; i--) {
      const s = c.statusEffects[i];
      s.dur -= dt;
      if (s.kind === 'burn' || s.kind === 'poison') {
        s.tick = (s.tick || 0) + dt;
        if (s.tick >= 0.5) {
          s.tick = 0;
          const dmg = Math.floor((s.dps || 5) * 0.5);
          c.hp = Math.max(0, c.hp - dmg);
          addFloat(world.current.player.x, world.current.player.y - 30, '-' + dmg, s.kind === 'burn' ? '#ff7043' : '#9ccc65');
        }
      }
      if (s.dur <= 0) c.statusEffects.splice(i, 1);
    }
    if (c.hp <= 0) onPlayerDeath();
  }
  function applyOnHitStatus(c, attack) {
    if (!attack || attack.kind === 'normal') return;
    const p = world.current.player;
    // Status immunity: any monster/boss-applied status is blocked.
    if (isStatusImmune(p)) { addFloat(p.x, p.y - 40, 'IMMUNE', '#ffd54f'); return; }
    switch (attack.kind) {
      case 'freeze': addStatus(c, { kind: 'freeze', dur: attack.dur || 2, slow: attack.slow || 0.5 }); addFloat(p.x, p.y - 40, 'FROZEN', '#80deea'); break;
      case 'burn': addStatus(c, { kind: 'burn', dur: attack.dur || 3, dps: attack.dps || 8 }); addFloat(p.x, p.y - 40, 'BURNING', '#ff7043'); break;
      case 'poison': addStatus(c, { kind: 'poison', dur: attack.dur || 4, dps: attack.dps || 6 }); addFloat(p.x, p.y - 40, 'POISONED', '#9ccc65'); break;
      case 'blind': p.blind = Math.max(p.blind, attack.dur || 3); addFloat(p.x, p.y - 40, 'BLINDED', '#212121'); break;
      case 'shock': p.stun = Math.max(p.stun, attack.stun || 0.6); addFloat(p.x, p.y - 40, 'SHOCKED', '#fff176'); break;
      case 'curse': addStatus(c, { kind: 'curse', dur: attack.dur || 4, manaPenalty: attack.manaPenalty || 0.5 }); addFloat(p.x, p.y - 40, 'CURSED', '#9c27b0'); break;
      case 'drain': addFloat(p.x, p.y - 40, 'DRAINED', '#e91e63'); break;
      default: break;
    }
  }
  function applyKnockback(p, attack, dx, dy) {
    if (!attack || attack.kind !== 'knockback') return;
    const d = Math.hypot(dx, dy) || 1;
    const force = attack.force || 150;
    const nx = p.x + (dx / d) * force * -0.3;
    const ny = p.y + (dy / d) * force * -0.3;
    if (!collidesWall(nx, p.y, false)) p.x = nx;
    if (!collidesWall(p.x, ny, false)) p.y = ny;
    if (!isStatusImmune(p)) p.stun = Math.max(p.stun, 0.2);
  }

  function applyFloorEffect(w, c, p, dt, fx) {
    if (!fx || fx === 'none' || fx === 'lavaburn' || fx === 'darkness') return; // lavaburn handled separately; darkness via fog
    w.effectAcc = (w.effectAcc || 0) + dt;
    const moving = p.moving;
    if (fx === 'haze') {
      // Heat haze: periodic small aim wobble (handled at aim read) + faint damage when standing in it rarely
      p.aimWobble = 0.12;
    } else {
      p.aimWobble = 0;
    }
    if (w.effectAcc < 0.5) return;
    w.effectAcc = 0;
    switch (fx) {
      case 'spores':
        if (moving) { damagePlayer(Math.ceil(c.maxHp * 0.008), 'Poison Gas'); addFloat(p.x, p.y - 28, 'spores', '#9ccc65'); }
        break;
      case 'blizzard':
        p.slow = Math.max(p.slow, 1.2); damagePlayer(Math.ceil(c.maxHp * 0.006), 'Ice');
        break;
      case 'radiation':
        damagePlayer(Math.ceil(c.maxHp * 0.007), null); break;
      case 'sinking':
        if (!moving) { p.sinkAcc = (p.sinkAcc || 0) + 0.5; if (p.sinkAcc >= 1.5) { damagePlayer(Math.ceil(c.maxHp * 0.02), null); addFloat(p.x, p.y - 28, 'sinking!', '#d6b23a'); } } else { p.sinkAcc = 0; }
        break;
      case 'gravity': {
        // Periodic pull toward arena center / boss
        const cx = w.maze.bossPx || (w.maze.W * 20), cy = w.maze.bossPy || (w.maze.H * 20);
        const d = Math.hypot(cx - p.x, cy - p.y);
        if (d > 40) { const nx = p.x + (cx - p.x) / d * 26, ny = p.y + (cy - p.y) / d * 26; if (!collidesWall(nx, p.y, false)) p.x = nx; if (!collidesWall(p.x, ny, false)) p.y = ny; }
        break; }
      case 'confusion':
        if (rand() < 0.25) { p.confused = Math.max(p.confused || 0, 1.2); }
        break;
      case 'silence':
        p.silenced = 0.8; break;
      case 'slippery':
        p.slipTimer = 0.8; break;
      default: break;
    }
  }

  function initBoss(w) {
    const def = bossForFloor(w.floor);
    const fm = 1 + (w.floor - 1) * 0.18;
    const baseHp = 250 * (def.hpMult || 4);
    w.maze.bossHp = baseHp * fm;
    w.maze.bossMaxHp = w.maze.bossHp;
    w.maze.bossDmg = 25 * (def.dmgMult || 2) * fm;
    w.maze.bossAff = def.aff;
    w.maze.bossName = def.n;
    w.maze.bossColor = def.color;
    w.maze.bossShape = def.shape || 'cave_brute';
    w.maze.bossAI = def.aiPattern || BOSS_AI_PATTERNS.PROJECTILE;
    w.maze.bossData = def;
    w.maze.bossCooldown = 1.5;
    w.maze.bossPx = w.maze.bossX * 40 + 20;
    w.maze.bossPy = w.maze.bossY * 40 + 20;
    w.maze.bossShield = 0;
    w.maze.bossOrbitAngle = 0;
    w.maze.bossTelegraphTimer = 0;
    // Scripted-boss state (Update 7 dungeon overhaul)
    w.maze.bossScript = def.script || null;
    w.maze.bossPhaseIdx = -1;
    w.maze.bossMoveIdx = 0;
    w.maze.bossDmgMult = 1;
    w.maze.bossSpdMult = 1;
    w.maze.bossEnraged = false;
    w.maze.bossStun = 0;
    w.maze.bossSlow = 0;
    w.maze.bossFreeze = 0;
    w.maze.bossDots = [];
    if (def.unique) setMsg(`⚔ ${def.n} — ${def.desc || ''}`);
    else setMsg(`⚔ ${def.n} — ${def.desc || ''}`);
  }

  function updateBoss(w, c, p, dt) {
    const m = w.maze;
    if (m.bossScript) { runBossScript(w, c, p, dt); return; }
    const def = m.bossData;
    const pat = m.bossAI;
    const dist = Math.hypot(p.x - m.bossPx, p.y - m.bossPy);

    if (m.bossShield > 0) m.bossShield -= dt;
    if (m.bossTelegraphTimer > 0) m.bossTelegraphTimer -= dt;

    // Healer regenerates
    if (pat === BOSS_AI_PATTERNS.HEALER && m.bossHp < m.bossMaxHp) {
      m.bossHealTimer = (m.bossHealTimer || 0) + dt;
      if (m.bossHealTimer >= (def.healInterval || 1.5)) {
        m.bossHealTimer = 0;
        const amt = def.healRate || 20;
        m.bossHp = Math.min(m.bossMaxHp, m.bossHp + amt);
        addFloat(m.bossPx, m.bossPy - 35, '+' + amt, '#69f0ae');
      }
    }

    // Rager — recalculate damage scalar based on HP %
    let dmgMod = 1;
    if (pat === BOSS_AI_PATTERNS.RAGER) {
      const hpPct = m.bossHp / m.bossMaxHp;
      if (hpPct < (def.rageThreshold || 0.5)) dmgMod = def.rageDmgMult || 1.6;
    }

    // Movement
    if (pat === BOSS_AI_PATTERNS.ORBITER) {
      // Strafe around the player at a set radius
      m.bossOrbitAngle += (def.orbitSpeed || 1.4) * dt;
      const radius = def.orbitRadius || 200;
      const targetX = p.x + Math.cos(m.bossOrbitAngle) * radius;
      const targetY = p.y + Math.sin(m.bossOrbitAngle) * radius;
      const adx = targetX - m.bossPx, ady = targetY - m.bossPy;
      const ad = Math.hypot(adx, ady) || 1;
      const moveSp = 90 * dt;
      const stepX = m.bossPx + (adx / ad) * Math.min(moveSp, ad);
      const stepY = m.bossPy + (ady / ad) * Math.min(moveSp, ad);
      if (!collidesWall(stepX, m.bossPy, true)) m.bossPx = stepX;
      if (!collidesWall(m.bossPx, stepY, true)) m.bossPy = stepY;
    } else if (pat !== BOSS_AI_PATTERNS.TELEPORT && pat !== BOSS_AI_PATTERNS.PROJECTILE && pat !== BOSS_AI_PATTERNS.SPREADER) {
      const dxn = (p.x - m.bossPx) / Math.max(1, dist);
      const dyn = (p.y - m.bossPy) / Math.max(1, dist);
      const sp = (pat === BOSS_AI_PATTERNS.CHARGE ? (def.chargeSpeed || 5) : 1.8) * 30;
      const stepX = m.bossPx + dxn * sp * dt;
      const stepY = m.bossPy + dyn * sp * dt;
      if (!collidesWall(stepX, m.bossPy, true) && !pixelOnHazardTile(stepX, m.bossPy)) m.bossPx = stepX;
      if (!collidesWall(m.bossPx, stepY, true) && !pixelOnHazardTile(m.bossPx, stepY)) m.bossPy = stepY;
    }

    m.bossX = Math.floor(m.bossPx / 40);
    m.bossY = Math.floor(m.bossPy / 40);

    m.bossCooldown -= dt;
    if (m.bossCooldown <= 0) {
      m.bossTelegraphTimer = 0.4; // brief flash before the next action
      switch (pat) {
        case BOSS_AI_PATTERNS.PROJECTILE: m.bossCooldown = 1.0; fireBossProjectile(m, p, dmgMod); break;
        case BOSS_AI_PATTERNS.SPREADER: m.bossCooldown = def.spreadCd || 2.0; fireBossSpread(m, p, def.spreadCount || 6, dmgMod); break;
        case BOSS_AI_PATTERNS.CHARGE: m.bossCooldown = 1.8;
          if (dist < 60 && p.invuln <= 0 && p.sky <= 0) {
            damagePlayer(m.bossDmg * 0.8 * dmgMod, m.bossAff);
            applyKnockback(p, { kind: 'knockback', force: 220 }, p.x - m.bossPx, p.y - m.bossPy);
          }
          break;
        case BOSS_AI_PATTERNS.TELEPORT: {
          m.bossCooldown = def.teleportRate || 3.5;
          const ang = rand() * Math.PI * 2;
          const radius = 110 + rand() * 60;
          const tx = clamp(p.x + Math.cos(ang) * radius, 60, (m.W - 2) * 40);
          const ty = clamp(p.y + Math.sin(ang) * radius, 60, (m.H - 2) * 40);
          if (!collidesWall(tx, ty, true)) { m.bossPx = tx; m.bossPy = ty; m.bossX = Math.floor(tx / 40); m.bossY = Math.floor(ty / 40); }
          w.effects.push({ x: m.bossPx, y: m.bossPy, type: 'aoe', life: 0.3, color: m.bossColor, radius: 28 });
          fireBossProjectile(m, p, dmgMod);
          break;
        }
        case BOSS_AI_PATTERNS.HEALER: m.bossCooldown = 1.2; fireBossProjectile(m, p, dmgMod); break;
        case BOSS_AI_PATTERNS.BLINDER: {
          m.bossCooldown = def.blindInterval || 6.0;
          w.effects.push({ x: m.bossPx, y: m.bossPy, type: 'aoe', life: 0.6, color: '#212121', radius: 220 });
          if (Math.hypot(p.x - m.bossPx, p.y - m.bossPy) < 220 && p.invuln <= 0 && !isStatusImmune(p)) {
            p.blind = Math.max(p.blind, def.blindDur || 3);
            setMsg('You are blinded!');
          }
          fireBossProjectile(m, p, dmgMod);
          break;
        }
        case BOSS_AI_PATTERNS.SUMMONER: {
          m.bossCooldown = def.cooldown || 5.0;
          const summons = def.summons || ['slime'];
          for (let i = 0; i < 2; i++) {
            const summonType = pick(summons);
            const sx = m.bossX + Math.round(rand() * 4 - 2);
            const sy = m.bossY + Math.round(rand() * 4 - 2);
            if (sx > 0 && sy > 0 && sx < m.W - 1 && sy < m.H - 1 && m.grid[sy][sx] === 0) {
              m.monsters.push({ x: sx, y: sy, type: summonType, id: Math.random().toString(36).slice(2) });
            }
          }
          fireBossProjectile(m, p, dmgMod);
          break;
        }
        case BOSS_AI_PATTERNS.SHIELDER: {
          m.bossCooldown = def.shieldInterval || 8.0;
          m.bossShield = def.shieldDur || 3.0;
          setMsg(`${m.bossName} raises its guard!`);
          break;
        }
        case BOSS_AI_PATTERNS.ORBITER: {
          m.bossCooldown = 1.4;
          fireBossSpread(m, p, 5, dmgMod);
          break;
        }
        case BOSS_AI_PATTERNS.RAGER: {
          m.bossCooldown = 1.0;
          fireBossProjectile(m, p, dmgMod);
          if (dist < 70 && p.invuln <= 0 && p.sky <= 0) damagePlayer(m.bossDmg * 0.5 * dmgMod, m.bossAff);
          break;
        }
        default: m.bossCooldown = 1.5;
      }
    }
    if ((pat === BOSS_AI_PATTERNS.CHARGE || pat === BOSS_AI_PATTERNS.HEALER) && dist < 50 && p.invuln <= 0 && p.sky <= 0) {
      damagePlayer(m.bossDmg * 0.5 * dmgMod, m.bossAff);
    }
  }
  function fireBossProjectile(m, p, dmgMod = 1) {
    const ang = Math.atan2(p.y - m.bossPy, p.x - m.bossPx);
    world.current.projectiles.push({
      x: m.bossPx, y: m.bossPy,
      vx: Math.cos(ang) * 280, vy: Math.sin(ang) * 280,
      life: 2.5, dmg: m.bossDmg * dmgMod, aff: m.bossAff, fromPlayer: false,
      color: AFFS[m.bossAff]?.color || SUB_COLOR[m.bossAff] || '#fff', big: true,
    });
  }
  function fireBossSpread(m, p, count, dmgMod = 1) {
    const base = Math.atan2(p.y - m.bossPy, p.x - m.bossPx);
    const spread = Math.PI * 1.6;
    for (let i = 0; i < count; i++) {
      const a = base - spread / 2 + (spread * i) / Math.max(1, count - 1);
      world.current.projectiles.push({
        x: m.bossPx, y: m.bossPy,
        vx: Math.cos(a) * 220, vy: Math.sin(a) * 220,
        life: 2.5, dmg: m.bossDmg * 0.6 * dmgMod, aff: m.bossAff, fromPlayer: false,
        color: AFFS[m.bossAff]?.color || SUB_COLOR[m.bossAff] || '#fff',
      });
    }
  }

  // ===================== Scripted boss interpreter (Update 7) =====================
  function bossColorOf(m) { return m.bossColor || AFFS[m.bossAff]?.color || SUB_COLOR[m.bossAff] || '#fff'; }

  function runBossScript(w, c, p, dt) {
    const m = w.maze;
    if (!m || !m.boss || m.boss.defeated) return;
    const script = m.bossScript;
    if (!script) return;
    const dist = Math.hypot(p.x - m.bossPx, p.y - m.bossPy);
    if (m.bossShield > 0) m.bossShield -= dt;
    if (m.bossTelegraphTimer > 0) m.bossTelegraphTimer -= dt;
    // Status effects (same as monsters): stun/freeze halts action; slow reduces pace.
    if (m.bossStun > 0) m.bossStun -= dt;
    if (m.bossSlow > 0) m.bossSlow -= dt;
    if (m.bossFreeze > 0) m.bossFreeze -= dt;
    if (m.bossStun > 0 || m.bossFreeze > 0) { m.bossX = Math.floor(m.bossPx / 40); m.bossY = Math.floor(m.bossPy / 40); return; }
    const statusSpd = m.bossSlow > 0 ? 0.5 : 1;

    // Pick active phase by HP fraction (phases listed high->low 'until')
    const hpFrac = m.bossHp / m.bossMaxHp;
    let phaseIdx = 0;
    for (let i = 0; i < script.phases.length; i++) {
      phaseIdx = i;
      if (hpFrac > script.phases[i].until) break;
    }
    if (phaseIdx !== m.bossPhaseIdx) {
      m.bossPhaseIdx = phaseIdx;
      m.bossMoveIdx = 0;
      if (phaseIdx > 0) { m.bossTelegraphTimer = 0.6; addFloat(m.bossPx, m.bossPy - 40, 'PHASE!', bossColorOf(m)); }
    }
    const phase = script.phases[phaseIdx];
    const moves = phase.moves;

    // Default movement: keep a mid distance from the player (unless a charge/dash move handles it)
    if (!m.bossLunge) {
      const desired = 150;
      const dxn = (p.x - m.bossPx) / Math.max(1, dist);
      const dyn = (p.y - m.bossPy) / Math.max(1, dist);
      const sign = dist > desired ? 1 : -0.4;
      const sp = 70 * (m.bossSpdMult || 1) * statusSpd * sign * dt;
      const sx = m.bossPx + dxn * sp, sy = m.bossPy + dyn * sp;
      if (!collidesWall(sx, m.bossPy, true) && !pixelOnHazardTile(sx, m.bossPy)) m.bossPx = sx;
      if (!collidesWall(m.bossPx, sy, true) && !pixelOnHazardTile(m.bossPx, sy)) m.bossPy = sy;
    } else {
      // active lunge: move fast toward stored target
      const ld = Math.hypot(m.bossLunge.x - m.bossPx, m.bossLunge.y - m.bossPy);
      const sp = (m.bossLunge.spd || 6) * 30 * dt;
      if (ld < 8 || m.bossLunge.t <= 0) { m.bossLunge = null; }
      else {
        const lx = m.bossPx + (m.bossLunge.x - m.bossPx) / ld * Math.min(sp, ld);
        const ly = m.bossPy + (m.bossLunge.y - m.bossPy) / ld * Math.min(sp, ld);
        if (!collidesWall(lx, m.bossPy, true)) m.bossPx = lx;
        if (!collidesWall(m.bossPx, ly, true)) m.bossPy = ly;
        m.bossLunge.t -= dt;
        if (dist < 55 && p.invuln <= 0 && p.sky <= 0) { damagePlayer(m.bossDmg * 0.7 * (m.bossDmgMult || 1), m.bossAff); m.bossLunge = null; }
      }
    }
    m.bossX = Math.floor(m.bossPx / 40); m.bossY = Math.floor(m.bossPy / 40);

    // Contact damage
    if (dist < 46 && p.invuln <= 0 && p.sky <= 0) damagePlayer(m.bossDmg * 0.35 * (m.bossDmgMult || 1) * dt * 3, m.bossAff);

    // If the player died (maze cleared / zone changed), stop acting this frame.
    if (!world.current.maze || world.current.maze !== m) return;

    // Move cadence
    m.bossCooldown -= dt * statusSpd;
    if (m.bossCooldown <= 0 && !m.bossLunge) {
      const move = moves[m.bossMoveIdx % moves.length];
      m.bossMoveIdx++;
      m.bossTelegraphTimer = 0.35;
      const baseGap = Math.max(0.7, 1.5 - w.floor * 0.004); // higher floors act faster
      m.bossCooldown = baseGap;
      execBossMove(w, c, p, m, move[0], move[1] || {});
    }
  }

  function execBossMove(w, c, p, m, type, prm) {
    const dmgMult = m.bossDmgMult || 1;
    const baseDmg = m.bossDmg * dmgMult;
    const col = bossColorOf(m);
    const aff = m.bossAff;
    const ang = Math.atan2(p.y - m.bossPy, p.x - m.bossPx);
    const fam = (typeof affKind === 'function') ? affKind(aff) : 'arcane';
    switch (type) {
      case 'bolt':
        w.projectiles.push({ x: m.bossPx, y: m.bossPy, vx: Math.cos(ang) * (prm.spd || 300), vy: Math.sin(ang) * (prm.spd || 300), life: 2.6, dmg: baseDmg * (prm.dmg || 1), aff, fromPlayer: false, color: col, big: true, spell: fam, trail: true });
        break;
      case 'spread': {
        const n = prm.n || 5, arc = prm.arc || 0.9;
        for (let i = 0; i < n; i++) { const a = ang - arc / 2 + arc * i / Math.max(1, n - 1); w.projectiles.push({ x: m.bossPx, y: m.bossPy, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280, life: 2.4, dmg: baseDmg * 0.6, aff, fromPlayer: false, color: col, spell: fam }); }
        break; }
      case 'ring': {
        const n = prm.n || 10;
        for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; w.projectiles.push({ x: m.bossPx, y: m.bossPy, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, life: 2.4, dmg: baseDmg * 0.55, aff, fromPlayer: false, color: col, spell: fam }); }
        break; }
      case 'volley':
        for (let i = 0; i < (prm.n || 5); i++) setTimeout(() => { try { if (w.maze && !w.maze.boss.defeated) { const a2 = Math.atan2(p.y - m.bossPy, p.x - m.bossPx); w.projectiles.push({ x: m.bossPx, y: m.bossPy, vx: Math.cos(a2) * 360, vy: Math.sin(a2) * 360, life: 2.2, dmg: baseDmg * 0.5, aff, fromPlayer: false, color: col, spell: fam }); } } catch (e) {} }, i * 110);
        break;
      case 'beam':
        bossBeam(m, p, ang, baseDmg * 1.1, aff, col, prm.width || 28);
        break;
      case 'nova':
        w.effects.push({ x: m.bossPx, y: m.bossPy, type: 'nova', life: 0.6, delay: prm.delay ?? 0.25, dmg: baseDmg, aff, radius: prm.r || 130, fromPlayer: false, color: col, fam });
        break;
      case 'waves':
        for (let i = 0; i < (prm.n || 3); i++) w.effects.push({ x: m.bossPx, y: m.bossPy, type: 'nova', life: 0.55, delay: 0.2 + i * 0.42, dmg: baseDmg * 0.7, aff, radius: 90 + i * 55, fromPlayer: false, color: col, fam });
        break;
      case 'slam': {
        const tx = p.x, ty = p.y;
        w.effects.push({ x: tx, y: ty, type: 'slam', life: 0.7, delay: prm.delay || 0.45, dmg: baseDmg * 1.2, aff, radius: prm.r || 100, fromPlayer: false, color: col, fam });
        break; }
      case 'cone':
        w.effects.push({ x: m.bossPx, y: m.bossPy, type: 'cone', life: 0.32, ang, arc: (prm.arc ? prm.arc * 57 : 70), range: prm.range || 170, color: col, fam });
        bossConeDamage(m, p, ang, prm.arc || 1.1, prm.range || 170, baseDmg * 0.9, aff);
        break;
      case 'chain':
        bossChain(m, p, baseDmg * 0.9, aff, col, prm.hops || 4);
        break;
      case 'field':
        w.effects.push({ x: p.x, y: p.y, type: 'field', life: prm.life || 3.0, dmg: baseDmg, aff, radius: prm.r || 90, fromPlayer: false, color: col, fam, tickAcc: 0 });
        break;
      case 'dash':
        m.bossLunge = { x: p.x, y: p.y, spd: 7, t: 0.8 };
        break;
      case 'charge':
        m.bossLunge = { x: p.x + Math.cos(ang) * 220, y: p.y + Math.sin(ang) * 220, spd: prm.spd || 6, t: 1.0 };
        break;
      case 'summon': {
        const types = prm.types || ['slime']; const count = prm.count || 2;
        for (let i = 0; i < count; i++) { const sx = m.bossX + Math.round(rand() * 4 - 2), sy = m.bossY + Math.round(rand() * 4 - 2); if (sx > 0 && sy > 0 && sx < m.W - 1 && sy < m.H - 1 && m.grid[sy][sx] === 0) m.monsters.push({ x: sx, y: sy, type: pick(types), id: Math.random().toString(36).slice(2) }); }
        break; }
      case 'heal': {
        const amt = (prm.amt || 50) * (1 + w.floor * 0.05);
        m.bossHp = Math.min(m.bossMaxHp, m.bossHp + amt); addFloat(m.bossPx, m.bossPy - 35, '+' + Math.round(amt), '#69f0ae');
        break; }
      case 'shield':
        m.bossShield = prm.dur || 2.5; setMsg(`${m.bossName} guards!`);
        break;
      case 'teleport': {
        const a = rand() * Math.PI * 2, r = 120 + rand() * 70;
        const tx = clamp(p.x + Math.cos(a) * r, 60, (m.W - 2) * 40), ty = clamp(p.y + Math.sin(a) * r, 60, (m.H - 2) * 40);
        if (!collidesWall(tx, ty, true)) { w.effects.push({ x: m.bossPx, y: m.bossPy, type: 'spellburst', life: 0.3, color: col, radius: 30, fam }); m.bossPx = tx; m.bossPy = ty; w.effects.push({ x: tx, y: ty, type: 'spellburst', life: 0.3, color: col, radius: 30, fam }); }
        break; }
      case 'blink_strike': {
        const bx = p.x - Math.cos(p.dir) * 50, by = p.y - Math.sin(p.dir) * 50;
        if (!collidesWall(bx, by, true)) { m.bossPx = bx; m.bossPy = by; }
        w.effects.push({ x: m.bossPx, y: m.bossPy, type: 'spellburst', life: 0.3, color: col, radius: 28, fam });
        if (Math.hypot(p.x - m.bossPx, p.y - m.bossPy) < 70 && p.invuln <= 0 && p.sky <= 0) damagePlayer(baseDmg * 0.9, aff);
        break; }
      case 'blind':
        w.effects.push({ x: m.bossPx, y: m.bossPy, type: 'aoe', life: 0.6, color: '#111', radius: prm.r || 200 });
        if (Math.hypot(p.x - m.bossPx, p.y - m.bossPy) < (prm.r || 200) && p.invuln <= 0 && !isStatusImmune(p)) { p.blind = Math.max(p.blind, prm.dur || 3); setMsg('Blinded!'); }
        break;
      case 'pillars': {
        const n = prm.n || 5;
        for (let i = 0; i < n; i++) { const px2 = m.bossPx + (rand() - 0.5) * 360, py2 = m.bossPy + (rand() - 0.5) * 360; w.effects.push({ x: px2, y: py2, type: 'slam', life: 0.8, delay: 0.4 + rand() * 0.3, dmg: baseDmg * 0.8, aff, radius: 55, fromPlayer: false, color: col, fam }); }
        break; }
      case 'weapon': {
        const style = prm.style || 'slash';
        w.effects.push({ x: m.bossPx, y: m.bossPy, type: 'slash', swing: style, ang, range: 90, arc: 140, life: 0.25, color: col });
        if (Math.hypot(p.x - m.bossPx, p.y - m.bossPy) < 100 && p.invuln <= 0 && p.sky <= 0) damagePlayer(baseDmg * 1.0, aff);
        break; }
      case 'quake':
        w.effects.push({ x: m.bossPx, y: m.bossPy, type: 'nova', life: 0.5, delay: 0.1, dmg: baseDmg * 0.8, aff, radius: prm.r || 130, fromPlayer: false, color: col, fam });
        if (Math.hypot(p.x - m.bossPx, p.y - m.bossPy) < (prm.r || 130) && p.invuln <= 0 && !isStatusImmune(p)) { p.stun = Math.max(p.stun, 0.4); }
        break;
      case 'mirror': {
        // Copy the player's most recently used ability entry, if any
        const last = p.lastAbilityUsed;
        if (last && last.aff) {
          const listm = SUB_ABILITIES[last.aff] ? SUB_ABILITIES[last.aff] : (ABILITIES[last.aff] || []);
          const ab = listm.find(a => a.n === last.name) || listm[0];
          if (ab) { mirrorCastFromBoss(w, m, p, ab, last.aff, baseDmg); break; }
        }
        // fallback: a spread
        for (let i = 0; i < 5; i++) { const a = ang - 0.4 + 0.2 * i; w.projectiles.push({ x: m.bossPx, y: m.bossPy, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, life: 2.2, dmg: baseDmg * 0.6, aff, fromPlayer: false, color: col, spell: fam }); }
        break; }
      case 'orbit_strafe':
        m.bossLunge = { x: p.x + Math.cos(ang + 1.3) * 160, y: p.y + Math.sin(ang + 1.3) * 160, spd: 6, t: 0.7 };
        for (let i = 0; i < 5; i++) { const a = ang - 0.4 + 0.2 * i; w.projectiles.push({ x: m.bossPx, y: m.bossPy, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, life: 2.2, dmg: baseDmg * 0.5, aff, fromPlayer: false, color: col, spell: fam }); }
        break;
      case 'pull_grav': {
        // Drag the player toward the boss
        const pd = Math.hypot(p.x - m.bossPx, p.y - m.bossPy);
        if (pd > 30) { const nx = p.x + (m.bossPx - p.x) / pd * 70, ny = p.y + (m.bossPy - p.y) / pd * 70; if (!collidesWall(nx, p.y, false)) p.x = nx; if (!collidesWall(p.x, ny, false)) p.y = ny; }
        w.effects.push({ x: m.bossPx, y: m.bossPy, type: 'nova', life: 0.5, delay: 0, dmg: 0, aff, radius: 200, fromPlayer: false, color: col, fam });
        break; }
      case 'blizzard_call':
        for (let i = 0; i < 6; i++) { const px2 = m.bossPx + (rand() - 0.5) * 420, py2 = m.bossPy + (rand() - 0.5) * 420; w.effects.push({ x: px2, y: py2, type: 'field', life: 2.0, dmg: baseDmg * 0.5, aff: 'Ice', radius: 60, fromPlayer: false, color: '#80deea', fam: 'water', tickAcc: 0 }); }
        if (Math.hypot(p.x - m.bossPx, p.y - m.bossPy) < 300 && !isStatusImmune(p)) p.slow = Math.max(p.slow, 2);
        break;
      case 'confuse_pulse':
        if (Math.hypot(p.x - m.bossPx, p.y - m.bossPy) < 220 && !isStatusImmune(p)) { p.confused = Math.max(p.confused || 0, 2.5); setMsg('Controls scrambled!'); }
        else if (isStatusImmune(p)) addFloat(p.x, p.y - 40, 'IMMUNE', '#ffd54f');
        w.effects.push({ x: m.bossPx, y: m.bossPy, type: 'aoe', life: 0.5, color: '#ba68c8', radius: 220 });
        break;
      case 'enrage':
        if (!m.bossEnraged) { m.bossEnraged = true; m.bossDmgMult = (m.bossDmgMult || 1) * (prm.dmgMult || 1.3); m.bossSpdMult = (m.bossSpdMult || 1) * (prm.spdMult || 1.2); setMsg(`${m.bossName} ENRAGES!`); addFloat(m.bossPx, m.bossPy - 45, 'ENRAGE', '#ff1744'); }
        break;
      default:
        fireBossProjectile(m, p, dmgMult);
    }
  }

  function bossBeam(m, p, ang, dmg, aff, col, width) {
    const w = world.current; const maxR = 520; let endR = maxR;
    for (let r = 20; r <= maxR; r += 20) { if (collidesWall(m.bossPx + Math.cos(ang) * r, m.bossPy + Math.sin(ang) * r, true)) { endR = r; break; } }
    const pdAng = Math.atan2(p.y - m.bossPy, p.x - m.bossPx);
    let da = Math.abs(pdAng - ang); if (da > Math.PI) da = 2 * Math.PI - da;
    const pdist = Math.hypot(p.x - m.bossPx, p.y - m.bossPy);
    if (pdist < endR + 20 && da < (width / 200 + 0.12) && p.invuln <= 0 && p.sky <= 0) damagePlayer(dmg, aff);
    w.effects.push({ x: m.bossPx, y: m.bossPy, type: 'beam', life: 0.28, ang, len: endR, color: col, fam: 'light' });
  }
  function bossConeDamage(m, p, ang, arc, range, dmg, aff) {
    const pdist = Math.hypot(p.x - m.bossPx, p.y - m.bossPy);
    if (pdist > range) return;
    const a = Math.atan2(p.y - m.bossPy, p.x - m.bossPx); let da = Math.abs(a - ang); if (da > Math.PI) da = 2 * Math.PI - da;
    if (da < arc / 2 && p.invuln <= 0 && p.sky <= 0) damagePlayer(dmg, aff);
  }
  function bossChain(m, p, dmg, aff, col, hops) {
    const w = world.current;
    const segs = [[m.bossPx, m.bossPy, p.x, p.y]];
    if (Math.hypot(p.x - m.bossPx, p.y - m.bossPy) < 420 && p.invuln <= 0 && p.sky <= 0) damagePlayer(dmg, aff);
    w.effects.push({ x: m.bossPx, y: m.bossPy, type: 'chain', life: 0.3, color: col, segs });
  }
  function mirrorCastFromBoss(w, m, p, ab, aff, baseDmg) {
    const col = bossColorOf(m); const fam = affKind(aff);
    const ang = Math.atan2(p.y - m.bossPy, p.x - m.bossPx);
    // Reuse a simplified version of the player's ability types, aimed at the player
    if (['projectile', 'homing_orb', 'pierce_line'].includes(ab.k)) {
      w.projectiles.push({ x: m.bossPx, y: m.bossPy, vx: Math.cos(ang) * 360, vy: Math.sin(ang) * 360, life: 2.2, dmg: baseDmg, aff, fromPlayer: false, color: col, big: true, spell: fam, trail: true });
    } else if (ab.k === 'beam') { bossBeam(m, p, ang, baseDmg * 1.1, aff, col, 30); }
    else if (['nova', 'aoe', 'ultimate'].includes(ab.k)) { w.effects.push({ x: m.bossPx, y: m.bossPy, type: 'nova', life: 0.6, delay: 0.2, dmg: baseDmg, aff, radius: 150, fromPlayer: false, color: col, fam }); }
    else if (ab.k === 'cone') { w.effects.push({ x: m.bossPx, y: m.bossPy, type: 'cone', life: 0.3, ang, arc: 70, range: 170, color: col, fam }); bossConeDamage(m, p, ang, 1.1, 170, baseDmg, aff); }
    else { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; w.projectiles.push({ x: m.bossPx, y: m.bossPy, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250, life: 2.2, dmg: baseDmg * 0.6, aff, fromPlayer: false, color: col, spell: fam }); } }
    setMsg(`${m.bossName} mirrors your ${ab.n}!`);
  }

  function collidesWall(x, y, forMonster) {
    const w = world.current;
    if (w.maze) {
      const gx = Math.floor(x / 40), gy = Math.floor(y / 40);
      if (gx < 0 || gy < 0 || gx >= w.maze.W || gy >= w.maze.H) return true;
      const tile = w.maze.grid[gy][gx];
      if (tile === 1 || tile === 10) return true; // wall, grave
      if (tile === 2) return true; // water
      if (forMonster && tile === 3) return true;
      return false;
    }
    // Interior rooms: keep the player inside the room bounds.
    if (INTERIORS[w.zone]) {
      const intr = INTERIORS[w.zone];
      if (x < 24 || y < 24 || x > intr.w - 24 || y > intr.h - 14) return true;
      return false;
    }
    const z = ZONES[w.zone];
    if (!z) return false;
    for (const wall of z.walls) {
      if (x > wall.x && x < wall.x + wall.w && y > wall.y && y < wall.y + wall.h) return true;
    }
    // Hub central fountain is solid.
    if (w.zone === 'hub' && z.fountain) {
      if (Math.hypot(x - z.fountain.x, y - z.fountain.y) < z.fountain.r) return true;
    }
    return false;
  }
  function canMonsterStand(tileX, tileY) {
    const w = world.current; if (!w.maze) return true;
    const gx = Math.floor(tileX), gy = Math.floor(tileY);
    if (gx < 0 || gy < 0 || gx >= w.maze.W || gy >= w.maze.H) return false;
    const tile = w.maze.grid[gy][gx];
    return tile === 0 || tile === 4 || tile === 5 || tile === 6 || tile === 7 || tile === 8 || tile === 9;
  }
  function pixelOnHazardTile(x, y) {
    const w = world.current; if (!w.maze) return false;
    const gx = Math.floor(x / 40), gy = Math.floor(y / 40);
    if (gx < 0 || gy < 0 || gx >= w.maze.W || gy >= w.maze.H) return true;
    const tile = w.maze.grid[gy][gx];
    return tile === 2 || tile === 3;
  }

  function damageMonster(m, dmg, aff) {
    const mult = affinityMultiplier(aff, m.aff ? [m.aff] : []);
    const final = Math.floor(dmg * mult);
    m.hp -= final;
    addFloat(m.x * 40 + 20, m.y * 40 + 20, String(final), mult > 1 ? '#ffd700' : '#fff');
    AudioMgr.play('hit');
    if (m.hp <= 0) onMonsterDeath(m);
  }
  function damageBoss(dmg, aff) {
    const w = world.current;
    if (w.maze.bossShield > 0) {
      addFloat(w.maze.bossPx, w.maze.bossPy - 35, 'BLOCK', '#bdbdbd');
      return;
    }
    const mult = affinityMultiplier(aff, w.maze.bossAff ? [w.maze.bossAff] : []);
    const final = Math.floor(dmg * mult);
    w.maze.bossHp -= final;
    addFloat(w.maze.bossPx, w.maze.bossPy - 20, String(final), mult > 1 ? '#ffd700' : '#fff');
    AudioMgr.play('hit');
    if (w.maze.bossHp <= 0) onBossDefeat();
  }
  function damagePlayer(dmg, aff) {
    const c = charRef.current;
    if (!c) return;
    const w = world.current; const p = w.player;
    if (p.shield > 0) {
      const absorb = Math.min(p.shield, dmg);
      p.shield -= absorb; dmg -= absorb;
      if (dmg <= 0) { addFloat(p.x, p.y - 30, 'BLOCKED', '#8be9fd'); return; }
    }
    let mult = affinityMultiplier(aff, Object.keys(c.affinities));
    const wpn = WEAPONS[c.weapon];
    if (wpn?.defense) dmg *= (1 - wpn.defense);
    // Equipped armor: percent damage reduction (capped low, so dodging still matters).
    if (c.armor && ARMORS[c.armor]) {
      const red = armorReductionAt(c.armor, (c.armorLevels && c.armorLevels[c.armor]) || 1);
      dmg *= (1 - red);
    }
    if (p.buffs.ironskin) dmg *= 0.75;
    if (p.buffs.bulwark) dmg *= 0.4;
    const final = Math.floor(dmg * mult);
    if (p.buffs.immortal) { c.hp = Math.max(1, c.hp - final); }
    else c.hp = clamp(c.hp - final, 0, c.maxHp);
    addFloat(p.x, p.y - 30, '-' + final, '#ff5252');
    // thorns (spike shield): reflect a fraction of the hit back at nearby attackers
    if (wpn?.mech === 'thorns' && final > 0 && w.maze) {
      const reflect = final * (wpn.mechVal || 0.4);
      for (const m of w.maze.monsters) {
        if (m.hp <= 0) continue;
        if (Math.hypot(m.x * 40 + 20 - p.x, m.y * 40 + 20 - p.y) < 70) { damageMonster(m, reflect, null); break; }
      }
    }
    AudioMgr.play('bonk');
    p.invuln = 0.4;
    if (c.hp <= 0) onPlayerDeath();
  }
  function rollDungeonWeapon(floor) {
    const pool = DROPPABLE_WEAPONS.filter(k => (WEAPONS[k].dropMin || 1) <= floor);
    if (!pool.length) return null;
    const total = pool.reduce((s, k) => s + (WEAPONS[k].dropWeight || 1), 0);
    let r = rand() * total;
    for (const k of pool) { r -= (WEAPONS[k].dropWeight || 1); if (r <= 0) return k; }
    return pool[pool.length - 1];
  }
  function rollDungeonArmor(floor) {
    const pool = DROPPABLE_ARMORS.filter(k => (ARMORS[k].dropMin || 1) <= floor);
    if (!pool.length) return null;
    const total = pool.reduce((s, k) => s + (ARMORS[k].dropWeight || 1), 0);
    let r = rand() * total;
    for (const k of pool) { r -= (ARMORS[k].dropWeight || 1); if (r <= 0) return k; }
    return pool[pool.length - 1];
  }
  function grantArmor(c, key) {
    if (!key) return false;
    if (!c.ownedArmors) c.ownedArmors = [];
    if (c.ownedArmors.includes(key)) return false;
    c.ownedArmors.push(key);
    c.armorLevels = c.armorLevels || {}; c.armorLevels[key] = c.armorLevels[key] || 1;
    return true;
  }
  function onMonsterDeath(m) {
    const c = charRef.current;
    const t = MONSTER_TYPES[m.type];
    const fm = 1 + (world.current.floor - 1) * 0.18;
    const expGain = Math.floor(t.exp * fm);
    grantExp(expGain);
    const coins = Math.floor((5 + rand() * 10) * fm);
    c.coins += coins;
    addFloat(m.x * 40 + 20, m.y * 40 + 20 - 20, `+${expGain}xp +${coins}c`, '#8be9fd');
    if (rand() < 0.22) {
      const grade = floorLootGrade(world.current.floor);
      addItemToInventory({ key: `trophy_${grade}`, name: `${grade}-grade Monster Trophy`, grade, isTrophy: true });
    }
    if (rand() < 0.012) {
      const weaponKey = rollDungeonWeapon(world.current.floor);
      if (weaponKey && !c.ownedWeapons.includes(weaponKey)) {
        c.ownedWeapons.push(weaponKey); c.weaponLevels = c.weaponLevels || {}; c.weaponLevels[weaponKey] = c.weaponLevels[weaponKey] || 1;
        setMsg(`New weapon acquired: ${WEAPONS[weaponKey].n}! Check the Blacksmith.`);
      }
    }
    setChar({ ...c });
  }
  function onBossDefeat() {
    const c = charRef.current;
    const w = world.current;
    w.maze.boss.defeated = true;
    const def = w.maze.bossData;
    const fm = 1 + (w.floor - 1) * 0.18;
    const expGain = Math.floor(200 * (def.hpMult || 4) * fm / 4);
    grantExp(expGain);
    const coins = Math.floor(100 * fm * (def.unique ? 2 : 1));
    c.coins += coins;
    const grade = floorLootGrade(w.floor);
    const itemKey = rollItemOfGrade(grade);
    if (itemKey) addItemToInventory({ key: itemKey, name: ITEMS[itemKey].n, grade: ITEMS[itemKey].g });
    addItemToInventory({ key: `trophy_${grade}`, name: `${grade}-grade Boss Trophy`, grade, isTrophy: true });
    const dropChance = def.unique ? 0.6 : 0.25;
    if (rand() < dropChance) {
      const weaponKey = rollDungeonWeapon(world.current.floor);
      if (weaponKey && !c.ownedWeapons.includes(weaponKey)) {
        c.ownedWeapons.push(weaponKey); c.weaponLevels = c.weaponLevels || {}; c.weaponLevels[weaponKey] = c.weaponLevels[weaponKey] || 1;
        setMsg(`Boss dropped a weapon: ${WEAPONS[weaponKey].n}!`);
      }
    }
    if (w.floor < 100 && w.floor + 1 > c.unlockedFloor) c.unlockedFloor = w.floor + 1;
    setMsg(`Boss defeated! +${expGain} XP, +${coins} coins. Floor ${w.floor + 1} unlocked!`);
    AudioMgr.play('chest');
    saveCharacter();
    setChar({ ...c });
  }
  function onPlayerDeath() {
    const c = charRef.current;
    // Penalty: lose 20% of the player's max-coins high-water mark (was 50% of current).
    const maxC = c.maxCoins || c.coins;
    const penalty = Math.floor(maxC * 0.20);
    c.coins = Math.max(0, c.coins - penalty);
    setMsg(`You died. Returning to hub. Lost ${penalty} coins (20% of your peak).`);
    c.hp = c.maxHp;
    c.mana = c.maxMana; c.energy = c.maxEnergy;
    c.statusEffects = [];
    setChar({ ...c });
    enterZone('hub');
    saveCharacter();
  }
  function grantExp(amount) {
    const c = charRef.current;
    c.exp += amount;
    while (c.exp >= expForLevel(c.level)) {
      c.exp -= expForLevel(c.level);
      c.level++;
      c.maxHp += 10; c.maxMana += 5; c.maxEnergy += 5;
      c.hp = c.maxHp; c.mana = c.maxMana; c.energy = c.maxEnergy;
      AudioMgr.play('levelup');
      setMsg(`Level up! Now level ${c.level}`);
    }
  }
  function expForLevel(lv) { return Math.floor(50 * Math.pow(1.15, lv - 1)); }
  function affinityExpForLevel(lv) { return Math.floor(30 * Math.pow(1.18, lv - 1)); }
  function checkNewlyLearned(c, aff, list, knownKey, beforeLvl, afterLvl) {
    const newly = list.filter(a => a.lvl > beforeLvl && a.lvl <= afterLvl);
    for (const ab of newly) {
      c.knownAbilities[knownKey] = c.knownAbilities[knownKey] || [];
      if (!c.knownAbilities[knownKey].includes(ab.n)) {
        c.knownAbilities[knownKey].push(ab.n);
        setMsg(`New ability: ${ab.n} (${knownKey}). Open Loadout (L) to equip.`);
      }
    }
  }
  function grantAffinityExp(aff, amount) {
    const c = charRef.current;
    if (c.affinities[aff]) {
      const a = c.affinities[aff];
      const before = a.level;
      a.exp += amount;
      while (a.exp >= affinityExpForLevel(a.level)) { a.exp -= affinityExpForLevel(a.level); a.level++; }
      if (a.level > before) checkNewlyLearned(c, aff, ABILITIES[aff] || [], aff, before, a.level);
    } else {
      for (const k of Object.keys(c.affinities)) {
        if (c.affinities[k].sub === aff) {
          const ca = c.affinities[k];
          const before = ca.subLevel;
          ca.subExp += amount; ca.exp += amount;
          while (ca.subExp >= affinityExpForLevel(ca.subLevel)) { ca.subExp -= affinityExpForLevel(ca.subLevel); ca.subLevel++; }
          while (ca.exp >= affinityExpForLevel(ca.level)) { ca.exp -= affinityExpForLevel(ca.level); ca.level++; }
          if (ca.subLevel > before) checkNewlyLearned(c, aff, SUB_ABILITIES[aff] || [], aff, before, ca.subLevel);
          break;
        }
      }
    }
  }

  // ===== Update 5 weapon-mechanic helpers =====
  function applyMonsterDot(m, dps, dur, color) {
    if (!m.dots) m.dots = [];
    m.dots.push({ dps, t: dur, acc: 0, color: color || '#ff7043' });
  }
  function applyBossDot(dps, dur, color) {
    const w = world.current; if (!w.maze) return;
    if (!w.maze.bossDots) w.maze.bossDots = [];
    w.maze.bossDots.push({ dps, t: dur, acc: 0, color: color || '#ff7043' });
  }
  function freezeMonster(m, dur) { m.stun = Math.max(m.stun || 0, dur); m.freeze = Math.max(m.freeze || 0, dur); }
  function pushMonster(m, fromX, fromY, dist) {
    const mx = m.x * 40 + 20, my = m.y * 40 + 20;
    let dx = mx - fromX, dy = my - fromY; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const nx = m.x + dx * dist / 40, ny = m.y + dy * dist / 40;
    if (canMonsterStand(nx, m.y)) m.x = nx;
    if (canMonsterStand(m.x, ny)) m.y = ny;
  }
  function pullMonster(m, toX, toY, dist) {
    const mx = m.x * 40 + 20, my = m.y * 40 + 20;
    let dx = toX - mx, dy = toY - my; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const nx = m.x + dx * dist / 40, ny = m.y + dy * dist / 40;
    if (canMonsterStand(nx, m.y)) m.x = nx;
    if (canMonsterStand(m.x, ny)) m.y = ny;
  }
  function monstersInRadius(cx, cy, r) {
    const w = world.current; if (!w.maze) return [];
    return w.maze.monsters.filter(m => m.hp > 0 && Math.hypot(m.x * 40 + 20 - cx, m.y * 40 + 20 - cy) < r);
  }
  // True if the (live) boss is within radius r of (cx,cy).
  function bossInRadius(cx, cy, r) {
    const w = world.current; const m = w.maze;
    if (!m || !m.boss || m.boss.defeated || m.bossHp == null) return false;
    return Math.hypot(m.bossPx - cx, m.bossPy - cy) < r + 20;
  }
  // Apply a status to the boss the same way it would apply to a monster.
  // field names: 'stun' | 'slow' | 'freeze'
  function applyBossStatus(kind, dur) {
    const w = world.current; const m = w.maze;
    if (!m || !m.boss || m.boss.defeated || m.bossHp == null) return;
    if (kind === 'stun') m.bossStun = Math.max(m.bossStun || 0, dur);
    else if (kind === 'slow') m.bossSlow = Math.max(m.bossSlow || 0, dur);
    else if (kind === 'freeze') { m.bossFreeze = Math.max(m.bossFreeze || 0, dur); m.bossStun = Math.max(m.bossStun || 0, dur); }
  }
  function explodeProjectile(pr) {
    const w = world.current;
    w.effects.push({ x: pr.x, y: pr.y, type: 'aoe', life: 0.4, color: pr.color || '#ff9800', radius: pr.explodeRadius });
    if (!w.maze) return;
    for (const m of w.maze.monsters) { if (m.hp <= 0) continue; if (Math.hypot(m.x * 40 + 20 - pr.x, m.y * 40 + 20 - pr.y) < pr.explodeRadius) damageMonster(m, pr.dmg * 0.8, pr.aff); }
    if (!w.maze.boss.defeated && w.maze.bossHp != null && Math.hypot(w.maze.bossPx - pr.x, w.maze.bossPy - pr.y) < pr.explodeRadius + 20) damageBoss(pr.dmg * 0.8, pr.aff);
  }
  function projColor(proj) {
    switch (proj) {
      case 'arrow': case 'magic_arrow': return '#fff59d';
      case 'bolt': case 'ballista_bolt': return '#d7ccc8';
      case 'knife': return '#eceff1';
      case 'stone': case 'boulder': return '#a1887f';
      case 'shuriken': case 'chakram': return '#cfd8dc';
      case 'boomerang': return '#bcaaa4';
      case 'dart': return '#aed581';
      case 'pellet': return '#ffd54f';
      case 'trident': return '#26c6da';
      case 'wave': return '#b388ff';
      default: return '#fff';
    }
  }
  function projSpeed(wpn) {
    switch (wpn.proj) {
      case 'boulder': return 300;
      case 'boomerang': case 'chakram': return 360;
      case 'ballista_bolt': return 560;
      case 'magic_arrow': return 400;
      case 'pellet': return 480;
      default: return 500;
    }
  }
  function swingColor(wpn) {
    switch (wpn.mech) {
      case 'burn': return '#ff7043';
      case 'freeze': return '#80deea';
      case 'chain_lightning': return '#fff176';
      case 'vampiric': return '#e53935';
      case 'gravity': return '#9575cd';
      case 'execute': return '#b388ff';
      case 'whirl': return '#b3e5fc';
      default: return '#fff';
    }
  }
  function spawnWeaponProjectiles(wpn, p, ang, dmg) {
    const w = world.current;
    const mech = wpn.mech;
    const baseColor = projColor(wpn.proj);
    const speed = projSpeed(wpn);
    const life = Math.max(0.25, wpn.range / speed);
    let count = 1, spread = 0;
    if (mech === 'fan3') { count = 3; spread = 0.12; }
    else if (mech === 'spread5') { count = 5; spread = 0.16; }
    else if (mech === 'shotgun') { count = 7; spread = 0.13; }
    const base = {};
    if (wpn.pierce || mech === 'pierce_bonus' || mech === 'piercer' || mech === 'orbit_return') base.pierce = true;
    if (mech === 'pierce_bonus') base.pierceRamp = wpn.mechVal || 0.15;
    if (mech === 'piercer') base.knockback = wpn.mechVal || 90;
    if (mech === 'ricochet') base.bounces = wpn.mechVal || 2;
    if (mech === 'return' || mech === 'orbit_return') { base.returns = true; base.turnAt = life * 0.45; base.age = 0; }
    if (mech === 'homing') base.homing = true;
    if (mech === 'explosive') base.explodeRadius = wpn.mechVal || 90;
    if (mech === 'poison') base.poison = { dps: wpn.mechVal || 10, dur: 5 };
    if (mech === 'longshot') { base.longshot = wpn.mechVal || 0.5; base.ox = p.x; base.oy = p.y; base.maxRange = wpn.range; }
    const mk = (a) => {
      const pr = { x: p.x, y: p.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, dmg, aff: null, fromPlayer: true, color: baseColor, proj: wpn.proj, ...base };
      if (pr.pierce) pr.hitSet = new Set();
      if (wpn.proj === 'ballista_bolt' || wpn.proj === 'boulder' || wpn.proj === 'trident') pr.big = true;
      w.projectiles.push(pr);
    };
    if (count === 1) mk(ang);
    else { const start = -(count - 1) / 2; for (let i = 0; i < count; i++) mk(ang + (start + i) * spread); }
  }
  function spawnWaveAttack(wpn, p, ang, dmg, power) {
    const w = world.current;
    w.effects.push({ x: p.x, y: p.y, type: 'slash', swing: 'spin', ang, range: wpn.range + 30, arc: 160, life: 0.24, color: '#b388ff' });
    if (!w.maze) return;
    for (const m of w.maze.monsters) {
      if (m.hp <= 0) continue;
      const mx = m.x * 40 + 20, my = m.y * 40 + 20;
      if (Math.hypot(mx - p.x, my - p.y) > wpn.range + 40) continue;
      const a = Math.atan2(my - p.y, mx - p.x); let da = Math.abs(a - ang); if (da > Math.PI) da = 2 * Math.PI - da;
      if (da > 1.4) continue;
      const wave = m.maxHp * (wpn.mechVal || 0.2) * power;
      damageMonster(m, Math.max(dmg * power, wave), null);
    }
    if (!w.maze.boss.defeated && w.maze.bossHp != null && Math.hypot(w.maze.bossPx - p.x, w.maze.bossPy - p.y) < wpn.range + 60) {
      damageBoss(Math.max(dmg * power, w.maze.bossMaxHp * 0.03 * power), null);
    }
  }
  function bossInArc(p, ang, range, arcR, isWhirl) {
    const w = world.current;
    const bd = Math.hypot(w.maze.bossPx - p.x, w.maze.bossPy - p.y);
    if (bd > range + 20) return false;
    if (isWhirl) return true;
    const a = Math.atan2(w.maze.bossPy - p.y, w.maze.bossPx - p.x);
    let da = Math.abs(a - ang); if (da > Math.PI) da = 2 * Math.PI - da;
    return da < arcR;
  }

  function doBasicAttack() {
    const c = charRef.current; if (!c) return;
    const w = world.current; const p = w.player;
    if (p.stun > 0 || p.sky > 0) return;
    const wpn = WEAPONS[c.weapon];
    const now = performance.now();
    const cd = (600 / wpn.spd) / (p.buffs.frenzy ? 1.4 : 1);
    if (now - p.lastAttack < cd) return;
    p.lastAttack = now;
    AudioMgr.play('attack');
    const cur = vpRef.current;
    const ang = Math.atan2(w.mouse.y - cur.h / 2, w.mouse.x - cur.w / 2);
    p.dir = ang;
    const mech = wpn.mech;

    const wlv = (c.weaponLevels && c.weaponLevels[c.weapon]) || 1;
    let dmg = weaponDamageAt(c.weapon, wlv);
    if (p.buffs.boost) dmg *= 1.2;
    if (p.buffs.rage) dmg *= 1.3;
    if (p.buffs.apex) dmg *= 1.8;
    if (p.buffs.overcharge) dmg *= 1.5;
    if (p.buffs.thorn) { dmg *= 1.05; delete p.buffs.thorn; }
    if (p.buffs.double) dmg *= 2;
    if (mech === 'combo') {
      if (now - (p.comboTime || 0) < 1500) p.comboCount = (p.comboCount || 0) + 1; else p.comboCount = 0;
      p.comboTime = now;
      dmg *= (1 + p.comboCount * (wpn.mechVal || 0.08));
    }
    const isCrit = wpn.crit && rand() < wpn.crit;
    if (isCrit) dmg *= 2;

    // ----- RANGED -----
    if (wpn.ranged) { spawnWeaponProjectiles(wpn, p, ang, dmg); return; }

    // ----- MP wave (magic sword) replaces the swing -----
    if (mech === 'mpwave') {
      const cost = c.maxMana * 0.1;
      const enough = c.mana >= cost;
      c.mana = Math.max(0, c.mana - (enough ? cost : c.mana));
      spawnWaveAttack(wpn, p, ang, dmg, enough ? 1 : 0.25);
      setChar({ ...c });
      return;
    }

    // ----- Trident: alternate freeze-thrust / piercing throw -----
    if (mech === 'trident') {
      p.tridentThrow = !p.tridentThrow;
      if (p.tridentThrow) {
        const pr = { x: p.x, y: p.y, vx: Math.cos(ang) * 520, vy: Math.sin(ang) * 520, life: wpn.range / 180, dmg: dmg * 1.2, aff: 'Water', fromPlayer: true, color: '#26c6da', proj: 'trident', pierce: true, hitSet: new Set(), knockback: 50, big: true };
        w.projectiles.push(pr);
        w.effects.push({ x: p.x, y: p.y, type: 'slash', swing: 'thrust', ang, range: wpn.range, arc: 30, life: 0.16, color: '#26c6da' });
        return;
      }
    }

    // ----- MELEE -----
    const isWhirl = mech === 'whirl' || wpn.arc >= 360;
    const arcR = isWhirl ? Math.PI : (wpn.arc * Math.PI / 180) / 2;
    const hits = (mech === 'doublestrike') ? 2 : (wpn.multi || 1);

    if (w.maze) {
      const inArc = (tx, ty) => {
        const md = Math.hypot(tx - p.x, ty - p.y);
        if (md > wpn.range) return false;
        if (isWhirl) return true;
        const a = Math.atan2(ty - p.y, tx - p.x);
        let da = Math.abs(a - ang); if (da > Math.PI) da = 2 * Math.PI - da;
        // lash (whip): treat the swing as a thin line so it hits everything along its length
        if (mech === 'lash') return da < 0.32;
        return da < arcR;
      };
      const targets = [];
      for (const m of w.maze.monsters) { if (m.hp <= 0) continue; if (inArc(m.x * 40 + 20, m.y * 40 + 20)) targets.push(m); }
      const dmgMul = (mech === 'cleave' && targets.length >= 2) ? 1 + (wpn.mechVal || 0.15) : 1;

      if (mech === 'gravity') {
        for (const m of monstersInRadius(p.x, p.y, wpn.mechVal || 120)) pullMonster(m, p.x, p.y, 50);
        w.effects.push({ x: p.x, y: p.y, type: 'aoe', life: 0.35, color: '#7e57c2', radius: wpn.mechVal || 120 });
      }

      for (const m of targets) {
        let d = dmg * dmgMul;
        if (mech === 'reap' && m.hp < m.maxHp * 0.25) d *= 2.2;
        if (mech === 'armor_break') d *= 1.2;
        // execute weak non-bosses outright
        if (mech === 'execute' && m.hp < m.maxHp * (wpn.mechVal || 0.12)) {
          m.hp = 0; onMonsterDeath(m); c.hp = clamp(c.hp + c.maxHp * 0.08, 0, c.maxHp); continue;
        }
        for (let h = 0; h < hits && m.hp > 0; h++) damageMonster(m, d, null);
        if (m.hp > 0) {
          if (mech === 'bleed') applyMonsterDot(m, wpn.mechVal || 4, 3, '#e53935');
          if (mech === 'crit_bleed' && isCrit) applyMonsterDot(m, wpn.mechVal || 8, 4, '#e53935');
          if (mech === 'burn') { applyMonsterDot(m, wpn.mechVal || 12, 4, '#ff7043'); w.effects.push({ x: m.x * 40 + 20, y: m.y * 40 + 20, type: 'aoe', life: 0.3, color: '#ff7043', radius: 18 }); }
          if (mech === 'freeze' && rand() < 0.3) freezeMonster(m, wpn.mechVal || 1.2);
          if (mech === 'stun' && wpn.stun && rand() < wpn.stun) m.stun = Math.max(m.stun || 0, wpn.mechVal || 1);
          if (mech === 'knockback') pushMonster(m, p.x, p.y, wpn.mechVal || 60);
          if (mech === 'pull') pullMonster(m, p.x, p.y, wpn.mechVal || 70);
          if (mech === 'chain_lightning') {
            const arcs = monstersInRadius(m.x * 40 + 20, m.y * 40 + 20, 130).filter(o => o !== m).slice(0, 3);
            for (const o of arcs) { damageMonster(o, d * (wpn.mechVal || 0.5), 'Lightning'); w.effects.push({ x: o.x * 40 + 20, y: o.y * 40 + 20, type: 'aoe', life: 0.2, color: '#fff176', radius: 16 }); }
          }
        } else if (mech === 'execute' || mech === 'void_edge') {
          c.hp = clamp(c.hp + c.maxHp * 0.08, 0, c.maxHp);
        }
        const lifeFrac = (mech === 'vampiric') ? (wpn.mechVal || 0.35) : (mech === 'reap' ? 0.1 : (wpn.lifesteal || 0));
        if (lifeFrac) c.hp = clamp(c.hp + d * lifeFrac, 0, c.maxHp);
      }

      if (mech === 'quake') {
        w.effects.push({ x: p.x, y: p.y, type: 'aoe', life: 0.4, color: '#8d6e63', radius: wpn.mechVal || 70 });
        for (const m of monstersInRadius(p.x, p.y, wpn.mechVal || 70)) damageMonster(m, dmg * 0.4, null);
        if (!w.maze.boss.defeated && w.maze.bossHp != null && Math.hypot(w.maze.bossPx - p.x, w.maze.bossPy - p.y) < (wpn.mechVal || 70) + 20) damageBoss(dmg * 0.4, null);
      }

      // boss melee
      if (!w.maze.boss.defeated && w.maze.bossHp != null && bossInArc(p, ang, wpn.range, arcR, isWhirl)) {
        let bd = dmg * dmgMul;
        if (mech === 'armor_break') bd *= 1.2;
        for (let h = 0; h < hits; h++) damageBoss(bd, null);
        if (mech === 'bleed') applyBossDot(wpn.mechVal || 4, 3, '#e53935');
        if (mech === 'crit_bleed' && isCrit) applyBossDot(wpn.mechVal || 8, 4, '#e53935');
        if (mech === 'burn') applyBossDot(wpn.mechVal || 12, 4, '#ff7043');
        const lf = (mech === 'vampiric') ? (wpn.mechVal || 0.35) : (wpn.lifesteal || 0);
        if (lf) c.hp = clamp(c.hp + bd * lf, 0, c.maxHp);
      }
    }

    w.effects.push({ x: p.x, y: p.y, type: 'slash', swing: wpn.swing || 'slash', ang, range: wpn.range, arc: isWhirl ? 360 : wpn.arc, life: 0.18, color: swingColor(wpn) });
  }
  // Cooldown multiplier from active haste buffs (cooldown-reduction items).
  // Returns a fraction <= 1 to scale newly-set cooldowns. Capped at 60% off.
  function cdMultiplier(p) {
    let mult = 1;
    if (p.buffs && p.buffs.cdHaste) mult *= (1 - (p.cdHasteAmt || 0.25));
    return Math.max(0.4, mult);
  }

  function useAttribute(idx) {
    const c = charRef.current; if (!c) return;
    const equipped = c.equippedAttrs || [];
    const key = equipped[idx]; if (!key) return;
    const w = world.current; const p = w.player;
    if (p.stun > 0) return;
    const attr = ATTRS[key]; if (!attr) return;
    p.cooldowns = p.cooldowns || {};
    const cdKey = 'attr_' + key;
    if ((p.cooldowns[cdKey] || 0) > 0) { setMsg(`${attr.n} on cooldown (${p.cooldowns[cdKey].toFixed(1)}s)`); return; }
    let cost = attr.e;
    if (p.buffs.recycle) { cost /= 2; delete p.buffs.recycle; }
    if (c.energy < cost && cost < 999) { setMsg('Not enough energy'); return; }
    if (cost === 999) c.energy = 0; else c.energy -= cost;
    AudioMgr.play('magic');
    applyAttrEffect(key);
    p.cooldowns[cdKey] = (attr.cd || 3) * cdMultiplier(p);
    setChar({ ...c });
  }
  function applyAttrEffect(key) {
    const w = world.current; const p = w.player; const c = charRef.current;
    switch (key) {
      case 'rest': p.stun = 2; c.hp = clamp(c.hp + c.maxHp * 0.08, 0, c.maxHp); break;
      case 'charge': p.buffs.charge = 3; break;
      case 'thorn': p.buffs.thorn = 10; c.hp = clamp(c.hp - c.maxHp * 0.03, 0, c.maxHp); break;
      case 'spark': dealAtAim(8, null); break;
      case 'trouble': p.x -= 80; if (collidesWall(p.x, p.y, false)) p.x += 80; p.invuln = 0.3; break;
      case 'fold': p.x += 80; if (collidesWall(p.x, p.y, false)) p.x -= 80; p.invuln = 0.3; break;
      case 'trip': p.y += 80; if (collidesWall(p.x, p.y, false)) p.y -= 80; p.invuln = 0.3; break;
      case 'click': p.x += Math.cos(p.dir) * 80; p.y += Math.sin(p.dir) * 80; p.invuln = 0.3; break;
      case 'roll': p.x += Math.cos(p.dir) * 130; p.y += Math.sin(p.dir) * 130; p.invuln = 1; break;
      case 'confuse': stunNearest(3); break;
      case 'direct': p.buffs.direct = 10; break;
      case 'fuse': w.effects.push({ x: p.x, y: p.y, type: 'bomb', life: 4, delay: 3, dmg: 80, aff: null, radius: 90, fromPlayer: true }); break;
      case 'smoke': blindNearest(1.5); break;
      case 'heal': c.hp = clamp(c.hp + c.maxHp * 0.15, 0, c.maxHp); break;
      case 'manamore': c.mana = clamp(c.mana + c.maxMana * 0.3, 0, c.maxMana); c.energy = clamp(c.energy - c.maxEnergy * 0.3, 0, c.maxEnergy); break;
      case 'barrier': p.shield = (p.shield || 0) + 80; break;
      case 'surge': c.energy = clamp(c.energy + c.maxEnergy * 0.25, 0, c.maxEnergy); break;
      case 'dust': blindNearest(4); break;
      case 'steal': setMsg('Steal works on player inventories — coming with multiplayer'); break;
      case 'sky': p.sky = 4; break;
      case 'rage': p.buffs.rage = 5; break;
      case 'boost': p.buffs.boost = 3; break;
      case 'reflect': p.buffs.reflect = 5; p.shield = (p.shield || 0) + 50; break;
      case 'recycle': p.buffs.recycle = 15; break;
      case 'pressure': slowAll(0.7, 4); break;
      case 'lifesteal': drainNearest(0.2); break;
      case 'clone': p.shield = (p.shield || 0) + 120; p.buffs.clone = 6; break;
      case 'control': controlNearest(4); break;
      case 'replenish': c.hp = c.maxHp; c.mana = c.maxMana; break;
      case 'slash': killNearest(); c.energy = 0; break;
      case 'timestop': stunAll(4); break;
      // ===== Update 5: new attributes =====
      // F-grade
      case 'twitch': { const a = rand() * Math.PI * 2; p.x += Math.cos(a) * 24; p.y += Math.sin(a) * 24; if (collidesWall(p.x, p.y, false)) { p.x -= Math.cos(a) * 24; p.y -= Math.sin(a) * 24; } p.invuln = 0.15; break; }
      case 'flick': dealAtAim(6, null); break;
      case 'whistle': { const m = findNearestMonster(); if (m) m.stun = Math.max(m.stun || 0, 1); else if (bossInRadius(p.x, p.y, 300)) applyBossStatus('stun', 1); break; }
      case 'stretch': p.buffs.energyRegen = 2; break;
      case 'pebble': { dealAtAim(10, null); const m = findNearestMonster(); if (m) m.stun = Math.max(m.stun || 0, 0.4); else if (bossInRadius(p.x, p.y, 300)) applyBossStatus('stun', 0.4); break; }
      case 'hop': p.x += Math.cos(p.dir) * 60; p.y += Math.sin(p.dir) * 60; if (collidesWall(p.x, p.y, false)) { p.x -= Math.cos(p.dir) * 60; p.y -= Math.sin(p.dir) * 60; } p.invuln = 0.3; break;
      // E-grade
      case 'sidestep': { const a = p.dir + Math.PI / 2; p.x += Math.cos(a) * 70; p.y += Math.sin(a) * 70; if (collidesWall(p.x, p.y, false)) { p.x -= Math.cos(a) * 70; p.y -= Math.sin(a) * 70; } p.invuln = 0.5; break; }
      case 'vault': p.x += Math.cos(p.dir) * 150; p.y += Math.sin(p.dir) * 150; if (collidesWall(p.x, p.y, false)) { p.x -= Math.cos(p.dir) * 150; p.y -= Math.sin(p.dir) * 150; } p.invuln = 0.4; break;
      case 'jab': dealAtAim(18, null); break;
      case 'smokelet': blindNearest(1); break;
      case 'dartstep': { p.x += Math.cos(p.dir) * 120; p.y += Math.sin(p.dir) * 120; if (collidesWall(p.x, p.y, false)) { p.x -= Math.cos(p.dir) * 120; p.y -= Math.sin(p.dir) * 120; } p.invuln = 0.3; const m = findNearestMonster(); if (m) damageMonster(m, 12, null); else if (bossInRadius(p.x, p.y, 80)) damageBoss(12, null); break; }
      // D-grade
      case 'snare': { const m = findNearestMonster(); if (m) { m.stun = Math.max(m.stun || 0, 2); m.freeze = Math.max(m.freeze || 0, 2); } else if (bossInRadius(p.x, p.y, 300)) applyBossStatus('freeze', 2); break; }
      case 'dazzle': for (const m of monstersInRadius(p.x, p.y, 160)) m.aiCooldown = 1.5; break;
      case 'quickstep': p.buffs.quickstep = 4; break;
      case 'parry': p.buffs.reflect = 5; p.shield = (p.shield || 0) + 60; break;
      case 'bashlet': { const m = findNearestMonster(); if (m) { damageMonster(m, 20, null); pushMonster(m, p.x, p.y, 70); } else if (bossInRadius(p.x, p.y, 80)) damageBoss(20, null); break; }
      case 'ironskin': p.buffs.ironskin = 4; break;
      // C-grade
      case 'regen': p.buffs.regen = 5; break;
      case 'cleanse': c.statusEffects = []; p.blind = 0; p.slow = 0; break;
      case 'focus': p.buffs.focus = 5; break;
      case 'warcry': for (const m of monstersInRadius(p.x, p.y, 170)) { m.stun = Math.max(m.stun || 0, 2); } if (bossInRadius(p.x, p.y, 170)) applyBossStatus('stun', 2); break;
      case 'lull': for (const m of monstersInRadius(p.x, p.y, 170)) m.slow = Math.max(m.slow || 0, 4); if (bossInRadius(p.x, p.y, 170)) applyBossStatus('slow', 4); break;
      case 'footwork': p.buffs.footwork = 6; p.buffs.quickstep = 6; break;
      // B-grade
      case 'frenzy': p.buffs.frenzy = 5; break;
      case 'blink': p.x += Math.cos(p.dir) * 250; p.y += Math.sin(p.dir) * 250; if (collidesWall(p.x, p.y, false)) { p.x -= Math.cos(p.dir) * 250; p.y -= Math.sin(p.dir) * 250; } p.invuln = 0.3; break;
      case 'fortify': p.shield = (p.shield || 0) + 200; break;
      case 'siphon': drainNearest(0.12); break;
      case 'quake': for (const m of monstersInRadius(p.x, p.y, 160)) m.stun = Math.max(m.stun || 0, 1.5); if (bossInRadius(p.x, p.y, 160)) applyBossStatus('stun', 1.5); w.effects.push({ x: p.x, y: p.y, type: 'aoe', life: 0.4, color: '#8d6e63', radius: 160 }); break;
      case 'mirror': p.buffs.mirror = 3; break;
      // A-grade
      case 'overcharge': p.buffs.overcharge = 4; break;
      case 'vanish': p.buffs.vanish = 3; p.sky = 3; break;
      case 'bulwark': p.buffs.bulwark = 4; break;
      // S-grade
      case 'apex': p.buffs.apex = 6; break;
      case 'rewind': { const snap = p.rewindSnap; if (snap) { c.hp = snap.hp; c.mana = snap.mana; c.energy = snap.energy; setMsg('Rewound to 4s ago'); } else { c.hp = clamp(c.hp + c.maxHp * 0.3, 0, c.maxHp); } break; }
      case 'immortal': p.buffs.immortal = 5; break;
      case 'annihilate': w.effects.push({ x: p.x + Math.cos(p.dir) * 120, y: p.y + Math.sin(p.dir) * 120, type: 'aoe', life: 0.6, delay: 0.05, dmg: 600, aff: null, radius: 130, fromPlayer: true, color: '#ff1744' }); break;
      case 'dominion': for (const m of monstersInRadius(p.x, p.y, 400)) { m.stun = Math.max(m.stun || 0, 5); m.slow = Math.max(m.slow || 0, 5); } if (bossInRadius(p.x, p.y, 400)) { applyBossStatus('stun', 5); applyBossStatus('slow', 5); } break;
      case 'ascend': c.hp = c.maxHp; c.mana = c.maxMana; p.buffs.apex = 4; p.invuln = 4; break;
    }
  }
  function dealAtAim(dmg, aff) {
    const w = world.current; const p = w.player;
    const cur = vpRef.current;
    const ang = Math.atan2(w.mouse.y - cur.h / 2, w.mouse.x - cur.w / 2);
    w.projectiles.push({ x: p.x, y: p.y, vx: Math.cos(ang) * 400, vy: Math.sin(ang) * 400, life: 1.2, dmg, aff, fromPlayer: true, color: aff ? (AFFS[aff]?.color || SUB_COLOR[aff] || '#fff') : '#fff' });
  }
  function findNearestMonster() {
    const w = world.current; if (!w.maze) return null;
    let best = null, bd = Infinity;
    for (const m of w.maze.monsters) {
      if (m.hp <= 0) continue;
      const mx = m.x * 40 + 20, my = m.y * 40 + 20;
      const d = Math.hypot(mx - w.player.x, my - w.player.y);
      if (d < bd && d < 300) { bd = d; best = m; }
    }
    return best;
  }
  function stunNearest(d) { const m = findNearestMonster(); if (m) m.stun = d; if (bossInRadius(world.current.player.x, world.current.player.y, 300)) applyBossStatus('stun', d); }
  function blindNearest(d) { const m = findNearestMonster(); if (m) m.aiCooldown = d; const w = world.current; if (bossInRadius(w.player.x, w.player.y, 300)) w.maze.bossTelegraphTimer = Math.max(w.maze.bossTelegraphTimer || 0, 0); }
  function slowAll(a, d) { const w = world.current; if (!w.maze) return; for (const m of w.maze.monsters) if (m.hp > 0) m.slow = d; applyBossStatus('slow', d); }
  function stunAll(d) { const w = world.current; if (!w.maze) return; for (const m of w.maze.monsters) if (m.hp > 0) m.stun = d; applyBossStatus('stun', d); }
  function drainNearest(a) {
    const m = findNearestMonster();
    const w = world.current; const c = charRef.current;
    if (m) {
      const drain = m.maxHp * a; m.hp -= drain;
      c.hp = clamp(c.hp + drain, 0, c.maxHp);
      addFloat(m.x * 40 + 20, m.y * 40 + 20, '-' + Math.floor(drain), '#ff5252');
      if (m.hp <= 0) onMonsterDeath(m);
    } else if (bossInRadius(w.player.x, w.player.y, 300)) {
      // Lifesteal off the boss: drain a capped flat amount so it can't be cheesed.
      const drain = Math.min(w.maze.bossMaxHp * a * 0.25, w.maze.bossMaxHp * 0.05);
      damageBoss(drain, null); c.hp = clamp(c.hp + drain, 0, c.maxHp);
    }
  }
  function killNearest() {
    const m = findNearestMonster(); const w = world.current;
    if (m) { m.hp = 0; onMonsterDeath(m); }
    else if (bossInRadius(w.player.x, w.player.y, 300)) {
      // Slash vs boss: a huge execute strike (25% max HP) rather than instant kill.
      damageBoss(w.maze.bossMaxHp * 0.25, null);
      addFloat(w.maze.bossPx, w.maze.bossPy - 40, 'EXECUTE', '#ff1744');
    }
  }
  function controlNearest(d) { const m = findNearestMonster(); if (m) m.stun = d; if (bossInRadius(world.current.player.x, world.current.player.y, 300)) applyBossStatus('stun', d); }

  function useAffinitySlot(letter) {
    const slot = { q: 0, e: 1, r: 2, f: 3, g: 4 }[letter];
    if (slot == null) return;
    const c = charRef.current; if (!c) return;
    const entry = (c.equippedAbilityList || [])[slot];
    if (!entry) { setMsg('No ability in this slot'); return; }
    castAbilityByEntry(entry);
  }
  function castAbilityByEntry(entry) {
    const c = charRef.current; if (!c) return;
    const list = entry.isSub ? (SUB_ABILITIES[entry.aff] || []) : (ABILITIES[entry.aff] || []);
    const abil = list.find(a => a.n === entry.name);
    if (!abil) { setMsg('Ability not found'); return; }
    const w = world.current; const p = w.player;
    if (p.stun > 0) return;
    p.cooldowns = p.cooldowns || {};
    const cdKey = 'abil_' + entry.aff + '_' + entry.name;
    if ((p.cooldowns[cdKey] || 0) > 0) { setMsg(`${abil.n} on cooldown (${p.cooldowns[cdKey].toFixed(1)}s)`); return; }
    if (c.mana < abil.m) { setMsg('Not enough mana'); return; }
    const manaCost = (p.silenced > 0) ? Math.ceil(abil.m * 1.6) : abil.m;
    if (c.mana < manaCost) { setMsg('Silenced — not enough mana'); return; }
    c.mana -= manaCost;
    AudioMgr.play('magic');
    p.cooldowns[cdKey] = (abil.cd || 3) * cdMultiplier(p);
    p.lastAbilityUsed = { name: entry.name, aff: entry.aff };
    let mult = 1;
    const wpn = WEAPONS[c.weapon];
    if (wpn?.manaBoost) mult += wpn.manaBoost;
    if (wpn?.mech === 'spell_echo') mult += (wpn.mechVal || 0.25);
    if (p.buffs.focus) mult += 0.2;
    if (p.buffs.boost) mult *= 1.2;
    if (p.buffs.double) mult *= 2;
    if (p.buffs.rage) mult *= 1.3;
    if (p.buffs.apex) mult *= 1.8;
    fireAbility(abil, entry.aff, mult);
    if (wpn?.mech === 'spell_echo' && rand() < 0.2) {
      setMsg(`${abil.n} echoed!`);
      setTimeout(() => { try { fireAbility(abil, entry.aff, mult * 0.6); } catch (e) {} }, 140);
    }
    grantAffinityExp(entry.aff, 5);
    setChar({ ...c });
  }

  // Element family for picking a visual treatment when firing abilities.
  function affKind(aff) {
    if (['Fire', 'Lava'].includes(aff)) return 'fire';
    if (['Water', 'Ice', 'Blood'].includes(aff)) return 'water';
    if (['Lightning', 'Weather'].includes(aff)) return 'lightning';
    if (['Earth', 'Metal', 'Nature'].includes(aff)) return 'earth';
    if (['Air', 'Poison Gas'].includes(aff)) return 'air';
    if (['Light', 'Time'].includes(aff)) return 'light';
    if (['Darkness', 'Space'].includes(aff)) return 'dark';
    return 'arcane';
  }

  function fireAbility(abil, aff, mult) {
    const w = world.current; const p = w.player; const c = charRef.current;
    const cur = vpRef.current;
    const ang = Math.atan2(w.mouse.y - cur.h / 2, w.mouse.x - cur.w / 2);
    const color = AFFS[aff]?.color || SUB_COLOR[aff] || '#fff';
    const fam = affKind(aff);
    const dmg = abil.d * mult;
    if (abil.k === 'projectile') {
      const sp = 470;
      w.projectiles.push({ x: p.x, y: p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1.6, dmg, aff, fromPlayer: true, color, big: true, spell: fam, trail: true });
      w.effects.push({ x: p.x + Math.cos(ang) * 20, y: p.y + Math.sin(ang) * 20, type: 'spellburst', life: 0.22, color, radius: 22, fam });

    } else if (abil.k === 'homing_orb') {
      // Slow, seeking orb that curves into the nearest enemy.
      w.projectiles.push({ x: p.x, y: p.y, vx: Math.cos(ang) * 300, vy: Math.sin(ang) * 300, life: 2.4, dmg, aff, fromPlayer: true, color, big: true, spell: fam, trail: true, homing: true });
      w.effects.push({ x: p.x, y: p.y, type: 'spellburst', life: 0.25, color, radius: 20, fam });

    } else if (abil.k === 'pierce_line') {
      // A fast lance that passes through every enemy in its path.
      w.projectiles.push({ x: p.x, y: p.y, vx: Math.cos(ang) * 620, vy: Math.sin(ang) * 620, life: 0.9, dmg, aff, fromPlayer: true, color, big: true, spell: fam, trail: true, pierce: true, hitSet: new Set() });
      w.effects.push({ x: p.x, y: p.y, type: 'beam', life: 0.18, ang, len: 120, color, fam });

    } else if (abil.k === 'beam') {
      castBeam(p, ang, dmg, aff, color, fam);

    } else if (abil.k === 'chain') {
      // Hits nearest enemy, then arcs to several more with lightning links.
      castChain(p, ang, dmg, aff, color);

    } else if (abil.k === 'melee') {
      // A close, powerful elemental strike in front of the player (a real melee spell).
      castSpellMelee(p, ang, dmg, aff, color, fam);

    } else if (abil.k === 'slam') {
      // Telegraphed ground slam at the aim point — heavy single burst.
      const tx = p.x + Math.cos(ang) * 120, ty = p.y + Math.sin(ang) * 120;
      w.effects.push({ x: tx, y: ty, type: 'slam', life: 0.7, delay: 0.35, dmg, aff, radius: 95, fromPlayer: true, color, fam });

    } else if (abil.k === 'barrage') {
      // A volley of small bursts raining over an area in front of the player.
      const cx = p.x + Math.cos(ang) * 120, cy = p.y + Math.sin(ang) * 120;
      for (let i = 0; i < 6; i++) {
        const ox = (rand() - 0.5) * 150, oy = (rand() - 0.5) * 150;
        w.effects.push({ x: cx + ox, y: cy + oy, type: 'nova', life: 0.45, delay: 0.1 + i * 0.08, dmg: dmg / 3, aff, radius: 55, fromPlayer: true, color, fam });
      }

    } else if (abil.k === 'orbit') {
      // Spinning orbs circle the player, damaging everything around.
      w.effects.push({ x: p.x, y: p.y, type: 'orbit', life: 1.1, dmg, aff, radius: 95, fromPlayer: true, color, fam, follow: true });
      // damage in a ring around the player a couple times
      for (let i = 0; i < 3; i++) w.effects.push({ x: p.x, y: p.y, type: 'nova', life: 0.4, delay: i * 0.3, dmg: dmg / 3, aff, radius: 100, fromPlayer: true, color, fam, follow: true });

    } else if (abil.k === 'dot_field') {
      // A lingering hazardous field that ticks damage over time. Buffed in Update 10.
      const tx = p.x + Math.cos(ang) * 90, ty = p.y + Math.sin(ang) * 90;
      w.effects.push({ x: tx, y: ty, type: 'field', life: 3.5, dmg, aff, radius: 110, fromPlayer: true, color, fam, tickAcc: 0 });

    } else if (abil.k === 'aoe') {
      w.effects.push({ x: p.x, y: p.y, type: 'nova', life: 0.55, delay: 0.08, dmg, aff, radius: 140, fromPlayer: true, color, fam });

    } else if (abil.k === 'nova') {
      w.effects.push({ x: p.x, y: p.y, type: 'nova', life: 0.6, delay: 0.06, dmg, aff, radius: 160, fromPlayer: true, color, fam });

    } else if (abil.k === 'ultimate') {
      w.effects.push({ x: p.x, y: p.y, type: 'ultimate', life: 1.0, delay: 0.12, dmg, aff, radius: 270, fromPlayer: true, color, fam });
      w.effects.push({ x: p.x, y: p.y, type: 'nova', life: 0.5, delay: 0.0, dmg: dmg * 0.4, aff, radius: 150, fromPlayer: true, color, fam });

    } else if (abil.k === 'cone') {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = ang + (i - (n - 1) / 2) * 0.16;
        w.projectiles.push({ x: p.x, y: p.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, life: 0.9, dmg: dmg / 2.5, aff, fromPlayer: true, color, spell: fam });
      }
      w.effects.push({ x: p.x, y: p.y, type: 'cone', life: 0.3, ang, arc: 70, range: 150, color, fam });

    } else if (abil.k === 'shield') {
      p.shield = (p.shield || 0) + 150 + dmg * 0.5;
      w.effects.push({ x: p.x, y: p.y, type: 'spellburst', life: 0.5, color, radius: 34, fam });

    } else if (abil.k === 'dash') {
      const dist = 220; const ox = p.x, oy = p.y;
      p.x += Math.cos(ang) * dist; p.y += Math.sin(ang) * dist;
      if (collidesWall(p.x, p.y, false)) { p.x = ox; p.y = oy; }
      p.invuln = 0.5;
      for (let i = 1; i <= 4; i++) w.effects.push({ x: ox + (p.x - ox) * i / 5, y: oy + (p.y - oy) * i / 5, type: 'spellburst', life: 0.3, color, radius: 14, fam });
      w.effects.push({ x: p.x, y: p.y, type: 'nova', life: 0.4, delay: 0, dmg, aff, radius: 90, fromPlayer: true, color, fam });

    } else if (abil.k === 'heal') {
      c.hp = clamp(c.hp + c.maxHp * 0.3 + dmg, 0, c.maxHp);
      w.effects.push({ x: p.x, y: p.y, type: 'spellburst', life: 0.6, color: '#69f0ae', radius: 36, fam: 'light' });
      addFloat(p.x, p.y - 30, '+heal', '#69f0ae');
    }
  }

  function castSpellMelee(p, ang, dmg, aff, color, fam) {
    const w = world.current;
    const range = 75, arcR = 1.1;
    const hit = (tx, ty) => {
      if (Math.hypot(tx - p.x, ty - p.y) > range) return false;
      const a = Math.atan2(ty - p.y, tx - p.x); let da = Math.abs(a - ang); if (da > Math.PI) da = 2 * Math.PI - da;
      return da < arcR;
    };
    if (w.maze) {
      for (const m of w.maze.monsters) { if (m.hp <= 0) continue; if (hit(m.x * 40 + 20, m.y * 40 + 20)) damageMonster(m, dmg, aff); }
      if (!w.maze.boss.defeated && w.maze.bossHp != null && hit(w.maze.bossPx, w.maze.bossPy)) damageBoss(dmg, aff);
    }
    w.effects.push({ x: p.x, y: p.y, type: 'slash', swing: 'chop', ang, range, arc: 130, life: 0.22, color });
    w.effects.push({ x: p.x + Math.cos(ang) * 40, y: p.y + Math.sin(ang) * 40, type: 'spellburst', life: 0.3, color, radius: 26, fam });
  }

  function castChain(p, ang, dmg, aff, color) {
    const w = world.current; if (!w.maze) return;
    let cx = p.x, cy = p.y; const hitOrder = []; const used = new Set();
    // 6 hops with strong falloff retention: 100%, 85%, 85%, 85%, 85%, 70% per hop (Update 10 buff).
    const hopMult = [1.0, 0.85, 0.85, 0.85, 0.85, 0.70];
    for (let hop = 0; hop < hopMult.length; hop++) {
      let best = null, bd = (hop === 0 ? 400 : 220);
      for (const m of w.maze.monsters) { if (m.hp <= 0 || used.has(m)) continue; const d = Math.hypot(m.x * 40 + 20 - cx, m.y * 40 + 20 - cy); if (d < bd) { bd = d; best = m; } }
      if (!best) break;
      used.add(best); hitOrder.push([cx, cy, best.x * 40 + 20, best.y * 40 + 20]);
      damageMonster(best, dmg * hopMult[hop], aff);
      cx = best.x * 40 + 20; cy = best.y * 40 + 20;
    }
    if (!hitOrder.length) {
      hitOrder.push([p.x, p.y, p.x + Math.cos(ang) * 200, p.y + Math.sin(ang) * 200]);
    }
    w.effects.push({ x: p.x, y: p.y, type: 'chain', life: 0.3, color, segs: hitOrder });
    // Chain still arcs to the boss if it's in range, at full damage (buffed from previous version).
    if (!w.maze.boss.defeated && w.maze.bossHp != null && Math.hypot(w.maze.bossPx - p.x, w.maze.bossPy - p.y) < 420) damageBoss(dmg, aff);
  }

  function castBeam(p, ang, dmg, aff, color, fam) {
    const w = world.current;
    const maxR = 460; let endR = maxR;
    for (let r = 20; r <= maxR; r += 20) {
      if (collidesWall(p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r, true)) { endR = r; break; }
    }
    if (w.maze) {
      for (const m of w.maze.monsters) {
        if (m.hp <= 0) continue;
        const mx = m.x * 40 + 20, my = m.y * 40 + 20;
        if (Math.hypot(mx - p.x, my - p.y) > endR + 20) continue;
        const a = Math.atan2(my - p.y, mx - p.x);
        let da = Math.abs(a - ang); if (da > Math.PI) da = 2 * Math.PI - da;
        if (da < 0.18) damageMonster(m, dmg, aff);
      }
      if (!w.maze.boss.defeated && w.maze.bossHp != null) {
        const a = Math.atan2(w.maze.bossPy - p.y, w.maze.bossPx - p.x);
        let da = Math.abs(a - ang); if (da > Math.PI) da = 2 * Math.PI - da;
        if (Math.hypot(w.maze.bossPx - p.x, w.maze.bossPy - p.y) < endR + 30 && da < 0.22) damageBoss(dmg, aff);
      }
    }
    w.effects.push({ x: p.x, y: p.y, type: 'beam', life: 0.25, ang, len: endR, color, fam });
  }

  function tryInteract() {
    const w = world.current; const p = w.player;
    // Interior focus (altar/anvil/desk/etc.) opens the destination's menu.
    if (INTERIORS[w.zone]) {
      const f = INTERIORS[w.zone].focus;
      if (f && Math.hypot(f.x - p.x, f.y - p.y) < 70) {
        if (f.action === 'settings') setModal('settings');
        else setModal(f.action);
        return;
      }
    }
    for (const n of w.npcs) {
      if (Math.hypot(n.x - p.x, n.y - p.y) < 70) { if (n.action) n.action(); else if (n.text) setMsg(n.text); return; }
    }
    if (w.maze) {
      for (const ch of w.maze.chests) {
        if (ch.opened) continue;
        const cx = ch.x * 40 + 20, cy = ch.y * 40 + 20;
        if (Math.hypot(cx - p.x, cy - p.y) < 50) { openChest(ch); return; }
      }
    }
  }
  // Scatter collectable loot orbs across a floor. Walking over one grants it.
  // Items are common; weapons are rare; quality scales with floor (floorLootGrade).
  function spawnFloorLoot(maze, floor) {
    maze.loot = [];
    if (!maze.grid) return;
    // Gather walkable open tiles away from the spawn.
    const open = [];
    for (let y = 1; y < maze.H - 1; y++) {
      for (let x = 1; x < maze.W - 1; x++) {
        const t = maze.grid[y][x];
        if (t === 0 || t === 4 || t === 6 || t === 7) open.push([x, y]);
      }
    }
    if (!open.length) return;
    // 4-7 loot orbs per floor.
    const count = 4 + Math.floor(rand() * 4);
    const used = new Set();
    for (let i = 0; i < count && open.length; i++) {
      let pick3, tries = 0;
      do { pick3 = open[Math.floor(rand() * open.length)]; tries++; } while (used.has(pick3[0] + ',' + pick3[1]) && tries < 10);
      used.add(pick3[0] + ',' + pick3[1]);
      // ~82% item, ~12% weapon, ~6% pure coins
      const r = rand();
      // ~80% item, ~9% weapon, ~3% armor (rare), ~8% coins
      const kind = r < 0.80 ? 'item' : (r < 0.89 ? 'weapon' : (r < 0.92 ? 'armor' : 'coins'));
      maze.loot.push({ x: pick3[0], y: pick3[1], kind, taken: false });
    }
  }

  function collectFloorLoot(orb) {
    orb.taken = true;
    const c = charRef.current;
    const floor = world.current.floor;
    const grade = floorLootGrade(floor);
    if (orb.kind === 'weapon') {
      const weaponKey = rollDungeonWeapon(floor);
      if (weaponKey && !c.ownedWeapons.includes(weaponKey)) {
        c.ownedWeapons.push(weaponKey); c.weaponLevels = c.weaponLevels || {}; c.weaponLevels[weaponKey] = c.weaponLevels[weaponKey] || 1;
        setMsg(`Found a weapon: ${WEAPONS[weaponKey].n}!`);
      } else {
        const itemKey = rollItemOfGrade(grade);
        if (itemKey) { addItemToInventory({ key: itemKey, name: ITEMS[itemKey].n, grade }); setMsg(`Found ${grade}-grade ${ITEMS[itemKey].n}`); }
      }
    } else if (orb.kind === 'armor') {
      const armorKey = rollDungeonArmor(floor);
      if (armorKey && grantArmor(c, armorKey)) {
        setMsg(`Found armor: ${ARMORS[armorKey].n}!`);
      } else {
        const itemKey = rollItemOfGrade(grade);
        if (itemKey) { addItemToInventory({ key: itemKey, name: ITEMS[itemKey].n, grade }); setMsg(`Found ${grade}-grade ${ITEMS[itemKey].n}`); }
      }
    } else if (orb.kind === 'coins') {
      const coins = Math.floor(15 + rand() * 40 + floor * 4);
      c.coins += coins; setMsg(`Found 🪙 ${coins}`);
    } else {
      const itemKey = rollItemOfGrade(grade);
      if (itemKey) { addItemToInventory({ key: itemKey, name: ITEMS[itemKey].n, grade }); setMsg(`Found ${grade}-grade ${ITEMS[itemKey].n}`); }
      else { const coins = Math.floor(10 + floor * 3); c.coins += coins; setMsg(`Found 🪙 ${coins}`); }
    }
    AudioMgr.play('chest');
    setChar({ ...c });
  }

  function openChest(ch) {
    ch.opened = true;
    const c = charRef.current;
    const floor = world.current.floor;
    const grade = floorLootGrade(floor);
    const coins = Math.floor(20 + rand() * 50 + floor * 5);
    c.coins += coins;
    // Loot roll: items are common, weapons rare, armor rarer, scaling with floor.
    const roll = rand();
    if (roll < 0.04) {
      // Armor find (rare).
      const armorKey = rollDungeonArmor(floor);
      if (armorKey && grantArmor(c, armorKey)) {
        setMsg(`Chest: armor — ${ARMORS[armorKey].n}! (+🪙${coins})`);
      } else {
        const itemKey = rollItemOfGrade(grade);
        if (itemKey) { addItemToInventory({ key: itemKey, name: ITEMS[itemKey].n, grade }); setMsg(`Chest: ${grade}-grade ${ITEMS[itemKey].n} (+🪙${coins})`); }
        else setMsg(`Chest: +🪙${coins}`);
      }
    } else if (roll < 0.14) {
      // Weapon find (rarer). Quality rises with floor via rollDungeonWeapon's floor gate.
      const weaponKey = rollDungeonWeapon(floor);
      if (weaponKey && !c.ownedWeapons.includes(weaponKey)) {
        c.ownedWeapons.push(weaponKey); c.weaponLevels = c.weaponLevels || {}; c.weaponLevels[weaponKey] = c.weaponLevels[weaponKey] || 1;
        setMsg(`Chest: a weapon — ${WEAPONS[weaponKey].n}! (+🪙${coins})`);
      } else {
        // already owned or none available -> fall back to an item
        const itemKey = rollItemOfGrade(grade);
        if (itemKey) { addItemToInventory({ key: itemKey, name: ITEMS[itemKey].n, grade }); setMsg(`Chest: ${grade}-grade ${ITEMS[itemKey].n} (+🪙${coins})`); }
        else setMsg(`Chest: +🪙${coins}`);
      }
    } else {
      // Item find (common).
      const itemKey = rollItemOfGrade(grade);
      if (itemKey) { addItemToInventory({ key: itemKey, name: ITEMS[itemKey].n, grade }); setMsg(`Chest: ${grade}-grade ${ITEMS[itemKey].n}! (+🪙${coins})`); }
      else setMsg(`Chest: +🪙${coins}`);
    }
    AudioMgr.play('chest');
    setChar({ ...c });
  }
  function updateInteractPrompt() {
    const w = world.current; const p = w.player;
    let prompt = '';
    if (INTERIORS[w.zone]) {
      const f = INTERIORS[w.zone].focus;
      if (f && Math.hypot(f.x - p.x, f.y - p.y) < 70) prompt = f.prompt;
      else if (p.y > INTERIORS[w.zone].h - 50 && Math.abs(p.x - INTERIORS[w.zone].w / 2) < 70) prompt = '← Exit to Hub';
    }
    if (!prompt && w.zone === 'hub') {
      for (const g of ZONES.hub.gates) {
        if (Math.hypot(g.x - p.x, g.y - p.y) < 60) { prompt = `${g.label} →`; break; }
      }
    }
    if (!prompt) for (const n of w.npcs) if (Math.hypot(n.x - p.x, n.y - p.y) < 70) { prompt = n.prompt || 'Talk [SPACE]'; break; }
    if (!prompt && w.maze) for (const ch of w.maze.chests) {
      if (ch.opened) continue;
      const cx = ch.x * 40 + 20, cy = ch.y * 40 + 20;
      if (Math.hypot(cx - p.x, cy - p.y) < 50) { prompt = 'Open Chest [SPACE]'; break; }
    }
    w.interactPrompt = prompt;
  }
  function checkZoneTransitions() {
    const w = world.current; const p = w.player;
    if (w.zone === 'starting' && p.x > 1595 && p.y > 400 && p.y < 500) enterZone('hub', 'fromStarting');
    if (w.zone === 'hub' && p.x < 5 && p.y > 640 && p.y < 740) enterZone('starting', 'fromHub');
    // Hub gates -> interiors (or special handling)
    if (w.zone === 'hub' && !w.gateCooldown) {
      for (const g of ZONES.hub.gates) {
        if (Math.hypot(g.x - p.x, g.y - p.y) < 38) {
          if (g.kind === 'party') { setMsg('The Tavern is closed — party play needs online multiplayer (future update).'); w.gateCooldown = 0.8; break; }
          if (g.to) {
            w.hubReturn = { x: g.x, y: g.y + 70 }; // return just below the gate
            w.gateCooldown = 0.8;
            enterZone(g.to);
            break;
          }
        }
      }
    }
    // Interior exit pad (bottom-center) -> back to hub
    if (INTERIORS[w.zone]) {
      const intr = INTERIORS[w.zone];
      if (p.y > intr.h - 30 && Math.abs(p.x - intr.w / 2) < 60) {
        w.gateCooldown = 0.8;
        enterZone('hub');
      }
    }
  }
  function addFloat(x, y, text, color) { world.current.floats.push({ x, y, text, color, life: 1.2 }); }
  function addItemToInventory(item) {
    const c = charRef.current;
    const data = item.key ? ITEMS[item.key] : null;
    // Stack if item is a regular stackable consumable, OR if it's a trophy (stack by grade/key).
    const stackable = (data && data.stack && !item.isTrophy) || item.isTrophy;
    const cap = MAX_STACK || 99;
    if (stackable) {
      // Fill existing stacks of the same key (trophies match by key, which encodes grade).
      for (const slot of c.inventory) {
        const sameTrophy = item.isTrophy && slot.isTrophy && slot.key === item.key;
        const sameItem = !item.isTrophy && !slot.isTrophy && slot.key === item.key;
        if ((sameTrophy || sameItem) && (slot.qty || 1) < cap) {
          slot.qty = (slot.qty || 1) + (item.qty || 1);
          let overflow = 0;
          if (slot.qty > cap) { overflow = slot.qty - cap; slot.qty = cap; }
          if (overflow <= 0) { setChar({ ...c }); return true; }
          item = { ...item, qty: overflow };
        }
      }
    }
    if (c.inventory.length >= 20) { setMsg('Inventory full! Item lost.'); return false; }
    c.inventory = [...c.inventory, { ...item, qty: item.qty || 1 }];
    setChar({ ...c });
    return true;
  }
  function useItem(idx) {
    const c = charRef.current; const item = c.inventory[idx]; if (!item) return;
    if (item.isTrophy) { setMsg('Trophies can only be sold at the shop'); return; }
    const data = ITEMS[item.key]; if (!data) return;
    AudioMgr.play('magic');
    const w = world.current; const p = w.player;
    switch (data.e) {
      case 'fullRestore': c.hp = c.maxHp; c.mana = c.maxMana; c.energy = c.maxEnergy; break;
      case 'double10s': p.buffs.double = 10; break;
      case 'heal30': c.hp = clamp(c.hp + c.maxHp * 0.3, 0, c.maxHp); break;
      case 'mana30': c.mana = clamp(c.mana + c.maxMana * 0.3, 0, c.maxMana); break;
      case 'energy30': c.energy = clamp(c.energy + c.maxEnergy * 0.3, 0, c.maxEnergy); break;
      case 'heal20': c.hp = clamp(c.hp + c.maxHp * 0.2, 0, c.maxHp); break;
      case 'mana20': c.mana = clamp(c.mana + c.maxMana * 0.2, 0, c.maxMana); break;
      case 'energy20': c.energy = clamp(c.energy + c.maxEnergy * 0.2, 0, c.maxEnergy); break;
      case 'heal10': c.hp = clamp(c.hp + c.maxHp * 0.1, 0, c.maxHp); break;
      case 'mana10': c.mana = clamp(c.mana + c.maxMana * 0.1, 0, c.maxMana); break;
      case 'energy10': c.energy = clamp(c.energy + c.maxEnergy * 0.1, 0, c.maxEnergy); break;
      case 'heal7': c.hp = clamp(c.hp + c.maxHp * 0.07, 0, c.maxHp); break;
      case 'heal5': c.hp = clamp(c.hp + c.maxHp * 0.05, 0, c.maxHp); break;
      case 'mana5': c.mana = clamp(c.mana + c.maxMana * 0.05, 0, c.maxMana); break;
      case 'energy5': c.energy = clamp(c.energy + c.maxEnergy * 0.05, 0, c.maxEnergy); break;
      case 'heal2': c.hp = clamp(c.hp + c.maxHp * 0.02, 0, c.maxHp); break;
      case 'heal3': c.hp = clamp(c.hp + c.maxHp * 0.03, 0, c.maxHp); break;
      case 'heal12': c.hp = clamp(c.hp + c.maxHp * 0.12, 0, c.maxHp); break;
      case 'boost15s': p.buffs.boost = 15; setMsg('Power Draught! +20% damage 15s'); break;
      case 'haste15s': p.buffs.quickstep = 15; setMsg('Swift Tonic! +25% speed 15s'); break;
      case 'guard15s': p.buffs.ironskin = 15; setMsg('Iron Tonic! -25% damage 15s'); break;
      case 'cd50_30': p.buffs.cdHaste = 30; p.cdHasteAmt = 0.50; setMsg('Eternal Sigil! -50% cooldowns for 30s'); break;
      case 'cd35_25': p.buffs.cdHaste = 25; p.cdHasteAmt = 0.35; setMsg('Chrono Charm! -35% cooldowns for 25s'); break;
      case 'cd25_20': p.buffs.cdHaste = 20; p.cdHasteAmt = 0.25; setMsg('Swift Rune! -25% cooldowns for 20s'); break;
      case 'cd15_15': p.buffs.cdHaste = 15; p.cdHasteAmt = 0.15; setMsg('Haste Bead! -15% cooldowns for 15s'); break;
      case 'immune_45': p.buffs.statusImmune = 45; setMsg('Warding Amulet! Immune to status effects 45s'); break;
      case 'immune_25': p.buffs.statusImmune = 25; setMsg('Ward Charm! Immune to status effects 25s'); break;
      case 'immune_15': p.buffs.statusImmune = 15; setMsg('Ward Pendant! Immune to status effects 15s'); break;
      case 'immune_8':  p.buffs.statusImmune = 8;  setMsg('Ward Token! Immune to status effects 8s'); break;
      case 'shield150': p.shield = (p.shield || 0) + 150; setMsg('Shield up! +150'); break;
      case 'cleanse': c.statusEffects = []; p.blind = 0; p.slow = 0; setMsg('Cleansed!'); break;
      case 'blindAll': for (const m of monstersInRadius(p.x, p.y, 180)) m.aiCooldown = 2; setMsg('Smoke bomb!'); break;
      case 'rockHit': { const m = findNearestMonster(); if (m) { damageMonster(m, 20, null); setMsg('Rock hit for 20!'); } else setMsg('No target'); break; }
      case 'reviveBuff': p.buffs.immortal = 5; setMsg('Phoenix Tear! Cannot die for 5s'); break;
      case 'kill': c.hp = 0; break;
      case 'levelUp': grantExp(expForLevel(c.level)); break;
      case 'affinityUp': { const keys = Object.keys(c.affinities); if (keys.length) c.affinities[keys[0]].level++; break; }
      case 'coinFlip': if (rand() < 0.5) { p.buffs.boost = 5; setMsg('Heads! Double damage 5s!'); } else { c.hp = Math.floor(c.hp / 2); setMsg('Tails! Lost half HP!'); } break;
      case 'removeAttr': if (c.attrs.length > 0) { c.attrs.pop(); c.equippedAttrs = (c.equippedAttrs || []).filter(k => c.attrs.some(a => a.key === k)); setMsg('Removed last attribute'); } break;
      default: break;
    }
    const slot = c.inventory[idx];
    if (slot && (slot.qty || 1) > 1) { slot.qty -= 1; c.inventory = [...c.inventory]; }
    else c.inventory = c.inventory.filter((_, i) => i !== idx);
    setChar({ ...c });
    if (c.hp <= 0) onPlayerDeath();
  }
  function dropItem(idx) {
    const c = charRef.current;
    const slot = c.inventory[idx];
    if (slot && (slot.qty || 1) > 1) { slot.qty -= 1; c.inventory = [...c.inventory]; }
    else c.inventory = c.inventory.filter((_, i) => i !== idx);
    setChar({ ...c });
  }

  function enterZone(zone, fromDir = null) {
    const w = world.current;
    w.zone = zone;
    w.projectiles = []; w.effects = []; w.floats = [];
    if (zone === 'starting') {
      w.maze = null;
      const z = ZONES.starting;
      w.player.x = fromDir === 'fromHub' ? 1540 : z.spawn.x;
      w.player.y = fromDir === 'fromHub' ? 450 : z.spawn.y;
      w.npcs = [
        { x: 700, y: 450, color: '#ffeb3b', kind: 'sage', prompt: 'Talk to Sage [SPACE]',
          action: () => setMsg(
            `Welcome, ${charRef.current.name}!\n\n` +
            `• Move WASD\n• Aim mouse, attack J/click\n` +
            `• Attributes 1-7, abilities QERFG\n• TAB inv · C stats · L loadout\n• SPACE interact\n\n` +
            `Walk east to the Hub.`
          )
        },
      ];
      setMsg('Welcome to the Starting Field! Walk east to the Hub.');
    } else if (zone === 'hub') {
      w.maze = null;
      const z = ZONES.hub;
      w.player.x = fromDir === 'fromStarting' ? 60 : (w.hubReturn ? w.hubReturn.x : z.spawn.x);
      w.player.y = fromDir === 'fromStarting' ? 690 : (w.hubReturn ? w.hubReturn.y : z.spawn.y);
      w.hubReturn = null;
      w.npcs = [];
      setMsg('The Hub Plaza. Step onto a glowing gate to enter.');
    } else if (INTERIORS[zone]) {
      w.maze = null;
      const intr = INTERIORS[zone];
      // Enter at the bottom-center (by the exit pad), facing the focus.
      w.player.x = intr.w / 2;
      w.player.y = intr.h - 70;
      w.npcs = [];
      w.interior = zone;
      setMsg(`${intr.name}.`);
    } else if (zone === 'dungeon') {
      w.maze = generateFloor(w.floor);
      w.maze.floor = w.floor;
      w.maze.floorEffect = floorEffect(w.floor);
      w.maze.floorName = floorTheme(w.floor).name;
      // Spawn from the floor's own spawn coords
      w.player.x = w.maze.spawn.x; w.player.y = w.maze.spawn.y;
      w.npcs = [];
      w.lavaBurnAcc = 0; w.effectAcc = 0;
      spawnFloorLoot(w.maze, w.floor);
      setMsg(`F${w.floor} — ${w.maze.floorName}. ${w.maze.intro || ''}`);
    }
    setHudTick(t => t + 1);
  }
// ============================================================
  //                      DRAWING
  // ============================================================
  function drawWorld() {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const w = world.current; const p = w.player;
    const cam = { x: p.x - W / 2, y: p.y - H / 2 };

    const bgColors = { starting: '#1a3a14', hub: '#0f1320', dungeon: w.maze?.theme?.bg || '#0a0612' };
    if (INTERIORS[w.zone]) bgColors[w.zone] = '#06060a';
    ctx.fillStyle = bgColors[w.zone] || '#000';
    ctx.fillRect(0, 0, W, H);

    if (w.zone === 'starting') drawStartingField(ctx, W, H, cam);
    else if (w.zone === 'hub') drawHub(ctx, W, H, cam);
    else if (INTERIORS[w.zone]) drawInterior(ctx, W, H, cam);
    else if (w.zone === 'dungeon' && w.maze) drawDungeon(ctx, W, H, cam);

    // Effects
    for (const ef of w.effects) {
      const ex = ef.x - cam.x, ey = ef.y - cam.y;
      if (ef.type === 'slash') {
        const col = ef.color || '#fff';
        ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10;
        ctx.globalAlpha = Math.max(0, ef.life / 0.2);
        const sw = ef.swing || 'slash';
        const reach = ef.range || 50;
        if (sw === 'thrust' || sw === 'poke' || sw === 'jab') {
          ctx.lineWidth = sw === 'poke' ? 3 : 5; ctx.lineCap = 'round';
          const r2 = sw === 'jab' ? reach * 0.6 : reach;
          ctx.beginPath();
          ctx.moveTo(ex + Math.cos(ef.ang) * 10, ey + Math.sin(ef.ang) * 10);
          ctx.lineTo(ex + Math.cos(ef.ang) * r2, ey + Math.sin(ef.ang) * r2);
          ctx.stroke();
        } else if (sw === 'spin' || ef.arc >= 360) {
          ctx.lineWidth = 5;
          ctx.beginPath(); ctx.arc(ex, ey, reach, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.lineWidth = sw === 'chop' ? 7 : 5;
          ctx.beginPath();
          ctx.arc(ex, ey, reach, ef.ang - (ef.arc * Math.PI / 360), ef.ang + (ef.arc * Math.PI / 360));
          ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.shadowBlur = 0;
      } else if (ef.type === 'bomb') {
        if (ef.delay > 0) {
          ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(ex, ey, 10, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#f00';
          ctx.beginPath(); ctx.arc(ex, ey - 8, 3 + Math.sin(w.timeOfDay * 10) * 2, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = '#ff5722'; ctx.globalAlpha = 0.6;
          ctx.beginPath(); ctx.arc(ex, ey, ef.radius, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else if (ef.type === 'aoe') {
        ctx.fillStyle = ef.color || '#fff';
        ctx.globalAlpha = 0.4 * (ef.life / 0.6);
        ctx.beginPath(); ctx.arc(ex, ey, ef.radius, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (ef.type === 'spellburst') {
        const k = 1 - Math.max(0, ef.life) / 0.6;
        ctx.save(); ctx.shadowColor = ef.color; ctx.shadowBlur = 20;
        ctx.globalAlpha = Math.max(0, ef.life * 2);
        ctx.fillStyle = ef.color;
        ctx.beginPath(); ctx.arc(ex, ey, (ef.radius || 20) * (0.5 + k), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = Math.max(0, ef.life * 3);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ex, ey, (ef.radius || 20) * 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
      } else if (ef.type === 'nova') {
        const total = ef.life0 || 0.55; const k = Math.max(0, Math.min(1, 1 - Math.max(0, ef.life) / total));
        const r = Math.max(0, ef.radius * k);
        const a0 = Math.max(0, Math.min(1, ef.life / total));
        ctx.save(); ctx.shadowColor = ef.color; ctx.shadowBlur = 24;
        ctx.strokeStyle = ef.color; ctx.lineWidth = 6 * a0 + 2;
        ctx.globalAlpha = a0;
        ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.stroke();
        // inner fill flash
        ctx.globalAlpha = 0.25 * a0;
        ctx.fillStyle = ef.color;
        ctx.beginPath(); ctx.arc(ex, ey, Math.max(0, r * 0.8), 0, Math.PI * 2); ctx.fill();
        // family flair
        if (ef.fam === 'lightning') {
          ctx.globalAlpha = a0; ctx.lineWidth = 2;
          for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + Math.cos(a) * r, ey + Math.sin(a) * r); ctx.stroke(); }
        } else if (ef.fam === 'fire') {
          ctx.globalAlpha = 0.5 * a0; ctx.fillStyle = '#ffd54f';
          for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; ctx.beginPath(); ctx.arc(ex + Math.cos(a) * r * 0.9, ey + Math.sin(a) * r * 0.9, 5, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.restore(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
      } else if (ef.type === 'ultimate') {
        const total = ef.life0 || 1.0; const k = Math.max(0, Math.min(1, 1 - Math.max(0, ef.life) / total));
        const a0 = Math.max(0, Math.min(1, ef.life / total));
        ctx.save(); ctx.shadowColor = ef.color; ctx.shadowBlur = 30;
        // screen flash
        ctx.globalAlpha = 0.18 * a0; ctx.fillStyle = ef.color;
        ctx.fillRect(0, 0, W, H);
        // expanding rings
        for (let ring = 0; ring < 3; ring++) {
          const rr = Math.max(0, ef.radius * Math.min(1, k + ring * 0.18));
          ctx.globalAlpha = Math.max(0, a0 - ring * 0.15);
          ctx.strokeStyle = ring === 1 ? '#fff' : ef.color; ctx.lineWidth = 8 - ring * 2;
          ctx.beginPath(); ctx.arc(ex, ey, rr, 0, Math.PI * 2); ctx.stroke();
        }
        // rotating spokes
        ctx.globalAlpha = 0.6 * a0; ctx.strokeStyle = ef.color; ctx.lineWidth = 3;
        const sr = Math.max(0, ef.radius * k);
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + k * 4; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + Math.cos(a) * sr, ey + Math.sin(a) * sr); ctx.stroke(); }
        ctx.restore(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
      } else if (ef.type === 'cone') {
        ctx.save(); ctx.shadowColor = ef.color; ctx.shadowBlur = 16;
        ctx.fillStyle = ef.color; ctx.globalAlpha = Math.max(0, ef.life / 0.3) * 0.5;
        ctx.beginPath(); ctx.moveTo(ex, ey);
        ctx.arc(ex, ey, ef.range, ef.ang - ef.arc * Math.PI / 360, ef.ang + ef.arc * Math.PI / 360);
        ctx.closePath(); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
      } else if (ef.type === 'beam') {
        ctx.save(); ctx.shadowColor = ef.color; ctx.shadowBlur = 24;
        ctx.globalAlpha = Math.max(0, ef.life / 0.25);
        const exb = ex + Math.cos(ef.ang) * ef.len, eyb = ey + Math.sin(ef.ang) * ef.len;
        ctx.strokeStyle = ef.color; ctx.lineWidth = 14; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(exb, eyb); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(exb, eyb); ctx.stroke();
        ctx.restore(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
      } else if (ef.type === 'slam') {
        ctx.save(); ctx.shadowColor = ef.color; ctx.shadowBlur = 20;
        if (ef.delay > 0) {
          // telegraph ring shrinking inward
          const k = Math.max(0, ef.delay) / 0.35;
          ctx.strokeStyle = ef.color; ctx.globalAlpha = 0.8; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(ex, ey, ef.radius, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(ex, ey, ef.radius * (1 - k), 0, Math.PI * 2); ctx.stroke();
        } else {
          const k = 1 - Math.max(0, ef.life) / 0.35;
          ctx.fillStyle = ef.color; ctx.globalAlpha = Math.max(0, 0.6 - k * 0.6);
          ctx.beginPath(); ctx.arc(ex, ey, ef.radius * (0.6 + k * 0.5), 0, Math.PI * 2); ctx.fill();
          // cracks
          ctx.strokeStyle = '#fff'; ctx.globalAlpha = Math.max(0, ef.life * 2); ctx.lineWidth = 3;
          for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + Math.cos(a) * ef.radius, ey + Math.sin(a) * ef.radius); ctx.stroke(); }
        }
        ctx.restore(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
      } else if (ef.type === 'orbit') {
        ctx.save(); ctx.shadowColor = ef.color; ctx.shadowBlur = 18;
        const spin = (1 - Math.max(0, ef.life) / 1.1) * 12;
        ctx.fillStyle = ef.color; ctx.globalAlpha = Math.max(0, ef.life / 1.1);
        for (let i = 0; i < 5; i++) {
          const a = spin + i / 5 * Math.PI * 2;
          ctx.beginPath(); ctx.arc(ex + Math.cos(a) * ef.radius, ey + Math.sin(a) * ef.radius, 7, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore(); ctx.globalAlpha = 1;
      } else if (ef.type === 'field') {
        ctx.save(); ctx.shadowColor = ef.color; ctx.shadowBlur = 14;
        ctx.fillStyle = ef.color; ctx.globalAlpha = 0.18 + 0.08 * Math.sin(w.timeOfDay * 6);
        ctx.beginPath(); ctx.arc(ex, ey, ef.radius, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.4; ctx.strokeStyle = ef.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ex, ey, ef.radius, 0, Math.PI * 2); ctx.stroke();
        // drifting motes
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < 5; i++) { const a = w.timeOfDay * 1.5 + i; const rr = ef.radius * (0.3 + 0.5 * ((i % 3) / 2)); ctx.beginPath(); ctx.arc(ex + Math.cos(a) * rr, ey + Math.sin(a) * rr, 3, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
      } else if (ef.type === 'chain') {
        ctx.save(); ctx.shadowColor = ef.color; ctx.shadowBlur = 16;
        ctx.globalAlpha = Math.max(0, ef.life / 0.3);
        for (const [x1, y1, x2, y2] of (ef.segs || [])) {
          // jagged lightning between points
          ctx.strokeStyle = ef.color; ctx.lineWidth = 4; ctx.beginPath();
          ctx.moveTo(x1 - cam.x, y1 - cam.y);
          const steps = 4;
          for (let s = 1; s < steps; s++) {
            const tx = x1 + (x2 - x1) * s / steps + (rand() - 0.5) * 18;
            const ty = y1 + (y2 - y1) * s / steps + (rand() - 0.5) * 18;
            ctx.lineTo(tx - cam.x, ty - cam.y);
          }
          ctx.lineTo(x2 - cam.x, y2 - cam.y); ctx.stroke();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        }
        ctx.restore(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
      }
    }
    // Projectiles
    for (const pr of w.projectiles) {
      const x = pr.x - cam.x, y = pr.y - cam.y;
      const pang = Math.atan2(pr.vy, pr.vx);
      ctx.save();
      ctx.translate(x, y);
      ctx.shadowColor = pr.color || '#fff'; ctx.shadowBlur = 10;
      ctx.fillStyle = pr.color || '#fff'; ctx.strokeStyle = pr.color || '#fff';
      switch (pr.proj) {
        case 'arrow': case 'magic_arrow': case 'bolt': case 'ballista_bolt': {
          ctx.rotate(pang); const len = pr.big ? 24 : 14;
          ctx.lineWidth = pr.big ? 4 : 2.5; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2, 0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(len / 2, 0); ctx.lineTo(len / 2 - 6, -4); ctx.lineTo(len / 2 - 6, 4); ctx.closePath(); ctx.fill();
          if (pr.proj === 'magic_arrow') { ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill(); }
          break; }
        case 'knife': case 'dart': case 'trident': {
          ctx.rotate(pang); ctx.lineWidth = pr.big ? 4 : 2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(pr.big ? 16 : 10, 0); ctx.stroke();
          if (pr.proj === 'trident') { ctx.beginPath(); ctx.moveTo(10, -5); ctx.lineTo(17, 0); ctx.lineTo(10, 5); ctx.stroke(); }
          break; }
        case 'shuriken': {
          ctx.rotate(pr.spin || 0); ctx.beginPath();
          for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8); ctx.lineTo(Math.cos(a + 0.4) * 3, Math.sin(a + 0.4) * 3); }
          ctx.closePath(); ctx.fill(); break; }
        case 'chakram': {
          ctx.rotate(pr.spin || 0); ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.stroke(); break; }
        case 'boomerang': {
          ctx.rotate(pr.spin || 0); ctx.lineWidth = 4; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(-9, -2); ctx.quadraticCurveTo(0, -10, 9, -2); ctx.stroke(); break; }
        case 'boulder': { ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); break; }
        case 'pellet': { ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill(); break; }
        case 'stone': { ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill(); break; }
        default: {
          if (pr.spell || pr.big) {
            // Glowing orb with a soft trailing comet for affinity spells
            ctx.shadowBlur = 18;
            if (pr.trail) {
              ctx.globalAlpha = 0.35;
              ctx.beginPath(); ctx.ellipse(-8, 0, 14, 5, pang, 0, Math.PI * 2); ctx.rotate(pang); ctx.fill(); ctx.rotate(-pang);
              ctx.globalAlpha = 1;
            }
            ctx.beginPath(); ctx.arc(0, 0, pr.big ? 9 : 6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(0, 0, pr.big ? 4 : 2.5, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.beginPath(); ctx.arc(0, 0, pr.big ? 11 : 5, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      ctx.restore();
      ctx.shadowBlur = 0; ctx.lineWidth = 1;
    }
    // NPCs
    for (const n of w.npcs) drawNpc(ctx, n.x - cam.x, n.y - cam.y, n, w.timeOfDay);
    // Player
    if (charRef.current) drawPlayer(ctx, p.x - cam.x, p.y - cam.y, charRef.current, p);
    // Floats
    for (const f of w.floats) {
      ctx.fillStyle = f.color || '#fff';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      ctx.font = 'bold 14px sans-serif';
      ctx.globalAlpha = clamp(f.life, 0, 1);
      ctx.strokeText(f.text, f.x - cam.x, f.y - cam.y);
      ctx.fillText(f.text, f.x - cam.x, f.y - cam.y);
      ctx.globalAlpha = 1;
    }
    // Blind overlay
    if (p.blind > 0) {
      const grad = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, Math.max(W, H));
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.4, 'rgba(0,0,0,0.85)');
      grad.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    }
    // Interact prompt
    if (w.interactPrompt) {
      ctx.font = '14px sans-serif';
      const tw = ctx.measureText(w.interactPrompt).width + 24;
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(W / 2 - tw / 2, H - 110, tw, 32);
      ctx.strokeStyle = '#b794f4'; ctx.lineWidth = 2;
      ctx.strokeRect(W / 2 - tw / 2, H - 110, tw, 32);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(w.interactPrompt, W / 2, H - 90);
      ctx.textAlign = 'left';
    }
  }

  function drawStartingField(ctx, W, H, cam) {
    const z = ZONES.starting;
    ctx.fillStyle = '#5fae45';
    ctx.fillRect(-cam.x, -cam.y, z.w, z.h);
    const flowerSpots = [[150,200],[250,600],[500,150],[550,600],[800,250],[850,550],[1000,200],[1100,600],[1300,300]];
    flowerSpots.forEach(([fx, fy], i) => {
      const colors = ['#f9d5e5','#fffacd','#e0bbe4','#ffeb3b','#ff7043'];
      ctx.fillStyle = '#3b6f2c'; ctx.fillRect(fx - cam.x, fy - cam.y, 2, 8);
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      for (let j = 0; j < 5; j++) {
        const a = (j / 5) * Math.PI * 2;
        ctx.arc(fx - cam.x + Math.cos(a) * 3, fy - cam.y + Math.sin(a) * 3, 3, 0, Math.PI * 2);
      }
      ctx.fill();
    });
    for (let tx = 80; tx < 1500; tx += 120) { drawTree(ctx, tx - cam.x, 80 - cam.y); drawTree(ctx, tx - cam.x, 800 - cam.y); }
    ctx.fillStyle = '#3b6f2c';
    z.walls.forEach(wl => ctx.fillRect(wl.x - cam.x, wl.y - cam.y, wl.w, wl.h));
    ctx.fillStyle = '#8d6e63';
    for (let x = 100; x < 1500; x += 30) ctx.fillRect(x - cam.x, 430 - cam.y, 24, 40);
    drawSign(ctx, 1520 - cam.x, 410 - cam.y, '→ HUB');
  }

  function drawHub(ctx, W, H, cam) {
    const z = ZONES.hub;
    const t = performance.now() / 1000;
    // Grassy ground base
    ctx.fillStyle = '#1d2b1a';
    ctx.fillRect(-cam.x, -cam.y, z.w, z.h);
    // subtle grass texture
    for (let y = 0; y < z.h; y += 80) {
      for (let x = 0; x < z.w; x += 80) {
        const sx = x - cam.x, sy = y - cam.y;
        if (sx < -80 || sy < -80 || sx > W || sy > H) continue;
        ctx.fillStyle = ((x + y) / 80) % 2 < 1 ? '#21311d' : '#1b2818';
        ctx.fillRect(sx, sy, 80, 80);
      }
    }
    // Stone paths
    for (const pa of z.paths) {
      if (pa.h === 0 || pa.w === 0) continue;
      drawPath(ctx, pa.x - cam.x, pa.y - cam.y, pa.w, pa.h);
    }
    // Plaza ring under the fountain
    const fx = z.fountain.x - cam.x, fy = z.fountain.y - cam.y;
    ctx.fillStyle = '#6b6358';
    ctx.beginPath(); ctx.arc(fx, fy, z.fountain.r + 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7d7468';
    ctx.beginPath(); ctx.arc(fx, fy, z.fountain.r + 20, 0, Math.PI * 2); ctx.fill();
    drawFountain(ctx, fx, fy, z.fountain.r, t);
    // Gates
    for (const g of z.gates) drawGate(ctx, g.x - cam.x, g.y - cam.y, g, t);
    // Decorations
    for (const d of z.decor) drawDecor(ctx, d.kind, d.x - cam.x, d.y - cam.y, t);
    // Walls
    ctx.fillStyle = '#2a2a30';
    z.walls.forEach(wl => ctx.fillRect(wl.x - cam.x, wl.y - cam.y, wl.w, wl.h));
    // West exit to field
    drawSign(ctx, 6 - cam.x, 620 - cam.y, '← Field');
    ctx.fillStyle = '#3e5d2e';
    for (let yy = 650; yy < 730; yy += 26) ctx.fillRect(-10 - cam.x, yy - cam.y, 18, 18);
  }

  function drawInterior(ctx, W, H, cam) {
    const w = world.current;
    const intr = INTERIORS[w.zone];
    const t = performance.now() / 1000;
    // Floor
    ctx.fillStyle = intr.floor;
    ctx.fillRect(-cam.x, -cam.y, intr.w, intr.h);
    // Floor tiling
    for (let y = 0; y < intr.h; y += 48) {
      for (let x = 0; x < intr.w; x += 48) {
        ctx.fillStyle = ((x + y) / 48) % 2 < 1 ? shadeColor(intr.floor, 0.06) : shadeColor(intr.floor, -0.06);
        ctx.fillRect(x - cam.x, y - cam.y, 48, 48);
      }
    }
    // Walls (thick border)
    ctx.fillStyle = intr.wall;
    ctx.fillRect(-cam.x, -cam.y, intr.w, 24);
    ctx.fillRect(-cam.x, intr.h - 14 - cam.y, intr.w, 14);
    ctx.fillRect(-cam.x, -cam.y, 24, intr.h);
    ctx.fillRect(intr.w - 24 - cam.x, -cam.y, 24, intr.h);
    // Accent trim along the top wall
    ctx.fillStyle = intr.accent;
    ctx.fillRect(-cam.x, 22 - cam.y, intr.w, 3);
    // Decor
    for (const d of intr.decor) drawDecor(ctx, d.kind, d.x - cam.x, d.y - cam.y, t, intr.accent);
    // Focus interaction object (glowing)
    const f = intr.focus;
    drawFocus(ctx, f.x - cam.x, f.y - cam.y, f.kind, intr.accent, t);
    // Exit pad at bottom-center
    const exX = intr.w / 2 - cam.x, exY = intr.h - 18 - cam.y;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(exX - 55, exY - 12, 110, 22);
    ctx.strokeStyle = intr.accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.6 + Math.sin(t * 3) * 0.2;
    ctx.strokeRect(exX - 55, exY - 12, 110, 22);
    ctx.restore();
    ctx.fillStyle = '#cfe8ff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('↓ EXIT', exX, exY + 3); ctx.textAlign = 'left';
    // Room name
    ctx.fillStyle = intr.accent; ctx.font = 'bold 16px serif'; ctx.textAlign = 'center';
    ctx.fillText(intr.name, intr.w / 2 - cam.x, 52 - cam.y); ctx.textAlign = 'left';
  }

  function drawPath(ctx, x, y, w, h) {
    ctx.fillStyle = '#574e44'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#6b6054';
    const step = 28;
    if (w > h) { for (let i = x + 4; i < x + w; i += step) { ctx.fillRect(i, y + 4, step - 8, h - 8); } }
    else { for (let i = y + 4; i < y + h; i += step) { ctx.fillRect(x + 4, i, w - 8, step - 8); } }
  }

  function drawFountain(ctx, x, y, r, t) {
    ctx.fillStyle = '#8a8076';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a6ea5';
    ctx.beginPath(); ctx.arc(x, y, r - 14, 0, Math.PI * 2); ctx.fill();
    // water shimmer
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 5; i++) { const a = t * 0.6 + i * 1.25; ctx.beginPath(); ctx.arc(x + Math.cos(a) * (r - 30), y + Math.sin(a) * (r - 30), 5, 0, Math.PI * 2); ctx.fill(); }
    // central pillar
    ctx.fillStyle = '#9a9088'; ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
    // spout droplets
    ctx.fillStyle = '#bfe3ff';
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const rr = 18 + (Math.sin(t * 4 + i) + 1) * 10; ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 2.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#cfeaff'; ctx.beginPath(); ctx.arc(x, y - 4, 5, 0, Math.PI * 2); ctx.fill();
  }

  function drawGate(ctx, x, y, g, t) {
    // Phase seed must come from the gate's WORLD position (g.x), not screen x —
    // otherwise the glow re-seeds every frame as the camera scrolls (flicker).
    const seed = (g.x || 0) * 0.01;
    const glow = 0.55 + Math.sin(t * 2.5 + seed) * 0.25;
    // approach pad
    ctx.fillStyle = '#4a4038'; ctx.fillRect(x - 34, y + 8, 68, 30);
    // arch pillars
    ctx.fillStyle = shadeColor(g.color, -0.4);
    ctx.fillRect(x - 30, y - 44, 12, 60);
    ctx.fillRect(x + 18, y - 44, 12, 60);
    // arch top
    ctx.fillStyle = g.color;
    ctx.beginPath(); ctx.moveTo(x - 30, y - 40); ctx.quadraticCurveTo(x, y - 70, x + 30, y - 40); ctx.lineTo(x + 30, y - 30); ctx.quadraticCurveTo(x, y - 56, x - 30, y - 30); ctx.closePath(); ctx.fill();
    // arch-specific flair
    if (g.arch === 'cloth') { ctx.fillStyle = shadeColor(g.color, 0.3); ctx.fillRect(x - 26, y - 40, 52, 8); }
    else if (g.arch === 'forge') { ctx.fillStyle = '#ff7043'; for (let i = 0; i < 3; i++) ctx.fillRect(x - 16 + i * 14, y - 36, 6, 6); }
    else if (g.arch === 'rune') { ctx.fillStyle = '#e1bee7'; ctx.beginPath(); ctx.arc(x, y - 40, 5, 0, Math.PI * 2); ctx.fill(); }
    else if (g.arch === 'iron') { ctx.fillStyle = '#b0bec5'; ctx.fillRect(x - 4, y - 52, 8, 12); }
    // portal shimmer between pillars
    ctx.save();
    ctx.globalAlpha = glow * 0.5;
    const grad = ctx.createLinearGradient(x, y - 40, x, y + 12);
    grad.addColorStop(0, g.color); grad.addColorStop(1, shadeColor(g.color, 0.5));
    ctx.fillStyle = grad;
    ctx.fillRect(x - 18, y - 36, 36, 48);
    ctx.restore();
    // glowing sparkles
    ctx.save(); ctx.globalAlpha = glow; ctx.fillStyle = '#fff';
    for (let i = 0; i < 3; i++) { const yy = y - 30 + ((t * 30 + i * 18) % 44); ctx.beginPath(); ctx.arc(x - 8 + (i * 8), y + 8 - (yy - y), 1.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    // label banner
    ctx.fillStyle = shadeColor(g.color, -0.5); ctx.fillRect(x - 38, y - 66, 76, 16);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px serif'; ctx.textAlign = 'center';
    ctx.fillText(g.label, x, y - 54); ctx.textAlign = 'left';
  }

  function drawDecor(ctx, kind, x, y, t, accent) {
    switch (kind) {
      case 'tree': drawTree(ctx, x, y); break;
      case 'lamp':
        ctx.fillStyle = '#2e2a26'; ctx.fillRect(x - 2, y - 30, 4, 30);
        ctx.fillStyle = '#ffd54f'; ctx.shadowColor = '#ffca28'; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(x, y - 34, 6, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        break;
      case 'flowerbed':
        ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x - 22, y - 10, 44, 20);
        for (let i = 0; i < 6; i++) { ctx.fillStyle = ['#e91e63','#ffeb3b','#9c27b0','#ff5722'][i % 4]; ctx.beginPath(); ctx.arc(x - 16 + i * 7, y - 2 + (i % 2) * 6, 3, 0, Math.PI * 2); ctx.fill(); }
        break;
      case 'statue':
        ctx.fillStyle = '#8d8d96'; ctx.fillRect(x - 16, y + 6, 32, 12);
        ctx.fillStyle = '#a8a8b2'; ctx.fillRect(x - 8, y - 30, 16, 36);
        ctx.beginPath(); ctx.arc(x, y - 34, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#bdbdc7'; ctx.fillRect(x + 6, y - 40, 4, 26); // raised sword
        break;
      case 'crates':
        ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 14, y - 14, 16, 16); ctx.fillRect(x + 2, y - 10, 14, 14);
        ctx.strokeStyle = '#4e3420'; ctx.strokeRect(x - 14, y - 14, 16, 16); ctx.strokeRect(x + 2, y - 10, 14, 14);
        break;
      case 'barrel':
        ctx.fillStyle = '#6d4c2f'; ctx.beginPath(); ctx.ellipse(x, y - 6, 9, 13, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3e2a18'; ctx.beginPath(); ctx.moveTo(x - 9, y - 6); ctx.lineTo(x + 9, y - 6); ctx.stroke();
        break;
      case 'banner':
        ctx.fillStyle = '#7b1fa2'; ctx.fillRect(x - 6, y - 40, 12, 40);
        ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x, y + 8); ctx.lineTo(x + 6, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ce93d8'; ctx.fillRect(x - 3, y - 36, 6, 6);
        break;
      case 'stall':
        ctx.fillStyle = '#6d4c2f'; ctx.fillRect(x - 30, y, 60, 8);
        ctx.fillStyle = '#c0392b'; ctx.fillRect(x - 34, y - 28, 68, 14);
        for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? '#c0392b' : '#ecf0f1'; ctx.fillRect(x - 34 + i * 14, y - 14, 14, 8); }
        ctx.fillStyle = '#5d4037'; ctx.fillRect(x - 30, y + 8, 4, 16); ctx.fillRect(x + 26, y + 8, 4, 16);
        break;
      case 'rug':
        ctx.fillStyle = accent || '#7b3ff2'; ctx.globalAlpha = 0.4; ctx.fillRect(x - 40, y - 24, 80, 48); ctx.globalAlpha = 1;
        ctx.strokeStyle = accent || '#fff'; ctx.strokeRect(x - 40, y - 24, 80, 48);
        break;
      case 'furnace':
        ctx.fillStyle = '#3e2723'; ctx.fillRect(x - 24, y - 30, 48, 50);
        ctx.fillStyle = '#ff5722'; ctx.shadowColor = '#ff9800'; ctx.shadowBlur = 24;
        ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(x, y + 2, 6, 0, Math.PI * 2); ctx.fill();
        break;
      case 'anvil_deco':
        ctx.fillStyle = '#37474f'; ctx.fillRect(x - 14, y - 4, 28, 10); ctx.fillRect(x - 6, y + 6, 12, 10);
        ctx.fillStyle = '#546e7a'; ctx.fillRect(x - 18, y - 8, 24, 6);
        break;
      case 'weaponrack':
        ctx.fillStyle = '#5d4037'; ctx.fillRect(x - 20, y - 30, 40, 6); ctx.fillRect(x - 20, y + 20, 40, 6);
        ctx.strokeStyle = '#cfd8dc'; ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - 14 + i * 14, y - 26); ctx.lineTo(x - 14 + i * 14, y + 22); ctx.stroke(); }
        ctx.lineWidth = 1;
        break;
      case 'pillar':
        ctx.fillStyle = '#4a4a55'; ctx.fillRect(x - 12, y - 40, 24, 60);
        ctx.fillStyle = '#5c5c68'; ctx.fillRect(x - 16, y - 44, 32, 8); ctx.fillRect(x - 16, y + 16, 32, 8);
        break;
      case 'runeglow':
        ctx.save(); ctx.globalAlpha = 0.4 + Math.sin(t * 2) * 0.2; ctx.strokeStyle = accent || '#8e44ad'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); ctx.lineWidth = 1;
        break;
      case 'candles':
        for (let i = -1; i <= 1; i++) { ctx.fillStyle = '#ecf0f1'; ctx.fillRect(x + i * 8 - 1, y - 8, 3, 10); ctx.fillStyle = '#ffca28'; ctx.shadowColor = '#ffd54f'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(x + i * 8, y - 10, 2, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
        break;
      case 'bones':
        ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y - 6); ctx.stroke();
        ctx.beginPath(); ctx.arc(x - 12, y + 2, 4, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
        break;
      case 'torch': drawTorch(ctx, x, y, t); break;
      case 'crystalball':
        ctx.fillStyle = '#5d4037'; ctx.fillRect(x - 8, y + 6, 16, 8);
        ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = accent || '#16a085'; ctx.shadowColor = accent || '#16a085'; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.arc(x, y - 4, 12, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        break;
      case 'fireplace':
        ctx.fillStyle = '#37312b'; ctx.fillRect(x - 28, y - 24, 56, 40);
        ctx.fillStyle = '#ff7043'; ctx.shadowColor = '#ff9800'; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.moveTo(x - 12, y + 12); ctx.quadraticCurveTo(x, y - 16 + Math.sin(t * 6) * 4, x + 12, y + 12); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
        break;
      case 'bookshelf':
        ctx.fillStyle = '#4e342e'; ctx.fillRect(x - 18, y - 30, 36, 60);
        for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) { ctx.fillStyle = ['#c0392b','#2980b9','#27ae60','#f39c12','#8e44ad'][(i + r) % 5]; ctx.fillRect(x - 16 + i * 6, y - 28 + r * 20, 5, 16); }
        break;
      default: break;
    }
  }

  function drawFocus(ctx, x, y, kind, accent, t) {
    const glow = 0.6 + Math.sin(t * 2.5) * 0.3;
    // glowing base ring
    ctx.save(); ctx.globalAlpha = glow * 0.5; ctx.fillStyle = accent;
    ctx.beginPath(); ctx.ellipse(x, y + 14, 30, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    switch (kind) {
      case 'merchant': case 'desk':
        ctx.fillStyle = '#6d4c2f'; ctx.fillRect(x - 26, y - 6, 52, 18);
        ctx.fillStyle = '#8d6e3f'; ctx.fillRect(x - 26, y - 10, 52, 5);
        break;
      case 'anvil':
        ctx.fillStyle = '#37474f'; ctx.fillRect(x - 18, y - 6, 36, 12); ctx.fillRect(x - 8, y + 6, 16, 12);
        ctx.fillStyle = '#546e7a'; ctx.fillRect(x - 24, y - 12, 30, 8);
        break;
      case 'altar': case 'banner_post':
        ctx.fillStyle = '#5c5c68'; ctx.fillRect(x - 16, y - 8, 32, 22);
        ctx.fillStyle = accent; ctx.save(); ctx.globalAlpha = glow;
        ctx.beginPath(); ctx.arc(x, y - 14, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        break;
      case 'portal':
        ctx.save(); ctx.globalAlpha = glow; ctx.strokeStyle = accent; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(x, y - 6, 18, 26, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = glow * 0.4; ctx.fillStyle = accent;
        ctx.beginPath(); ctx.ellipse(x, y - 6, 14, 22, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); ctx.lineWidth = 1;
        break;
      case 'crystalball':
        ctx.fillStyle = '#4e342e'; ctx.fillRect(x - 10, y + 4, 20, 10);
        ctx.save(); ctx.globalAlpha = glow; ctx.fillStyle = accent; ctx.shadowColor = accent; ctx.shadowBlur = 22;
        ctx.beginPath(); ctx.arc(x, y - 6, 14, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        break;
      default:
        ctx.fillStyle = accent; ctx.save(); ctx.globalAlpha = glow;
        ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    // upward sparkle
    ctx.save(); ctx.globalAlpha = glow; ctx.fillStyle = '#fff';
    const sy = y - 20 - ((t * 24) % 16);
    ctx.beginPath(); ctx.arc(x, sy, 1.6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  function drawDungeon(ctx, W, H, cam) {
    const w = world.current; const m = w.maze;
    const th = m.theme || themeForFloor(w.floor);
    const wallColor = th.wall, floorColor = th.floor, accentColor = th.accent;
    const fogged = m.fogOfWar && m.revealed;
    for (let y = 0; y < m.H; y++) {
      for (let x = 0; x < m.W; x++) {
        const px = x * 40 - cam.x, py = y * 40 - cam.y;
        if (px < -40 || py < -40 || px > W || py > H) continue;
        // Fog of war: tiles not yet revealed render as solid black
        if (fogged && !m.revealed.has(`${x},${y}`)) {
          ctx.fillStyle = '#000';
          ctx.fillRect(px, py, 40, 40);
          continue;
        }
        const tile = m.grid[y][x];
        switch (tile) {
          case 1: // wall
            ctx.fillStyle = wallColor;
            ctx.fillRect(px, py, 40, 40);
            ctx.fillStyle = accentColor;
            ctx.fillRect(px, py, 40, 2);
            ctx.fillRect(px, py + 20, 40, 2);
            ctx.fillRect(px + 19, py, 2, 20);
            ctx.fillRect(px + 9, py + 20, 2, 20);
            ctx.fillRect(px + 29, py + 20, 2, 20);
            break;
          case 2: // water
            ctx.fillStyle = '#1565c0'; ctx.fillRect(px, py, 40, 40);
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(px + 2 + (Math.sin(w.timeOfDay * 2 + x) * 2), py + 10, 8, 2);
            ctx.fillRect(px + 22 + (Math.sin(w.timeOfDay * 2.4 + y) * 2), py + 25, 10, 2);
            break;
          case 3: // lava
            ctx.fillStyle = '#5d1f08'; ctx.fillRect(px, py, 40, 40);
            ctx.fillStyle = '#ff5722';
            ctx.globalAlpha = 0.55 + 0.25 * Math.sin(w.timeOfDay * 3 + x + y);
            ctx.fillRect(px + 4, py + 4, 32, 32);
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#ffd54f'; ctx.fillRect(px + 8, py + 8, 8, 4);
            break;
          case 4: // grass
            ctx.fillStyle = '#3a6b2c'; ctx.fillRect(px, py, 40, 40);
            ctx.fillStyle = '#4f8c3a';
            ctx.fillRect(px + 6, py + 4, 2, 5);
            ctx.fillRect(px + 22, py + 14, 2, 5);
            ctx.fillRect(px + 14, py + 28, 2, 5);
            break;
          case 5: // bridge
            ctx.fillStyle = '#8d6e63'; ctx.fillRect(px, py, 40, 40);
            ctx.fillStyle = '#6d4c41';
            ctx.fillRect(px, py, 40, 4);
            ctx.fillRect(px, py + 18, 40, 4);
            ctx.fillRect(px, py + 36, 40, 4);
            break;
          case 6: // sand
            ctx.fillStyle = '#d7c79a'; ctx.fillRect(px, py, 40, 40); break;
          case 7: // stone tile
            ctx.fillStyle = '#8d8d99'; ctx.fillRect(px, py, 40, 40);
            ctx.strokeStyle = '#5d5d66'; ctx.strokeRect(px, py, 40, 40); break;
          case 8: // cracked floor (a hint of trap)
            ctx.fillStyle = floorColor; ctx.fillRect(px, py, 40, 40);
            ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px + 5, py + 10); ctx.lineTo(px + 20, py + 22); ctx.lineTo(px + 35, py + 15);
            ctx.moveTo(px + 12, py + 30); ctx.lineTo(px + 28, py + 32);
            ctx.stroke(); ctx.lineWidth = 1;
            break;
          case 9: // door
            ctx.fillStyle = floorColor; ctx.fillRect(px, py, 40, 40);
            ctx.fillStyle = '#6d4c41';
            ctx.fillRect(px + 6, py + 4, 28, 36);
            ctx.fillStyle = '#fbc02d';
            ctx.beginPath(); ctx.arc(px + 28, py + 22, 2, 0, Math.PI * 2); ctx.fill();
            break;
          case 10: // grave marker (acts as wall)
            ctx.fillStyle = floorColor; ctx.fillRect(px, py, 40, 40);
            ctx.fillStyle = '#5d5d66';
            ctx.fillRect(px + 10, py + 14, 20, 22);
            ctx.beginPath();
            ctx.moveTo(px + 10, py + 14); ctx.lineTo(px + 20, py + 6); ctx.lineTo(px + 30, py + 14);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#222';
            ctx.fillRect(px + 18, py + 20, 4, 10); ctx.fillRect(px + 14, py + 24, 12, 4);
            break;
          default: // 0 floor
            ctx.fillStyle = floorColor; ctx.fillRect(px, py, 40, 40);
        }
      }
    }
    // Decorations
    for (const d of m.decorations || []) {
      if (fogged && !m.revealed.has(`${d.x},${d.y}`)) continue;
      if (d.type === 'torch') drawTorch(ctx, d.x * 40 + 20 - cam.x, d.y * 40 + 36 - cam.y, w.timeOfDay);
    }
    // Hazards
    for (const h of m.hazards || []) {
      if (h.hidden) continue;
      if (fogged && !m.revealed.has(`${h.x},${h.y}`)) continue;
      const hx = h.x * 40 + 20 - cam.x, hy = h.y * 40 + 20 - cam.y;
      if (h.kind === 'spike') {
        ctx.fillStyle = '#616161';
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          ctx.moveTo(hx - 14 + i * 8, hy + 8);
          ctx.lineTo(hx - 10 + i * 8, hy - 8);
          ctx.lineTo(hx - 6 + i * 8, hy + 8);
        }
        ctx.fill();
      } else if (h.kind === 'arrow') {
        ctx.fillStyle = '#8d6e63'; ctx.fillRect(hx - 8, hy - 8, 16, 16);
        ctx.fillStyle = '#212121';
        ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2); ctx.fill();
      } else if (h.kind === 'firevent') {
        ctx.fillStyle = '#424242';
        ctx.beginPath(); ctx.arc(hx, hy, 10, 0, Math.PI * 2); ctx.fill();
        if (h.burst > 0) {
          ctx.fillStyle = '#ff7043'; ctx.globalAlpha = 0.7;
          ctx.beginPath(); ctx.arc(hx, hy, 22 + Math.sin(w.timeOfDay * 12) * 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffd54f';
          ctx.beginPath(); ctx.arc(hx, hy, 10, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else if (h.kind === 'lightning') {
        if (h.telegraph > 0) {
          ctx.strokeStyle = '#fff176'; ctx.lineWidth = 2;
          ctx.globalAlpha = 0.4 + Math.sin(w.timeOfDay * 16) * 0.3;
          ctx.beginPath(); ctx.arc(hx, hy, 28, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1; ctx.lineWidth = 1;
        } else if (h.strikeFlash > 0) {
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(hx, hy - 200); ctx.lineTo(hx - 4, hy - 100);
          ctx.lineTo(hx + 6, hy - 50); ctx.lineTo(hx, hy);
          ctx.stroke(); ctx.lineWidth = 1;
          ctx.fillStyle = '#fff176'; ctx.globalAlpha = 0.7;
          ctx.beginPath(); ctx.arc(hx, hy, 30, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else if (h.kind === 'healflower') {
        ctx.fillStyle = '#3b6f2c'; ctx.fillRect(hx - 1, hy, 2, 8);
        ctx.fillStyle = '#69f0ae';
        ctx.beginPath();
        for (let j = 0; j < 5; j++) {
          const a = (j / 5) * Math.PI * 2;
          ctx.arc(hx + Math.cos(a) * 3, hy - 3 + Math.sin(a) * 3, 3, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.fillStyle = '#fff59d';
        ctx.beginPath(); ctx.arc(hx, hy - 3, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    // (Removed boss-room red highlight box per player request.)
    // Chests
    for (const ch of m.chests || []) {
      if (ch.opened) continue;
      if (fogged && !m.revealed.has(`${ch.x},${ch.y}`)) continue;
      drawChest(ctx, ch.x * 40 + 20 - cam.x, ch.y * 40 + 25 - cam.y);
    }
    // Collectable loot orbs
    for (const orb of m.loot || []) {
      if (orb.taken) continue;
      if (fogged && !m.revealed.has(`${orb.x},${orb.y}`)) continue;
      const ox = orb.x * 40 + 20 - cam.x, oy = orb.y * 40 + 20 - cam.y;
      const pulse = 1 + Math.sin(performance.now() / 220 + orb.x) * 0.18;
      const col = orb.kind === 'weapon' ? '#ff7043' : (orb.kind === 'coins' ? '#ffd54f' : '#69f0ae');
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = 14;
      ctx.globalAlpha = 0.9; ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(ox, oy - 2, 6 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(ox, oy - 2, 11 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // Monsters
    for (const mon of m.monsters) {
      if (mon.hp <= 0) continue;
      const mtx = Math.floor(mon.x), mty = Math.floor(mon.y);
      if (fogged && !m.revealed.has(`${mtx},${mty}`)) continue;
      drawMonster(ctx, mon.x * 40 + 20 - cam.x, mon.y * 40 + 20 - cam.y, mon);
    }
    // Boss
    if (!m.boss.defeated && m.bossHp != null) {
      const btx = Math.floor(m.bossPx / 40), bty = Math.floor(m.bossPy / 40);
      if (!fogged || m.revealed.has(`${btx},${bty}`)) {
        drawBoss(ctx, m.bossPx - cam.x, m.bossPy - cam.y, m, w.timeOfDay);
      }
    }
  }

  function drawTree(ctx, x, y) {
    ctx.fillStyle = '#5d4037'; ctx.fillRect(x - 5, y - 5, 10, 25);
    ctx.fillStyle = '#2e7d32';
    ctx.beginPath(); ctx.arc(x, y - 15, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#388e3c';
    ctx.beginPath();
    ctx.arc(x - 8, y - 20, 12, 0, Math.PI * 2);
    ctx.arc(x + 8, y - 18, 12, 0, Math.PI * 2);
    ctx.arc(x, y - 25, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawSign(ctx, x, y, text) {
    ctx.fillStyle = '#6d4c41'; ctx.fillRect(x + 12, y + 30, 4, 30);
    ctx.fillStyle = '#a07050'; ctx.fillRect(x, y, 30, 30);
    ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 2; ctx.strokeRect(x, y, 30, 30);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(text, x + 15, y + 18); ctx.textAlign = 'left'; ctx.lineWidth = 1;
  }
  function drawBuilding(ctx, x, y, w, h, color, label) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x + 6, y + 6, w, h);
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#3e2723';
    ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x + w / 2, y - 30); ctx.lineTo(x + w + 10, y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1b1b1b'; ctx.stroke();
    ctx.fillStyle = '#5d4037';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w / 2, y - 22); ctx.lineTo(x + w, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3e2723'; ctx.fillRect(x + w / 2 - 15, y + h - 45, 30, 45);
    ctx.fillStyle = '#fbc02d';
    ctx.beginPath(); ctx.arc(x + w / 2 + 8, y + h - 22, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff59d';
    ctx.fillRect(x + 20, y + 30, 22, 22); ctx.fillRect(x + w - 42, y + 30, 22, 22);
    ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 2;
    ctx.strokeRect(x + 20, y + 30, 22, 22); ctx.strokeRect(x + w - 42, y + 30, 22, 22);
    ctx.beginPath();
    ctx.moveTo(x + 31, y + 30); ctx.lineTo(x + 31, y + 52);
    ctx.moveTo(x + 20, y + 41); ctx.lineTo(x + 42, y + 41);
    ctx.moveTo(x + w - 31, y + 30); ctx.lineTo(x + w - 31, y + 52);
    ctx.moveTo(x + w - 42, y + 41); ctx.lineTo(x + w - 20, y + 41);
    ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = '#fbc02d'; ctx.fillRect(x + w / 2 - 50, y + 70, 100, 20);
    ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 2; ctx.strokeRect(x + w / 2 - 50, y + 70, 100, 20);
    ctx.fillStyle = '#3e2723'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + 84); ctx.textAlign = 'left'; ctx.lineWidth = 1;
  }
  function drawLantern(ctx, x, y) {
    ctx.fillStyle = '#3e2723'; ctx.fillRect(x - 2, y, 4, 30);
    ctx.fillStyle = '#ffc107'; ctx.shadowColor = '#ffd54f'; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(x, y - 6, 7, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  function drawTorch(ctx, x, y, t) {
    ctx.fillStyle = '#5d4037'; ctx.fillRect(x - 2, y - 10, 4, 14);
    const flicker = Math.sin(t * 8) * 2;
    ctx.fillStyle = '#ff6f00'; ctx.shadowColor = '#ffab00'; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.ellipse(x, y - 18 + flicker, 5, 8 + flicker, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath(); ctx.ellipse(x, y - 18 + flicker, 3, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  function drawChest(ctx, x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y + 10, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6d4c41'; ctx.fillRect(x - 14, y - 6, 28, 18);
    ctx.fillStyle = '#a07050'; ctx.fillRect(x - 14, y - 12, 28, 8);
    ctx.fillStyle = '#fbc02d'; ctx.fillRect(x - 2, y - 4, 4, 8);
  }
  function drawNpc(ctx, x, y, n, t) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y + 22, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    const bob = Math.sin(t * 3) * 3;
    ctx.fillStyle = '#fbc02d'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeText('!', x, y - 36 + bob);
    ctx.fillText('!', x, y - 36 + bob);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#3b2316'; ctx.fillRect(x - 7, y + 8, 6, 14); ctx.fillRect(x + 1, y + 8, 6, 14);
    ctx.fillStyle = n.color; ctx.fillRect(x - 11, y - 4, 22, 16);
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 11, y + 9, 22, 2);
    ctx.fillStyle = '#f4c2a1'; ctx.fillRect(x - 13, y - 2, 3, 12); ctx.fillRect(x + 10, y - 2, 3, 12);
    ctx.beginPath(); ctx.arc(x, y - 10, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3b2316';
    ctx.beginPath(); ctx.arc(x, y - 13, 10, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x - 3, y - 10, 2, 0, Math.PI * 2); ctx.arc(x + 3, y - 10, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(x - 3, y - 10, 1, 0, Math.PI * 2); ctx.arc(x + 3, y - 10, 1, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1;
  }

  function drawMonster(ctx, x, y, mon) {
    const t = MONSTER_TYPES[mon.type]; if (!t) return;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y + 16, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
    const bob = Math.sin(mon.animTime * 6) * 1.5;
    const shape = t.shape || 'humanoid';
    const c = t.color;
    if (mon.lunge > 0) {
      ctx.strokeStyle = '#ff1744'; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.arc(x, y, 18 + (0.35 - mon.lunge) * 30, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }
    if (shape === 'slime') {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(x, y + 4 + bob, 16, 12 - bob, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 5, y, 2, 0, Math.PI * 2); ctx.arc(x + 5, y, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(x - 5, y, 1, 0, Math.PI * 2); ctx.arc(x + 5, y, 1, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'bat') {
      ctx.fillStyle = c;
      const wing = Math.sin(mon.animTime * 12) * 4;
      ctx.beginPath();
      ctx.moveTo(x - 16, y - wing); ctx.lineTo(x - 8, y - 4); ctx.lineTo(x + 8, y - 4); ctx.lineTo(x + 16, y - wing);
      ctx.lineTo(x + 12, y + 4); ctx.lineTo(x - 12, y + 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(x - 3, y - 2, 1.5, 0, Math.PI * 2); ctx.arc(x + 3, y - 2, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'spider') {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(x, y + 4, 10, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - 4, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) { if (i === 0) continue; const a = (i / 3) * 0.7;
        ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x + Math.cos(a) * 14, y + 4 + Math.sin(a) * 8 + bob); ctx.stroke(); }
      ctx.lineWidth = 1;
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(x - 2, y - 4, 1.5, 0, Math.PI * 2); ctx.arc(x + 2, y - 4, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'wolf') {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(x, y + 4 + bob * 0.4, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 10, y - 2, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 6, y - 8); ctx.lineTo(x + 9, y - 14); ctx.lineTo(x + 11, y - 6);
      ctx.moveTo(x + 13, y - 8); ctx.lineTo(x + 16, y - 14); ctx.lineTo(x + 14, y - 6);
      ctx.fill();
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(x + 11, y - 2, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'serpent') {
      ctx.fillStyle = c;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) { const r = 12 - i * 1.5; ctx.arc(x, y + bob * 0.4, r, 0, Math.PI * 2); }
      ctx.fill();
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(x - 3, y - 2, 1.5, 0, Math.PI * 2); ctx.arc(x + 3, y - 2, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'crab') {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(x, y + 4, 14, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x - 16, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 16, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(x - 3, y, 1.5, 0, Math.PI * 2); ctx.arc(x + 3, y, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'wraith') {
      ctx.fillStyle = c; ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(x - 12, y - 10); ctx.lineTo(x + 12, y - 10); ctx.lineTo(x + 9, y + 10 + bob);
      ctx.lineTo(x, y + 14 + bob); ctx.lineTo(x - 9, y + 10 + bob); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 4, y - 4, 2, 0, Math.PI * 2); ctx.arc(x + 4, y - 4, 2, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'eye') {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'orb') {
      ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 3, y - 3, 3, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'imp') {
      ctx.fillStyle = c;
      ctx.fillRect(x - 7, y + 4, 5, 12 + bob); ctx.fillRect(x + 2, y + 4, 5, 12 - bob);
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 8); ctx.lineTo(x - 4, y - 16); ctx.lineTo(x - 2, y - 8);
      ctx.moveTo(x + 6, y - 8); ctx.lineTo(x + 4, y - 16); ctx.lineTo(x + 2, y - 8);
      ctx.fill();
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(x - 3, y - 2, 1.5, 0, Math.PI * 2); ctx.arc(x + 3, y - 2, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'golem') {
      ctx.fillStyle = c;
      ctx.fillRect(x - 14, y - 8, 28, 24);
      ctx.fillRect(x - 8, y - 18, 16, 12);
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(x - 4, y - 12, 1.5, 0, Math.PI * 2); ctx.arc(x + 4, y - 12, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.strokeRect(x - 14, y - 8, 28, 24); ctx.strokeRect(x - 8, y - 18, 16, 12);
    } else {
      ctx.fillStyle = '#222';
      ctx.fillRect(x - 6, y + 6, 4, 10 + bob); ctx.fillRect(x + 2, y + 6, 4, 10 - bob);
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(x, y + 2, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(x - 4, y, 2, 0, Math.PI * 2); ctx.arc(x + 4, y, 2, 0, Math.PI * 2); ctx.fill();
    }
    if (mon.hp < mon.maxHp) {
      ctx.fillStyle = '#333'; ctx.fillRect(x - 16, y - 24, 32, 5);
      ctx.fillStyle = '#f44336'; ctx.fillRect(x - 16, y - 24, 32 * (mon.hp / mon.maxHp), 5);
      ctx.strokeStyle = '#000'; ctx.strokeRect(x - 16, y - 24, 32, 5);
    }
  }

  // ============================================================
  //                  BOSS SHAPE DRAWINGS
  // ============================================================
  function drawBoss(ctx, x, y, m, t) {
    // Telegraph flash
    const telegraph = m.bossTelegraphTimer > 0;
    const pulse = Math.sin(t * 4) * 3;
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(x, y + 32, 32, 8, 0, 0, Math.PI * 2); ctx.fill();
    // Aura
    ctx.fillStyle = m.bossColor; ctx.globalAlpha = telegraph ? 0.5 : 0.25;
    ctx.beginPath(); ctx.arc(x, y, 44 + pulse, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    const draw = BOSS_SHAPE_DRAWS[m.bossShape] || BOSS_SHAPE_DRAWS.cave_brute;
    draw(ctx, x, y, m, t, pulse);

    // Shielder ring
    if (m.bossShield > 0) {
      ctx.strokeStyle = '#bdbdbd'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, 42 + Math.sin(t * 6) * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
    }
    // Name + HP bar
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeText(m.bossName, x, y - 52);
    ctx.fillText(m.bossName, x, y - 52);
    ctx.fillStyle = '#333'; ctx.fillRect(x - 60, y - 68, 120, 8);
    ctx.fillStyle = '#ff1744'; ctx.fillRect(x - 60, y - 68, 120 * (m.bossHp / m.bossMaxHp), 8);
    ctx.strokeStyle = '#000'; ctx.strokeRect(x - 60, y - 68, 120, 8);
    ctx.textAlign = 'left'; ctx.lineWidth = 1;
  }

  // Each shape is a separate draw routine — each has distinct silhouette.
  const BOSS_SHAPE_DRAWS = {
    slime_king: (ctx, x, y, m, t, pulse) => {
      ctx.fillStyle = m.bossColor;
      ctx.beginPath(); ctx.ellipse(x, y + 4, 30 + pulse, 22 - pulse, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 10, y - 4, 5, 0, Math.PI * 2); ctx.arc(x + 10, y - 4, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(x - 10, y - 4, 2, 0, Math.PI * 2); ctx.arc(x + 10, y - 4, 2, 0, Math.PI * 2); ctx.fill();
      // Crown
      ctx.fillStyle = '#fbc02d';
      ctx.beginPath();
      ctx.moveTo(x - 14, y - 18); ctx.lineTo(x - 8, y - 26); ctx.lineTo(x - 4, y - 18);
      ctx.lineTo(x, y - 26); ctx.lineTo(x + 4, y - 18); ctx.lineTo(x + 8, y - 26);
      ctx.lineTo(x + 14, y - 18); ctx.closePath(); ctx.fill();
    },
    stone_titan: (ctx, x, y, m, t) => {
      ctx.fillStyle = m.bossColor;
      ctx.fillRect(x - 26, y - 12, 52, 36);
      ctx.fillRect(x - 14, y - 32, 28, 22);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.strokeRect(x - 26, y - 12, 52, 36); ctx.strokeRect(x - 14, y - 32, 28, 22);
      ctx.fillStyle = '#ff1744';
      ctx.beginPath(); ctx.arc(x - 6, y - 22, 2, 0, Math.PI * 2); ctx.arc(x + 6, y - 22, 2, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1;
    },
    hollow_queen: (ctx, x, y, m, t, pulse) => {
      ctx.fillStyle = m.bossColor; ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(x - 20, y - 22); ctx.lineTo(x + 20, y - 22);
      ctx.lineTo(x + 26, y + 24 + pulse); ctx.lineTo(x, y + 32 + pulse);
      ctx.lineTo(x - 26, y + 24 + pulse); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      // Crown points
      ctx.fillStyle = '#fbc02d';
      ctx.beginPath();
      ctx.moveTo(x - 18, y - 22); ctx.lineTo(x - 8, y - 34); ctx.lineTo(x, y - 22);
      ctx.lineTo(x + 8, y - 34); ctx.lineTo(x + 18, y - 22); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 6, y - 6, 3, 0, Math.PI * 2); ctx.arc(x + 6, y - 6, 3, 0, Math.PI * 2); ctx.fill();
    },
    glacier_lord: (ctx, x, y, m, t) => {
      ctx.fillStyle = m.bossColor;
      ctx.beginPath();
      ctx.moveTo(x, y - 30); ctx.lineTo(x + 28, y - 5); ctx.lineTo(x + 20, y + 26);
      ctx.lineTo(x - 20, y + 26); ctx.lineTo(x - 28, y - 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.5;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + t * 0.5;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * 18, y + Math.sin(a) * 14, 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#01579b';
      ctx.beginPath(); ctx.arc(x - 6, y - 8, 2, 0, Math.PI * 2); ctx.arc(x + 6, y - 8, 2, 0, Math.PI * 2); ctx.fill();
    },
    world_tree: (ctx, x, y, m, t, pulse) => {
      // Trunk
      ctx.fillStyle = '#5d4037'; ctx.fillRect(x - 10, y - 4, 20, 32);
      // Canopy
      ctx.fillStyle = m.bossColor;
      ctx.beginPath(); ctx.arc(x - 16, y - 12, 16, 0, Math.PI * 2);
      ctx.arc(x + 16, y - 12, 16, 0, Math.PI * 2);
      ctx.arc(x, y - 22, 18 + pulse, 0, Math.PI * 2); ctx.fill();
      // Glowing eyes in the trunk
      ctx.fillStyle = '#fbc02d';
      ctx.beginPath(); ctx.arc(x - 4, y + 6, 2, 0, Math.PI * 2); ctx.arc(x + 4, y + 6, 2, 0, Math.PI * 2); ctx.fill();
    },
    storm_king: (ctx, x, y, m, t, pulse) => {
      ctx.fillStyle = m.bossColor; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(x, y, 26 + pulse, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // Lightning bolts
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + t * 2;
        const sx = x + Math.cos(a) * 14, sy = y + Math.sin(a) * 14;
        const ex = x + Math.cos(a) * 30, ey = y + Math.sin(a) * 30;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      }
      ctx.lineWidth = 1;
      ctx.fillStyle = '#1a237e';
      ctx.beginPath(); ctx.arc(x - 4, y - 4, 3, 0, Math.PI * 2); ctx.arc(x + 4, y - 4, 3, 0, Math.PI * 2); ctx.fill();
    },
    magma_lord: (ctx, x, y, m, t, pulse) => {
      ctx.fillStyle = m.bossColor;
      ctx.beginPath(); ctx.arc(x, y, 28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd54f'; ctx.globalAlpha = 0.6 + Math.sin(t * 4) * 0.2;
      ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // Spikes around
      ctx.fillStyle = m.bossColor;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * 28, y + Math.sin(a) * 28);
        ctx.lineTo(x + Math.cos(a) * 38, y + Math.sin(a) * 38);
        ctx.lineTo(x + Math.cos(a + 0.2) * 28, y + Math.sin(a + 0.2) * 28);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(x - 5, y - 5, 2, 0, Math.PI * 2); ctx.arc(x + 5, y - 5, 2, 0, Math.PI * 2); ctx.fill();
    },
    iron_giant: (ctx, x, y, m, t) => {
      ctx.fillStyle = m.bossColor;
      ctx.fillRect(x - 30, y - 10, 60, 36);
      ctx.fillRect(x - 16, y - 32, 32, 22);
      // Rivets
      ctx.fillStyle = '#5d4037';
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.arc(x + i * 12, y + 2, 2, 0, Math.PI * 2); ctx.fill();
      }
      // Visor
      ctx.fillStyle = '#ff1744';
      ctx.fillRect(x - 12, y - 22, 24, 4);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.strokeRect(x - 30, y - 10, 60, 36); ctx.strokeRect(x - 16, y - 32, 32, 22);
      ctx.lineWidth = 1;
    },
    void_eye: (ctx, x, y, m, t, pulse) => {
      ctx.fillStyle = m.bossColor;
      ctx.beginPath(); ctx.arc(x, y, 34 + pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff1744';
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      // Floating runes
      ctx.fillStyle = m.bossColor;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + t * 0.4;
        const rx = x + Math.cos(a) * 40, ry = y + Math.sin(a) * 40;
        ctx.fillRect(rx - 2, ry - 2, 4, 4);
      }
    },
    krezcent: (ctx, x, y, m, t, pulse) => {
      // Sprawling demon-king look
      ctx.fillStyle = m.bossColor;
      ctx.beginPath(); ctx.arc(x, y, 32, 0, Math.PI * 2); ctx.fill();
      // Crescent horns
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(x - 24, y - 10); ctx.quadraticCurveTo(x - 32, y - 36, x - 12, y - 24); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 24, y - 10); ctx.quadraticCurveTo(x + 32, y - 36, x + 12, y - 24); ctx.closePath(); ctx.fill();
      // Glowing crescent on chest
      ctx.strokeStyle = '#fff176'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y + 6, 12, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.lineWidth = 1;
      // Burning eyes
      ctx.fillStyle = '#fff176'; ctx.shadowColor = '#ff1744'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(x - 8, y - 6, 3, 0, Math.PI * 2); ctx.arc(x + 8, y - 6, 3, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    },
    sprout_avatar: (ctx, x, y, m, t) => {
      ctx.fillStyle = m.bossColor;
      ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
      // Vines extending
      ctx.strokeStyle = '#558b2f'; ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * 22, y + Math.sin(a) * 22);
        ctx.quadraticCurveTo(x + Math.cos(a) * 32 + Math.sin(t * 2 + i) * 5, y + Math.sin(a) * 32, x + Math.cos(a) * 42, y + Math.sin(a) * 42);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      // Flower face
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 5, y - 3, 2, 0, Math.PI * 2); ctx.arc(x + 5, y - 3, 2, 0, Math.PI * 2); ctx.fill();
    },
    cave_brute: (ctx, x, y, m, t) => {
      ctx.fillStyle = m.bossColor;
      ctx.beginPath(); ctx.ellipse(x, y + 4, 28, 22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - 14, 14, 0, Math.PI * 2); ctx.fill();
      // Tusks
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x - 8, y + 6); ctx.lineTo(x - 4, y + 6); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x + 8, y + 6); ctx.lineTo(x + 4, y + 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff1744';
      ctx.beginPath(); ctx.arc(x - 5, y - 16, 2, 0, Math.PI * 2); ctx.arc(x + 5, y - 16, 2, 0, Math.PI * 2); ctx.fill();
    },
    spider_matron: (ctx, x, y, m, t) => {
      ctx.fillStyle = m.bossColor;
      ctx.beginPath(); ctx.arc(x, y + 8, 22, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - 10, 14, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = m.bossColor; ctx.lineWidth = 5;
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        const a = (i / 4) * 0.9;
        ctx.beginPath();
        ctx.moveTo(x, y + 8);
        ctx.lineTo(x + Math.cos(a) * 36, y + 8 + Math.sin(a) * 20);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      // 4 eyes
      ctx.fillStyle = '#ff1744';
      ctx.beginPath();
      ctx.arc(x - 6, y - 10, 2, 0, Math.PI * 2); ctx.arc(x - 2, y - 14, 2, 0, Math.PI * 2);
      ctx.arc(x + 2, y - 14, 2, 0, Math.PI * 2); ctx.arc(x + 6, y - 10, 2, 0, Math.PI * 2);
      ctx.fill();
    },
    ember_specter: (ctx, x, y, m, t, pulse) => {
      ctx.fillStyle = m.bossColor; ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(x - 18, y - 18); ctx.quadraticCurveTo(x, y - 30, x + 18, y - 18);
      ctx.lineTo(x + 14, y + 20 + pulse); ctx.lineTo(x - 14, y + 20 + pulse); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      // Burning eyes
      ctx.fillStyle = '#ffd54f'; ctx.shadowColor = '#ff5722'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(x - 6, y - 6, 3, 0, Math.PI * 2); ctx.arc(x + 6, y - 6, 3, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    },
    tide_serpent: (ctx, x, y, m, t) => {
      ctx.fillStyle = m.bossColor;
      for (let i = 0; i < 6; i++) {
        const r = 20 - i * 2.5;
        const oy = Math.sin(t * 3 + i) * 5;
        ctx.beginPath(); ctx.arc(x, y + oy, r, 0, Math.PI * 2); ctx.fill();
      }
      // Fin
      ctx.fillStyle = '#01579b';
      ctx.beginPath();
      ctx.moveTo(x - 14, y - 22); ctx.lineTo(x, y - 32); ctx.lineTo(x + 14, y - 22);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff1744';
      ctx.beginPath(); ctx.arc(x - 5, y - 8, 2.5, 0, Math.PI * 2); ctx.arc(x + 5, y - 8, 2.5, 0, Math.PI * 2); ctx.fill();
    },
    frost_titan: (ctx, x, y, m, t) => {
      ctx.fillStyle = m.bossColor;
      ctx.fillRect(x - 24, y - 8, 48, 32);
      ctx.fillRect(x - 12, y - 28, 24, 20);
      // Ice spikes on shoulders
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(x - 24, y - 8); ctx.lineTo(x - 30, y - 22); ctx.lineTo(x - 18, y - 10); ctx.closePath();
      ctx.moveTo(x + 24, y - 8); ctx.lineTo(x + 30, y - 22); ctx.lineTo(x + 18, y - 10); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#03a9f4';
      ctx.beginPath(); ctx.arc(x - 5, y - 18, 2, 0, Math.PI * 2); ctx.arc(x + 5, y - 18, 2, 0, Math.PI * 2); ctx.fill();
    },
    mire_hag: (ctx, x, y, m, t, pulse) => {
      ctx.fillStyle = m.bossColor; ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(x - 22, y + 20); ctx.lineTo(x - 12, y - 22); ctx.lineTo(x + 12, y - 22);
      ctx.lineTo(x + 22, y + 20); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      // Hat
      ctx.fillStyle = '#311b92';
      ctx.beginPath();
      ctx.moveTo(x - 12, y - 22); ctx.lineTo(x, y - 38); ctx.lineTo(x + 12, y - 22); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffeb3b';
      ctx.beginPath(); ctx.arc(x - 5, y - 12, 2, 0, Math.PI * 2); ctx.arc(x + 5, y - 12, 2, 0, Math.PI * 2); ctx.fill();
    },
    blood_beast: (ctx, x, y, m, t, pulse) => {
      ctx.fillStyle = m.bossColor;
      ctx.beginPath(); ctx.ellipse(x, y + 8, 30, 18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 18, y - 4, 12, 0, Math.PI * 2); ctx.fill();
      // Teeth
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(x + 12 + i * 3, y - 4); ctx.lineTo(x + 14 + i * 3, y + 2); ctx.lineTo(x + 16 + i * 3, y - 4);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#ff1744';
      ctx.beginPath(); ctx.arc(x + 20, y - 8, 3, 0, Math.PI * 2); ctx.fill();
    },
    phantom_bishop: (ctx, x, y, m, t, pulse) => {
      ctx.fillStyle = m.bossColor; ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(x - 16, y + 26); ctx.lineTo(x - 12, y - 24);
      ctx.lineTo(x + 12, y - 24); ctx.lineTo(x + 16, y + 26); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      // Mitre hat
      ctx.fillStyle = m.bossColor;
      ctx.beginPath();
      ctx.moveTo(x - 12, y - 24); ctx.lineTo(x, y - 38); ctx.lineTo(x + 12, y - 24); ctx.closePath(); ctx.fill();
      // Cross
      ctx.fillStyle = '#fbc02d';
      ctx.fillRect(x - 2, y - 34, 4, 12); ctx.fillRect(x - 6, y - 30, 12, 4);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 4, y - 10, 2, 0, Math.PI * 2); ctx.arc(x + 4, y - 10, 2, 0, Math.PI * 2); ctx.fill();
    },
    toxin_spider: (ctx, x, y, m, t) => {
      ctx.fillStyle = m.bossColor;
      ctx.beginPath(); ctx.arc(x, y + 6, 20, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - 8, 12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#558b2f'; ctx.lineWidth = 4;
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        const a = (i / 4) * 0.9;
        ctx.beginPath();
        ctx.moveTo(x, y + 6);
        ctx.lineTo(x + Math.cos(a) * 32, y + 6 + Math.sin(a) * 18);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      // Acidic drip
      ctx.fillStyle = '#9ccc65'; ctx.globalAlpha = 0.6 + Math.sin(t * 4) * 0.3;
      ctx.beginPath(); ctx.arc(x, y + 26, 4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ff1744';
      ctx.beginPath(); ctx.arc(x - 4, y - 8, 2, 0, Math.PI * 2); ctx.arc(x + 4, y - 8, 2, 0, Math.PI * 2); ctx.fill();
    },
    inferno_wyrm: (ctx, x, y, m, t, pulse) => {
      ctx.fillStyle = m.bossColor;
      // Long serpentine body
      for (let i = 0; i < 7; i++) {
        const r = 18 - i * 2;
        const oy = Math.sin(t * 2 + i * 0.6) * 6;
        ctx.beginPath(); ctx.arc(x + i * 3, y + oy, r, 0, Math.PI * 2); ctx.fill();
      }
      // Mane
      ctx.fillStyle = '#ffd54f';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(x - 8 + i * 2, y - 14);
        ctx.lineTo(x - 12 + i * 2, y - 26 - i);
        ctx.lineTo(x - 4 + i * 2, y - 14);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x + 16, y - 8, 3, 0, Math.PI * 2); ctx.fill();
    },
    light_avatar: (ctx, x, y, m, t, pulse) => {
      ctx.fillStyle = m.bossColor; ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 20;
      ctx.fillRect(x - 18, y - 4, 36, 28);
      ctx.beginPath(); ctx.arc(x, y - 14, 14, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // Halo
      ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y - 24, 18 + pulse * 0.5, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
      // Wings
      ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(x - 18, y); ctx.lineTo(x - 38, y - 10); ctx.lineTo(x - 18, y + 12); ctx.closePath();
      ctx.moveTo(x + 18, y); ctx.lineTo(x + 38, y - 10); ctx.lineTo(x + 18, y + 12); ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fbc02d';
      ctx.beginPath(); ctx.arc(x - 4, y - 14, 2, 0, Math.PI * 2); ctx.arc(x + 4, y - 14, 2, 0, Math.PI * 2); ctx.fill();
    },
    chrono_phantom: (ctx, x, y, m, t, pulse) => {
      // Hourglass body
      ctx.fillStyle = m.bossColor;
      ctx.beginPath();
      ctx.moveTo(x - 22, y - 24); ctx.lineTo(x + 22, y - 24); ctx.lineTo(x + 4, y); ctx.lineTo(x + 22, y + 24);
      ctx.lineTo(x - 22, y + 24); ctx.lineTo(x - 4, y); ctx.closePath(); ctx.fill();
      // Clock face
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y - 4, 8, 0, Math.PI * 2); ctx.stroke();
      // Hands
      const ang1 = t * 0.5;
      const ang2 = t * 0.1;
      ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + Math.cos(ang1) * 6, y - 4 + Math.sin(ang1) * 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + Math.cos(ang2) * 4, y - 4 + Math.sin(ang2) * 4); ctx.stroke();
      ctx.lineWidth = 1;
    },
    scarab_lord: (ctx, x, y, m, t) => {
      ctx.fillStyle = m.bossColor;
      // Big oval carapace
      ctx.beginPath(); ctx.ellipse(x, y + 4, 30, 20, 0, 0, Math.PI * 2); ctx.fill();
      // Seam down the middle
      ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y - 16); ctx.lineTo(x, y + 24); ctx.stroke();
      ctx.lineWidth = 1;
      // Mandibles
      ctx.fillStyle = '#3e2723';
      ctx.beginPath(); ctx.moveTo(x - 14, y - 12); ctx.lineTo(x - 20, y - 24); ctx.lineTo(x - 8, y - 16); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 14, y - 12); ctx.lineTo(x + 20, y - 24); ctx.lineTo(x + 8, y - 16); ctx.closePath(); ctx.fill();
      // Eyes
      ctx.fillStyle = '#ff1744';
      ctx.beginPath(); ctx.arc(x - 6, y - 6, 2, 0, Math.PI * 2); ctx.arc(x + 6, y - 6, 2, 0, Math.PI * 2); ctx.fill();
    },
    dust_djinn: (ctx, x, y, m, t, pulse) => {
      ctx.fillStyle = m.bossColor; ctx.globalAlpha = 0.85;
      // Swirling lower body (no legs)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + t * 1.2;
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(a) * 16, y + 18 + Math.sin(a) * 6, 8, 4, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Upper torso
      ctx.fillStyle = m.bossColor;
      ctx.fillRect(x - 14, y - 8, 28, 22);
      ctx.beginPath(); ctx.arc(x, y - 18, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 4, y - 18, 2, 0, Math.PI * 2); ctx.arc(x + 4, y - 18, 2, 0, Math.PI * 2); ctx.fill();
    },
    wisp_swarm: (ctx, x, y, m, t) => {
      // Multiple small orbs swirling
      ctx.fillStyle = m.bossColor; ctx.shadowColor = m.bossColor; ctx.shadowBlur = 12;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + t * 1.0;
        const r = 16 + Math.sin(t * 2 + i) * 8;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    },
    fungal_horror: (ctx, x, y, m, t, pulse) => {
      // Mushroom-style stalk
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(x - 8, y - 4, 16, 28);
      // Cap
      ctx.fillStyle = m.bossColor;
      ctx.beginPath();
      ctx.arc(x, y - 8, 24 + pulse, Math.PI, Math.PI * 2);
      ctx.lineTo(x + 24, y - 8); ctx.lineTo(x - 24, y - 8); ctx.closePath(); ctx.fill();
      // Spots
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 10, y - 14, 4, 0, Math.PI * 2);
      ctx.arc(x + 8, y - 16, 3, 0, Math.PI * 2);
      ctx.arc(x, y - 22, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff1744';
      ctx.beginPath(); ctx.arc(x - 3, y + 4, 1.5, 0, Math.PI * 2); ctx.arc(x + 3, y + 4, 1.5, 0, Math.PI * 2); ctx.fill();
    },
  };

  function shadeColor(hex, amt) {
    // amt in [-1,1]; negative darkens, positive lightens
    let h = (hex || '#000000').replace('#', '');
    if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
    let r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
    return '#' + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function drawPlayer(ctx, x, y, c, p) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y + 22, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    const walkPhase = p.moving ? Math.sin(p.animTime * 10) : 0;
    const legA = walkPhase * 3;
    ctx.fillStyle = '#2c1a4a';
    ctx.fillRect(x - 7, y + 8, 5, 14 + legA);
    ctx.fillRect(x + 2, y + 8, 5, 14 - legA);
    const outfit = c.outfit || 'tunic';
    const cloth = c.clothColor || '#5b21b6';
    const clothDark = shadeColor(cloth, -0.35);
    // Cloak drawn behind the body
    if (outfit === 'cloak') {
      ctx.fillStyle = clothDark;
      ctx.beginPath();
      ctx.moveTo(x - 12, y - 4); ctx.lineTo(x + 12, y - 4);
      ctx.lineTo(x + 15, y + 18); ctx.lineTo(x - 15, y + 18); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = cloth;
    if (outfit === 'robe') {
      // long flowing robe (wider at the bottom)
      ctx.beginPath();
      ctx.moveTo(x - 11, y - 2); ctx.lineTo(x + 11, y - 2);
      ctx.lineTo(x + 13, y + 20); ctx.lineTo(x - 13, y + 20); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shadeColor(cloth, 0.2); ctx.fillRect(x - 2, y - 2, 4, 22); // center seam
    } else if (outfit === 'armor') {
      // boxy plate chest with shoulder pads
      ctx.fillRect(x - 11, y - 2, 22, 14);
      ctx.fillStyle = clothDark; ctx.fillRect(x - 13, y - 3, 5, 6); ctx.fillRect(x + 8, y - 3, 5, 6);
      ctx.fillStyle = shadeColor(cloth, 0.25); ctx.fillRect(x - 8, y, 16, 3); // chest highlight
    } else if (outfit === 'vest') {
      // open vest over skin
      ctx.fillStyle = c.skin; ctx.fillRect(x - 9, y - 2, 18, 14);
      ctx.fillStyle = cloth;
      ctx.beginPath(); ctx.moveTo(x - 11, y - 2); ctx.lineTo(x - 3, y - 2); ctx.lineTo(x - 5, y + 12); ctx.lineTo(x - 11, y + 12); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 11, y - 2); ctx.lineTo(x + 3, y - 2); ctx.lineTo(x + 5, y + 12); ctx.lineTo(x + 11, y + 12); ctx.closePath(); ctx.fill();
    } else {
      // tunic (default trapezoid)
      ctx.beginPath();
      ctx.moveTo(x - 11, y - 2); ctx.lineTo(x + 11, y - 2);
      ctx.lineTo(x + 9, y + 12); ctx.lineTo(x - 9, y + 12); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#3e2723'; ctx.fillRect(x - 10, y + 7, 20, 3);
    ctx.fillStyle = '#fbc02d'; ctx.fillRect(x - 2, y + 7, 4, 3);
    // Equipped armor overlay — pauldrons + chestplate sheen, tinted by armor type.
    if (c.armor && ARMORS[c.armor]) {
      const ac = ARMORS[c.armor].color || '#90a4ae';
      ctx.fillStyle = ac;
      // pauldrons
      ctx.beginPath(); ctx.ellipse(x - 11, y - 1, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 11, y - 1, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
      // chest plate band
      ctx.fillStyle = shadeColor(ac, 0.15);
      ctx.fillRect(x - 8, y + 1, 16, 5);
      ctx.strokeStyle = shadeColor(ac, -0.3); ctx.lineWidth = 1;
      ctx.strokeRect(x - 8, y + 1, 16, 5);
      // center rivet
      ctx.fillStyle = shadeColor(ac, 0.4);
      ctx.beginPath(); ctx.arc(x, y + 3, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    const armA = walkPhase * 2;
    ctx.fillStyle = c.skin;
    ctx.fillRect(x - 13, y - 2 + armA, 3, 12);
    ctx.fillRect(x + 10, y - 2 - armA, 3, 12);
    ctx.beginPath(); ctx.arc(x, y - 10, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c.hair;
    const hs = c.hairstyle || 'short';
    if (hs === 'short') { ctx.beginPath(); ctx.arc(x, y - 12, 11, Math.PI, Math.PI * 2); ctx.fill(); }
    else if (hs === 'long') {
      ctx.beginPath(); ctx.ellipse(x, y - 8, 12, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.skin; ctx.beginPath(); ctx.arc(x, y - 10, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.hair; ctx.beginPath(); ctx.arc(x, y - 14, 11, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
    } else if (hs === 'spiky') {
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * 3.5 - 1.5, y - 14);
        ctx.lineTo(x + i * 3.5, y - 22);
        ctx.lineTo(x + i * 3.5 + 1.5, y - 14);
        ctx.closePath(); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(x, y - 12, 11, Math.PI, Math.PI * 2); ctx.fill();
    } else if (hs === 'mohawk') {
      ctx.beginPath(); ctx.arc(x, y - 12, 11, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.hair;
      ctx.beginPath(); ctx.moveTo(x - 2, y - 14); ctx.lineTo(x, y - 26); ctx.lineTo(x + 2, y - 14); ctx.closePath(); ctx.fill();
      ctx.fillRect(x - 2, y - 20, 4, 8);
    } else if (hs === 'ponytail') {
      ctx.beginPath(); ctx.arc(x, y - 12, 11, Math.PI, Math.PI * 2); ctx.fill();
      // tail out the back
      ctx.beginPath(); ctx.ellipse(x - 12, y - 4, 4, 12, 0.4, 0, Math.PI * 2); ctx.fill();
    } else if (hs === 'bun') {
      ctx.beginPath(); ctx.arc(x, y - 12, 11, Math.PI, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - 22, 5, 0, Math.PI * 2); ctx.fill();
    } else if (hs === 'curly') {
      for (let i = -2; i <= 2; i++) ctx.beginPath(), ctx.arc(x + i * 5, y - 16, 5, 0, Math.PI * 2), ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - 12, 11, Math.PI, Math.PI * 2); ctx.fill();
    } else if (hs === 'bald') {
      // no hair
    } else { ctx.beginPath(); ctx.arc(x, y - 12, 11, Math.PI, Math.PI * 2); ctx.fill(); }
    const eyeOff = Math.cos(p.dir) * 1.2;
    const eyeOffY = Math.sin(p.dir) * 0.8;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x - 3, y - 10, 2.2, 0, Math.PI * 2); ctx.arc(x + 3, y - 10, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c.eye;
    ctx.beginPath(); ctx.arc(x - 3 + eyeOff, y - 10 + eyeOffY, 1.2, 0, Math.PI * 2); ctx.arc(x + 3 + eyeOff, y - 10 + eyeOffY, 1.2, 0, Math.PI * 2); ctx.fill();
    // Facial expression (mouth + brows)
    const expr = c.expression || 'neutral';
    ctx.strokeStyle = '#5d3a2a'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    ctx.beginPath();
    if (expr === 'happy') { ctx.arc(x, y - 5, 3, 0.1 * Math.PI, 0.9 * Math.PI); }
    else if (expr === 'angry') {
      ctx.moveTo(x - 4, y - 6); ctx.lineTo(x + 4, y - 6); // flat mouth
      ctx.moveTo(x - 6, y - 13); ctx.lineTo(x - 1, y - 11); // brows angled in
      ctx.moveTo(x + 6, y - 13); ctx.lineTo(x + 1, y - 11);
    } else if (expr === 'cool') {
      ctx.moveTo(x - 3, y - 5); ctx.lineTo(x + 3, y - 5);
      // sunglasses
      ctx.stroke(); ctx.fillStyle = '#111';
      ctx.fillRect(x - 6, y - 12, 5, 3); ctx.fillRect(x + 1, y - 12, 5, 3);
      ctx.beginPath();
    } else if (expr === 'surprised') { ctx.arc(x, y - 5, 2, 0, Math.PI * 2); }
    else if (expr === 'smug') { ctx.moveTo(x - 3, y - 5); ctx.quadraticCurveTo(x, y - 3, x + 4, y - 6); }
    else { ctx.moveTo(x - 3, y - 5); ctx.lineTo(x + 3, y - 5); } // neutral
    ctx.stroke(); ctx.lineWidth = 1;
    drawWeapon(ctx, x, y, p.dir, c.weapon);
    if (p.invuln > 0) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
    }
    if (p.shield > 0) {
      ctx.strokeStyle = '#8be9fd'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
    }
  }

  function drawWeapon(ctx, x, y, dir, weaponKey) {
    const look = (WEAPONS[weaponKey] && WEAPONS[weaponKey].look) || weaponKey;
    const dx = Math.cos(dir), dy = Math.sin(dir);
    const px = (vx, vy) => [x + vx * dx - vy * dy, y + vx * dy + vy * dx];
    ctx.save();
    switch (look) {
      case 'sword': {
        const [hx, hy] = px(8, 0); const [tipx, tipy] = px(34, 0);
        ctx.strokeStyle = '#d8d8e0'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipx, tipy); ctx.stroke();
        const [gxa, gya] = px(8, -6); const [gxb, gyb] = px(8, 6);
        ctx.strokeStyle = '#fbc02d'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(gxa, gya); ctx.lineTo(gxb, gyb); ctx.stroke(); break;
      }
      case 'katana': { const [hx, hy] = px(8, 0); const [tipx, tipy] = px(38, -2);
        ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipx, tipy); ctx.stroke(); break; }
      case 'knife': { const [hx, hy] = px(8, 0); const [tipx, tipy] = px(22, 0);
        ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipx, tipy); ctx.stroke();
        const [gxa, gya] = px(8, -3); const [gxb, gyb] = px(8, 3);
        ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(gxa, gya); ctx.lineTo(gxb, gyb); ctx.stroke(); break; }
      case 'bow': { const [cx, cy] = px(20, 0);
        ctx.strokeStyle = '#8b6f47'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, 12, dir - Math.PI / 2.2, dir + Math.PI / 2.2); ctx.stroke();
        const [s1x, s1y] = px(20, -10); const [s2x, s2y] = px(20, 10);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(s1x, s1y); ctx.lineTo(s2x, s2y); ctx.stroke(); break; }
      case 'crossbow': { const [cx, cy] = px(14, 0);
        ctx.fillStyle = '#5d4037'; ctx.fillRect(cx - 4, cy - 2, 16, 4);
        const [bx1, by1] = px(18, -10); const [bx2, by2] = px(18, 10);
        ctx.strokeStyle = '#8b6f47'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(bx1, by1); ctx.lineTo(bx2, by2); ctx.stroke(); break; }
      case 'shield': { const [cx, cy] = px(20, 0);
        ctx.fillStyle = '#5d4037'; ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#9e9e9e'; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill(); break; }
      case 'spear': { const [hx, hy] = px(6, 0); const [tipx, tipy] = px(42, 0);
        ctx.strokeStyle = '#8b6f47'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipx, tipy); ctx.stroke();
        const [pt1x, pt1y] = px(46, 0); const [pt2x, pt2y] = px(38, -4); const [pt3x, pt3y] = px(38, 4);
        ctx.fillStyle = '#d8d8e0';
        ctx.beginPath(); ctx.moveTo(pt1x, pt1y); ctx.lineTo(pt2x, pt2y); ctx.lineTo(pt3x, pt3y); ctx.closePath(); ctx.fill(); break; }
      case 'axe': { const [hx, hy] = px(8, 0); const [tx, ty] = px(28, 0);
        ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        const [a1x, a1y] = px(24, -10); const [a2x, a2y] = px(34, -2);
        const [a3x, a3y] = px(34, 2); const [a4x, a4y] = px(24, 10);
        ctx.fillStyle = '#9e9e9e';
        ctx.beginPath(); ctx.moveTo(a1x, a1y); ctx.lineTo(a2x, a2y); ctx.lineTo(a3x, a3y); ctx.lineTo(a4x, a4y); ctx.closePath(); ctx.fill(); break; }
      case 'morningstar': { const [hx, hy] = px(8, 0); const [bx, by] = px(28, 0);
        ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(bx, by); ctx.stroke();
        ctx.fillStyle = '#616161'; ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2); ctx.fill(); break; }
      case 'hammer': { const [hx, hy] = px(8, 0); const [tx, ty] = px(26, 0);
        ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        const [h1x, h1y] = px(22, -8); const [h2x, h2y] = px(32, -8);
        const [h3x, h3y] = px(32, 8); const [h4x, h4y] = px(22, 8);
        ctx.fillStyle = '#8d8d8d';
        ctx.beginPath(); ctx.moveTo(h1x, h1y); ctx.lineTo(h2x, h2y); ctx.lineTo(h3x, h3y); ctx.lineTo(h4x, h4y); ctx.closePath(); ctx.fill(); break; }
      case 'scythe': { const [hx, hy] = px(8, 0); const [tx, ty] = px(34, -2);
        ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.strokeStyle = '#9e9e9e'; ctx.lineWidth = 3;
        const [sx, sy] = px(34, -2); const [s2x, s2y] = px(28, -16); const [s3x, s3y] = px(16, -18);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(s2x, s2y, s3x, s3y); ctx.stroke(); break; }
      case 'staff': { const [hx, hy] = px(6, 0); const [tx, ty] = px(34, 0);
        ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.fillStyle = '#9c27b0'; ctx.shadowColor = '#ce93d8'; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; break; }
      case 'whip': { ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 2.5;
        const [a1x, a1y] = px(8, 0); const [a2x, a2y] = px(18, -6);
        const [a3x, a3y] = px(28, 4); const [a4x, a4y] = px(40, -3);
        ctx.beginPath(); ctx.moveTo(a1x, a1y); ctx.bezierCurveTo(a2x, a2y, a3x, a3y, a4x, a4y); ctx.stroke(); break; }
      case 'chain': { ctx.strokeStyle = '#9e9e9e'; ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) { const [lx, ly] = px(10 + i * 6, 0);
          ctx.beginPath(); ctx.arc(lx, ly, 2.5, 0, Math.PI * 2); ctx.stroke(); }
        const [endx, endy] = px(46, 0);
        ctx.fillStyle = '#616161'; ctx.beginPath(); ctx.arc(endx, endy, 4, 0, Math.PI * 2); ctx.fill(); break; }
      case 'knuckles': { ctx.fillStyle = '#bdbdbd';
        for (let i = 0; i < 4; i++) { const [kx, ky] = px(10 + i * 5, 0);
          ctx.beginPath(); ctx.arc(kx, ky, 3, 0, Math.PI * 2); ctx.fill(); } break; }
      case 'dual': { for (const off of [-4, 4]) {
          const [hx, hy] = px(8, off); const [tipx, tipy] = px(28, off);
          ctx.strokeStyle = '#d8d8e0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipx, tipy); ctx.stroke();
        } break; }
      case 'throwing_knives': { for (const off of [-4, 0, 4]) { const [hx, hy] = px(8, off); const [tx, ty] = px(22, off);
        ctx.strokeStyle = '#eceff1'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke(); } break; }
      case 'slingshot': { const [hx, hy] = px(8, 0); const [forkx, forky] = px(20, 0);
        ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(forkx, forky); ctx.stroke();
        const [u1x, u1y] = px(26, -7); const [u2x, u2y] = px(26, 7);
        ctx.beginPath(); ctx.moveTo(forkx, forky); ctx.lineTo(u1x, u1y); ctx.moveTo(forkx, forky); ctx.lineTo(u2x, u2y); ctx.stroke();
        ctx.strokeStyle = '#bcaaa4'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(u1x, u1y); ctx.lineTo(u2x, u2y); ctx.stroke(); break; }
      case 'boomerang': { ctx.strokeStyle = '#bcaaa4'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        const [a1x, a1y] = px(10, -8); const [cx, cy] = px(22, 0); const [a3x, a3y] = px(10, 8);
        ctx.beginPath(); ctx.moveTo(a1x, a1y); ctx.quadraticCurveTo(cx + 4, cy, a3x, a3y); ctx.stroke(); break; }
      case 'shuriken': { const [cx, cy] = px(20, 0); ctx.fillStyle = '#cfd8dc';
        ctx.save(); ctx.translate(cx, cy); ctx.beginPath();
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + dir; ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9); ctx.lineTo(Math.cos(a + 0.4) * 3, Math.sin(a + 0.4) * 3); }
        ctx.closePath(); ctx.fill(); ctx.restore(); break; }
      case 'chakram': { const [cx, cy] = px(20, 0); ctx.strokeStyle = '#cfd8dc'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.stroke(); break; }
      case 'blow_dart': { const [hx, hy] = px(6, 0); const [tx, ty] = px(34, 0);
        ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.fillStyle = '#aed581'; ctx.beginPath(); ctx.arc(tx, ty, 2.5, 0, Math.PI * 2); ctx.fill(); break; }
      case 'catapult': { const [bx, by] = px(8, 0); const [ax, ay] = px(28, -10);
        ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ax, ay); ctx.stroke();
        ctx.fillStyle = '#a1887f'; ctx.beginPath(); ctx.arc(ax, ay, 6, 0, Math.PI * 2); ctx.fill(); break; }
      case 'ballista': { const [hx, hy] = px(6, 0); const [tx, ty] = px(34, 0);
        ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        const [b1x, b1y] = px(20, -14); const [b2x, b2y] = px(20, 14);
        ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(b1x, b1y); ctx.lineTo(b2x, b2y); ctx.stroke(); break; }
      case 'hand_cannon': { const [hx, hy] = px(8, 0); const [tx, ty] = px(28, 0);
        ctx.strokeStyle = '#37474f'; ctx.lineWidth = 7; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.fillStyle = '#212121'; ctx.beginPath(); ctx.arc(tx, ty, 4, 0, Math.PI * 2); ctx.fill(); break; }
      case 'magic_bow': { const [cx, cy] = px(20, 0);
        ctx.strokeStyle = '#80d8ff'; ctx.shadowColor = '#80d8ff'; ctx.shadowBlur = 12; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, 13, dir - Math.PI / 2.2, dir + Math.PI / 2.2); ctx.stroke(); ctx.shadowBlur = 0;
        const [s1x, s1y] = px(20, -11); const [s2x, s2y] = px(20, 11);
        ctx.strokeStyle = '#e1f5fe'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(s1x, s1y); ctx.lineTo(s2x, s2y); ctx.stroke(); break; }
      case 'trident': { const [hx, hy] = px(6, 0); const [tx, ty] = px(40, 0);
        ctx.strokeStyle = '#00838f'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.strokeStyle = '#26c6da'; ctx.lineWidth = 3;
        for (const o of [-6, 0, 6]) { const [e1x, e1y] = px(36, o); const [e2x, e2y] = px(46, o); ctx.beginPath(); ctx.moveTo(e1x, e1y); ctx.lineTo(e2x, e2y); ctx.stroke(); } break; }
      case 'magic_sword': { const [hx, hy] = px(8, 0); const [tipx, tipy] = px(36, 0);
        ctx.strokeStyle = '#b388ff'; ctx.shadowColor = '#b388ff'; ctx.shadowBlur = 14; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipx, tipy); ctx.stroke(); ctx.shadowBlur = 0;
        const [gxa, gya] = px(8, -6); const [gxb, gyb] = px(8, 6);
        ctx.strokeStyle = '#7c4dff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(gxa, gya); ctx.lineTo(gxb, gyb); ctx.stroke(); break; }
      case 'flame_blade': { const [hx, hy] = px(8, 0); const [tipx, tipy] = px(34, 0);
        ctx.strokeStyle = '#ff7043'; ctx.shadowColor = '#ff5722'; ctx.shadowBlur = 14; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipx, tipy); ctx.stroke(); ctx.shadowBlur = 0; break; }
      case 'frost_fang': { const [hx, hy] = px(8, 0); const [tipx, tipy] = px(34, 0);
        ctx.strokeStyle = '#80deea'; ctx.shadowColor = '#26c6da'; ctx.shadowBlur = 12; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipx, tipy); ctx.stroke(); ctx.shadowBlur = 0; break; }
      case 'thunder_spear': { const [hx, hy] = px(6, 0); const [tx, ty] = px(42, 0);
        ctx.strokeStyle = '#fff176'; ctx.shadowColor = '#ffeb3b'; ctx.shadowBlur = 12; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.shadowBlur = 0;
        const [pt1x, pt1y] = px(46, 0); const [pt2x, pt2y] = px(38, -4); const [pt3x, pt3y] = px(38, 4);
        ctx.fillStyle = '#fff59d'; ctx.beginPath(); ctx.moveTo(pt1x, pt1y); ctx.lineTo(pt2x, pt2y); ctx.lineTo(pt3x, pt3y); ctx.closePath(); ctx.fill(); break; }
      case 'vampire_scythe': { const [hx, hy] = px(8, 0); const [tx, ty] = px(34, -2);
        ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.strokeStyle = '#b71c1c'; ctx.shadowColor = '#8b0000'; ctx.shadowBlur = 10; ctx.lineWidth = 4;
        const [sx, sy] = px(34, -2); const [s2x, s2y] = px(26, -18); const [s3x, s3y] = px(12, -20);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(s2x, s2y, s3x, s3y); ctx.stroke(); ctx.shadowBlur = 0; break; }
      case 'gravity_maul': { const [hx, hy] = px(8, 0); const [tx, ty] = px(28, 0);
        ctx.strokeStyle = '#4a148c'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        const [h1x, h1y] = px(22, -11); const [h2x, h2y] = px(34, -11); const [h3x, h3y] = px(34, 11); const [h4x, h4y] = px(22, 11);
        ctx.fillStyle = '#7e57c2'; ctx.shadowColor = '#9575cd'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(h1x, h1y); ctx.lineTo(h2x, h2y); ctx.lineTo(h3x, h3y); ctx.lineTo(h4x, h4y); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; break; }
      case 'void_edge': { const [hx, hy] = px(8, 0); const [tipx, tipy] = px(34, 0);
        ctx.strokeStyle = '#311b92'; ctx.shadowColor = '#b388ff'; ctx.shadowBlur = 14; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipx, tipy); ctx.stroke(); ctx.shadowBlur = 0; break; }
      case 'storm_fan': { const [cx, cy] = px(16, 0);
        ctx.strokeStyle = '#b3e5fc'; ctx.shadowColor = '#81d4fa'; ctx.shadowBlur = 8; ctx.lineWidth = 2;
        for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) { ctx.beginPath(); ctx.moveTo(cx, cy); const [tx, ty] = px(16 + Math.cos(a) * 18, Math.sin(a) * 18); ctx.lineTo(tx, ty); ctx.stroke(); }
        ctx.shadowBlur = 0; break; }
      default: { const [hx, hy] = px(10, 0); const [tipx, tipy] = px(28, 0);
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipx, tipy); ctx.stroke(); }
    }
    ctx.restore(); ctx.lineWidth = 1;
  }

  function handleMouse(e) {
    const cv = canvasRef.current; if (!cv) return;
    const r = cv.getBoundingClientRect();
    world.current.mouse.x = (e.clientX - r.left);
    world.current.mouse.y = (e.clientY - r.top);
  }

  async function saveCharacter() {
  if (!account || !charRef.current) return;
  const c = charRef.current;
  c.lastZone = world.current.zone; c.currentFloor = world.current.floor;
  await SaveAdapter.saveCharacter(account.username, c);
}

  async function doLogin(u, pw, setErr) {
  const result = await SaveAdapter.authenticate(u, pw);
  if (!result.ok) { setErr(result.error); return; }
  const acct = result.account;
  setAccount({ username: u });
  await AudioMgr.start();
  if (acct.character) {
    const migrated = migrateChar(acct.character);
    setChar(migrated); setScreen('world');
    world.current.zone = migrated.lastZone || 'hub';
    world.current.floor = migrated.currentFloor || 1;
    setTimeout(() => enterZone(world.current.zone), 50);
  } else setScreen('create');
}
  async function doRegister(u, pw, pw2, setErr, onSuccess) {
  if (pw !== pw2) { setErr('Passwords do not match'); return; }
  const result = await SaveAdapter.register(u, pw);
  if (!result.ok) { setErr(result.error); return; }
  onSuccess();
}

  function abilityTypeLabel(k) {
    return { projectile: 'bolt', homing_orb: 'homing orb', pierce_line: 'piercing lance', beam: 'beam',
      chain: 'chain', melee: 'melee', slam: 'ground slam', barrage: 'barrage', orbit: 'orbiting',
      dot_field: 'damage field', nova: 'nova', aoe: 'blast', ultimate: 'ULTIMATE', cone: 'cone',
      shield: 'shield', dash: 'blink', heal: 'heal' }[k] || k;
  }

  function gradeColor(g) {    return { S: 'text-yellow-300', A: 'text-purple-300', B: 'text-blue-300',
      C: 'text-green-300', D: 'text-slate-300', E: 'text-slate-400', F: 'text-slate-500' }[g] || 'text-white';
  }

  // ============================================================
  //                      SCREENS & MODALS
  // ============================================================
  function LoginScreen() {
    const [u, setU] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState('');
    return (
      <div className="flex flex-col items-center justify-center h-full text-white p-8" style={{ background: 'radial-gradient(ellipse at center, #2d1b4e 0%, #1a0f24 70%, #000 100%)' }}>
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🌙</div>
          <h1 className="text-6xl font-bold mb-1" style={{ fontFamily: 'Georgia, serif', textShadow: '0 0 30px #b794f4, 0 0 60px #5b21b6' }}>
            Krezcent Quest
          </h1>
          <p className="text-purple-300 italic mt-2">by Kishel</p>
        </div>
        <div className="bg-slate-900/80 p-6 rounded-lg w-96 border border-purple-700 shadow-2xl">
          <h2 className="text-xl mb-4 text-center font-bold">Sign In</h2>
          <input value={u} onChange={e => setU(e.target.value)} placeholder="Username"
            className="w-full mb-3 px-3 py-2 bg-slate-800 rounded outline-none border border-slate-700" />
          <input value={pw} onChange={e => setPw(e.target.value)} type="password" placeholder="Password"
            className="w-full mb-3 px-3 py-2 bg-slate-800 rounded outline-none border border-slate-700"
            onKeyDown={e => { if (e.key === 'Enter') doLogin(u, pw, setErr); }} />
          {err && <div className="text-red-400 text-sm mb-2">{err}</div>}
          <button onClick={() => doLogin(u, pw, setErr)}
            className="w-full py-2 bg-purple-700 hover:bg-purple-600 rounded mb-3 font-bold">Log In</button>
          <div className="text-center text-sm text-slate-400">
            Don't have an account?{' '}
            <button onClick={() => setScreen('register')} className="text-purple-300 hover:text-purple-200 underline">Create one</button>
          </div>
        </div>
      </div>
    );
  }

  function RegisterScreen() {
    const [u, setU] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [err, setErr] = useState(''); const [success, setSuccess] = useState(false);
    return (
      <div className="flex flex-col items-center justify-center h-full text-white p-8" style={{ background: 'radial-gradient(ellipse at center, #2d1b4e 0%, #1a0f24 70%, #000 100%)' }}>
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">🌙</div>
          <h1 className="text-4xl font-bold" style={{ fontFamily: 'Georgia, serif', textShadow: '0 0 20px #b794f4' }}>Create Account</h1>
        </div>
        <div className="bg-slate-900/80 p-6 rounded-lg w-96 border border-purple-700 shadow-2xl">
          {success ? (
            <div className="text-center">
              <div className="text-4xl mb-3">✓</div>
              <div className="text-green-400 font-bold mb-3">Account created!</div>
              <button onClick={() => setScreen('login')} className="w-full py-2 bg-purple-700 hover:bg-purple-600 rounded font-bold">Go to Login</button>
            </div>
          ) : (
            <>
              <input value={u} onChange={e => setU(e.target.value)} placeholder="Username (3+ chars)"
                className="w-full mb-3 px-3 py-2 bg-slate-800 rounded outline-none border border-slate-700" />
              <input value={pw} onChange={e => setPw(e.target.value)} type="password" placeholder="Password (4+ chars)"
                className="w-full mb-3 px-3 py-2 bg-slate-800 rounded outline-none border border-slate-700" />
              <input value={pw2} onChange={e => setPw2(e.target.value)} type="password" placeholder="Confirm Password"
                className="w-full mb-3 px-3 py-2 bg-slate-800 rounded outline-none border border-slate-700"
                onKeyDown={e => { if (e.key === 'Enter') doRegister(u, pw, pw2, setErr, () => setSuccess(true)); }} />
              {err && <div className="text-red-400 text-sm mb-2">{err}</div>}
              <button onClick={() => doRegister(u, pw, pw2, setErr, () => setSuccess(true))}
                className="w-full py-2 bg-green-700 hover:bg-green-600 rounded mb-3 font-bold">Create Account</button>
              <div className="text-center text-sm text-slate-400">
                Already have one?{' '}
                <button onClick={() => setScreen('login')} className="text-purple-300 hover:text-purple-200 underline">Sign in</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  function CharacterPreview({ hair, eye, skin, hairstyle, expression, outfit, clothColor, weapon }) {
    const ref = useRef(null);
    useEffect(() => {
      const cv = ref.current; if (!cv) return;
      const ctx = cv.getContext('2d');
      let raf, t0 = performance.now();
      const fakeC = { hair, eye, skin, hairstyle, expression, outfit, clothColor, weapon };
      const draw = () => {
        const t = (performance.now() - t0) / 1000;
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = 'rgba(124,77,255,0.08)';
        ctx.beginPath(); ctx.arc(cv.width / 2, cv.height / 2 + 10, 46, 0, Math.PI * 2); ctx.fill();
        const fakeP = { dir: Math.sin(t * 1.2) * 0.9, moving: true, animTime: t, invuln: 0, shield: 0, sky: 0, buffs: {} };
        drawPlayer(ctx, cv.width / 2, cv.height / 2, fakeC, fakeP);
        raf = requestAnimationFrame(draw);
      };
      draw();
      return () => cancelAnimationFrame(raf);
    }, [hair, eye, skin, hairstyle, expression, outfit, clothColor, weapon]);
    return <canvas ref={ref} width={160} height={150} className="rounded bg-slate-900 border border-slate-700" />;
  }

  function CharacterCreator() {
    const [hair, setHair] = useState('#3b2316');
    const [eye, setEye] = useState('#2196f3');
    const [skin, setSkin] = useState('#f4c2a1');
    const [hairstyle, setHairstyle] = useState('short');
    const [expression, setExpression] = useState('neutral');
    const [outfit, setOutfit] = useState('tunic');
    const [clothColor, setClothColor] = useState('#5b21b6');
    const [weapon, setWeapon] = useState('sword');
    const [code, setCode] = useState('');
    const [preview, setPreview] = useState(null);
    const [name, setName] = useState('');
    const hasCode = code && ADMIN_CODES[code];

    function buildAndStart() {
      if (!name.trim()) { setMsg('Enter a character name'); return; }
      let attrs, affinities, bonusLevel = 0, bonusCoins = 0, setCoins = null;
      if (hasCode) {
        const cc = ADMIN_CODES[code];
        attrs = cc.attrs.map(a => ({ ...a }));
        affinities = JSON.parse(JSON.stringify(cc.affs || {}));
        bonusLevel = cc.bonusLevel || 0; bonusCoins = cc.bonusCoins || 0;
        if (cc.setCoins != null) setCoins = cc.setCoins;
        // Grant every main + sub affinity (each main carries one sub for the panel)
        if (cc.allAffinities) {
          const mains = Object.keys(AFFS);
          const subs = Object.keys(SUB_ABILITIES);
          const lvl = cc.maxAllAbilities ? 100 : 50;
          for (let i = 0; i < mains.length; i++) {
            affinities[mains[i]] = { level: lvl };
            if (subs[i]) { affinities[mains[i]].sub = subs[i]; affinities[mains[i]].subLevel = lvl; }
          }
          // attach any leftover subs to mains as a secondary list so all are owned
          if (subs.length > mains.length) {
            affinities._extraSubs = subs.slice(mains.length);
          }
        } else if (cc.maxAllAbilities) {
          for (const k of Object.keys(affinities)) { affinities[k].level = 100; if (affinities[k].sub) affinities[k].subLevel = 100; }
        }
        for (const k of Object.keys(affinities)) {
          if (k === '_extraSubs') continue;
          if (!('exp' in affinities[k])) affinities[k].exp = 0;
          if (affinities[k].sub && !('subExp' in affinities[k])) affinities[k].subExp = 0;
        }
      } else {
        attrs = preview ? preview.attrs : rollCharacterAttrs();
        affinities = preview ? preview.affinities : rollCharacterAffinities();
      }
      const level = 1 + bonusLevel;
      const maxHp = 1000 + (level - 1) * 15;
      const maxMana = 10 + (level - 1) * 5;
      const maxEnergy = 10 + (level - 1) * 5;
      const knownAbilities = {};
      for (const [aff, data] of Object.entries(affinities)) {
        if (aff === '_extraSubs') continue;
        const list = ABILITIES[aff] || [];
        knownAbilities[aff] = list.filter(a => a.lvl <= data.level).map(a => a.n);
        if (data.sub) {
          const sl = SUB_ABILITIES[data.sub] || [];
          knownAbilities[data.sub] = sl.filter(a => a.lvl <= (data.subLevel || 1)).map(a => a.n);
        }
      }
      // Any sub-affinities not attached to a main (KISHEL_DEV) still get all abilities
      if (affinities._extraSubs) {
        const lvl = ADMIN_CODES[code]?.maxAllAbilities ? 100 : 50;
        for (const sub of affinities._extraSubs) {
          const sl = SUB_ABILITIES[sub] || [];
          knownAbilities[sub] = sl.filter(a => a.lvl <= lvl).map(a => a.n);
          affinities[sub] = { level: lvl, exp: 0, isStandaloneSub: true };
        }
        delete affinities._extraSubs;
      }
      const newChar = {
        name: name.trim(), hair, eye, skin, hairstyle, expression, outfit, clothColor, weapon,
        attrs, affinities,
        equippedAttrs: attrs.slice(0, MAX_EQUIPPED_ATTRS).map(a => a.key),
        knownAbilities, equippedAbilityList: [],
        ownedWeapons: [weapon],
        weaponLevels: { [weapon]: 1 },
        ownedArmors: [], armorLevels: {}, armor: null,
        statusEffects: [],
        level, exp: 0, maxHp, hp: maxHp, maxMana, mana: maxMana, maxEnergy, energy: maxEnergy,
        inventory: [], coins: setCoins != null ? setCoins : (100 + bonusCoins),
        unlockedFloor: 1, currentFloor: 1, lastZone: 'starting',
      };
      setChar(newChar);
      (async () => {
        await SaveAdapter.saveCharacter(account.username, newChar);
      })();
      setScreen('world');
      setTimeout(() => enterZone('starting'), 50);
    }
    function previewRoll() {
      if (!hasCode) return;
      const cc = ADMIN_CODES[code];
      const attrs = cc.attrs.map(a => ({ ...a }));
      const affinities = JSON.parse(JSON.stringify(cc.affs));
      setPreview({ attrs, affinities, codeNote: cc.note });
    }
    const hairOptions = ['#3b2316','#000000','#6d4c41','#f9d71c','#c1440e','#ffffff','#9c27b0','#03a9f4','#e91e63','#4caf50','#ff5722','#90a4ae','#7e57c2','#00bcd4'];
    const eyeOptions = ['#2196f3','#4caf50','#795548','#ff9800','#9c27b0','#f44336','#00bcd4','#ffc107','#e91e63','#607d8b'];
    const skinOptions = ['#f4c2a1','#deb887','#c68642','#a08060','#8d5524','#5d3924','#fadbb5','#ffe0bd','#3b2219','#e8b89b'];
    const hairstyles = ['short','long','spiky','mohawk','ponytail','bun','curly','bald'];
    const expressions = ['neutral','happy','angry','cool','surprised','smug'];
    const outfits = ['tunic','robe','armor','cloak','vest'];
    const clothOptions = ['#5b21b6','#1565c0','#2e7d32','#c62828','#f9a825','#37474f','#6d4c41','#ad1457','#00838f','#ffffff','#212121','#ef6c00'];
    return (
      <div className="h-full overflow-auto p-6" style={{ background: 'radial-gradient(ellipse at center, #2d1b4e 0%, #1a0f24 70%, #000 100%)', color: 'white' }}>
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">Create Your Character</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-800/70 p-4 rounded border border-purple-700">
              <h2 className="text-xl mb-3">Appearance & Loadout</h2>
              <div className="mb-3">
                <label className="block text-sm text-slate-400 mb-1">Name</label>
                <input value={name} onChange={e => setName(e.target.value)} maxLength={16}
                  className="w-full px-3 py-2 bg-slate-900 rounded outline-none" placeholder="Character name" />
              </div>
              <div className="mb-3">
                <label className="block text-sm text-slate-400 mb-1">Hair Color</label>
                <div className="flex flex-wrap gap-2">
                  {hairOptions.map(co => (
                    <button key={co} onClick={() => setHair(co)}
                      className={`w-8 h-8 rounded-full border-2 ${hair === co ? 'border-white' : 'border-slate-600'}`}
                      style={{ background: co }} />
                  ))}
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-sm text-slate-400 mb-1">Eye Color</label>
                <div className="flex flex-wrap gap-2">
                  {eyeOptions.map(co => (
                    <button key={co} onClick={() => setEye(co)}
                      className={`w-8 h-8 rounded-full border-2 ${eye === co ? 'border-white' : 'border-slate-600'}`}
                      style={{ background: co }} />
                  ))}
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-sm text-slate-400 mb-1">Skin Color</label>
                <div className="flex flex-wrap gap-2">
                  {skinOptions.map(co => (
                    <button key={co} onClick={() => setSkin(co)}
                      className={`w-8 h-8 rounded-full border-2 ${skin === co ? 'border-white' : 'border-slate-600'}`}
                      style={{ background: co }} />
                  ))}
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-sm text-slate-400 mb-1">Hairstyle</label>
                <div className="flex flex-wrap gap-2">
                  {hairstyles.map(s => (
                    <button key={s} onClick={() => setHairstyle(s)}
                      className={`px-3 py-1 rounded ${hairstyle === s ? 'bg-purple-700' : 'bg-slate-700 hover:bg-slate-600'}`}>{s}</button>
                  ))}
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-sm text-slate-400 mb-1">Expression</label>
                <div className="flex flex-wrap gap-2">
                  {expressions.map(s => (
                    <button key={s} onClick={() => setExpression(s)}
                      className={`px-3 py-1 rounded ${expression === s ? 'bg-purple-700' : 'bg-slate-700 hover:bg-slate-600'}`}>{s}</button>
                  ))}
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-sm text-slate-400 mb-1">Clothing</label>
                <div className="flex flex-wrap gap-2">
                  {outfits.map(s => (
                    <button key={s} onClick={() => setOutfit(s)}
                      className={`px-3 py-1 rounded ${outfit === s ? 'bg-purple-700' : 'bg-slate-700 hover:bg-slate-600'}`}>{s}</button>
                  ))}
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-sm text-slate-400 mb-1">Clothing Color</label>
                <div className="flex flex-wrap gap-2">
                  {clothOptions.map(co => (
                    <button key={co} onClick={() => setClothColor(co)}
                      className={`w-8 h-8 rounded-full border-2 ${clothColor === co ? 'border-white' : 'border-slate-600'}`}
                      style={{ background: co }} />
                  ))}
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-sm text-slate-400 mb-1">Starting Weapon</label>
                <div className="flex flex-wrap gap-2">
                  {STARTER_WEAPONS.map(k => (
                    <button key={k} onClick={() => setWeapon(k)}
                      className={`px-3 py-1 rounded ${weapon === k ? 'bg-purple-700' : 'bg-slate-700 hover:bg-slate-600'}`}>
                      {WEAPONS[k].n}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1">{WEAPONS[weapon].style}</p>
              </div>
              <div className="mb-3">
                <label className="block text-sm text-slate-400 mb-1">Code (optional)</label>
                <input value={code} onChange={e => { setCode(e.target.value); setPreview(null); }}
                  className="w-full px-3 py-2 bg-slate-900 rounded outline-none" placeholder="Leave blank for normal roll" />
                {hasCode && (
                  <button onClick={previewRoll}
                    className="mt-2 w-full py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm">Preview Code Stats</button>
                )}
              </div>
            </div>
            <div className="bg-slate-800/70 p-4 rounded border border-purple-700">
              <h2 className="text-xl mb-3">Preview</h2>
              <div className="flex justify-center mb-3">
                <CharacterPreview hair={hair} eye={eye} skin={skin} hairstyle={hairstyle} expression={expression} outfit={outfit} clothColor={clothColor} weapon={weapon} />
              </div>
              {preview && hasCode && (
                <div className="text-sm space-y-2 mb-3">
                  <div className="text-yellow-400 text-xs">⚡ Code applied: {preview.codeNote}</div>
                </div>
              )}
              <div className="text-xs text-slate-400 italic mb-3">
                Attributes & affinities are randomly generated when you click Create Character. Starting HP is 1000.
              </div>
              <button onClick={buildAndStart}
                className="w-full py-2 bg-green-700 hover:bg-green-600 rounded font-bold">Create Character</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // HUD reads from char state (updates on hudTick or char change). Modals do NOT use hudTick.
  function HUD() {
    if (!char) return null;
    const statuses = char.statusEffects || [];
    return (
      <div className="absolute top-0 left-0 right-0 p-2 pointer-events-none text-white text-sm select-none" style={{ fontFamily: 'monospace' }}>
        <div className="flex gap-3 items-start flex-wrap">
          <div className="bg-black/70 p-2 rounded pointer-events-auto border border-purple-700" style={{ minWidth: 260 }}>
            <div className="font-bold mb-1 text-purple-200">{char.name} <span className="text-slate-400">· Lv {char.level}</span></div>
            <Bar label="HP" val={char.hp} max={char.maxHp} color="#ff5252" />
            <Bar label="MP" val={char.mana} max={char.maxMana} color="#2196f3" />
            <Bar label="EN" val={char.energy} max={char.maxEnergy} color="#fbc02d" />
            <div className="text-yellow-400 mt-1">🪙 {char.coins}</div>
            <div className="text-slate-300 text-xs">EXP: {Math.floor(char.exp)}/{expForLevel(char.level)}</div>
            {(() => {
              // Aggregate all active effects: statusEffects (burn/poison/freeze/curse) +
              // player-state flags (confused, silenced, blind, stun, slow) + buff timers
              // (statusImmune, cdHaste). Each entry: { kind, dur, color }.
              const p = world.current.player;
              const all = [];
              for (const s of statuses) {
                const col = ({ burn: '#ff7043', poison: '#9ccc65', freeze: '#80deea', curse: '#9c27b0' }[s.kind]) || '#bdbdbd';
                all.push({ kind: s.kind, dur: s.dur, color: col });
              }
              if (p) {
                if (p.confused > 0) all.push({ kind: 'confused', dur: p.confused, color: '#ba68c8' });
                if (p.silenced > 0) all.push({ kind: 'silenced', dur: p.silenced, color: '#90a4ae' });
                if (p.blind > 0)    all.push({ kind: 'blinded',  dur: p.blind,    color: '#212121' });
                if (p.stun > 0)     all.push({ kind: 'stunned',  dur: p.stun,     color: '#fff176' });
                if (p.slow > 0)     all.push({ kind: 'slowed',   dur: p.slow,     color: '#4fc3f7' });
                if (p.slipTimer > 0)all.push({ kind: 'slippery', dur: p.slipTimer,color: '#b3e5fc' });
                if (p.buffs && p.buffs.statusImmune > 0) all.push({ kind: 'IMMUNE',  dur: p.buffs.statusImmune, color: '#ffd54f' });
                if (p.buffs && p.buffs.cdHaste > 0)      all.push({ kind: 'haste',   dur: p.buffs.cdHaste,      color: '#80cbc4' });
                if (p.buffs && p.buffs.boost > 0)        all.push({ kind: 'boost',   dur: p.buffs.boost,        color: '#ef9a9a' });
                if (p.buffs && p.buffs.ironskin > 0)     all.push({ kind: 'iron',    dur: p.buffs.ironskin,     color: '#b0bec5' });
                if (p.buffs && p.buffs.quickstep > 0)    all.push({ kind: 'swift',   dur: p.buffs.quickstep,    color: '#aed581' });
                if (p.buffs && p.buffs.immortal > 0)     all.push({ kind: 'phoenix', dur: p.buffs.immortal,     color: '#ff8a65' });
              }
              if (!all.length) return null;
              return (
                <div className="mt-1 flex gap-1 flex-wrap">
                  {all.map((e, i) => (
                    <span key={i} className="text-xs px-1.5 rounded font-bold"
                      style={{ background: 'rgba(20,20,25,0.85)', color: e.color, border: `1px solid ${e.color}` }}>
                      {e.kind} {e.dur.toFixed(1)}s
                    </span>
                  ))}
                </div>
              );
            })()}
          </div>
          <div className="bg-black/70 p-2 rounded pointer-events-auto text-xs border border-purple-700">
            <div className="text-purple-200 font-bold">{world.current.zone === 'dungeon' ? `Dungeon F${world.current.floor} (${world.current.maze?.type || ''})` : world.current.zone === 'starting' ? 'Starting Field' : INTERIORS[world.current.zone] ? INTERIORS[world.current.zone].name : 'Hub Plaza'}</div>
            <div className="text-slate-300 mt-1">WASD move · J/click attack · 1-7 attr · QERFG aff</div>
            <div className="text-slate-300">TAB inv · C stats · L loadout · SPACE interact</div>
            <button onClick={() => setModal('loadout')}
              className="mt-2 px-2 py-1 bg-purple-700 hover:bg-purple-600 rounded font-bold">Loadout (L)</button>
          </div>
        </div>
      </div>
    );
  }
  function Bar({ label, val, max, color }) {
    return (
      <div className="mb-1">
        <div className="flex justify-between text-xs"><span>{label}</span><span>{Math.floor(val)}/{max}</span></div>
        <div className="h-2 bg-slate-700 rounded">
          <div className="h-2 rounded" style={{ width: `${Math.max(0, (val / max) * 100)}%`, background: color }} />
        </div>
      </div>
    );
  }
  function HotkeyBar() {
    if (!char) return null;
    const eqAttrs = char.equippedAttrs || [];
    const eqAbils = char.equippedAbilityList || [];
    const cds = (world.current.player && world.current.player.cooldowns) || {};
    const slots = [];
    for (let i = 0; i < MAX_EQUIPPED_ATTRS; i++) {
      const k = eqAttrs[i];
      if (k && ATTRS[k]) slots.push({ key: `${i + 1}`, label: ATTRS[k].n, grade: char.attrs.find(a => a.key === k)?.grade, color: '#fbc02d', cdKey: 'attr_' + k, cdTotal: ATTRS[k].cd || 3 });
      else slots.push(null);
    }
    const letters = ['Q','E','R','F','G'];
    for (let i = 0; i < MAX_EQUIPPED_ABILITIES; i++) {
      const e = eqAbils[i];
      if (e) {
        const color = e.isSub ? SUB_COLOR[e.aff] : AFFS[e.aff]?.color;
        const list = e.isSub ? (SUB_ABILITIES[e.aff] || []) : (ABILITIES[e.aff] || []);
        const ab = list.find(a => a.n === e.name);
        slots.push({ key: letters[i], label: e.name, color, cdKey: 'abil_' + e.aff + '_' + e.name, cdTotal: (ab && ab.cd) || 3 });
      } else slots.push({ key: letters[i], label: '—', color: '#444' });
    }
    return (
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none flex-wrap justify-center max-w-full">
        {slots.map((s, i) => {
          const rem = s?.cdKey ? (cds[s.cdKey] || 0) : 0;
          const frac = rem > 0 && s?.cdTotal ? Math.max(0, Math.min(1, rem / s.cdTotal)) : 0;
          return (
            <div key={i} className="relative bg-black/80 border border-slate-600 rounded w-20 h-16 p-1 text-xs text-white text-center overflow-hidden">
              <div className="text-slate-400 text-xs">[{s?.key || '-'}]</div>
              <div className="text-xs truncate" style={{ color: s?.color || '#444' }}>{s?.label || '·'}</div>
              {s?.grade && <div className={`text-xs ${gradeColor(s.grade)}`}>{s.grade}</div>}
              {rem > 0 && (
                <div className="absolute inset-0 flex items-center justify-center"
                  style={{ background: `conic-gradient(rgba(20,20,30,0.78) ${frac * 360}deg, rgba(0,0,0,0) 0deg)` }}>
                  <span className="text-white font-bold text-sm" style={{ textShadow: '0 0 3px #000' }}>{rem.toFixed(1)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function SettingsModal() {
    const [view, setView] = useState('main'); // main | account | delete
    const [confirmText, setConfirmText] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);

    async function doSaveExit() {
      setBusy(true);
      await saveCharacter();
      setModal(null);
      setScreen('login');
      setChar(null);
      setAccount(null);
    }

    async function doDelete() {
      setErr('');
      if (confirmText.trim().toUpperCase() !== 'DELETE') { setErr('Type DELETE to confirm.'); return; }
      if (!confirmPw) { setErr('Enter your password to confirm.'); return; }
      setBusy(true);
      const ok = await SaveAdapter.verifyPassword(account.username, confirmPw);
      if (!ok) { setErr('Incorrect password.'); setBusy(false); return; }
      await SaveAdapter.deleteCharacter(account.username);
      setModal(null);
      setChar(null);
      setScreen('create');
    }

    return (
      <ModalBox title="Settings" onClose={() => setModal(null)}>
        {view === 'main' && (
          <div className="space-y-3">
            <p className="text-slate-400 text-sm">Manage your game session and account.</p>
            <button onClick={doSaveExit} disabled={busy}
              className="w-full py-3 bg-blue-700 hover:bg-blue-600 rounded font-bold flex items-center justify-center gap-2">
              💾 Save &amp; Exit to Login
            </button>
            <button onClick={() => { setView('account'); setErr(''); }}
              className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded font-bold flex items-center justify-center gap-2">
              👤 Account
            </button>
            <div className="text-xs text-slate-500 pt-2 border-t border-slate-700">
              Your progress saves automatically when you exit here.
            </div>
          </div>
        )}

        {view === 'account' && (
          <div className="space-y-4">
            <button onClick={() => setView('main')} className="text-purple-300 hover:text-purple-200 text-sm">← Back to Settings</button>
            <div className="bg-slate-900 rounded p-3 space-y-2">
              <div className="text-purple-300 font-bold">Account Details</div>
              <div className="flex justify-between"><span className="text-slate-400">Username</span><span className="font-mono">{account?.username}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Password</span>
                <span className="font-mono flex items-center">
                  <span>••••••••</span>
                </span>
              </div>
              <p className="text-xs text-slate-500">
                For security, your password is stored hashed and can't be shown in plain text. If you've forgotten it, you'd need to delete this character and start a new account. Keep it somewhere safe.
              </p>
            </div>
            <div className="bg-red-950/40 border border-red-800 rounded p-3 space-y-2">
              <div className="text-red-300 font-bold">Danger Zone</div>
              <p className="text-xs text-slate-400">Deleting your character permanently erases all progress, items, weapons, and armor. This cannot be undone.</p>
              <button onClick={() => { setView('delete'); setErr(''); setConfirmText(''); setConfirmPw(''); }}
                className="w-full py-2 bg-red-800 hover:bg-red-700 rounded font-bold">
                🗑 Delete Character
              </button>
            </div>
          </div>
        )}

        {view === 'delete' && (
          <div className="space-y-4">
            <button onClick={() => setView('account')} className="text-purple-300 hover:text-purple-200 text-sm">← Cancel</button>
            <div className="bg-red-950/40 border border-red-800 rounded p-4 space-y-3">
              <div className="text-red-300 font-bold text-lg">Are you absolutely sure?</div>
              <p className="text-sm text-slate-300">
                This will permanently delete <span className="font-bold">{char?.name || 'your character'}</span> and all progress. There is no way to recover it.
              </p>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Type <span className="text-red-300 font-bold">DELETE</span> to confirm</label>
                <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="DELETE"
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-600 focus:border-red-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Enter your password</label>
                <input value={confirmPw} onChange={e => setConfirmPw(e.target.value)} type="password" placeholder="Password"
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-600 focus:border-red-500 outline-none" />
              </div>
              {err && <div className="text-red-400 text-sm">{err}</div>}
              <button onClick={doDelete} disabled={busy}
                className="w-full py-2 bg-red-700 hover:bg-red-600 rounded font-bold disabled:opacity-50">
                {busy ? 'Deleting…' : 'Permanently Delete Character'}
              </button>
            </div>
          </div>
        )}
      </ModalBox>
    );
  }

  function ModalBox({ title, onClose, children }) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 text-white rounded-lg p-4 w-full max-w-2xl border border-purple-700 flex flex-col" style={{ maxHeight: '90vh' }}>
          <div className="flex justify-between items-center mb-3 border-b border-slate-700 pb-2 shrink-0">
            <h2 className="text-xl font-bold">{title}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
          </div>
          <div className="overflow-y-auto flex-1 pr-1">{children}</div>
        </div>
      </div>
    );
  }

  function StatsModal() {
    return (
      <ModalBox title="Character Stats" onClose={() => setModal(null)}>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="font-bold text-purple-300 mb-1">{char.name}</div>
            <div>Level: {char.level}</div>
            <div>EXP: {Math.floor(char.exp)}/{expForLevel(char.level)}</div>
            <div>HP: {Math.floor(char.hp)}/{char.maxHp}</div>
            <div>Mana: {Math.floor(char.mana)}/{char.maxMana}</div>
            <div>Energy: {Math.floor(char.energy)}/{char.maxEnergy}</div>
            <div>Weapon: <span className="text-yellow-300">{WEAPONS[char.weapon]?.n}</span></div>
            <div>Coins: {char.coins}</div>
            <div>Floor unlocked: {char.unlockedFloor}</div>
            <div>Weapons owned: {char.ownedWeapons?.length || 1}</div>
          </div>
          <div>
            <div className="font-bold text-purple-300 mb-1">Attributes ({char.attrs.length}/{MAX_LEARNED_ATTRS})</div>
            {char.attrs.map((a, i) => (
              <div key={i} className="mb-1">
                <span className={gradeColor(a.grade)}>[{a.grade}]</span> <span>{ATTRS[a.key]?.n}</span>
                <div className="text-xs text-slate-400">{ATTRS[a.key]?.d}</div>
              </div>
            ))}
            <div className="font-bold text-purple-300 mb-1 mt-2">Affinities</div>
            {Object.entries(char.affinities).map(([k, v]) => (
              <div key={k} className="mb-2">
                <div style={{ color: AFFS[k]?.color || SUB_COLOR[k] }}>{k} · Lv {v.level} ({v.exp}/{affinityExpForLevel(v.level)})</div>
                {v.sub && <div className="text-xs ml-3" style={{ color: SUB_COLOR[v.sub] }}>↳ {v.sub} · Lv {v.subLevel} ({v.subExp}/{affinityExpForLevel(v.subLevel)})</div>}
              </div>
            ))}
          </div>
        </div>
      </ModalBox>
    );
  }

  function LoadoutModal() {
    const c = char; if (!c) return null;
    const tab = loadoutTab;
    function toggleAttr(key) {
      const eq = [...(c.equippedAttrs || [])];
      const idx = eq.indexOf(key);
      if (idx >= 0) eq.splice(idx, 1);
      else { if (eq.length >= MAX_EQUIPPED_ATTRS) { setMsg(`You can only equip ${MAX_EQUIPPED_ATTRS} attributes`); return; } eq.push(key); }
      c.equippedAttrs = eq; setChar({ ...c });
    }
    function toggleAbility(entry) {
      const eq = [...(c.equippedAbilityList || [])];
      const idx = eq.findIndex(e => e.name === entry.name && e.aff === entry.aff);
      if (idx >= 0) eq.splice(idx, 1);
      else { if (eq.length >= MAX_EQUIPPED_ABILITIES) { setMsg(`You can only equip ${MAX_EQUIPPED_ABILITIES} abilities`); return; } eq.push(entry); }
      c.equippedAbilityList = eq; setChar({ ...c });
    }
    const knownAbilityEntries = [];
    for (const [aff, names] of Object.entries(c.knownAbilities || {})) {
      const isSub = !!SUB_ABILITIES[aff];
      for (const name of names) {
        const list = isSub ? (SUB_ABILITIES[aff] || []) : (ABILITIES[aff] || []);
        const data = list.find(a => a.n === name);
        if (!data) continue;
        knownAbilityEntries.push({ aff, name, isSub, lvl: data.lvl, d: data.d, m: data.m, k: data.k });
      }
    }
    knownAbilityEntries.sort((a, b) => a.aff.localeCompare(b.aff) || a.lvl - b.lvl);
    return (
      <ModalBox title="Loadout" onClose={() => setModal(null)}>
        <div className="flex gap-2 mb-3">
          <button onClick={() => setLoadoutTab('abilities')}
            className={`px-3 py-1 rounded ${tab === 'abilities' ? 'bg-purple-700' : 'bg-slate-700'}`}>
            Affinity Abilities ({(c.equippedAbilityList || []).length}/{MAX_EQUIPPED_ABILITIES})
          </button>
          <button onClick={() => setLoadoutTab('attrs')}
            className={`px-3 py-1 rounded ${tab === 'attrs' ? 'bg-purple-700' : 'bg-slate-700'}`}>
            Attributes ({(c.equippedAttrs || []).length}/{MAX_EQUIPPED_ATTRS})
          </button>
        </div>
        {tab === 'abilities' && (
          <>
            <p className="text-xs text-slate-400 mb-2">Order matters: slot 1 = Q, 2 = E, 3 = R, 4 = F, 5 = G.</p>
            <div className="mb-3">
              <div className="text-purple-300 text-sm font-bold mb-1">Equipped (in order)</div>
              <div className="flex flex-col gap-1">
                {(c.equippedAbilityList || []).map((e, i) => {
                  const color = e.isSub ? SUB_COLOR[e.aff] : AFFS[e.aff]?.color;
                  return (
                    <div key={i} className="bg-slate-900 px-2 py-1 rounded flex justify-between items-center">
                      <span>
                        <span className="text-slate-400">[{['Q','E','R','F','G'][i]}]</span>{' '}
                        <strong style={{ color }}>{e.name}</strong>{' '}
                        <span className="text-xs text-slate-400">({e.aff})</span>
                      </span>
                      <button onClick={() => toggleAbility(e)} className="bg-red-700 hover:bg-red-600 rounded px-2 py-0.5 text-xs">Unequip</button>
                    </div>
                  );
                })}
                {(c.equippedAbilityList || []).length === 0 && <div className="text-slate-500 text-xs italic">Nothing equipped.</div>}
              </div>
            </div>
            <div className="text-purple-300 text-sm font-bold mb-1 flex items-center justify-between">
              <span>Known ({knownAbilityEntries.length} abilities across {Object.keys(c.knownAbilities || {}).length} affinities)</span>
              <select value={loadoutAffFilter} onChange={e => setLoadoutAffFilter(e.target.value)}
                className="bg-slate-900 text-white text-xs px-2 py-1 rounded border border-slate-600">
                <option>All</option>
                {Object.keys(c.knownAbilities || {}).sort().map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              {(() => {
                // Filter by affinity and group with section headers so even KISHEL_DEV's
                // ~160 abilities are findable. Items render inside the modal's scroll.
                const filtered = loadoutAffFilter === 'All'
                  ? knownAbilityEntries
                  : knownAbilityEntries.filter(e => e.aff === loadoutAffFilter);
                const groups = {};
                for (const e of filtered) (groups[e.aff] = groups[e.aff] || []).push(e);
                const out = [];
                let key = 0;
                for (const aff of Object.keys(groups).sort()) {
                  const headColor = AFFS[aff]?.color || SUB_COLOR[aff] || '#bdbdbd';
                  out.push(<div key={'h'+key++} className="text-xs font-bold mt-2 mb-0.5 pl-1" style={{ color: headColor }}>{aff} ({groups[aff].length})</div>);
                  for (const e of groups[aff]) {
                    const equipped = (c.equippedAbilityList || []).some(x => x.name === e.name && x.aff === e.aff);
                    const color = e.isSub ? SUB_COLOR[e.aff] : AFFS[e.aff]?.color;
                    out.push(
                      <div key={'e'+key++} className="bg-slate-900 px-2 py-1 rounded flex justify-between items-center">
                        <span>
                          <strong style={{ color }}>{e.name}</strong>{' '}
                          <span className="text-xs text-slate-400">(lv{e.lvl} · {e.d}dmg · {e.m}mp · {abilityTypeLabel(e.k)})</span>
                        </span>
                        <button onClick={() => toggleAbility(e)}
                          className={`rounded px-2 py-0.5 text-xs ${equipped ? 'bg-slate-700 text-slate-400' : 'bg-green-700 hover:bg-green-600'}`}>
                          {equipped ? 'Equipped' : 'Equip'}
                        </button>
                      </div>
                    );
                  }
                }
                if (!filtered.length) out.push(<div key="empty" className="text-slate-500 text-xs italic">No abilities for this filter.</div>);
                return out;
              })()}
            </div>
          </>
        )}
        {tab === 'attrs' && (
          <>
            <p className="text-xs text-slate-400 mb-2">Active attributes map to keys 1-7 in order.</p>
            <div className="text-purple-300 text-sm font-bold mb-1">Equipped</div>
            <div className="flex flex-col gap-1 mb-3">
              {(c.equippedAttrs || []).map((key, i) => {
                const a = ATTRS[key]; const meta = c.attrs.find(at => at.key === key);
                if (!a) return null;
                return (
                  <div key={i} className="bg-slate-900 px-2 py-1 rounded flex justify-between items-center">
                    <span>
                      <span className="text-slate-400">[{i + 1}]</span>{' '}
                      <span className={gradeColor(meta?.grade)}>[{meta?.grade}]</span>{' '}
                      <strong>{a.n}</strong>{' '}
                      <span className="text-xs text-slate-400">— {a.d}</span>
                    </span>
                    <button onClick={() => toggleAttr(key)} className="bg-red-700 hover:bg-red-600 rounded px-2 py-0.5 text-xs">Unequip</button>
                  </div>
                );
              })}
              {(c.equippedAttrs || []).length === 0 && <div className="text-slate-500 text-xs italic">Nothing equipped.</div>}
            </div>
            <div className="text-purple-300 text-sm font-bold mb-1">Known</div>
            <div className="flex flex-col gap-1">
              {c.attrs.map((meta, i) => {
                const a = ATTRS[meta.key]; if (!a) return null;
                const equipped = (c.equippedAttrs || []).includes(meta.key);
                return (
                  <div key={i} className="bg-slate-900 px-2 py-1 rounded flex justify-between items-center">
                    <span>
                      <span className={gradeColor(meta.grade)}>[{meta.grade}]</span>{' '}
                      <strong>{a.n}</strong>{' '}
                      <span className="text-xs text-slate-400">— {a.d}</span>
                    </span>
                    <button onClick={() => toggleAttr(meta.key)}
                      className={`rounded px-2 py-0.5 text-xs ${equipped ? 'bg-slate-700 text-slate-400' : 'bg-green-700 hover:bg-green-600'}`}>
                      {equipped ? 'Equipped' : 'Equip'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </ModalBox>
    );
  }

  function InventoryModal() {
    return (
      <ModalBox title={`Inventory (${char.inventory.length}/20)`} onClose={() => setModal(null)}>
        <div className="text-yellow-400 mb-2">🪙 {char.coins} coins</div>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 20 }).map((_, i) => {
            const item = char.inventory[i];
            return (
              <div key={i} className="bg-slate-900 rounded p-2 h-20 text-xs border border-slate-700 flex flex-col justify-between">
                {item ? (
                  <>
                    <div>
                      <div className={`font-bold ${gradeColor(item.grade)}`}>[{item.grade}]{(item.qty || 1) > 1 && <span className="text-white"> ×{item.qty}</span>}</div>
                      <div className="truncate">{item.name}</div>
                    </div>
                    <div className="flex gap-1">
                      {!item.isTrophy && <button onClick={() => useItem(i)} className="flex-1 bg-green-700 hover:bg-green-600 rounded px-1">Use</button>}
                      <button onClick={() => dropItem(i)} className="flex-1 bg-red-700 hover:bg-red-600 rounded px-1">Drop</button>
                    </div>
                  </>
                ) : <div className="text-slate-600 text-center my-auto">·</div>}
              </div>
            );
          })}
        </div>
      </ModalBox>
    );
  }

  function ShopModal() {
    const tab = shopTab; const setTab = setShopTab;
    const buyItems = Object.entries(ITEMS).filter(([k, v]) => v.shopSells);
    return (
      <ModalBox title="Krezcent Bazaar" onClose={() => setModal(null)}>
        <div className="flex gap-2 mb-3">
          <button onClick={() => setTab('buy')} className={`px-3 py-1 rounded ${tab === 'buy' ? 'bg-purple-700' : 'bg-slate-700'}`}>Buy</button>
          <button onClick={() => setTab('sell')} className={`px-3 py-1 rounded ${tab === 'sell' ? 'bg-purple-700' : 'bg-slate-700'}`}>Sell</button>
          <div className="ml-auto text-yellow-400">🪙 {char.coins}</div>
        </div>
        {tab === 'buy' && (
          <div className="grid grid-cols-2 gap-2">
            {buyItems.map(([k, v]) => (
              <div key={k} className="bg-slate-900 p-2 rounded">
                <div className={`font-bold ${gradeColor(v.g)}`}>[{v.g}] {v.n}</div>
                <div className="text-xs text-slate-400">{v.desc}</div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-yellow-400">🪙 {v.price}</span>
                  <button onClick={() => {
                    if (char.coins < v.price) { setMsg('Not enough coins'); return; }
                    const cap = MAX_STACK || 99;
                    const hasRoom = char.inventory.length < 20 || (v.stack && char.inventory.some(s => s.key === k && !s.isTrophy && (s.qty || 1) < cap));
                    if (!hasRoom) { setMsg('Inventory full'); return; }
                    char.coins -= v.price;
                    addItemToInventory({ key: k, name: v.n, grade: v.g });
                  }} className="px-2 py-1 bg-green-700 hover:bg-green-600 rounded text-xs">Buy</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'sell' && (
          <div className="grid grid-cols-2 gap-2">
            {char.inventory.map((item, i) => {
              const value = item.isTrophy ? MONSTER_DROP_VALUE[item.grade] : Math.floor((ITEMS[item.key]?.price || 5) * 0.5);
              return (
                <div key={i} className="bg-slate-900 p-2 rounded">
                  <div className={`font-bold ${gradeColor(item.grade)}`}>[{item.grade}] {item.name}{(item.qty || 1) > 1 && <span className="text-white"> ×{item.qty}</span>}</div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-yellow-400">🪙 {value}</span>
                    <button onClick={() => {
                      char.coins += value;
                      if ((item.qty || 1) > 1) { item.qty -= 1; char.inventory = [...char.inventory]; }
                      else char.inventory = char.inventory.filter((_, j) => j !== i);
                      setChar({ ...char });
                    }} className="px-2 py-1 bg-yellow-700 hover:bg-yellow-600 rounded text-xs">Sell</button>
                  </div>
                </div>
              );
            })}
            {char.inventory.length === 0 && <div className="col-span-2 text-slate-400 text-center py-4">Nothing to sell</div>}
          </div>
        )}
      </ModalBox>
    );
  }

  function DungeonSelectModal() {
    return (
      <ModalBox title="Choose a Floor" onClose={() => setModal(null)}>
        <p className="text-sm text-slate-400 mb-3">Unlocked: {char.unlockedFloor}. 100 unique floors — each with its own theme, hazards, and a boss with a distinct fighting style.</p>
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: 100 }).map((_, i) => {
            const f = i + 1;
            const locked = f > char.unlockedFloor;
            const isBoss = f % 10 === 0;
            return (
              <button key={f} disabled={locked}
                title={locked ? `Floor ${f} (locked)` : `F${f}: ${floorTheme(f).name}`}
                onClick={() => { world.current.floor = f; char.currentFloor = f; setModal(null); enterZone('dungeon'); }}
                className={`text-xs py-2 rounded ${locked ? 'bg-slate-800 text-slate-600' : isBoss ? 'bg-yellow-700 hover:bg-yellow-600' : f <= 10 ? 'bg-green-900 hover:bg-green-700' : f <= 30 ? 'bg-blue-900 hover:bg-blue-700' : f <= 60 ? 'bg-purple-900 hover:bg-purple-700' : f <= 90 ? 'bg-red-900 hover:bg-red-700' : 'bg-pink-900 hover:bg-pink-700'}`}>
                {locked ? '🔒' : isBoss ? '★' + f : f}
              </button>
            );
          })}
        </div>
      </ModalBox>
    );
  }

  function PvPModal() {
    const opponent = pvpOpp; const setOpponent = setPvpOpp;
    function genOpp() {
      const lv = clamp(char.level + Math.floor((rand() - 0.5) * 4), 1, 100);
      return { name: pick(['Riven','Kael','Zara','Mira','Thane','Ivy','Soren','Lyra']), level: lv };
    }
    function findOpponent() {
      const fee = Math.floor(char.coins * 0.10);
      char.coins -= fee;
      setChar({ ...char });
      setMsg(`Entry fee paid: -${fee} coins (10%).`);
      setOpponent(genOpp());
    }
    function fight(opp) {
      const myPower = char.level * 100 + Object.values(char.affinities).reduce((s, a) => s + a.level * 10, 0);
      const oppPower = opp.level * 100;
      const myRoll = myPower * (0.7 + rand() * 0.6);
      const oppRoll = oppPower * (0.7 + rand() * 0.6);
      if (myRoll > oppRoll) {
        const win = Math.floor(char.coins * 0.20);
        char.coins += win; grantExp(opp.level * 10);
        setMsg(`Victory vs ${opp.name}! +${win} coins (20%)`);
      } else {
        const loss = Math.floor(char.coins * 0.05);
        char.coins -= loss; char.hp = Math.max(1, Math.floor(char.hp / 2));
        setMsg(`Defeated by ${opp.name}. -${loss} coins (5%), lost half HP`);
      }
      setChar({ ...char }); setOpponent(null);
    }
    return (
      <ModalBox title="PvP Arena (vs AI)" onClose={() => setModal(null)}>
        {!opponent ? (
          <button onClick={findOpponent}
            className="w-full py-2 bg-red-700 hover:bg-red-600 rounded font-bold">Find Opponent (−10% coins entry fee)</button>
        ) : (
          <div className="bg-slate-900 p-3 rounded">
            <div className="text-lg font-bold">{opponent.name}</div>
            <div className="text-slate-400">Level {opponent.level}</div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => fight(opponent)} className="flex-1 py-2 bg-red-700 hover:bg-red-600 rounded">Fight</button>
              <button onClick={() => setOpponent(null)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded">Flee</button>
            </div>
          </div>
        )}
      </ModalBox>
    );
  }

  function BlacksmithModal() {
    const c = char;
    const [bsTab, setBsTab] = useState('weapons');
    return (
      <ModalBox title="Blacksmith" onClose={() => setModal(null)}>
        <div className="text-yellow-400 mb-3">🪙 {c.coins} coins</div>
        <div className="flex gap-2 mb-4">
          <button onClick={() => setBsTab('weapons')}
            className={`flex-1 py-2 rounded font-bold ${bsTab === 'weapons' ? 'bg-orange-700' : 'bg-slate-700 hover:bg-slate-600'}`}>⚔ Weapons</button>
          <button onClick={() => setBsTab('armor')}
            className={`flex-1 py-2 rounded font-bold ${bsTab === 'armor' ? 'bg-sky-700' : 'bg-slate-700 hover:bg-slate-600'}`}>🛡 Armor</button>
        </div>
        {bsTab === 'weapons' && <BlacksmithWeapons c={c} />}
        {bsTab === 'armor' && <BlacksmithArmor c={c} />}
      </ModalBox>
    );
  }

  function BlacksmithWeapons({ c }) {
    return (
      <>
        <div className="text-sm text-slate-400 mb-2">Equipped: <span className="text-yellow-300">{WEAPONS[c.weapon]?.n}</span></div>
        <div className="text-purple-300 font-bold mb-2">Your Collection</div>
        <div className="text-xs text-slate-400 mb-2">Upgrade weapons up to level {MAX_WEAPON_LEVEL}. Each level multiplies damage; stronger weapons cost far more to level.</div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(c.ownedWeapons || []).map(wk => {
            const w = WEAPONS[wk]; if (!w) return null;
            const equipped = c.weapon === wk;
            const lvl = (c.weaponLevels && c.weaponLevels[wk]) || 1;
            const curDmg = Math.round(weaponDamageAt(wk, lvl));
            const maxed = lvl >= MAX_WEAPON_LEVEL;
            const upCost = maxed ? null : weaponUpgradeCost(wk, lvl);
            const nextDmg = maxed ? curDmg : Math.round(weaponDamageAt(wk, lvl + 1));
            return (
              <div key={wk} className="bg-slate-900 p-2 rounded">
                <div className="flex justify-between items-baseline">
                  <span className="font-bold">{w.n}</span>
                  <span className={`text-xs ${maxed ? 'text-yellow-300' : 'text-slate-400'}`}>Lv {lvl}/{MAX_WEAPON_LEVEL}</span>
                </div>
                <div className="text-xs text-slate-400">{w.style}</div>
                <div className="text-xs mt-1">Dmg <span className="text-orange-300 font-bold">{curDmg}</span> · Spd {w.spd}{w.ranged ? ' · Ranged' : ''}</div>
                {/* level pips */}
                <div className="flex gap-0.5 mt-1">
                  {Array.from({ length: MAX_WEAPON_LEVEL }).map((_, i) => (
                    <div key={i} className={`h-1.5 flex-1 rounded ${i < lvl ? 'bg-orange-400' : 'bg-slate-700'}`} />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-1 mt-2">
                  <button onClick={() => { c.weapon = wk; setChar({ ...c }); setMsg(`Equipped ${w.n}`); }}
                    disabled={equipped}
                    className={`text-xs py-1 rounded ${equipped ? 'bg-slate-700 text-slate-400' : 'bg-green-700 hover:bg-green-600'}`}>
                    {equipped ? 'Equipped' : 'Equip'}
                  </button>
                  <button onClick={() => {
                    if (maxed) { setMsg('Already at max level'); return; }
                    if (c.coins < upCost) { setMsg(`Need 🪙 ${upCost} to upgrade`); return; }
                    c.coins -= upCost;
                    c.weaponLevels = c.weaponLevels || {};
                    c.weaponLevels[wk] = lvl + 1;
                    setChar({ ...c });
                    AudioMgr.play('levelup');
                    setMsg(`${w.n} upgraded to Lv ${lvl + 1}! (Dmg ${curDmg} → ${nextDmg})`);
                  }} disabled={maxed}
                    className={`text-xs py-1 rounded ${maxed ? 'bg-yellow-800 text-yellow-300' : 'bg-orange-700 hover:bg-orange-600'}`}>
                    {maxed ? 'MAX' : `↑ 🪙${upCost}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-purple-300 font-bold mb-2">Buy from the Forge</div>
        <div className="grid grid-cols-2 gap-2">
          {WEAPON_SHOP.map(s => {
            const w = WEAPONS[s.key]; if (!w) return null;
            const owned = (c.ownedWeapons || []).includes(s.key);
            return (
              <div key={s.key} className="bg-slate-900 p-2 rounded">
                <div className="font-bold">{w.n}</div>
                <div className="text-xs text-slate-400">{w.style}</div>
                <div className="text-xs mt-1">Dmg {Math.round(weaponDamageAt(s.key, 1))} <span className="text-slate-500">→ {Math.round(weaponDamageAt(s.key, MAX_WEAPON_LEVEL))} @Lv{MAX_WEAPON_LEVEL}</span> · Spd {w.spd}</div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-yellow-400">🪙 {s.price}</span>
                  <button onClick={() => {
                    if (owned) { setMsg('Already owned'); return; }
                    if (c.coins < s.price) { setMsg('Not enough coins'); return; }
                    c.coins -= s.price;
                    c.ownedWeapons.push(s.key);
                    c.weaponLevels = c.weaponLevels || {}; c.weaponLevels[s.key] = c.weaponLevels[s.key] || 1;
                    setMsg(`Bought ${w.n}!`);
                  }} disabled={owned}
                    className={`text-xs py-1 px-2 rounded ${owned ? 'bg-slate-700 text-slate-400' : 'bg-green-700 hover:bg-green-600'}`}>
                    {owned ? 'Owned' : 'Buy'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  function BlacksmithArmor({ c }) {
    return (
      <>
        <div className="text-sm text-slate-400 mb-2">Equipped: <span className="text-sky-300">{c.armor ? ARMORS[c.armor]?.n : 'None'}</span></div>
        <div className="text-purple-300 font-bold mb-2">Your Armor</div>
        <div className="text-xs text-slate-400 mb-2">Armor reduces incoming damage (capped, so dodging still matters). Heavy armor protects more but slows you slightly. Upgrade up to level {MAX_ARMOR_LEVEL}.</div>
        {(c.ownedArmors || []).length === 0 && (
          <div className="text-xs text-slate-500 mb-3 italic">You own no armor yet. Buy some from the forge below or find it (rarely) in the dungeon.</div>
        )}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(c.ownedArmors || []).map(ak => {
            const a = ARMORS[ak]; if (!a) return null;
            const equipped = c.armor === ak;
            const lvl = (c.armorLevels && c.armorLevels[ak]) || 1;
            const curRed = Math.round(armorReductionAt(ak, lvl) * 100);
            const maxed = lvl >= MAX_ARMOR_LEVEL;
            const upCost = maxed ? null : armorUpgradeCost(ak, lvl);
            const nextRed = maxed ? curRed : Math.round(armorReductionAt(ak, lvl + 1) * 100);
            return (
              <div key={ak} className="bg-slate-900 p-2 rounded">
                <div className="flex justify-between items-baseline">
                  <span className="font-bold" style={{ color: a.color }}>{a.n}</span>
                  <span className={`text-xs ${maxed ? 'text-yellow-300' : 'text-slate-400'}`}>Lv {lvl}/{MAX_ARMOR_LEVEL}</span>
                </div>
                <div className="text-xs text-slate-400 capitalize">{a.type}{a.moveMod < 1 ? ` · ${Math.round((1 - a.moveMod) * 100)}% slower` : (a.moveMod > 1 ? ` · ${Math.round((a.moveMod - 1) * 100)}% faster` : '')}</div>
                <div className="text-xs mt-1">Reduces dmg <span className="text-sky-300 font-bold">{curRed}%</span></div>
                <div className="flex gap-0.5 mt-1">
                  {Array.from({ length: MAX_ARMOR_LEVEL }).map((_, i) => (
                    <div key={i} className={`h-1.5 flex-1 rounded ${i < lvl ? 'bg-sky-400' : 'bg-slate-700'}`} />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-1 mt-2">
                  <button onClick={() => { c.armor = equipped ? null : ak; setChar({ ...c }); setMsg(equipped ? 'Unequipped armor' : `Equipped ${a.n}`); }}
                    className={`text-xs py-1 rounded ${equipped ? 'bg-sky-800 text-sky-200' : 'bg-green-700 hover:bg-green-600'}`}>
                    {equipped ? 'Unequip' : 'Equip'}
                  </button>
                  <button onClick={() => {
                    if (maxed) { setMsg('Already at max level'); return; }
                    if (c.coins < upCost) { setMsg(`Need 🪙 ${upCost} to upgrade`); return; }
                    c.coins -= upCost;
                    c.armorLevels = c.armorLevels || {};
                    c.armorLevels[ak] = lvl + 1;
                    setChar({ ...c });
                    AudioMgr.play('levelup');
                    setMsg(`${a.n} upgraded to Lv ${lvl + 1}! (${curRed}% → ${nextRed}% reduction)`);
                  }} disabled={maxed}
                    className={`text-xs py-1 rounded ${maxed ? 'bg-yellow-800 text-yellow-300' : 'bg-sky-700 hover:bg-sky-600'}`}>
                    {maxed ? 'MAX' : `↑ 🪙${upCost}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-purple-300 font-bold mb-2">Buy from the Forge</div>
        <div className="grid grid-cols-2 gap-2">
          {ARMOR_SHOP.map(s => {
            const a = ARMORS[s.key]; if (!a) return null;
            const owned = (c.ownedArmors || []).includes(s.key);
            return (
              <div key={s.key} className="bg-slate-900 p-2 rounded">
                <div className="font-bold" style={{ color: a.color }}>{a.n}</div>
                <div className="text-xs text-slate-400 capitalize">{a.type} armor</div>
                <div className="text-xs mt-1">Reduces {Math.round(armorReductionAt(s.key, 1) * 100)}% <span className="text-slate-500">→ {Math.round(armorReductionAt(s.key, MAX_ARMOR_LEVEL) * 100)}% @Lv{MAX_ARMOR_LEVEL}</span></div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-yellow-400">🪙 {s.price}</span>
                  <button onClick={() => {
                    if (owned) { setMsg('Already owned'); return; }
                    if (c.coins < s.price) { setMsg('Not enough coins'); return; }
                    c.coins -= s.price;
                    c.ownedArmors = [...(c.ownedArmors || []), s.key];
                    c.armorLevels = c.armorLevels || {}; c.armorLevels[s.key] = 1;
                    setChar({ ...c });
                    setMsg(`Bought ${a.n}!`);
                  }} disabled={owned}
                    className={`text-xs py-1 px-2 rounded ${owned ? 'bg-slate-700 text-slate-400' : 'bg-green-700 hover:bg-green-600'}`}>
                    {owned ? 'Owned' : 'Buy'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }
  function TrainerModal() {
    const c = char; const g = trainerGrade; const cfg = ATTRIBUTE_TRAINER[g];
    const knownKeys = (c.attrs || []).map(a => a.key);
    function buyTraining() {
      if (c.attrs.length >= MAX_LEARNED_ATTRS) { setMsg('You already know the max number of attributes'); return; }
      if (c.coins < cfg.price) { setMsg('Not enough coins'); return; }
      const key = pickAttrByGrade(g, knownKeys);
      if (!key || knownKeys.includes(key)) { setMsg('No new attribute of that grade available — pick a different grade'); return; }
      c.coins -= cfg.price;
      c.attrs = [...c.attrs, { key, grade: g }];
      setChar({ ...c });
      setMsg(`Learned: ${ATTRS[key]?.n} (${g})`);
    }
    return (
      <ModalBox title="Attribute Trainer" onClose={() => setModal(null)}>
        <div className="text-yellow-400 mb-3">🪙 {c.coins} · Known: {c.attrs.length}/{MAX_LEARNED_ATTRS}</div>
        <p className="text-sm text-slate-400 mb-3">Pay to learn a random new attribute at a chosen grade.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {Object.keys(ATTRIBUTE_TRAINER).map(grade => (
            <button key={grade} onClick={() => setTrainerGrade(grade)}
              className={`px-3 py-1 rounded ${g === grade ? 'bg-purple-700' : 'bg-slate-700 hover:bg-slate-600'}`}>
              <span className={gradeColor(grade)}>{grade}</span>
            </button>
          ))}
        </div>
        <div className="bg-slate-900 p-3 rounded mb-3">
          <div className="font-bold mb-1">{cfg.label}</div>
          <div className="text-xs text-slate-400 mb-2">Random attribute of grade <span className={gradeColor(g)}>{g}</span> you don't already know.</div>
          <div className="flex justify-between items-center">
            <span className="text-yellow-400">🪙 {cfg.price}</span>
            <button onClick={buyTraining}
              disabled={c.coins < cfg.price || c.attrs.length >= MAX_LEARNED_ATTRS}
              className={`px-3 py-1 rounded ${c.coins < cfg.price || c.attrs.length >= MAX_LEARNED_ATTRS ? 'bg-slate-700 text-slate-400' : 'bg-green-700 hover:bg-green-600'}`}>
              Train
            </button>
          </div>
        </div>
        <div className="text-purple-300 font-bold mb-1 text-sm">Your Attributes</div>
        <div className="flex flex-col gap-1">
          {c.attrs.map((a, i) => (
            <div key={i} className="bg-slate-900 px-2 py-1 rounded text-sm">
              <span className={gradeColor(a.grade)}>[{a.grade}]</span> <strong>{ATTRS[a.key]?.n}</strong>{' '}
              <span className="text-xs text-slate-400">— {ATTRS[a.key]?.d}</span>
            </div>
          ))}
        </div>
      </ModalBox>
    );
  }

  function MysteryModal() {
    const c = char; const spin = boxSpin;
    function openBox(key) {
      const box = MYSTERY_BOXES[key];
      if (c.coins < box.price) { setMsg('Not enough coins'); return; }
      c.coins -= box.price; setChar({ ...c });
      setBoxSpin({ boxKey: key, phase: 'spin', result: null });
      setTimeout(() => {
        const grade = rollMysteryBoxGrade(box);
        const itemKey = rollItemOfGrade(grade);
        const weaponKey = rollMysteryBoxWeapon(box);
        const results = { grade, items: [] };
        if (itemKey) results.items.push({ kind: 'item', key: itemKey, name: ITEMS[itemKey].n, grade: ITEMS[itemKey].g });
        if (weaponKey) results.items.push({ kind: 'weapon', key: weaponKey, name: WEAPONS[weaponKey].n });
        for (const r of results.items) {
          if (r.kind === 'item') addItemToInventory({ key: r.key, name: r.name, grade: r.grade });
          else if (r.kind === 'weapon') { if (!c.ownedWeapons.includes(r.key)) c.ownedWeapons.push(r.key); c.weaponLevels = c.weaponLevels || {}; c.weaponLevels[r.key] = c.weaponLevels[r.key] || 1; }
        }
        setChar({ ...c });
        setBoxSpin({ boxKey: key, phase: 'reveal', result: results });
      }, 1200);
    }
    function closeReveal() { setBoxSpin(null); }
    return (
      <ModalBox title="Mystery Boxes" onClose={() => { if (!spin || spin.phase !== 'spin') { setBoxSpin(null); setModal(null); } }}>
        <div className="text-yellow-400 mb-3">🪙 {c.coins} coins</div>
        {!spin && (
          <>
            <p className="text-sm text-slate-400 mb-3">Spin the boxes for randomized loot. Pricier boxes have better odds.</p>
            <div className="grid grid-cols-1 gap-2">
              {Object.entries(MYSTERY_BOXES).map(([key, box]) => (
                <div key={key} className="bg-slate-900 p-3 rounded flex items-center gap-3">
                  <div className="w-12 h-12 rounded" style={{ background: box.color, border: '2px solid #fff' }}></div>
                  <div className="flex-1">
                    <div className="font-bold">{box.n}</div>
                    <div className="text-xs text-slate-400">{box.desc}</div>
                    <div className="text-xs mt-1">Grades: {box.itemGrades.map(([g, p]) => `${g}:${Math.round(p * 100)}%`).join(' · ')}</div>
                    {box.weaponPool.length > 0 && (
                      <div className="text-xs text-slate-400">Weapon chance: {Math.round(box.weaponChance * 100)}%</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-yellow-400 mb-1">🪙 {box.price.toLocaleString()}</div>
                    <button onClick={() => openBox(key)} disabled={c.coins < box.price}
                      className={`text-xs py-1 px-3 rounded ${c.coins < box.price ? 'bg-slate-700 text-slate-400' : 'bg-green-700 hover:bg-green-600'}`}>
                      Open
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {spin && spin.phase === 'spin' && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3 animate-spin inline-block">🎰</div>
            <div className="text-lg font-bold">Opening {MYSTERY_BOXES[spin.boxKey].n}...</div>
          </div>
        )}
        {spin && spin.phase === 'reveal' && spin.result && (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✨</div>
            <div className="text-lg font-bold mb-3">You got:</div>
            {spin.result.items.length === 0 ? (
              <div className="text-slate-400">Nothing! Tough luck.</div>
            ) : (
              <div className="space-y-2">
                {spin.result.items.map((r, i) => (
                  <div key={i} className="bg-slate-900 p-2 rounded">
                    {r.kind === 'item' ? (
                      <><span className={gradeColor(r.grade)}>[{r.grade}]</span> <strong>{r.name}</strong></>
                    ) : (
                      <><span className="text-yellow-300">[Weapon]</span> <strong>{r.name}</strong></>
                    )}
                  </div>
                ))}
              </div>
            )}
            <button onClick={closeReveal} className="mt-4 px-4 py-1 bg-purple-700 hover:bg-purple-600 rounded">Continue</button>
          </div>
        )}
      </ModalBox>
    );
  }

  const bossDefeated = world.current?.maze?.boss?.defeated;

  return (
    <div className="w-full h-screen bg-slate-950 text-white overflow-hidden relative" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {screen === 'login' && <LoginScreen />}
      {screen === 'register' && <RegisterScreen />}
      {screen === 'create' && <CharacterCreator />}
      {screen === 'world' && char && (
        <>
          <canvas ref={canvasRef} width={vp.w} height={vp.h}
            onMouseMove={handleMouse}
            onMouseDown={(e) => { handleMouse(e); doBasicAttack(); }}
            className="block" style={{ width: '100vw', height: '100vh', cursor: 'crosshair' }} />
          <HUD />
          <HotkeyBar />
          {world.current.zone === 'dungeon' && (
            <div className="absolute top-4 right-4 flex flex-col gap-2 z-30">
              <button onClick={() => { saveCharacter(); enterZone('hub'); }}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded font-bold text-white border border-red-500 shadow-lg">
                🚪 Leave Dungeon
              </button>
              <button disabled={!bossDefeated || world.current.floor >= 100}
                onClick={() => {
                  saveCharacter();
                  world.current.floor += 1;
                  char.currentFloor = world.current.floor;
                  enterZone('dungeon');
                }}
                className={`px-4 py-2 rounded font-bold text-white border shadow-lg ${bossDefeated && world.current.floor < 100 ? 'bg-green-700 hover:bg-green-600 border-green-500' : 'bg-slate-700 border-slate-600 opacity-60 cursor-not-allowed'}`}>
                ⬇ Next Floor
              </button>
            </div>
          )}
          {modal === 'inventory' && <InventoryModal />}
          {modal === 'stats' && <StatsModal />}
          {modal === 'loadout' && <LoadoutModal />}
          {modal === 'shop' && <ShopModal />}
          {modal === 'dungeon_select' && <DungeonSelectModal />}
          {modal === 'pvp' && <PvPModal />}
          {modal === 'blacksmith' && <BlacksmithModal />}
          {modal === 'trainer' && <TrainerModal />}
          {modal === 'mystery' && <MysteryModal />}
          {modal === 'settings' && <SettingsModal />}
        </>
      )}
      {msg && (
        <div onClick={() => setMsg('')}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-black/85 text-white p-3 rounded border border-purple-500 max-w-md cursor-pointer z-40 text-sm whitespace-pre-wrap">
          {msg}
          <div className="text-xs text-slate-400 mt-1">(click to dismiss)</div>
        </div>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<KrezcentQuest />);