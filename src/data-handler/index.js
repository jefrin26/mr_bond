'use strict';

// DATA-HANDLER barrel — the ONLY entry point the presenter may use.
// Presenter must require this file, never ../data.

const serverHandler = require('./serverHandler');
const monitorHandler = require('./monitorHandler');
const alertHandler = require('./alertHandler');

module.exports = { serverHandler, monitorHandler, alertHandler };
