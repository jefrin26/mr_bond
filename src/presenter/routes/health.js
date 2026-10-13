'use strict';

// PRESENTER — health route. Data only via data-handler (none needed here).

function registerHealth(app) {
  app.get('/healthz', (req, res) => res.json({ ok: true, ts: Date.now() }));
}

module.exports = { registerHealth };
