// Shared security helpers for Vercel API routes

// In-memory rate limiter (resets per serverless function instance)
const rateLimitMap = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;

export function rateLimit(req, res) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
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
  const allowed = process.env.ALLOWED_ORIGIN || "https://runlytics.vercel.app";
  const origin = req.headers.origin || "";

  // Allow exact match or any *.vercel.app preview URL for the same project
  const isAllowed =
    origin === allowed ||
    /^https:\/\/runlytics(-[a-z0-9]+)?\.vercel\.app$/.test(origin) ||
    (process.env.NODE_ENV !== "production" && origin.startsWith("http://localhost"));

  res.setHeader("Access-Control-Allow-Origin", isAllowed ? origin : allowed);
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}
