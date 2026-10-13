'use strict';

// DATA LAYER — assembles a normalized sample from parsed sections.
// Combines linux/* parsers. Still no business rules (thresholds live in data-handler).

const { parseMemInfo } = require('./memParser');
const { parseDf } = require('./diskParser');
const { parseNetDev } = require('./netParser');
const { parseUptime, parseLoadavg } = require('./systemParser');
const { cpuFromStatLine } = require('./statParser');

function toSample(sections, { prevCpu = null, prevNet = null, elapsedSec = null } = {}) {
  const ts = Date.now();
  const mem = parseMemInfo(sections.MEM || '');
  const disks = parseDf(sections.DF || '');
  const net = parseNetDev(sections.NET || '');
  const up = parseUptime(sections.UPTIME || '');
  const load = parseLoadavg(sections.LOAD || `${up.load1} ${up.load5} ${up.load15}`);

  let cpuUsagePct = null;
  const cur = (sections.STAT || '').split('\n').find((l) => l.startsWith('cpu '));
  let curCpu = null;
  if (cur) {
    curCpu = cpuFromStatLine(cur);
    if (prevCpu && elapsedSec) {
      const totalD = curCpu.total - prevCpu.total;
      const idleD = curCpu.idle - prevCpu.idle;
      if (totalD > 0) cpuUsagePct = +(((totalD - idleD) / totalD) * 100).toFixed(1);
    }
  }

  let netRates = null;
  if (prevNet && elapsedSec) {
    netRates = {};
    for (const [iface, curV] of Object.entries(net)) {
      const prev = prevNet[iface];
      if (!prev) continue;
      netRates[iface] = {
        rxBytesPerSec: Math.max(0, Math.round((curV.rxBytes - prev.rxBytes) / elapsedSec)),
        txBytesPerSec: Math.max(0, Math.round((curV.txBytes - prev.txBytes) / elapsedSec)),
      };
    }
  }

  const rootDisk = disks.find((d) => d.target === '/') || disks[0] || null;

  return {
    sample: {
      ts,
      status: 'ok',
      cpu: { usagePct: cpuUsagePct, load1: load.load1, load5: load.load5, load15: load.load15 },
      mem: { usagePct: mem.usagePct, usedBytes: mem.usedBytes, totalBytes: mem.totalBytes, availableBytes: mem.availableBytes, swapTotalBytes: mem.swapTotalBytes, swapFreeBytes: mem.swapFreeBytes },
      disk: rootDisk ? { usagePct: rootDisk.usagePct, usedBytes: rootDisk.usedBytes, totalBytes: rootDisk.sizeBytes, target: rootDisk.target, mounts: disks } : { mounts: disks },
      net: { ifaces: net, rates: netRates },
      system: { uptimeHuman: up.uptimeHuman, load1: load.load1, load5: load.load5, load15: load.load15 },
    },
    state: { cpu: curCpu, net, ts },
  };
}

module.exports = { toSample };
