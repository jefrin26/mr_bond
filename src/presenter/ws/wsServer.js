'use strict';

// PRESENTER/WS — WebSocket server. Imports ONLY data-handler (never ../data).
// Single WS port carries minimal live payloads (no static inventory).

const { WebSocketServer, WebSocket } = require('ws');
const handler = require('../../data-handler');
const protocol = require('./protocol');
const subs = require('./subscriptions');
const handlers = require('./handlers');

function send(ws, obj) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch { /* noop: dead socket, cleaned on close */ }
}

function originAllowed(req) {
  const configured = process.env.CORS_ORIGIN || '*';
  if (configured === '*') return true;
  const origin = req.headers && req.headers.origin;
  if (!origin) return true; // non-browser clients send no Origin
  return origin === configured;
}

function createWsApi(cfg) {
  const wss = new WebSocketServer({ port: cfg.port });
  const clients = new Set();

  wss.on('connection', (ws, req) => {
    if (!originAllowed(req)) {
      try { ws.close(1008, 'origin not allowed'); } catch { /* noop */ }
      return;
    }
    clients.add(ws);
    send(ws, protocol.welcome());

    ws.on('message', (raw) => {
      const parsed = protocol.parseClientMsg(raw);
      if (!parsed.ok) {
        send(ws, protocol.errorMsg(parsed.error));
        return;
      }
      Promise.resolve(
        handlers.handleClientMsg(ws, parsed.msg, { cfg, handler, subs, send })
      ).catch((err) => send(ws, protocol.errorMsg(err.message)));
    });

    const cleanup = () => {
      clients.delete(ws);
      subs.clear(ws);
    };
    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  // Scheduler tick fan-out: outcomes -> minimal live msgs, filtered per socket.
  function broadcast(outcomes) {
    if (!Array.isArray(outcomes) || !outcomes.length) return;
    const perId = new Map();
    for (const o of outcomes) {
      try {
        perId.set(o.serverId, protocol.liveFromOutcome(o));
      } catch { /* noop: skip bad outcome */ }
    }
    for (const ws of clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (ws.bufferedAmount > 1024 * 1024) continue; // slow consumer: skip tick
      for (const [id, live] of perId) {
        if (!subs.matches(ws, id)) continue;
        try {
          ws.send(JSON.stringify(live));
        } catch { /* noop */ break; }
      }
    }
  }

  function close(cb) {
    for (const ws of clients) {
      try { ws.terminate(); } catch { /* noop */ }
    }
    clients.clear();
    wss.close(cb);
  }

  return { wss, broadcast, close };
}

module.exports = { createWsApi };
