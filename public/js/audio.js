/**
 * audio.js - Procedural Web Audio API sound synthesizer engine (zero MP3/WAV assets).
 */
import { SETTINGS, saveSettings } from './config.js?v=2.4.2';

class AudioEngine {
  constructor() {
    this.ac = null;
    this.noiseBuf = null;
    this.muted = SETTINGS.mute;
  }

  init() {
    if (!this.ac) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ac = new AudioCtx();
        const len = this.ac.sampleRate * 0.5;
        this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
        const data = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          data[i] = Math.random() * 2 - 1;
        }
      } catch {
        this.ac = null;
      }
    }
    if (this.ac && this.ac.state === 'suspended') {
      this.ac.resume().catch(() => {});
    }
  }

  setMute(isMuted) {
    this.muted = isMuted;
    SETTINGS.mute = isMuted;
    saveSettings();
  }

  setVolume(vol) {
    SETTINGS.vol = vol;
    saveSettings();
  }

  noise(duration, frequency, gainVal, filterType = 'lowpass') {
    if (!this.ac || this.muted) return;
    try {
      const src = this.ac.createBufferSource();
      src.buffer = this.noiseBuf;

      const filter = this.ac.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = frequency;

      const gain = this.ac.createGain();
      const t = this.ac.currentTime;

      gain.gain.setValueAtTime(gainVal * SETTINGS.vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.ac.destination);

      src.start(t);
      src.stop(t + duration);
    } catch {}
  }

  tone(f0, duration, gainVal, type = 'sine', f1 = null) {
    if (!this.ac || this.muted) return;
    try {
      const osc = this.ac.createOscillator();
      const gain = this.ac.createGain();
      const t = this.ac.currentTime;

      osc.type = type;
      osc.frequency.setValueAtTime(f0, t);
      if (f1) osc.frequency.exponentialRampToValueAtTime(f1, t + duration);

      gain.gain.setValueAtTime(gainVal * SETTINGS.vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      osc.connect(gain);
      gain.connect(this.ac.destination);

      osc.start(t);
      osc.stop(t + duration);
    } catch {}
  }

  play(soundName) {
    this.init();
    switch (soundName) {
      case 'whoosh':
        this.noise(0.12, 1800, 0.05, 'bandpass');
        break;
      case 'hit':
        this.noise(0.14, 900, 0.3);
        this.tone(120, 0.12, 0.22, 'sine', 55);
        break;
      case 'big':
        this.noise(0.2, 700, 0.4);
        this.tone(90, 0.2, 0.3, 'sine', 40);
        break;
      case 'block':
        this.tone(230, 0.08, 0.12, 'square', 150);
        this.noise(0.05, 3000, 0.08, 'highpass');
        break;
      case 'jump':
        this.tone(300, 0.12, 0.04, 'sine', 520);
        break;
      case 'ko':
        this.tone(150, 0.7, 0.25, 'sawtooth', 38);
        this.noise(0.5, 400, 0.3);
        break;
      case 'gong':
        this.tone(196, 0.9, 0.1, 'sine');
        this.tone(392, 0.7, 0.04, 'sine');
        break;
    }
  }
}

export const audio = new AudioEngine();
