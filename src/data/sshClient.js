'use strict';

// DATA LAYER — raw SSH fetch. Owns the socket + /proc counters.
// Returns { ok, sample } / { ok:false, error }. Never touches alert rules or HTTP.

const fs = require('fs');
const { Client } = require('ssh2');
const { buildCommand, splitSections } = require('./linux/command');
const { toSample } = require('./linux/sampleBuilder');
const { expandHome } = require('./appConfig');

const prevState = new Map(); // serverId -> { cpu, net, ts }

function connectConfig(server) {
  const cfg = {
    host: server.host,
    port: server.port,
    username: server.auth.username,
    readyTimeout: 10000,
    hostHash: 'sha256',
  };
  if (server.auth.type === 'password') {
    cfg.password = server.auth.password;
  } else {
    cfg.privateKey = fs.readFileSync(expandHome(server.auth.privateKeyPath));
    if (server.auth.passphrase) cfg.passphrase = server.auth.passphrase;
  }
  return cfg;
}

function execOnce(conn, command, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`SSH exec timeout after ${timeoutMs}ms`)), timeoutMs);
    conn.exec(command, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err); }
      let out = '';
      let errOut = '';
      stream.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(`Remote command exited ${code}: ${errOut.slice(0, 500)}`));
        resolve(out);
      });
      stream.on('data', (d) => { out += d.toString(); });
      stream.stderr.on('data', (d) => { errOut += d.toString(); });
    });
  });
}

function pollServer(server, timeoutMs) {
  return new Promise((resolve) => {
    let cfg;
    try {
      cfg = connectConfig(server);
    } catch (err) {
      return resolve({ ok: false, error: err.message, serverId: server.id, ts: Date.now(), status: 'down' });
    }
    const conn = new Client();
    const started = Date.now();
    const done = (result) => { try { conn.end(); } catch { /* noop */ } resolve(result); };

    conn.on('ready', async () => {
      try {
        const raw = await execOnce(conn, buildCommand(), timeoutMs);
        const sections = splitSections(raw);
        const prev = prevState.get(server.id);
        const elapsedSec = prev ? Math.max(1, (Date.now() - prev.ts) / 1000) : null;
        const { sample, state } = toSample(sections, {
          prevCpu: prev?.cpu || null,
          prevNet: prev?.net || null,
          elapsedSec,
        });
        prevState.set(server.id, state);
        sample.serverId = server.id;
        sample.host = server.host;
        sample.durationMs = Date.now() - started;
        done({ ok: true, sample });
      } catch (err) {
        done({ ok: false, error: err.message, serverId: server.id, ts: Date.now(), status: 'down' });
      }
    });
    conn.on('error', (err) => done({ ok: false, error: err.message, serverId: server.id, ts: Date.now(), status: 'down' }));
    try {
      conn.connect({ ...cfg, readyTimeout: timeoutMs });
    } catch (err) {
      done({ ok: false, error: err.message, serverId: server.id, ts: Date.now(), status: 'down' });
    }
  });
}

function clearPrevState(id) {
  if (id) prevState.delete(id);
  else prevState.clear();
}

module.exports = { pollServer, clearPrevState };
