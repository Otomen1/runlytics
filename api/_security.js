// Shared security helpers for Vercel API routes

// In-memory rate limiter (resets per serverless function instance)
const rateLimitMap = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;

export function rateLimit(req, res) {
  // On Vercel, the real client IP is the LAST entry added by Vercel's edge in
  // x-forwarded-for — not the first, which is client-supplied and spoofable.
  const forwarded = req.headers["x-forwarded-for"] || "";
  const ips = forwarded.split(",").map(s => s.trim()).filter(Boolean);
  const ip = ips[ips.length - 1] || req.socket?.remoteAddress || "unknown";

  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + WINDOW_MS };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + WINDOW_MS;
  }

  entry.count++;
  rateLimitMap.set(ip, entry);

  if (entry.count > MAX_REQUESTS) {
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
