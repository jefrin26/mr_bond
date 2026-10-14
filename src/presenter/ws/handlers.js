'use strict';

// PRESENTER/WS — client message handlers. Data ONLY via data-handler.
// Never touches ../data, fs, ssh2, or ws directly; sends via ctx.send().

const protocol = require('./protocol');

async function handleClientMsg(ws, msg, ctx) {
  const { cfg, handler, subs, send } = ctx;
  switch (msg.type) {
    case 'subscribe': {
      const ids = msg.ids == null ? null : [].concat(msg.ids).map(String);
      if (ids) {
        for (const id of ids) {
          if (!handler.serverHandler.findServer(cfg, id)) {
            send(ws, protocol.errorMsg(`unknown server: ${id}`));
            return;
          }
        }
      }
      subs.setIds(ws, ids);
      send(ws, { type: 'subscribed', ids, ts: Date.now() });
      return;
    }
    case 'unsubscribe': {
      if (msg.ids == null) {
        subs.setIds(ws, null);
        send(ws, { type: 'subscribed', ids: null, ts: Date.now() });
        return;
      }
      const current = subs.getIds(ws);
      if (current == null) {
        send(ws, { type: 'subscribed', ids: null, ts: Date.now() });
        return;
      }
      for (const id of [].concat(msg.ids).map(String)) current.delete(id);
      subs.setIds(ws, [...current]);
      send(ws, { type: 'subscribed', ids: [...current], ts: Date.now() });
      return;
    }
    case 'poll': {
      const id = msg.id ? String(msg.id) : '';
      if (!id) {
        send(ws, protocol.errorMsg('poll requires id'));
        return;
      }
      try {
        const { sample, alertsFired } = await handler.monitorHandler.pollOne(cfg, id, { persist: true });
        send(ws, protocol.toLivePayload(sample, alertsFired));
      } catch (err) {
        if (err.code === 'UNKNOWN_SERVER') send(ws, protocol.errorMsg('unknown server'));
        else if (err.code === 'HOST_DOWN' && err.down) send(ws, protocol.toLivePayload(err.down, []));
        else send(ws, protocol.errorMsg(err.message));
      }
      return;
    }
    case 'get_live': {
      const id = msg.id ? String(msg.id) : '';
      if (!id) {
        send(ws, protocol.errorMsg('get_live requires id'));
        return;
      }
      if (!handler.serverHandler.findServer(cfg, id)) {
        send(ws, protocol.errorMsg('unknown server'));
        return;
      }
      const cached = handler.monitorHandler.getLive(cfg, id);
      if (!cached) {
        send(ws, protocol.errorMsg('no live data yet'));
        return;
      }
      send(ws, protocol.toLivePayload(cached, []));
      return;
    }
    case 'get_history': {
      const id = msg.id ? String(msg.id) : '';
      if (!id) {
        send(ws, protocol.errorMsg('get_history requires id'));
        return;
      }
      if (!handler.serverHandler.findServer(cfg, id)) {
        send(ws, protocol.errorMsg('unknown server'));
        return;
      }
      const metric = msg.metric ? String(msg.metric) : 'cpu';
      const since = msg.since ? Number(msg.since) : 0;
      const limit = msg.limit ? Number(msg.limit) : 500;
      const points = handler.monitorHandler.getHistory(cfg, id, metric, { since, limit });
      if (!points) {
        send(ws, protocol.errorMsg(`no history for metric ${metric}`));
        return;
      }
      send(ws, protocol.historyReply(id, metric, points));
      return;
    }
    case 'get_alerts': {
      const serverId = msg.serverId ? String(msg.serverId) : msg.id ? String(msg.id) : undefined;
      if (serverId && !handler.serverHandler.findServer(cfg, serverId)) {
        send(ws, protocol.errorMsg('unknown server'));
        return;
      }
      const events = handler.alertHandler.listAlerts(cfg.dbDir, serverId);
      send(ws, protocol.alertsReply(events));
      return;
    }
    case 'ping': {
      send(ws, protocol.pong());
      return;
    }
    default:
      send(ws, protocol.errorMsg(`unknown type: ${msg.type}`));
  }
}

module.exports = { handleClientMsg };
