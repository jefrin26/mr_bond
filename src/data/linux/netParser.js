'use strict';

// DATA LAYER — /proc/net/dev parser (pure, no I/O).

function parseNetDev(text) {
  const ifaces = {};
  let inData = false;
  for (const line of text.split('\n')) {
    if (line.includes('Receive') && line.includes('Transmit')) { inData = true; continue; }
    if (!inData) continue;
    const m = line.trim().match(/^([^:]+):\s*(.+)$/);
    if (!m) continue;
    const nums = m[2].trim().split(/\s+/).map(Number);
    if (nums.length < 16) continue;
    ifaces[m[1].trim()] = { rxBytes: nums[0], txBytes: nums[8] };
  }
  return ifaces;
}

module.exports = { parseNetDev };
