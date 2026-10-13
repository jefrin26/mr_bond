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

  const scheduler = handler.monitorHandler.startScheduler(cfg);
  const app = presenter.createApi(cfg);
  const server = app.listen(cfg.port, () => {
    console.log(`monitor API listening on :${cfg.port} (poll every ${cfg.pollIntervalSec}s, ${cfg.servers.length} server(s))`);
  });

  const shutdown = () => {
    console.log('\nshutting down...');
    try { scheduler.stop(); } catch { /* noop */ }
    server.close(() => process.exit(0));
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
