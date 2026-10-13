'use strict';

// DATA LAYER — store barrel.

const jsonFiles = require('./jsonFiles');
const liveFiles = require('./liveFiles');
const historyFiles = require('./historyFiles');
const alertFiles = require('./alertFiles');

module.exports = { jsonFiles, liveFiles, historyFiles, alertFiles };
