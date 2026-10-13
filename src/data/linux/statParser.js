'use strict';

// DATA LAYER — /proc/stat cpu parser (pure, no I/O).

function cpuFromStatLine(line) {
  const p = line.trim().split(/\s+/).slice(1).map(Number);
  const idle = (p[3] || 0) + (p[4] || 0);
  const total = p.reduce((a, b) => a + (b || 0), 0);
  return { idle, total };
}

module.exports = { cpuFromStatLine };
