'use strict';

// PRESENTER barrel — what bootstrap uses to expose things.

const { createWsApi } = require('./ws/wsServer');

module.exports = { createWsApi };
