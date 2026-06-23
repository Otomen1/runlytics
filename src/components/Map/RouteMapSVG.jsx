import React, { useState, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { normalizeRoute } from '../../utils/activity.js';
import { fmtKm, fmtPace } from '../../utils/formatters.js';

const MAX_PTS = 600;

function sampleRoute(pts) {
  if (pts.length <= MAX_PTS) return pts;
  return Array.from({ length: MAX_PTS }, (_, i) =>
    pts[Math.min(Math.round(i * (pts.length - 1) / (MAX_PTS - 1)), pts.length - 1)]
  );
}

function haversineM(a, b) {
  const R = 6371000;
  const dLa = (b.lat - a.lat) * Math.PI / 180;
  const dLo = (b.lon - a.lon) * Math.PI / 180;
  const q = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.max(0, q)));
}

// Snaps to nearest sampled point and shows distance from start
function HoverMarker({ latLngs, cumDistM, col }) {
  const [hov, setHov] = useState(null);
  useMapEvents({
    mousemove(e) {
      const { lat, lng } = e.latlng;
      let minD = Infinity, best = -1;
      for (let i = 0; i < latLngs.length; i++) {
        const d = (latLngs[i][0] - lat) ** 2 + (latLngs[i][1] - lng) ** 2;
        if (d < minD) { minD = d; best = i; }
      }
      setHov(minD < 9e-6 && best >= 0
        ? { pos: latLngs[best], km: (cumDistM[best] / 1000).toFixed(2) }
        : null);
    },
    mouseout() { setHov(null); },
  });
  if (!hov) return null;
  return (
    <CircleMarker center={hov.pos} radius={5} fillColor="#fff" color={col} weight={2} fillOpacity={1}>
      <Tooltip permanent direction="top" offset={[0, -8]}>{hov.km} km</Tooltip>
    </CircleMarker>
  );
}

export function RouteMapSVG({ route, act }) {
  const geo = useMemo(() => {
    if (!route || route.length < 2) return null;
    const clean = normalizeRoute(route);
    if (clean.length < 2) return null;

    let minLat = clean[0].lat, maxLat = clean[0].lat;
    let minLon = clean[0].lon, maxLon = clean[0].lon;
    for (const p of clean) {
      if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon; if (p.lon > maxLon) maxLon = p.lon;
    }

    const pts = sampleRoute(clean);
    let cum = 0;
    const cumDistM = pts.map((p, i) => { if (i > 0) cum += haversineM(pts[i - 1], p); return cum; });

    const avgMps = act?.distanceKm > 0 && act?.movingTimeSec > 0
      ? (act.distanceKm * 1000) / act.movingTimeSec : null;
    const col = act?.avgPaceSecKm < 270 ? '#22c55e' : '#f97316';
    const hasSec = clean.filter(p => typeof p.sec === 'number' && p.sec >= 0).length
      >= Math.min(10, Math.ceil(clean.length * 0.5));

    const latLngs = pts.map(p => [p.lat, p.lon]);

    let segments;
    if (hasSec && avgMps) {
      segments = pts.slice(1).map((p, i) => {
        const distM = cumDistM[i + 1] - cumDistM[i];
        const timeSec = (p.sec ?? -1) - (pts[i].sec ?? -1);
        const mps = timeSec > 0 ? distM / timeSec : avgMps;
        const r = mps / avgMps;
        return { positions: [latLngs[i], latLngs[i + 1]], color: r >= 1.08 ? '#22c55e' : r >= 0.92 ? '#f97316' : '#ef4444' };
      });
    } else {
      segments = null; // single-color — use halo + main polylines
    }

    return {
      bounds: [[minLat - 0.0005, minLon - 0.0005], [maxLat + 0.0005, maxLon + 0.0005]],
      segments, hasSec, col, latLngs, cumDistM,
      start: [clean[0].lat, clean[0].lon],
      end:   [clean[clean.length - 1].lat, clean[clean.length - 1].lon],
    };
  }, [route, act]);

  if (!geo) return (
    <div style={{ height: 180, borderRadius: 12, background: 'var(--s2)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: '.8rem' }}>
      No GPS route
    </div>
  );

  const { bounds, segments, hasSec, col, latLngs, cumDistM, start, end } = geo;

  return (
    <div>
      <div style={{ borderRadius: hasSec ? '12px 12px 0 0' : 12, overflow: 'hidden', border: '1px solid #b8b0a4', boxShadow: '0 2px 14px rgba(0,0,0,.2)', position: 'relative' }}>
        <MapContainer bounds={bounds} style={{ height: 280 }} scrollWheelZoom={false}>
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>"
          />
          {segments
            ? segments.map((seg, i) => (
                <Polyline key={i} positions={seg.positions} color={seg.color} weight={3} opacity={1} />
              ))
            : <>
                <Polyline positions={latLngs} color={col} weight={9} opacity={0.22} />
                <Polyline positions={latLngs} color={col} weight={3.5} opacity={1} />
              </>
          }
          <HoverMarker latLngs={latLngs} cumDistM={cumDistM} col={col} />
          <CircleMarker center={start} radius={8} fillColor="#22c55e" color="white" weight={2.5} fillOpacity={1} />
          <CircleMarker center={end}   radius={8} fillColor="#ef4444" color="white" weight={2.5} fillOpacity={1} />
        </MapContainer>
        {act && (
          <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: 'rgba(0,0,0,.72)', borderRadius: 9, padding: '3px 12px', fontSize: '.625rem', color: '#fff', fontWeight: 700, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            {fmtKm(act.distanceKm)} km · {fmtPace(act.avgPaceSecKm)}/km
          </div>
        )}
      </div>
      {hasSec && (
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', padding: '6px 0', fontSize: '.64rem', color: 'var(--tx3)', borderRadius: '0 0 12px 12px', border: '1px solid #b8b0a4', borderTop: 'none', background: 'var(--s2)' }}>
          {[['#22c55e', 'Faster'], ['#f97316', 'Average'], ['#ef4444', 'Slower']].map(([c, l]) => (
            <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: c, fontSize: '.8rem' }}>●</span>{l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
