import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// MIME types for static assets
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

// Simple HTTP server for static files and health check
const server = http.createServer((req, res) => {
  // CORS & Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = parsedUrl.pathname;

  // Healthcheck endpoint for Dokploy / Docker healthcheck
  if (pathname === '/healthz' || pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() }));
    return;
  }

  // Normalize path & prevent directory traversal attacks
  if (pathname === '/') pathname = '/index.html';
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback: if not found, serve index.html for SPA if requested, or 404
      const fallbackPath = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(fallbackPath, (fbErr, content) => {
        if (!fbErr) {
          res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
          res.end(content);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
        }
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Development or code scripts: always revalidate to prevent stale browser cache
    if (process.env.NODE_ENV !== 'production' || ext === '.html' || ext === '.js' || ext === '.css') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

/* =========================================================
 * WebSocket Server: Room & Lockstep Matchmaking Engine
 * ========================================================= */
const wss = new WebSocketServer({ server });

/**
 * Room structure:
 * {
 *   code: string,
 *   players: [ { ws, name, id }, ... ],
 *   createdAt: number,
 *   lastActive: number,
 *   level: number
 * }
 */
const rooms = new Map();

function generateRoomCode() {
  let code = '';
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms.has(code));
  return code;
}

function cleanPlayerName(name) {
  return String(name || '')
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .trim()
    .slice(0, 12) || 'Petarung';
}

function sendJson(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      console.error('[sendJson error]', err);
    }
  }
}

function leaveRoom(ws) {
  if (!ws.roomCode) return;
  const room = rooms.get(ws.roomCode);
  if (!room) return;

  const opponent = room.players.find(p => p.ws !== ws);
  if (opponent) {
    sendJson(opponent.ws, {
      type: 'opponent_left',
      message: 'Lawan telah meninggalkan ruangan.'
    });
    opponent.ws.roomCode = null;
    opponent.ws.playerIndex = null;
  }

  rooms.delete(ws.roomCode);
  ws.roomCode = null;
  ws.playerIndex = null;
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw, isBinary) => {
    // Ultra-fast path for frame packets: starts with 'i' (0x69 input) or 'r' (0x72 resend)
    const isFastPacket = typeof raw === 'string'
      ? (raw[0] === 'i' || raw[0] === 'r')
      : (Buffer.isBuffer(raw) && (raw[0] === 0x69 || raw[0] === 0x72));
    if (isFastPacket) {
      if (ws.roomCode) {
        const room = rooms.get(ws.roomCode);
        if (room) {
          const opponent = room.players.find(p => p.ws !== ws);
          if (opponent && opponent.ws.readyState === WebSocket.OPEN) {
            try {
              opponent.ws.send(typeof raw === 'string' ? raw : raw.toString('utf8'));
            } catch (err) {
              console.error('[fast-path send error]', err);
            }
          }
        }
      }
      return;
    }

    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      // Latency ping-pong
      case 'ping': {
        sendJson(ws, { type: 'pong', t: msg.t });
        break;
      }

      // Create new multiplayer room
      case 'create_room': {
        leaveRoom(ws);
        const code = generateRoomCode();
        const playerName = cleanPlayerName(msg.name);

        const room = {
          code,
          players: [{ ws, name: playerName, index: 0 }],
          createdAt: Date.now(),
          lastActive: Date.now(),
          level: 1
        };

        rooms.set(code, room);
        ws.roomCode = code;
        ws.playerIndex = 0;

        sendJson(ws, {
          type: 'room_created',
          code,
          playerIndex: 0,
          playerName
        });
        break;
      }

      // Join existing room
      case 'join_room': {
        leaveRoom(ws);
        const code = String(msg.code || '').trim();
        const playerName = cleanPlayerName(msg.name);
        const room = rooms.get(code);

        if (!room) {
          sendJson(ws, { type: 'error', message: 'Ruangan tidak ditemukan. Periksa kembali kodenya.' });
          return;
        }

        if (room.players.length >= 2) {
          sendJson(ws, { type: 'error', message: 'Ruangan sudah penuh.' });
          return;
        }

        const host = room.players[0];
        room.players.push({ ws, name: playerName, index: 1 });
        room.lastActive = Date.now();

        ws.roomCode = code;
        ws.playerIndex = 1;

        // Notify joiner
        sendJson(ws, {
          type: 'room_joined',
          code,
          playerIndex: 1,
          playerName,
          opponentName: host.name
        });

        // Notify host
        sendJson(host.ws, {
          type: 'opponent_joined',
          opponentName: playerName
        });
        break;
      }

      // Start match / next round (broadcast from host)
      case 'start_match': {
        if (!ws.roomCode) return;
        const room = rooms.get(ws.roomCode);
        if (!room || room.players.length < 2) return;

        room.level = msg.level || room.level || 1;
        const seed = msg.seed || Math.floor(Math.random() * 1000000);

        for (const p of room.players) {
          sendJson(p.ws, {
            type: 'match_started',
            level: room.level,
            seed,
            players: [room.players[0].name, room.players[1].name]
          });
        }
        break;
      }

      // Rematch request
      case 'rematch': {
        if (!ws.roomCode) return;
        const room = rooms.get(ws.roomCode);
        if (!room) return;

        const opponent = room.players.find(p => p.ws !== ws);
        if (opponent) {
          sendJson(opponent.ws, { type: 'rematch_requested' });
        }
        break;
      }

      // Leave room manually
      case 'leave_room': {
        leaveRoom(ws);
        break;
      }
    }
  });

  ws.on('close', () => {
    leaveRoom(ws);
  });

  ws.on('error', () => {
    leaveRoom(ws);
  });
});

// Periodic heartbeat & room garbage collection (every 30s)
const heartbeatInterval = setInterval(() => {
  const now = Date.now();

  // Sweep dead websockets
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });

  // Sweep rooms older than 3 hours
  for (const [code, room] of rooms.entries()) {
    if (now - room.lastActive > 3 * 3600 * 1000) {
      rooms.delete(code);
    }
  }
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// Graceful shutdown
function shutdown() {
  console.log('Shutting down server...');
  clearInterval(heartbeatInterval);
  wss.close(() => {
    server.close(() => {
      process.exit(0);
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

server.listen(PORT, HOST, () => {
  console.log(`[Duel Bayangan Server] Running on http://${HOST}:${PORT}`);
  console.log(`[Dokploy Healthcheck] http://${HOST}:${PORT}/healthz`);
});
