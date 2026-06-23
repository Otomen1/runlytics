import React, { useMemo, useState } from 'react';
import { normalizeRoute } from '../../utils/activity.js';

const KEY = import.meta.env.VITE_MAPTILER_KEY;
const W = 84, H = 84;   // display size
const PX = W * 2;        // retina tile request size (168)

// Web Mercator helpers
const mercX = (lon, z) => (lon + 180) / 360 * 256 * Math.pow(2, z);
const mercY = (lat, z) => {
  const s = Math.sin(lat * Math.PI / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * Math.pow(2, z);
};

// Largest zoom where the route fits inside PX×PX pixels
function fitZoom(west, east, south, north) {
  for (let z = 17; z >= 1; z--) {
    const x0 = mercX(west, z), x1 = mercX(east, z);
    const y0 = mercY(north, z), y1 = mercY(south, z);
    if (x1 - x0 <= PX * 0.65 && y1 - y0 <= PX * 0.65) return z;
  }
  return 1;
}

function samplePts(pts, max) {
  if (pts.length <= max) return pts;
  const step = (pts.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => pts[Math.round(i * step)]);
}

export const MiniMapThumb = React.memo(function MiniMapThumb({ route, color }) {
  const [imgFailed, setImgFailed] = useState(false);

  const geo = useMemo(() => {
    if (!route || route.length < 2) return null;
    const pts = normalizeRoute(route);
    if (pts.length < 2) return null;

    let west = pts[0].lon, east = pts[0].lon, south = pts[0].lat, north = pts[0].lat;
    for (const p of pts) {
      if (p.lon < west) west = p.lon; if (p.lon > east) east = p.lon;
      if (p.lat < south) south = p.lat; if (p.lat > north) north = p.lat;
    }

    const cLon = (west + east) / 2;
    const cLat = (south + north) / 2;
    const zoom = fitZoom(west, east, south, north);

    // Pixel coords within the PX×PX image (center = PX/2, PX/2)
    const cMX = mercX(cLon, zoom);
    const cMY = mercY(cLat, zoom);
    // Map image pixel → SVG display pixel (÷2 because image is @2x)
    const tx = lon => (mercX(lon, zoom) - cMX) / 2 + W / 2;
    const ty = lat => (mercY(lat, zoom) - cMY) / 2 + H / 2;

    const sp = samplePts(pts, 80);
    const d = sp.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(p.lon).toFixed(1)},${ty(p.lat).toFixed(1)}`).join(' ');

    const tileUrl = KEY && !imgFailed
      ? `https://api.maptiler.com/maps/outdoor-v2/static/${cLon.toFixed(6)},${cLat.toFixed(6)},${zoom}/${PX}x${PX}.png?key=${KEY}`
      : null;

    return {
      d, tileUrl,
      sx: tx(sp[0].lon), sy: ty(sp[0].lat),
      ex: tx(sp[sp.length - 1].lon), ey: ty(sp[sp.length - 1].lat),
    };
  }, [route, imgFailed]);

  const c = color || '#f97316';
  const wrap = { width: W, height: H, borderRadius: 'var(--r-lg)', flexShrink: 0, overflow: 'hidden', position: 'relative' };

  if (!geo) {
    return (
      <div style={{ ...wrap, background: 'var(--s3)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
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
    <div style={{ ...wrap, background: geo.tileUrl ? '#c8d8c0' : '#090e1a', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)' }}>
      {/* Real map tiles — only when key is valid */}
      {geo.tileUrl && (
        <img
          src={geo.tileUrl}
          width={W} height={H}
          alt=""
          loading="lazy"
          onError={() => setImgFailed(true)}
          onLoad={e => {
            // MapTiler returns a small placeholder PNG for bad keys/params
            const img = e.currentTarget;
            if (img.naturalWidth < PX - 10 || img.naturalHeight < PX - 10) setImgFailed(true);
          }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
        />
      )}
      {/* SVG-only grid background when no tiles */}
      {!geo.tileUrl && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <g key={i}>
              <line x1={i * 14 + 5} y1={0} x2={i * 14 + 5} y2={H} stroke="rgba(255,255,255,.04)" strokeWidth={1} />
              <line x1={0} y1={i * 14 + 5} x2={W} y2={i * 14 + 5} stroke="rgba(255,255,255,.04)" strokeWidth={1} />
            </g>
          ))}
        </svg>
      )}
      {/* Route overlay — Mercator-projected to align with tile pixels */}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
        <path d={geo.d} fill="none" stroke={c} strokeWidth={7} strokeOpacity={geo.tileUrl ? .4 : .16} strokeLinecap="round" strokeLinejoin="round" />
        <path d={geo.d} fill="none" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={geo.sx} cy={geo.sy} r={4} fill="#22c55e" stroke="white" strokeWidth={1.5} />
        <circle cx={geo.ex} cy={geo.ey} r={4} fill="#ef4444" stroke="white" strokeWidth={1.5} />
      </svg>
    </div>
  );
});
