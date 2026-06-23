import React, { useMemo } from 'react';
import { normalizeRoute } from '../../utils/activity.js';

const W = 84, H = 84;

function sample(pts, max) {
  if (pts.length <= max) return pts;
  const step = (pts.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => pts[Math.round(i * step)]);
}

export const MiniMapThumb = React.memo(function MiniMapThumb({ route, color }) {
  const geo = useMemo(() => {
    if (!route || route.length < 2) return null;
    const pts = normalizeRoute(route);
    if (pts.length < 2) return null;

    let west = pts[0].lon, east = pts[0].lon, south = pts[0].lat, north = pts[0].lat;
    for (const p of pts) {
      if (p.lon < west) west = p.lon; if (p.lon > east) east = p.lon;
      if (p.lat < south) south = p.lat; if (p.lat > north) north = p.lat;
    }

    const pad = 10;
    const dLon = east - west || 0.0005;
    const dLat = north - south || 0.0005;
    const sc = Math.min((W - pad * 2) / dLon, (H - pad * 2) / dLat);
    const ox = (W - dLon * sc) / 2;
    const oy = (H - dLat * sc) / 2;
    const tx = lon => ox + (lon - west) * sc;
    const ty = lat => oy + (north - lat) * sc;

    const sp = sample(pts, 80);
    const d = sp.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(p.lon).toFixed(1)},${ty(p.lat).toFixed(1)}`).join(' ');

    return {
      d,
      sx: tx(sp[0].lon),        sy: ty(sp[0].lat),
      ex: tx(sp[sp.length-1].lon), ey: ty(sp[sp.length-1].lat),
    };
  }, [route]);

  const c = color || '#f97316';

  if (!geo) {
    return (
      <div style={{ width: W, height: H, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, opacity: .35 }}>
        <span style={{ fontSize: '.85rem' }}>🗺️</span>
        <span style={{ fontSize: '.44rem', fontWeight: 700, letterSpacing: '.08em', color: 'var(--tx3)' }}>NO GPS</span>
      </div>
    );
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ flexShrink: 0 }}>
      {/* subtle glow */}
      <path d={geo.d} fill="none" stroke={c} strokeWidth={5} strokeOpacity={.2} strokeLinecap="round" strokeLinejoin="round" />
      {/* main route */}
      <path d={geo.d} fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {/* start dot */}
      <circle cx={geo.sx} cy={geo.sy} r={3} fill="#22c55e" stroke="var(--bg)" strokeWidth={1.5} />
      {/* end dot */}
      <circle cx={geo.ex} cy={geo.ey} r={3} fill="#ef4444" stroke="var(--bg)" strokeWidth={1.5} />
    </svg>
  );
});
