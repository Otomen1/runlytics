// Numeric limits and thresholds shared across the app.
// (api/ runs as standalone Vercel functions and cannot import from src/,
//  so its rate-limit constants live in api/_security.js.)

// GPX parsing
export const MAX_GPX_BYTES   = 10 * 1024 * 1024; // reject files larger than 10 MB
export const MAX_GPX_POINTS  = 8000;             // downsample huge tracks to this many points
export const GPX_FALLBACK_SEC = 3600;            // assume 1h when a track has no timestamps

// Strava auth
export const REFRESH_TOKEN_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // clear refresh tokens after 14 days

// Shoes
export const DEFAULT_SHOE_MAX_KM   = 600;  // default replacement distance
export const SHOE_WARN_THRESHOLD   = 0.85; // warn once a shoe reaches 85% of its max
