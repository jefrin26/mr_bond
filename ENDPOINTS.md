# ENDPOINTS — monitor WS API reference (WS-only)

URL: `ws://<host>:<PORT>` (`PORT` from `.env`, default `3000`).
All messages are JSON. The wire carries **no static inventory**
(no name/host/ip/port/auth/target/message text) — key is `id` only.
The client holds name/ip statically (copy of `servers.json`).

Conventions:

- `id` = server id (e.g. `web1`). Client maps `id → { name, ip }` locally.
- `metric` ∈ `cpu | mem | disk | net | system` (+ read-only `disk_full`).
- `since` = epoch ms filter, `limit` = max points (default 500, cap 5000).
- First poll after boot has `cpu.usagePct: null`, `net.rates: null` (needs delta).
- History is written only on `ok` samples; down hosts yield
  `{ "type": "error", "error": "no history for metric cpu" }`.

---

## 1. Server push (every scheduler tick, per enabled server)

```json
{ "type": "welcome", "ts": 1791917166126 }
{ "type": "live", "id": "web1", "ts": 1791917178283, "status": "ok",
  "cpu": { "usagePct": 42.3, "load1": 0.1, "load5": 0.2, "load15": 0.3 },
  "mem": { "usagePct": 62.5, "usedBytes": 5120000000, "totalBytes": 8192000000 },
  "disk": { "usagePct": 40, "usedBytes": 400000000, "totalBytes": 1000000000,
            "mounts": [{ "usagePct": 40, "usedBytes": 400000000, "availBytes": 600000000 }] },
  "net": { "rates": { "eth0": { "rxBytesPerSec": 10, "txBytesPerSec": 20 } } },
  "system": { "uptimeHuman": "5 days, 2:11", "load1": 0.1, "load5": 0.2, "load15": 0.3 },
  "alerts": [{ "rule": "cpu-high", "metric": "cpu.usagePct", "op": ">", "threshold": 90, "value": 95.2, "ts": 1791917 }] }
{ "type": "live", "id": "web1", "ts": 1791917169244, "status": "down", "error": "connect EHOSTUNREACH 192.168.1.10:22" }
```

Static stripped vs old REST: no `host`, `serverId→id`, no `durationMs`,
no `disk.target/source/sizeBytes`, no `net.ifaces` (rates only),
no `mem.availableBytes/swap*`, no `message` text.

---

## 2. Client messages

```js
{ "type": "subscribe", "ids": ["web1"] }  // omit ids = all
{ "type": "unsubscribe" }                 // back to all
{ "type": "poll", "id": "web1" }          // force SSH poll now, replies with live
{ "type": "get_live", "id": "web1" }      // cached snapshot, replies with live
{ "type": "get_history", "id": "web1", "metric": "cpu", "since": 1791917100000, "limit": 100 }
{ "type": "get_alerts", "serverId": "web1" }  // omit = all
{ "type": "ping" }                        // → { "type": "pong", "ts": 123 }
```

Replies:

```json
{ "type": "subscribed", "ids": ["web1"], "ts": 1791917 }
{ "type": "history", "id": "web1", "metric": "cpu",
  "points": [{ "ts": 1791917178283, "value": { "usagePct": 42.3 } }] }
{ "type": "alerts", "alerts": [{ "id": "web1", "rule": "host-down", "metric": "status", "value": 0, "ts": 1791917 }] }
{ "type": "pong", "ts": 1791917 }
{ "type": "error", "error": "unknown server", "ts": 1791917 }
```

 Minimal JS client:

```js
const SERVERS = { web1: { name: "Web", ip: "192.168.1.10" } }; // static, local
const ws = new WebSocket("ws://localhost:3000");
ws.onopen = () => ws.send(JSON.stringify({ type: "subscribe" }));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.type === "live") render({ ...SERVERS[m.id], ...m });
};
```
