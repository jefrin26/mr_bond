'use strict';

// DATA LAYER — alert event files: db/alerts/<serverId>.json

const fs = require('fs');
const path = require('path');
const { atomicWriteJson, readJson } = require('./jsonFiles');

function alertsPath(dbDir, serverId) {
  return path.join(dbDir, 'alerts', `${serverId}.json`);
}

function appendAlert(dbDir, serverId, event, { maxEvents = 200 } = {}) {
  const file = alertsPath(dbDir, serverId);
  let arr = readJson(file, []);
  if (!Array.isArray(arr)) arr = [];
  arr.push(event);
  if (arr.length > maxEvents) arr = arr.slice(arr.length - maxEvents);
  atomicWriteJson(file, arr);
}

function readAlerts(dbDir, serverId) {
  if (serverId) return readJson(alertsPath(dbDir, serverId), []);
  const dir = path.join(dbDir, 'alerts');
  if (!fs.existsSync(dir)) return [];
  const all = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const arr = readJson(path.join(dir, f), []);
    for (const e of arr) all.push(e);
  }
  return all.sort((a, b) => b.ts - a.ts).slice(0, 500);
}

function clearAlerts(dbDir, serverId) {
  if (serverId) {
    const f = alertsPath(dbDir, serverId);
    if (fs.existsSync(f)) { fs.unlinkSync(f); return 1; }
    return 0;
  }
  const dir = path.join(dbDir, 'alerts');
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    fs.unlinkSync(path.join(dir, f));
    n++;
  }
  return n;
}

module.exports = { alertsPath, appendAlert, readAlerts, clearAlerts };
