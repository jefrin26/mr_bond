'use strict';

// DATA LAYER — live snapshot files: db/live/<serverId>.json

const fs = require('fs');
const path = require('path');
const { atomicWriteJson, readJson } = require('./jsonFiles');

function livePath(dbDir, serverId) {
  return path.join(dbDir, 'live', `${serverId}.json`);
}

function writeLive(dbDir, sample) {
  atomicWriteJson(livePath(dbDir, sample.serverId), sample);
}

function readLive(dbDir, serverId) {
  return readJson(livePath(dbDir, serverId), null);
}

function readAllLive(dbDir) {
  const dir = path.join(dbDir, 'live');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(path.join(dir, f), null))
    .filter(Boolean);
}

function clearLive(dbDir, serverId) {
  if (serverId) {
    const f = livePath(dbDir, serverId);
    if (fs.existsSync(f)) { fs.unlinkSync(f); return 1; }
    return 0;
  }
  const dir = path.join(dbDir, 'live');
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    fs.unlinkSync(path.join(dir, f));
    n++;
  }
  return n;
}

module.exports = { livePath, writeLive, readLive, readAllLive, clearLive };
