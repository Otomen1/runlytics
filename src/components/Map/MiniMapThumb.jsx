import React, { useRef, useEffect, useMemo } from 'react';
import { normalizeRoute } from '../../utils/activity.js';

// CARTO dark basemap — free, no API key, open for reasonable use
const TILE = (z, x, y) => `https://basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`;

const W = 84, H = 84;
const TILE_PX = 256;
const GRID = 3; // 3×3 tile grid drawn on canvas
const GRID_PX = GRID * TILE_PX;   // 768
const SCALE = W / GRID_PX;        // 84/768 ≈ 0.109

// Web Mercator: lon/lat → absolute pixel coords at zoom z
const mX = (lon, z) => (lon + 180) / 360 * TILE_PX * (1 << z);
const mY = (lat, z) => {
  const s = Math.sin(lat * Math.PI / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE_PX * (1 << z);
};

// Largest zoom where the route spans ≤55% of the 3×3 grid
function bestZoom(west, east, south, north) {
  const limit = GRID_PX * 0.55;
  for (let z = 17; z >= 1; z--) {
    if (mX(east, z) - mX(west, z) <= limit &&
        mY(south, z) - mY(north, z) <= limit) return z;
  }
  return 1;
}

function sample(pts, max) {
  if (pts.length <= max) return pts;
  const step = (pts.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => pts[Math.round(i * step)]);
}

export const MiniMapThumb = React.memo(function MiniMapThumb({ route, color }) {
  const canvasRef = useRef(null);

  const geo = useMemo(() => {
    if (!route || route.length < 2) return null;
    const pts = normalizeRoute(route);
    if (pts.length < 2) return null;

    let west = pts[0].lon, east = pts[0].lon, south = pts[0].lat, north = pts[0].lat;
    for (const p of pts) {
      if (p.lon < west) west = p.lon; if (p.lon > east) east = p.lon;
      if (p.lat < south) south = p.lat; if (p.lat > north) north = p.lat;
    }

    const z = bestZoom(west, east, south, north);
    const cLon = (west + east) / 2;
    const cLat = (south + north) / 2;

    // Center tile index
    const cTX = Math.floor(mX(cLon, z) / TILE_PX);
    const cTY = Math.floor(mY(cLat, z) / TILE_PX);

    // Mercator pixel at top-left of the 3×3 grid
    const half = (GRID - 1) >> 1; // 1
    const ox = (cTX - half) * TILE_PX;
    const oy = (cTY - half) * TILE_PX;

    // Canvas pixel from lat/lon
    const cx = lon => (mX(lon, z) - ox) * SCALE;
    const cy = lat => (mY(lat, z) - oy) * SCALE;

    const sp = sample(pts, 80);
    return { z, cTX, cTY, ox, oy, half, sp,
      sx: cx(sp[0].lon), sy: cy(sp[0].lat),
      ex: cx(sp[sp.length - 1].lon), ey: cy(sp[sp.length - 1].lat),
      cx, cy };
  }, [route]);

  useEffect(() => {
    if (!geo || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { z, cTX, cTY, ox, oy, half, sp, sx, sy, ex, ey, cx, cy } = geo;
    const c = color || '#f97316';
    let remaining = GRID * GRID;
    let cancelled = false;

    ctx.clearRect(0, 0, W, H);

    const drawRoute = () => {
      // Glow
      ctx.beginPath();
      sp.forEach((p, i) => i === 0 ? ctx.moveTo(cx(p.lon), cy(p.lat)) : ctx.lineTo(cx(p.lon), cy(p.lat)));
      ctx.strokeStyle = c; ctx.lineWidth = 5; ctx.globalAlpha = 0.35;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();

      // Main line
      ctx.beginPath();
      sp.forEach((p, i) => i === 0 ? ctx.moveTo(cx(p.lon), cy(p.lat)) : ctx.lineTo(cx(p.lon), cy(p.lat)));
      ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.globalAlpha = 1; ctx.stroke();

      // Start dot
      ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#22c55e'; ctx.fill();
      ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.stroke();

      // End dot
      ctx.beginPath(); ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444'; ctx.fill();
      ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.stroke();
    };

    const done = () => { if (--remaining <= 0 && !cancelled) drawRoute(); };

    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const tx = cTX + dx, ty = cTY + dy;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (cancelled) return;
          const px = (tx * TILE_PX - ox) * SCALE;
          const py = (ty * TILE_PX - oy) * SCALE;
          ctx.globalAlpha = 1;
          ctx.drawImage(img, px, py, TILE_PX * SCALE, TILE_PX * SCALE);
          done();
        };
        img.onerror = done;
        img.src = TILE(z, tx, ty);
      }
    }

    return () => { cancelled = true; };
  }, [geo, color]);

  const wrap = { width: W, height: H, borderRadius: 'var(--r-lg)', flexShrink: 0, overflow: 'hidden' };

  if (!geo) {
    return (
      <div style={{ ...wrap, background: 'var(--s3)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.06)', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
          {Array.from({ length: 7 }, (_, i) => (
            <g key={i}>
              <line x1={i * 13 + 3} y1={0} x2={i * 13 + 3} y2={H} stroke="rgba(255,255,255,.03)" strokeWidth={1} />
              <line x1={0} y1={i * 13 + 3} x2={W} y2={i * 13 + 3} stroke="rgba(255,255,255,.03)" strokeWidth={1} />
            </g>
          ))}
        </svg>
        <span style={{ fontSize: '.9rem', opacity: .35, position: 'relative' }}>🗺️</span>
        <span style={{ fontSize: '.48rem', fontWeight: 700, letterSpacing: '.08em', color: 'rgba(255,255,255,.2)', position: 'relative' }}>NO GPS</span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={W} height={H}
      style={{ ...wrap, background: '#1a1c2e', display: 'block' }}
    />
  );
});
