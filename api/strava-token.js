// api/strava-token.js
// Exchanges Strava auth code for access + refresh tokens.
// Runs server-side on Vercel so client_secret is never exposed.

import { rateLimit, setCors, log } from './_security.js';

export default async function handler(req, res) {
  setCors(req, res, "POST, OPTIONS");
  if (!await rateLimit(req, res)) return;
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { code } = req.body || {};
  if (!code || typeof code !== "string" || code.length > 512) {
    return res.status(400).json({ error: "Missing or invalid code parameter" });
  }

  try {
    const response = await fetch("https://www.strava.com/api/v3/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id:     process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type:    "authorization_code",
      }),
    });

    const data = await response.json();

    if (data.errors || data.message === "Bad Request" || !data.access_token) {
      log('strava_token_exchange_failed', { stravaStatus: response.status });
      return res.status(400).json({ error: "Authorization failed. Please try connecting again." });
    }

    // Return only what the frontend needs — never expose client_secret or raw Strava errors
    const firstname = String(data.athlete?.firstname || "").slice(0, 64);
    const lastname  = String(data.athlete?.lastname  || "").slice(0, 64);
    const profile   = typeof data.athlete?.profile_medium === "string" &&
                      data.athlete.profile_medium.startsWith("https://")
                        ? data.athlete.profile_medium : null;
    res.json({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    data.expires_at,
      athlete: { id: data.athlete?.id || null, firstname, lastname, profile },
    });
  } catch (e) {
    log('strava_token_error', { error: e.message });
    res.status(500).json({ error: "Token exchange failed. Please try again." });
  }
}
