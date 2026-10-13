'use strict';

// DATA LAYER — uptime / load parsers (pure, no I/O).

function parseUptime(text) {
  const m = text.match(/load average:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
  const um = text.match(/up\s+(.+?),\s+\d+\s+user/);
  return {
    load1: m ? Number(m[1]) : 0,
    load5: m ? Number(m[2]) : 0,
    load15: m ? Number(m[3]) : 0,
    uptimeHuman: um ? um[1].trim() : '',
  };
}

function parseLoadavg(text) {
  const p = text.trim().split(/\s+/);
  return { load1: Number(p[0]) || 0, load5: Number(p[1]) || 0, load15: Number(p[2]) || 0 };
}

module.exports = { parseUptime, parseLoadavg };
