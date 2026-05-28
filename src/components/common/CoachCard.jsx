import React, { useState } from 'react';
import { IC, IC_BD, IC_BG } from '../../constants/activityTypes.js';

export function CoachCard({insight}){
  const[open,setOpen]=useState(false);if(!insight)return null;
  const col=IC[insight.type]||"var(--tx2)";
  const body=insight.detail||insight.body||null;
  return(
    <div className="card" style={{borderColor:IC_BD[insight.type]||"var(--bd)",background:IC_BG[insight.type]||"rgba(255,255,255,.04)",cursor:body?"pointer":"default"}} onClick={()=>body&&setOpen(o=>!o)}>
      <div style={{padding:"13px 15px",display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:"1.2rem",flexShrink:0}}>{insight.icon||""}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:"var(--fs-base)"}}>{insight.title}</div>
          <div style={{fontSize:"var(--fs-sm)",color:"var(--tx2)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:open?"normal":"nowrap"}}>{body||""}</div>
        </div>
        {body&&<span style={{color:col,fontSize:".7rem",transform:open?"rotate(180deg)":"none",transition:"transform .22s cubic-bezier(.4,0,.2,1)",flexShrink:0}}>▾</span>}
      </div>
    </div>
  );
}
// ── Canvas Typography System ─────────────────────────────────────────────────
// All sizes are ratios of canvas H for resolution-independence.
// Exact ratios match previous magic numbers to preserve visual parity.
