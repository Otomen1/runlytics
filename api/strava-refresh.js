// api/strava-refresh.js
// Refreshes an expired Strava access token using the stored refresh_token.
// Runs server-side so client_secret stays safe.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Vercel does NOT auto-parse JSON bodies — read raw body and parse manually.
  // Also support refresh_token via query param as GET fallback.
  let refresh_token = req.query?.refresh_token || null;

  if (!refresh_token && req.method === "POST") {
    try {
      // req.body may be pre-parsed by Vercel in some configs, or may be a stream
      if (req.body && typeof req.body === "object") {
        refresh_token = req.body.refresh_token;
      } else if (typeof req.body === "string") {
        refresh_token = JSON.parse(req.body).refresh_token;
      } else {
        // Read raw stream
        const raw = await new Promise((resolve, reject) => {
          let body = "";
          req.on("data", chunk => { body += chunk; });
          req.on("end", () => resolve(body));
          req.on("error", reject);
        });
        if (raw) refresh_token = JSON.parse(raw).refresh_token;
      }
    } catch (e) {
      return res.status(400).json({ error: "Invalid request body" });
    }
  }

  if (!refresh_token) {
    return res.status(400).json({ error: "Missing refresh_token" });
  }

  try {
    const response = await fetch("https://www.strava.com/api/v3/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id:     process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        refresh_token,
        grant_type:    "refresh_token",
      }),
    });

    const data = await response.json();

    if (!data.access_token) {
      return res.status(401).json({ error: "Token refresh failed", details: data });
    }

    res.json({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    data.expires_at,
    });
  } catch (e) {
    res.status(500).json({ error: "Refresh failed", message: e.message });
  }
}

