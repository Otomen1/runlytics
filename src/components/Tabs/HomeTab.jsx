import React from 'react';
import { Ring } from '../common/Ring.jsx';
import { SH } from '../common/SH.jsx';
import { CoachCard } from '../common/CoachCard.jsx';
import { ACT_ICN, ACT_CLR, IC, IC_BG, IC_BD } from '../../constants/activityTypes.js';
import { fmtKm, fmtDur, fmtPace, fmtDate, todayKey, greet } from '../../utils/formatters.js';
import { getMafHR, getMafCoachingInsight, getTodayRecommendation } from '../../utils/analytics.js';
import { GOALS_KEY } from '../../constants/keys.js';

function loadGoals(){try{return JSON.parse(localStorage.getItem(GOALS_KEY)||'null')||{weekly:40,monthly:160};}catch(e){return{weekly:40,monthly:160};}}

export function HomeTab({acts,analytics,goals,hrProfile,profile,tasks,onSelectAct,onUpload,onViewAll,onViewMonthly,onEditGoals}){
  const lastRun=acts.length?acts.reduce((b,a)=>a.dateTs>b.dateTs?a:b):null;
  const mafHR=getMafHR(hrProfile);const insight=getMafCoachingInsight(acts,hrProfile);const rec=getTodayRecommendation(acts,hrProfile);
  const today=new Date();today.setHours(0,0,0,0);today.setDate(today.getDate()-((today.getDay()+6)%7));
  const thisWeekKm=acts.filter(a=>new Date(a.dateTs)>=today).reduce((s,a)=>s+a.distanceKm,0);
  const weekPct=Math.min(1,thisWeekKm/(goals.weekly||1));
  const todayStr=todayKey();
  const todayTasks=tasks.filter(t=>t.enabled).slice(0,3);
  const todayDone=todayTasks.filter(t=>!!(t.completions&&t.completions[todayStr])).length;
  const greetPfx=profile.name==="Runner"?"Welcome back":"Welcome back, "+profile.name;
  const weekLeft=parseFloat((goals.weekly-thisWeekKm).toFixed(1));
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
    <div className="a1" style={{marginBottom:14}}>
      <div className="sl" style={{marginBottom:7}}>Today's Recommendation</div>
      <div style={{background:IC_BG[rec.type]||"rgba(255,255,255,.04)",border:"1px solid "+(IC_BD[rec.type]||"rgba(255,255,255,.1)"),borderRadius:"var(--r-lg)",padding:"13px 15px",display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:"1.35rem",flexShrink:0}}>{rec.icon}</span>
        <div><div style={{fontWeight:700,fontSize:".88rem",marginBottom:2}}>{rec.title}</div><div style={{fontSize:".77rem",color:"var(--tx2)",lineHeight:1.5}}>{rec.sub}</div></div>
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
    <div className="a3" style={{marginBottom:14}}>
      <div className="sl" style={{marginBottom:7}}>Coach Insight</div>
      <CoachCard insight={insight}/>
    </div>
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
    </div>
    {todayTasks.length>0&&(
      <div className="card a3" style={{padding:16,marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div className="sl">Today's Habits</div>
          <span style={{fontSize:".72rem",color:"var(--tx2)",fontWeight:600}}>{todayDone}/{todayTasks.length}</span>
        </div>
        {todayTasks.map(t=>{const done=!!(t.completions&&t.completions[todayStr]);return(
          <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:9}}>
            <div style={{width:20,height:20,borderRadius:6,flexShrink:0,border:"2px solid "+(done?"var(--gn)":"var(--bd2)"),background:done?"var(--gn)":"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
              {done&&<span style={{fontSize:".6rem",color:"#fff",fontWeight:700}}>✓</span>}
            </div>
            <span style={{fontSize:".84rem",flex:1,color:done?"var(--tx3)":"var(--tx)",textDecoration:done?"line-through":"none"}}>{t.title}</span>
          </div>
        );})}
        <div className="pb" style={{marginTop:8}}><div className="pf" style={{width:Math.round(todayDone/(todayTasks.length||1)*100)+"%",background:"var(--gn)"}}/></div>
      </div>
    )}
    {acts.length>0&&<button className="btn b-gh" style={{width:"100%",padding:"12px"}} onClick={onViewMonthly}>📅 Monthly Report</button>}
  </div>);
}

