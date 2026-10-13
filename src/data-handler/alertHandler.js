'use strict';

// DATA-HANDLER — alert rule evaluation + alert queries.
// Persists only via data.store.alertFiles. No fs, no ssh, no HTTP.

const data = require('../data');

const strikes = new Map(); // ruleKey+server -> consecutive breach count

function getByPath(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function testOp(value, operator, threshold) {
  switch (operator) {
    case '>': return value > threshold;
    case '>=': return value >= threshold;
    case '<': return value < threshold;
    case '<=': return value <= threshold;
    default: return false;
  }
}

function defaultRules() {
  return [
    { id: 'cpu-high', serverId: '*', metric: 'cpu.usagePct', operator: '>', threshold: 90, forConsecutive: 3 },
    { id: 'mem-high', serverId: '*', metric: 'mem.usagePct', operator: '>', threshold: 90, forConsecutive: 3 },
    { id: 'disk-high', serverId: '*', metric: 'disk.usagePct', operator: '>', threshold: 85, forConsecutive: 2 },
  ];
}

function evaluateSample(dbDir, sample, rules) {
  const active = (rules && rules.length ? rules : defaultRules()).filter(
    (r) => r.serverId === '*' || r.serverId === sample.serverId
  );
  const fired = [];
  for (const r of active) {
    const value = getByPath(sample, r.metric);
    if (typeof value !== 'number') continue;
    const key = `${r.id || r.metric}:${sample.serverId}`;
    const need = Math.max(1, r.forConsecutive || 1);
    if (testOp(value, r.operator, r.threshold)) {
      const n = (strikes.get(key) || 0) + 1;
      strikes.set(key, n);
      if (n === need) {
        const event = {
          ts: Date.now(),
          serverId: sample.serverId,
          ruleId: r.id || r.metric,
          metric: r.metric,
          operator: r.operator,
          threshold: r.threshold,
          value,
          message: `${sample.serverId}: ${r.metric} ${r.operator} ${r.threshold} (got ${value})`,
        };
        data.store.alertFiles.appendAlert(dbDir, sample.serverId, event);
        fired.push(event);
      }
    } else {
      strikes.set(key, 0);
    }
  }
  return fired;
}

function recordHostDown(dbDir, server, error) {
  const event = {
    ts: Date.now(),
    serverId: server.id,
    ruleId: 'host-down',
    metric: 'status',
    value: 0,
    message: `${server.id} unreachable: ${error}`,
  };
  data.store.alertFiles.appendAlert(dbDir, server.id, event);
  return event;
}

function listAlerts(dbDir, serverId) {
  return data.store.alertFiles.readAlerts(dbDir, serverId);
}

function clearAlerts(dbDir, serverId) {
  return data.store.alertFiles.clearAlerts(dbDir, serverId);
}

function clearStrikes() {
  strikes.clear();
}

module.exports = { evaluateSample, recordHostDown, listAlerts, clearAlerts, defaultRules, clearStrikes };
