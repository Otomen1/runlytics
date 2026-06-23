const V = 1;

// lsGetV: read a versioned localStorage key.
// Old-format values (no __v field) pass through unchanged on first read,
// then are rewritten with the versioned wrapper so future reads are fast.
export function lsGetV(key, fallback = null, migrate = null) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw === 'object' && '__v' in raw) return raw.data !== undefined ? raw.data : fallback;
    // Legacy format — run optional migration, then upgrade in place
    const data = migrate ? migrate(raw) : raw;
    try { localStorage.setItem(key, JSON.stringify({ __v: V, data })); } catch {}
    return data ?? fallback;
  } catch { return fallback; }
}

export function lsSetV(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ __v: V, data })); } catch {}
}
