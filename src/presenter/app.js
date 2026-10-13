'use strict';

// PRESENTER — Express app assembly. Imports ONLY data-handler (never ../data).

const express = require('express');
const handler = require('../data-handler');
const { registerHealth } = require('./routes/health');
const { registerServers } = require('./routes/servers');
const { registerLive } = require('./routes/live');
const { registerHistory } = require('./routes/history');
const { registerAlerts } = require('./routes/alerts');
const { registerCache } = require('./routes/cache');

function createApi(cfg) {
  const app = express();
  app.use(express.json());
  app.disable('x-powered-by');

  const ctx = { cfg, handler };
  registerHealth(app, ctx);
  registerServers(app, ctx);
  registerLive(app, ctx);
  registerHistory(app, ctx);
  registerAlerts(app, ctx);
  registerCache(app, ctx);

  return app;
}

module.exports = { createApi };
