import React, { useRef } from 'react';
import { fmtKm, fmtPace, fmtDateS, fmtRaceTime } from '../../utils/formatters.js';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';

export function PRDetailModal({entry,onClose,onOpenRun}){
  const containerRef = useRef(null);
  useFocusTrap(containerRef, !!entry);
  if(!entry)return null;
  const{cat,top3,history}=entry;
  const medals=["🥇","🥈","🥉"];
  return(
    <div className="fade-overlay" style={{position:"fixed",inset:0,zIndex:260,background:"rgba(0,0,0,.8)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div ref={containerRef} className="glass sheet" style={{width:"100%",maxWidth:430,borderRadius:"22px 22px 0 0",padding:"20px 18px",paddingBottom:"max(40px,calc(env(safe-area-inset-bottom)+20px))",border:"1px solid var(--bd)",maxHeight:"80vh",overflowY:"auto"}}>
        <div style={{width:36,height:4,borderRadius:2,background:"var(--bd2)",margin:"0 auto 14px"}}/>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <span style={{fontSize:"1.4rem"}}>{cat.icon}</span>
          <div style={{flex:1,fontWeight:700,color:cat.color}}>{cat.label}</div>
          <button className="btn b-gh" style={{padding:"5px 11px",fontSize:".76rem"}} onClick={onClose}>✕</button>
        </div>
        {(!top3||top3.length===0)
          ?<div style={{textAlign:"center",padding:"24px 0",color:"var(--tx2)"}}>No records yet</div>
          :top3.map((r,i)=>(
            <button key={r.id} className="tap"
              style={{display:'block',width:'100%',textAlign:'left',background:i===0?cat.color+"08":"var(--s2)",borderRadius:12,marginBottom:10,padding:"12px 14px",cursor:"pointer",border:"1px solid "+(i===0?cat.color+"50":"var(--bd)")}}
              onClick={()=>{onClose();onOpenRun(r.id);}} aria-label={`View ${r.name}`}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:"1.3rem"}}>{medals[i]||"🏅"}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:".84rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                  <div style={{fontSize:".68rem",color:"var(--tx2)",marginTop:2}}>{fmtDateS(r.date)} · {fmtKm(r.distanceKm)} km</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontWeight:800,color:i===0?cat.color:"var(--tx)",fontFamily:"monospace"}}>{fmtRaceTime(r.movingTimeSec)}</div>
                  <div style={{fontSize:".7rem",color:"var(--tx2)"}}>{fmtPace(r.paceSecKm)}/km</div>
                </div>
                <span style={{color:"var(--tx3)",fontSize:".9rem",marginLeft:4}}>›</span>
              </div>
            </button>
          ))
        }
        <PaceTrend history={history} color={cat.color}/>
        <div style={{marginTop:10,textAlign:"center",fontSize:".68rem",color:"var(--tx3)"}}>Tap a run to view full details</div>
      </div>
    </div>
  );
}

function PaceTrend({ history, color }) {
  if (!history || history.length < 2) return null;
  const W = 300, H = 52;
  const paces = history.map(h => h.paceSecKm);
  const minP = Math.min(...paces), maxP = Math.max(...paces);
  const range = maxP - minP || 1;
  const pts = history.map((h, i) => {
    const x = (i / (history.length - 1)) * W;
    const y = 4 + ((h.paceSecKm - minP) / range) * (H - 8);
    return `${x},${y}`;
  }).join(' ');
  return (
    <div style={{marginTop:16,padding:"12px 14px",borderRadius:10,background:"var(--s2)"}}>
      <div style={{fontSize:".62rem",fontWeight:700,color:"var(--tx3)",letterSpacing:".08em",marginBottom:8}}>PACE TREND</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:'visible',display:'block'}}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.7}/>
        {history.map((h, i) => {
          const x = (i / (history.length - 1)) * W;
          const y = 4 + ((h.paceSecKm - minP) / range) * (H - 8);
          return <circle key={i} cx={x} cy={y} r={3} fill={color} opacity={0.9}/>;
        })}
      </svg>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:".6rem",color:"var(--tx3)",marginTop:4}}>
        <span>{history[0]?.date?.slice(0,7)}</span>
        <span style={{color}}>↓ faster is better</span>
        <span>{history[history.length-1]?.date?.slice(0,7)}</span>
      </div>
    </div>
  );
}

// ── Debug Panel — tap RUNLYTICS header 5× to open ────────────────────────────
