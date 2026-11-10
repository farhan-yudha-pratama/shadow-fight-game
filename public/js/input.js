/**
 * input.js - Keyboard listeners, virtual touch analog & buttons, and bitmask serialization.
 */
import { KEYMAP } from './config.js?v=2.4.3';
import { audio } from './audio.js?v=2.4.3';

export const ACTION_KEYS = ['left', 'right', 'block', 'jump', 'punch', 'kick'];

export function encodeInput(i) {
  return ACTION_KEYS.reduce((s, k, b) => s | (i[k] ? 1 << b : 0), 0);
}

export function decodeInput(v) {
  const i = {};
  ACTION_KEYS.forEach((k, b) => {
    if ((v >> b) & 1) i[k] = true;
  });
  return i;
}

export class InputManager {
  constructor() {
    this.down = new Set();
    this.touch = {};
    this.pressed = { jump: false, punch: false, kick: false };
    this.joyId = null;
    this.joyUp = false;

    this.bindKeyboard();
    this.bindTouchControls();
  }

  isHeld(actionKey) {
    return !!this.touch[actionKey] || [...this.down].some(code => KEYMAP[code] === actionKey);
  }

  pollPlayerInput() {
    const input = {
      left: this.isHeld('left'),
      right: this.isHeld('right'),
      block: this.isHeld('block'),
      jump: this.pressed.jump,
      punch: this.pressed.punch,
      kick: this.pressed.kick
    };
    // Reset one-shot presses
    this.pressed.jump = false;
    this.pressed.punch = false;
    this.pressed.kick = false;
    return input;
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const k = KEYMAP[e.code];
      if (!k) return;

      const target = e.target;
      if (target && (/^(TEXTAREA|INPUT)$/.test(target.tagName) || (target.tagName === 'BUTTON' && e.code === 'Space'))) {
        return;
      }

      e.preventDefault();
      audio.init();

      if (e.repeat) return;
      this.down.add(e.code);
      if (k in this.pressed) this.pressed[k] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.down.clear();
      for (const k in this.touch) this.touch[k] = false;
      document.querySelectorAll('.pad button.on').forEach(b => b.classList.remove('on'));
    });
  }

  bindTouchControls() {
    // Action buttons (punch, kick, block)
    document.querySelectorAll('.pad button').forEach((btn) => {
      const k = btn.dataset.k;

      const onPointerDown = (e) => {
        e.preventDefault();
        audio.init();
        this.touch[k] = true;
        if (k in this.pressed) this.pressed[k] = true;
        btn.classList.add('on');
        try { btn.setPointerCapture(e.pointerId); } catch {}
      };

      const onPointerUp = () => {
        this.touch[k] = false;
        btn.classList.remove('on');
      };

      btn.addEventListener('pointerdown', onPointerDown);
      btn.addEventListener('pointerup', onPointerUp);
      btn.addEventListener('pointercancel', onPointerUp);
      btn.addEventListener('lostpointercapture', onPointerUp);
      btn.addEventListener('contextmenu', e => e.preventDefault());
    });

    // Virtual Joystick
    const joy = document.getElementById('joy');
    const knob = document.getElementById('knob');
    if (!joy || !knob) return;

    const moveJoystick = (e) => {
      const r = joy.getBoundingClientRect();
      const R = (joy.offsetWidth - knob.offsetWidth) / 2;
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);

      // Account for 90deg CSS rotation in mobile portrait orientation
      if (matchMedia('(pointer:coarse) and (orientation:portrait)').matches) {
        [dx, dy] = [dy, -dx];
      }

      const dist = Math.hypot(dx, dy);
      if (dist > R) {
        dx *= R / dist;
        dy *= R / dist;
      }

      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.touch.left = dx < -R * 0.35;
      this.touch.right = dx > R * 0.35;

      const up = dy < -R * 0.6;
      if (up && !this.joyUp) this.pressed.jump = true;
      this.joyUp = up;
    };

    const endJoystick = () => {
      this.joyId = null;
      this.joyUp = false;
      this.touch.left = false;
      this.touch.right = false;
      knob.style.transform = '';
    };

    joy.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.joyId !== null) return;
      audio.init();
      this.joyId = e.pointerId;
      try { joy.setPointerCapture(this.joyId); } catch {}
      moveJoystick(e);
    });

    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joyId) moveJoystick(e);
    });

    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((evt) => {
      joy.addEventListener(evt, endJoystick);
    });
    joy.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', endJoystick);

    // Prompt fullscreen permission in mobile landscape
    const fsPrompt = document.getElementById('fsPrompt');
    const btnFsOk = document.getElementById('btnFsOk');
    const btnFsNo = document.getElementById('btnFsNo');

    const checkOrientationFullscreen = () => {
      const isMobile = matchMedia('(pointer:coarse)').matches;
      const isLandscape = matchMedia('(orientation:landscape)').matches;
      const alreadyDeclined = sessionStorage.getItem('fs_declined') === '1';

      if (isMobile && isLandscape && !document.fullscreenElement && !alreadyDeclined && fsPrompt) {
        fsPrompt.hidden = false;
      }
    };

    if (btnFsOk && btnFsNo && fsPrompt) {
      btnFsOk.onclick = () => {
        fsPrompt.hidden = true;
        const d = document.documentElement;
        if (d.requestFullscreen) {
          d.requestFullscreen().then(() => {
            if (screen.orientation && screen.orientation.lock) {
              screen.orientation.lock('landscape').catch(() => {});
            }
          }).catch(() => {});
        }
      };

      btnFsNo.onclick = () => {
        fsPrompt.hidden = true;
        sessionStorage.setItem('fs_declined', '1');
      };

      // Check on resize / orientation change
      window.addEventListener('resize', checkOrientationFullscreen);
      window.addEventListener('orientationchange', checkOrientationFullscreen);

      // Initial check
      setTimeout(checkOrientationFullscreen, 400);
    }
  }
}
