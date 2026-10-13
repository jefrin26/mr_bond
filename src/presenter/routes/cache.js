'use strict';

// PRESENTER — live-cache clearing. Data only via data-handler/monitorHandler.

function registerCache(app, { cfg, handler }) {
  app.delete('/api/cache', (req, res) => {
    const n = handler.monitorHandler.clearLive(cfg, req.query.serverId ? String(req.query.serverId) : undefined);
    res.json({ clearedLiveFiles: n });
  });
}

module.exports = { registerCache };
