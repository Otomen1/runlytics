import React, { useState, useEffect } from 'react';
import { Ring } from '../common/Ring.jsx';
import { SH } from '../common/SH.jsx';
import { ACT_CLR } from '../../constants/activityTypes.js';
import { fmtKm, fmtPace, fmtDate, todayKey, greet } from '../../utils/formatters.js';
import { getMafHR } from '../../utils/analytics.js';
import { getPhotos } from '../../db/indexedDB.js';

const MOODS_MAP = {
  great:  { emoji: '😀', label: 'Great' },
  good:   { emoji: '🙂', label: 'Good' },
  normal: { emoji: '😐', label: 'Normal' },
  tough:  { emoji: '😫', label: 'Tough' },
  strong: { emoji: '🔥', label: 'Strong' },
};


export function HomeTab({acts,analytics,goals,hrProfile,profile,onSelectAct,onUpload,onViewAll,onViewMonthly,onEditGoals}){
  const lastRun=acts.length?acts.reduce((b,a)=>a.dateTs>b.dateTs?a:b):null;
  const mafHR=getMafHR(hrProfile);
  const today=new Date();today.setHours(0,0,0,0);today.setDate(today.getDate()-((today.getDay()+6)%7));
  const thisWeekKm=acts.filter(a=>new Date(a.dateTs)>=today).reduce((s,a)=>s+a.distanceKm,0);
  const weekPct=Math.min(1,thisWeekKm/(goals.weekly||1));
  const greetPfx=profile.name==="Runner"?"Welcome back":"Welcome back, "+profile.name;
  const weekLeft=parseFloat((goals.weekly-thisWeekKm).toFixed(1));
  const thisMonthKey=new Date().toISOString().slice(0,7);
  const thisMonthKm=acts.filter(a=>a.date&&a.date.startsWith(thisMonthKey)).reduce((s,a)=>s+a.distanceKm,0);
  const monthPct=Math.min(1,thisMonthKm/(goals.monthly||1));
  const monthLeft=parseFloat(Math.max(0,goals.monthly-thisMonthKm).toFixed(1));
  const memories = (acts||[]).filter(a => a.mood || a.notes || a.photoCount > 0).slice(0, 5);
  const [thumbMap, setThumbMap] = useState({});
  useEffect(() => {
    if (!memories.length) return;
    let active = true;
    const urls = {};
    Promise.all(
      memories
        .filter(a => a.photoCount > 0)
        .map(a =>
          getPhotos(a.id).then(photos => {
            if (active && photos[0]) {
              urls[a.id] = URL.createObjectURL(photos[0].thumbBlob);
            }
          }).catch(() => {})
        )
    ).then(() => { if (active) setThumbMap({...urls}); });
    return () => {
      active = false;
      Object.values(urls).forEach(u => URL.revokeObjectURL(u));
    };
  }, [acts]);
  return(<div style={{padding:"10px 0 32px"}}>
    <div className="a0" style={{marginBottom:20}}>
      <div className="sl" style={{marginBottom:4}}>{greet()}</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{fontSize:"1.4rem",fontWeight:700,lineHeight:1.2,letterSpacing:"-.01em"}}>{greetPfx}</div>
        {analytics.streak>=2&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"8px 11px",borderRadius:12,background:"rgba(249,115,22,.1)",border:"1.5px solid rgba(249,115,22,.22)",flexShrink:0,marginLeft:12}}>
            <span style={{fontSize:"1.15rem"}}>🔥</span>
            <span style={{fontSize:"1rem",fontWeight:800,color:"var(--or)",lineHeight:1}}>{analytics.streak}</span>
            <span style={{fontSize:".55rem",color:"var(--or)",fontWeight:700,letterSpacing:".04em"}}>DAYS</span>
          </div>
        )}
      </div>
    </div>
    {lastRun&&(
      <div className="card a2 tap" style={{padding:16,marginBottom:14,cursor:"pointer"}} onClick={()=>onSelectAct(lastRun)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div style={{minWidth:0,flex:1}}>
            <div style={{fontSize:".6rem",fontWeight:700,color:ACT_CLR[lastRun.type]||"var(--or)",marginBottom:3,textTransform:"uppercase",letterSpacing:".06em"}}>{lastRun.type}</div>
            <div style={{fontWeight:600,fontSize:".92rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:2}}>{lastRun.name}</div>
            <div style={{fontSize:".72rem",color:"var(--tx2)"}}>{fmtDate(lastRun.date)}</div>
          </div>
          <span style={{background:(ACT_CLR[lastRun.type]||"var(--or)")+"1a",color:ACT_CLR[lastRun.type]||"var(--or)",padding:"3px 10px",borderRadius:20,fontSize:".66rem",fontWeight:700,flexShrink:0,marginLeft:8}}>{lastRun.runClass}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          {[{v:fmtKm(lastRun.distanceKm),l:"km",c:"var(--or)"},{v:fmtPace(lastRun.avgPaceSecKm)+"/km",l:"pace",c:"var(--tx)"},{v:lastRun.avgHR?lastRun.avgHR+" bpm":"--",l:"HR",c:lastRun.avgHR&&lastRun.avgHR>mafHR?"var(--yw)":"var(--gn)"}].map(s=>(
            <div key={s.l} style={{textAlign:"center",padding:"10px 6px",background:"rgba(0,0,0,.22)",borderRadius:10}}>
              <div style={{fontSize:"1.05rem",fontWeight:700,color:s.c,lineHeight:1}}>{s.v}</div>
              <div style={{fontSize:".62rem",color:"var(--tx3)",marginTop:4,letterSpacing:".04em"}}>{s.l}</div>
            </div>
          ))}
        </div>
        {acts.length>1&&<div style={{marginTop:10,textAlign:"center",fontSize:".72rem"}}><span className="tap" style={{color:"var(--or)",fontWeight:600}} onClick={e=>{e.stopPropagation();onViewAll();}}>View all {acts.length} runs →</span></div>}
      </div>
    )}
    {!lastRun&&(
      <div className="card a2" style={{padding:28,textAlign:"center",marginBottom:14,borderStyle:"dashed"}}>
        <div style={{fontSize:"2.8rem",marginBottom:12}}>🏃</div>
        <div style={{fontWeight:700,fontSize:"var(--fs-base)",marginBottom:6}}>No runs yet</div>
        <div style={{fontSize:".8rem",color:"var(--tx2)",marginBottom:18,lineHeight:1.6}}>Upload a GPX file to get started</div>
        <button className="btn b-or" style={{padding:"11px 24px"}} onClick={onUpload}>Upload GPX</button>
      </div>
    )}
    <div className="card a3" style={{padding:16,marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:14}}>
        <Ring pct={weekPct} size={60} color={weekPct>=1?"var(--gn)":"var(--or)"}>
          <span style={{fontSize:".58rem",fontWeight:700,color:weekPct>=1?"var(--gn)":"var(--or)"}}>{Math.round(weekPct*100)+"%"}</span>
        </Ring>
        <div style={{flex:1,minWidth:0}}>
          <div className="sl" style={{marginBottom:5}}>Weekly Goal</div>
          <div style={{fontSize:"1.15rem",fontWeight:700,lineHeight:1,marginBottom:4}}>
            <span style={{color:"var(--or)"}}>{fmtKm(thisWeekKm)}</span>
            <span style={{fontSize:".76rem",color:"var(--tx2)",fontWeight:400}}> / {goals.weekly} km</span>
          </div>
          {weekPct>=1&&<span style={{background:"var(--gn2)",color:"var(--gn)",padding:"2px 9px",borderRadius:20,fontSize:".66rem",fontWeight:700}}>✓ Goal reached!</span>}
          {weekPct<1&&<div style={{fontSize:".74rem",color:"var(--tx2)"}}>{weekLeft} km to go</div>}
        </div>
        <button className="tap" style={{background:"none",border:"none",color:"var(--tx3)",fontSize:".78rem",padding:"4px 6px"}} onClick={onEditGoals}>Edit</button>
      </div>
      <div style={{borderTop:"1px solid var(--bd)",marginTop:12,paddingTop:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div className="sl">Monthly Goal</div>
          <span style={{fontSize:".72rem",color:"var(--tx2)",fontWeight:500}}>{fmtKm(thisMonthKm)} / {goals.monthly} km</span>
        </div>
        <div className="pb"><div className="pf" style={{width:Math.round(monthPct*100)+"%",background:monthPct>=1?"var(--gn)":"var(--bl)"}}/></div>
        {monthPct>=1?<span style={{background:"var(--gn2)",color:"var(--gn)",padding:"2px 9px",borderRadius:20,fontSize:".66rem",fontWeight:700,marginTop:5,display:"inline-block"}}>✓ Monthly goal reached!</span>
          :<div style={{fontSize:".72rem",color:"var(--tx2)",marginTop:4}}>{monthLeft} km to go</div>}
      </div>
    </div>
    {memories.length > 0 && (
      <div style={{marginBottom:16}}>
        <div style={{fontSize:'.72rem',fontWeight:700,color:'var(--tx2)',letterSpacing:'.06em',textTransform:'uppercase',marginBottom:8}}>📸 Recent Memories</div>
        <div style={{display:'flex',flexDirection:'column',gap:7}}>
          {memories.map(a => {
            const mood = a.mood ? MOODS_MAP[a.mood] : null;
            return (
              <div key={a.id} className="card" onClick={()=>onSelectAct(a)}
                style={{padding:'10px 12px',display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
                {thumbMap[a.id] ? (
                  <img src={thumbMap[a.id]} alt="" style={{width:44,height:44,borderRadius:8,objectFit:'cover',flexShrink:0}}/>
                ) : (
                  <div style={{width:44,height:44,borderRadius:8,background:'var(--bd)',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.2rem'}}>
                    {mood ? mood.emoji : '📓'}
                  </div>
                )}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'.84rem',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {mood && <span style={{marginRight:4}}>{mood.emoji}</span>}{a.name}
                  </div>
                  <div style={{fontSize:'.7rem',color:'var(--tx2)',marginTop:2}}>{fmtDate(a.date)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}
    {acts.length>0&&<button className="btn b-gh" style={{width:"100%",padding:"12px"}} onClick={onViewMonthly}>📅 Monthly Report</button>}
  </div>);
}

