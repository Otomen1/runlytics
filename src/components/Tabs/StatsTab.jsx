import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { SH } from '../common/SH.jsx';
import { fmtKm, fmtDur, fmtPace, fmtDateS } from '../../utils/formatters.js';
import { computeRacePRs, computeAtlCtl, predictRaceTimes } from '../../utils/analytics.js';
import { SHOES_KEY } from '../../constants/keys.js';
import { DEFAULT_SHOE_MAX_KM, SHOE_WARN_THRESHOLD } from '../../constants/limits.js';

export function StatsTab({acts,analytics,onViewAll,onViewMonthly,onOpenPR,onViewYearReview,onManageShoes}){
  const[range,setRange]=useState(8);
  const[atlRange,setAtlRange]=useState(90);
  const runs=acts.filter(a=>a.type==="Run"||a.type==="Walk");
  const totalKm=runs.reduce((s,a)=>s+a.distanceKm,0);
  const weeklyData=(analytics.weeklyKm||[]).slice(-range);
  const racePRs=useMemo(()=>computeRacePRs(acts),[acts]);
  const atlCtl=useMemo(()=>computeAtlCtl(acts,atlRange),[acts,atlRange]);
  const predictions=useMemo(()=>predictRaceTimes(racePRs),[racePRs]);
  const races=useMemo(()=>acts.filter(a=>a.isRace).sort((a,b)=>b.dateTs-a.dateTs),[acts]);
  const shoes=useMemo(()=>{try{return JSON.parse(localStorage.getItem(SHOES_KEY)||'[]');}catch{return[];}}, []);
  const shoeKm=useMemo(()=>{const m={};acts.forEach(a=>{if(a.shoeId)m[a.shoeId]=(m[a.shoeId]||0)+a.distanceKm;});return m;},[acts]);
  const overallPRs=runs.length?{
    longest:runs.reduce((b,r)=>r.distanceKm>b.distanceKm?r:b),
    fastest:runs.filter(r=>r.avgPaceSecKm>0).reduce((b,r)=>r.avgPaceSecKm<b.avgPaceSecKm?r:b,runs.find(r=>r.avgPaceSecKm>0)||runs[0])
  }:null;
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
      {weeklyData.length>1&&(
        <div className="card a1" style={{padding:16,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <SH title="Weekly Distance"/>
            <div style={{display:"flex",gap:5}}>
              {[4,8,12].map(w=><button key={w} className={"pill "+(range===w?"on":"")} onClick={()=>setRange(w)}>{w}w</button>)}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={148}>
            <BarChart data={weeklyData} barSize={18} margin={{top:4,right:4,bottom:0,left:-20}}>
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.9}/>
                  <stop offset="100%" stopColor="#ea580c" stopOpacity={0.65}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false}/>
              <XAxis dataKey="week" tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false}
                tickFormatter={w=>w?w.slice(5):''}/>
              <YAxis tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false} width={32}/>
              <Tooltip
                cursor={{fill:"rgba(255,255,255,.04)"}}
                content={({active,payload,label})=>{
                  if(!active||!payload||!payload.length)return null;
                  return(
                    <div className="chart-tip">
                      <div className="chart-tip-val">{payload[0].value} km</div>
                      <div className="chart-tip-sub">{label}</div>
                    </div>
                  );
                }}/>
              <Bar dataKey="km" fill="url(#barGrad)" radius={[5,5,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {weeklyData.length>1&&weeklyData.some(w=>w.load>0)&&(
        <div className="card a2" style={{padding:16,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <SH title="Training Load"/>
            <span style={{fontSize:".68rem",color:"var(--tx3)"}}>last {range} weeks</span>
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={weeklyData} barSize={18} margin={{top:4,right:4,bottom:0,left:-20}}>
              <defs>
                <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9}/>
                  <stop offset="100%" stopColor="#6d28d9" stopOpacity={0.65}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false}/>
              <XAxis dataKey="week" tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false}
                tickFormatter={w=>w?w.slice(5):''}/>
              <YAxis tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false} width={32}/>
              <Tooltip
                cursor={{fill:"rgba(255,255,255,.04)"}}
                content={({active,payload,label})=>{
                  if(!active||!payload||!payload.length)return null;
                  return(
                    <div className="chart-tip">
                      <div className="chart-tip-val">{payload[0].value} load</div>
                      <div className="chart-tip-sub">{label}</div>
                    </div>
                  );
                }}/>
              <Bar dataKey="load" fill="url(#loadGrad)" radius={[5,5,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
          <div style={{fontSize:".72rem",color:"var(--tx3)",marginTop:6,textAlign:"center"}}>Training stress based on distance × effort</div>
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
                if(!active||!payload||!payload.length)return null;
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
          {(()=>{
            const last=atlCtl[atlCtl.length-1];
            const form=last?last.form:0;
            const label=form>10?"Peak Form":form>5?"Good Form":form<-10?"Heavy Load":form<-5?"Fatigued":"Neutral";
            return(
              <div style={{marginTop:8,fontSize:".74rem",textAlign:"center",padding:"6px 10px",borderRadius:9,
                background:form>5?"var(--gn2)":form<-5?"var(--rd2)":"var(--s2)",
                color:form>5?"var(--gn)":form<-5?"var(--rd)":"var(--tx2)",fontWeight:600}}>
                {label} · Form: {form>0?"+":""}{form}
              </div>
            );
          })()}
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
      {predictions.length>0&&(
        <div className="card a2" style={{padding:16,marginBottom:14}}>
          <SH title="Pace Predictor"/>
          <div style={{fontSize:".72rem",color:"var(--tx3)",margin:"6px 0 12px"}}>Riegel formula based on your {predictions[0].source} PR</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {predictions.map(p=>(
              <div key={p.cat} style={{borderRadius:10,padding:"10px 12px",
                border:p.isBase?"1.5px solid rgba(249,115,22,.4)":"1px solid var(--bd)",
                background:p.isBase?"rgba(249,115,22,.06)":"var(--s2)"}}>
                <div style={{fontSize:".6rem",fontWeight:700,color:p.isBase?"var(--or)":"var(--tx3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>
                  {p.cat}{p.isBase?" · actual":""}
                </div>
                <div style={{fontSize:"1.05rem",fontWeight:800,fontFamily:"monospace",color:p.isBase?"var(--or)":"var(--tx)"}}>{fmtDur(p.predictedSec)}</div>
                {p.actualSec&&!p.isBase&&<div style={{fontSize:".62rem",color:"var(--gn)",marginTop:3}}>Actual: {fmtDur(p.actualSec)}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
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

