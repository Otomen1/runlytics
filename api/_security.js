// Shared security helpers for Vercel API routes

// Structured JSON logger — output goes to Vercel function logs
export function log(event, extra = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...extra }));
}

// In-memory fallback rate limiter (used when KV is unavailable)
const rateLimitMap = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;

function getClientIp(req) {
  // On Vercel, the real client IP is the LAST entry added by Vercel's edge in
  // x-forwarded-for — not the first, which is client-supplied and spoofable.
  const forwarded = req.headers["x-forwarded-for"] || "";
  const ips = forwarded.split(",").map(s => s.trim()).filter(Boolean);
  return ips[ips.length - 1] || req.socket?.remoteAddress || "unknown";
}

// Persistent rate limiter using Vercel KV (atomic increment).
// Falls back to in-memory limiter if KV is not provisioned.
// PREREQUISITE: Provision a Vercel KV store in the Vercel dashboard and link it
// to the project. The env vars KV_REST_API_URL and KV_REST_API_TOKEN are
// auto-injected by Vercel once linked.
export async function rateLimit(req, res) {
  const ip = getClientIp(req);
  const windowSec = Math.floor(WINDOW_MS / 1000);
  const windowSlot = Math.floor(Date.now() / WINDOW_MS);
  const key = `rl:${ip}:${windowSlot}`;

  // Try Vercel KV first
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { kv } = await import('@vercel/kv');
      const count = await kv.incr(key);
      if (count === 1) await kv.expire(key, windowSec + 5); // +5s grace window
      if (count > MAX_REQUESTS) {
        log('rate_limit_exceeded', { ip, count, store: 'kv' });
        res.setHeader('Retry-After', String(windowSec));
        res.setHeader('X-RateLimit-Limit', String(MAX_REQUESTS));
        res.setHeader('X-RateLimit-Remaining', '0');
        res.status(429).json({ error: "Too many requests, please try again later." });
        return false;
      }
      return true;
    } catch (e) {
      // KV unavailable — fall through to in-memory limiter
      log('rate_limit_kv_error', { ip, error: e.message });
    }
  }

  // In-memory fallback (per-instance; resets on cold start)
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + WINDOW_MS; }
  entry.count++;
  rateLimitMap.set(ip, entry);

  if (entry.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    log('rate_limit_exceeded', { ip, count: entry.count, retryAfter, store: 'memory' });
    res.setHeader('Retry-After', String(retryAfter));
    res.setHeader('X-RateLimit-Limit', String(MAX_REQUESTS));
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
    res.status(429).json({ error: "Too many requests, please try again later." });
    return false;
  }
  return true;
}

export function setCors(req, res, methods = "GET, OPTIONS") {
  const origin = req.headers.origin || "";

  // Build explicit allowlist — no wildcards or regex
  const allowed = new Set([
    process.env.ALLOWED_ORIGIN || "https://runlytics.vercel.app",
  ]);
  if (process.env.EXTRA_ALLOWED_ORIGINS) {
    process.env.EXTRA_ALLOWED_ORIGINS.split(",").forEach(o => allowed.add(o.trim()));
  }
  // Allow localhost only when explicitly running in development
  if (process.env.NODE_ENV === "development") {
    allowed.add("http://localhost:5173");
    allowed.add("http://localhost:4173");
  }

  const isAllowed = allowed.has(origin);
  const responseOrigin = isAllowed ? origin : [...allowed][0];

  res.setHeader("Access-Control-Allow-Origin", responseOrigin);
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}
