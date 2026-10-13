'use strict';

// DATA LAYER — single-shot SSH command + section splitter.
// No parsing here; parsing lives in sibling parser modules.

const SEP = '__MON_SEP__';

function buildCommand() {
  return [
    `echo ${SEP}_STAT`,
    'cat /proc/stat | head -5',
    `echo ${SEP}_MEM`,
    'cat /proc/meminfo',
    `echo ${SEP}_DF`,
    'df -B1 -x tmpfs -x devtmpfs -x overlay --output=source,size,used,avail,pcent,target',
    `echo ${SEP}_NET`,
    'cat /proc/net/dev',
    `echo ${SEP}_UPTIME`,
    'uptime',
    `echo ${SEP}_LOAD`,
    'cat /proc/loadavg',
    `echo ${SEP}_END`,
  ].join('; ');
}

function splitSections(output) {
  const names = ['STAT', 'MEM', 'DF', 'NET', 'UPTIME', 'LOAD'];
  const out = {};
  for (let i = 0; i < names.length; i++) {
    const start = `${SEP}_${names[i]}`;
    const end = i + 1 < names.length ? `${SEP}_${names[i + 1]}` : `${SEP}_END`;
    const si = output.indexOf(start);
    const ei = output.indexOf(end);
    if (si === -1 || ei === -1) { out[names[i]] = ''; continue; }
    out[names[i]] = output.slice(si + start.length, ei).trim();
  }
  return out;
}

module.exports = { SEP, buildCommand, splitSections };
