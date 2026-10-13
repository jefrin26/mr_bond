'use strict';

// DATA LAYER barrel — single entry point for data-handler.
// Fetch/load/persist only. No thresholds, no HTTP, no orchestration.

const appConfig = require('./appConfig');
const sshClient = require('./sshClient');
const sampleBuilder = require('./linux/sampleBuilder');
const linux = {
  command: require('./linux/command'),
  memParser: require('./linux/memParser'),
  diskParser: require('./linux/diskParser'),
  netParser: require('./linux/netParser'),
  systemParser: require('./linux/systemParser'),
  statParser: require('./linux/statParser'),
  sampleBuilder,
};
const store = require('./store');

module.exports = { appConfig, sshClient, linux, store };
