# AI-CONTEXT — monitor codebase guide

> Read this before writing any code in this repo. It captures hard-won
> experience: architecture rules, gotchas, and how to extend safely.

## 1. What this is

Agentless SSH server monitor. Node 18+ (CommonJS, `node src/index.js`).
Linux targets only, API-only (no UI). Polls over SSH (`ssh2`), stores
snapshots as JSON files under `db/`, serves REST via Express 4.

- Deps: `dotenv`, `express@4`, `ssh2`. Nothing else.
- Entry: `src/index.js` (thin bootstrap only).
- PM2: `ecosystem.config.js` (`instances: 1`, `fork` — do NOT change to cluster).

## 2. Trinity architecture (STRICT — do not violate)

```
src/data/          fetch/load/persist ONLY (ssh, fs, config, parsers)
src/data-handler/  processes ONLY via ../data (poll orchestration, alerts, joins)
src/presenter/     expose ONLY via ../data-handler (express routes)
src/index.js       bootstrap wiring the three (only place that touches all)
```

Layer rules (enforced by grep in reviews):

- `src/presenter/**` may `require('../data-handler')` — **never** `require('../data')`,
  never `fs`/`ssh2` directly.
- `src/data-handler/**` may `require('../data')` + siblings — **never** `fs`,
  `ssh2`, `express`, or `db/` paths directly.
- `src/data/store/jsonFiles.js` is the ONLY module allowed to touch `fs` for `db/`.
- `src/data/sshClient.js` is the ONLY module allowed to use `ssh2`.
- `src/data/appConfig.js` is the ONLY module allowed to read `.env`/`servers.json`/`alerts.json`.

Barrels:

- `src/data/index.js` → `{ appConfig, sshClient, linux, store }`
- `src/data/store/index.js` → `{ jsonFiles, liveFiles, historyFiles, alertFiles }`
- `src/data-handler/index.js` → `{ serverHandler, monitorHandler, alertHandler }`
- `src/presenter/index.js` → `{ createApi }`

### File map

```
src/data/appConfig.js            env+servers.json+alerts.json loader
src/data/sshClient.js            pollServer(), prevState deltas
src/data/linux/command.js        buildCommand(), splitSections(), SEP
src/data/linux/sampleBuilder.js  toSample() — assembles normalized sample
src/data/linux/memParser|diskParser|netParser|systemParser|statParser.js  pure parsers
src/data/store/jsonFiles.js      ensureDir/atomicWriteJson/readJson
src/data/store/liveFiles.js      db/live/<id>.json
src/data/store/historyFiles.js   db/history/<id>/<metric>.json (+disk_full.json)
src/data/store/alertFiles.js     db/alerts/<id>.json
src/data-handler/serverHandler.js  findServer(), listServers() (public+live join)
src/data-handler/monitorHandler.js pollOne/pollAll/getLive/getHistory/clear*/startScheduler
src/data-handler/alertHandler.js   evaluateSample/recordHostDown/list/clear/defaultRules
src/presenter/app.js             createApi() — wires route modules
src/presenter/routes/health|servers|live|history|alerts|cache.js  one group per file
```

## 3. Data shapes

Sample (ok): `{ serverId, host, ts, status:'ok', durationMs, cpu:{usagePct|null,load1,load5,load15}, mem:{usagePct,usedBytes,totalBytes,...}, disk:{usagePct,usedBytes,totalBytes,target,mounts}, net:{ifaces,rates|null}, system:{uptimeHuman,load1,load5,load15} }`
Down: `{ serverId, host, ts, status:'down', error, cpu:null, mem:null, disk:null, net:null, system:null }`

History point: `{ ts, value }` where value is the metric slice.
Valid metrics: `cpu, mem, disk, net, system` (+ read-only `disk_full`).
Alert event: `{ ts, serverId, ruleId, metric, operator, threshold, value, message }`.
Rule: `{ id, serverId:'*'|<id>, metric:'cpu.usagePct'|..., operator:'>'|'>='|'<'|'<=', threshold, forConsecutive }`.

## 4. Gotchas learned the hard way

1. **`pollServer()` never throws sync** — returns `{ ok:false, error, serverId, ts, status:'down' }`.
   `connectConfig()` (missing key file) and `conn.connect()` are wrapped. Keep it that way;
   the old crash (`ENOENT ~/.ssh/id_rsa` killing the poller) was fixed by this. Always use
   `Promise.allSettled` over polls.
2. **First poll has `cpu.usagePct === null` and `net.rates === null`** — deltas need `prevState`
   (`Map serverId → { cpu, net, ts }`). Don't treat null as 0. `clearLive` also clears prevState.
3. **History is written ONLY on ok samples.** Down samples go to live + alerts, never history.
   So `GET /api/history` 404 (`{ error:'no history...' }`) after only-down polls is correct.
4. **Alerts need consecutive breaches** (`forConsecutive`, `strikes` Map in alertHandler).
   Single breach does NOT fire. Tests must call `evaluateSample` N times. `host-down` fires immediately.
5. **Config precedence: `servers.json` wins over `.env`** for
   `pollIntervalSec/sshTimeoutMs/historyMaxPoints/historyMaxDays`
   (`Number(doc.x || process.env.X || default)`). Setting `POLL_INTERVAL_SEC=2` in env does
   nothing if `servers.json` has `pollIntervalSec: 30`. This confused testing once.
6. **`db/` files use atomic tmp+rename** (`<file>.<pid>.tmp`). Never write directly.
   `db/*` and `logs/*` are gitignored except `.gitkeep`. Real `.env`/`servers.json`/`alerts.json`
   are gitignored; only `*.example` are committed. Never log secrets (`publicServer()` strips them).
7. **PM2 must stay `instances:1/fork`.** Cluster duplicates SSH polls and races JSON files
   (no file locks by design). Scheduler has a `running` guard + `Math.max(5, interval)` floor.
8. **SSH command is one exec** (`buildCommand()` joined by `;`, split by `__MON_SEP_*` sentinels).
   Don't add per-metric round trips. `df` excludes `tmpfs/devtmpfs/overlay`.
9. **Error codes from `monitorHandler.pollOne`**: `UNKNOWN_SERVER` → 404, `HOST_DOWN` (carries `.down`) → 502.
   Presenter maps these; keep the contract.
10. **Port comes only from `process.env.PORT`** (default 3000), not servers.json.

## 5. How to extend (follow existing patterns)

- **New metric**: add parser in `src/data/linux/<x>Parser.js` → include in `sampleBuilder.js`
  slices → add name to `METRICS` in `historyFiles.js` (auto-persisted/pruned). No handler change needed
  unless thresholds use it.
- **New alert rule**: add to `alerts.json` (copy `alerts.json.example`). Metric path uses
  dot notation via `getByPath` (e.g. `cpu.usagePct`). `serverId:'*'` = all hosts.
- **New endpoint**: create `src/presenter/routes/<x>.js` exporting `register<X>(app, { cfg, handler })`
  using ONLY `handler.*`, then call it from `presenter/app.js`. Never import `../data` in presenter.
- **New processing**: add function in `src/data-handler/*Handler.js` using ONLY `data.*`.
  Add unit-testable pure logic there, keep I/O in `data/`.

## 6. Run / verify (no real servers needed)

```bash
cp servers.json.example servers.json; cp .env.example .env; cp alerts.json.example alerts.json
npm install
node -e "require('./src/data').appConfig.loadConfig()"   # fails fast with helpful msg if misconfigured
PORT=3456 timeout 8 node src/index.js & sleep 3
curl -s localhost:3456/healthz
curl -s localhost:3456/api/servers | head -c 400
curl -s localhost:3456/api/alerts/rules | head -c 200
curl -s -X DELETE localhost:3456/api/cache
```

- Parsers: `require('./src/data/linux/memParser')` etc. directly with fixture strings (see past
  verification: mem 62.5%, df 80%, net rx/tx, uptime loads).
- Handler flow without SSH: write fake sample via `data.store.liveFiles`, evaluate via
  `alertHandler.evaluateSample` twice (consecutive), read via `monitorHandler.getLive`.
- SSH failure test: `pollServer({id,host:'192.168.1.10',...}, 1500)` → `ok:false` (EHOSTUNREACH),
  never throws. Down hosts appear in `/api/servers[].last.status === 'down'` + `/api/alerts` as `host-down`.
- Syntax: `for f in $(find src -name '*.js'); do node --check "$f"; done`
- Layer check: `grep -rn '\.\./data' src/presenter/` must show only `../data-handler`;
  `grep -rn 'require(.fs.)\|ssh2\|express' src/data-handler/` must show nothing (comments excepted).
- Cleanup after tests: `rm -rf db/live/*.json db/history/* db/alerts/*.json`.

## 7. Conventions

CommonJS + `'use strict'`, 2-space indent, no TypeScript/build step. `dotenv.config()` runs in
`appConfig.js` on require. Express 4 (`express.json()`, `x-powered-by` disabled). Keep modules
small/single-purpose — "highly modular" is a requirement, don't merge files. Don't create docs
unless asked (this file is the exception).
