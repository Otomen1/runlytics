import React, { useMemo } from 'react';
import { SH } from '../common/SH.jsx';
import { Ring } from '../common/Ring.jsx';
import { getMafHR, getMafZones, computeZones } from '../../utils/analytics.js';
import { PLAN_KEY } from '../../constants/keys.js';
import { getPlanAdherence, getPlanWeekNumber, getPlanWeek, getWeekDays } from '../../utils/trainingPlan.js';
import { weekOf, fmtKm, todayKey } from '../../utils/formatters.js';

function StreakCalendar({ acts }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const runDays = useMemo(() => {
    const s = new Set();
    acts.forEach(a => { if (a.date && a.date.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)) s.add(+a.date.slice(8,10)); });
    return s;
  }, [acts, year, month]);
  const todayD = now.getDate();
  // Build grid cells: empty slots + day cells
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  return (
    <div className="card a1" style={{padding:16,marginBottom:14}}>
      <SH title="Streak Calendar" sub={monthLabel}/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginBottom:6}}>
        {DAY_LABELS.map(d=>(
          <div key={d} style={{textAlign:'center',fontSize:'.58rem',fontWeight:700,color:'var(--tx3)',letterSpacing:'.04em',paddingBottom:4}}>{d}</div>
        ))}
        {cells.map((d,i)=> d===null ? <div key={'e'+i}/> : (
          <div key={d} style={{
            aspectRatio:'1',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:'.7rem',fontWeight:d===todayD?700:400,
            background: runDays.has(d) ? 'var(--or)' : d===todayD ? 'var(--bd)' : 'transparent',
            color: runDays.has(d) ? '#fff' : d===todayD ? 'var(--tx)' : d<todayD ? 'var(--tx2)' : 'var(--tx3)',
            border: d===todayD&&!runDays.has(d) ? '1px solid var(--bd2)' : 'none',
          }}>{d}</div>
        ))}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:6,marginTop:8}}>
        <div style={{width:10,height:10,borderRadius:3,background:'var(--or)'}}/>
        <span style={{fontSize:'.7rem',color:'var(--tx2)'}}>{runDays.size} run day{runDays.size!==1?'s':''} this month</span>
      </div>
    </div>
  );
}

export function MoreTab({acts,hrProfile,onEditHR,onViewMonthly,onViewYearReview,onOpenPlan}){
  const mafHR=getMafHR(hrProfile);
  const plan=useMemo(()=>{try{return JSON.parse(localStorage.getItem(PLAN_KEY)||'null');}catch{return null;}},[]);
  const todayWeek=weekOf(Date.now());
  const planWeekNum=plan?getPlanWeekNumber(plan,todayWeek):null;
  const planAdherence=useMemo(()=>{
    if(!plan)return null;
    const weekMap={};acts.forEach(a=>{const w=weekOf(a.dateTs);weekMap[w]=(weekMap[w]||0)+a.distanceKm;});
    return getPlanAdherence(plan,Object.entries(weekMap).map(([week,km])=>({week,km})));
  },[plan,acts]);
  const planChartData=useMemo(()=>{
    if(!plan)return[];
    const weekMap={};acts.forEach(a=>{const w=weekOf(a.dateTs);weekMap[w]=(weekMap[w]||0)+a.distanceKm;});
    return plan.weeks.map((w,i)=>({week:`W${i+1}`,target:w.targetKm,actual:weekMap[w.week]?parseFloat(weekMap[w.week].toFixed(1)):null,phase:w.phase,weekKey:w.week}));
  },[plan,acts]);
  const currentPlanWeek=useMemo(()=>plan?getPlanWeek(plan,todayWeek):null,[plan,todayWeek]);
  const currentWeekDays=useMemo(()=>getWeekDays(currentPlanWeek),[currentPlanWeek]);
  const todayDate=todayKey();
  const runsWithHR=acts.filter(a=>a.avgHR&&a.distanceKm>0);
  const last5=runsWithHR.slice(0,5);
  const aggZones=useMemo(()=>{
    if(!last5.length)return null;
    const secs=[0,0,0,0,0];let tot=0;
    last5.forEach(r=>{const z=computeZones(r.hrSamples,mafHR);if(z)z.forEach((zone,i)=>{secs[i]+=(zone.seconds||0);tot+=(zone.seconds||0);});});
    if(!tot)return null;
    return getMafZones(mafHR).map((z,i)=>({...z,pct:Math.round(secs[i]/tot*100),minutes:parseFloat((secs[i]/60).toFixed(1))}));
  },[last5,mafHR]);
  return(
    <div style={{padding:"4px 0 32px"}}>
      {/* Training Plan card */}
      <div className="card a0" style={{padding:16,marginBottom:14}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:plan?14:0}}>
          <SH title="Training Plan"/>
          <button className="btn b-or" style={{fontSize:'.72rem',padding:'5px 14px'}} onClick={onOpenPlan}>
            {plan?'View Plan':'Set Race'}
          </button>
        </div>
        {!plan&&(
          <div style={{paddingTop:12,textAlign:'center'}}>
            <div style={{fontSize:'2rem',marginBottom:10}}>🎯</div>
            <div style={{fontSize:'.84rem',fontWeight:600,marginBottom:6}}>No training plan yet</div>
            <div style={{fontSize:'.76rem',color:'var(--tx2)',lineHeight:1.6,marginBottom:16}}>Set a goal race and get a personalised week-by-week plan.</div>
            <button className="btn b-or" style={{width:'100%',padding:'13px'}} onClick={onOpenPlan}>Set a Goal Race →</button>
          </div>
        )}
        {plan&&(()=>{
          const PHASE_COLS={base:'#3b82f6',build:'#f97316',taper:'#8b5cf6',race:'#22c55e'};
          const raceName=plan.raceType==='HM'?'Half Marathon':plan.raceType;
          const raceDisplay=new Date(plan.raceDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
          const weeksLeft=plan.weeks.filter(w=>w.week>=todayWeek).length;
          const maxKm=Math.max(...planChartData.map(d=>d.target||0),1);
          return(
            <>
              <div style={{display:'flex',gap:8,marginBottom:14}}>
                {[{l:'Race',v:raceName,c:'var(--or)'},{l:'Date',v:raceDisplay,c:'var(--tx)'},{l:'Week',v:planWeekNum?`${planWeekNum}/${plan.weeks.length}`:'—',c:'var(--or)'},{l:'Left',v:`${weeksLeft}w`,c:'var(--tx2)'}].map(s=>(
                  <div key={s.l} className="card2" style={{flex:1,padding:'10px 4px',textAlign:'center'}}>
                    <div style={{fontSize:'.78rem',fontWeight:700,color:s.c,lineHeight:1,marginBottom:3}}>{s.v}</div>
                    <div style={{fontSize:'.55rem',color:'var(--tx3)',letterSpacing:'.04em'}}>{s.l}</div>
                  </div>
                ))}
              </div>
              {planAdherence?.weeksCompleted>0&&(
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,padding:'10px 12px',borderRadius:10,
                  background:planAdherence.adherencePct>=80?'var(--gn2)':planAdherence.adherencePct>=60?'rgba(234,179,8,.1)':'var(--rd2)',
                  border:`1px solid ${planAdherence.adherencePct>=80?'rgba(34,197,94,.25)':planAdherence.adherencePct>=60?'rgba(234,179,8,.25)':'rgba(239,68,68,.25)'}`}}>
                  <div style={{flex:1,fontSize:'.76rem',color:'var(--tx2)'}}>Adherence · {planAdherence.weeksCompleted} week{planAdherence.weeksCompleted!==1?'s':''} tracked</div>
                  <div style={{fontSize:'1.1rem',fontWeight:800,color:planAdherence.adherencePct>=80?'var(--gn)':planAdherence.adherencePct>=60?'var(--yw)':'var(--rd)'}}>{planAdherence.adherencePct}%</div>
                </div>
              )}
              <div style={{fontSize:'.68rem',fontWeight:700,color:'var(--tx3)',letterSpacing:'.06em',textTransform:'uppercase',marginBottom:8}}>All Weeks</div>
              <div style={{overflowX:'auto',paddingBottom:4}}>
                <div style={{display:'flex',gap:3,minWidth:Math.max(300,plan.weeks.length*26),alignItems:'flex-end',height:96}}>
                  {planChartData.map((w,i)=>{
                    const isCurrent=w.weekKey===todayWeek;
                    const isPast=w.weekKey<todayWeek;
                    const phaseColor=PHASE_COLS[w.phase]||'var(--or)';
                    const targetH=Math.round((w.target||0)/maxKm*80);
                    const actualH=w.actual!=null?Math.round(w.actual/maxKm*80):0;
                    return(
                      <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:0}}>
                        <div style={{position:'relative',width:'100%',height:80,display:'flex',alignItems:'flex-end'}}>
                          <div style={{position:'absolute',bottom:0,left:0,right:0,height:targetH,borderRadius:'3px 3px 0 0',background:phaseColor+'28',border:`1px dashed ${phaseColor}55`}}/>
                          {w.actual!=null&&<div style={{position:'absolute',bottom:0,left:'15%',right:'15%',height:actualH,borderRadius:'3px 3px 0 0',background:phaseColor,opacity:isPast?0.75:1,boxShadow:isCurrent?`0 0 8px ${phaseColor}80`:undefined}}/>}
                          {isCurrent&&<div style={{position:'absolute',top:-4,left:'50%',transform:'translateX(-50%)',width:4,height:4,borderRadius:2,background:'var(--or)'}}/>}
                        </div>
                        <div style={{fontSize:'.48rem',color:isCurrent?'var(--or)':'var(--tx3)',fontWeight:isCurrent?700:400,marginTop:2}}>{w.week}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{display:'flex',gap:12,marginTop:8,flexWrap:'wrap'}}>
                {[['#3b82f6','Base'],['#f97316','Build'],['#8b5cf6','Taper'],['#22c55e','Race']].map(([c,l])=>(
                  <div key={l} style={{display:'flex',alignItems:'center',gap:4}}>
                    <div style={{width:8,height:8,borderRadius:2,background:c+'33',border:`1px dashed ${c}88`}}/>
                    <span style={{fontSize:'.6rem',color:'var(--tx3)'}}>{l}</span>
                  </div>
                ))}
              </div>
              {currentWeekDays.length>0&&(
                <div style={{marginTop:14,borderTop:'1px solid var(--bd)',paddingTop:12}}>
                  <div style={{fontSize:'.65rem',fontWeight:700,color:'var(--tx3)',letterSpacing:'.06em',textTransform:'uppercase',marginBottom:8}}>
                    This Week — W{planWeekNum} · <span style={{textTransform:'capitalize'}}>{currentPlanWeek.phase}</span>
                  </div>
                  {currentWeekDays.map(day=>{
                    const isToday=day.date===todayDate;
                    const isDone=day.type!=='rest'&&acts.some(a=>a.date===day.date);
                    return(
                      <div key={day.date} style={{
                        display:'flex',alignItems:'center',gap:10,
                        padding:'6px 8px',marginBottom:2,borderRadius:8,
                        background:isToday?'rgba(249,115,22,.07)':'transparent',
                        borderLeft:isToday?'3px solid var(--or)':'3px solid transparent',
                      }}>
                        <span style={{fontSize:'.68rem',fontWeight:isToday?700:500,color:isToday?'var(--or)':'var(--tx3)',width:26,flexShrink:0}}>{day.day}</span>
                        <span style={{fontSize:'.8rem',width:18,textAlign:'center',flexShrink:0}}>{day.icon}</span>
                        <span style={{fontSize:'.72rem',flex:1,color:day.type==='rest'?'var(--tx3)':isDone?'var(--gn)':'var(--tx)',fontWeight:isDone?600:400}}>{day.label}</span>
                        {day.targetKm>0&&(
                          <span style={{fontSize:'.72rem',fontWeight:700,color:isDone?'var(--gn)':day.color}}>{fmtKm(day.targetKm)} km</span>
                        )}
                        {isDone&&<span style={{fontSize:'.72rem',color:'var(--gn)'}}>✓</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}
      </div>
      <StreakCalendar acts={acts}/>
      <div style={{display:"flex",gap:10,marginBottom:14}}>
        <button className="btn b-gh" style={{flex:1,padding:"13px",fontSize:".86rem"}} onClick={onViewMonthly}>📅 Monthly Wrapped</button>
        <button className="btn b-gh" style={{flex:1,padding:"13px",fontSize:".86rem"}} onClick={onViewYearReview}>🎁 Year Review</button>
      </div>
      <div className="card a0" style={{padding:20,marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:64,height:64,borderRadius:18,background:"rgba(249,115,22,.1)",border:"1px solid rgba(249,115,22,.2)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <div style={{fontSize:"1.4rem",fontWeight:700,color:"var(--or)",lineHeight:1}}>{mafHR}</div>
            <div style={{fontSize:".5rem",color:"var(--or)",opacity:.7,marginTop:2}}>BPM</div>
          </div>
          <div style={{flex:1}}>
            <div className="sl" style={{marginBottom:4}}>MAF Heart Rate</div>
            <div style={{fontWeight:700,fontSize:"var(--fs-base)",marginBottom:4}}>Aerobic Zone Target</div>
            <div style={{fontSize:".74rem",color:"var(--tx2)",lineHeight:1.5}}>{hrProfile&&hrProfile.age?"180 − "+hrProfile.age+" = "+mafHR+" bpm":"Set age in Settings"}</div>
          </div>
        </div>
        {!(hrProfile&&hrProfile.age)&&<button className="btn b-or" style={{width:"100%",marginTop:14,padding:"10px",fontSize:".86rem"}} onClick={onEditHR}>Set Up MAF Profile →</button>}
      </div>
      {aggZones&&(
        <div className="card a1" style={{padding:16,marginBottom:14}}>
          <SH title="Zone Distribution" sub={"Last "+last5.length+" runs"}/>
          {aggZones.map((z,i)=>(
            <div key={z.zone} style={{marginBottom:i<4?11:0}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <div style={{width:10,height:10,borderRadius:3,background:z.color,flexShrink:0}}/>
                  <span style={{fontSize:".8rem",fontWeight:600}}>{z.zone}</span>
                  <span style={{fontSize:".72rem",color:"var(--tx2)"}}>{z.label}</span>
                </div>
                <span style={{fontSize:".88rem",color:z.color,fontWeight:700}}>{z.pct}%</span>
              </div>
              <div className="pb"><div className="pf" style={{width:z.pct+"%",background:z.color}}/></div>
            </div>
          ))}
        </div>
      )}
      {!runsWithHR.length&&(
        <div style={{textAlign:"center",padding:"40px 0 20px"}}>
          <div style={{fontSize:"2.8rem",marginBottom:14}}>❤️</div>
          <div style={{fontWeight:700,fontSize:"var(--fs-lg)",marginBottom:8}}>No HR data yet</div>
          <div style={{fontSize:".84rem",color:"var(--tx2)",marginBottom:6,lineHeight:1.65,maxWidth:260,margin:"0 auto 8px"}}>
            {!acts.length
              ? "Log your first run to see heart-rate zones and MAF coaching."
              : "Your runs don't have HR data. Use a chest strap or wrist sensor and re-upload with HR samples."}
          </div>
          {!acts.length
            ? <div style={{fontSize:".74rem",color:"var(--tx3)",marginTop:12}}>Upload a GPX or connect Strava to get started.</div>
            : <button className="btn b-or" style={{padding:"10px 22px",marginTop:16}} onClick={onEditHR}>Adjust MAF Profile →</button>
          }
        </div>
      )}
    </div>
  );
}
