import React, { useMemo } from 'react';
import { buildAnalytics } from '../../utils/analytics.js';
import { fmtKm, fmtDur } from '../../utils/formatters.js';

export function MonthlyReport({acts,onClose}){
  const analytics=useMemo(()=>buildAnalytics(acts),[acts]);
  const monthly=analytics.monthlyKm||[];
  return(
    <div style={{position:"fixed",inset:0,zIndex:220,background:"var(--bg)",display:"flex",flexDirection:"column"}}>
      <div className="glass" style={{padding:"14px 18px 12px",borderBottom:"1px solid var(--bd)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div className="screen-title">Monthly Report</div>
        <button className="btn b-gh" style={{padding:"6px 13px",fontSize:".8rem"}} onClick={onClose}>✕ Close</button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"18px 18px 32px"}}>
        {monthly.length===0&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"60vh",color:"var(--tx2)"}}><div style={{fontSize:"2.8rem",marginBottom:14}}>📅</div><div style={{fontWeight:700,fontSize:"var(--fs-base)",marginBottom:6,color:"var(--tx)"}}>Nothing logged yet</div><div style={{fontSize:".8rem"}}>Upload runs to see your monthly summaries.</div></div>}
        {[...monthly].reverse().map(m=>(
          <div key={m.month} className="card" style={{padding:16,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontWeight:700}}>{m.month}</div>
              <span style={{fontSize:".72rem",color:"var(--tx2)"}}>{m.runs} runs</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[{l:"Distance",v:fmtKm(m.km)+" km",c:"var(--or)"},{l:"Time",v:fmtDur(m.timeSec),c:"var(--tx)"},{l:"Avg/run",v:fmtKm(m.km/m.runs)+" km",c:"var(--bl)"}].map(s=>(
                <div key={s.l} className="card2" style={{padding:"10px 8px",textAlign:"center"}}>
                  <div style={{fontSize:"var(--fs-base)",fontWeight:700,color:s.c,lineHeight:1}}>{s.v}</div>
                  <div style={{fontSize:".62rem",color:"var(--tx2)",marginTop:4,letterSpacing:".04em"}}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

