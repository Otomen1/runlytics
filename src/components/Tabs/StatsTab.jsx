import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, ScatterChart, Scatter, ZAxis
} from 'recharts';
import { SH } from '../common/SH.jsx';
import { CalendarHeatmap } from '../CalendarHeatmap.jsx';
import { fmtKm, fmtDur, fmtPace, fmtDateS, weekOf } from '../../utils/formatters.js';
import { computeRacePRs, computeAtlCtl, predictRaceTimes, estimateVO2max, getMafHR, computeZones, getMafZones } from '../../utils/analytics.js';
import { SHOES_KEY, PLAN_KEY } from '../../constants/keys.js';
import { DEFAULT_SHOE_MAX_KM, SHOE_WARN_THRESHOLD } from '../../constants/limits.js';
import { getPlanWeek, getPlanAdherence, getPlanWeekNumber } from '../../utils/trainingPlan.js';

function fmtPaceMin(secPerKm){
  if(!secPerKm||secPerKm<=0)return'';
  const m=Math.floor(secPerKm/60),s=Math.round(secPerKm%60);
  return`${m}:${String(s).padStart(2,'0')}`;
}

const ScatterDot=({cx,cy,payload})=>(
  <circle cx={cx} cy={cy} r={4.5} fill="#f97316" fillOpacity={payload?.opacity??0.6} stroke="none"/>
);

export function StatsTab({acts,analytics,hrProfile,onViewAll,onViewMonthly,onOpenPR,onViewYearReview,onManageShoes,onOpenPlan}){
  const[range,setRange]=useState(8);
  const[atlRange,setAtlRange]=useState(90);
  const[prCatIdx,setPrCatIdx]=useState(0);

  const runs=acts.filter(a=>a.type==="Run"||a.type==="Walk");
  const totalKm=runs.reduce((s,a)=>s+a.distanceKm,0);
  const racePRs=useMemo(()=>computeRacePRs(acts),[acts]);
  const atlCtl=useMemo(()=>computeAtlCtl(acts,atlRange),[acts,atlRange]);
  const currentForm=atlCtl.length?atlCtl[atlCtl.length-1].form:0;
  const recentRacePRs=useMemo(()=>{
    const cutoff=new Date();cutoff.setMonth(cutoff.getMonth()-6);
    return computeRacePRs(acts.filter(a=>a.date&&a.date>=cutoff.toISOString().slice(0,10)));
  },[acts]);
  const predictions=useMemo(()=>predictRaceTimes(racePRs,recentRacePRs,currentForm),[racePRs,recentRacePRs,currentForm]);
  const vo2maxEst=useMemo(()=>estimateVO2max(racePRs),[racePRs]);
  const races=useMemo(()=>acts.filter(a=>a.isRace).sort((a,b)=>b.dateTs-a.dateTs),[acts]);
  const shoes=useMemo(()=>{try{return JSON.parse(localStorage.getItem(SHOES_KEY)||'[]');}catch{return[];}}, []);
  const shoeKm=useMemo(()=>{const m={};acts.forEach(a=>{if(a.shoeId)m[a.shoeId]=(m[a.shoeId]||0)+a.distanceKm;});return m;},[acts]);
  const overallPRs=runs.length?{
    longest:runs.reduce((b,r)=>r.distanceKm>b.distanceKm?r:b),
    fastest:runs.filter(r=>r.avgPaceSecKm>0).reduce((b,r)=>r.avgPaceSecKm<b.avgPaceSecKm?r:b,runs.find(r=>r.avgPaceSecKm>0)||runs[0])
  }:null;

  const plan=useMemo(()=>{try{return JSON.parse(localStorage.getItem(PLAN_KEY)||'null');}catch{return null;}},[]);
  const todayWeek=weekOf(Date.now());
  const planWeekNum=plan?getPlanWeekNumber(plan,todayWeek):null;
  const planAdherence=useMemo(()=>plan?getPlanAdherence(plan,analytics.weeklyKm||[]):null,[plan,analytics.weeklyKm]);
  const planChartData=useMemo(()=>{
    if(!plan)return[];
    return plan.weeks.map((w,i)=>{
      const actual=(analytics.weeklyKm||[]).find(wk=>wk.week===w.week);
      return{week:`W${i+1}`,target:w.target??w.targetKm,actual:actual?parseFloat(actual.km.toFixed(1)):null,phase:w.phase};
    });
  },[plan,analytics.weeklyKm]);
  const weeklyTyped=useMemo(()=>{
    const wm={};
    runs.forEach(a=>{
      const w=weekOf(a.dateTs);
      if(!wm[w])wm[w]={week:w,easy:0,workout:0,long:0};
      const cls=a.runClass||'easy';
      wm[w][cls]=(wm[w][cls]||0)+a.distanceKm;
    });
    const sorted=Object.entries(wm).sort(([a],[b])=>a>b?1:-1).map(([,v])=>({
      ...v,
      easy:parseFloat(v.easy.toFixed(1)),
      workout:parseFloat(v.workout.toFixed(1)),
      long:parseFloat(v.long.toFixed(1)),
      total:parseFloat((v.easy+v.workout+v.long).toFixed(1)),
    }));
    return sorted.map((w,i)=>{
      const sl=sorted.slice(Math.max(0,i-2),i+1);
      const avg=parseFloat((sl.reduce((s,x)=>s+x.total,0)/sl.length).toFixed(1));
      return{...w,avg};
    });
  },[runs]);

  const acwr=useMemo(()=>{
    if(!atlCtl.length)return null;
    const last=atlCtl[atlCtl.length-1];
    if(!last.ctl)return null;
    const ratio=parseFloat((last.atl/last.ctl).toFixed(2));
    if(ratio<0.8)return{ratio,label:'Undertraining',color:'#3b82f6',bg:'rgba(59,130,246,.12)'};
    if(ratio<1.3)return{ratio,label:'Optimal Load',color:'#22c55e',bg:'rgba(34,197,94,.12)'};
    if(ratio<1.5)return{ratio,label:'Caution',color:'#eab308',bg:'rgba(234,179,8,.12)'};
    return{ratio,label:'High Risk',color:'#ef4444',bg:'rgba(239,68,68,.12)'};
  },[atlCtl]);

  const paceHRData=useMemo(()=>{
    const now=Date.now();
    return acts
      .filter(a=>a.avgPaceSecKm>0&&a.avgHR>50&&a.avgHR<220)
      .map(a=>{
        const ageDays=(now-a.dateTs)/86400000;
        const opacity=Math.max(0.2,Math.min(1,1-ageDays/400));
        return{pace:parseFloat((a.avgPaceSecKm).toFixed(0)),hr:a.avgHR,km:parseFloat(a.distanceKm.toFixed(1)),date:a.date,opacity};
      });
  },[acts]);

  const hrZonesAgg=useMemo(()=>{
    const mafHR=getMafHR(hrProfile);
    const totals=getMafZones(mafHR).map(z=>({...z,seconds:0}));
    acts.forEach(a=>{
      if(!a.hrSamples||!a.hrSamples.length)return;
      computeZones(a.hrSamples,mafHR).forEach((z,i)=>{if(totals[i])totals[i].seconds+=(z.seconds||0);});
    });
    const total=totals.reduce((s,z)=>s+z.seconds,0);
    if(total<60)return null;
    return{zones:totals.map(z=>({...z,minutes:parseFloat((z.seconds/60).toFixed(1)),pct:Math.round(z.seconds/total*100)})),totalHrs:parseFloat((total/3600).toFixed(1))};
  },[acts,hrProfile]);

  const prForProgression=racePRs[prCatIdx]||racePRs[0];
  const prHistory=useMemo(()=>{
    if(!prForProgression?.history?.length)return[];
    return prForProgression.history.map((h,i)=>{
      const prev=prForProgression.history[0].paceSecKm;
      const imp=prev>0?parseFloat(((prev-h.paceSecKm)/prev*100).toFixed(1)):0;
      return{...h,i,imp};
    });
  },[prForProgression]);

  if(!acts.length) return(
    <div style={{padding:"32px 0 40px",textAlign:"center"}}>
      <div style={{fontSize:"3.5rem",marginBottom:16}}>📈</div>
      <div style={{fontWeight:700,fontSize:"1.1rem",marginBottom:8}}>No stats yet</div>
      <div style={{fontSize:".86rem",color:"var(--tx2)",lineHeight:1.65,maxWidth:240,margin:"0 auto 28px"}}>Once you log your first run, your stats, charts, and PRs will appear here.</div>
      <div style={{fontSize:".76rem",color:"var(--tx3)"}}>Tap the ⚙️ settings to import or connect Strava.</div>
    </div>
  );

  return(
    <div style={{padding:"10px 0 32px"}}>
      <div className="a0" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:18}}>
        {[{l:"Total km",v:parseFloat(totalKm.toFixed(0)).toLocaleString(),c:"var(--or)"},{l:"Runs",v:runs.length,c:"var(--bl)"},{l:"Time",v:fmtDur(runs.reduce((s,a)=>s+a.movingTimeSec,0)),c:"var(--gn)"}].map(s=>(
          <div key={s.l} className="card2" style={{padding:"14px 10px",textAlign:"center"}}>
            <div style={{fontSize:"var(--fs-xl)",fontWeight:700,color:s.c,lineHeight:1,marginBottom:4}}>{s.v}</div>
            <div style={{fontSize:"var(--fs-xs)",color:"var(--tx2)",letterSpacing:".04em"}}>{s.l}</div>
          </div>
        ))}
      </div>

      {acts.length>0&&(
        <div className="card a1" style={{padding:16,marginBottom:14}}>
          <SH title="Activity History"/>
          <div style={{marginTop:10}}>
            <CalendarHeatmap acts={acts}/>
          </div>
        </div>
      )}

      {(plan||acts.length>0)&&(
        <div className="card a1" style={{padding:16,marginBottom:14}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:plan?14:0}}>
            <SH title="Training Plan"/>
            <button className="btn b-gh" style={{fontSize:'.72rem',padding:'5px 12px'}} onClick={onOpenPlan}>
              {plan?'Edit':'Set Goal Race'}
            </button>
          </div>
          {!plan&&(
            <div style={{paddingTop:12,textAlign:'center'}}>
              <div style={{fontSize:'2rem',marginBottom:10}}>🎯</div>
              <div style={{fontSize:'.84rem',fontWeight:600,marginBottom:6}}>No training plan yet</div>
              <div style={{fontSize:'.76rem',color:'var(--tx2)',lineHeight:1.6,marginBottom:16}}>Set a goal race and get a week-by-week plan built around your current fitness.</div>
              <button className="btn b-or" style={{width:'100%',padding:'13px'}} onClick={onOpenPlan}>Set a Goal Race →</button>
            </div>
          )}
          {plan&&(()=>{
            const PHASE_COLS={base:'#3b82f6',build:'#f97316',taper:'#8b5cf6',race:'#22c55e'};
            const raceName=plan.raceType==='HM'?'Half Marathon':plan.raceType;
            const raceDisplay=new Date(plan.raceDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
            const weeksLeft=plan.weeks.filter(w=>w.week>=todayWeek).length;
            return(
              <>
                <div style={{display:'flex',gap:10,marginBottom:16}}>
                  {[
                    {l:'Race',v:raceName,c:'var(--or)'},
                    {l:'Date',v:raceDisplay,c:'var(--tx)'},
                    {l:'Week',v:planWeekNum?`${planWeekNum}/${plan.weeks.length}`:'—',c:'var(--or)'},
                    {l:'Left',v:`${weeksLeft}w`,c:'var(--tx2)'},
                  ].map(s=>(
                    <div key={s.l} className="card2" style={{flex:1,padding:'10px 6px',textAlign:'center'}}>
                      <div style={{fontSize:'.82rem',fontWeight:700,color:s.c,lineHeight:1,marginBottom:3}}>{s.v}</div>
                      <div style={{fontSize:'.55rem',color:'var(--tx3)',letterSpacing:'.04em'}}>{s.l}</div>
                    </div>
                  ))}
                </div>
                {planAdherence?.weeksCompleted>0&&(
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,padding:'10px 12px',borderRadius:10,
                    background:planAdherence.adherencePct>=80?'var(--gn2)':planAdherence.adherencePct>=60?'rgba(234,179,8,.1)':'var(--rd2)',
                    border:`1px solid ${planAdherence.adherencePct>=80?'rgba(34,197,94,.25)':planAdherence.adherencePct>=60?'rgba(234,179,8,.25)':'rgba(239,68,68,.25)'}`}}>
                    <div style={{flex:1,fontSize:'.76rem',color:'var(--tx2)'}}>
                      Overall adherence · {planAdherence.weeksCompleted} week{planAdherence.weeksCompleted!==1?'s':''} tracked
                    </div>
                    <div style={{fontSize:'1.1rem',fontWeight:800,color:planAdherence.adherencePct>=80?'var(--gn)':planAdherence.adherencePct>=60?'var(--yw)':'var(--rd)'}}>
                      {planAdherence.adherencePct}%
                    </div>
                  </div>
                )}
                <div style={{fontSize:'.7rem',fontWeight:700,color:'var(--tx3)',letterSpacing:'.06em',textTransform:'uppercase',marginBottom:8}}>Week-by-Week</div>
                <div style={{overflowX:'auto',overflowY:'hidden',paddingBottom:4}}>
                  <div style={{display:'flex',gap:3,minWidth:Math.max(300,plan.weeks.length*28)}}>
                    {planChartData.map((w,i)=>{
                      const isCurrent=plan.weeks[i]?.week===todayWeek;
                      const isPast=plan.weeks[i]?.week<todayWeek;
                      const maxKm=Math.max(...planChartData.map(d=>d.target||0),1);
                      const phaseColor=PHASE_COLS[w.phase]||'var(--or)';
                      const actualH=w.actual!=null?Math.round(w.actual/maxKm*80):0;
                      const targetH=Math.round((w.target||0)/maxKm*80);
                      return(
                        <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                          <div style={{position:'relative',width:'100%',height:88,display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
                            <div style={{position:'absolute',bottom:0,left:0,right:0,height:targetH,borderRadius:'3px 3px 0 0',
                              background:phaseColor+'33',border:`1px dashed ${phaseColor}66`}}/>
                            {w.actual!=null&&(
                              <div style={{position:'absolute',bottom:0,left:'15%',right:'15%',height:actualH,borderRadius:'3px 3px 0 0',
                                background:phaseColor,opacity:isPast?0.7:1,
                                boxShadow:isCurrent?`0 0 8px ${phaseColor}88`:undefined}}/>
                            )}
                            {isCurrent&&<div style={{position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',width:4,height:4,borderRadius:2,background:'var(--or)'}}/>}
                          </div>
                          <div style={{fontSize:'.52rem',color:isCurrent?'var(--or)':'var(--tx3)',fontWeight:isCurrent?700:400}}>{w.week}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{display:'flex',gap:14,marginTop:8,flexWrap:'wrap'}}>
                  {[['#3b82f6','Base'],['#f97316','Build'],['#8b5cf6','Taper'],['#22c55e','Race']].map(([c,l])=>(
                    <div key={l} style={{display:'flex',alignItems:'center',gap:4}}>
                      <div style={{width:10,height:10,borderRadius:2,background:c+'33',border:`1px dashed ${c}88`}}/>
                      <span style={{fontSize:'.62rem',color:'var(--tx3)'}}>{l} (target)</span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {weeklyTyped.length>1&&(
        <div className="card a1" style={{padding:16,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <SH title="Weekly Distance"/>
            <div style={{display:"flex",gap:5}}>
              {[4,8,12].map(w=><button key={w} className={"pill "+(range===w?"on":"")} onClick={()=>setRange(w)}>{w}w</button>)}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={148}>
            <ComposedChart data={weeklyTyped.slice(-range)} barSize={18} margin={{top:4,right:4,bottom:0,left:-20}}>
              <defs>
                <linearGradient id="easyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.85}/>
                  <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.55}/>
                </linearGradient>
                <linearGradient id="workGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.9}/>
                  <stop offset="100%" stopColor="#ea580c" stopOpacity={0.6}/>
                </linearGradient>
                <linearGradient id="longGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9}/>
                  <stop offset="100%" stopColor="#6d28d9" stopOpacity={0.6}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false}/>
              <XAxis dataKey="week" tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false} tickFormatter={w=>w?w.slice(5):''}/>
              <YAxis tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false} width={32}/>
              <Tooltip
                cursor={{fill:"rgba(255,255,255,.04)"}}
                content={({active,payload,label})=>{
                  if(!active||!payload?.length)return null;
                  const get=k=>payload.find(p=>p.dataKey===k)?.value||0;
                  const total=(get('easy')+get('workout')+get('long')).toFixed(1);
                  return(
                    <div className="chart-tip">
                      <div className="chart-tip-val">{total} km</div>
                      <div className="chart-tip-sub">{label}</div>
                      {get('easy')>0&&<div style={{fontSize:'.7rem',color:'#3b82f6',marginTop:2}}>Easy {get('easy')} km</div>}
                      {get('workout')>0&&<div style={{fontSize:'.7rem',color:'#f97316'}}>Workout {get('workout')} km</div>}
                      {get('long')>0&&<div style={{fontSize:'.7rem',color:'#8b5cf6'}}>Long {get('long')} km</div>}
                    </div>
                  );
                }}/>
              <Bar dataKey="easy" stackId="a" fill="url(#easyGrad)"/>
              <Bar dataKey="workout" stackId="a" fill="url(#workGrad)"/>
              <Bar dataKey="long" stackId="a" fill="url(#longGrad)" radius={[5,5,0,0]}/>
              <Line dataKey="avg" stroke="rgba(255,255,255,0.38)" strokeWidth={1.5} dot={false} strokeDasharray="4 3" type="monotone" connectNulls/>
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{display:"flex",gap:14,flexWrap:"wrap",marginTop:7,paddingLeft:2,alignItems:"center"}}>
            {[["#3b82f6","Easy"],["#f97316","Workout"],["#8b5cf6","Long"]].map(([c,l])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
                <div style={{width:10,height:10,borderRadius:3,background:c}}/>
                <span style={{fontSize:".65rem",color:"var(--tx3)"}}>{l}</span>
              </div>
            ))}
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <svg width={16} height={8}><line x1={0} y1={4} x2={16} y2={4} stroke="rgba(255,255,255,0.38)" strokeWidth={1.5} strokeDasharray="4 3"/></svg>
              <span style={{fontSize:".65rem",color:"var(--tx3)"}}>3w Avg</span>
            </div>
          </div>
        </div>
      )}

      {weeklyTyped.some(w=>(analytics.weeklyKm||[]).find(wk=>wk.week===w.week)?.load>0)&&(
        <div className="card a1" style={{padding:16,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <SH title="Training Load"/>
            <span style={{fontSize:".68rem",color:"var(--tx3)"}}>last {range} weeks</span>
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={(analytics.weeklyKm||[]).slice(-range)} barSize={18} margin={{top:4,right:4,bottom:0,left:-20}}>
              <defs>
                <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9}/>
                  <stop offset="100%" stopColor="#6d28d9" stopOpacity={0.65}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false}/>
              <XAxis dataKey="week" tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false} tickFormatter={w=>w?w.slice(5):''}/>
              <YAxis tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false} width={32}/>
              <Tooltip cursor={{fill:"rgba(255,255,255,.04)"}} content={({active,payload,label})=>{
                if(!active||!payload?.length)return null;
                return(<div className="chart-tip"><div className="chart-tip-val">{payload[0].value} load</div><div className="chart-tip-sub">{label}</div></div>);
              }}/>
              <Bar dataKey="load" fill="url(#loadGrad)" radius={[5,5,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {atlCtl.length>7&&(
        <div className="card a2" style={{padding:16,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <SH title="Fitness & Fatigue"/>
            <div style={{display:"flex",gap:5}}>
              {[30,60,90].map(d=><button key={d} className={"pill "+(atlRange===d?"on":"")} onClick={()=>setAtlRange(d)}>{d}d</button>)}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={atlCtl} margin={{top:4,right:4,bottom:0,left:-20}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false}/>
              <XAxis dataKey="date" tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false}
                tickFormatter={d=>d?d.slice(5):''}
                interval={Math.floor(atlCtl.length/4)}/>
              <YAxis tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false} width={32}/>
              <Tooltip cursor={{stroke:"rgba(255,255,255,.08)"}} content={({active,payload,label})=>{
                if(!active||!payload?.length)return null;
                const c=payload.find(p=>p.dataKey==='ctl'),a=payload.find(p=>p.dataKey==='atl');
                const form=c&&a?Math.round((c.value-a.value)*10)/10:null;
                return(
                  <div className="chart-tip">
                    <div style={{fontSize:'.7rem',color:'var(--tx3)',marginBottom:4}}>{label}</div>
                    {c&&<div style={{fontSize:'.76rem',color:'#3b82f6',fontWeight:600}}>Fitness: {c.value}</div>}
                    {a&&<div style={{fontSize:'.76rem',color:'#ef4444',fontWeight:600}}>Fatigue: {a.value}</div>}
                    {form!==null&&<div style={{fontSize:'.72rem',color:form>0?'var(--gn)':'var(--rd)',marginTop:3}}>Form: {form>0?'+':''}{form}</div>}
                  </div>
                );
              }}/>
              <Line dataKey="ctl" stroke="#3b82f6" dot={false} strokeWidth={2}/>
              <Line dataKey="atl" stroke="#ef4444" dot={false} strokeWidth={2}/>
            </LineChart>
          </ResponsiveContainer>
          <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:8}}>
            {[["#3b82f6","Fitness (CTL)"],["#ef4444","Fatigue (ATL)"]].map(([c,l])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
                <div style={{width:16,height:2,background:c,borderRadius:1}}/>
                <span style={{fontSize:".68rem",color:"var(--tx3)"}}>{l}</span>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center"}}>
            {(()=>{
              const last=atlCtl[atlCtl.length-1];
              const form=last?last.form:0;
              const label=form>10?"Peak Form":form>5?"Good Form":form<-10?"Heavy Load":form<-5?"Fatigued":"Neutral";
              return(
                <div style={{flex:1,fontSize:".74rem",textAlign:"center",padding:"6px 10px",borderRadius:9,
                  background:form>5?"var(--gn2)":form<-5?"var(--rd2)":"var(--s2)",
                  color:form>5?"var(--gn)":form<-5?"var(--rd)":"var(--tx2)",fontWeight:600}}>
                  {label} · Form: {form>0?"+":""}{form}
                </div>
              );
            })()}
            {acwr&&(
              <div style={{fontSize:".74rem",textAlign:"center",padding:"6px 12px",borderRadius:9,
                background:acwr.bg,color:acwr.color,fontWeight:700,whiteSpace:"nowrap",
                border:`1px solid ${acwr.color}33`}}>
                ACWR {acwr.ratio} · {acwr.label}
              </div>
            )}
          </div>
        </div>
      )}

      {paceHRData.length>2&&(
        <div className="card a2" style={{padding:16,marginBottom:14}}>
          <div style={{marginBottom:12}}>
            <SH title="Aerobic Efficiency"/>
            <div style={{fontSize:".7rem",color:"var(--tx3)",marginTop:4}}>Pace vs heart rate — faded dots are older runs</div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <ScatterChart margin={{top:4,right:8,bottom:0,left:-10}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)"/>
              <XAxis dataKey="hr" type="number" name="HR" unit=" bpm" domain={['auto','auto']}
                tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false}
                label={{value:"Heart Rate (bpm)",position:"insideBottom",offset:-2,fontSize:8,fill:"var(--tx3)"}}/>
              <YAxis dataKey="pace" type="number" name="Pace" reversed
                domain={['auto','auto']}
                tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false} width={40}
                tickFormatter={v=>fmtPaceMin(v)}/>
              <ZAxis range={[36,36]}/>
              <Tooltip
                cursor={{strokeDasharray:"3 3",stroke:"rgba(255,255,255,.12)"}}
                content={({active,payload})=>{
                  if(!active||!payload?.length)return null;
                  const d=payload[0]?.payload;
                  if(!d)return null;
                  return(
                    <div className="chart-tip">
                      <div className="chart-tip-val">{fmtPaceMin(d.pace)}/km</div>
                      <div className="chart-tip-sub">{d.hr} bpm · {d.km} km</div>
                      <div style={{fontSize:'.65rem',color:'var(--tx3)',marginTop:2}}>{d.date}</div>
                    </div>
                  );
                }}/>
              <Scatter data={paceHRData} shape={<ScatterDot/>}/>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="a2" style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <SH title="Personal Records"/>
          <span style={{fontSize:".68rem",color:"var(--tx3)"}}>Tap for Top 3</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {racePRs.map(pr=>{const best=pr.best;return(
            <div key={pr.cat} className="tap"
              style={{borderRadius:14,overflow:"hidden",border:"1.5px solid "+(best?pr.color+"45":"var(--bd)"),background:best?pr.color+"08":"var(--s2)",cursor:"pointer"}}
              onClick={()=>best&&onOpenPR({cat:{icon:"🏅",label:pr.cat,color:pr.color},top3:pr.top3||[],history:pr.history||[]})}>
              <div style={{padding:"12px 12px 8px",borderBottom:"1px solid "+(best?pr.color+"20":"var(--bd)")}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontSize:".6rem",fontWeight:700,color:best?pr.color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:4}}>{pr.cat}</div>
                    <div style={{fontSize:"1.2rem",fontWeight:800,color:best?pr.color:"var(--tx3)",fontFamily:"monospace",lineHeight:1}}>{best?fmtPace(best.avgPaceSecKm)+"/km":"--:--"}</div>
                  </div>
                  <span style={{fontSize:"1.1rem",opacity:best?1:.3}}>🏅</span>
                </div>
              </div>
              <div style={{padding:"8px 12px 10px"}}>
                {best?<div><div style={{fontSize:".74rem",fontWeight:600,color:"var(--tx)",marginBottom:2}}>{fmtKm(best.distanceKm)+" km"}</div><div style={{fontSize:".64rem",color:"var(--tx3)"}}>{fmtDateS(best.date)}</div></div>:<div style={{fontSize:".7rem",color:"var(--tx3)"}}>No record yet</div>}
              </div>
            </div>
          );})}
        </div>
        {!racePRs.length&&acts.length>0&&<div style={{marginTop:12,padding:"12px 14px",borderRadius:12,background:"var(--s2)",fontSize:".78rem",color:"var(--tx2)",lineHeight:1.7}}>Run near standard race distances (5K, 10K, 21K, 42K) to see PRs here.</div>}
      </div>

      {racePRs.length>0&&prHistory.length>1&&(
        <div className="card a3" style={{padding:16,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <SH title="PR Progression"/>
            <div style={{display:"flex",gap:5}}>
              {racePRs.map((pr,i)=>(
                <button key={pr.cat} className={"pill "+(prCatIdx===i?"on":"")}
                  style={{color:prCatIdx===i?pr.color:undefined,borderColor:prCatIdx===i?pr.color+'66':undefined}}
                  onClick={()=>setPrCatIdx(i)}>{pr.cat}</button>
              ))}
            </div>
          </div>
          {(()=>{
            const first=prHistory[0]?.paceSecKm;
            const last=prHistory[prHistory.length-1]?.paceSecKm;
            const impPct=first&&last?parseFloat(((first-last)/first*100).toFixed(1)):0;
            return(
              <>
                {impPct!==0&&(
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
                    <span style={{fontSize:".7rem",fontWeight:700,padding:"3px 10px",borderRadius:20,
                      color:impPct>0?'var(--gn)':'var(--rd)',
                      background:impPct>0?'var(--gn2)':'var(--rd2)'}}>
                      {impPct>0?'↑':'↓'} {Math.abs(impPct)}% {impPct>0?'faster':'slower'}
                    </span>
                    <span style={{fontSize:".68rem",color:"var(--tx3)"}}>{prHistory.length} races</span>
                  </div>
                )}
                <ResponsiveContainer width="100%" height={130}>
                  <LineChart data={prHistory} margin={{top:4,right:8,bottom:0,left:-10}}>
                    <defs>
                      <linearGradient id="prLineGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#8b5cf6"/>
                        <stop offset="100%" stopColor="#f97316"/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false}/>
                    <XAxis dataKey="date" tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false}
                      tickFormatter={d=>d?d.slice(5):''}/>
                    <YAxis reversed tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false} width={40}
                      tickFormatter={v=>fmtPaceMin(v)} domain={['auto','auto']}/>
                    <Tooltip content={({active,payload,label})=>{
                      if(!active||!payload?.length)return null;
                      return(
                        <div className="chart-tip">
                          <div className="chart-tip-val">{fmtPace(payload[0].value)}/km</div>
                          <div className="chart-tip-sub">{label}</div>
                        </div>
                      );
                    }}/>
                    <Line dataKey="paceSecKm" stroke="url(#prLineGrad)" strokeWidth={2.5}
                      dot={{fill:prForProgression?.color||'#f97316',r:4,strokeWidth:0}}
                      activeDot={{r:6,fill:prForProgression?.color||'#f97316',strokeWidth:0}}/>
                  </LineChart>
                </ResponsiveContainer>
              </>
            );
          })()}
        </div>
      )}

      {vo2maxEst&&(
        <div className="card a3" style={{padding:16,marginBottom:14}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <SH title="VO₂max Estimate"/>
            <span style={{fontSize:'.72rem',fontWeight:700,padding:'3px 10px',borderRadius:20,
              color:vo2maxEst.color,background:vo2maxEst.color+'22',border:`1px solid ${vo2maxEst.color}44`}}>
              {vo2maxEst.label}
            </span>
          </div>
          <div style={{display:'flex',alignItems:'flex-end',gap:6,marginBottom:14}}>
            <div style={{fontSize:'2.6rem',fontWeight:800,color:vo2maxEst.color,lineHeight:1,letterSpacing:'-.02em'}}>{vo2maxEst.vo2max}</div>
            <div style={{fontSize:'.62rem',color:'var(--tx3)',paddingBottom:5,letterSpacing:'.04em'}}>ml / kg / min</div>
          </div>
          <div style={{position:'relative',marginBottom:16}}>
            <div style={{height:8,borderRadius:4,background:'linear-gradient(90deg,#9ca3af 0%,#3b82f6 25%,#22c55e 45%,#f97316 65%,#8b5cf6 82%,#f59e0b 100%)'}}/>
            <div style={{
              position:'absolute',top:-3,
              left:`${Math.min(97,Math.max(3,(vo2maxEst.vo2max-30)/40*100))}%`,
              transform:'translateX(-50%)',
              width:14,height:14,borderRadius:7,
              background:vo2maxEst.color,border:'2.5px solid var(--bg)',
              boxShadow:'0 0 0 1.5px '+vo2maxEst.color,
            }}/>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:5,fontSize:'.6rem',color:'var(--tx3)'}}>
              <span>30</span><span>40</span><span>50</span><span>60</span><span>70+</span>
            </div>
          </div>
          {vo2maxEst.estimates.length>1&&(
            <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:8}}>
              {vo2maxEst.estimates.map(e=>(
                <div key={e.cat} style={{fontSize:'.7rem',fontWeight:e.cat===vo2maxEst.basedOn?700:400,color:e.cat===vo2maxEst.basedOn?'var(--tx)':'var(--tx3)'}}>
                  {e.cat}: <span style={{color:e.cat===vo2maxEst.basedOn?vo2maxEst.color:'var(--tx2)'}}>{e.vo2max}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{fontSize:'.68rem',color:'var(--tx3)'}}>Jack Daniels VDOT from {vo2maxEst.basedOn} PR · ±3 ml/kg/min accuracy</div>
        </div>
      )}

      {hrZonesAgg&&(
        <div className="card a3" style={{padding:16,marginBottom:14}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <SH title="HR Zone Distribution"/>
            <span style={{fontSize:'.68rem',color:'var(--tx3)'}}>{hrZonesAgg.totalHrs}h total</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:16}}>
            <div style={{position:'relative',width:140,height:140,flexShrink:0}}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={hrZonesAgg.zones} cx="50%" cy="50%" innerRadius="52%" outerRadius="75%"
                    paddingAngle={2} dataKey="minutes" startAngle={90} endAngle={-270}>
                    {hrZonesAgg.zones.map((z,i)=><Cell key={i} fill={z.color} strokeWidth={0}/>)}
                  </Pie>
                  <Tooltip content={({active,payload})=>{
                    if(!active||!payload?.length)return null;
                    const z=payload[0].payload;
                    return(
                      <div className="chart-tip">
                        <div className="chart-tip-val" style={{color:z.color}}>{z.label}</div>
                        <div className="chart-tip-sub">{z.minutes}m · {z.pct}%</div>
                      </div>
                    );
                  }}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center',pointerEvents:'none'}}>
                <div style={{fontSize:'1.3rem',fontWeight:800,lineHeight:1,color:'var(--tx)'}}>{hrZonesAgg.totalHrs}</div>
                <div style={{fontSize:'.58rem',color:'var(--tx3)',marginTop:2}}>hours</div>
              </div>
            </div>
            <div style={{flex:1,display:'flex',flexDirection:'column',gap:7}}>
              {hrZonesAgg.zones.map(z=>(
                <div key={z.zone}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                    <span style={{fontSize:'.7rem',fontWeight:600,color:z.color}}>{z.label}</span>
                    <span style={{fontSize:'.68rem',color:'var(--tx3)'}}>{z.pct}%</span>
                  </div>
                  <div style={{height:4,borderRadius:2,background:'var(--bd)',overflow:'hidden'}}>
                    <div style={{height:'100%',borderRadius:2,background:z.color,width:z.pct+'%',transition:'width .4s ease'}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {predictions.length>0&&(()=>{
        const p0=predictions[0];
        const pctAdj=Math.round((1-p0.formFactor)*100);
        return(
          <div className="card a2" style={{padding:16,marginBottom:14}}>
            <SH title="Pace Predictor"/>
            <div style={{display:"flex",alignItems:"center",gap:6,margin:"6px 0 12px",flexWrap:"wrap"}}>
              <span style={{fontSize:".72rem",color:"var(--tx3)"}}>
                {p0.usingRecent?"Last 6 months":"All-time best"} · Riegel from {p0.source}
              </span>
              {pctAdj!==0&&(
                <span style={{fontSize:".64rem",fontWeight:700,padding:"2px 7px",borderRadius:20,
                  color:pctAdj>0?"var(--gn)":"var(--rd)",
                  background:pctAdj>0?"var(--gn2)":"var(--rd2)"}}>
                  {pctAdj>0?"⚡":"😓"} Form {pctAdj>0?"+":""}{pctAdj}%
                </span>
              )}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {predictions.map(p=>(
                <div key={p.cat} style={{borderRadius:10,padding:"10px 12px",
                  border:p.isBase?"1.5px solid rgba(249,115,22,.4)":"1px solid var(--bd)",
                  background:p.isBase?"rgba(249,115,22,.06)":"var(--s2)"}}>
                  <div style={{fontSize:".6rem",fontWeight:700,color:p.isBase?"var(--or)":"var(--tx3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>
                    {p.cat}{p.isBase?" · actual":""}
                  </div>
                  <div style={{fontSize:"1.05rem",fontWeight:800,fontFamily:"monospace",color:p.isBase?"var(--or)":"var(--tx)"}}>{fmtDur(p.predictedSec)}</div>
                  {p.actualSec&&!p.isBase&&<div style={{fontSize:".62rem",color:"var(--gn)",marginTop:2}}>Actual: {fmtDur(p.actualSec)}</div>}
                  {pctAdj!==0&&!p.isBase&&<div style={{fontSize:".6rem",color:"var(--tx3)",marginTop:1}}>Base: {fmtDur(p.rawSec)}</div>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {overallPRs&&(
        <div className="card a3" style={{padding:16,marginBottom:14}}>
          <SH title="Overall Bests"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[{l:"Longest",v:fmtKm(overallPRs.longest&&overallPRs.longest.distanceKm||0)+" km",c:"var(--or)",sub:overallPRs.longest?fmtDateS(overallPRs.longest.date):""},
              {l:"Best Pace",v:fmtPace(overallPRs.fastest&&overallPRs.fastest.avgPaceSecKm||0)+"/km",c:"var(--bl)",sub:overallPRs.fastest?fmtDateS(overallPRs.fastest.date):""}].map(s=>(
              <div key={s.l} className="card2" style={{padding:"13px 11px"}}>
                <div style={{fontSize:"var(--fs-xs)",color:"var(--tx3)",marginBottom:6,letterSpacing:".04em"}}>{s.l}</div>
                <div style={{fontSize:"var(--fs-xl)",fontWeight:700,color:s.c,lineHeight:1}}>{s.v}</div>
                <div style={{fontSize:"var(--fs-xs)",color:"var(--tx3)",marginTop:5}}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {shoes.filter(s=>s.active!==false).length>0&&(
        <div className="card" style={{padding:16,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <SH title="Shoes"/>
            <button className="pill" style={{fontSize:".68rem"}} onClick={onManageShoes}>Manage</button>
          </div>
          {shoes.filter(s=>s.active!==false).map(shoe=>{
            const km=shoeKm[shoe.id]||0,pct=Math.min(1,km/(shoe.maxKm||DEFAULT_SHOE_MAX_KM)),warn=pct>=SHOE_WARN_THRESHOLD;
            return(
              <div key={shoe.id} style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:".82rem",fontWeight:600}}>{shoe.name}</span>
                  <span style={{fontSize:".74rem",color:warn?"var(--rd)":"var(--tx2)",fontWeight:warn?700:400}}>{Math.round(km)}/{shoe.maxKm||DEFAULT_SHOE_MAX_KM} km</span>
                </div>
                <div style={{height:6,borderRadius:3,background:"var(--bd)",overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:3,background:warn?"var(--rd)":shoe.color||"var(--or)",width:(pct*100)+"%"}}/>
                </div>
                {warn&&<div style={{fontSize:".68rem",color:"var(--rd)",marginTop:3}}>⚠️ Replace soon</div>}
              </div>
            );
          })}
        </div>
      )}

      {races.length>0&&(
        <div className="card" style={{padding:16,marginBottom:14}}>
          <SH title="Races"/>
          {races.slice(0,5).map((r,i)=>(
            <div key={r.id} style={{padding:"9px 0",borderBottom:i<Math.min(races.length,5)-1?"1px solid var(--bd)":"none"}}>
              <div style={{fontWeight:600,fontSize:".84rem",marginBottom:3}}>🏁 {r.name}</div>
              <div style={{fontSize:".72rem",color:"var(--tx2)"}}>{fmtDateS(r.date)} · {fmtKm(r.distanceKm)} km · {fmtPace(r.avgPaceSecKm)}/km</div>
              {r.raceGoalSec&&<div style={{fontSize:".7rem",color:"var(--or)",marginTop:2}}>Goal: {fmtDur(r.raceGoalSec)}</div>}
            </div>
          ))}
        </div>
      )}

      {runs.length>0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}><button className="btn b-gh" style={{padding:"12px",fontSize:".78rem"}} onClick={onViewAll}>All Runs</button><button className="btn b-gh" style={{padding:"12px",fontSize:".78rem"}} onClick={onViewMonthly}>Monthly</button><button className="btn b-gh" style={{padding:"12px",fontSize:".78rem"}} onClick={onViewYearReview}>Year</button></div>}
      {!runs.length&&<div style={{textAlign:"center",padding:"56px 0",color:"var(--tx2)"}}><div style={{fontSize:"2.8rem",marginBottom:14}}>📊</div><div style={{fontWeight:700,fontSize:"var(--fs-base)",marginBottom:6,color:"var(--tx)"}}>Your stats start here</div><div style={{fontSize:".8rem",lineHeight:1.6}}>Upload a GPX or sync Strava to see your distance, pace, and PRs.</div></div>}
    </div>
  );
}
