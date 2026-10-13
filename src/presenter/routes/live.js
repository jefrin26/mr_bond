'use strict';

// PRESENTER — live + manual poll routes. Data only via data-handler/monitorHandler.

function registerLive(app, { cfg, handler }) {
  // Cached live; ?refresh=true forces a fresh poll through the handler.
  app.get('/api/live/:id', async (req, res) => {
    const server = handler.serverHandler.findServer(cfg, req.params.id);
    if (!server) return res.status(404).json({ error: 'unknown server' });
    if (String(req.query.refresh).toLowerCase() !== 'true') {
      const cached = handler.monitorHandler.getLive(cfg, server.id);
      if (cached) return res.json({ cached: true, ...cached });
    }
    try {
      const { sample } = await handler.monitorHandler.pollOne(cfg, server.id, { persist: true });
      res.json({ cached: false, ...sample });
    } catch (err) {
      if (err.code === 'HOST_DOWN') return res.status(502).json(err.down);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/poll/:id', async (req, res) => {
    try {
      const { sample, alertsFired } = await handler.monitorHandler.pollOne(cfg, req.params.id, { persist: true });
      res.json({ ...sample, alertsFired });
    } catch (err) {
      if (err.code === 'UNKNOWN_SERVER') return res.status(404).json({ error: 'unknown server' });
      if (err.code === 'HOST_DOWN') return res.status(502).json(err.down);
      return res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerLive };
