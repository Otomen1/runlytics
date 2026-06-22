// api/health.js — lightweight deployment health check
export default function handler(req, res) {
  res.status(200).json({ status: 'ok', ts: Date.now() });
}
