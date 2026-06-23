import React, { useState, useMemo, useCallback } from 'react';
import Map, { Source, Layer, Marker, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { normalizeRoute } from '../../utils/activity.js';
import { fmtKm, fmtPace } from '../../utils/formatters.js';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;
const MAP_STYLE = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`
  : null;

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

const glowLayer = {
  id: 'route-glow',
  type: 'line',
  paint: { 'line-color': ['get', 'color'], 'line-width': 12, 'line-opacity': 0.18, 'line-blur': 4 },
  layout: { 'line-cap': 'round', 'line-join': 'round' },
};
const mainLayer = {
  id: 'route-main',
  type: 'line',
  paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 1 },
  layout: { 'line-cap': 'round', 'line-join': 'round' },
};

const dotStyle = (bg) => ({
  width: 16, height: 16, borderRadius: '50%',
  background: bg, border: '2.5px solid white',
  boxShadow: '0 1px 6px rgba(0,0,0,.5)',
  cursor: 'default',
});

export function RouteMapSVG({ route, act }) {
  const [popup, setPopup] = useState(null);
  const [mapError, setMapError] = useState(null);
  const [mapReady, setMapReady] = useState(false);

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

    // GeoJSON — one feature per segment (pace coloring) or single feature (solid color)
    let geojson;
    if (hasSec && avgMps) {
      geojson = {
        type: 'FeatureCollection',
        features: pts.slice(1).map((p, i) => {
          const distM = cumDistM[i + 1] - cumDistM[i];
          const timeSec = (p.sec ?? -1) - (pts[i].sec ?? -1);
          const mps = timeSec > 0 ? distM / timeSec : avgMps;
          const r = mps / avgMps;
          return {
            type: 'Feature',
            properties: { color: r >= 1.08 ? '#22c55e' : r >= 0.92 ? '#f97316' : '#ef4444' },
            geometry: { type: 'LineString', coordinates: [[pts[i].lon, pts[i].lat], [p.lon, p.lat]] },
          };
        }),
      };
    } else {
      geojson = {
        type: 'Feature',
        properties: { color: col },
        geometry: { type: 'LineString', coordinates: pts.map(p => [p.lon, p.lat]) },
      };
    }

    return {
      bounds: [minLon - 0.001, minLat - 0.001, maxLon + 0.001, maxLat + 0.001],
      geojson, hasSec, col, pts, cumDistM,
      start: { lon: clean[0].lon, lat: clean[0].lat },
      end:   { lon: clean[clean.length - 1].lon, lat: clean[clean.length - 1].lat },
    };
  }, [route, act]);

  const onMouseMove = useCallback(e => {
    if (!geo) return;
    const { lng, lat } = e.lngLat;
    const { pts, cumDistM } = geo;
    let minD = Infinity, best = -1;
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i].lon - lng) ** 2 + (pts[i].lat - lat) ** 2;
      if (d < minD) { minD = d; best = i; }
    }
    if (minD < 9e-6 && best >= 0) {
      setPopup({ lon: pts[best].lon, lat: pts[best].lat, km: (cumDistM[best] / 1000).toFixed(2) });
    } else {
      setPopup(null);
    }
  }, [geo]);

  const onMouseLeave = useCallback(() => setPopup(null), []);

  if (!geo) return (
    <div style={{ height: 180, borderRadius: 12, background: 'var(--s2)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: '.8rem' }}>
      No GPS route
    </div>
  );

  if (!MAP_STYLE) return (
    <div style={{ height: 180, borderRadius: 12, background: 'var(--s2)', border: '1px solid var(--bd)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--tx3)', fontSize: '.78rem', textAlign: 'center', padding: '0 24px' }}>
      <span style={{ fontSize: '1.4rem' }}>🗺️</span>
      Add <strong style={{ color: 'var(--tx2)' }}>VITE_MAPTILER_KEY</strong> to your .env to enable the map
    </div>
  );

  const { bounds, geojson, hasSec, col, start, end } = geo;

  return (
    <div>
      <div style={{ borderRadius: hasSec ? '12px 12px 0 0' : 12, overflow: 'hidden', border: '1px solid #b8b0a4', boxShadow: '0 2px 14px rgba(0,0,0,.2)', position: 'relative' }}>
        {!mapReady && !mapError && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--s2)', color: 'var(--tx3)', fontSize: '.75rem' }}>
            Loading map…
          </div>
        )}
        {mapError && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(0,0,0,.75)', color: '#fff', fontSize: '.72rem', padding: '0 16px', textAlign: 'center' }}>
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
            Map failed to load — {mapError}
          </div>
        )}
        <Map
          initialViewState={{ bounds, fitBoundsOptions: { padding: 28 } }}
          style={{ height: 280 }}
          mapStyle={MAP_STYLE}
          scrollZoom={false}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          onLoad={() => setMapReady(true)}
          onError={(e) => { setMapError(e.error?.message ?? 'unknown error'); console.error('[MapLibre]', e); }}
        >
          <Source id="route" type="geojson" data={geojson}>
            <Layer {...glowLayer} />
            <Layer {...mainLayer} />
          </Source>

          <Marker longitude={start.lon} latitude={start.lat} anchor="center">
            <div style={dotStyle('#22c55e')} />
          </Marker>
          <Marker longitude={end.lon} latitude={end.lat} anchor="center">
            <div style={dotStyle('#ef4444')} />
          </Marker>

          {popup && (
            <Popup longitude={popup.lon} latitude={popup.lat} anchor="bottom" offset={12}
              closeButton={false} closeOnClick={false}
              style={{ fontSize: '.75rem', fontWeight: 700, color: col }}>
              {popup.km} km
            </Popup>
          )}
        </Map>

        {act && (
          <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 10, background: 'rgba(0,0,0,.72)', borderRadius: 9, padding: '3px 12px', fontSize: '.625rem', color: '#fff', fontWeight: 700, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
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
