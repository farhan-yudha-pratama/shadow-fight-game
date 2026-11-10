/**
 * ui.js - HUD elements, pop banners, combo counters, and modal dialog overlays.
 */
import { SETTINGS, saveSettings, getDPR, CANVAS_WIDTH, CANVAS_HEIGHT } from './config.js?v=2.4.3';
import { audio } from './audio.js?v=2.4.3';

export class UIManager {
  constructor() {
    this.$ = id => document.getElementById(id);
    this.hudCache = { p: -1, e: -1, c: -1 };
    this.bannerTimer = 0;
    this.onSettingsChanged = null;
  }

  showNetDiag() {
    const el = this.$('netDiag');
    if (el) el.hidden = false;
  }

  hideNetDiag() {
    const el = this.$('netDiag');
    if (el) el.hidden = true;
  }

  updateNetDiag(diag, isStalled = false) {
    if (!diag) return;
    const diagEl = this.$('netDiag');
    if (!diagEl) return;
    diagEl.hidden = false;

    const syncEl = this.$('diagSync');
    const localFEl = this.$('diagLocalF');
    const remoteFEl = this.$('diagRemoteF');
    const bufEl = this.$('diagBuf');
    const pingEl = this.$('diagPing');

    if (localFEl) localFEl.textContent = diag.frame;
    if (remoteFEl) remoteFEl.textContent = diag.remoteFrame ?? diag.lastSent;
    if (bufEl) bufEl.textContent = diag.remoteBufSize;
    if (pingEl) pingEl.textContent = diag.ping;

    if (syncEl) {
      if (isStalled && diag.stallTicks > 10) {
        syncEl.textContent = `STALL F:${diag.frame} (${diag.stallTicks}t)`;
        syncEl.className = 'diag-tag tag-stall';
      } else if (isStalled) {
        syncEl.textContent = `WAIT F:${diag.frame}`;
        syncEl.className = 'diag-tag tag-wait';
      } else {
        syncEl.textContent = 'SYNCED';
        syncEl.className = 'diag-tag tag-ok';
      }
    }
  }

  logError(msg) {
    console.error(msg);
    let banner = this.$('errBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'errBanner';
      banner.className = 'err-banner';
      document.body.appendChild(banner);
    }
    banner.hidden = false;
    banner.innerHTML = `<span class="err-text">⚠️ ${msg}</span><button type="button" class="err-close" onclick="this.parentElement.hidden=true">×</button>`;
  }

  updateHUD(pHP, pMax, eHP, eMax, clockFrames) {
    const pp = Math.max(0, (pHP / pMax) * 100);
    const ep = Math.max(0, (eHP / eMax) * 100);

    if (pp !== this.hudCache.p) {
      this.$('pFill').style.width = `${pp}%`;
      this.$('pTrail').style.width = `${pp}%`;
      this.hudCache.p = pp;
    }

    if (ep !== this.hudCache.e) {
      this.$('eFill').style.width = `${ep}%`;
      this.$('eTrail').style.width = `${ep}%`;
      this.hudCache.e = ep;
    }

    const clockSec = Math.max(0, Math.ceil(clockFrames / 60));
    if (clockSec !== this.hudCache.c) {
      this.$('clock').textContent = clockSec;
      this.hudCache.c = clockSec;
    }
  }

  resetHUDCache() {
    this.hudCache = { p: -1, e: -1, c: -1 };
  }

  updatePips(pWins, eWins) {
    [['pPips', pWins], ['ePips', eWins]].forEach(([id, count]) => {
      const container = this.$(id);
      if (container) {
        [...container.children].forEach((el, idx) => el.classList.toggle('on', idx < count));
      }
    });
  }

  updatePing(ms) {
    const badge = this.$('pingBadge');
    const val = this.$('pingVal');
    if (!badge || !val) return;

    badge.hidden = false;
    val.textContent = `${ms}ms`;

    badge.classList.remove('medium', 'high');
    if (ms > 140) badge.classList.add('high');
    else if (ms > 70) badge.classList.add('medium');
  }

  hidePing() {
    const badge = this.$('pingBadge');
    if (badge) badge.hidden = true;
  }

  updateMuteIcon(isMuted) {
    const muteBtn = this.$('mute');
    if (!muteBtn) return;
    const onSvg = muteBtn.querySelector('.icon-sound-on');
    const offSvg = muteBtn.querySelector('.icon-sound-off');
    if (onSvg && offSvg) {
      onSvg.hidden = isMuted;
      offSvg.hidden = !isMuted;
    }
    muteBtn.setAttribute('aria-label', `Pengaturan Suara: ${isMuted ? 'Mati' : 'Nyala'}`);
  }

  showBanner(text, frames = 55, color = '#f1e8e2') {
    const b = this.$('banner');
    b.firstElementChild.textContent = text;
    b.firstElementChild.style.color = color;
    b.hidden = false;
    b.classList.remove('pop');
    void b.offsetWidth; // Force reflow
    b.classList.add('pop');
    this.bannerTimer = frames;
  }

  stepBanner() {
    if (this.bannerTimer > 0 && --this.bannerTimer === 0) {
      this.$('banner').hidden = true;
    }
  }

  showCombo(count) {
    const el = this.$('combo');
    if (count < 2) {
      el.hidden = true;
      return;
    }
    el.textContent = `${count} kombo`;
    el.hidden = false;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  hideOverlay() {
    this.$('over').hidden = true;
  }

  showPanel(innerHtml, buttonLabel, callback) {
    const panel = this.$('panel');
    panel.innerHTML = `${innerHtml}<button class="btn" type="button" id="goBtn">${buttonLabel}</button>`;
    this.$('over').hidden = false;

    const btn = this.$('goBtn');
    btn.onclick = () => {
      btn.blur();
      audio.init();
      this.hideOverlay();
      if (callback) callback();
    };

    setTimeout(() => {
      try { btn.focus({ preventScroll: true }); } catch {}
    }, 0);
  }

  showLobby(handlers) {
    const panel = this.$('panel');
    panel.innerHTML = `
      <h2>Duel Bayangan</h2>
      <p>Pilih mode bertarung: Latihan lawan AI atau Duel Online 1v1 dengan teman lewat WebSocket.</p>
      <div class="keys">
        <b>Gerak</b><span>A / D atau panah</span>
        <b>Lompat</b><span>W atau Spasi</span>
        <b>Blok</b><span>Tahan S</span>
        <b>Pukul</b><span>J atau Z</span>
        <b>Tendang</b><span>K atau X</span>
      </div>
      <input type="text" id="nm" maxlength="12" placeholder="Namamu (opsional)" autocomplete="off" spellcheck="false">
      <div class="row">
        <button class="btn" type="button" id="bHost">Buat Ruangan</button>
        <button class="btn" type="button" id="bJoin">Gabung</button>
      </div>
      <button class="ghost" type="button" id="bAI">Latihan Lawan AI</button>
      <p id="ns" style="color:var(--foe);font-size:13px;"></p>
    `;
    this.$('over').hidden = false;

    const nameInput = this.$('nm');
    nameInput.value = SETTINGS.name || '';
    nameInput.oninput = (e) => {
      SETTINGS.name = e.target.value.trim().slice(0, 12);
      saveSettings();
    };

    this.$('bHost').onclick = () => {
      audio.init();
      handlers.onHostRoom(nameInput.value);
    };

    this.$('bJoin').onclick = () => {
      audio.init();
      handlers.onShowJoin(nameInput.value);
    };

    this.$('bAI').onclick = () => {
      audio.init();
      this.hideOverlay();
      handlers.onStartAI();
    };
  }

  showWaitingHost(roomCode, onCancel) {
    const panel = this.$('panel');
    panel.innerHTML = `
      <p>Kode ruangan. Beri tahu temanmu:</p>
      <div class="code">${roomCode}</div>
      <div class="row">
        <button class="btn sm" type="button" id="bCopyLink">Salin Tautan Undangan</button>
      </div>
      <p id="ns">Menunggu lawan bergabung lewat WebSocket…</p>
      <button class="ghost" type="button" id="bBack">Batal</button>
    `;
    this.$('over').hidden = false;
    this.$('bBack').onclick = onCancel;

    const copyBtn = this.$('bCopyLink');
    if (copyBtn) {
      copyBtn.onclick = async () => {
        const inviteUrl = `${window.location.origin}${window.location.pathname}?join=${roomCode}`;
        let copied = false;

        // Try Web Share API on mobile devices first
        try {
          if (navigator.share && matchMedia('(pointer:coarse)').matches) {
            await navigator.share({
              title: 'Duel Bayangan - Tantangan 1v1',
              text: `Ayo bertarung di Duel Bayangan! Klik tautan untuk langsung bergabung ke ruangan ${roomCode}:`,
              url: inviteUrl
            });
            copied = true;
          }
        } catch {
          // Share dismissed or cancelled
        }

        if (!copied) {
          try {
            await navigator.clipboard.writeText(inviteUrl);
            copied = true;
          } catch {
            const ta = document.createElement('textarea');
            ta.value = inviteUrl;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { copied = document.execCommand('copy'); } catch {}
            document.body.removeChild(ta);
          }
        }

        if (copied) {
          copyBtn.textContent = '✓ Tautan Disalin!';
          const ns = this.$('ns');
          if (ns) ns.textContent = 'Tautan telah disalin! Kirimkan ke temanmu untuk tanding.';
          setTimeout(() => {
            if (copyBtn) copyBtn.textContent = 'Salin Tautan Undangan';
          }, 3000);
        }
      };
    }
  }

  showJoinInput(onJoin, onCancel, prefilledCode = '') {
    const panel = this.$('panel');
    panel.innerHTML = `
      <p>Masukkan kode ruangan dari temanmu:</p>
      <input type="text" id="rc" class="code-in" maxlength="4" inputmode="numeric" placeholder="KODE" value="${prefilledCode || ''}">
      <div class="row">
        <button class="btn sm" type="button" id="bOk">Gabung</button>
      </div>
      <p id="ns" style="color:var(--foe);font-size:13px;"></p>
      <button class="ghost" type="button" id="bBack">Batal</button>
    `;
    this.$('over').hidden = false;

    const rcInput = this.$('rc');
    const bOk = this.$('bOk');

    const trySubmit = () => {
      const code = rcInput.value.replace(/[^0-9]/g, '');
      if (code.length < 4) {
        const ns = this.$('ns');
        if (ns) {
          ns.style.color = 'var(--foe)';
          ns.textContent = 'Kode terdiri dari 4 angka.';
        }
        return;
      }
      const ns = this.$('ns');
      if (ns) {
        ns.style.color = 'var(--dim)';
        ns.textContent = 'Menyambungkan ke ruangan…';
      }
      bOk.disabled = true;
      onJoin(code);
    };

    this.$('bBack').onclick = onCancel;
    bOk.onclick = trySubmit;

    rcInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        trySubmit();
      }
    });

    rcInput.addEventListener('input', () => {
      const val = rcInput.value.replace(/[^0-9]/g, '');
      if (val.length === 4) {
        trySubmit();
      }
    });

    setTimeout(() => {
      try { rcInput.focus({ preventScroll: true }); } catch {}
    }, 60);

    if (prefilledCode && prefilledCode.length === 4) {
      setTimeout(trySubmit, 120);
    }
  }

  showMenu(isMatchActive, isNetOn, handlers) {
    const menuEl = this.$('menu');
    const mp = this.$('mpanel');

    mp.innerHTML = `
      <h2>Menu</h2>
      <button class="btn" type="button" id="mGo">Lanjut</button>
      <div class="row">
        <button class="ghost" type="button" id="mSet">Pengaturan</button>
        ${isMatchActive ? '<button class="ghost" type="button" id="mLobby">Kembali ke Lobi</button>' : ''}
      </div>
      ${isNetOn && isMatchActive ? '<p>Duel online tetap berjalan selagi menu terbuka.</p>' : ''}
    `;
    menuEl.hidden = false;

    this.$('mGo').onclick = handlers.onClose;
    this.$('mSet').onclick = () => this.showSettings(handlers);

    const lobbyBtn = this.$('mLobby');
    if (lobbyBtn) {
      lobbyBtn.onclick = () => {
        if (isNetOn && !lobbyBtn.dataset.confirmed) {
          lobbyBtn.dataset.confirmed = '1';
          lobbyBtn.textContent = 'Yakin? Duel berakhir';
          return;
        }
        handlers.onLeaveToLobby();
      };
    }
  }

  showSettings(handlers) {
    const mp = this.$('mpanel');
    mp.innerHTML = `
      <h2>Pengaturan</h2>
      <div class="set">
        <span>Suara</span><button class="ghost" type="button" id="sMute"></button>
        <span>Volume</span><input type="range" id="sVol" min="0" max="100" step="5">
        <span>Kualitas grafik</span><button class="ghost" type="button" id="sGfx"></button>
        <span>Guncangan layar</span><button class="ghost" type="button" id="sShk"></button>
      </div>
      <button class="btn sm" type="button" id="sBack">Selesai</button>
    `;

    const renderValues = () => {
      this.$('sMute').textContent = SETTINGS.mute ? 'Mati' : 'Nyala';
      this.$('sGfx').textContent = SETTINGS.gfx === 'hi' ? 'Tinggi' : 'Rendah';
      this.$('sShk').textContent = SETTINGS.shake ? 'Nyala' : 'Mati';
      this.$('sVol').value = Math.round(SETTINGS.vol * 100);
      this.updateMuteIcon(SETTINGS.mute);
    };

    renderValues();

    this.$('sMute').onclick = () => {
      audio.setMute(!SETTINGS.mute);
      renderValues();
    };

    this.$('sVol').oninput = (e) => {
      audio.setVolume(e.target.value / 100);
    };

    this.$('sVol').onchange = () => {
      audio.play('hit');
    };

    this.$('sGfx').onclick = () => {
      SETTINGS.gfx = SETTINGS.gfx === 'hi' ? 'lo' : 'hi';
      saveSettings();
      if (this.onSettingsChanged) this.onSettingsChanged();
      renderValues();
    };

    this.$('sShk').onclick = () => {
      SETTINGS.shake = !SETTINGS.shake;
      saveSettings();
      renderValues();
    };

    this.$('sBack').onclick = () => handlers.onBack();
  }

  closeMenu() {
    this.$('menu').hidden = true;
  }
}

export const ui = new UIManager();
