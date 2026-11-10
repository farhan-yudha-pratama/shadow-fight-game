/**
 * physics.js - 2D physics simulation, anatomical bone-based hitboxes, collision detection, and combat engine.
 */
import { CANVAS_WIDTH, GROUND_Y, ATK, clamp } from './config.js?v=2.4.3';

export function createFighter(x, face, isPlayer) {
  return {
    isP: isPlayer,
    x,
    y: GROUND_Y,
    vx: 0,
    vy: 0,
    kb: 0,
    face, // 1: facing right, -1: facing left
    hp: 100,
    max: 100,
    atk: null,
    stun: 0,
    block: false,
    ko: false,
    koT: 0,
    air: false,
    ph: 0,
    t: 0,
    flash: 0,
    speed: 3.2,
    buf: { jump: 0, punch: 0, kick: 0 }
  };
}

export function applyPhysics(f) {
  f.x += f.vx + f.kb;
  f.kb *= 0.8;
  if (Math.abs(f.kb) < 0.05) f.kb = 0;

  if (f.air) {
    f.vy += 0.62; // Gravity
    f.y += f.vy;
    if (f.y >= GROUND_Y) {
      f.y = GROUND_Y;
      f.vy = 0;
      f.air = false;
      f.vx *= 0.3;
    }
  }
  f.x = clamp(f.x, 28, CANVAS_WIDTH - 28);
}

export function stepFighter(f, o, inp, onSfx) {
  f.t++;
  if (f.flash > 0) f.flash--;

  if (f.ko) {
    f.koT++;
    f.vx = 0;
    applyPhysics(f);
    return;
  }

  // Update input buffers
  for (const k in f.buf) {
    if (inp[k]) f.buf[k] = 8;
    else if (f.buf[k] > 0) f.buf[k]--;
  }

  const stunned = f.stun > 0;
  if (stunned) {
    f.stun--;
    f.atk = null;
    f.block = false;
    f.vx = 0;
  }

  const attacking = !!f.atk;
  if (!stunned && !attacking && !f.air) {
    f.face = o.x >= f.x ? 1 : -1;
  }

  f.block = !stunned && !attacking && !f.air && !!inp.block;
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);

  if (!stunned) {
    if (f.block) {
      f.vx = 0;
    } else if (!f.air) {
      if (attacking) f.vx *= 0.8;
      else f.vx = dir * f.speed * (dir === f.face ? 1 : 0.8);
    } else if (dir) {
      f.vx = dir * f.speed * 0.9;
    }
  }

  // Jump
  if (!stunned && !f.air && !attacking && !f.block && f.buf.jump > 0) {
    f.vy = -12.2;
    f.air = true;
    f.buf.jump = 0;
    if (onSfx) onSfx('jump');
  }

  // Trigger attacks
  const canStartAttack = !stunned && (!f.atk || (f.atk.connected && f.atk.f >= ATK[f.atk.type].su + ATK[f.atk.type].ac));
  if (canStartAttack) {
    let attackType = null;
    if (f.buf.punch > 0) attackType = 'punch';
    else if (f.buf.kick > 0) attackType = 'kick';

    if (attackType) {
      f.buf[attackType] = 0;
      f.atk = { type: attackType, f: 0, connected: false };
      f.block = false;
      if (onSfx) onSfx('whoosh');
    }
  }

  if (f.atk) {
    const A = ATK[f.atk.type];
    f.atk.f++;
    if (f.atk && f.atk.f >= A.su + A.ac + A.rec) {
      f.atk = null;
    }
  }

  if (!f.air) {
    f.ph += f.vx * f.face * 0.09;
  }

  applyPhysics(f);
}

export function separateFighters(a, b) {
  const dx = b.x - a.x;
  const minDistance = 34;
  if (Math.abs(dx) < minDistance && a.y > GROUND_Y - 50 && b.y > GROUND_Y - 50) {
    const push = (minDistance - Math.abs(dx)) / 2;
    const sign = dx >= 0 ? 1 : -1;
    a.x = clamp(a.x - sign * push, 28, CANVAS_WIDTH - 28);
    b.x = clamp(b.x + sign * push, 28, CANVAS_WIDTH - 28);
  }
}

/* =========================================================================
 * Anatomical Skeletal Kinematics & Hitbox Detection Engine
 * ========================================================================= */

export function solve2BoneIK(origin, target, l1, l2, bend) {
  const dx = target[0] - origin[0];
  const dy = target[1] - origin[1];
  let dist = Math.hypot(dx, dy);
  dist = clamp(dist, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);

  const angle = Math.atan2(dy, dx);
  const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const kneeAngle = angle + bend * Math.acos(cosA);

  return {
    k: [origin[0] + Math.cos(kneeAngle) * l1, origin[1] + Math.sin(kneeAngle) * l1],
    e: [origin[0] + Math.cos(angle) * dist, origin[1] + Math.sin(angle) * dist]
  };
}

export function calculatePose(f) {
  const t = f.t * 0.09;
  let hx = 0;
  let hy = -50 + Math.sin(t * 2) * 1.3;
  let lean = 5;
  let fF = [15, 0];
  let fB = [-15, 0];
  let mode = 'idle';
  let e = 0;

  if (f.ko || f.stun > 0) mode = 'hurt';
  else if (f.atk) mode = f.atk.type;
  else if (f.block) mode = 'block';
  else if (f.air) mode = 'air';
  else if (Math.abs(f.vx) > 0.3) mode = 'walk';

  if (f.atk) {
    const A = ATK[f.atk.type];
    const k = f.atk.f;
    if (k <= A.su) e = k / A.su;
    else if (k <= A.su + A.ac) e = 1;
    else e = 1 - (k - A.su - A.ac) / A.rec;
    e = clamp(e, 0, 1);
  }

  switch (mode) {
    case 'walk': {
      const s = Math.sin(f.ph);
      const c = Math.cos(f.ph);
      fF = [14 + 16 * s, -Math.max(0, c) * 9];
      fB = [-14 - 16 * s, -Math.max(0, -c) * 9];
      hy -= Math.abs(c) * 1.6;
      break;
    }
    case 'air':
      hy = -52;
      fF = [17, -27];
      fB = [-7, -17];
      lean = 7;
      break;
    case 'block':
      hy = -45;
      lean = 1;
      fF = [19, 0];
      fB = [-19, 0];
      break;
    case 'punch':
      lean = 5 + 9 * e;
      hx = 3 * e;
      fF = [15 + 6 * e, 0];
      fB = [-17, 0];
      break;
    case 'kick':
      hx = 8 * e;
      lean = 5 - 8 * e;
      fF = [14 + 50 * e, -(8 + 50 * e)];
      fB = [-12, 0];
      break;
    case 'hurt':
      lean = -9;
      hx = -3;
      hy = -47;
      break;
  }

  const S = [hx + lean, hy - 38];
  const Hd = [S[0] + (mode === 'hurt' ? -2 : 3), S[1] - 15];
  let hF, hB;

  switch (mode) {
    case 'punch':
      hF = [S[0] + 22 + 30 * e, S[1] + 2 - 3 * e];
      hB = [S[0] + 10, S[1] + 8];
      break;
    case 'kick':
      hF = [S[0] + 13, S[1] - 2];
      hB = [S[0] - 10, S[1] + 14];
      break;
    case 'block':
      hF = [S[0] + 15, S[1] - 15];
      hB = [S[0] + 9, S[1] - 7];
      break;
    case 'hurt':
      hF = [S[0] + 7, S[1] + 17];
      hB = [S[0] - 13, S[1] + 11];
      break;
    case 'air':
      hF = [S[0] + 18, S[1] + 2];
      hB = [S[0] + 8, S[1] + 12];
      break;
    case 'walk':
      hF = [S[0] + 19, S[1] - 2 + Math.sin(f.ph) * 2];
      hB = [S[0] + 11, S[1] + 9];
      break;
    default:
      hF = [S[0] + 19 + Math.sin(t * 2) * 1.2, S[1] - 3];
      hB = [S[0] + 11, S[1] + 9 + Math.sin(t * 2)];
  }

  return { hip: [hx, hy], S, Hd, fF, fB, hF, hB, mode };
}

export function getFighterSkeleton(f) {
  const p = calculatePose(f);
  const legF = solve2BoneIK(p.hip, p.fF, 28, 28, -1);
  const legB = solve2BoneIK(p.hip, p.fB, 28, 28, -1);
  const armF = solve2BoneIK(p.S, p.hF, 22, 22, 1);
  const armB = solve2BoneIK(p.S, p.hB, 22, 22, 1);

  const toWorld = pt => [f.x + pt[0] * f.face, f.y + pt[1]];

  return {
    head: toWorld(p.Hd),
    shoulder: toWorld(p.S),
    hip: toWorld(p.hip),
    handF: toWorld(armF.e),
    handB: toWorld(armB.e),
    elbowF: toWorld(armF.k),
    footF: toWorld(legF.e),
    footB: toWorld(legB.e),
    kneeF: toWorld(legF.k),
    kneeB: toWorld(legB.k)
  };
}

/**
 * Returns all receiver hurtboxes (head, torso, legs) in world coordinates.
 */
export function getFighterHurtboxes(f) {
  const sk = getFighterSkeleton(f);
  return [
    // Head circle (R = 13)
    { type: 'circle', name: 'head', x: sk.head[0], y: sk.head[1], r: 13 },
    // Torso capsule from Shoulder to Hip (R = 16)
    { type: 'capsule', name: 'torso', p1: sk.shoulder, p2: sk.hip, r: 16 },
    // Front Leg thigh capsule: Hip -> Knee (R = 12)
    { type: 'capsule', name: 'leg', p1: sk.hip, p2: sk.kneeF, r: 12 },
    // Front Leg calf capsule: Knee -> Foot (R = 12)
    { type: 'capsule', name: 'leg', p1: sk.kneeF, p2: sk.footF, r: 12 },
    // Back Leg thigh capsule: Hip -> Knee (R = 11)
    { type: 'capsule', name: 'leg', p1: sk.hip, p2: sk.kneeB, r: 11 },
    // Back Leg calf capsule: Knee -> Foot (R = 11)
    { type: 'capsule', name: 'leg', p1: sk.kneeB, p2: sk.footB, r: 11 }
  ];
}

/**
 * Returns active attacking hitbox located at the fist or foot extremity.
 */
export function getFighterAttackHitbox(f) {
  if (!f.atk) return null;
  const A = ATK[f.atk.type];

  // Active frames check: only active after startup, before recovery
  if (f.atk.f <= A.su || f.atk.f > A.su + A.ac) {
    return null;
  }

  const sk = getFighterSkeleton(f);
  if (f.atk.type === 'punch') {
    // Punch hitbox at front hand fist (R = 15)
    return { type: 'circle', name: 'fist', x: sk.handF[0], y: sk.handF[1], r: 15 };
  } else if (f.atk.type === 'kick') {
    // Kick hitbox at front foot (R = 17)
    return { type: 'circle', name: 'foot', x: sk.footF[0], y: sk.footF[1], r: 17 };
  }
  return null;
}

/**
 * Geometric collision check between attack hitbox and defender hurtboxes.
 * Returns contact details if hit, or null if no intersection.
 */
export function checkHitbox(attacker, defender) {
  if (defender.ko || !attacker.atk) return null;

  const attackBox = getFighterAttackHitbox(attacker);
  if (!attackBox) return null;

  const hurtboxes = getFighterHurtboxes(defender);

  for (const hb of hurtboxes) {
    if (hb.type === 'circle') {
      // Circle to Circle collision (Fist/Foot vs Head)
      const dist = Math.hypot(attackBox.x - hb.x, attackBox.y - hb.y);
      if (dist <= attackBox.r + hb.r) {
        const factor = dist > 0 ? attackBox.r / dist : 0.5;
        return {
          hit: true,
          hitPart: hb.name,
          contactX: attackBox.x + (hb.x - attackBox.x) * factor,
          contactY: attackBox.y + (hb.y - attackBox.y) * factor
        };
      }
    } else if (hb.type === 'capsule') {
      // Circle to Capsule line segment collision (Fist/Foot vs Torso/Legs)
      const [ax, ay] = hb.p1;
      const [bx, by] = hb.p2;
      const px = attackBox.x;
      const py = attackBox.y;

      const dx = bx - ax;
      const dy = by - ay;
      const lenSq = dx * dx + dy * dy;

      const t = lenSq > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1) : 0;
      const qx = ax + t * dx;
      const qy = ay + t * dy;
      const dist = Math.hypot(px - qx, py - qy);

      if (dist <= attackBox.r + hb.r) {
        const factor = dist > 0 ? attackBox.r / dist : 0.5;
        return {
          hit: true,
          hitPart: hb.name,
          contactX: px + (qx - px) * factor,
          contactY: py + (qy - py) * factor
        };
      }
    }
  }

  return null;
}

export function applyDamageAndEffects(attacker, defender, arg3, arg4, arg5) {
  let events = {};
  let attackData = null;
  let hitInfo = null;

  // Flexible argument parsing
  for (const arg of [arg3, arg4, arg5]) {
    if (!arg) continue;
    if (typeof arg === 'object') {
      if ('onSparks' in arg || 'onSfx' in arg || 'onHitstop' in arg || 'onShake' in arg || 'onCombo' in arg) {
        events = arg;
      } else if ('contactX' in arg || 'hitPart' in arg) {
        hitInfo = arg;
      } else if ('dmg' in arg || 'su' in arg) {
        attackData = arg;
      }
    }
  }

  const actualAtk = attackData || (attacker.atk ? ATK[attacker.atk.type] : ATK.punch) || { dmg: 7, knock: 3.5, stun: 16, hs: 3 };
  const isKick = actualAtk === ATK.kick || (actualAtk && actualAtk.dmg > 10);
  const isHeadshot = hitInfo && hitInfo.hitPart === 'head';

  // 20% bonus damage on headshot hits!
  const dmgMultiplier = isHeadshot ? 1.2 : 1.0;
  const damageDealt = Math.round(actualAtk.dmg * dmgMultiplier);

  const blocked = defender.block && defender.face === -attacker.face;

  // Exact physical contact coordinates
  const hitX = hitInfo?.contactX ?? (defender.x - attacker.face * 12);
  const hitY = hitInfo?.contactY ?? (defender.y - (isKick ? 38 : 80));

  // Trigger mobile haptic feedback if available
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(blocked ? 20 : 45); } catch {}
  }

  if (blocked) {
    defender.hp = Math.max(1, defender.hp - Math.max(1, Math.round(damageDealt * 0.15)));
    defender.kb = attacker.face * actualAtk.knock * 0.7;
    attacker.kb = -attacker.face * 1.2;

    events?.onSparks?.(hitX, hitY, 6, '#8fe9ff', attacker.face);
    events?.onSfx?.('block');
    events?.onHitstop?.(3);
    events?.onShake?.(2);
    return;
  }

  defender.hp -= damageDealt;
  defender.stun = actualAtk.stun;
  defender.atk = null;
  defender.block = false;
  defender.kb = attacker.face * actualAtk.knock;
  defender.flash = 6;

  if (defender.air) defender.vy = -4;

  const sparkCount = isHeadshot ? 18 : (isKick ? 14 : 9);
  const sparkColor = isHeadshot ? '#ffe785' : '#ffd2a8';

  events?.onSparks?.(hitX, hitY, sparkCount, sparkColor, attacker.face);
  events?.onSfx?.(isKick ? 'big' : 'hit');
  events?.onHitstop?.(actualAtk.hs);
  events?.onShake?.(damageDealt * 0.55);
  events?.onCombo?.(attacker);

  if (defender.hp <= 0) {
    defender.hp = 0;
    defender.ko = true;
    defender.koT = 0;
    defender.kb = attacker.face * 10;
    defender.vy = -6;
    defender.air = true;
    defender.atk = null;
    events?.onSfx?.('ko');
  }
}
