/**
 * network.js - WebSocket client for room management, lockstep synchronization, and ping monitoring.
 */
import { encodeInput, decodeInput } from './input.js?v=2.4.3';

export class NetworkManager {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.isHost = false;
    this.roomCode = null;
    this.playerIndex = null;
    this.playerNames = ['', ''];
    this.pingMs = 0;
    this.pingTimer = null;

    // Lockstep state
    this.active = false;
    this.epoch = 0;
    this.frameIndex = 0;
    this.lastSentFrame = 0;
    this.inputDelay = 5; // D = 5 frames buffer for network jitter
    this.localInputs = new Map();
    this.localHistory = new Map();
    this.remoteInputs = new Map();
    this.stallTicks = 0;
    this.lastRemoteReceivedFrame = 0;

    // Callbacks
    this.onRoomCreated = null;
    this.onRoomJoined = null;
    this.onOpponentJoined = null;
    this.onMatchStarted = null;
    this.onRematchRequested = null;
    this.onOpponentLeft = null;
    this.onPingUpdate = null;
    this.onStall = null;
    this.onStallRecovered = null;
    this.onError = null;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;

      try {
        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';
      } catch (err) {
        return reject(err);
      }

      this.ws.onopen = () => {
        this.connected = true;
        this.startPingMonitor();
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.stopPingMonitor();
        if (this.active && this.onOpponentLeft) {
          this.onOpponentLeft();
        }
      };

      this.ws.onerror = (err) => {
        if (this.onError) this.onError('Koneksi WebSocket terganggu.');
        reject(err);
      };
    });
  }

  startPingMonitor() {
    this.stopPingMonitor();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendJson({ type: 'ping', t: performance.now() });
      }
    }, 2000);
  }

  stopPingMonitor() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  sendJson(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  sendRaw(str) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(str);
    }
  }

  handleMessage(data) {
    if (data instanceof ArrayBuffer) {
      data = new TextDecoder().decode(data);
    } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
      data.text().then(text => this.handleMessage(text));
      return;
    }

    // Ultra-fast path: frame input packet e.g. "i0,12,3" or with redundancy "i0,12,3,0,0"
    if (typeof data === 'string' && data[0] === 'i') {
      const parts = data.slice(1).split(',').map(Number);
      const [ep, frame, bitmask, prev1, prev2] = parts;
      this.remoteInputs.set(`${ep}:${frame}`, bitmask);
      this.lastRemoteReceivedFrame = Math.max(this.lastRemoteReceivedFrame, frame);

      // Opportunistically heal any missing previous frames with redundant data
      if (prev1 !== undefined && !this.remoteInputs.has(`${ep}:${frame - 1}`)) {
        this.remoteInputs.set(`${ep}:${frame - 1}`, prev1);
      }
      if (prev2 !== undefined && !this.remoteInputs.has(`${ep}:${frame - 2}`)) {
        this.remoteInputs.set(`${ep}:${frame - 2}`, prev2);
      }
      return;
    }

    // Ultra-fast path: resend request packet e.g. "r0,12"
    if (typeof data === 'string' && data[0] === 'r') {
      const parts = data.slice(1).split(',').map(Number);
      const [ep, frame] = parts;
      if (ep === this.epoch && this.localHistory.has(frame)) {
        const bitmask = this.localHistory.get(frame);
        this.sendRaw(`i${ep},${frame},${bitmask}`);
      }
      return;
    }

    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'pong': {
        this.pingMs = Math.round(performance.now() - msg.t);
        if (this.onPingUpdate) this.onPingUpdate(this.pingMs);
        break;
      }

      case 'room_created': {
        this.isHost = true;
        this.roomCode = msg.code;
        this.playerIndex = 0;
        this.playerNames[0] = msg.playerName;
        if (this.onRoomCreated) this.onRoomCreated(msg.code);
        break;
      }

      case 'room_joined': {
        this.isHost = false;
        this.roomCode = msg.code;
        this.playerIndex = 1;
        this.playerNames[0] = msg.opponentName;
        this.playerNames[1] = msg.playerName;
        if (this.onRoomJoined) this.onRoomJoined(msg.code, msg.opponentName);
        break;
      }

      case 'opponent_joined': {
        this.playerNames[1] = msg.opponentName;
        if (this.onOpponentJoined) this.onOpponentJoined(msg.opponentName);
        break;
      }

      case 'match_started': {
        this.active = true;
        this.playerNames = msg.players;
        if (this.onMatchStarted) this.onMatchStarted(msg.level, msg.seed, msg.players);
        break;
      }

      case 'rematch_requested': {
        if (this.onRematchRequested) this.onRematchRequested();
        break;
      }

      case 'opponent_left': {
        this.active = false;
        if (this.onOpponentLeft) this.onOpponentLeft();
        break;
      }

      case 'error': {
        if (this.onError) this.onError(msg.message);
        break;
      }
    }
  }

  createRoom(playerName) {
    return this.connect().then(() => {
      this.sendJson({ type: 'create_room', name: playerName });
    });
  }

  joinRoom(code, playerName) {
    return this.connect().then(() => {
      this.sendJson({ type: 'join_room', code, name: playerName });
    });
  }

  startMatch(level = 1, seed = null) {
    this.sendJson({
      type: 'start_match',
      level,
      seed: seed || Math.floor(Math.random() * 1000000)
    });
  }

  requestRematch() {
    this.sendJson({ type: 'rematch' });
  }

  leaveRoom() {
    this.sendJson({ type: 'leave_room' });
    this.active = false;
    this.roomCode = null;
    this.playerIndex = null;
  }

  netRound() {
    this.epoch++;
    this.frameIndex = 0;
    this.lastSentFrame = this.inputDelay - 1;
    this.stallTicks = 0;
    this.lastRemoteReceivedFrame = this.inputDelay - 1;
    this.localInputs.clear();
    this.localHistory.clear();

    for (const key of this.remoteInputs.keys()) {
      if (parseInt(key) < this.epoch) this.remoteInputs.delete(key);
    }

    for (let i = 0; i < this.inputDelay; i++) {
      this.localInputs.set(i, 0);
      this.localHistory.set(i, 0);
      this.remoteInputs.set(`${this.epoch}:${i}`, 0);
    }
  }

  netTick(localPlayerInput) {
    const currentFrame = this.frameIndex;
    const targetFrame = currentFrame + this.inputDelay;

    // Send scheduled inputs with delay D using while loop (never skip any frames!)
    while (this.lastSentFrame < targetFrame) {
      this.lastSentFrame++;
      const frameToSend = this.lastSentFrame;
      const bitmask = encodeInput(localPlayerInput);
      this.localInputs.set(frameToSend, bitmask);
      this.localHistory.set(frameToSend, bitmask);

      // Keep recent history bounded to prevent memory leaks
      if (this.localHistory.size > 120) {
        const oldestKey = this.localHistory.keys().next().value;
        this.localHistory.delete(oldestKey);
      }

      // Redundant packaging: current frame + previous 2 frames
      const prev1 = this.localHistory.get(frameToSend - 1) ?? 0;
      const prev2 = this.localHistory.get(frameToSend - 2) ?? 0;
      this.sendRaw(`i${this.epoch},${frameToSend},${bitmask},${prev1},${prev2}`);
    }

    const remoteKey = `${this.epoch}:${currentFrame}`;
    if (!this.remoteInputs.has(remoteKey)) {
      // Waiting for opponent's frame input (lockstep pause)
      this.stallTicks++;

      // If waiting for more than 4 ticks (~65ms), proactively request a resend:
      if (this.stallTicks >= 4 && this.stallTicks % 4 === 0) {
        this.sendRaw(`r${this.epoch},${currentFrame}`);
      }

      if (this.onStall) {
        this.onStall(currentFrame, this.stallTicks);
      }
      return null;
    }

    if (this.stallTicks > 0) {
      this.stallTicks = 0;
      if (this.onStallRecovered) this.onStallRecovered();
    }

    const pLocal = decodeInput(this.localInputs.get(currentFrame));
    const pRemote = decodeInput(this.remoteInputs.get(remoteKey));

    this.localInputs.delete(currentFrame);
    this.remoteInputs.delete(remoteKey);
    this.frameIndex++;

    return this.isHost ? [pLocal, pRemote] : [pRemote, pLocal];
  }

  getDiagnostics() {
    return {
      frame: this.frameIndex,
      lastSent: this.lastSentFrame,
      remoteFrame: this.lastRemoteReceivedFrame,
      remoteBufSize: this.remoteInputs.size,
      ping: this.pingMs,
      stallTicks: this.stallTicks
    };
  }
}
