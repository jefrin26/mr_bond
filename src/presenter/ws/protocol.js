'use strict';

// PRESENTER/WS — pure protocol helpers. No handler, no ws, no fs.
// Strips ALL static inventory (name/host/ip/port/auth). Wire carries
// only `id` as demux key + dynamic metrics.

function welcome() {
  return { type: 'welcome', ts: Date.now() };
}

function pong() {
  return { type: 'pong', ts: Date.now() };
}

function errorMsg(message) {
  return { type: 'error', error: String(message || 'error'), ts: Date.now() };
}

function parseClientMsg(raw) {
  let msg;
  try {
    msg = JSON.parse(String(raw));
  } catch {
    return { ok: false, error: 'invalid JSON' };
  }
  if (!msg || typeof msg.type !== 'string') {
    return { ok: false, error: 'missing message type' };
  }
  return { ok: true, msg };
}

// Alert inside a live push: no serverId (parent has id), no message text.
function stripAlertForLive(e) {
  return {
    rule: e.ruleId || e.metric,
    metric: e.metric,
    op: e.operator,
    threshold: e.threshold,
    value: e.value,
    ts: e.ts,
  };
}

// Alert in a list reply: keeps id as key, drops message text (embeds name).
function stripAlertForList(e) {
  return {
    id: e.serverId,
    rule: e.ruleId,
    metric: e.metric,
    op: e.operator,
    threshold: e.threshold,
    value: e.value,
    ts: e.ts,
  };
}

function stripMounts(mounts) {
  if (!Array.isArray(mounts)) return [];
  return mounts.map((m) => ({
    usagePct: m.usagePct,
    usedBytes: m.usedBytes,
    availBytes: m.availBytes,
  }));
}

// Core transform: full sample/down (with host/serverId) -> minimal live.
// Drops: host, serverId->id, durationMs, disk target/source/size, net raw
// counters (keeps rates = the live signal).
function toLivePayload(sampleOrDown, alertsFired) {
  const base = {
    type: 'live',
    id: sampleOrDown.serverId,
    ts: sampleOrDown.ts,
    status: sampleOrDown.status,
  };
  if (sampleOrDown.status !== 'ok') {
    base.error = sampleOrDown.error ? String(sampleOrDown.error) : 'down';
    return base;
  }
  if (sampleOrDown.cpu) {
    base.cpu = {
      usagePct: sampleOrDown.cpu.usagePct,
      load1: sampleOrDown.cpu.load1,
      load5: sampleOrDown.cpu.load5,
      load15: sampleOrDown.cpu.load15,
    };
  }
  if (sampleOrDown.mem) {
    base.mem = {
      usagePct: sampleOrDown.mem.usagePct,
      usedBytes: sampleOrDown.mem.usedBytes,
      totalBytes: sampleOrDown.mem.totalBytes,
    };
  }
  if (sampleOrDown.disk) {
    base.disk = {
      usagePct: sampleOrDown.disk.usagePct,
      usedBytes: sampleOrDown.disk.usedBytes,
      totalBytes: sampleOrDown.disk.totalBytes,
    };
    if (Array.isArray(sampleOrDown.disk.mounts)) {
      base.disk.mounts = stripMounts(sampleOrDown.disk.mounts);
    }
  }
  if (sampleOrDown.net) {
    base.net = { rates: sampleOrDown.net.rates || null };
  }
  if (sampleOrDown.system) {
    base.system = {
      uptimeHuman: sampleOrDown.system.uptimeHuman,
      load1: sampleOrDown.system.load1,
      load5: sampleOrDown.system.load5,
      load15: sampleOrDown.system.load15,
    };
  }
  if (Array.isArray(alertsFired) && alertsFired.length) {
    base.alerts = alertsFired.map(stripAlertForLive);
  }
  return base;
}

function liveFromOutcome(outcome) {
  if (outcome.ok) return toLivePayload(outcome.sample, outcome.alertsFired);
  return toLivePayload(outcome.down, []);
}

function stripHistoryValue(metric, value) {
  if (value == null || typeof value !== 'object') return value;
  if (metric === 'disk') {
    const { usagePct, usedBytes, totalBytes } = value;
    return { usagePct, usedBytes, totalBytes };
  }
  if (metric === 'disk_full') {
    if (Array.isArray(value.mounts)) {
      return { mounts: stripMounts(value.mounts) };
    }
    const { usagePct, usedBytes, totalBytes } = value;
    return { usagePct, usedBytes, totalBytes };
  }
  if (metric === 'net') {
    return { rates: value.rates || null };
  }
  if (metric === 'mem') {
    const { usagePct, usedBytes, totalBytes } = value;
    return { usagePct, usedBytes, totalBytes };
  }
  return value;
}

function historyReply(id, metric, points) {
  return {
    type: 'history',
    id,
    metric,
    points: (points || []).map((p) => ({
      ts: p.ts,
      value: stripHistoryValue(metric, p.value),
    })),
  };
}

function alertsReply(events) {
  return { type: 'alerts', alerts: (events || []).map(stripAlertForList) };
}

module.exports = {
  welcome,
  pong,
  errorMsg,
  parseClientMsg,
  stripAlertForLive,
  stripAlertForList,
  toLivePayload,
  liveFromOutcome,
  stripHistoryValue,
  historyReply,
  alertsReply,
};
