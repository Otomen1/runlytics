import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { SH } from '../common/SH.jsx';
import { fmtKm, fmtDur, fmtPace, fmtDateS } from '../../utils/formatters.js';
import { computeRacePRs } from '../../utils/analytics.js';

export function StatsTab({acts,analytics,onViewAll,onViewMonthly,onOpenPR,onViewYearReview}){
  const[range,setRange]=useState(8);
  const runs=acts.filter(a=>a.type==="Run"||a.type==="Walk");
  const totalKm=runs.reduce((s,a)=>s+a.distanceKm,0);
  const weeklyData=(analytics.weeklyKm||[]).slice(-range);
  const racePRs=useMemo(()=>computeRacePRs(acts),[acts]);
  const overallPRs=runs.length?{
    longest:runs.reduce((b,r)=>r.distanceKm>b.distanceKm?r:b),
    fastest:runs.filter(r=>r.avgPaceSecKm>0).reduce((b,r)=>r.avgPaceSecKm<b.avgPaceSecKm?r:b,runs.find(r=>r.avgPaceSecKm>0)||runs[0])
  }:null;
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
      {runs.length>0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}><button className="btn b-gh" style={{padding:"12px",fontSize:".78rem"}} onClick={onViewAll}>All Runs</button><button className="btn b-gh" style={{padding:"12px",fontSize:".78rem"}} onClick={onViewMonthly}>Monthly</button><button className="btn b-gh" style={{padding:"12px",fontSize:".78rem"}} onClick={onViewYearReview}>Year</button></div>}
      {!runs.length&&<div style={{textAlign:"center",padding:"56px 0",color:"var(--tx2)"}}><div style={{fontSize:"2.8rem",marginBottom:14}}>📊</div><div style={{fontWeight:700,fontSize:"var(--fs-base)",marginBottom:6,color:"var(--tx)"}}>Your stats start here</div><div style={{fontSize:".8rem",lineHeight:1.6}}>Upload a GPX or sync Strava to see your distance, pace, and PRs.</div></div>}
    </div>
  );
}

