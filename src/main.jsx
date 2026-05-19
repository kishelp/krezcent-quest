import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

import { ATTRS, ATTRS_BY_GRADE } from './data/attributes.js';
import { AFFS, SUB_WEAK, SUB_COLOR, ABILITIES, SUB_ABILITIES } from './data/affinities.js';
import { WEAPONS, STARTER_WEAPONS } from './data/weapons.js';
import { ITEMS, MONSTER_DROP_VALUE, ADMIN_CODES } from './data/items.js';
import { MONSTER_TYPES } from './data/monsters.js';
import { bossForFloor, BOSS_AI_PATTERNS } from './data/bosses.js';
import { MYSTERY_BOXES, ATTRIBUTE_TRAINER, WEAPON_SHOP, rollMysteryBoxGrade, rollMysteryBoxWeapon } from './data/shops.js';
import { ZONES } from './data/zones.js';

import { AudioMgr } from './engine/audio.js';
import { StorageMgr } from './engine/storage.js';
import { generateFloor, updateHazards, themeForFloor } from './engine/floor-gen.js';
import {
  rand, pick, clamp,
  rollCharacterAttrs, rollCharacterAffinities, pickAttrByGrade,
  affinityMultiplier, floorLootGrade, rollItemOfGrade, simpleHash
} from './engine/helpers.js';

const MAX_EQUIPPED_ATTRS = 7;
const MAX_EQUIPPED_ABILITIES = 5;

function migrateChar(c) {
  if (!c) return c;
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
  if (!c.statusEffects) c.statusEffects = [];
  return c;
}

function KrezcentQuest() {
  const [screen, setScreen] = useState('login');
  const [account, setAccount] = useState(null);
  const [char, setChar] = useState(null);
  const [msg, setMsg] = useState('');
  const [modal, setModal] = useState(null);
  const [, setTick] = useState(0);
  const [shopTab, setShopTab] = useState('buy');
  const [pvpOpp, setPvpOpp] = useState(null);
  const [loadoutTab, setLoadoutTab] = useState('abilities');
  const [boxSpin, setBoxSpin] = useState(null); // { boxKey, phase, result }
  const [trainerGrade, setTrainerGrade] = useState('F');
  const [vp, setVp] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 1024, h: typeof window !== 'undefined' ? window.innerHeight : 768 });

  const world = useRef({
    zone: null, floor: 1,
    player: { x: 100, y: 400, dir: 0, speed: 220, lastAttack: 0, invuln: 0, sky: 0, stun: 0, blind: 0, slow: 0, shield: 0, buffs: {}, animTime: 0, moving: false, tileX: 0, tileY: 0 },
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
        if (['1', '2', '3', '4', '5', '6', '7'].includes(e.key)) useAttribute(parseInt(e.key) - 1);
        if (['q', 'e', 'r', 'f', 'g'].includes(key)) useAffinitySlot(key);
      }
    };
    const ku = (e) => { world.current.keys[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  useEffect(() => {
    if (screen !== 'world') return;
    let raf;
    const loop = (t) => {
      const w = world.current;
      const dt = Math.min(0.05, (t - (w.lastFrame || t)) / 1000);
      w.lastFrame = t;
      if (!modalRef.current) update(dt);
      drawWorld();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [screen]);

  useEffect(() => {
    if (screen !== 'world') return;
    const i = setInterval(() => setTick(t => t + 1), 100);
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
    for (const k of Object.keys(p.buffs)) { p.buffs[k] -= dt; if (p.buffs[k] <= 0) delete p.buffs[k]; }

    // Status effects on the player (DoT / debuffs)
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
        const len = Math.hypot(dx, dy);
        dx /= len; dy /= len;
        p.dir = Math.atan2(dy, dx);
        let spd = p.speed;
        if (p.buffs.charge) spd *= 1.1;
        if (p.slow > 0) spd *= 0.5;
        if (p.sky > 0) spd *= 1.3;
        if (hasStatus(c, 'freeze')) spd *= 0.55;
        const nx = p.x + dx * spd * dt;
        const ny = p.y + dy * spd * dt;
        if (!collidesWall(nx, p.y, false)) p.x = nx;
        if (!collidesWall(p.x, ny, false)) p.y = ny;
      }
    }
    p.moving = moving;
    if (moving) p.animTime += dt; else p.animTime = 0;
    p.tileX = Math.floor(p.x / 40);
    p.tileY = Math.floor(p.y / 40);

    // Hazards (traps, lightning, fire vents, etc.)
    if (w.maze) {
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
      // Spawn arrow projectiles for newly-triggered arrow traps
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

    w.projectiles = w.projectiles.filter(pr => {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      if (pr.life <= 0) return false;
      if (collidesWall(pr.x, pr.y, true)) return false;
      if (pr.fromPlayer && w.maze) {
        for (const m of w.maze.monsters) {
          if (m.hp <= 0) continue;
          const mx = m.x * 40 + 20, my = m.y * 40 + 20;
          if (Math.hypot(pr.x - mx, pr.y - my) < 22) {
            damageMonster(m, pr.dmg, pr.aff);
            if (!pr.pierce) return false;
          }
        }
        if (!w.maze.boss.defeated && w.maze.bossHp != null) {
          const bx = w.maze.bossX * 40 + 20, by = w.maze.bossY * 40 + 20;
          if (Math.hypot(pr.x - bx, pr.y - by) < 35) {
            damageBoss(pr.dmg, pr.aff);
            return false;
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
      ef.life -= dt;
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
              const bx = w.maze.bossX * 40 + 20, by = w.maze.bossY * 40 + 20;
              if (Math.hypot(ef.x - bx, ef.y - by) < ef.radius + 20) damageBoss(ef.dmg, ef.aff);
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
        if (m.stun > 0) { m.stun -= dt; continue; }
        if (m.slow > 0) m.slow -= dt;
        const t = MONSTER_TYPES[m.type];
        const wallphase = !!t.wallphase;
        const mx = m.x * 40 + 20, my = m.y * 40 + 20;
        const distToPlayer = Math.hypot(p.x - mx, p.y - my);
        const range = t.ranged ? 260 : 280;

        m.animTime += dt;

        // Resolve telegraphed lunge — damage actually lands at lunge=0
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
          // Move toward player
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
              // Telegraph a lunge — damage lands 0.35s later
              m.lunge = 0.35;
              m.lungeTarget = { x: p.x, y: p.y };
            }
          }
        }
      }

      // Boss
      if (w.maze.boss && !w.maze.boss.defeated) {
        if (w.maze.bossHp == null) initBoss(w);
        updateBoss(w, c, p, dt);
      }
    }
    w.floats = w.floats.map(f => ({ ...f, life: f.life - dt, y: f.y - dt * 30 })).filter(f => f.life > 0);
    updateInteractPrompt();
    checkZoneTransitions();
  }

  // ===== Status helpers =====
  function hasStatus(c, kind) {
    return (c.statusEffects || []).some(s => s.kind === kind);
  }
  function addStatus(c, status) {
    c.statusEffects = c.statusEffects || [];
    // Refresh existing of same kind, else push new
    const existing = c.statusEffects.find(s => s.kind === status.kind);
    if (existing) {
      existing.dur = Math.max(existing.dur, status.dur);
      Object.assign(existing, status);
    } else c.statusEffects.push({ ...status });
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
    switch (attack.kind) {
      case 'freeze':
        addStatus(c, { kind: 'freeze', dur: attack.dur || 2, slow: attack.slow || 0.5 });
        addFloat(p.x, p.y - 40, 'FROZEN', '#80deea'); break;
      case 'burn':
        addStatus(c, { kind: 'burn', dur: attack.dur || 3, dps: attack.dps || 8 });
        addFloat(p.x, p.y - 40, 'BURNING', '#ff7043'); break;
      case 'poison':
        addStatus(c, { kind: 'poison', dur: attack.dur || 4, dps: attack.dps || 6 });
        addFloat(p.x, p.y - 40, 'POISONED', '#9ccc65'); break;
      case 'blind':
        p.blind = Math.max(p.blind, attack.dur || 3);
        addFloat(p.x, p.y - 40, 'BLINDED', '#212121'); break;
      case 'shock':
        p.stun = Math.max(p.stun, attack.stun || 0.6);
        addFloat(p.x, p.y - 40, 'SHOCKED', '#fff176'); break;
      case 'curse':
        addStatus(c, { kind: 'curse', dur: attack.dur || 4, manaPenalty: attack.manaPenalty || 0.5 });
        addFloat(p.x, p.y - 40, 'CURSED', '#9c27b0'); break;
      case 'drain':
        // Pre-applied damage is the steal; effect just shows label
        addFloat(p.x, p.y - 40, 'DRAINED', '#e91e63'); break;
      default: break;
    }
  }
  function applyKnockback(p, attack, dx, dy) {
    if (!attack || attack.kind !== 'knockback') return;
    const d = Math.hypot(dx, dy) || 1;
    const force = attack.force || 150;
    const nx = p.x + (dx / d) * force * -0.3; // push opposite of approach
    const ny = p.y + (dy / d) * force * -0.3;
    if (!collidesWall(nx, p.y, false)) p.x = nx;
    if (!collidesWall(p.x, ny, false)) p.y = ny;
    p.stun = Math.max(p.stun, 0.2);
  }

  // ===== Boss logic =====
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
    w.maze.bossShape = def.shape || 'titan';
    w.maze.bossAI = def.aiPattern || BOSS_AI_PATTERNS.PROJECTILE;
    w.maze.bossData = def;
    w.maze.bossCooldown = 1.5;
    w.maze.bossPx = w.maze.bossX * 40 + 20;
    w.maze.bossPy = w.maze.bossY * 40 + 20;
    w.maze.bossSpecial = 0;
    w.maze.bossShield = 0;
    w.maze.bossPhase = 0;
    if (def.unique) setMsg(`⚔ ${def.n} — ${def.desc || ''}`);
  }
  function updateBoss(w, c, p, dt) {
    const m = w.maze;
    const def = m.bossData;
    const pat = m.bossAI;
    const dist = Math.hypot(p.x - m.bossPx, p.y - m.bossPy);

    // Shield timer (shielder pattern)
    if (m.bossShield > 0) m.bossShield -= dt;

    // Tick boss heal-over-time if healer pattern
    if (pat === BOSS_AI_PATTERNS.HEALER && m.bossHp < m.bossMaxHp) {
      m.bossHealTimer = (m.bossHealTimer || 0) + dt;
      if (m.bossHealTimer >= (def.healInterval || 1.5)) {
        m.bossHealTimer = 0;
        const amt = def.healRate || 20;
        m.bossHp = Math.min(m.bossMaxHp, m.bossHp + amt);
        addFloat(m.bossPx, m.bossPy - 35, '+' + amt, '#69f0ae');
      }
    }

    // Movement (most bosses approach the player slowly)
    if (pat !== BOSS_AI_PATTERNS.TELEPORT && pat !== BOSS_AI_PATTERNS.PROJECTILE && pat !== BOSS_AI_PATTERNS.SPREADER) {
      const dxn = (p.x - m.bossPx) / Math.max(1, dist);
      const dyn = (p.y - m.bossPy) / Math.max(1, dist);
      const sp = (pat === BOSS_AI_PATTERNS.CHARGE ? (def.chargeSpeed || 5) : 1.8) * 30;
      const stepX = m.bossPx + dxn * sp * dt;
      const stepY = m.bossPy + dyn * sp * dt;
      if (!collidesWall(stepX, m.bossPy, true) && !pixelOnHazardTile(stepX, m.bossPy)) m.bossPx = stepX;
      if (!collidesWall(m.bossPx, stepY, true) && !pixelOnHazardTile(m.bossPx, stepY)) m.bossPy = stepY;
      m.bossX = Math.floor(m.bossPx / 40);
      m.bossY = Math.floor(m.bossPy / 40);
    }

    // Pattern-specific actions on cooldown
    m.bossCooldown -= dt;
    if (m.bossCooldown <= 0) {
      switch (pat) {
        case BOSS_AI_PATTERNS.PROJECTILE: {
          m.bossCooldown = 1.0;
          fireBossProjectile(m, c, p, def);
          break;
        }
        case BOSS_AI_PATTERNS.SPREADER: {
          m.bossCooldown = def.spreadCd || 2.0;
          fireBossSpread(m, p, def, def.spreadCount || 6);
          break;
        }
        case BOSS_AI_PATTERNS.CHARGE: {
          m.bossCooldown = 1.8;
          if (dist < 60 && p.invuln <= 0 && p.sky <= 0) {
            damagePlayer(m.bossDmg * 0.8, m.bossAff);
            applyKnockback(p, { kind: 'knockback', force: 220 }, p.x - m.bossPx, p.y - m.bossPy);
          }
          break;
        }
        case BOSS_AI_PATTERNS.TELEPORT: {
          m.bossCooldown = def.teleportRate || 3.5;
          // Blink near the player but not on top
          const ang = rand() * Math.PI * 2;
          const radius = 110 + rand() * 60;
          const tx = clamp(p.x + Math.cos(ang) * radius, 60, (m.W - 2) * 40);
          const ty = clamp(p.y + Math.sin(ang) * radius, 60, (m.H - 2) * 40);
          if (!collidesWall(tx, ty, true)) { m.bossPx = tx; m.bossPy = ty; m.bossX = Math.floor(tx / 40); m.bossY = Math.floor(ty / 40); }
          w.effects.push({ x: m.bossPx, y: m.bossPy, type: 'aoe', life: 0.3, color: m.bossColor, radius: 28, delay: undefined });
          fireBossProjectile(m, c, p, def);
          break;
        }
        case BOSS_AI_PATTERNS.HEALER: {
          m.bossCooldown = 1.2;
          fireBossProjectile(m, c, p, def);
          break;
        }
        case BOSS_AI_PATTERNS.BLINDER: {
          m.bossCooldown = def.blindInterval || 6.0;
          // Pulse out a "blind" aoe — instant
          w.effects.push({ x: m.bossPx, y: m.bossPy, type: 'aoe', life: 0.6, color: '#212121', radius: 220, delay: undefined });
          if (Math.hypot(p.x - m.bossPx, p.y - m.bossPy) < 220 && p.invuln <= 0) {
            p.blind = Math.max(p.blind, def.blindDur || 3);
            setMsg('You are blinded!');
          }
          // Also fire a regular shot
          fireBossProjectile(m, c, p, def);
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
          fireBossProjectile(m, c, p, def);
          break;
        }
        case BOSS_AI_PATTERNS.SHIELDER: {
          m.bossCooldown = def.shieldInterval || 8.0;
          m.bossShield = def.shieldDur || 3.0;
          setMsg(`${m.bossName} raises its guard!`);
          break;
        }
        default: m.bossCooldown = 1.5;
      }
    }
    // Melee contact damage for charging/melee patterns
    if ((pat === BOSS_AI_PATTERNS.CHARGE || pat === BOSS_AI_PATTERNS.HEALER) && dist < 50 && p.invuln <= 0 && p.sky <= 0) {
      damagePlayer(m.bossDmg * 0.5, m.bossAff);
    }
  }
  function fireBossProjectile(m, c, p, def) {
    const ang = Math.atan2(p.y - m.bossPy, p.x - m.bossPx);
    world.current.projectiles.push({
      x: m.bossPx, y: m.bossPy,
      vx: Math.cos(ang) * 280, vy: Math.sin(ang) * 280,
      life: 2.5, dmg: m.bossDmg, aff: m.bossAff, fromPlayer: false,
      color: AFFS[m.bossAff]?.color || SUB_COLOR[m.bossAff] || '#fff',
      big: true,
    });
  }
  function fireBossSpread(m, p, def, count) {
    const base = Math.atan2(p.y - m.bossPy, p.x - m.bossPx);
    const spread = Math.PI * 1.6; // wide spread
    for (let i = 0; i < count; i++) {
      const a = base - spread / 2 + (spread * i) / (count - 1);
      world.current.projectiles.push({
        x: m.bossPx, y: m.bossPy,
        vx: Math.cos(a) * 220, vy: Math.sin(a) * 220,
        life: 2.5, dmg: m.bossDmg * 0.6, aff: m.bossAff, fromPlayer: false,
        color: AFFS[m.bossAff]?.color || SUB_COLOR[m.bossAff] || '#fff',
      });
    }
  }

  // ===== Collision =====
  function collidesWall(x, y, forMonster) {
    const w = world.current;
    if (w.maze) {
      const gx = Math.floor(x / 40), gy = Math.floor(y / 40);
      if (gx < 0 || gy < 0 || gx >= w.maze.W || gy >= w.maze.H) return true;
      const tile = w.maze.grid[gy][gx];
      if (tile === 1) return true;
      // Water and lava block monsters by default; for the player we treat lava as walkable
      // (and damaging — handled elsewhere) and water as blocking unless bridge.
      if (tile === 2) return true;  // water
      if (forMonster && tile === 3) return true;  // monsters avoid lava
      if (forMonster && tile === 4) return false; // grass walkable
      return false;
    }
    const z = ZONES[w.zone];
    if (!z) return false;
    for (const wall of z.walls) {
      if (x > wall.x && x < wall.x + wall.w && y > wall.y && y < wall.y + wall.h) return true;
    }
    return false;
  }
  function canMonsterStand(tileX, tileY) {
    // For monster motion in tile coordinates (used by their grid-based step)
    const w = world.current; if (!w.maze) return true;
    const gx = Math.floor(tileX), gy = Math.floor(tileY);
    if (gx < 0 || gy < 0 || gx >= w.maze.W || gy >= w.maze.H) return false;
    const tile = w.maze.grid[gy][gx];
    return tile === 0 || tile === 4 || tile === 5 || tile === 6 || tile === 7;
  }
  function pixelOnHazardTile(x, y) {
    const w = world.current; if (!w.maze) return false;
    const gx = Math.floor(x / 40), gy = Math.floor(y / 40);
    if (gx < 0 || gy < 0 || gx >= w.maze.W || gy >= w.maze.H) return true;
    const tile = w.maze.grid[gy][gx];
    return tile === 2 || tile === 3;
  }

  // ===== Damage =====
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
    const w = world.current;
    const p = w.player;
    if (p.shield > 0) {
      const absorb = Math.min(p.shield, dmg);
      p.shield -= absorb;
      dmg -= absorb;
      if (dmg <= 0) { addFloat(p.x, p.y - 30, 'BLOCKED', '#8be9fd'); return; }
    }
    let mult = affinityMultiplier(aff, Object.keys(c.affinities));
    const wpn = WEAPONS[c.weapon];
    if (wpn?.defense) dmg *= (1 - wpn.defense);
    const final = Math.floor(dmg * mult);
    c.hp = clamp(c.hp - final, 0, c.maxHp);
    addFloat(p.x, p.y - 30, '-' + final, '#ff5252');
    AudioMgr.play('bonk');
    p.invuln = 0.4;
    if (c.hp <= 0) onPlayerDeath();
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
    // Rare weapon drop from regular monsters
    if (rand() < 0.012) {
      const weaponKey = pick(Object.keys(WEAPONS));
      if (!c.ownedWeapons.includes(weaponKey)) {
        c.ownedWeapons.push(weaponKey);
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
    // Bosses drop a weapon ~25% of the time, unique bosses 60%
    const dropChance = def.unique ? 0.6 : 0.25;
    if (rand() < dropChance) {
      const weaponKey = pick(Object.keys(WEAPONS));
      if (!c.ownedWeapons.includes(weaponKey)) {
        c.ownedWeapons.push(weaponKey);
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
    setMsg('You died. Returning to hub with half your coins lost.');
    c.hp = c.maxHp; c.coins = Math.floor(c.coins / 2);
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
        setMsg(`New ability learned: ${ab.n} (${knownKey}). Open Loadout (L) to equip it.`);
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

  function doBasicAttack() {
    const c = charRef.current;
    if (!c) return;
    const w = world.current;
    const p = w.player;
    if (p.stun > 0 || p.sky > 0) return;
    const wpn = WEAPONS[c.weapon];
    const now = performance.now();
    const cd = 600 / wpn.spd;
    if (now - p.lastAttack < cd) return;
    p.lastAttack = now;
    AudioMgr.play('attack');
    const cur = vpRef.current;
    const ang = Math.atan2(w.mouse.y - cur.h / 2, w.mouse.x - cur.w / 2);
    p.dir = ang;
    let dmg = wpn.dmg * (1 + (c.level - 1) * 0.05);
    if (p.buffs.boost) dmg *= 1.2;
    if (p.buffs.rage) dmg *= 1.3;
    if (p.buffs.thorn) { dmg *= 1.05; delete p.buffs.thorn; }
    if (p.buffs.double) dmg *= 2;
    if (wpn.crit && rand() < wpn.crit) dmg *= 2;
    if (wpn.ranged) {
      const extras = wpn.pierce ? { pierce: true } : {};
      w.projectiles.push({ x: p.x, y: p.y, vx: Math.cos(ang) * 500, vy: Math.sin(ang) * 500, life: wpn.range / 500, dmg, fromPlayer: true, color: '#fff', ...extras });
    } else {
      const arcR = (wpn.arc * Math.PI / 180) / 2;
      const hits = wpn.multi || 1;
      if (w.maze) {
        for (const m of w.maze.monsters) {
          if (m.hp <= 0) continue;
          const mx = m.x * 40 + 20, my = m.y * 40 + 20;
          const md = Math.hypot(mx - p.x, my - p.y);
          if (md < wpn.range) {
            const mang = Math.atan2(my - p.y, mx - p.x);
            let da = Math.abs(mang - ang);
            if (da > Math.PI) da = 2 * Math.PI - da;
            if (da < arcR) {
              for (let h = 0; h < hits; h++) {
                damageMonster(m, dmg, null);
                if (wpn.stun && rand() < wpn.stun) m.stun = 1.0;
                if (wpn.lifesteal) c.hp = clamp(c.hp + dmg * wpn.lifesteal, 0, c.maxHp);
              }
            }
          }
        }
        if (!w.maze.boss.defeated && w.maze.bossHp != null) {
          const bd = Math.hypot(w.maze.bossPx - p.x, w.maze.bossPy - p.y);
          if (bd < wpn.range + 20) {
            const bang = Math.atan2(w.maze.bossPy - p.y, w.maze.bossPx - p.x);
            let da = Math.abs(bang - ang);
            if (da > Math.PI) da = 2 * Math.PI - da;
            if (da < arcR) for (let h = 0; h < hits; h++) damageBoss(dmg, null);
          }
        }
      }
      w.effects.push({ x: p.x, y: p.y, type: 'slash', ang, range: wpn.range, arc: wpn.arc, life: 0.18, color: '#fff' });
    }
  }
  function useAttribute(idx) {
    const c = charRef.current;
    if (!c) return;
    const equipped = c.equippedAttrs || [];
    const key = equipped[idx];
    if (!key) return;
    const w = world.current; const p = w.player;
    if (p.stun > 0) return;
    const attr = ATTRS[key]; if (!attr) return;
    let cost = attr.e;
    if (p.buffs.recycle) { cost /= 2; delete p.buffs.recycle; }
    if (c.energy < cost && cost < 999) { setMsg('Not enough energy'); return; }
    if (cost === 999) c.energy = 0; else c.energy -= cost;
    AudioMgr.play('magic');
    applyAttrEffect(key);
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
  function stunNearest(d) { const m = findNearestMonster(); if (m) m.stun = d; }
  function blindNearest(d) { const m = findNearestMonster(); if (m) m.aiCooldown = d; }
  function slowAll(a, d) { const w = world.current; if (!w.maze) return; for (const m of w.maze.monsters) if (m.hp > 0) m.slow = d; }
  function stunAll(d) { const w = world.current; if (!w.maze) return; for (const m of w.maze.monsters) if (m.hp > 0) m.stun = d; }
  function drainNearest(a) {
    const m = findNearestMonster(); if (!m) return;
    const drain = m.maxHp * a; m.hp -= drain;
    const c = charRef.current; c.hp = clamp(c.hp + drain, 0, c.maxHp);
    addFloat(m.x * 40 + 20, m.y * 40 + 20, '-' + Math.floor(drain), '#ff5252');
    if (m.hp <= 0) onMonsterDeath(m);
  }
  function killNearest() { const m = findNearestMonster(); if (!m) return; m.hp = 0; onMonsterDeath(m); }
  function controlNearest(d) { const m = findNearestMonster(); if (m) m.stun = d; }

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
    if (c.mana < abil.m) { setMsg('Not enough mana'); return; }
    c.mana -= abil.m;
    AudioMgr.play('magic');
    let mult = 1;
    const wpn = WEAPONS[c.weapon];
    if (wpn?.manaBoost) mult += wpn.manaBoost;
    if (p.buffs.boost) mult *= 1.2;
    if (p.buffs.double) mult *= 2;
    if (p.buffs.rage) mult *= 1.3;
    fireAbility(abil, entry.aff, mult);
    grantAffinityExp(entry.aff, 5);
    setChar({ ...c });
  }
  function fireAbility(abil, aff, mult) {
    const w = world.current; const p = w.player; const c = charRef.current;
    const cur = vpRef.current;
    const ang = Math.atan2(w.mouse.y - cur.h / 2, w.mouse.x - cur.w / 2);
    const color = AFFS[aff]?.color || SUB_COLOR[aff] || '#fff';
    const dmg = abil.d * mult;
    if (abil.k === 'projectile') {
      w.projectiles.push({ x: p.x, y: p.y, vx: Math.cos(ang) * 450, vy: Math.sin(ang) * 450, life: 1.5, dmg, aff, fromPlayer: true, color, big: true });
    } else if (abil.k === 'aoe' || abil.k === 'ultimate') {
      const r = abil.k === 'ultimate' ? 250 : 130;
      w.effects.push({ x: p.x, y: p.y, type: 'aoe', life: 0.6, delay: 0.1, dmg, aff, radius: r, fromPlayer: true, color });
    } else if (abil.k === 'cone') {
      for (let i = -2; i <= 2; i++) {
        const a = ang + i * 0.2;
        w.projectiles.push({ x: p.x, y: p.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, life: 1.3, dmg: dmg / 2, aff, fromPlayer: true, color });
      }
    } else if (abil.k === 'shield') {
      p.shield = (p.shield || 0) + 150;
    } else if (abil.k === 'dash') {
      const dist = 200;
      p.x += Math.cos(ang) * dist; p.y += Math.sin(ang) * dist;
      if (collidesWall(p.x, p.y, false)) { p.x -= Math.cos(ang) * dist; p.y -= Math.sin(ang) * dist; }
      p.invuln = 0.5;
    } else if (abil.k === 'heal') {
      c.hp = clamp(c.hp + c.maxHp * 0.3, 0, c.maxHp);
    }
  }

  function tryInteract() {
    const w = world.current; const p = w.player;
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
  function openChest(ch) {
    ch.opened = true;
    const c = charRef.current;
    const grade = floorLootGrade(world.current.floor);
    const itemKey = rollItemOfGrade(grade);
    if (itemKey) { addItemToInventory({ key: itemKey, name: ITEMS[itemKey].n, grade }); setMsg(`Chest: ${grade}-grade ${ITEMS[itemKey].n}!`); }
    const coins = Math.floor(20 + rand() * 50 + world.current.floor * 5);
    c.coins += coins;
    // Chests rarely drop weapons
    if (rand() < 0.05) {
      const weaponKey = pick(Object.keys(WEAPONS));
      if (!c.ownedWeapons.includes(weaponKey)) {
        c.ownedWeapons.push(weaponKey);
        setMsg(`Chest contained a weapon: ${WEAPONS[weaponKey].n}!`);
      }
    }
    AudioMgr.play('chest');
    setChar({ ...c });
  }
  function updateInteractPrompt() {
    const w = world.current; const p = w.player;
    let prompt = '';
    for (const n of w.npcs) if (Math.hypot(n.x - p.x, n.y - p.y) < 70) { prompt = n.prompt || 'Talk [SPACE]'; break; }
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
    if (w.zone === 'hub' && p.x < 5 && p.y > 500 && p.y < 600) enterZone('starting', 'fromHub');
  }
  function addFloat(x, y, text, color) { world.current.floats.push({ x, y, text, color, life: 1.2 }); }
  function addItemToInventory(item) {
    const c = charRef.current;
    if (c.inventory.length >= 20) { setMsg('Inventory full! Item lost.'); return false; }
    c.inventory = [...c.inventory, item];
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
      case 'kill': c.hp = 0; break;
      case 'levelUp': grantExp(expForLevel(c.level)); break;
      case 'affinityUp': { const keys = Object.keys(c.affinities); if (keys.length) c.affinities[keys[0]].level++; break; }
      case 'coinFlip': if (rand() < 0.5) { p.buffs.boost = 5; setMsg('Heads! Double damage 5s!'); } else { c.hp = Math.floor(c.hp / 2); setMsg('Tails! Lost half HP!'); } break;
      case 'removeAttr': if (c.attrs.length > 0) { c.attrs.pop(); c.equippedAttrs = (c.equippedAttrs || []).filter(k => c.attrs.some(a => a.key === k)); setMsg('Removed last attribute'); } break;
      default: break;
    }
    c.inventory = c.inventory.filter((_, i) => i !== idx);
    setChar({ ...c });
    if (c.hp <= 0) onPlayerDeath();
  }
  function dropItem(idx) {
    const c = charRef.current;
    c.inventory = c.inventory.filter((_, i) => i !== idx);
    setChar({ ...c });
  }

  function enterZone(zone, fromDir = null) {
    const w = world.current;
    w.zone = zone;
    w.projectiles = []; w.effects = []; w.floats = [];
    if (zone === 'starting') {
      w.maze = null;
      const z = ZONES.starting;
      w.player.x = fromDir === 'fromHub' ? 60 : z.spawn.x;
      w.player.y = fromDir === 'fromHub' ? 450 : z.spawn.y;
      w.npcs = [
        {
          x: 700, y: 450, color: '#ffeb3b', kind: 'sage', prompt: 'Talk to Sage [SPACE]',
          action: () => setMsg(
            `Welcome, ${charRef.current.name}, to Krezcent Quest!\n\n` +
            `• Move with WASD\n• Aim with mouse, attack J or click\n` +
            `• Attributes 1-7, abilities QERFG\n• TAB inv · C stats · L loadout\n• SPACE interact\n\n` +
            `Walk east to reach the Main Hub. New buildings await — the Blacksmith, Attribute Trainer, and Mystery Boxes are open for business.`
          )
        },
      ];
      setMsg('Welcome to the Starting Field! Walk east to the Hub.');
    } else if (zone === 'hub') {
      w.maze = null;
      const z = ZONES.hub;
      w.player.x = fromDir === 'fromStarting' ? 60 : z.spawn.x;
      w.player.y = fromDir === 'fromStarting' ? 550 : z.spawn.y;
      // NPC for each building — interaction point is at the building's door (center-bottom)
      w.npcs = z.buildings.map(b => {
        const npc = {
          x: b.x + b.w / 2, y: b.y + b.h - 20,
          color: b.color, kind: b.kind,
          building: b,
        };
        switch (b.kind) {
          case 'shop':       npc.prompt = 'Enter Shop [SPACE]';        npc.action = () => setModal('shop'); break;
          case 'dungeon':    npc.prompt = 'Enter Dungeon [SPACE]';     npc.action = () => setModal('dungeon_select'); break;
          case 'pvp':        npc.prompt = 'PvP Arena [SPACE]';         npc.action = () => setModal('pvp'); break;
          case 'save':       npc.prompt = 'Save & Logout [SPACE]';     npc.action = async () => { await saveCharacter(); setScreen('login'); setChar(null); setAccount(null); }; break;
          case 'party':      npc.prompt = 'Party (soon) [SPACE]';     npc.action = () => setMsg('Party play requires online multiplayer (future update)'); break;
          case 'blacksmith': npc.prompt = 'Blacksmith [SPACE]';        npc.action = () => setModal('blacksmith'); break;
          case 'trainer':    npc.prompt = 'Attribute Trainer [SPACE]'; npc.action = () => setModal('trainer'); break;
          case 'mystery':    npc.prompt = 'Mystery Boxes [SPACE]';     npc.action = () => setModal('mystery'); break;
        }
        return npc;
      });
      setMsg('Main Hub. New buildings unlocked: Blacksmith, Trainer, Mystery Boxes.');
    } else if (zone === 'dungeon') {
      w.maze = generateFloor(w.floor);
      w.maze.floor = w.floor;
      w.player.x = 60; w.player.y = 60;
      w.npcs = [];
      setMsg(`Floor ${w.floor} (${w.maze.type}). ${w.maze.intro || ''}`);
    }
    setTick(t => t + 1);
  }

  // ===== Drawing =====
  function drawWorld() {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const w = world.current; const p = w.player;
    const cam = { x: p.x - W / 2, y: p.y - H / 2 };

    const bgColors = { starting: '#1a3a14', hub: '#1a1a22', dungeon: '#0a0612' };
    ctx.fillStyle = bgColors[w.zone] || '#000';
    ctx.fillRect(0, 0, W, H);

    if (w.zone === 'starting') drawStartingField(ctx, W, H, cam);
    else if (w.zone === 'hub') drawHub(ctx, W, H, cam);
    else if (w.zone === 'dungeon' && w.maze) drawDungeon(ctx, W, H, cam);

    // Effects
    for (const ef of w.effects) {
      const ex = ef.x - cam.x, ey = ef.y - cam.y;
      if (ef.type === 'slash') {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
        ctx.globalAlpha = ef.life / 0.18;
        ctx.beginPath();
        ctx.arc(ex, ey, ef.range, ef.ang - (ef.arc * Math.PI / 360), ef.ang + (ef.arc * Math.PI / 360));
        ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = 1;
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
      }
    }
    // Projectiles
    for (const pr of w.projectiles) {
      ctx.fillStyle = pr.color || '#fff';
      ctx.shadowColor = pr.color || '#fff'; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(pr.x - cam.x, pr.y - cam.y, pr.big ? 11 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
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
    const flowerSpots = [[150, 200], [250, 600], [500, 150], [550, 600], [800, 250], [850, 550], [1000, 200], [1100, 600], [1300, 300]];
    flowerSpots.forEach(([fx, fy], i) => {
      const colors = ['#f9d5e5', '#fffacd', '#e0bbe4', '#ffeb3b', '#ff7043'];
      ctx.fillStyle = '#3b6f2c';
      ctx.fillRect(fx - cam.x, fy - cam.y, 2, 8);
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      for (let j = 0; j < 5; j++) {
        const a = (j / 5) * Math.PI * 2;
        ctx.arc(fx - cam.x + Math.cos(a) * 3, fy - cam.y + Math.sin(a) * 3, 3, 0, Math.PI * 2);
      }
      ctx.fill();
    });
    const trees = [];
    for (let tx = 80; tx < 1500; tx += 120) { trees.push([tx, 80]); trees.push([tx, 800]); }
    trees.forEach(([tx, ty]) => drawTree(ctx, tx - cam.x, ty - cam.y));
    ctx.fillStyle = '#3b6f2c';
    z.walls.forEach(wl => ctx.fillRect(wl.x - cam.x, wl.y - cam.y, wl.w, wl.h));
    ctx.fillStyle = '#8d6e63';
    for (let x = 100; x < 1500; x += 30) ctx.fillRect(x - cam.x, 430 - cam.y, 24, 40);
    drawSign(ctx, 1520 - cam.x, 410 - cam.y, '→ HUB');
  }

  function drawHub(ctx, W, H, cam) {
    const z = ZONES.hub;
    ctx.fillStyle = '#6b6a72';
    ctx.fillRect(-cam.x, -cam.y, z.w, z.h);
    // Tile pattern (inside the hub only)
    for (let y = 0; y < z.h; y += 40) {
      for (let x = 0; x < z.w; x += 40) {
        ctx.fillStyle = ((x + y) / 40) % 2 < 1 ? '#5e5e66' : '#52525a';
        ctx.fillRect(x - cam.x, y - cam.y, 40, 40);
        ctx.strokeStyle = '#3f3e44'; ctx.lineWidth = 1;
        ctx.strokeRect(x - cam.x, y - cam.y, 40, 40);
      }
    }
    // Central fountain
    ctx.fillStyle = '#9c8767';
    ctx.beginPath(); ctx.arc(1100 - cam.x, 540 - cam.y, 80, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5d4e36'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(1100 - cam.x, 540 - cam.y, 80, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = '#fff8e1';
    ctx.beginPath(); ctx.arc(1100 - cam.x, 540 - cam.y, 30, 0, Math.PI * 2); ctx.fill();
    // Buildings
    for (const b of z.buildings) drawBuilding(ctx, b.x - cam.x, b.y - cam.y, b.w, b.h, b.color, b.label);
    // Lanterns at building corners
    for (const b of z.buildings) {
      drawLantern(ctx, b.x - cam.x, b.y + b.h + 20 - cam.y);
      drawLantern(ctx, b.x + b.w - cam.x, b.y + b.h + 20 - cam.y);
    }
    // Border walls
    ctx.fillStyle = '#37363c';
    z.walls.forEach(wl => ctx.fillRect(wl.x - cam.x, wl.y - cam.y, wl.w, wl.h));
    // Path back to field
    ctx.fillStyle = '#8d6e63';
    for (let x = -40; x < 100; x += 30) ctx.fillRect(x - cam.x, 530 - cam.y, 24, 40);
    drawSign(ctx, 10 - cam.x, 510 - cam.y, '← Field');
  }

  function drawDungeon(ctx, W, H, cam) {
    const w = world.current; const m = w.maze;
    const th = m.theme || themeForFloor(w.floor);
    const wallColor = th.wall, floorColor = th.floor, accentColor = th.accent;
    for (let y = 0; y < m.H; y++) {
      for (let x = 0; x < m.W; x++) {
        const px = x * 40 - cam.x, py = y * 40 - cam.y;
        if (px < -40 || py < -40 || px > W || py > H) continue;
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
            ctx.fillStyle = '#1565c0';
            ctx.fillRect(px, py, 40, 40);
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(px + 2 + (Math.sin(w.timeOfDay * 2 + x) * 2), py + 10, 8, 2);
            ctx.fillRect(px + 22 + (Math.sin(w.timeOfDay * 2.4 + y) * 2), py + 25, 10, 2);
            break;
          case 3: // lava
            ctx.fillStyle = '#5d1f08';
            ctx.fillRect(px, py, 40, 40);
            ctx.fillStyle = '#ff5722';
            ctx.globalAlpha = 0.55 + 0.25 * Math.sin(w.timeOfDay * 3 + x + y);
            ctx.fillRect(px + 4, py + 4, 32, 32);
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#ffd54f';
            ctx.fillRect(px + 8, py + 8, 8, 4);
            break;
          case 4: // grass
            ctx.fillStyle = '#3a6b2c';
            ctx.fillRect(px, py, 40, 40);
            ctx.fillStyle = '#4f8c3a';
            ctx.fillRect(px + 6, py + 4, 2, 5);
            ctx.fillRect(px + 22, py + 14, 2, 5);
            ctx.fillRect(px + 14, py + 28, 2, 5);
            break;
          case 5: // bridge
            ctx.fillStyle = '#8d6e63';
            ctx.fillRect(px, py, 40, 40);
            ctx.fillStyle = '#6d4c41';
            ctx.fillRect(px, py, 40, 4);
            ctx.fillRect(px, py + 18, 40, 4);
            ctx.fillRect(px, py + 36, 40, 4);
            break;
          case 6: // sand
            ctx.fillStyle = '#d7c79a';
            ctx.fillRect(px, py, 40, 40);
            break;
          case 7: // stone tile
            ctx.fillStyle = '#8d8d99';
            ctx.fillRect(px, py, 40, 40);
            ctx.strokeStyle = '#5d5d66'; ctx.strokeRect(px, py, 40, 40);
            break;
          default: // 0 floor
            ctx.fillStyle = floorColor;
            ctx.fillRect(px, py, 40, 40);
        }
      }
    }
    // Decorations
    for (const d of m.decorations || []) {
      if (d.type === 'torch') drawTorch(ctx, d.x * 40 + 20 - cam.x, d.y * 40 + 36 - cam.y, w.timeOfDay);
    }
    // Hazards (only render once they're visible)
    for (const h of m.hazards || []) {
      if (h.hidden) continue;
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
        ctx.fillStyle = '#8d6e63';
        ctx.fillRect(hx - 8, hy - 8, 16, 16);
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
          ctx.moveTo(hx, hy - 200);
          ctx.lineTo(hx - 4, hy - 100);
          ctx.lineTo(hx + 6, hy - 50);
          ctx.lineTo(hx, hy);
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
    // Boss room highlight
    ctx.strokeStyle = '#ff1744'; ctx.lineWidth = 3;
    ctx.strokeRect((m.bossX - 1) * 40 - cam.x, (m.bossY - 1) * 40 - cam.y, 120, 120);
    ctx.lineWidth = 1;
    // Chests
    for (const ch of m.chests || []) {
      if (ch.opened) continue;
      drawChest(ctx, ch.x * 40 + 20 - cam.x, ch.y * 40 + 25 - cam.y);
    }
    // Monsters
    for (const mon of m.monsters) {
      if (mon.hp <= 0) continue;
      drawMonster(ctx, mon.x * 40 + 20 - cam.x, mon.y * 40 + 20 - cam.y, mon);
    }
    // Boss
    if (!m.boss.defeated && m.bossHp != null) {
      drawBoss(ctx, m.bossPx - cam.x, m.bossPy - cam.y, m, w.timeOfDay);
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
    const flicker = Math.sin(t * 8 + x) * 2;
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
    const t = MONSTER_TYPES[mon.type];
    if (!t) return;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y + 16, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
    const bob = Math.sin(mon.animTime * 6) * 1.5;
    const shape = t.shape || 'humanoid';
    const c = t.color;
    // Lunge telegraph indicator
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
      ctx.moveTo(x - 16, y - wing);
      ctx.lineTo(x - 8, y - 4); ctx.lineTo(x + 8, y - 4); ctx.lineTo(x + 16, y - wing);
      ctx.lineTo(x + 12, y + 4); ctx.lineTo(x - 12, y + 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(x - 3, y - 2, 1.5, 0, Math.PI * 2); ctx.arc(x + 3, y - 2, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'spider') {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(x, y + 4, 10, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - 4, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        if (i === 0) continue;
        const a = (i / 3) * 0.7;
        ctx.beginPath();
        ctx.moveTo(x, y + 4);
        ctx.lineTo(x + Math.cos(a) * 14, y + 4 + Math.sin(a) * 8 + bob);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(x - 2, y - 4, 1.5, 0, Math.PI * 2); ctx.arc(x + 2, y - 4, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'wolf') {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(x, y + 4 + bob * 0.4, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 10, y - 2, 6, 0, Math.PI * 2); ctx.fill();
      // ears
      ctx.beginPath();
      ctx.moveTo(x + 6, y - 8); ctx.lineTo(x + 9, y - 14); ctx.lineTo(x + 11, y - 6);
      ctx.moveTo(x + 13, y - 8); ctx.lineTo(x + 16, y - 14); ctx.lineTo(x + 14, y - 6);
      ctx.fill();
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(x + 11, y - 2, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'serpent') {
      ctx.fillStyle = c;
      // Coiled body
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const r = 12 - i * 1.5;
        ctx.arc(x, y + bob * 0.4, r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(x - 3, y - 2, 1.5, 0, Math.PI * 2); ctx.arc(x + 3, y - 2, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'crab') {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(x, y + 4, 14, 8, 0, 0, Math.PI * 2); ctx.fill();
      // claws
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(x - 16, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 16, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(x - 3, y, 1.5, 0, Math.PI * 2); ctx.arc(x + 3, y, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'wraith') {
      ctx.fillStyle = c; ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(x - 12, y - 10);
      ctx.lineTo(x + 12, y - 10);
      ctx.lineTo(x + 9, y + 10 + bob);
      ctx.lineTo(x, y + 14 + bob);
      ctx.lineTo(x - 9, y + 10 + bob);
      ctx.closePath(); ctx.fill();
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
      ctx.fillStyle = c;
      ctx.shadowColor = c; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 3, y - 3, 3, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'imp') {
      ctx.fillStyle = c;
      ctx.fillRect(x - 7, y + 4, 5, 12 + bob); ctx.fillRect(x + 2, y + 4, 5, 12 - bob);
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
      // Horns
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 8); ctx.lineTo(x - 4, y - 16); ctx.lineTo(x - 2, y - 8);
      ctx.moveTo(x + 6, y - 8); ctx.lineTo(x + 4, y - 16); ctx.lineTo(x + 2, y - 8);
      ctx.fill();
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(x - 3, y - 2, 1.5, 0, Math.PI * 2); ctx.arc(x + 3, y - 2, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'golem') {
      ctx.fillStyle = c;
      ctx.fillRect(x - 14, y - 8, 28, 24); // big body
      ctx.fillRect(x - 8, y - 18, 16, 12); // head
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(x - 4, y - 12, 1.5, 0, Math.PI * 2); ctx.arc(x + 4, y - 12, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.strokeRect(x - 14, y - 8, 28, 24); ctx.strokeRect(x - 8, y - 18, 16, 12);
    } else {
      // humanoid fallback
      ctx.fillStyle = '#222';
      ctx.fillRect(x - 6, y + 6, 4, 10 + bob); ctx.fillRect(x + 2, y + 6, 4, 10 - bob);
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(x, y + 2, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(x - 4, y, 2, 0, Math.PI * 2); ctx.arc(x + 4, y, 2, 0, Math.PI * 2); ctx.fill();
    }
    // HP bar
    if (mon.hp < mon.maxHp) {
      ctx.fillStyle = '#333'; ctx.fillRect(x - 16, y - 24, 32, 5);
      ctx.fillStyle = '#f44336'; ctx.fillRect(x - 16, y - 24, 32 * (mon.hp / mon.maxHp), 5);
      ctx.strokeStyle = '#000'; ctx.strokeRect(x - 16, y - 24, 32, 5);
    }
  }

  function drawBoss(ctx, x, y, m, t) {
    const pulse = Math.sin(t * 4) * 3;
    const shape = m.bossShape;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(x, y + 28, 28, 7, 0, 0, Math.PI * 2); ctx.fill();
    // aura
    ctx.fillStyle = m.bossColor; ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.arc(x, y, 40 + pulse, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    if (shape === 'titan') {
      ctx.fillStyle = m.bossColor;
      ctx.fillRect(x - 22, y - 10, 44, 32);
      ctx.fillRect(x - 12, y - 28, 24, 18);
      ctx.fillStyle = '#ff1744';
      ctx.beginPath(); ctx.arc(x - 5, y - 18, 2, 0, Math.PI * 2); ctx.arc(x + 5, y - 18, 2, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'wraith' || shape === 'specter') {
      ctx.fillStyle = m.bossColor; ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(x - 22, y - 18);
      ctx.lineTo(x + 22, y - 18);
      ctx.lineTo(x + 18, y + 18 + pulse);
      ctx.lineTo(x, y + 24 + pulse);
      ctx.lineTo(x - 18, y + 18 + pulse);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 7, y - 6, 3, 0, Math.PI * 2); ctx.arc(x + 7, y - 6, 3, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'sphere') {
      ctx.fillStyle = m.bossColor;
      ctx.beginPath(); ctx.arc(x, y, 26 + pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 8, y - 6, 4, 0, Math.PI * 2); ctx.arc(x + 8, y - 6, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(x - 8, y - 6, 2, 0, Math.PI * 2); ctx.arc(x + 8, y - 6, 2, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'beast') {
      ctx.fillStyle = m.bossColor;
      ctx.beginPath(); ctx.ellipse(x, y + 4, 26, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 14, y - 6, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff1744';
      ctx.beginPath(); ctx.arc(x + 16, y - 8, 2, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'serpent' || shape === 'leviathan') {
      ctx.fillStyle = m.bossColor;
      for (let i = 0; i < 5; i++) {
        const r = 22 - i * 3;
        const oy = Math.sin(t * 3 + i) * 4;
        ctx.beginPath(); ctx.arc(x, y + oy, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#ff1744';
      ctx.beginPath(); ctx.arc(x - 5, y - 6, 2.5, 0, Math.PI * 2); ctx.arc(x + 5, y - 6, 2.5, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'spider_queen') {
      ctx.fillStyle = m.bossColor;
      ctx.beginPath(); ctx.arc(x, y + 6, 18, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - 8, 12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = m.bossColor; ctx.lineWidth = 4;
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        const a = (i / 4) * 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y + 6);
        ctx.lineTo(x + Math.cos(a) * 30, y + 6 + Math.sin(a) * 18);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      ctx.fillStyle = '#ff1744';
      ctx.beginPath(); ctx.arc(x - 4, y - 8, 2.5, 0, Math.PI * 2); ctx.arc(x + 4, y - 8, 2.5, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'avatar') {
      ctx.fillStyle = m.bossColor;
      ctx.fillRect(x - 16, y - 4, 32, 28);
      ctx.beginPath(); ctx.arc(x, y - 14, 14, 0, Math.PI * 2); ctx.fill();
      // halo
      ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y - 22, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 4, y - 14, 2, 0, Math.PI * 2); ctx.arc(x + 4, y - 14, 2, 0, Math.PI * 2); ctx.fill();
    } else if (shape === 'eye_lord') {
      ctx.fillStyle = m.bossColor;
      ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 3, y - 3, 3, 0, Math.PI * 2); ctx.fill();
    } else {
      // generic
      ctx.fillStyle = m.bossColor;
      ctx.beginPath(); ctx.arc(x, y, 28, 0, Math.PI * 2); ctx.fill();
    }
    // Shielder shield ring
    if (m.bossShield > 0) {
      ctx.strokeStyle = '#bdbdbd'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, 40 + Math.sin(t * 6) * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
    }
    // Name
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeText(m.bossName, x, y - 48);
    ctx.fillText(m.bossName, x, y - 48);
    // HP bar
    ctx.fillStyle = '#333'; ctx.fillRect(x - 60, y - 62, 120, 8);
    ctx.fillStyle = '#ff1744'; ctx.fillRect(x - 60, y - 62, 120 * (m.bossHp / m.bossMaxHp), 8);
    ctx.strokeStyle = '#000'; ctx.strokeRect(x - 60, y - 62, 120, 8);
    ctx.textAlign = 'left'; ctx.lineWidth = 1;
  }

  function drawPlayer(ctx, x, y, c, p) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y + 22, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    const walkPhase = p.moving ? Math.sin(p.animTime * 10) : 0;
    const legA = walkPhase * 3;
    ctx.fillStyle = '#2c1a4a';
    ctx.fillRect(x - 7, y + 8, 5, 14 + legA);
    ctx.fillRect(x + 2, y + 8, 5, 14 - legA);
    ctx.fillStyle = '#5b21b6';
    ctx.beginPath();
    ctx.moveTo(x - 11, y - 2); ctx.lineTo(x + 11, y - 2);
    ctx.lineTo(x + 9, y + 12); ctx.lineTo(x - 9, y + 12); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3e2723'; ctx.fillRect(x - 10, y + 7, 20, 3);
    ctx.fillStyle = '#fbc02d'; ctx.fillRect(x - 2, y + 7, 4, 3);
    const armA = walkPhase * 2;
    ctx.fillStyle = c.skin;
    ctx.fillRect(x - 13, y - 2 + armA, 3, 12);
    ctx.fillRect(x + 10, y - 2 - armA, 3, 12);
    ctx.beginPath(); ctx.arc(x, y - 10, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c.hair;
    if (c.hairstyle === 'short') { ctx.beginPath(); ctx.arc(x, y - 12, 11, Math.PI, Math.PI * 2); ctx.fill(); }
    else if (c.hairstyle === 'long') {
      ctx.beginPath(); ctx.ellipse(x, y - 8, 12, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.skin; ctx.beginPath(); ctx.arc(x, y - 10, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.hair; ctx.beginPath(); ctx.arc(x, y - 14, 11, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
    } else if (c.hairstyle === 'spiky') {
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * 3.5 - 1.5, y - 14);
        ctx.lineTo(x + i * 3.5, y - 22);
        ctx.lineTo(x + i * 3.5 + 1.5, y - 14);
        ctx.closePath(); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(x, y - 12, 11, Math.PI, Math.PI * 2); ctx.fill();
    }
    const eyeOff = Math.cos(p.dir) * 1.2;
    const eyeOffY = Math.sin(p.dir) * 0.8;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x - 3, y - 10, 2.2, 0, Math.PI * 2); ctx.arc(x + 3, y - 10, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c.eye;
    ctx.beginPath(); ctx.arc(x - 3 + eyeOff, y - 10 + eyeOffY, 1.2, 0, Math.PI * 2); ctx.arc(x + 3 + eyeOff, y - 10 + eyeOffY, 1.2, 0, Math.PI * 2); ctx.fill();
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
        ctx.beginPath(); ctx.moveTo(gxa, gya); ctx.lineTo(gxb, gyb); ctx.stroke();
        break;
      }
      case 'katana': {
        const [hx, hy] = px(8, 0); const [tipx, tipy] = px(38, -2);
        ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipx, tipy); ctx.stroke();
        break;
      }
      case 'knife': {
        const [hx, hy] = px(8, 0); const [tipx, tipy] = px(22, 0);
        ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipx, tipy); ctx.stroke();
        const [gxa, gya] = px(8, -3); const [gxb, gyb] = px(8, 3);
        ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(gxa, gya); ctx.lineTo(gxb, gyb); ctx.stroke();
        break;
      }
      case 'bow': {
        const [cx, cy] = px(20, 0);
        ctx.strokeStyle = '#8b6f47'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, 12, dir - Math.PI / 2.2, dir + Math.PI / 2.2); ctx.stroke();
        const [s1x, s1y] = px(20, -10); const [s2x, s2y] = px(20, 10);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(s1x, s1y); ctx.lineTo(s2x, s2y); ctx.stroke();
        break;
      }
      case 'crossbow': {
        const [cx, cy] = px(14, 0);
        ctx.fillStyle = '#5d4037'; ctx.fillRect(cx - 4, cy - 2, 16, 4);
        const [bx1, by1] = px(18, -10); const [bx2, by2] = px(18, 10);
        ctx.strokeStyle = '#8b6f47'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(bx1, by1); ctx.lineTo(bx2, by2); ctx.stroke();
        break;
      }
      case 'shield': {
        const [cx, cy] = px(20, 0);
        ctx.fillStyle = '#5d4037'; ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#9e9e9e'; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 6; i++) {
          const a = dir + (i / 6) * Math.PI * 2;
          const tx = cx + Math.cos(a) * 13, ty = cy + Math.sin(a) * 13;
          ctx.fillStyle = '#bdbdbd';
          ctx.beginPath(); ctx.arc(tx, ty, 2.5, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'spear': {
        const [hx, hy] = px(6, 0); const [tipx, tipy] = px(42, 0);
        ctx.strokeStyle = '#8b6f47'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipx, tipy); ctx.stroke();
        const [pt1x, pt1y] = px(46, 0); const [pt2x, pt2y] = px(38, -4); const [pt3x, pt3y] = px(38, 4);
        ctx.fillStyle = '#d8d8e0';
        ctx.beginPath(); ctx.moveTo(pt1x, pt1y); ctx.lineTo(pt2x, pt2y); ctx.lineTo(pt3x, pt3y); ctx.closePath(); ctx.fill();
        break;
      }
      case 'axe': {
        const [hx, hy] = px(8, 0); const [tx, ty] = px(28, 0);
        ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        const [a1x, a1y] = px(24, -10); const [a2x, a2y] = px(34, -2);
        const [a3x, a3y] = px(34, 2); const [a4x, a4y] = px(24, 10);
        ctx.fillStyle = '#9e9e9e';
        ctx.beginPath(); ctx.moveTo(a1x, a1y); ctx.lineTo(a2x, a2y); ctx.lineTo(a3x, a3y); ctx.lineTo(a4x, a4y); ctx.closePath(); ctx.fill();
        break;
      }
      case 'morningstar': {
        const [hx, hy] = px(8, 0); const [bx, by] = px(28, 0);
        ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(bx, by); ctx.stroke();
        ctx.fillStyle = '#616161';
        ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const sx = bx + Math.cos(a) * 10, sy = by + Math.sin(a) * 10;
          ctx.fillStyle = '#9e9e9e';
          ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'hammer': {
        const [hx, hy] = px(8, 0); const [tx, ty] = px(26, 0);
        ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        const [h1x, h1y] = px(22, -8); const [h2x, h2y] = px(32, -8);
        const [h3x, h3y] = px(32, 8); const [h4x, h4y] = px(22, 8);
        ctx.fillStyle = '#8d8d8d';
        ctx.beginPath(); ctx.moveTo(h1x, h1y); ctx.lineTo(h2x, h2y); ctx.lineTo(h3x, h3y); ctx.lineTo(h4x, h4y); ctx.closePath(); ctx.fill();
        break;
      }
      case 'scythe': {
        const [hx, hy] = px(8, 0); const [tx, ty] = px(34, -2);
        ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.strokeStyle = '#9e9e9e'; ctx.lineWidth = 3;
        ctx.beginPath();
        const [sx, sy] = px(34, -2);
        ctx.moveTo(sx, sy);
        const [s2x, s2y] = px(28, -16);
        const [s3x, s3y] = px(16, -18);
        ctx.quadraticCurveTo(s2x, s2y, s3x, s3y);
        ctx.stroke();
        break;
      }
      case 'staff': {
        const [hx, hy] = px(6, 0); const [tx, ty] = px(34, 0);
        ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.fillStyle = '#9c27b0';
        ctx.shadowColor = '#ce93d8'; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        break;
      }
      case 'whip': {
        ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 2.5;
        ctx.beginPath();
        const [a1x, a1y] = px(8, 0);
        const [a2x, a2y] = px(18, -6);
        const [a3x, a3y] = px(28, 4);
        const [a4x, a4y] = px(40, -3);
        ctx.moveTo(a1x, a1y);
        ctx.bezierCurveTo(a2x, a2y, a3x, a3y, a4x, a4y);
        ctx.stroke();
        break;
      }
      case 'chain': {
        ctx.strokeStyle = '#9e9e9e'; ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const [lx, ly] = px(10 + i * 6, 0);
          ctx.beginPath(); ctx.arc(lx, ly, 2.5, 0, Math.PI * 2); ctx.stroke();
        }
        const [endx, endy] = px(46, 0);
        ctx.fillStyle = '#616161';
        ctx.beginPath(); ctx.arc(endx, endy, 4, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'knuckles': {
        ctx.fillStyle = '#bdbdbd';
        for (let i = 0; i < 4; i++) {
          const [kx, ky] = px(10 + i * 5, 0);
          ctx.beginPath(); ctx.arc(kx, ky, 3, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'dual': {
        for (const off of [-4, 4]) {
          const [hx, hy] = px(8, off);
          const [tipx, tipy] = px(28, off);
          ctx.strokeStyle = '#d8d8e0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipx, tipy); ctx.stroke();
        }
        break;
      }
      default: {
        const [hx, hy] = px(10, 0); const [tipx, tipy] = px(28, 0);
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipx, tipy); ctx.stroke();
      }
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
    const acct = await StorageMgr.getAccount(account.username); if (!acct) return;
    const c = charRef.current;
    c.lastZone = world.current.zone; c.currentFloor = world.current.floor;
    acct.character = c;
    await StorageMgr.setAccount(account.username, acct);
  }

  async function doLogin(u, pw, setErr) {
    if (!u || !pw) { setErr('Enter username and password'); return; }
    const acct = await StorageMgr.getAccount(u);
    if (!acct) { setErr('No account with that name. Click Create Account.'); return; }
    if (acct.passHash !== simpleHash(pw)) { setErr('Wrong password'); return; }
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
    if (!u || !pw) { setErr('Enter username and password'); return; }
    if (u.length < 3) { setErr('Username must be 3+ characters'); return; }
    if (pw.length < 4) { setErr('Password must be 4+ characters'); return; }
    if (pw !== pw2) { setErr('Passwords do not match'); return; }
    const existing = await StorageMgr.getAccount(u);
    if (existing) { setErr('Username already taken'); return; }
    await StorageMgr.setAccount(u, { passHash: simpleHash(pw), character: null });
    onSuccess();
  }

  function gradeColor(g) {
    return { S: 'text-yellow-300', A: 'text-purple-300', B: 'text-blue-300',
      C: 'text-green-300', D: 'text-slate-300', E: 'text-slate-400', F: 'text-slate-500' }[g] || 'text-white';
  }

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
            <button onClick={() => setScreen('register')} className="text-purple-300 hover:text-purple-200 underline">
              Create one
            </button>
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

  function CharacterCreator() {
    const [hair, setHair] = useState('#3b2316');
    const [eye, setEye] = useState('#2196f3');
    const [skin, setSkin] = useState('#f4c2a1');
    const [hairstyle, setHairstyle] = useState('short');
    const [weapon, setWeapon] = useState('sword');
    const [code, setCode] = useState('');
    const [preview, setPreview] = useState(null);
    const [name, setName] = useState('');
    const hasCode = code && ADMIN_CODES[code];

    function buildAndStart() {
      if (!name.trim()) { setMsg('Enter a character name'); return; }
      let attrs, affinities, bonusLevel = 0, bonusCoins = 0;
      if (hasCode) {
        const cc = ADMIN_CODES[code];
        attrs = cc.attrs.map(a => ({ ...a }));
        affinities = JSON.parse(JSON.stringify(cc.affs));
        bonusLevel = cc.bonusLevel || 0; bonusCoins = cc.bonusCoins || 0;
        for (const k of Object.keys(affinities)) {
          if (!('exp' in affinities[k])) affinities[k].exp = 0;
          if (affinities[k].sub && !('subExp' in affinities[k])) affinities[k].subExp = 0;
        }
      } else {
        attrs = preview ? preview.attrs : rollCharacterAttrs();
        affinities = preview ? preview.affinities : rollCharacterAffinities();
      }
      const level = 1 + bonusLevel;
      const maxHp = 200 + (level - 1) * 10;
      const maxMana = 10 + (level - 1) * 5;
      const maxEnergy = 10 + (level - 1) * 5;
      const knownAbilities = {};
      for (const [aff, data] of Object.entries(affinities)) {
        const list = ABILITIES[aff] || [];
        knownAbilities[aff] = list.filter(a => a.lvl <= data.level).map(a => a.n);
        if (data.sub) {
          const sl = SUB_ABILITIES[data.sub] || [];
          knownAbilities[data.sub] = sl.filter(a => a.lvl <= (data.subLevel || 1)).map(a => a.n);
        }
      }
      const newChar = {
        name: name.trim(), hair, eye, skin, hairstyle, weapon,
        attrs, affinities,
        equippedAttrs: attrs.slice(0, MAX_EQUIPPED_ATTRS).map(a => a.key),
        knownAbilities, equippedAbilityList: [],
        ownedWeapons: [weapon],
        statusEffects: [],
        level, exp: 0, maxHp, hp: maxHp, maxMana, mana: maxMana, maxEnergy, energy: maxEnergy,
        inventory: [], coins: 100 + bonusCoins,
        unlockedFloor: 1, currentFloor: 1, lastZone: 'starting',
      };
      setChar(newChar);
      (async () => {
        const acct = await StorageMgr.getAccount(account.username);
        acct.character = newChar;
        await StorageMgr.setAccount(account.username, acct);
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
    const hairOptions = ['#3b2316', '#000', '#f9d71c', '#c1440e', '#ffffff', '#9c27b0', '#03a9f4', '#e91e63'];
    const eyeOptions = ['#2196f3', '#4caf50', '#795548', '#ff9800', '#9c27b0', '#f44336'];
    const skinOptions = ['#f4c2a1', '#deb887', '#a08060', '#8d5524', '#5d3924', '#fadbb5'];
    const hairstyles = ['short', 'long', 'spiky'];
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
                <div className="flex gap-2">
                  {hairstyles.map(s => (
                    <button key={s} onClick={() => setHairstyle(s)}
                      className={`px-3 py-1 rounded ${hairstyle === s ? 'bg-purple-700' : 'bg-slate-700 hover:bg-slate-600'}`}>{s}</button>
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
              {preview && hasCode && (
                <div className="text-sm space-y-2 mb-3">
                  <div className="text-yellow-400 text-xs">⚡ Code applied: {preview.codeNote}</div>
                </div>
              )}
              <div className="text-xs text-slate-400 italic mb-3">
                Stats are randomly generated when you click Create Character. You cannot reroll without an admin code.
              </div>
              <button onClick={buildAndStart}
                className="w-full py-2 bg-green-700 hover:bg-green-600 rounded font-bold">Create Character</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            {statuses.length > 0 && (
              <div className="mt-1 flex gap-1 flex-wrap">
                {statuses.map((s, i) => (
                  <span key={i} className="text-xs px-1 rounded bg-slate-700">{s.kind} {s.dur.toFixed(1)}s</span>
                ))}
              </div>
            )}
          </div>
          <div className="bg-black/70 p-2 rounded pointer-events-auto text-xs border border-purple-700">
            <div className="text-purple-200 font-bold">{world.current.zone === 'dungeon' ? `Dungeon F${world.current.floor} (${world.current.maze?.type || ''})` : world.current.zone === 'starting' ? 'Starting Field' : 'Main Hub'}</div>
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
    const slots = [];
    for (let i = 0; i < MAX_EQUIPPED_ATTRS; i++) {
      const k = eqAttrs[i];
      if (k && ATTRS[k]) slots.push({ key: `${i + 1}`, label: ATTRS[k].n, grade: char.attrs.find(a => a.key === k)?.grade, color: '#fbc02d' });
      else slots.push(null);
    }
    const letters = ['Q', 'E', 'R', 'F', 'G'];
    for (let i = 0; i < MAX_EQUIPPED_ABILITIES; i++) {
      const e = eqAbils[i];
      if (e) {
        const color = e.isSub ? SUB_COLOR[e.aff] : AFFS[e.aff]?.color;
        slots.push({ key: letters[i], label: e.name, color });
      } else slots.push({ key: letters[i], label: '—', color: '#444' });
    }
    return (
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none flex-wrap justify-center max-w-full">
        {slots.map((s, i) => (
          <div key={i} className="bg-black/80 border border-slate-600 rounded w-20 h-16 p-1 text-xs text-white text-center">
            <div className="text-slate-400 text-xs">[{s?.key || '-'}]</div>
            <div className="text-xs truncate" style={{ color: s?.color || '#444' }}>{s?.label || '·'}</div>
            {s?.grade && <div className={`text-xs ${gradeColor(s.grade)}`}>{s.grade}</div>}
          </div>
        ))}
      </div>
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
            <div className="font-bold text-purple-300 mb-1">Attributes ({char.attrs.length}/10)</div>
            {char.attrs.map((a, i) => (
              <div key={i} className="mb-1">
                <span className={gradeColor(a.grade)}>[{a.grade}]</span> <span>{ATTRS[a.key]?.n}</span>
                <div className="text-xs text-slate-400">{ATTRS[a.key]?.d}</div>
              </div>
            ))}
            <div className="font-bold text-purple-300 mb-1 mt-2">Affinities</div>
            {Object.entries(char.affinities).map(([k, v]) => (
              <div key={k} className="mb-2">
                <div style={{ color: AFFS[k]?.color }}>{k} · Lv {v.level} ({v.exp}/{affinityExpForLevel(v.level)})</div>
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
      else {
        if (eq.length >= MAX_EQUIPPED_ATTRS) { setMsg(`You can only equip ${MAX_EQUIPPED_ATTRS} attributes`); return; }
        eq.push(key);
      }
      c.equippedAttrs = eq; setChar({ ...c });
    }
    function toggleAbility(entry) {
      const eq = [...(c.equippedAbilityList || [])];
      const idx = eq.findIndex(e => e.name === entry.name && e.aff === entry.aff);
      if (idx >= 0) eq.splice(idx, 1);
      else {
        if (eq.length >= MAX_EQUIPPED_ABILITIES) { setMsg(`You can only equip ${MAX_EQUIPPED_ABILITIES} abilities`); return; }
        eq.push(entry);
      }
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
                        <span className="text-slate-400">[{['Q', 'E', 'R', 'F', 'G'][i]}]</span>{' '}
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
            <div className="text-purple-300 text-sm font-bold mb-1">Known</div>
            <div className="flex flex-col gap-1">
              {knownAbilityEntries.map((e, i) => {
                const equipped = (c.equippedAbilityList || []).some(x => x.name === e.name && x.aff === e.aff);
                const color = e.isSub ? SUB_COLOR[e.aff] : AFFS[e.aff]?.color;
                return (
                  <div key={i} className="bg-slate-900 px-2 py-1 rounded flex justify-between items-center">
                    <span>
                      <strong style={{ color }}>{e.name}</strong>{' '}
                      <span className="text-xs text-slate-400">({e.aff} lv{e.lvl} · {e.d}dmg · {e.m}mp · {e.k})</span>
                    </span>
                    <button onClick={() => toggleAbility(e)}
                      className={`rounded px-2 py-0.5 text-xs ${equipped ? 'bg-slate-700 text-slate-400' : 'bg-green-700 hover:bg-green-600'}`}>
                      {equipped ? 'Equipped' : 'Equip'}
                    </button>
                  </div>
                );
              })}
              {knownAbilityEntries.length === 0 && <div className="text-slate-500 text-xs italic">No abilities learned yet.</div>}
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
                      <div className={`font-bold ${gradeColor(item.grade)}`}>[{item.grade}]</div>
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
    const tab = shopTab;
    const setTab = setShopTab;
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
                    if (char.inventory.length >= 20) { setMsg('Inventory full'); return; }
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
                  <div className={`font-bold ${gradeColor(item.grade)}`}>[{item.grade}] {item.name}</div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-yellow-400">🪙 {value}</span>
                    <button onClick={() => {
                      char.coins += value;
                      char.inventory = char.inventory.filter((_, j) => j !== i);
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
        <p className="text-sm text-slate-400 mb-3">Unlocked: {char.unlockedFloor}. Floors cycle through 10 types.</p>
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: 100 }).map((_, i) => {
            const f = i + 1;
            const locked = f > char.unlockedFloor;
            const isBoss = f % 10 === 0;
            return (
              <button key={f} disabled={locked}
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
      return { name: pick(['Riven', 'Kael', 'Zara', 'Mira', 'Thane', 'Ivy', 'Soren', 'Lyra']), level: lv };
    }
    function fight(opp) {
      const myPower = char.level * 100 + Object.values(char.affinities).reduce((s, a) => s + a.level * 10, 0);
      const oppPower = opp.level * 100;
      const myRoll = myPower * (0.7 + rand() * 0.6);
      const oppRoll = oppPower * (0.7 + rand() * 0.6);
      if (myRoll > oppRoll) {
        const win = 50 + opp.level * 5;
        char.coins += win; grantExp(opp.level * 10);
        setMsg(`Victory vs ${opp.name}! +${win} coins`);
      } else {
        const loss = Math.min(char.coins, 20 + opp.level * 3);
        char.coins -= loss; char.hp = Math.max(1, Math.floor(char.hp / 2));
        setMsg(`Defeated by ${opp.name}. -${loss} coins, lost half HP`);
      }
      setChar({ ...char }); setOpponent(null);
    }
    return (
      <ModalBox title="PvP Arena (vs AI)" onClose={() => setModal(null)}>
        {!opponent ? (
          <button onClick={() => setOpponent(genOpp())}
            className="w-full py-2 bg-red-700 hover:bg-red-600 rounded font-bold">Find Opponent</button>
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

  // ===== NEW: Blacksmith =====
  function BlacksmithModal() {
    const c = char;
    return (
      <ModalBox title="Blacksmith — Weapons" onClose={() => setModal(null)}>
        <div className="text-yellow-400 mb-3">🪙 {c.coins} coins · Equipped: <span className="text-yellow-300">{WEAPONS[c.weapon]?.n}</span></div>
        <div className="text-purple-300 font-bold mb-2">Your Collection</div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(c.ownedWeapons || []).map(wk => {
            const w = WEAPONS[wk]; if (!w) return null;
            const equipped = c.weapon === wk;
            return (
              <div key={wk} className="bg-slate-900 p-2 rounded">
                <div className="font-bold">{w.n}</div>
                <div className="text-xs text-slate-400">{w.style}</div>
                <div className="text-xs mt-1">Dmg {w.dmg} · Spd {w.spd}{w.ranged ? ' · Ranged' : ''}</div>
                <button onClick={() => { c.weapon = wk; setChar({ ...c }); setMsg(`Equipped ${w.n}`); }}
                  disabled={equipped}
                  className={`mt-1 w-full text-xs py-1 rounded ${equipped ? 'bg-slate-700 text-slate-400' : 'bg-green-700 hover:bg-green-600'}`}>
                  {equipped ? 'Equipped' : 'Equip'}
                </button>
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
                <div className="text-xs mt-1">Dmg {w.dmg} · Spd {w.spd}</div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-yellow-400">🪙 {s.price}</span>
                  <button onClick={() => {
                    if (owned) { setMsg('Already owned'); return; }
                    if (c.coins < s.price) { setMsg('Not enough coins'); return; }
                    c.coins -= s.price;
                    c.ownedWeapons.push(s.key);
                    setChar({ ...c });
                    setMsg(`Bought ${w.n}! Equip it in your collection above.`);
                  }} disabled={owned}
                    className={`text-xs py-1 px-2 rounded ${owned ? 'bg-slate-700 text-slate-400' : 'bg-green-700 hover:bg-green-600'}`}>
                    {owned ? 'Owned' : 'Buy'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </ModalBox>
    );
  }

  // ===== NEW: Attribute trainer =====
  function TrainerModal() {
    const c = char;
    const g = trainerGrade;
    const cfg = ATTRIBUTE_TRAINER[g];
    const knownKeys = (c.attrs || []).map(a => a.key);
    function buyTraining() {
      if (c.attrs.length >= 10) { setMsg('You already know the maximum of 10 attributes'); return; }
      if (c.coins < cfg.price) { setMsg('Not enough coins'); return; }
      const key = pickAttrByGrade(g, knownKeys);
      if (!key || knownKeys.includes(key)) { setMsg('No new attributes of that grade available — pick a different grade.'); return; }
      c.coins -= cfg.price;
      c.attrs = [...c.attrs, { key, grade: g }];
      setChar({ ...c });
      setMsg(`Learned: ${ATTRS[key]?.n} (${g}). Open Loadout (L) to equip.`);
    }
    return (
      <ModalBox title="Attribute Trainer" onClose={() => setModal(null)}>
        <div className="text-yellow-400 mb-3">🪙 {c.coins} coins · Known: {c.attrs.length}/10</div>
        <p className="text-sm text-slate-400 mb-3">Pay to learn a new attribute at a chosen grade. Stops at 10 known.</p>
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
              disabled={c.coins < cfg.price || c.attrs.length >= 10}
              className={`px-3 py-1 rounded ${c.coins < cfg.price || c.attrs.length >= 10 ? 'bg-slate-700 text-slate-400' : 'bg-green-700 hover:bg-green-600'}`}>
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

  // ===== NEW: Mystery Boxes =====
  function MysteryModal() {
    const c = char;
    const spin = boxSpin;
    function openBox(key) {
      const box = MYSTERY_BOXES[key];
      if (c.coins < box.price) { setMsg('Not enough coins'); return; }
      c.coins -= box.price;
      setChar({ ...c });
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
          else if (r.kind === 'weapon') {
            if (!c.ownedWeapons.includes(r.key)) c.ownedWeapons.push(r.key);
          }
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
                    <button onClick={() => openBox(key)}
                      disabled={c.coins < box.price}
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
            <button onClick={closeReveal}
              className="mt-4 px-4 py-1 bg-purple-700 hover:bg-purple-600 rounded">Continue</button>
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
          <canvas
            ref={canvasRef}
            width={vp.w}
            height={vp.h}
            onMouseMove={handleMouse}
            onMouseDown={(e) => { handleMouse(e); doBasicAttack(); }}
            className="block"
            style={{ width: '100vw', height: '100vh', cursor: 'crosshair' }}
          />
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