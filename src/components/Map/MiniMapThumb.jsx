import React, { useMemo } from 'react';
import { normalizeRoute } from '../../utils/activity.js';

// Pure SVG route thumbnail — no tiles, no canvas, no network requests.
// Downsampled to ≤80 pts via useMemo. React.memo prevents re-renders
// unless route/color props change — safe to use in long activity lists.
export const MiniMapThumb=React.memo(function MiniMapThumb({route,color}){
  const W=84,H=84;
  const geo=useMemo(()=>{
    if(!route||route.length<2)return null;
    const pts=normalizeRoute(route);
    if(pts.length<2)return null;
    let x0=pts[0].lon,x1=pts[0].lon,y0=pts[0].lat,y1=pts[0].lat;
    for(const p of pts){if(p.lon<x0)x0=p.lon;if(p.lon>x1)x1=p.lon;if(p.lat<y0)y0=p.lat;if(p.lat>y1)y1=p.lat;}
    const pad=9,dLon=x1-x0||0.0005,dLat=y1-y0||0.0005;
    // uniform scale — preserve route shape, center in square
    const sc=Math.min((W-pad*2)/dLon,(H-pad*2)/dLat);
    const ox=(W-dLon*sc)/2,oy=(H-dLat*sc)/2;
    const tx=lon=>ox+(lon-x0)*sc;
    const ty=lat=>oy+(y1-lat)*sc; // flip y: higher lat → lower px
    const step=Math.max(1,Math.floor(pts.length/80));
    const sp=pts.filter((_,i)=>i%step===0||i===pts.length-1);
    const d=sp.map((p,i)=>(i===0?'M':'L')+tx(p.lon).toFixed(1)+','+ty(p.lat).toFixed(1)).join(' ');
    return{d,sx:tx(sp[0].lon),sy:ty(sp[0].lat),ex:tx(sp[sp.length-1].lon),ey:ty(sp[sp.length-1].lat)};
  },[route]);

  const c=color||'#f97316';
  // Shared wrapper style
  const wrap={width:W,height:H,borderRadius:'var(--r-lg)',flexShrink:0,overflow:'hidden'};

  if(!geo){
    // Elegant placeholder for activities with no GPS data
    return(
      <div style={{...wrap,background:'var(--s3)',boxShadow:'inset 0 0 0 1px rgba(255,255,255,.06)',
        position:'relative',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4}}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{position:'absolute',inset:0}}>
          {Array.from({length:7},(_,i)=>(
            <g key={i}>
              <line x1={i*13+3} y1={0} x2={i*13+3} y2={H} stroke="rgba(255,255,255,.03)" strokeWidth={1}/>
              <line x1={0} y1={i*13+3} x2={W} y2={i*13+3} stroke="rgba(255,255,255,.03)" strokeWidth={1}/>
            </g>
          ))}
        </svg>
        <span style={{fontSize:'.9rem',opacity:.35,position:'relative'}}>🗺️</span>
        <span style={{fontSize:'.48rem',fontWeight:700,letterSpacing:'.08em',color:'rgba(255,255,255,.2)',position:'relative'}}>NO GPS</span>
      </div>
    );
  }

  return(
    <div style={{...wrap,background:'#090e1a',boxShadow:'inset 0 0 0 1px rgba(255,255,255,.07)'}}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* subtle dot-grid background for map feel */}
        {Array.from({length:6},(_,i)=>(
          <g key={i}>
            <line x1={i*14+5} y1={0} x2={i*14+5} y2={H} stroke="rgba(255,255,255,.04)" strokeWidth={1}/>
            <line x1={0} y1={i*14+5} x2={W} y2={i*14+5} stroke="rgba(255,255,255,.04)" strokeWidth={1}/>
          </g>
        ))}
        {/* soft glow halo beneath the route */}
        <path d={geo.d} fill="none" stroke={c} strokeWidth={6} strokeOpacity={.16} strokeLinecap="round" strokeLinejoin="round"/>
        {/* main route polyline */}
        <path d={geo.d} fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"/>
        {/* start dot — green */}
        <circle cx={geo.sx} cy={geo.sy} r={3.8} fill="#22c55e" stroke="#090e1a" strokeWidth={1.5}/>
        {/* finish dot — red */}
        <circle cx={geo.ex} cy={geo.ey} r={3.8} fill="#ef4444" stroke="#090e1a" strokeWidth={1.5}/>
      </svg>
    </div>
  );
});

// FIX #12: Renamed prop onSelect → onSelectAct to match how App calls this component
