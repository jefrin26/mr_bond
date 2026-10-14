'use strict';

// BOOTSTRAP — wires trinity: data (fetch) -> data-handler (process) -> presenter (expose).

const data = require('./data');
const handler = require('./data-handler');
const presenter = require('./presenter');

function main() {
  const cfg = data.appConfig.loadConfig();
  data.store.jsonFiles.ensureDir(`${cfg.dbDir}/live`);
  data.store.jsonFiles.ensureDir(`${cfg.dbDir}/history`);
  data.store.jsonFiles.ensureDir(`${cfg.dbDir}/alerts`);

  const api = presenter.createWsApi(cfg);
  console.log(`monitor WS listening on :${cfg.port} (poll every ${cfg.pollIntervalSec}s, ${cfg.servers.length} server(s))`);
  const scheduler = handler.monitorHandler.startScheduler(cfg, {
    onTick: (outcomes) => api.broadcast(outcomes),
  });

  const shutdown = () => {
    console.log('\nshutting down...');
    try { scheduler.stop(); } catch { /* noop */ }
    try { api.close(() => process.exit(0)); } catch { process.exit(0); }
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`fatal: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { main };
