'use strict';

// PRESENTER/WS — per-socket subscription state. Pure, no I/O.
// null = subscribed to all (default). Set = filtered ids.

const store = new WeakMap(); // ws -> Set<string> | null

function getIds(ws) {
  if (!store.has(ws)) return null;
  return store.get(ws);
}

function setIds(ws, ids) {
  if (ids == null) {
    store.set(ws, null);
    return null;
  }
  const set = new Set(ids.map(String));
  store.set(ws, set);
  return set;
}

function clear(ws) {
  store.delete(ws);
}

function matches(ws, id) {
  const set = getIds(ws);
  if (set == null) return true;
  return set.has(String(id));
}

module.exports = { getIds, setIds, clear, matches };
