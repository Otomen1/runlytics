// api/health.js — lightweight deployment health check
import { setCors } from './_security.js';

export default function handler(req, res) {
  setCors(req, res, "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  res.status(200).json({ status: 'ok', ts: Date.now() });
}
