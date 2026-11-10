/**
 * config.js - Global constants, attack balance data, color palettes, and settings persistence.
 */

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 450;
export const GROUND_Y = 372;
export const FIXED_STEP = 1000 / 60; // 60 FPS fixed timestep

export const ATK = {
  punch: {
    su: 4,      // Startup frames
    ac: 4,      // Active hitbox frames
    rec: 9,     // Recovery frames
    dmg: 7,     // Damage dealt
    reach: 58,  // Hitbox forward reach (px)
    y0: 62,     // Hitbox bottom vertical offset
    y1: 104,    // Hitbox top vertical offset
    knock: 3.5, // Knockback impulse
    stun: 16,   // Hitstun frames
    hs: 3       // Hitstop / freeze frames
  },
  kick: {
    su: 9,
    ac: 5,
    rec: 14,
    dmg: 13,
    reach: 68,
    y0: 6,
    y1: 78,
    knock: 8,
    stun: 22,
    hs: 5
  }
};

export const ENEMY_NAMES = [
  'Bayangan Muda',
  'Penjaga Gerbang',
  'Ronin Merah',
  'Raja Bayangan'
];

export const PALETTES = [
  {
    sky0: '#160d2e', sky1: '#7a2a4a', sky2: '#f08a4b',
    glow: 'rgba(255,150,80,.55)', sun: '#ffd9a0',
    m0: '#4b2447', m1: '#2c1738', m2: '#160c24',
    g0: '#1d1022', g1: '#09050d',
    mist: 'rgba(240,138,75,.22)', edge: 'rgba(255,170,110,.45)',
    you: '#4de1d2', foe: '#ff4d5e', ember: '255,190,120'
  },
  {
    sky0: '#12040a', sky1: '#5e0f23', sky2: '#d6453d',
    glow: 'rgba(255,70,60,.5)', sun: '#ffb199',
    m0: '#3d0f1e', m1: '#240b16', m2: '#12060c',
    g0: '#1a0911', g1: '#060205',
    mist: 'rgba(214,69,61,.22)', edge: 'rgba(255,110,100,.45)',
    you: '#4de1d2', foe: '#ffb347', ember: '255,120,90'
  },
  {
    sky0: '#050a1c', sky1: '#14305c', sky2: '#5a8fb8',
    glow: 'rgba(120,190,255,.4)', sun: '#e8f3ff',
    m0: '#16294a', m1: '#0d1a33', m2: '#070d1c',
    g0: '#0b1328', g1: '#03060f',
    mist: 'rgba(110,170,230,.2)', edge: 'rgba(150,210,255,.4)',
    you: '#4de1d2', foe: '#ff4d5e', ember: '170,210,255',
    stars: true
  }
];

export const KEYMAP = {
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyW: 'jump',
  ArrowUp: 'jump',
  Space: 'jump',
  KeyS: 'block',
  ArrowDown: 'block',
  KeyJ: 'punch',
  KeyZ: 'punch',
  KeyK: 'kick',
  KeyX: 'kick'
};

const STORAGE_KEY = 'duelbayangan';

export const SETTINGS = Object.assign(
  { vol: 1, mute: false, gfx: 'hi', shake: true, name: '', debugHitboxes: false },
  (() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  })()
);

export function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SETTINGS));
  } catch {}
}

export function getDPR() {
  return SETTINGS.gfx === 'hi' ? Math.min(2, window.devicePixelRatio || 1) : 1;
}

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const randomRange = (min, max) => min + Math.random() * (max - min);
