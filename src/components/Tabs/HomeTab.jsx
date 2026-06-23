import React, { useState, useEffect, useMemo } from 'react';
import { Ring } from '../common/Ring.jsx';
import { ACT_CLR } from '../../constants/activityTypes.js';
import { fmtKm, fmtPace, fmtDate, todayKey, greet, weekOf } from '../../utils/formatters.js';
import { getMafHR, computeAtlCtl, computeRacePRs, estimateVO2max, computeTierProgress } from '../../utils/analytics.js';
import { getPhotos } from '../../db/indexedDB.js';
import { getPlanWeek, getPlanAdherence, getPlanWeekNumber, getTodayWorkout } from '../../utils/trainingPlan.js';

const CONDITIONS = [
  { minForm:  8, label: "Energetic",  emoji: "⚡", color: "#f97316", desc: "Peak form — great day for a hard effort or race pace." },
  { minForm:  3, label: "Fresh",      emoji: "✨", color: "#22c55e", desc: "You're in good shape. Solid training day ahead." },
  { minForm: -3, label: "Balanced",   emoji: "😊", color: "#3b82f6", desc: "Normal training day. Stick to your plan." },
  { minForm: -8, label: "Tired",      emoji: "😓", color: "#eab308", desc: "Your body is working hard. Keep it easy today." },
  { minForm: -Infinity, label: "Fatigued", emoji: "😴", color: "#ef4444", desc: "Rest day recommended. Recovery is training too." },
];

const MOODS_MAP = {
  great:  { emoji: '😀', label: 'Great' },
  good:   { emoji: '🙂', label: 'Good' },
  normal: { emoji: '😐', label: 'Normal' },
  tough:  { emoji: '😫', label: 'Tough' },
  strong: { emoji: '🔥', label: 'Strong' },
};


export function HomeTab({acts,analytics,goals,hrProfile,profile,plan,onSelectAct,onUpload,onLogRun,onViewAll,onViewMonthly,onEditGoals,onOpenPlan,onOpenSettings}){
  const lastRun=acts.length?acts.reduce((b,a)=>a.dateTs>b.dateTs?a:b):null;
  const mafHR=getMafHR(hrProfile);
  const racePRs=useMemo(()=>computeRacePRs(acts),[acts]);
  const vo2maxEst=useMemo(()=>estimateVO2max(racePRs),[racePRs]);
  const condition=useMemo(()=>{
    if(!acts.length||!acts.some(a=>a.trainingLoad>0))return null;
    const data=computeAtlCtl(acts,30);
    if(!data.length)return null;
    const{form}=data[data.length-1];
    return{...(CONDITIONS.find(c=>form>=c.minForm)||CONDITIONS[CONDITIONS.length-1]),form};
  },[acts]);
  const todayWeek=weekOf(Date.now());
  const thisWeekKm=useMemo(()=>acts.filter(a=>weekOf(a.dateTs)===todayWeek).reduce((s,a)=>s+a.distanceKm,0),[acts,todayWeek]);
  const weekPct=Math.min(1,thisWeekKm/(goals.weekly||1));
  const greetPfx=profile.name==="Runner"?"Welcome back":"Welcome back, "+profile.name;
  const weekLeft=parseFloat((goals.weekly-thisWeekKm).toFixed(1));
  // Use local month key so users in UTC+ timezones see the correct month
  const _now=new Date();
  const thisMonthKey=_now.getFullYear()+'-'+String(_now.getMonth()+1).padStart(2,'0');
  const thisMonthKm=useMemo(()=>acts.filter(a=>a.date&&a.date.startsWith(thisMonthKey)).reduce((s,a)=>s+a.distanceKm,0),[acts,thisMonthKey]);
  const monthPct=Math.min(1,thisMonthKm/(goals.monthly||1));
  const monthLeft=parseFloat(Math.max(0,goals.monthly-thisMonthKm).toFixed(1));
  const thisWeekRuns=useMemo(()=>acts.filter(a=>weekOf(a.dateTs)===todayWeek).length,[acts,todayWeek]);
  const _lastMonth=new Date(_now.getFullYear(),_now.getMonth()-1,1);
  const lastMonthKey=_lastMonth.getFullYear()+'-'+String(_lastMonth.getMonth()+1).padStart(2,'0');
  const avgPaceArr=arr=>arr.length?arr.reduce((s,a)=>s+a.avgPaceSecKm,0)/arr.length:null;
  const thisPaceAvg=useMemo(()=>avgPaceArr(acts.filter(a=>a.date?.startsWith(thisMonthKey)&&a.avgPaceSecKm>0)),[acts,thisMonthKey]);
  const lastPaceAvg=useMemo(()=>avgPaceArr(acts.filter(a=>a.date?.startsWith(lastMonthKey)&&a.avgPaceSecKm>0)),[acts,lastMonthKey]);
  const paceTrendPct=thisPaceAvg&&lastPaceAvg?Math.round((lastPaceAvg-thisPaceAvg)/lastPaceAvg*100):null;
  const tierProgress=useMemo(()=>computeTierProgress(acts),[acts]);
  const nextMilestone=useMemo(()=>{
    const w=tierProgress.filter(t=>t.next);
    return w.length?w.sort((a,b)=>b.pct-a.pct)[0]:null;
  },[tierProgress]);
  const memories = useMemo(() => (acts||[]).filter(a => a.mood || a.notes || a.photoCount > 0).slice(0, 5), [acts]);

  const planWeek = plan ? getPlanWeek(plan, todayWeek) : null;
  const planWeekNum = plan ? getPlanWeekNumber(plan, todayWeek) : null;
  const planAdherence = useMemo(()=>plan?getPlanAdherence(plan, analytics.weeklyKm||[]):null,[plan, analytics.weeklyKm]);
  const planPct = planWeek ? Math.min(1, thisWeekKm / planWeek.targetKm) : null;
  const todayWorkout = useMemo(() => {
    if (!planWeek) return null;
    const weekActs = acts.filter(a => weekOf(a.dateTs) === todayWeek);
    return getTodayWorkout(planWeek, weekActs, thisPaceAvg, mafHR, condition?.form ?? 0, null, plan);
  }, [planWeek, acts, todayWeek, thisPaceAvg, mafHR, condition]);
  const [thumbMap, setThumbMap] = useState({});
  useEffect(() => {
    if (!memories.length) return;
    let active = true;
    const urls = {};
    // Cap concurrent photo loads to 5 to avoid saturating memory on large libraries
    const withPhotos = memories.filter(a => a.photoCount > 0).slice(0, 5);
    Promise.all(
      withPhotos.map(a =>
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
  }, [memories]);
  return(<div style={{padding:"10px 0 32px"}}>
    <h1 className="sr-only">Home</h1>
    <div className="a0" style={{marginBottom:20}}>
      <div className="sl" style={{marginBottom:4}}>{greet()}</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{fontSize:"1.4rem",fontWeight:700,lineHeight:1.2,letterSpacing:"-.01em"}}>{greetPfx}</div>
        {analytics.streak>=2&&(
          <div aria-label={analytics.streak+" day streak"} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"8px 11px",borderRadius:12,background:"rgba(249,115,22,.1)",border:"1.5px solid rgba(249,115,22,.22)",flexShrink:0,marginLeft:12}}>
            <span style={{fontSize:"1.15rem"}}>🔥</span>
            <span style={{fontSize:"1rem",fontWeight:800,color:"var(--or)",lineHeight:1}}>{analytics.streak}</span>
            <span style={{fontSize:".55rem",color:"var(--or)",fontWeight:700,letterSpacing:".04em"}}>DAYS</span>
          </div>
        )}
      </div>
    </div>
    {condition&&(
      <div className="card a1" style={{padding:"14px 16px",marginBottom:14,border:`1.5px solid ${condition.color}33`,background:`${condition.color}0d`}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:46,height:46,borderRadius:13,background:`${condition.color}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.5rem",flexShrink:0}}>{condition.emoji}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:".6rem",fontWeight:700,color:condition.color,letterSpacing:".1em",textTransform:"uppercase",marginBottom:3}}>Today's Condition</div>
            <div style={{fontWeight:800,fontSize:"1rem",color:"var(--tx)",marginBottom:2}}>{condition.label}</div>
            <div style={{fontSize:".76rem",color:"var(--tx2)",lineHeight:1.5}}>{condition.desc}</div>
          </div>
          <div style={{display:"flex",gap:14,flexShrink:0}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:"1rem",fontWeight:800,color:condition.color,lineHeight:1}}>{condition.form>0?"+":""}{condition.form}</div>
              <div style={{fontSize:".52rem",color:"var(--tx3)",letterSpacing:".05em",marginTop:2}}>FORM</div>
            </div>
            {vo2maxEst&&(
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:"1rem",fontWeight:800,color:vo2maxEst.color,lineHeight:1}}>{vo2maxEst.vo2max}</div>
                <div style={{fontSize:".52rem",color:"var(--tx3)",letterSpacing:".05em",marginTop:2}}>VO₂MAX</div>
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    {!condition&&vo2maxEst&&(
      <div className="card a1" style={{padding:"10px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:".6rem",fontWeight:700,color:"var(--tx3)",letterSpacing:".08em",textTransform:"uppercase",flex:1}}>VO₂max</span>
        <span style={{fontSize:"1.1rem",fontWeight:800,color:vo2maxEst.color}}>{vo2maxEst.vo2max}</span>
        <span style={{fontSize:".6rem",color:"var(--tx3)"}}>ml/kg/min</span>
        <span style={{fontSize:".68rem",fontWeight:700,color:vo2maxEst.color,padding:"2px 9px",borderRadius:20,background:vo2maxEst.color+"22"}}>{vo2maxEst.label}</span>
      </div>
    )}
    {planWeek&&(
      <div className="card a2" role="button" tabIndex={0} style={{padding:16,marginBottom:14,border:'1.5px solid rgba(249,115,22,.22)',background:'rgba(249,115,22,.04)',cursor:'pointer'}} onClick={onOpenPlan} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onOpenPlan();}}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div>
            <div style={{fontSize:'.6rem',fontWeight:700,color:'var(--or)',letterSpacing:'.1em',textTransform:'uppercase',marginBottom:3}}>Training Plan</div>
            <div style={{fontWeight:700,fontSize:'.88rem',color:'var(--tx)'}}>
              {plan.raceType==='HM'?'Half Marathon':plan.raceType} · {new Date(plan.raceDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}
            </div>
          </div>
          <div style={{textAlign:'center',padding:'6px 11px',borderRadius:10,background:'rgba(249,115,22,.12)',border:'1px solid rgba(249,115,22,.22)'}}>
            <div style={{fontSize:'1.1rem',fontWeight:800,color:'var(--or)',lineHeight:1}}>W{planWeekNum}</div>
            <div style={{fontSize:'.5rem',color:'var(--or)',letterSpacing:'.06em'}}>of {plan.weeks.length}</div>
          </div>
        </div>
        <div style={{marginBottom:8}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
            <span style={{fontSize:'.72rem',color:'var(--tx2)'}}>This week</span>
            <span style={{fontSize:'.72rem',fontWeight:600,color:planPct>=0.8?'var(--gn)':planPct>=0.5?'var(--or)':'var(--rd)'}}>
              {fmtKm(thisWeekKm)} / {fmtKm(planWeek.targetKm)} km
            </span>
          </div>
          <div style={{height:7,borderRadius:4,background:'var(--bd)',overflow:'hidden'}}>
            <div style={{height:'100%',borderRadius:4,width:Math.min(100,planPct*100)+'%',
              background:planPct>=0.8?'var(--gn)':planPct>=0.5?'var(--or)':'var(--rd)',transition:'width .4s ease'}}/>
          </div>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{display:'flex',gap:8}}>
            {planWeek.easy>0&&<span style={{fontSize:'.65rem',color:'#3b82f6',fontWeight:600}}>Easy ×{planWeek.easy}</span>}
            {planWeek.long>0&&<span style={{fontSize:'.65rem',color:'#8b5cf6',fontWeight:600}}>Long ×{planWeek.long}</span>}
            {planWeek.workout>0&&<span style={{fontSize:'.65rem',color:'#f97316',fontWeight:600}}>Workout ×{planWeek.workout}</span>}
          </div>
          {planAdherence?.weeksCompleted>0&&(
            <span style={{fontSize:'.68rem',fontWeight:700,color:planAdherence.adherencePct>=80?'var(--gn)':'var(--or)'}}>
              {planAdherence.adherencePct}% adherence
            </span>
          )}
        </div>
      </div>
    )}
    {todayWorkout&&!todayWorkout.done&&(
      <div className="card a1" style={{padding:16,marginBottom:14}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div style={{display:'flex',alignItems:'center',gap:7}}>
            <span style={{fontSize:'1.1rem'}}>{todayWorkout.icon}</span>
            <span style={{fontSize:'.65rem',fontWeight:700,color:'var(--tx2)',letterSpacing:'.06em',textTransform:'uppercase'}}>{todayWorkout.dayLabel?`Next · ${todayWorkout.dayLabel}`:"Today's Workout"}</span>
          </div>
          <span style={{fontSize:'.6rem',fontWeight:700,color:'var(--or)',padding:'2px 9px',borderRadius:20,background:'rgba(249,115,22,.1)',textTransform:'capitalize'}}>
            {todayWorkout.phase} · W{planWeekNum}/{plan.weeks.length}
          </span>
        </div>
        <div style={{fontSize:'1.05rem',fontWeight:800,color:'var(--tx)',marginBottom:10}}>{todayWorkout.label}</div>
        <div style={{display:'flex',gap:8,marginBottom:10}}>
          <div style={{flex:1,textAlign:'center',padding:'10px 6px',background:'var(--s2)',borderRadius:10,border:'1px solid var(--bd)'}}>
            <div style={{fontSize:'1.25rem',fontWeight:800,color:'var(--or)',lineHeight:1}}>{fmtKm(todayWorkout.distanceKm)}</div>
            <div style={{fontSize:'.54rem',color:'var(--tx3)',letterSpacing:'.05em',marginTop:2}}>KM</div>
          </div>
          <div style={{flex:2,textAlign:'center',padding:'10px 6px',background:'var(--s2)',borderRadius:10,border:'1px solid var(--bd)'}}>
            {todayWorkout.paceMin?(
              <>
                <div style={{fontSize:'1rem',fontWeight:800,color:'var(--tx)',lineHeight:1}}>{fmtPace(todayWorkout.paceMin)}–{fmtPace(todayWorkout.paceMax)}</div>
                <div style={{fontSize:'.54rem',color:'var(--tx3)',letterSpacing:'.05em',marginTop:2}}>/KM TARGET</div>
              </>
            ):(
              <div style={{fontSize:'.82rem',fontWeight:600,color:'var(--tx2)',lineHeight:1.35,paddingTop:2}}>{todayWorkout.paceNote}</div>
            )}
          </div>
        </div>
        <div style={{fontSize:'.74rem',color:'var(--tx2)',fontStyle:'italic',lineHeight:1.5}}>↳ {todayWorkout.tip}</div>
      </div>
    )}
    {todayWorkout?.done&&(
      <div className="card a1" style={{padding:'11px 16px',marginBottom:14,display:'flex',alignItems:'center',gap:10,background:'var(--gn2)',border:'1px solid rgba(34,197,94,.25)'}}>
        <span style={{fontSize:'1.1rem'}}>✅</span>
        <span style={{fontSize:'.82rem',fontWeight:600,color:'var(--gn)'}}>All runs logged this week · Rest up!</span>
      </div>
    )}
    {!plan&&acts.length>0&&(
      <button className="btn b-gh" style={{width:'100%',marginBottom:14,fontSize:'.8rem',padding:'11px'}} onClick={onOpenPlan}>
        🎯 Set a goal race + training plan
      </button>
    )}
    {lastRun&&(
      <button className="card a2" style={{marginBottom:14,overflow:"hidden",cursor:"pointer",width:"100%",textAlign:"left",background:"none",border:"1px solid var(--bd)",padding:0}} onClick={()=>onSelectAct(lastRun)} aria-label={`Open ${lastRun.name}`}>
        {/* Top accent bar */}
        <div style={{height:3,background:`linear-gradient(90deg,${ACT_CLR[lastRun.type]||"var(--or)"},transparent)`}}/>
        <div style={{padding:"16px 18px 18px"}}>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <div style={{fontSize:".6rem",fontWeight:700,color:ACT_CLR[lastRun.type]||"var(--or)",letterSpacing:".08em",textTransform:"uppercase",marginBottom:4}}>{lastRun.type} · {fmtDate(lastRun.date)}</div>
              <div style={{fontWeight:800,fontSize:"1.05rem",lineHeight:1.2,letterSpacing:"-.01em"}}>{lastRun.name}</div>
            </div>
            <span style={{fontSize:".66rem",fontWeight:700,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".06em"}}>{lastRun.runClass}</span>
          </div>
          {/* Stats — large, no boxes */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",borderTop:"1px solid var(--bd)",paddingTop:14,gap:4}}>
            {[
              {v:fmtKm(lastRun.distanceKm),u:"km",c:"var(--or)"},
              {v:fmtPace(lastRun.avgPaceSecKm),u:"/km",c:"var(--tx)"},
              {v:lastRun.avgHR?String(lastRun.avgHR):"—",u:"bpm",c:lastRun.avgHR&&lastRun.avgHR>mafHR?"var(--yw)":"var(--gn)"}
            ].map(s=>(
              <div key={s.u} style={{textAlign:"center"}}>
                <div style={{fontSize:"1.45rem",fontWeight:800,color:s.c,lineHeight:1,letterSpacing:"-.02em"}}>{s.v}<span style={{fontSize:".65rem",fontWeight:500,color:"var(--tx3)",marginLeft:2}}>{s.u}</span></div>
              </div>
            ))}
          </div>
        </div>
      </button>
    )}
    {!lastRun&&(
      <div className="card a2" style={{padding:28,textAlign:"center",marginBottom:14,borderStyle:"dashed"}}>
        <div style={{fontSize:"2.8rem",marginBottom:12}}>🏃</div>
        <div style={{fontWeight:700,fontSize:"var(--fs-base)",marginBottom:6}}>No runs yet</div>
        <div style={{fontSize:".8rem",color:"var(--tx2)",marginBottom:18,lineHeight:1.6}}>Upload a GPX file from your watch, or sync directly from Strava.</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <button className="btn b-or" style={{padding:"11px 24px"}} onClick={onUpload}>📁 Upload GPX</button>
          <button className="btn b-gh" style={{padding:"11px 24px"}} onClick={onLogRun}>+ Log Run</button>
          <button className="btn b-gh" style={{padding:"11px 24px"}} onClick={onOpenSettings}>🟠 Connect Strava</button>
        </div>
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
          {weekPct<1&&<div style={{fontSize:".74rem",color:"var(--tx2)"}}>{weekLeft} km to go · <span style={{color:"var(--or)",fontWeight:600}}>{thisWeekRuns} run{thisWeekRuns!==1?"s":""}</span> this week</div>}
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
    {paceTrendPct!==null&&(
      <div className="card a3" style={{padding:"11px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:"1.1rem"}}>{paceTrendPct>0?"📈":paceTrendPct<0?"📉":"➡️"}</span>
        <div style={{flex:1}}>
          <span style={{fontSize:".82rem",fontWeight:700,color:paceTrendPct>0?"var(--gn)":paceTrendPct<0?"var(--rd)":"var(--tx)"}}>
            {paceTrendPct===0?"Same pace":paceTrendPct>0?`${paceTrendPct}% faster`:`${Math.abs(paceTrendPct)}% slower`}
          </span>
          <span style={{fontSize:".76rem",color:"var(--tx2)"}}> than last month</span>
        </div>
      </div>
    )}
    {nextMilestone&&(
      <div className="card a3" style={{padding:"12px 16px",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <span style={{fontSize:".9rem"}}>{nextMilestone.badge.icon}</span>
          <div style={{flex:1,minWidth:0}}>
            <span style={{fontSize:".76rem",fontWeight:700,color:"var(--tx)"}}>{nextMilestone.next.label}</span>
            <span style={{fontSize:".7rem",color:"var(--tx3)",marginLeft:5}}>{nextMilestone.badge.name}</span>
          </div>
          <span style={{fontSize:".68rem",fontWeight:700,color:nextMilestone.next.color}}>{nextMilestone.pct}%</span>
        </div>
        <div className="pb"><div className="pf" style={{width:nextMilestone.pct+"%",background:nextMilestone.next.color}}/></div>
        <div style={{fontSize:".68rem",color:"var(--tx3)",marginTop:5}}>
          {parseFloat((nextMilestone.next.req-nextMilestone.progress).toFixed(1))} {nextMilestone.badge.unit} to unlock
        </div>
      </div>
    )}
    {memories.length > 0 && (
      <div style={{marginBottom:16}}>
        <div style={{fontSize:'.72rem',fontWeight:700,color:'var(--tx2)',letterSpacing:'.06em',textTransform:'uppercase',marginBottom:8}}>📸 Recent Memories</div>
        <div style={{display:'flex',flexDirection:'column',gap:7}}>
          {memories.map(a => {
            const mood = a.mood ? MOODS_MAP[a.mood] : null;
            return (
              <button key={a.id} className="card" onClick={()=>onSelectAct(a)}
                style={{padding:'10px 12px',display:'flex',alignItems:'center',gap:10,cursor:'pointer',width:'100%',textAlign:'left',background:'none',border:'1px solid var(--bd)'}} aria-label={`Open ${a.name}`}>
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
              </button>
            );
          })}
        </div>
      </div>
    )}
    <div style={{display:"flex",gap:10,marginTop:acts.length>0?0:10}}>
      {acts.length>0&&<button className="btn b-gh" style={{flex:1,padding:"12px"}} onClick={onViewAll}>🏃 All Runs</button>}
      <button className="btn b-or" style={{flex:1,padding:"12px"}} onClick={onLogRun}>+ Log Run</button>
      {acts.length>0&&<button className="btn b-gh" style={{flex:1,padding:"12px"}} onClick={onViewMonthly}>📅 Monthly</button>}
    </div>
  </div>);
}

