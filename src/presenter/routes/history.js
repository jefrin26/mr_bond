'use strict';

// PRESENTER — history routes. Data only via data-handler/monitorHandler.

function registerHistory(app, { cfg, handler }) {
  app.get('/api/history/:id', (req, res) => {
    const server = handler.serverHandler.findServer(cfg, req.params.id);
    if (!server) return res.status(404).json({ error: 'unknown server' });
    const metric = String(req.query.metric || 'cpu');
    const since = req.query.since ? Number(req.query.since) : 0;
    const limit = req.query.limit ? Number(req.query.limit) : 500;
    const data = handler.monitorHandler.getHistory(cfg, server.id, metric, { since, limit });
    if (!data) return res.status(404).json({ error: `no history for metric ${metric}` });
    res.json({ serverId: server.id, metric, points: data });
  });

  app.delete('/api/history/:id', (req, res) => {
    const n = handler.monitorHandler.clearHistory(cfg, req.params.id, req.query.metric ? String(req.query.metric) : undefined);
    res.json({ clearedHistoryFiles: n });
  });

  app.delete('/api/history', (req, res) => {
    const n = handler.monitorHandler.clearHistory(cfg, undefined, req.query.metric ? String(req.query.metric) : undefined);
    res.json({ clearedHistoryFiles: n });
  });
}

module.exports = { registerHistory };
