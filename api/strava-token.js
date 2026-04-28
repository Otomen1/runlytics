// api/strava-token.js
// Exchanges Strava auth code for access + refresh tokens.
// Runs server-side on Vercel so client_secret is never exposed.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { code } = req.query;
  if (!code) return res.status(400).json({ error: "Missing code parameter" });

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

    if (data.errors || data.message === "Bad Request") {
      return res.status(400).json({ error: "Invalid code", details: data });
    }

    // Return only what the frontend needs (never expose client_secret)
    res.json({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    data.expires_at,
      athlete: {
        id:        data.athlete?.id,
        firstname: data.athlete?.firstname,
        lastname:  data.athlete?.lastname,
        profile:   data.athlete?.profile_medium,
      },
    });
  } catch (e) {
    res.status(500).json({ error: "Token exchange failed", message: e.message });
  }
}
