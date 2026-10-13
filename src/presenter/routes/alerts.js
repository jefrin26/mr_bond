'use strict';

// PRESENTER — alerts routes. Data only via data-handler/alertHandler.

function registerAlerts(app, { cfg, handler }) {
  app.get('/api/alerts', (req, res) => {
    res.json(handler.alertHandler.listAlerts(cfg.dbDir, req.query.serverId ? String(req.query.serverId) : undefined));
  });

  app.get('/api/alerts/rules', (req, res) => res.json(cfg.rules));

  app.delete('/api/alerts', (req, res) => {
    const n = handler.alertHandler.clearAlerts(cfg.dbDir, req.query.serverId ? String(req.query.serverId) : undefined);
    res.json({ clearedAlertFiles: n });
  });
}

module.exports = { registerAlerts };
