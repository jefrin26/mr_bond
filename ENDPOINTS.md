# ENDPOINTS — monitor API reference

Base URL: `http://<host>:<PORT>` (`PORT` from `.env`, default `3000`).
All responses are JSON. Errors use `{ "error": "<message>" }` except
host-down polls which return the down-sample object with HTTP 502.

Conventions:

- `:id` = server id from `servers.json` (e.g. `web1`).
- `metric` ∈ `cpu | mem | disk | net | system` (+ read-only `disk_full`).
- `since` = epoch ms filter, `limit` = max points (default 500, cap 5000).
- First poll after boot has `cpu.usagePct: null`, `net.rates: null` (needs delta).
- History is written only on `ok` samples; down hosts yield 404 on history.

---

## 1. `GET /healthz` — liveness

```bash
curl -s localhost:3000/healthz
```

`200`:
```json
{ "ok": true, "ts": 1791917166126 }
```

## 2. `GET /api/servers` — inventory + last snapshot

```bash
curl -s localhost:3000/api/servers
```

`200` (array; `last` is `null` until first poll finishes):
```json
[
  {
    "id": "web1", "host": "192.168.1.10", "port": 22,
    "enabled": true, "authType": "password", "username": "monitor",
    "last": {
      "serverId": "web1", "host": "192.168.1.10", "ts": 1791917165726,
      "status": "down", "error": "connect EHOSTUNREACH 192.168.1.10:22",
      "cpu": null, "mem": null, "disk": null, "net": null, "system": null
    }
  },
  {
    "id": "db1", "host": "192.168.1.11", "port": 22,
    "enabled": true, "authType": "key", "username": "monitor",
    "last": { "serverId": "db1", "status": "down", "error": "ENOENT: no such file or directory, open '/home/jefrin/.ssh/id_rsa'", "cpu": null, "mem": null, "disk": null, "net": null, "system": null, "ts": 1791917165728, "host": "192.168.1.11" }
  }
]
```
Note: secrets never appear (`authType`/`username` only).

## 3. `GET /api/live/:id` — cached live or forced poll

Query: `?refresh=true` forces SSH poll (default serves `db/live/<id>.json`).

```bash
curl -s "localhost:3000/api/live/web1"                  # cached
curl -s "localhost:3000/api/live/web1?refresh=true"     # fresh poll
```

`200` cached:
```json
{ "cached": true, "serverId": "web1", "host": "192.168.1.10", "ts": 1791917165726, "status": "down", "error": "connect EHOSTUNREACH 192.168.1.10:22", "cpu": null, "mem": null, "disk": null, "net": null, "system": null }
```

`200` fresh ok (representative; `usagePct`/`rates` are numbers after 2nd poll, `null` on 1st):
```json
{
  "cached": false, "serverId": "web1", "host": "192.168.1.10",
  "ts": 1791917178283, "status": "ok", "durationMs": 120,
  "cpu": { "usagePct": 42.3, "load1": 0.1, "load5": 0.2, "load15": 0.3 },
  "mem": { "usagePct": 62.5, "usedBytes": 5120000000, "totalBytes": 8192000000, "availableBytes": 3072000000, "swapTotalBytes": 1024000000, "swapFreeBytes": 921600000 },
  "disk": { "usagePct": 40, "usedBytes": 400000000, "totalBytes": 1000000000, "target": "/", "mounts": [{ "source": "/dev/sda1", "sizeBytes": 1000000000, "usedBytes": 400000000, "availBytes": 600000000, "usagePct": 40, "target": "/" }] },
  "net": { "ifaces": { "eth0": { "rxBytes": 1000, "txBytes": 2000 } }, "rates": { "eth0": { "rxBytesPerSec": 10, "txBytesPerSec": 20 } } },
  "system": { "uptimeHuman": "5 days, 2:11", "load1": 0.1, "load5": 0.2, "load15": 0.3 }
}
```

`404` unknown id: `{ "error": "unknown server" }`
`502` host down (fresh poll failed, also persisted to live + alerts):
```json
{ "serverId": "web1", "host": "192.168.1.10", "ts": 1791917169244, "status": "down", "error": "connect EHOSTUNREACH 192.168.1.10:22", "cpu": null, "mem": null, "disk": null, "net": null, "system": null }
```

## 4. `POST /api/poll/:id` — manual poll (always SSH, persists)

```bash
curl -s -X POST localhost:3000/api/poll/web1
```

`200` ok: same shape as live-ok **plus** `"alertsFired": []` (array of fired events, empty if none).
`404`: `{ "error": "unknown server" }`
`502`: down-sample object (same as above).

## 5. `GET /api/history/:id` — metric history

Query: `?metric=cpu` (default) `&since=<epochMs>&limit=<n>`.

```bash
curl -s "localhost:3000/api/history/web1?metric=cpu&limit=2"
curl -s "localhost:3000/api/history/web1?metric=mem&since=1791917100000&limit=100"
```

`200`:
```json
{
  "serverId": "web1", "metric": "cpu",
  "points": [
    { "ts": 1791917178283, "value": { "usagePct": 42.3, "load1": 0.1, "load5": 0.2, "load15": 0.3 } },
    { "ts": 1791917208283, "value": { "usagePct": 41.9, "load1": 0.12, "load5": 0.2, "load15": 0.3 } }
  ]
}
```
Other metric value shapes: `mem` → `{ usagePct, usedBytes, totalBytes, ... }`,
`disk` → `{ usagePct, usedBytes, totalBytes, target }` (full mounts in `metric=disk_full`),
`net` → `{ ifaces, rates }`, `system` → `{ uptimeHuman, load1, load5, load15 }`.

`404` unknown server: `{ "error": "unknown server" }`
`404` no data (e.g. only down polls so far, or bad metric): `{ "error": "no history for metric cpu" }`

## 6. `GET /api/alerts` — alert events (newest first, max 500)

```bash
curl -s localhost:3000/api/alerts
curl -s "localhost:3000/api/alerts?serverId=web1"
```

`200`:
```json
[
  { "ts": 1791917169246, "serverId": "web1", "ruleId": "host-down", "metric": "status", "value": 0, "message": "web1 unreachable: connect EHOSTUNREACH 192.168.1.10:22" },
  { "ts": 1791917165728, "serverId": "db1", "ruleId": "host-down", "metric": "status", "value": 0, "message": "db1 unreachable: ENOENT: no such file or directory, open '/home/jefrin/.ssh/id_rsa'" }
]
```
Threshold example: `{ "ts": 1791917..., "serverId": "web1", "ruleId": "cpu-high", "metric": "cpu.usagePct", "operator": ">", "threshold": 90, "value": 95.2, "message": "web1: cpu.usagePct > 90 (got 95.2)" }`

## 7. `GET /api/alerts/rules` — active rules (from `alerts.json`)

```bash
curl -s localhost:3000/api/alerts/rules
```

`200`:
```json
[
  { "id": "cpu-high", "serverId": "*", "metric": "cpu.usagePct", "operator": ">", "threshold": 90, "forConsecutive": 3 },
  { "id": "mem-high", "serverId": "*", "metric": "mem.usagePct", "operator": ">", "threshold": 90, "forConsecutive": 3 },
  { "id": "disk-high", "serverId": "*", "metric": "disk.usagePct", "operator": ">", "threshold": 85, "forConsecutive": 2 },
  { "id": "load-high", "serverId": "*", "metric": "cpu.load1", "operator": ">", "threshold": 4, "forConsecutive": 3 }
]
```

## 8. `DELETE /api/cache` — clear live snapshots (+ resets cpu/net deltas)

```bash
curl -s -X DELETE localhost:3000/api/cache
curl -s -X DELETE "localhost:3000/api/cache?serverId=web1"
```

`200`: `{ "clearedLiveFiles": 1 }` (`0` if nothing cached)

## 9. `DELETE /api/history/:id` / `DELETE /api/history` — clear history files

```bash
curl -s -X DELETE localhost:3000/api/history/web1
curl -s -X DELETE "localhost:3000/api/history/web1?metric=cpu"
curl -s -X DELETE "localhost:3000/api/history?metric=cpu"
```

`200`: `{ "clearedHistoryFiles": 6 }` (per-server clear removes `cpu,mem,disk,net,system,disk_full` → 6)

## 10. `DELETE /api/alerts` — clear alert files

```bash
curl -s -X DELETE localhost:3000/api/alerts
curl -s -X DELETE "localhost:3000/api/alerts?serverId=web1"
```

`200`: `{ "clearedAlertFiles": 2 }`

---

## Status-code cheat sheet

| Code | Meaning | Endpoints |
|------|---------|-----------|
| 200 | ok (incl. DELETE counts) | all |
| 404 | unknown server id, or no history for metric | live/poll/history |
| 502 | SSH unreachable / key missing (down-sample body) | live/poll |
| 500 | unexpected (poll threw) | live/poll |
