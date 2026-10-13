'use strict';

// PRESENTER — servers route. Data only via data-handler/serverHandler.

function registerServers(app, { cfg, handler }) {
  app.get('/api/servers', (req, res) => {
    res.json(handler.serverHandler.listServers(cfg));
  });
}

module.exports = { registerServers };
