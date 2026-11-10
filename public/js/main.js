/**
 * main.js - Application entry point, fixed-timestep game loop, and state machine orchestrator.
 */
import { FIXED_STEP, PALETTES, ENEMY_NAMES, SETTINGS, getDPR, ATK } from './config.js?v=2.4.3';
import { audio } from './audio.js?v=2.4.3';
import { createFighter, stepFighter, separateFighters, checkHitbox, applyDamageAndEffects } from './physics.js?v=2.4.3';
import { Renderer } from './renderer.js?v=2.4.3';
import { InputManager } from './input.js?v=2.4.3';
import { AIEngine, getAIParameters } from './ai.js?v=2.4.3';
import { NetworkManager } from './network.js?v=2.4.3';
import { ui } from './ui.js?v=2.4.3';

// Instances
const canvas = document.getElementById('c');
const renderer = new Renderer(canvas);
const input = new InputManager();
const ai = new AIEngine();
const net = new NetworkManager();

// Game Match State
let fighterP = null;
let fighterE = null;
let level = 1;
let round = 1;
let wins = { p: 0, e: 0 };
let phase = 'title'; // 'title' | 'intro' | 'fight' | 'roundEnd' | 'matchEnd'
let phaseTimer = 0;
let clockFrames = 3600; // 60 seconds
let tick = 0;
let hitstop = 0;
let slowdown = 0;
let paused = false;
const combo = { count: 0, timer: 0 };

ui.onSettingsChanged = () => {
  renderer.updateDimensions();
};

function getEnemyDisplayName() {
  if (net.active) {
    return net.playerNames[1] || 'Lawan';
  }
  const nameIndex = (level - 1) % ENEMY_NAMES.length;
  const loopCount = level > 4 ? ` ${Math.ceil(level / 4)}` : '';
  return ENEMY_NAMES[nameIndex] + loopCount;
}

function resetFighters() {
  fighterP = createFighter(250, 1, true);
  fighterE = createFighter(550, -1, false);

  if (!net.active) {
    const pr = getAIParameters(level);
    fighterE.max = fighterE.hp = pr.hp;
    fighterE.speed = pr.speed;
  }

  clockFrames = 3600;
  ai.reset();
  combo.count = 0;
  combo.timer = 0;
  document.getElementById('combo').hidden = true;

  renderer.sparksList = [];
  hitstop = 0;
  renderer.shake = 0;

  ui.resetHUDCache();
  ui.updateHUD(fighterP.hp, fighterP.max, fighterE.hp, fighterE.max, clockFrames);
}

function startRound() {
  resetFighters();
  if (net.active) {
    net.netRound();
  }

  phase = 'intro';
  phaseTimer = 110;
  input.pressed.jump = input.pressed.punch = input.pressed.kick = false;

  ui.showBanner(`Ronde ${round}`, 55);
  audio.play('gong');
}

function newMatch(seed = null) {
  wins = { p: 0, e: 0 };
  round = 1;

  const currentSeed = seed !== null ? seed : level * 7 + 3;
  const palette = PALETTES[(level - 1) % PALETTES.length];
  renderer.generateBackground(palette, currentSeed);

  document.getElementById('lvl').textContent = (net.active ? 'Duel ' : 'Lawan ') + level;
  document.getElementById('pName').textContent = net.active ? (net.playerNames[0] || 'Kamu') : 'Kamu';
  document.getElementById('eName').textContent = getEnemyDisplayName();

  ui.updatePips(wins.p, wins.e);
  startRound();
}

function endRound(reason) {
  phase = 'roundEnd';
  phaseTimer = 150;
  slowdown = 650;

  let winner;
  if (fighterP.hp <= 0) winner = 'e';
  else if (fighterE.hp <= 0) winner = 'p';
  else winner = (fighterP.hp / fighterP.max >= fighterE.hp / fighterE.max) ? 'p' : 'e';

  wins[winner]++;
  ui.updatePips(wins.p, wins.e);

  if (reason === 'time') {
    ui.showBanner('Waktu habis', 110);
  } else {
    ui.showBanner('KO!', 110, winner === 'p' ? '#4de1d2' : '#ff4d5e');
  }
}

function afterRound() {
  const matchOver = wins.p >= 2 || wins.e >= 2;

  if (net.active && matchOver) {
    phase = 'matchEnd';
    const isWinner = (wins.p >= 2) === net.isHost;
    const opponentName = net.playerNames[net.isHost ? 1 : 0] || 'Lawan';

    const html = isWinner
      ? `<h2 style="color:var(--you)">Menang</h2><p>Kamu berhasil menaklukkan ${opponentName}!</p>`
      : `<h2 style="color:var(--foe)">Kalah</h2><p>${opponentName} memenangkan duel kali ini.</p>`;

    ui.showPanel(html, 'Minta Tanding Lagi', () => {
      net.requestRematch();
      ui.showBanner('Menunggu lawan setuju…', 90);
    });
  } else if (!net.active && wins.p >= 2) {
    phase = 'matchEnd';
    ui.showPanel(
      `<h2 style="color:var(--you)">Menang</h2><p>${getEnemyDisplayName()} tumbang. Lawan berikutnya semakin cepat dan berbahaya!</p>`,
      'Lawan Berikutnya',
      () => {
        level++;
        newMatch();
      }
    );
  } else if (!net.active && wins.e >= 2) {
    phase = 'matchEnd';
    ui.showPanel(
      `<h2 style="color:var(--foe)">Kalah</h2><p>Kamu jatuh melawan ${getEnemyDisplayName()}. Tahan tombol blok untuk membaca ritme serangan lawan.</p>`,
      'Coba Lagi',
      () => {
        newMatch();
      }
    );
  } else {
    round++;
    startRound();
  }
}

const IDLE_INPUT = {};

function update() {
  if (paused) return;
  tick++;

  renderer.updateParticles(tick);

  if (combo.timer > 0) {
    combo.timer--;
    if (combo.timer === 0) {
      combo.count = 0;
      ui.showCombo(0);
    }
  }

  ui.stepBanner();

  if (!fighterP || !fighterE) return;

  if (phase === 'fight') {
    let pInput, eInput;
    if (net.active) {
      const lockstepResult = net.netTick(input.pollPlayerInput());
      if (!lockstepResult) {
        // Paused waiting for remote packet (lockstep)
        ui.updateNetDiag(net.getDiagnostics(), true);
        return false;
      }
      ui.updateNetDiag(net.getDiagnostics(), false);
      [pInput, eInput] = lockstepResult;
    } else {
      pInput = input.pollPlayerInput();
      eInput = ai.think(fighterE, fighterP, level);
    }

    if (hitstop > 0) {
      hitstop--;
      return;
    }

    stepFighter(fighterP, fighterE, pInput, sfxName => audio.play(sfxName));
    stepFighter(fighterE, fighterP, eInput, sfxName => audio.play(sfxName));
    separateFighters(fighterP, fighterE);

    // Combat checks
    const combatEvents = {
      onSparks: (x, y, count, col, dir) => renderer.addSparks(x, y, count, col, dir),
      onSfx: sfxName => audio.play(sfxName),
      onHitstop: frames => { hitstop = frames; },
      onShake: amt => { renderer.shake = Math.max(renderer.shake, amt); },
      onCombo: attacker => {
        if (attacker.isP === (!net.active || net.isHost)) {
          combo.count = combo.timer > 0 ? combo.count + 1 : 1;
          combo.timer = 75;
          ui.showCombo(combo.count);
        }
      }
    };

    if (fighterP.atk && !fighterP.atk.connected) {
      const hitP = checkHitbox(fighterP, fighterE);
      if (hitP) {
        fighterP.atk.connected = true;
        applyDamageAndEffects(fighterP, fighterE, combatEvents, null, hitP);
      }
    }

    if (fighterE.atk && !fighterE.atk.connected) {
      const hitE = checkHitbox(fighterE, fighterP);
      if (hitE) {
        fighterE.atk.connected = true;
        applyDamageAndEffects(fighterE, fighterP, combatEvents, null, hitE);
      }
    }

    clockFrames--;
    ui.updateHUD(fighterP.hp, fighterP.max, fighterE.hp, fighterE.max, clockFrames);

    if (fighterP.hp <= 0 || fighterE.hp <= 0) {
      endRound('ko');
    } else if (clockFrames <= 0) {
      endRound('time');
    }
    return;
  }

  // Non-fight phases (intro, roundEnd, title)
  stepFighter(fighterP, fighterE, IDLE_INPUT, null);
  stepFighter(fighterE, fighterP, IDLE_INPUT, null);
  separateFighters(fighterP, fighterE);

  if (phase === 'intro') {
    phaseTimer--;
    if (phaseTimer === 55) ui.showBanner('Fight!', 45, '#ffc46b');
    if (phaseTimer <= 0) {
      phase = 'fight';
      input.pressed.jump = input.pressed.punch = input.pressed.kick = false;
    }
  } else if (phase === 'roundEnd') {
    ui.updateHUD(fighterP.hp, fighterP.max, fighterE.hp, fighterE.max, clockFrames);
    if (--phaseTimer <= 0) {
      afterRound();
    }
  }
}

// Fixed timestep game loop
let lastTime = performance.now();
let accumulator = 0;

function frame(now) {
  const dt = Math.min(64, now - lastTime);
  lastTime = now;

  let speedFactor = 1;
  if (slowdown > 0) {
    speedFactor = 0.35;
    slowdown -= dt;
  }

  accumulator += dt * speedFactor;
  let stepsCount = 0;

  while (accumulator >= FIXED_STEP && stepsCount < 5) {
    if (update() === false) {
      // Netcode lockstep pause
      accumulator = Math.min(accumulator, FIXED_STEP * 2);
      break;
    }
    accumulator -= FIXED_STEP;
    stepsCount++;
  }

  if (stepsCount >= 5) accumulator = 0;

  renderer.render(fighterP, fighterE, tick);
  requestAnimationFrame(frame);
}

// Global Error Logging for Mobile & Desktop
window.addEventListener('error', (e) => {
  const file = e.filename ? e.filename.split('/').pop() : 'script';
  ui.logError(`${e.message} (${file}:${e.lineno})`);
});

window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason ? (e.reason.message || String(e.reason)) : 'Promise rejected';
  ui.logError(`Async: ${reason}`);
});

// Network Event Bindings
net.onPingUpdate = (ms) => {
  ui.updatePing(ms);
  ui.updateNetDiag(net.getDiagnostics(), net.stallTicks > 0);
};

net.onStall = (frame, stallTicks) => {
  ui.updateNetDiag(net.getDiagnostics(), true);
  if (stallTicks === 60) {
    ui.showBanner('Koneksi lambat (menunggu lawan)…', 75, '#ffc46b');
  }
};

net.onStallRecovered = () => {
  ui.updateNetDiag(net.getDiagnostics(), false);
};

net.onRoomCreated = (code) => {
  ui.showWaitingHost(code, () => {
    net.leaveRoom();
    openLobby();
  });
};

net.onOpponentJoined = (opponentName) => {
  ui.showBanner(`${opponentName} bergabung!`, 55, '#4de1d2');
  setTimeout(() => {
    net.startMatch(1);
  }, 1000);
};

net.onRoomJoined = (code, opponentName) => {
  ui.showBanner(`Tersambung ke ${opponentName}!`, 55, '#4de1d2');
};

net.onMatchStarted = (lvl, seed, playerNames) => {
  ui.hideOverlay();
  ui.showNetDiag();
  level = lvl;
  newMatch(seed);
};

net.onRematchRequested = () => {
  ui.showPanel(
    '<h2>Tanding Lagi?</h2><p>Lawan menantangmu untuk bertanding ulang.</p>',
    'Terima Tantangan',
    () => {
      level++;
      if (net.isHost) net.startMatch(level);
    }
  );
};

net.onOpponentLeft = () => {
  ui.hidePing();
  ui.hideNetDiag();
  ui.showPanel(
    '<h2>Terputus</h2><p>Lawan telah keluar dari permainan atau koneksi terputus.</p>',
    'Kembali ke Lobi',
    () => {
      openLobby();
    }
  );
};

net.onError = (errMsg) => {
  ui.logError(`NetError: ${errMsg}`);
  const ns = document.getElementById('ns');
  if (ns) {
    ns.style.color = 'var(--foe)';
    ns.textContent = errMsg;
  }
  const bOk = document.getElementById('bOk');
  if (bOk) bOk.disabled = false;
};

// Lobby & Menu navigation
function openLobby(autoJoinCode = null) {
  net.leaveRoom();
  ui.hidePing();
  ui.hideNetDiag();
  phase = 'title';
  level = 1;
  wins = { p: 0, e: 0 };
  ui.updatePips(0, 0);

  resetFighters();
  document.getElementById('pName').textContent = 'Kamu';
  document.getElementById('eName').textContent = ENEMY_NAMES[0];
  document.getElementById('lvl').textContent = 'Lawan 1';

  ui.showLobby({
    onHostRoom: (name) => {
      net.createRoom(name).catch(() => {
        const ns = document.getElementById('ns');
        if (ns) {
          ns.style.color = 'var(--foe)';
          ns.textContent = 'Gagal menghubungi server WebSocket.';
        }
      });
    },
    onShowJoin: (name, prefilled = '') => {
      ui.showJoinInput(
        (code) => {
          net.joinRoom(code, name).catch(() => {
            const ns = document.getElementById('ns');
            if (ns) {
              ns.style.color = 'var(--foe)';
              ns.textContent = 'Gagal bergabung ke ruangan.';
            }
            const bOk = document.getElementById('bOk');
            if (bOk) bOk.disabled = false;
          });
        },
        () => openLobby(),
        prefilled
      );
    },
    onStartAI: () => {
      level = 1;
      newMatch();
    }
  });

  if (autoJoinCode) {
    ui.showJoinInput(
      (code) => {
        net.joinRoom(code, SETTINGS.name).catch(() => {
          const ns = document.getElementById('ns');
          if (ns) {
            ns.style.color = 'var(--foe)';
            ns.textContent = 'Gagal bergabung ke ruangan.';
          }
          const bOk = document.getElementById('bOk');
          if (bOk) bOk.disabled = false;
        });
      },
      () => openLobby(),
      autoJoinCode
    );
  }
}

function openMenu() {
  const isMatchActive = phase === 'intro' || phase === 'fight' || phase === 'roundEnd';
  if (!net.active && isMatchActive) paused = true;

  ui.showMenu(isMatchActive, net.active, {
    onClose: closeMenu,
    onBack: openMenu,
    onLeaveToLobby: () => {
      paused = false;
      ui.closeMenu();
      openLobby();
    }
  });
}

function closeMenu() {
  ui.closeMenu();
  if (paused) {
    paused = false;
    input.pressed.jump = input.pressed.punch = input.pressed.kick = false;
  }
}

// Global UI listeners
document.getElementById('menuBtn').addEventListener('click', (e) => {
  e.currentTarget.blur();
  const menuEl = document.getElementById('menu');
  if (menuEl.hidden) openMenu();
  else closeMenu();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    const menuEl = document.getElementById('menu');
    if (menuEl.hidden) openMenu();
    else closeMenu();
  } else if (e.code === 'KeyH') {
    SETTINGS.debugHitboxes = !SETTINGS.debugHitboxes;
    ui.showBanner(SETTINGS.debugHitboxes ? 'Hitbox: ON' : 'Hitbox: OFF', 30);
  }
});

window.toggleHitboxes = () => {
  SETTINGS.debugHitboxes = !SETTINGS.debugHitboxes;
  ui.showBanner(SETTINGS.debugHitboxes ? 'Hitbox: ON' : 'Hitbox: OFF', 30);
  return SETTINGS.debugHitboxes;
};

document.getElementById('mute').addEventListener('click', () => {
  audio.setMute(!SETTINGS.mute);
  ui.updateMuteIcon(SETTINGS.mute);
});

// Boot Sequence
resetFighters();
renderer.initEmbers();
renderer.generateBackground(PALETTES[0], 10);
ui.updateHUD(fighterP.hp, fighterP.max, fighterE.hp, fighterE.max, clockFrames);
ui.updatePips(0, 0);
ui.updateMuteIcon(SETTINGS.mute);

// Detect ?join=XXXX or ?room=XXXX from URL
const searchParams = new URLSearchParams(window.location.search);
const paramCode = searchParams.get('join') || searchParams.get('room');
const validJoinCode = paramCode && /^[0-9]{4}$/.test(paramCode.trim()) ? paramCode.trim() : null;

openLobby(validJoinCode);
requestAnimationFrame((time) => {
  lastTime = time;
  frame(time);
});
