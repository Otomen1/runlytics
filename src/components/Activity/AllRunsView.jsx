import React, { useState, useMemo } from 'react';
import { MiniMapThumb } from '../Map/MiniMapThumb.jsx';
import { ACT_ICN, ACT_CLR } from '../../constants/activityTypes.js';
import { fmtKm, fmtDur, fmtPace, fmtDateS } from '../../utils/formatters.js';

export function AllRunsView({acts,onSelectAct,onClose}){
  const[filter,setFilter]=useState("all");const[search,setSearch]=useState("");
  const types=useMemo(()=>["all",...new Set(acts.map(a=>a.type))],[acts]);
  const list=useMemo(()=>{
    let l=[...acts].sort((a,b)=>b.dateTs-a.dateTs);
    if(filter!=="all")l=l.filter(a=>a.type===filter);
    if(search.trim())l=l.filter(a=>a.name.toLowerCase().includes(search.toLowerCase()));
    return l;
  },[acts,filter,search]);
  return(
    <div style={{position:"fixed",inset:0,zIndex:220,background:"var(--bg)",display:"flex",flexDirection:"column"}}>
      <div className="glass" style={{padding:"14px 18px 0",borderBottom:"1px solid var(--bd)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div className="screen-title">All Runs</div>
          <button className="btn b-gh" style={{padding:"6px 12px",fontSize:".8rem"}} onClick={onClose}>✕ Close</button>
        </div>
        <input className="inp" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search runs..." style={{marginBottom:12}}/>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:12}} className="scroll-x">
          {types.map(t=><button key={t} className={"pill "+(filter===t?"on":"")} onClick={()=>setFilter(t)} style={{flexShrink:0,textTransform:"capitalize"}}>{t==="all"?"All ("+acts.length+")":t}</button>)}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"10px 14px",paddingBottom:"max(32px,calc(env(safe-area-inset-bottom)+16px))"}}>
        {list.map(a=>{
          const clr=ACT_CLR[a.type]||"#6b7280";
          return(
            <div key={a.id} className="run-card" onClick={()=>onSelectAct(a)}>
              {/* ── Left: activity info ── */}
              <div style={{flex:1,minWidth:0,paddingRight:11}}>
                {/* name row with type icon */}
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                  <span style={{fontSize:".82rem",flexShrink:0}}>{ACT_ICN[a.type]||"🏃"}</span>
                  <div style={{fontWeight:700,fontSize:".88rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"var(--tx)"}}>{a.name}</div>
                </div>
                {/* hero distance */}
                <div style={{fontSize:"1.32rem",fontWeight:800,color:clr,lineHeight:1,marginBottom:5,letterSpacing:"-.01em"}}>
                  {fmtKm(a.distanceKm)}<span style={{fontSize:".68rem",fontWeight:500,color:"var(--tx3)",marginLeft:3}}>km</span>
                </div>
                {/* stats row */}
                <div style={{display:"flex",flexWrap:"wrap",gap:5,fontSize:".7rem",color:"var(--tx2)",marginBottom:3}}>
                  <span>{fmtDur(a.movingTimeSec)}</span>
                  <span style={{color:"var(--tx3)"}}>·</span>
                  <span>{fmtPace(a.avgPaceSecKm)}/km</span>
                  {a.avgHR&&<><span style={{color:"var(--tx3)"}}>·</span><span>HR {a.avgHR}</span></>}
                </div>
                {/* date */}
                <div style={{fontSize:".66rem",color:"var(--tx3)"}}>{fmtDateS(a.date)}</div>
              </div>
              {/* ── Right: mini route map ── */}
              <MiniMapThumb route={a.route} color={clr}/>
            </div>
          );
        })}
        <div style={{textAlign:"center",fontSize:".7rem",color:"var(--tx3)",padding:"10px 0"}}>{list.length} {list.length===1?"run":"runs"}</div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// SHARE CUSTOM EDITOR — Phase 3
// Drag-and-position, live-preview, multi-layer card builder
// Builds on Phase 1 canvas infrastructure (cDrawVignette, cDrawRadialGlow,
// drawRouteCanvas, EXPORT_CONFIG, canvasToBlob, hexToRgba)
// ═══════════════════════════════════════════════════════════════════════════

// Convert a #rrggbb hex color + 0-1 alpha → "rgba(r,g,b,a)" string.
// Used by EditorPreview and exportCustomCard for the radial-glow layer.
