'use strict';

// DATA LAYER — app config source (servers.json + .env + alerts.json).
// Only reads env/files. No business logic, no SiSH, no HTTP.

const fs = require('fs');
const os = require('os');
const path = require('path');
require('dotenv').config();

const ROOT = path.resolve(__dirname, '..', '..');
const SERVERS_FILE = process.env.SERVERS_FILE || path.join(ROOT, 'servers.json');
const ALERTS_FILE = process.env.ALERTS_FILE || path.join(ROOT, 'alerts.json');
const DB_DIR = process.env.DB_DIR || path.join(ROOT, 'db');

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveEnvValue(ref, { required = false, label = '' } = {}) {
  if (ref === undefined || ref === null || ref === '') {
    if (required) throw new Error(`Missing required env reference for ${label}`);
    return undefined;
  }
  const v = process.env[ref];
  if (required && (v === undefined || v === '')) {
    throw new Error(`Missing required env var ${ref} (${label}). Check your .env file.`);
  }
  return v;
}

function loadJsonFile(file, { required = false } = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (!required && err.code === 'ENOENT') return null;
    throw new Error(`Failed to load ${file}: ${err.message}`);
  }
}

function loadConfig() {
  const serversDoc = loadJsonFile(SERVERS_FILE, { required: false });
  if (!serversDoc) {
    throw new Error(
      `servers.json not found at ${SERVERS_FILE}. Copy servers.json.example to servers.json and configure hosts.`
    );
  }

  const pollIntervalSec = Number(serversDoc.pollIntervalSec || process.env.POLL_INTERVAL_SEC || 30);
  const sshTimeoutMs = Number(serversDoc.sshTimeoutMs || process.env.SSH_TIMEOUT_MS || 10000);
  const historyMaxPoints = Number(serversDoc.historyMaxPoints || process.env.HISTORY_MAX_POINTS || 1000);
  const historyMaxDays = Number(serversDoc.historyMaxDays || process.env.HISTORY_MAX_DAYS || 7);
  const port = Number(process.env.PORT || 3000);

  const defaultUser = process.env.SSH_DEFAULT_USER;
  const defaultPass = process.env.SSH_DEFAULT_PASS;
  const defaultPort = process.env.SSH_DEFAULT_PORT ? Number(process.env.SSH_DEFAULT_PORT) : 22;

  if (!Array.isArray(serversDoc.servers) || serversDoc.servers.length === 0) {
    throw new Error('servers.json must contain a non-empty "servers" array.');
  }

  const servers = serversDoc.servers.map((s, i) => {
    if (!s.id) throw new Error(`servers[${i}].id is required`);
    if (!s.host) throw new Error(`servers[${i}] (${s.id}): host is required`);
    const auth = s.auth || {};
    if (!['password', 'key'].includes(auth.type)) {
      throw new Error(`server ${s.id}: auth.type must be "password" or "key"`);
    }

    let username;
    if (auth.username) username = auth.username;
    else if (auth.usernameEnv) username = resolveEnvValue(auth.usernameEnv, { required: true, label: `${s.id} username` });
    else if (defaultUser) username = defaultUser;
    if (!username) throw new Error(`server ${s.id}: no username. Set auth.username, ${auth.usernameEnv || 'usernameEnv'}, or SSH_DEFAULT_USER.`);

    let password;
    let privateKeyPath;
    let passphrase;
    if (auth.type === 'password') {
      if (auth.password) password = auth.password;
      else if (auth.passwordEnv) password = resolveEnvValue(auth.passwordEnv, { required: true, label: `${s.id} password` });
      else if (defaultPass) password = defaultPass;
      if (!password) throw new Error(`server ${s.id}: no password. Set auth.password, ${auth.passwordEnv || 'passwordEnv'}, or SSH_DEFAULT_PASS.`);
    } else {
      const rawKeyPath =
        auth.privateKeyPath ||
        process.env[`${s.id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_PRIVATE_KEY_PATH`] ||
        process.env.SSH_DEFAULT_KEY_PATH;
      if (!rawKeyPath && auth.privateKeyPathEnv) {
        const v = resolveEnvValue(auth.privateKeyPathEnv, { required: false });
        if (v) privateKeyPath = expandHome(v);
      }
      privateKeyPath = privateKeyPath || (rawKeyPath ? expandHome(rawKeyPath) : undefined);
      if (!privateKeyPath) throw new Error(`server ${s.id}: key auth requires auth.privateKeyPath`);
      if (auth.passphrase) passphrase = auth.passphrase;
      else if (auth.passphraseEnv) passphrase = resolveEnvValue(auth.passphraseEnv, { required: false }) || undefined;
    }

    return {
      id: s.id,
      host: s.host,
      port: Number(s.port || defaultPort || 22),
      enabled: s.enabled !== false,
      auth: { type: auth.type, username, password, privateKeyPath, passphrase },
    };
  });

  const alertsDoc = loadJsonFile(ALERTS_FILE, { required: false });
  const rules = Array.isArray(alertsDoc?.rules) ? alertsDoc.rules : (Array.isArray(alertsDoc) ? alertsDoc : []);

  return {
    root: ROOT,
    serversFile: SERVERS_FILE,
    alertsFile: ALERTS_FILE,
    dbDir: DB_DIR,
    port,
    pollIntervalSec,
    sshTimeoutMs,
    historyMaxPoints,
    historyMaxDays,
    servers,
    rules,
  };
}

function publicServer(s) {
  return {
    id: s.id,
    host: s.host,
    port: s.port,
    enabled: s.enabled,
    authType: s.auth.type,
    username: s.auth.username,
  };
}

module.exports = { loadConfig, publicServer, expandHome, ROOT };
