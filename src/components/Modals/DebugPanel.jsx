import React, { useMemo } from 'react';
import { DATA_KEY } from '../../constants/keys.js';
import { storageSizeKB } from '../../utils/activity.js';

export function DebugPanel({acts,onClose,onRepairRoutes}){
  const storageSize=useMemo(()=>{try{const r=localStorage.getItem(DATA_KEY);return r?storageSizeKB(r):0;}catch{return 0;}},[acts]);
  const withRoutes=acts.filter(a=>a.route&&a.route.length>=2).length;
  const strava=acts.filter(a=>a.source==='strava');
  const stravaNoRoute=strava.filter(a=>!a.route||a.route.length<2).length;
  const ua=navigator.userAgent;
  const isIOS=/iPhone|iPad|iPod/.test(ua);
  const isSafari=/Safari/.test(ua)&&!/Chrome/.test(ua);
  const isAndroid=/Android/.test(ua);
  const row=(label,val,warn)=>(
    <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--bd)',gap:8}}>
      <span style={{fontSize:'.72rem',color:'var(--tx3)',flexShrink:0}}>{label}</span>
      <span style={{fontSize:'.72rem',fontWeight:600,color:warn?'var(--rd)':'var(--or)',textAlign:'right',wordBreak:'break-all'}}>{val}</span>
    </div>
  );
  return(
    <div style={{position:'fixed',inset:0,zIndex:500,background:'rgba(0,0,0,.85)',display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{width:'100%',maxWidth:430,background:'var(--s1)',borderRadius:'18px 18px 0 0',padding:'20px 18px',paddingBottom:'max(32px,calc(env(safe-area-inset-bottom)+16px))',maxHeight:'85vh',overflowY:'auto',border:'1px solid var(--bd)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:'.95rem',color:'var(--or)'}}>🔬 Route Diagnostics</div>
          <button className="btn b-gh" style={{padding:'4px 10px',fontSize:'.72rem'}} onClick={onClose}>Close</button>
        </div>
        {row('Platform',`${isIOS?'iOS ':isAndroid?'Android ':''}${isSafari?'Safari':'Chrome/Other'}`,false)}
        {row('User Agent',ua.slice(0,80),false)}
        {row('Total activities',acts.length,false)}
        {row('Activities WITH route',`${withRoutes} / ${acts.length}`,withRoutes<acts.length)}
        {row('Activities missing route',acts.length-withRoutes,(acts.length-withRoutes)>0)}
        {row('Strava acts missing route',`${stravaNoRoute} / ${strava.length}`,stravaNoRoute>0)}
        {row('Storage used',`${storageSize} KB`,storageSize>3000)}
        <div style={{marginTop:14,marginBottom:8,fontSize:'.62rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.1em',color:'var(--tx3)'}}>Per-activity route status</div>
        {acts.slice(0,15).map(a=>(
          <div key={a.id} style={{display:'flex',gap:8,padding:'4px 0',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
            <span style={{fontSize:'.62rem',color:a.route&&a.route.length>=2?'var(--gn)':'var(--rd)',flexShrink:0,width:14}}>{a.route&&a.route.length>=2?'✓':'✗'}</span>
            <span style={{fontSize:'.62rem',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--tx2)'}}>{a.name}</span>
            <span style={{fontSize:'.62rem',color:'var(--tx3)',flexShrink:0}}>{a.source==='strava'?'S':'G'} {a.route?.length||0}pts</span>
          </div>
        ))}
        {acts.length>15&&<div style={{fontSize:'.6rem',color:'var(--tx3)',marginTop:4}}>+{acts.length-15} more</div>}
        {stravaNoRoute>0&&(
          <button className="btn b-or" style={{width:'100%',padding:'12px',marginTop:16,fontSize:'.84rem'}} onClick={()=>{onRepairRoutes();onClose();}}>
            🔄 Re-sync Strava to restore {stravaNoRoute} missing route{stravaNoRoute!==1?'s':''}
          </button>
        )}
        <div style={{marginTop:12,fontSize:'.62rem',color:'var(--tx3)',lineHeight:1.6,textAlign:'center'}}>
          Open Safari DevTools: iPhone Settings → Safari → Advanced → Web Inspector → connect to Mac Safari.
          All route events log as [GPX:…] and [Runlytics:…].
        </div>
      </div>
    </div>
  );
}

// ── MiniMapThumb ─────────────────────────────────────────────────────────────
// Pure SVG route thumbnail. No tiles, no canvas, no network requests.
// Downsamples stored route to ≤80 pts — trivial CPU even for 200+ card lists.
// React.memo prevents recomputation unless route/color props change.
