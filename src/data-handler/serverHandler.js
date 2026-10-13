'use strict';

// DATA-HANDLER — server inventory processes.
// Reads only via data layer (cfg object + live files). No fs, no ssh, no HTTP.

const data = require('../data');

function findServer(cfg, id) {
  return cfg.servers.find((s) => s.id === id) || null;
}

function listServers(cfg) {
  const live = Object.fromEntries(
    data.store.liveFiles.readAllLive(cfg.dbDir).map((s) => [s.serverId, s])
  );
  return cfg.servers.map((s) => ({ ...data.appConfig.publicServer(s), last: live[s.id] || null }));
}

module.exports = { findServer, listServers };
