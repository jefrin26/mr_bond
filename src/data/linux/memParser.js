'use strict';

// DATA LAYER — meminfo parser (pure, no I/O).

function parseMemInfo(text) {
  const m = {};
  for (const line of text.split('\n')) {
    const mm = line.match(/^(\w+):\s+(\d+)\s*kB/);
    if (mm) m[mm[1]] = Number(mm[2]) * 1024;
  }
  const total = m.MemTotal || 0;
  const available = m.MemAvailable !== undefined ? m.MemAvailable : (m.MemFree || 0);
  const used = total - available;
  return {
    totalBytes: total,
    availableBytes: available,
    usedBytes: used < 0 ? 0 : used,
    usagePct: total ? +((used / total) * 100).toFixed(1) : 0,
    swapTotalBytes: m.SwapTotal || 0,
    swapFreeBytes: m.SwapFree || 0,
  };
}

module.exports = { parseMemInfo };
