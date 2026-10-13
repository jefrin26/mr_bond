'use strict';

// DATA-HANDLER — monitoring orchestration (poll, persist, query, clear).
// Uses ONLY the data layer + sibling alertHandler. No fs, no ssh2, no express.

const data = require('../data');
const alertHandler = require('./alertHandler');
const serverHandler = require('./serverHandler');

function downSample(server, error) {
  return {
    serverId: server.id,
    host: server.host,
    ts: Date.now(),
    status: 'down',
    error: String(error || 'poll failed'),
    cpu: null,
    mem: null,
    disk: null,
    net: null,
    system: null,
  };
}

// Poll one server via data layer, persist live+history, evaluate alerts.
async function pollOne(cfg, serverId, { persist = true } = {}) {
  const server = serverHandler.findServer(cfg, serverId);
  if (!server) {
    const err = new Error('unknown server');
    err.code = 'UNKNOWN_SERVER';
    throw err;
  }
  const r = await data.sshClient.pollServer(server, cfg.sshTimeoutMs);
  if (!r.ok) {
    const down = downSample(server, r.error);
    if (persist) {
      data.store.liveFiles.writeLive(cfg.dbDir, down);
      alertHandler.recordHostDown(cfg.dbDir, server, r.error);
    }
    const err = new Error(r.error);
    err.code = 'HOST_DOWN';
    err.down = down;
    throw err;
  }
  if (persist) {
    data.store.liveFiles.writeLive(cfg.dbDir, r.sample);
    data.store.historyFiles.appendHistory(cfg.dbDir, r.sample, {
      maxPoints: cfg.historyMaxPoints,
      maxDays: cfg.historyMaxDays,
    });
  }
  const fired = alertHandler.evaluateSample(cfg.dbDir, r.sample, cfg.rules);
  return { sample: r.sample, alertsFired: fired };
}

// One scheduler tick over all enabled servers.
async function pollAll(cfg) {
  const enabled = cfg.servers.filter((s) => s.enabled);
  const results = await Promise.allSettled(enabled.map((s) => data.sshClient.pollServer(s, cfg.sshTimeoutMs)));
  const outcomes = [];
  for (let i = 0; i < enabled.length; i++) {
    const server = enabled[i];
    const r = results[i];
    if (r.status === 'fulfilled' && r.value.ok) {
      const { sample } = r.value;
      data.store.liveFiles.writeLive(cfg.dbDir, sample);
      data.store.historyFiles.appendHistory(cfg.dbDir, sample, {
        maxPoints: cfg.historyMaxPoints,
        maxDays: cfg.historyMaxDays,
      });
      const fired = alertHandler.evaluateSample(cfg.dbDir, sample, cfg.rules);
      outcomes.push({ serverId: server.id, ok: true, sample, alertsFired: fired });
    } else {
      const error = r.status === 'fulfilled' ? r.value.error : r.reason?.message;
      const down = downSample(server, error);
      data.store.liveFiles.writeLive(cfg.dbDir, down);
      alertHandler.recordHostDown(cfg.dbDir, server, down.error);
      outcomes.push({ serverId: server.id, ok: false, down });
    }
  }
  return outcomes;
}

function getLive(cfg, serverId) {
  return data.store.liveFiles.readLive(cfg.dbDir, serverId);
}

function getHistory(cfg, serverId, metric, { since = 0, limit = 500 } = {}) {
  return data.store.historyFiles.readHistory(cfg.dbDir, serverId, metric, { since, limit });
}

function clearLive(cfg, serverId) {
  const n = data.store.liveFiles.clearLive(cfg.dbDir, serverId);
  data.sshClient.clearPrevState(serverId);
  return n;
}

function clearHistory(cfg, serverId, metric) {
  return data.store.historyFiles.clearHistory(cfg.dbDir, serverId, metric);
}

let timer = null;
let running = false;

function startScheduler(cfg, { onTick } = {}) {
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const outcomes = await pollAll(cfg);
      if (onTick) onTick(outcomes);
    } finally {
      running = false;
    }
  };
  tick();
  timer = setInterval(tick, Math.max(5, cfg.pollIntervalSec) * 1000);
  return { stop: () => { if (timer) clearInterval(timer); timer = null; }, tick: pollAll.bind(null, cfg) };
}

module.exports = { pollOne, pollAll, getLive, getHistory, clearLive, clearHistory, startScheduler };
