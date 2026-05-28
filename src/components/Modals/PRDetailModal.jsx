import React from 'react';
import { fmtKm, fmtPace, fmtDateS, fmtRaceTime } from '../../utils/formatters.js';

export function PRDetailModal({entry,onClose,onOpenRun}){
  if(!entry)return null;
  const{cat,top3}=entry;
  const medals=["🥇","🥈","🥉"];
  return(
    <div className="fade-overlay" style={{position:"fixed",inset:0,zIndex:260,background:"rgba(0,0,0,.8)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="glass sheet" style={{width:"100%",maxWidth:430,borderRadius:"22px 22px 0 0",padding:"20px 18px",paddingBottom:"max(40px,calc(env(safe-area-inset-bottom)+20px))",border:"1px solid var(--bd)",maxHeight:"80vh",overflowY:"auto"}}>
        <div style={{width:36,height:4,borderRadius:2,background:"var(--bd2)",margin:"0 auto 14px"}}/>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <span style={{fontSize:"1.4rem"}}>{cat.icon}</span>
          <div style={{flex:1,fontWeight:700,color:cat.color}}>{cat.label}</div>
          <button className="btn b-gh" style={{padding:"5px 11px",fontSize:".76rem"}} onClick={onClose}>✕</button>
        </div>
        {(!top3||top3.length===0)
          ?<div style={{textAlign:"center",padding:"24px 0",color:"var(--tx2)"}}>No records yet</div>
          :top3.map((r,i)=>(
            <div key={r.id} className="tap"
              style={{borderRadius:12,marginBottom:10,padding:"12px 14px",cursor:"pointer",border:"1px solid "+(i===0?cat.color+"50":"var(--bd)"),background:i===0?cat.color+"08":"var(--s2)"}}
              // FIX #13: onOpenRun receives r.id (string); App resolves to activity by ID
              onClick={()=>{onClose();onOpenRun(r.id);}}>
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
            </div>
          ))
        }
        <div style={{marginTop:6,textAlign:"center",fontSize:".68rem",color:"var(--tx3)"}}>Tap a run to view full details</div>
      </div>
    </div>
  );
}

// ── Debug Panel — tap RUNLYTICS header 5× to open ────────────────────────────
