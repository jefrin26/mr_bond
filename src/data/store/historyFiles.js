'use strict';

// DATA LAYER — history files: db/history/<serverId>/<metric>.json

const fs = require('fs');
const path = require('path');
const { atomicWriteJson, readJson } = require('./jsonFiles');

const METRICS = ['cpu', 'mem', 'disk', 'net', 'system'];

function historyPath(dbDir, serverId, metric) {
  return path.join(dbDir, 'history', serverId, `${metric}.json`);
}

function appendHistory(dbDir, sample, { maxPoints = 1000, maxDays = 7 } = {}) {
  const cutoff = Date.now() - maxDays * 24 * 3600 * 1000;
  const slices = {
    cpu: sample.cpu,
    mem: sample.mem,
    disk: { usagePct: sample.disk?.usagePct, usedBytes: sample.disk?.usedBytes, totalBytes: sample.disk?.totalBytes, target: sample.disk?.target },
    net: sample.net,
    system: sample.system,
  };
  for (const m of METRICS) {
    const file = historyPath(dbDir, sample.serverId, m);
    let arr = readJson(file, []);
    if (!Array.isArray(arr)) arr = [];
    arr.push({ ts: sample.ts, value: slices[m] });
    if (arr.length > maxPoints) arr = arr.slice(arr.length - maxPoints);
    if (maxDays) arr = arr.filter((p) => p.ts >= cutoff);
    atomicWriteJson(file, arr);
  }
  const fullFile = path.join(dbDir, 'history', sample.serverId, 'disk_full.json');
  let full = readJson(fullFile, []);
  if (!Array.isArray(full)) full = [];
  full.push({ ts: sample.ts, value: sample.disk });
  if (full.length > Math.min(maxPoints, 200)) full = full.slice(full.length - Math.min(maxPoints, 200));
  atomicWriteJson(fullFile, full.filter((p) => p.ts >= cutoff));
}

function readHistory(dbDir, serverId, metric, { since = 0, limit = 500 } = {}) {
  if (!METRICS.includes(metric) && metric !== 'disk_full') return null;
  const arr = readJson(historyPath(dbDir, serverId, metric), null);
  if (!arr) return null;
  return arr.filter((p) => p.ts >= since).slice(-Math.max(1, Math.min(limit, 5000)));
}

function clearHistory(dbDir, serverId, metric) {
  const base = serverId ? path.join(dbDir, 'history', serverId) : path.join(dbDir, 'history');
  if (!fs.existsSync(base)) return 0;
  let n = 0;
  const rm = (f) => { fs.unlinkSync(f); n++; };
  if (serverId && metric) {
    const f = historyPath(dbDir, serverId, metric);
    if (fs.existsSync(f)) rm(f);
    return n;
  }
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json') && (!metric || e.name === `${metric}.json`)) rm(p);
    }
  };
  walk(base);
  return n;
}

module.exports = { METRICS, historyPath, appendHistory, readHistory, clearHistory };
