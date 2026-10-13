'use strict';

// DATA LAYER — df parser (pure, no I/O).

function parseDf(text) {
  const mounts = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('Filesystem')) continue;
    const parts = t.split(/\s+/);
    if (parts.length < 6) continue;
    const [source, size, used, avail, pcent, ...targetParts] = parts;
    mounts.push({
      source,
      sizeBytes: Number(size) || 0,
      usedBytes: Number(used) || 0,
      availBytes: Number(avail) || 0,
      usagePct: Number(String(pcent).replace('%', '')) || 0,
      target: targetParts.join(' '),
    });
  }
  return mounts;
}

module.exports = { parseDf };
