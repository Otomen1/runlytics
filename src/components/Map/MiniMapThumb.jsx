import React, { useMemo, useState } from 'react';
import { normalizeRoute } from '../../utils/activity.js';

const KEY = import.meta.env.VITE_MAPTILER_KEY;

// Downsample to at most N points for the static-map path parameter
function samplePts(pts, max) {
  if (pts.length <= max) return pts;
  const step = (pts.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => pts[Math.round(i * step)]);
}

// MiniMapThumb: when VITE_MAPTILER_KEY is set, shows real MapTiler outdoor tiles
// with an SVG route overlay. Falls back to SVG-only when no key.
// React.memo + lazy img keeps list rendering fast even with 200+ activities.
export const MiniMapThumb = React.memo(function MiniMapThumb({ route, color }) {
  const W = 84, H = 84;
  const [imgFailed, setImgFailed] = useState(false);

  const geo = useMemo(() => {
    if (!route || route.length < 2) return null;
    const pts = normalizeRoute(route);
    if (pts.length < 2) return null;

    // Bounding box
    let west = pts[0].lon, east = pts[0].lon, south = pts[0].lat, north = pts[0].lat;
    for (const p of pts) {
      if (p.lon < west) west = p.lon; if (p.lon > east) east = p.lon;
      if (p.lat < south) south = p.lat; if (p.lat > north) north = p.lat;
    }

    // Pad 25% on each side so the route doesn't touch the edges
    const dLon = east - west || 0.005;
    const dLat = north - south || 0.005;
    west  -= dLon * 0.25; east  += dLon * 0.25;
    south -= dLat * 0.25; north += dLat * 0.25;

    // Make bbox square so there's no stretch (static API preserves aspect ratio)
    const spanLon = east - west;
    const spanLat = north - south;
    if (spanLon > spanLat) {
      const d = (spanLon - spanLat) / 2;
      south -= d; north += d;
    } else {
      const d = (spanLat - spanLon) / 2;
      west -= d; east += d;
    }

    // Static map URL — 2× resolution for retina, bbox-fitted
    const tileUrl = KEY && !imgFailed
      ? `https://api.maptiler.com/maps/outdoor-v2/static/${west.toFixed(5)},${south.toFixed(5)},${east.toFixed(5)},${north.toFixed(5)}/${W * 2}x${H * 2}.png?key=${KEY}`
      : null;

    // SVG projection: linear mapping of the same padded bbox → pixel coords
    const tx = lon => ((lon - west) / (east - west)) * W;
    const ty = lat => ((north - lat) / (north - south)) * H; // flip: higher lat = lower y

    const sp = samplePts(pts, 80);
    const d = sp.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(p.lon).toFixed(1)},${ty(p.lat).toFixed(1)}`).join(' ');

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
    <div style={{ ...wrap, background: geo.tileUrl ? '#dde' : '#090e1a', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)' }}>
      {geo.tileUrl && (
        <img
          src={geo.tileUrl}
          width={W} height={H}
          alt=""
          loading="lazy"
          onError={() => setImgFailed(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
        />
      )}
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
      {/* Route overlay — always on top of tiles */}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
        {/* glow */}
        <path d={geo.d} fill="none" stroke={c} strokeWidth={7} strokeOpacity={geo.tileUrl ? .45 : .16} strokeLinecap="round" strokeLinejoin="round" />
        {/* main line */}
        <path d={geo.d} fill="none" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* start dot */}
        <circle cx={geo.sx} cy={geo.sy} r={4} fill="#22c55e" stroke="white" strokeWidth={1.5} />
        {/* finish dot */}
        <circle cx={geo.ex} cy={geo.ey} r={4} fill="#ef4444" stroke="white" strokeWidth={1.5} />
      </svg>
    </div>
  );
});
