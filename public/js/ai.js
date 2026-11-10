/**
 * ai.js - State machine AI for solo / practice mode with progressive difficulty scaling.
 */
import { ATK, randomRange } from './config.js?v=2.4.3';

export function getAIParameters(level) {
  return {
    speed: Math.min(3.5, 2.5 + 0.2 * level),
    aggr: Math.min(0.85, 0.35 + 0.09 * level),
    block: Math.min(0.65, 0.12 + 0.09 * level),
    think: Math.max(6, 26 - 3 * level),
    hp: Math.min(140, 100 + 8 * (level - 1)),
    chain: Math.min(0.3, 0.03 + 0.03 * level)
  };
}

export class AIEngine {
  constructor() {
    this.mode = 'wait';
    this.mt = 40;
    this.seen = false;
  }

  reset() {
    this.mode = 'wait';
    this.mt = 40;
    this.seen = false;
  }

  think(e, p, level) {
    const pr = getAIParameters(level);
    const inp = {};

    if (e.ko || p.ko || e.stun > 0) return inp;

    const dx = p.x - e.x;
    const dist = Math.abs(dx);
    const towards = dx > 0 ? 'right' : 'left';
    const away = dx > 0 ? 'left' : 'right';

    // React to incoming player attacks
    if (p.atk && !this.seen) {
      this.seen = true;
      if (dist < 110 && Math.random() < pr.block) {
        this.mode = 'block';
        this.mt = Math.floor(randomRange(14, 26));
      } else if (dist < 80 && Math.random() < 0.18) {
        this.mode = 'retreat';
        this.mt = Math.floor(randomRange(10, 18));
      }
    }
    if (!p.atk) this.seen = false;

    // Combo chaining if current attack connected
    if (e.atk) {
      const A = ATK[e.atk.type];
      if (e.atk.connected && e.atk.f >= A.su + A.ac && Math.random() < pr.chain) {
        inp[Math.random() < 0.55 ? 'punch' : 'kick'] = true;
      }
      return inp;
    }

    this.mt--;
    if (this.mode === 'approach' && dist < 72) this.mt = 0;

    if (this.mt <= 0) {
      const r = Math.random();
      if (dist > 96) {
        if (r < 0.1) {
          this.mode = 'jump';
          this.mt = 1;
        } else {
          this.mode = 'approach';
          this.mt = Math.floor(randomRange(8, 24));
        }
      } else if (dist > 78) {
        if (r < pr.aggr * 0.7) {
          this.mode = 'kick';
          this.mt = 1;
        } else if (r < 0.85) {
          this.mode = 'approach';
          this.mt = Math.floor(randomRange(5, 12));
        } else {
          this.mode = 'wait';
          this.mt = Math.floor(randomRange(6, 14));
        }
      } else {
        if (r < pr.aggr * 0.6) {
          this.mode = 'punch';
          this.mt = 1;
        } else if (r < pr.aggr * 0.6 + 0.15) {
          this.mode = 'kick';
          this.mt = 1;
        } else if (r < 0.88) {
          this.mode = 'retreat';
          this.mt = Math.floor(randomRange(10, 22));
        } else {
          this.mode = 'wait';
          this.mt = Math.floor(randomRange(6, 14));
        }
      }
    }

    switch (this.mode) {
      case 'approach':
        inp[towards] = true;
        break;
      case 'retreat':
        inp[away] = true;
        break;
      case 'block':
        inp.block = true;
        break;
      case 'jump':
        inp.jump = true;
        inp[towards] = true;
        this.mode = 'approach';
        this.mt = Math.floor(randomRange(6, 14));
        break;
      case 'punch':
      case 'kick':
        inp[this.mode] = true;
        this.mode = 'wait';
        this.mt = Math.max(4, Math.floor(pr.think * randomRange(0.4, 1.1)));
        break;
    }

    return inp;
  }
}
