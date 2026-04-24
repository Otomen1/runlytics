// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

const STORAGE_KEY    = "runlytics_data_v1";
const GOALS_KEY      = "runlytics_goals_v1";
const HR_PROFILE_KEY = "runlytics_hr_profile_v1";
const TASKS_KEY      = "runlytics_tasks_v2";
const PROFILE_KEY    = "runlytics_profile_v1";
const SCHEMA_VER     = "1.0";
const LEGACY_KEYS    = ["runlytics_v8","runlytics_activities_v2","runlytics_v7"];

const ACTIVITY_DEFAULTS = {
  id:null,name:"Unnamed Run",type:"Run",runClass:"Easy",
  date:new Date().toISOString(),dateTs:Date.now(),
  startTimeLocal:null,endTimeLocal:null,startDateLocal:null,hasTimestamps:false,
  distanceM:0,distanceKm:0,movingTimeSec:0,totalTimeSec:0,
  avgPaceSecKm:null,avgSpeedKmh:0,elevGainM:0,elevLossM:0,
  avgHR:null,maxHR:null,avgCad:null,hrSamples:[],hrMaxUsed:null,
  trainingLoad:0,loadLabel:"Easy",loadColor:"#22c55e",
  pointCount:0,kmSplits:[],splitInsight:null,elevProfile:[],speedChart:[],
  hrZones:null,bestEfforts:{},route:[],bounds:null,parsedAt:Date.now(),
};

function migrateActivity(raw) {
  if (!raw||typeof raw!=="object") return null;
  const m = {...ACTIVITY_DEFAULTS,...raw};
  if (!m.id) m.id = `migrated_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  if (!m.dateTs||isNaN(m.dateTs)) m.dateTs = raw.date ? new Date(raw.date).getTime() : Date.now();
  if (!m.distanceKm&&m.distanceM) m.distanceKm = parseFloat((m.distanceM/1000).toFixed(2));
  ["kmSplits","elevProfile","speedChart","route"].forEach(k=>{ if(!Array.isArray(m[k])) m[k]=[]; });
  return m;
}

function loadActs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p?.version&&Array.isArray(p.data)) return p.data.map(migrateActivity).filter(Boolean);
      if (Array.isArray(p)) { const m=p.map(migrateActivity).filter(Boolean); saveActs(m); return m; }
    }
    for (const k of LEGACY_KEYS) {
      const lr = localStorage.getItem(k);
      if (!lr) continue;
      try {
        const lp = JSON.parse(lr);
        const src = Array.isArray(lp)?lp:(lp?.data&&Array.isArray(lp.data))?lp.data:null;
        if (src?.length) { const m=src.map(migrateActivity).filter(Boolean); saveActs(m); return m; }
      } catch {}
    }
    return [];
  } catch { return []; }
}
function saveActs(a) {
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify({version:SCHEMA_VER,savedAt:Date.now(),data:Array.isArray(a)?a:[]})); }
  catch(e) { if(e.name==="QuotaExceededError") console.error("[Runlytics] Storage full"); }
}

function loadGoals() {
  try { return {...{weekly:30,monthly:120},...JSON.parse(localStorage.getItem(GOALS_KEY)||"{}")}; }
  catch { return {weekly:30,monthly:120}; }
}
function saveGoals(g) { try { localStorage.setItem(GOALS_KEY,JSON.stringify(g)); } catch {} }

function loadHRProfile() {
  try { return {...{age:null,restingHR:null,maxHROverride:null},...JSON.parse(localStorage.getItem(HR_PROFILE_KEY)||"{}")}; }
  catch { return {age:null,restingHR:null,maxHROverride:null}; }
}
function saveHRProfile(p) { try { localStorage.setItem(HR_PROFILE_KEY,JSON.stringify(p)); } catch {} }

function loadProfile() {
  try { return {...{name:"Runner"},...JSON.parse(localStorage.getItem(PROFILE_KEY)||"{}")}; }
  catch { return {name:"Runner"}; }
}
function saveProfile(p) { try { localStorage.setItem(PROFILE_KEY,JSON.stringify(p)); } catch {} }

function getMafHR(hrProfile, activityMaxHR) {
  if (hrProfile?.maxHROverride) { const v=Number(hrProfile.maxHROverride); if(v>=100&&v<=220) return v; }
  if (hrProfile?.age) { const a=Number(hrProfile.age); if(a>=10&&a<=100) return Math.round(180-a); }
  if (activityMaxHR&&activityMaxHR>=130&&activityMaxHR<=215) return activityMaxHR;
  return 145;
}

function getMafZones(mafHR) {
  return [
    {zone:"Z1",label:"Recovery",  lo:0,         hi:mafHR-10,  color:"#3b82f6"},
    {zone:"Z2",label:"Aerobic",   lo:mafHR-10,  hi:mafHR,     color:"#22c55e"},
    {zone:"Z3",label:"Moderate",  lo:mafHR,     hi:mafHR+10,  color:"#eab308"},
    {zone:"Z4",label:"Hard",      lo:mafHR+10,  hi:mafHR+20,  color:"#f97316"},
    {zone:"Z5",label:"Max",       lo:mafHR+20,  hi:999,       color:"#ef4444"},
  ];
}

function computeZones(hrSamples, mafHR) {
  if (!hrSamples?.length||!mafHR) return null;
  const valid = hrSamples.filter(x=>x.hr>0&&x.sec>0);
  if (!valid.length) return null;
  const totalSec = valid.reduce((s,x)=>s+x.sec,0);
  if (!totalSec) return null;
  const defs = getMafZones(mafHR);
  const secs = defs.map(z=>valid.reduce((a,x)=>(x.hr>=z.lo&&x.hr<z.hi?a+x.sec:a),0));
  const rawP = secs.map(s=>s/totalSec*100);
  const fl   = rawP.map(Math.floor);
  const rem  = 100-fl.reduce((a,b)=>a+b,0);
  rawP.map((p,i)=>({i,f:p-Math.floor(p)})).sort((a,b)=>b.f-a.f).slice(0,rem).forEach(({i})=>fl[i]++);
  return defs.map((z,i)=>({...z,pct:Math.max(0,fl[i]),minutes:parseFloat((secs[i]/60).toFixed(1)),bpmLo:Math.round(z.lo),bpmHi:z.hi===999?null:Math.round(z.hi)}));
}

function getMafCoachingInsight(acts, hrProfile) {
  const mafHR = getMafHR(hrProfile, null);
  const runsWithHR = acts.filter(a=>a.avgHR&&a.distanceKm>0).slice(-5);
  if (!runsWithHR.length) return { type:"neutral", title:"Set up your HR profile", detail:"Enter your age in HR Insights to unlock MAF-based coaching.", action:"Go to HR Insights →" };

  const aboveMaf = runsWithHR.filter(a=>a.avgHR>mafHR).length;
  const ratio = aboveMaf/runsWithHR.length;
  const avgHR = Math.round(runsWithHR.reduce((s,a)=>s+a.avgHR,0)/runsWithHR.length);

  if (ratio>=0.6)
    return { type:"warning", title:"Training too hard", detail:`${Math.round(ratio*100)}% of recent runs exceeded your MAF HR (${mafHR} bpm). This limits aerobic development.`, action:"Slow down on next run →", mafHR, avgHR };
  if (ratio<=0.2)
    return { type:"positive", title:"Great aerobic training", detail:`You're staying below MAF HR consistently. This builds the aerobic base that makes you faster long-term.`, action:"Keep it up →", mafHR, avgHR };
  return { type:"info", title:"Mixed intensity", detail:`Some runs above MAF (${mafHR} bpm). Aim for 80% of runs to be below MAF for optimal aerobic development.`, action:"See HR breakdown →", mafHR, avgHR };
}

function getTodayRecommendation(acts, hrProfile) {
  const mafHR = getMafHR(hrProfile, null);
  const sorted = [...acts].sort((a,b) => b.dateTs - a.dateTs);
  const last = sorted[0] || null;
  const now = Date.now();
  const daysSinceLast = last ? Math.floor((now - last.dateTs) / 86400000) : 999;
  const recent = sorted.slice(0, 5);
  const avgLoad = recent.length ? recent.reduce((s,r)=>s+(r.trainingLoad||0),0)/recent.length : 0;
  const highLoadStreak = recent.length >= 3 && recent.slice(0,3).every(r=>(r.trainingLoad||0)>65);
  const runsWithHR = recent.filter(r=>r.avgHR);
  const hrRatio = runsWithHR.length ? runsWithHR.filter(r=>r.avgHR>mafHR).length/runsWithHR.length : 0;
  if (!acts.length) return { icon:"👟", title:"Upload your first run", sub:"Import a GPX file to start coaching.", type:"neutral" };
  if (highLoadStreak) return { icon:"😴", title:"Rest or recover today", sub:"3 hard sessions in a row — your body needs recovery.", type:"warning" };
  if (hrRatio >= 0.6 && last?.avgHR) return { icon:"💚", title:"Easy run today", sub:`Stay below ${mafHR} bpm to build aerobic base.`, type:"positive" };
  if (daysSinceLast >= 3) return { icon:"🏃", title:"Time to run again", sub:`${daysSinceLast} days off — an easy run keeps consistency.`, type:"info" };
  if (daysSinceLast >= 2) return { icon:"🏃", title:"Easy run recommended", sub:"2 days rest — a light aerobic run today is ideal.", type:"info" };
  if (hrRatio <= 0.2 && runsWithHR.length >= 3) return { icon:"📈", title:"You're building well", sub:"Consistent aerobic pace — keep it up.", type:"positive" };
  if (avgLoad > 70) return { icon:"⚡", title:"High load this week", sub:"Consider rest or recovery today.", type:"warning" };
  return { icon:"✅", title:"Stay consistent", sub:"Your training is on track. Keep the aerobic pace.", type:"neutral" };
}

function getRunFeedback(run, mafHR) {
  if (!run) return null;
  const { avgHR, trainingLoad, splitInsight, distanceKm } = run;
  const feedbacks = [];
  if (avgHR && avgHR <= mafHR)
    feedbacks.push({ type:"positive", icon:"💚", title:"Good aerobic run", detail:"You stayed at or below MAF — perfect for endurance building." });
  else if (avgHR && avgHR > mafHR)
    feedbacks.push({ type:"warning", icon:"⚠️", title:"Above MAF HR", detail:`Avg ${avgHR} bpm exceeded your MAF (${mafHR} bpm). Slow down next time.` });
  if (splitInsight?.splitType === "negative")
    feedbacks.push({ type:"positive", icon:"⬆️", title:"Great pacing", detail:"Negative split — you ran the second half faster. Excellent control." });
  else if (splitInsight?.splitType === "positive")
    feedbacks.push({ type:"info", icon:"⬇️", title:"Started too fast", detail:"Positive split — try starting easier and building pace." });
  if ((trainingLoad||0) > 70)
    feedbacks.push({ type:"warning", icon:"🔥", title:"High training load", detail:"This was a tough session. Prioritise sleep and recovery." });
  if (!avgHR)
    feedbacks.push({ type:"neutral", icon:"📊", title:"No HR data", detail:"Upload from a HR-enabled watch to unlock MAF coaching." });
  return feedbacks.length ? feedbacks : [{ type:"positive", icon:"✅", title:"Run saved", detail:`${distanceKm?.toFixed(1)} km logged successfully.` }];
}

function parseGPX(xmlText, fileName, hrProfile=null) {
  const doc = new DOMParser().parseFromString(xmlText,"application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid GPX file");
  const nameEl=doc.querySelector("trk > name")||doc.querySelector("name");
  const typeEl=doc.querySelector("trk > type")||doc.querySelector("type");
  const rawName=nameEl?.textContent?.trim()||fileName.replace(/\.gpx$/i,"");
  const rawType=(typeEl?.textContent?.trim()||"running").toLowerCase();
  const typeMap={running:"Run",run:"Run",9:"Run",cycling:"Ride",biking:"Ride",ride:"Ride",1:"Ride",walking:"Walk",walk:"Walk",swimming:"Swim",hiking:"Hike"};
  const actType=typeMap[rawType]||typeMap[rawType.split(" ")[0]]||"Run";

  let pts=Array.from(doc.querySelectorAll("trkpt")).map(p=>({
    lat:parseFloat(p.getAttribute("lat")),lon:parseFloat(p.getAttribute("lon")),
    ele:parseFloat(p.querySelector("ele")?.textContent||"0")||0,
    time:p.querySelector("time")?.textContent||null,
    hr:parseInt(p.querySelector("extensions hr, TrackPointExtension hr, heartrate")?.textContent||"0")||null,
    cad:parseInt(p.querySelector("extensions cad, cadence, TrackPointExtension cad")?.textContent||"0")||null,
  })).filter(p=>!isNaN(p.lat)&&!isNaN(p.lon));
  if (pts.length<2) throw new Error("Not enough GPS points");
  pts=pts.filter((p,i)=>i===0||p.lat!==pts[i-1].lat||p.lon!==pts[i-1].lon);

  const hav=(a,b)=>{const R=6371000,dL=(b.lat-a.lat)*Math.PI/180,dl=(b.lon-a.lon)*Math.PI/180,x=Math.sin(dL/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dl/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));};

  if (pts.some(p=>p.ele>0)){const k=[0.1,0.2,0.4,0.2,0.1],r=pts.map(p=>p.ele);for(let i=2;i<pts.length-2;i++)pts[i].ele=k.reduce((s,w,j)=>s+w*r[i-2+j],0);}

  let totalDist=0,elevGain=0,elevLoss=0,pending=0;
  const segs=[];
  for(let i=1;i<pts.length;i++){
    const dist=hav(pts[i-1],pts[i]),dt=pts[i].time&&pts[i-1].time?(new Date(pts[i].time)-new Date(pts[i-1].time))/1000:0;
    pending+=pts[i].ele-pts[i-1].ele;
    if(Math.abs(pending)>=3){if(pending>0)elevGain+=pending;else elevLoss+=Math.abs(pending);pending=0;}
    totalDist+=dist;segs.push({dist,totalDist,dt,ele:pts[i].ele,speed:(dt>0&&dt<300)?dist/dt:0,hr:pts[i].hr});
  }
  const movingTime=segs.filter(s=>s.dt>0&&s.dt<120||s.speed>0.5).reduce((a,s)=>a+s.dt,0);
  const totalTime=segs.reduce((a,s)=>a+s.dt,0);

  const kmSplits=[];let bD=0,bT=0,bHR=[],kk=1;
  for(const s of segs){bD+=s.dist;if(s.dt>0&&s.dt<120)bT+=s.dt;if(s.hr)bHR.push(s.hr);if(bD>=1000){kmSplits.push({km:kk,pace:bT/(bD/1000),hr:bHR.length?Math.round(bHR.reduce((a,b)=>a+b)/bHR.length):null});kk++;bD=0;bT=0;bHR=[];}}

  const sp=Math.max(1,Math.floor(segs.length/100));
  const elevProfile=segs.filter((_,i)=>i%sp===0).map(s=>({km:parseFloat((s.totalDist/1000).toFixed(2)),ele:Math.round(s.ele)}));
  const ss=Math.max(1,Math.floor(segs.length/60));
  const speedChart=segs.filter((_,i)=>i%ss===0&&segs[i].speed>0).map(s=>({km:parseFloat((s.totalDist/1000).toFixed(2)),pace:s.speed>0?parseFloat((1000/s.speed/60).toFixed(2)):null})).filter(p=>p.pace&&p.pace<20);

  const hrVals=segs.map(s=>s.hr).filter(Boolean);
  const avgHR=hrVals.length?Math.round(hrVals.reduce((a,b)=>a+b)/hrVals.length):null;
  const actMaxHR=hrVals.length?Math.max(...hrVals):null;
  const mafHR=getMafHR(hrProfile,actMaxHR);
  const hrSampleStep=Math.max(1,Math.floor(segs.length/300));
  const hrSamples=segs.filter((_,i)=>i%hrSampleStep===0).filter(s=>s.hr&&s.dt>0&&s.dt<120).map(s=>({hr:s.hr,sec:s.dt*hrSampleStep}));
  const hrSegsAll=segs.filter(s=>s.hr&&s.dt>0&&s.dt<120);
  const hrZones=hrSegsAll.length>0?computeZones(hrSegsAll.map(s=>({hr:s.hr,sec:s.dt})),mafHR):null;

  const splitInsight=kmSplits.length>=2?(()=>{const fh=kmSplits.slice(0,Math.floor(kmSplits.length/2)),sh=kmSplits.slice(Math.floor(kmSplits.length/2)),af=fh.reduce((s,k)=>s+k.pace,0)/fh.length,as=sh.reduce((s,k)=>s+k.pace,0)/sh.length;const ap=kmSplits.reduce((s,k)=>s+k.pace,0)/kmSplits.length,cv=Math.sqrt(kmSplits.reduce((s,k)=>s+Math.pow(k.pace-ap,2),0)/kmSplits.length)/ap;return{splitType:as<af?"negative":as>af*1.03?"positive":"even",firstAvg:af,secondAvg:as,consistencyScore:Math.max(0,Math.round(100-cv*500))};})():null;

  const cadVals=pts.map(p=>p.cad).filter(Boolean);
  const avgCad=cadVals.length?Math.round(cadVals.reduce((a,b)=>a+b)/cadVals.length):null;

  const BE={};
  for(const [n,tgt] of Object.entries({"1km":1000,"5km":5000,"10km":10000,"HM":21097,"Marathon":42195})){if(totalDist<tgt*.95)continue;let best=null,lo=0,cd=0;for(let hi=0;hi<segs.length;hi++){cd+=segs[hi].dist;while(cd-segs[lo].dist>tgt&&lo<hi){cd-=segs[lo].dist;lo++;}if(Math.abs(cd-tgt)<tgt*.05){const t=segs.slice(lo,hi+1).filter(s=>s.dt<120).reduce((a,s)=>a+s.dt,0);if(!best||t<best)best=t;}}if(best)BE[n]=best;}

  const rStep=Math.max(1,Math.floor(pts.length/300));
  const route=pts.filter((_,i)=>i%rStep===0||i===pts.length-1).map(p=>({lat:p.lat,lon:p.lon}));

  const firstPt=pts.find(p=>p.time),startUTC=firstPt?.time?new Date(firstPt.time):null;
  const lastPt=[...pts].reverse().find(p=>p.time),endUTC=lastPt?.time?new Date(lastPt.time):null;

  const avgPaceSec=movingTime>0&&totalDist>0?movingTime/(totalDist/1000):0;
  let runClass="Easy";
  if(totalDist>=16000)runClass="Long Run";
  else if(avgPaceSec<330)runClass="Race/Interval";
  else if(avgPaceSec<360)runClass="Tempo";
  else if(avgPaceSec<420)runClass="Moderate";

  const mafRef=hrProfile?.maxHROverride?Number(hrProfile.maxHROverride):hrProfile?.age?Math.round(180-Number(hrProfile.age)):actMaxHR&&actMaxHR>=130?actMaxHR:145;
  const durationMin=movingTime/60;
  let trainingLoad=0;
  if(avgHR&&durationMin>0)trainingLoad=Math.min(100,Math.round(durationMin*(avgHR/mafRef)*1.1));
  else if(durationMin>0){const pe=avgPaceSec>0?Math.max(0,Math.min(1,(600-avgPaceSec)/300)):0.5;trainingLoad=Math.min(100,Math.round(durationMin*0.6*(0.5+pe)));}
  const loadLabel=trainingLoad<=40?"Easy":trainingLoad<=70?"Moderate":"Hard";
  const loadColor=trainingLoad<=40?"#22c55e":trainingLoad<=70?"#f97316":"#ef4444";

  return {
    id:`gpx_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    name:rawName,type:actType,runClass,
    date:startUTC?startUTC.toISOString():new Date().toISOString(),
    dateTs:startUTC?startUTC.getTime():Date.now(),
    startTimeLocal:startUTC?startUTC.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}):null,
    endTimeLocal:endUTC?endUTC.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}):null,
    startDateLocal:startUTC?startUTC.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}):null,
    hasTimestamps:!!startUTC,distanceM:totalDist,distanceKm:parseFloat((totalDist/1000).toFixed(2)),
    movingTimeSec:movingTime,totalTimeSec:totalTime,avgPaceSecKm:avgPaceSec,avgSpeedKmh:totalDist/movingTime*3.6,
    elevGainM:Math.round(elevGain),elevLossM:Math.round(elevLoss),avgHR,maxHR:actMaxHR,avgCad,
    hrSamples,hrMaxUsed:mafHR,trainingLoad,loadLabel,loadColor,
    pointCount:pts.length,kmSplits,splitInsight,elevProfile,speedChart,hrZones,bestEfforts:BE,route,
    bounds:{minLat:Math.min(...pts.map(p=>p.lat)),maxLat:Math.max(...pts.map(p=>p.lat)),minLon:Math.min(...pts.map(p=>p.lon)),maxLon:Math.max(...pts.map(p=>p.lon))},
    parsedAt:Date.now(),
  };
}

function buildAnalytics(acts, hrProfile) {
  const runs=acts.filter(a=>a.type==="Run"||a.type==="Walk"||a.type==="Hike");
  if (!runs.length) return {insights:[],weekly:[],monthly:[],streak:0,prediction:null,consistency:0};
  const sorted=[...runs].sort((a,b)=>a.dateTs-b.dateTs);
  const weekOf=ts=>{const d=new Date(ts);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getTime();};
  const monthOf=ts=>{const d=new Date(ts);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;};
  const weekMap={};
  sorted.forEach(r=>{const w=weekOf(r.dateTs);if(!weekMap[w])weekMap[w]={km:0,load:0,runs:[],days:new Set()};weekMap[w].km+=r.distanceKm;weekMap[w].load+=r.trainingLoad||0;weekMap[w].runs.push(r);weekMap[w].days.add(new Date(r.dateTs).toDateString());});
  const now=Date.now();
  const weekly=Array.from({length:12},(_,i)=>{const wS=weekOf(now-(11-i)*7*86400000),d=new Date(wS),w=weekMap[wS]||{km:0,load:0,runs:[],days:new Set()};return{wStart:wS,label:`${d.getDate()}/${d.getMonth()+1}`,km:parseFloat(w.km.toFixed(1)),load:w.load,count:w.runs.length,days:w.days.size,runs:w.runs};});
  const monthMap={};sorted.forEach(r=>{const m=monthOf(r.dateTs);if(!monthMap[m])monthMap[m]={km:0,runs:[],paces:[]};monthMap[m].km+=r.distanceKm;monthMap[m].runs.push(r);if(r.avgPaceSecKm)monthMap[m].paces.push(r.avgPaceSecKm);});
  const monthKeys=[...new Set(sorted.map(r=>monthOf(r.dateTs)))].sort().slice(-6);
  const monthly=monthKeys.map((m,i)=>{const mo=monthMap[m],prev=monthKeys[i-1]?monthMap[monthKeys[i-1]]:null,avgPace=mo.paces.length?mo.paces.reduce((a,b)=>a+b)/mo.paces.length:0,prevPace=prev?.paces.length?prev.paces.reduce((a,b)=>a+b)/prev.paces.length:0;return{month:m,km:parseFloat(mo.km.toFixed(1)),count:mo.runs.length,longest:Math.max(...mo.runs.map(r=>r.distanceKm)),avgPace,kmDelta:prev?parseFloat(((mo.km-prev.km)/prev.km*100).toFixed(1)):null,paceDelta:prevPace&&avgPace?parseFloat(((prevPace-avgPace)/prevPace*100).toFixed(1)):null};});
  const runDays=new Set(sorted.map(r=>new Date(r.dateTs).toDateString()));
  let streak=0;const today=new Date();today.setHours(0,0,0,0);
  for(let i=0;i<365;i++){const d=new Date(today);d.setDate(today.getDate()-i);if(runDays.has(d.toDateString()))streak++;else if(i>0)break;}
  const recentWeeks=weekly.slice(-8);
  const consistency=Math.round(recentWeeks.filter(w=>w.count>0).length/8*100);
  const recentRuns=sorted.filter(r=>r.avgPaceSecKm>0&&r.distanceKm>=2).slice(-8);
  let prediction=null;
  if(recentRuns.length>=2){const ws=recentRuns.map((_,i)=>i+1),tw=ws.reduce((a,b)=>a+b,0),wp=recentRuns.reduce((s,r,i)=>s+r.avgPaceSecKm*ws[i],0)/tw,cf=1+(1-consistency/100)*0.12,br=recentRuns[recentRuns.length-1],bT=br.avgPaceSecKm*br.distanceKm,bD=br.distanceKm,fmt=s=>{const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=Math.round(s%60);return h?`${h}:${m.toString().padStart(2,"0")}:${ss.toString().padStart(2,"0")}`:`${m}:${ss.toString().padStart(2,"0")}`;};prediction={"5K":fmt(bT*Math.pow(5/bD,1.06)*cf),"10K":fmt(bT*Math.pow(10/bD,1.06)*cf),"Half Marathon":fmt(bT*Math.pow(21.1/bD,1.06)*cf),"Avg Pace":`${fmtPace(wp)}/km`};}
  return {weekly,monthly,streak,prediction,consistency,runDays};
}

const BADGES_KEY = "runlytics_badges_v1";
const BD = (id,cat,icon,color,name,desc,check) => ({id,cat,icon,color,name,desc,check});
const BADGE_DEFS = [
  BD("first_run","milestone","👟","#f97316","First Steps","Complete your first run.",a=>a.length>=1),
  BD("streak_3","streak","🔥","#f97316","3-Day Streak","Run 3 days in a row.",(_,an)=>an.streak>=3),
  BD("streak_7","streak","🔥","#ef4444","Week Warrior","Run 7 days in a row.",(_,an)=>an.streak>=7),
  BD("streak_14","streak","🔥","#ef4444","Fortnight Flyer","Run 14 days in a row.",(_,an)=>an.streak>=14),
  BD("streak_30","streak","👑","#eab308","Iron Legs","Run 30 days in a row.",(_,an)=>an.streak>=30),
  BD("dist_10","distance","📍","#22c55e","First 10km","Log 10 km total.",a=>a.reduce((s,r)=>s+r.distanceKm,0)>=10),
  BD("dist_50","distance","🗺️","#22c55e","50km Club","Log 50 km total.",a=>a.reduce((s,r)=>s+r.distanceKm,0)>=50),
  BD("dist_100","distance","💯","#3b82f6","Century Runner","Log 100 km total.",a=>a.reduce((s,r)=>s+r.distanceKm,0)>=100),
  BD("dist_500","distance","🌍","#a855f7","Globe Trotter","Log 500 km total.",a=>a.reduce((s,r)=>s+r.distanceKm,0)>=500),
  BD("run_5k","run","⭐","#06b6d4","5K Finisher","Complete a 5km+ run.",a=>a.some(r=>r.distanceKm>=5)),
  BD("run_10k","run","🏅","#06b6d4","10K Finisher","Complete a 10km+ run.",a=>a.some(r=>r.distanceKm>=10)),
  BD("run_half","run","🥈","#3b82f6","Half Marathoner","Complete a 21km+ run.",a=>a.some(r=>r.distanceKm>=21.1)),
  BD("run_marathon","run","🏆","#eab308","Marathoner","Complete a 42km+ run.",a=>a.some(r=>r.distanceKm>=42.2)),
  BD("aerobic_5","aerobic","💚","#22c55e","Aerobic Builder","5 runs at or below MAF HR.",(a,_,m)=>!!m&&a.filter(r=>r.avgHR&&r.avgHR<=m).length>=5),
  BD("aerobic_20","aerobic","💚","#22c55e","MAF Master","20 runs at or below MAF HR.",(a,_,m)=>!!m&&a.filter(r=>r.avgHR&&r.avgHR<=m).length>=20),
  BD("consistent_4","consistency","📅","#3b82f6","Consistent","Run in 4+ different weeks.",a=>new Set(a.map(r=>{const d=new Date(r.dateTs);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.toDateString();})).size>=4),
  BD("runs_50","consistency","🎽","#3b82f6","50 Runs Club","Log 50 runs.",a=>a.length>=50),
  BD("early_bird","misc","🌅","#f97316","Early Bird","Run before 7 AM.",a=>a.some(r=>r.startTimeLocal&&parseInt(r.startTimeLocal)<7)),
  BD("speed_demon","misc","⚡","#ef4444","Speed Demon","Avg pace under 5:00/km.",a=>a.some(r=>r.avgPaceSecKm>0&&r.avgPaceSecKm<300)),
];
const BADGE_CAT_ORDER=["milestone","streak","distance","run","aerobic","consistency","misc"];
const BADGE_CAT_LABEL={milestone:"Milestones",streak:"Streaks",distance:"Distance",run:"Long Runs",aerobic:"Aerobic",consistency:"Consistency",misc:"Special"};
function computeEarnedBadges(acts,an,mafHR){const s=new Set();for(const b of BADGE_DEFS){try{if(b.check(acts,an,mafHR))s.add(b.id);}catch(e){}}return s;}
function loadSeenBadges(){try{return new Set(JSON.parse(localStorage.getItem(BADGES_KEY)||"[]"));}catch(e){return new Set();}}
function saveSeenBadges(ids){try{localStorage.setItem(BADGES_KEY,JSON.stringify([...ids]));}catch(e){}}
}

const DEFAULT_TASKS = [
  {id:"t1",title:"Stay below MAF HR",desc:"Keep avg HR under your MAF threshold",icon:"❤️",category:"hr"},
  {id:"t2",title:"Complete an easy run",desc:"Any run where you stay in Z1–Z2 the whole time",icon:"🏃",category:"run"},
  {id:"t3",title:"Log today's activity",desc:"Upload or record your run",icon:"📁",category:"run"},
  {id:"t4",title:"Rest or cross-train",desc:"Active recovery: walk, swim, or stretch",icon:"🧘",category:"recovery"},
  {id:"t5",title:"Avoid overtraining",desc:"Keep weekly load under 80% of your max",icon:"⚡",category:"load"},
  {id:"t6",title:"Hydrate well",desc:"Drink 2–3L of water today",icon:"💧",category:"wellness"},
];

function loadTasks() {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    if (!raw) return initTasks();
    const parsed = JSON.parse(raw);
    return DEFAULT_TASKS.map(dt => {
      const saved = parsed.find(t=>t.id===dt.id);
      return {...dt, streak:saved?.streak||0, completions:saved?.completions||{}, enabled:saved?.enabled??true};
    });
  } catch { return initTasks(); }
}
function initTasks() {
  return DEFAULT_TASKS.map(t=>({...t,streak:0,completions:{},enabled:true}));
}
function saveTasks(tasks) {
  try { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks.map(t=>({id:t.id,streak:t.streak,completions:t.completions,enabled:t.enabled})))); } catch {}
}
const todayKey = () => new Date().toISOString().split("T")[0]; // "2026-04-23"
function getStreak(completions) {
  let s=0;
  const today=new Date(); today.setHours(0,0,0,0);
  for(let i=0;i<365;i++){
    const d=new Date(today); d.setDate(today.getDate()-i);
    if(completions[d.toISOString().split("T")[0]])s++;
    else if(i>0)break;
  }
  return s;
}

const fmtPace = s => { if(!s||s<=0)return"—"; return `${Math.floor(s/60)}:${Math.round(s%60).toString().padStart(2,"0")}`; };
const fmtDur  = s => { if(!s)return"—"; const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=Math.floor(s%60); return h?`${h}:${m.toString().padStart(2,"0")}:${ss.toString().padStart(2,"0")}`:`${m}:${ss.toString().padStart(2,"0")}`; };
const fmtKm   = n => n!=null?parseFloat(n.toFixed(1)).toString():"—";
const fmtDate = d => d?new Date(d).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"}):"—";
const fmtDateS= d => d?new Date(d).toLocaleDateString("en-GB",{day:"numeric",month:"short"}):"—";
const greet   = () => { const h=new Date().getHours(); return h<12?"Good morning":h<17?"Good afternoon":"Good evening"; };
const ACT_CLR = {Run:"#f97316",Ride:"#3b82f6",Walk:"#22c55e",Swim:"#06b6d4",Hike:"#a855f7"};
const ACT_ICN = {Run:"🏃",Ride:"🚴",Walk:"🚶",Swim:"🏊",Hike:"🥾"};
const rc = t=>ACT_CLR[t]||"#6b7280";

const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:ital,wght@0,400;0,500;1,400&display=swap');
    :root {
      --bg:#06080f;--s1:#0b0f1a;--s2:#101622;--s3:#141c2a;
      --bd:#1a2336;--bd2:#212e45;
      --or:#f97316;--or2:rgba(249,115,22,.14);--or3:rgba(249,115,22,.07);
      --gn:#22c55e;--gn2:rgba(34,197,94,.13);--gn3:rgba(34,197,94,.06);
      --rd:#ef4444;--rd2:rgba(239,68,68,.12);
      --bl:#3b82f6;--bl2:rgba(59,130,246,.13);
      --yw:#eab308;--yw2:rgba(234,179,8,.13);
      --pu:#a855f7;--pu2:rgba(168,85,247,.13);
      --cy:#06b6d4;--cy2:rgba(6,182,212,.13);
      --tx:#d8e6f7;--tx2:#6178a0;--tx3:#2e3d55;
      font-family:'DM Sans',sans-serif;
    }
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:var(--bg);color:var(--tx);-webkit-font-smoothing:antialiased;overflow-x:hidden;}
    ::-webkit-scrollbar{width:0;} ::-webkit-scrollbar-track{background:transparent;}
    .mono{font-family:'DM Mono',monospace;}
    /* Animations */
    @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    @keyframes glow{0%,100%{box-shadow:0 0 0 0 rgba(249,115,22,.3)}60%{box-shadow:0 0 0 10px rgba(249,115,22,0)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes badgePop{0%{transform:scale(.4) rotate(-10deg);opacity:0}65%{transform:scale(1.18) rotate(2deg)}100%{transform:scale(1) rotate(0);opacity:1}}
    @keyframes sparkle{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.85)}}
    @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
    @keyframes ringFill{from{stroke-dashoffset:var(--full)}to{stroke-dashoffset:var(--offset)}}
    .a0{animation:fadeUp .28s ease both}
    .a1{animation:fadeUp .28s .06s ease both}
    .a2{animation:fadeUp .28s .12s ease both}
    .a3{animation:fadeUp .28s .18s ease both}
    .a4{animation:fadeUp .28s .24s ease both}
    .a5{animation:fadeUp .28s .30s ease both}
    /* Cards */
    .card{background:var(--s1);border:1px solid var(--bd);border-radius:20px;}
    .card2{background:var(--s2);border:1px solid var(--bd);border-radius:14px;}
    .card3{background:var(--s3);border:1px solid var(--bd2);border-radius:10px;}
    .glass{background:rgba(11,15,26,.85);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);}
    /* Interactive */
    .tap{cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;transition:all .16s;}
    .tap:active{opacity:.75;transform:scale(.97);}
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:none;border-radius:13px;font-family:'DM Sans',sans-serif;font-weight:600;cursor:pointer;transition:all .16s;white-space:nowrap;}
    .btn:disabled{opacity:.3;cursor:not-allowed;}
    .b-or{background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;box-shadow:0 4px 20px rgba(249,115,22,.25);}
    .b-or:hover:not(:disabled){filter:brightness(1.1);box-shadow:0 6px 28px rgba(249,115,22,.35);}
    .b-or:active:not(:disabled){transform:scale(.97);}
    .b-ghost{background:transparent;color:var(--tx2);border:1px solid var(--bd2);}
    .b-ghost:hover:not(:disabled){color:var(--tx);border-color:var(--bd2);}
    .b-danger{background:var(--rd2);color:var(--rd);border:1px solid rgba(239,68,68,.2);}
    /* Form */
    .inp{width:100%;background:var(--s2);border:1.5px solid var(--bd);border-radius:11px;color:var(--tx);font-family:'DM Sans',sans-serif;font-size:.88rem;padding:12px 15px;outline:none;transition:border-color .2s,box-shadow .2s;}
    .inp:focus{border-color:var(--or);box-shadow:0 0 0 3px rgba(249,115,22,.12);}
    .inp::placeholder{color:var(--tx3);}
    /* Badge & pill */
    .badge{display:inline-flex;align-items:center;gap:3px;padding:2px 9px;border-radius:20px;font-size:.62rem;font-weight:700;letter-spacing:.04em;}
    .pill{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:24px;border:1.5px solid var(--bd);background:transparent;cursor:pointer;font-size:.76rem;font-weight:500;transition:all .15s;font-family:'DM Sans',sans-serif;}
    .pill.on{background:var(--or3);border-color:var(--or);color:var(--or);font-weight:600;}
    /* Tab nav */
    .tab-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 4px 10px;border:none;background:transparent;color:var(--tx3);cursor:pointer;font-size:.58rem;font-weight:600;font-family:'DM Sans',sans-serif;letter-spacing:.04em;text-transform:uppercase;transition:color .18s;position:relative;}
    .tab-btn.on{color:var(--or);}
    .tab-btn.on::after{content:'';position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:20px;height:2.5px;border-radius:2px;background:var(--or);}
    /* Progress bar */
    .pb{height:5px;background:var(--bd);border-radius:3px;overflow:hidden;}
    .pf{height:100%;border-radius:3px;transition:width 1s cubic-bezier(.4,0,.2,1);}
    /* Drop zone */
    .dz{border:2px dashed var(--bd2);border-radius:20px;transition:all .2s;}
    .dz.ov{border-color:var(--or);background:var(--or3);}
    /* Skeleton */
    .sk{background:linear-gradient(90deg,var(--s2) 25%,var(--s3) 50%,var(--s2) 75%);background-size:200%;animation:shimmer 1.5s infinite;border-radius:8px;}
    /* Insights */
    .ins-warn{background:rgba(234,179,8,.07);border-color:rgba(234,179,8,.22);}
    .ins-good{background:rgba(34,197,94,.07);border-color:rgba(34,197,94,.22);}
    .ins-danger{background:rgba(239,68,68,.07);border-color:rgba(239,68,68,.22);}
    .ins-info{background:rgba(59,130,246,.07);border-color:rgba(59,130,246,.22);}
    .ins-neutral{background:var(--s2);border-color:var(--bd);}
    /* Scroll */
    .scroll-x{overflow-x:auto;scrollbar-width:none;} .scroll-x::-webkit-scrollbar{display:none;}
    /* Toggle switch */
    .tog{width:38px;height:22px;border-radius:11px;border:none;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0;}
    .tog-knob{position:absolute;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .2s;}
  `}</style>
);

const Spinner = ({size=18,color="var(--or)"}) => (
  <div style={{width:size,height:size,borderRadius:"50%",border:`2px solid var(--bd2)`,borderTopColor:color,animation:"spin 1s linear infinite",flexShrink:0}}/>
);

const StatVal = ({value, unit="", color="var(--tx)", size="2rem", sub=null}) => (
  <div>
    <span className="mono" style={{fontSize:size,fontWeight:700,color,lineHeight:1,letterSpacing:"-.01em"}}>
      {value}
    </span>
    {unit && <span style={{fontSize:".72rem",color:"var(--tx2)",fontWeight:400,marginLeft:3}}>{unit}</span>}
    {sub && <div style={{fontSize:".65rem",color:"var(--tx2)",marginTop:3}}>{sub}</div>}
  </div>
);

const SectionHead = ({title, right=null, sub=null}) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:right?"center":"flex-start",marginBottom:sub?4:14}}>
    <div>
      <div style={{fontSize:".68rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)"}}>{title}</div>
      {sub && <div style={{fontSize:".78rem",color:"var(--tx2)",marginTop:2}}>{sub}</div>}
    </div>
    {right}
  </div>
);

const Dot = ({color, size=8}) => (
  <div style={{width:size,height:size,borderRadius:"50%",background:color,flexShrink:0}}/>
);

const ZoneBadge = ({zone, color, size="sm"}) => (
  <span style={{
    display:"inline-flex",alignItems:"center",gap:3,
    padding:size==="sm"?"2px 7px":"3px 10px",
    borderRadius:20,fontSize:size==="sm"?".6rem":".7rem",fontWeight:700,
    background:`${color}18`,color,
  }}>{zone}</span>
);

const Ring = ({pct=0, size=72, color="var(--or)", track="var(--bd)", strokeWidth=7, children}) => {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(1, Math.max(0, pct)));
  return (
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={track} strokeWidth={strokeWidth}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={pct>0?color:track} strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          style={{transition:"stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
        {children}
      </div>
    </div>
  );
};

const insightStyles = {good:"ins-good",positive:"ins-good",warning:"ins-warn",danger:"ins-danger",info:"ins-info",neutral:"ins-neutral"};
const insightColors = {good:"var(--gn)",positive:"var(--gn)",warning:"var(--yw)",danger:"var(--rd)",info:"var(--bl)",neutral:"var(--tx2)"};

const CoachCard = ({insight, defaultOpen=false}) => {
  const [open, setOpen] = useState(defaultOpen);
  if (!insight) return null;
  const col = insightColors[insight.type] || "var(--tx2)";
  const detail = insight.detail || insight.body;
  const hasDetail = !!(detail || insight.action);

  return (
    <div style={{
      background:`${col}08`, border:`1px solid ${col}28`,
      borderRadius:14, overflow:"hidden",
      cursor:hasDetail?"pointer":"default",
    }} onClick={()=>hasDetail&&setOpen(o=>!o)}>
      <div style={{padding:"13px 15px",display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:"1.25rem",flexShrink:0,lineHeight:1}}>{insight.icon||"🧠"}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:".9rem",color:"var(--tx)",lineHeight:1.3}}>{insight.title}</div>
          {!open && detail && (
            <div style={{fontSize:".73rem",color:"var(--tx2)",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{detail}</div>
          )}
        </div>
        {hasDetail && (
          <div style={{color:`${col}`,fontSize:".75rem",transition:"transform .2s",transform:open?"rotate(180deg)":"none",flexShrink:0}}>▾</div>
        )}
      </div>
      {open && hasDetail && (
        <div style={{padding:"0 15px 14px 52px",animation:"fadeIn .15s ease"}}>
          {detail && <div style={{fontSize:".8rem",color:"var(--tx2)",lineHeight:1.65,marginBottom:insight.action?10:0}}>{detail}</div>}
          {insight.action && <div style={{fontSize:".76rem",color:col,fontWeight:600}}>{insight.action}</div>}
        </div>
      )}
    </div>
  );
};

const Detail = ({act, allActs, hrProfile, onClose, onDelete}) => {
  const [tab, setTab] = useState("overview");
  const color = ACT_CLR[act.type] || "#6b7280";
  const mafHR = getMafHR(hrProfile, act.maxHR);
  const liveZones = act.hrSamples?.length ? computeZones(act.hrSamples, mafHR) : null;
  const displayZones = liveZones || act.hrZones;
  const TABS = ["overview","heartrate","map","splits"];

  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"var(--bg)",display:"flex",flexDirection:"column",overflowY:"auto"}}>
      <div className="glass" style={{position:"sticky",top:0,zIndex:10,padding:"14px 18px 0",borderBottom:"1px solid var(--bd)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div style={{flex:1,minWidth:0,paddingRight:12}}>
            <div style={{fontSize:".65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color,marginBottom:5}}>
              {ACT_ICN[act.type]||"🏃"} {act.type} · {act.runClass}
            </div>
            <div style={{fontWeight:700,fontSize:"1.05rem",lineHeight:1.3,marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{act.name}</div>
            <div style={{fontSize:".73rem",color:"var(--tx2)"}}>{act.startDateLocal || fmtDate(act.date)}{act.startTimeLocal ? ` · ${act.startTimeLocal}` : ""}</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button className="btn b-danger" style={{padding:"7px 11px",fontSize:".78rem"}} onClick={()=>{if(confirm("Delete this activity?"))onDelete(act.id);}}>🗑</button>
            <button className="btn b-ghost" style={{padding:"7px 14px",fontSize:".82rem"}} onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={{display:"flex",gap:0,overflowX:"auto"}}>
          {TABS.map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{padding:"8px 16px",border:"none",background:"transparent",color:tab===t?"var(--or)":"var(--tx2)",
                fontFamily:"inherit",fontSize:".78rem",fontWeight:tab===t?600:400,cursor:"pointer",
                borderBottom:tab===t?"2px solid var(--or)":"2px solid transparent",whiteSpace:"nowrap",transition:"color .15s",textTransform:"capitalize"}}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div style={{flex:1,padding:"18px 18px 32px"}}>
        {tab==="overview"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
              {[
                {l:"Distance",v:fmtKm(act.distanceKm),u:"km",c:color},
                {l:"Pace",v:fmtPace(act.avgPaceSecKm),u:"/km",c:"var(--tx)"},
                {l:"Time",v:fmtDur(act.movingTimeSec),u:"",c:"var(--tx)"},
              ].map(s=>(
                <div key={s.l} className="card3" style={{padding:"14px 12px",textAlign:"center"}}>
                  <div className="mono" style={{fontSize:"1.3rem",fontWeight:700,color:s.c,lineHeight:1}}>{s.v}<span style={{fontSize:".62rem",color:"var(--tx2)",fontWeight:400}}>{s.u}</span></div>
                  <div style={{fontSize:".62rem",color:"var(--tx2)",marginTop:5}}>{s.l}</div>
                </div>
              ))}
            </div>
            <div className="card" style={{padding:16,marginBottom:14}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
                {[
                  ["Elev Gain",`+${act.elevGainM||0}m`],["Elev Loss",`-${act.elevLossM||0}m`],
                  ["Avg HR",act.avgHR?`${act.avgHR} bpm`:"—"],["Max HR",act.maxHR?`${act.maxHR} bpm`:"—"],
                  ["Cadence",act.avgCad?`${act.avgCad*2} spm`:"—"],["Training Load",`${act.trainingLoad||0}`],
                ].map(([l,v],i)=>(
                  <div key={l} style={{padding:"10px 0",borderBottom:(i<4)?"1px solid var(--bd)":"none",paddingRight:i%2===0?16:0,paddingLeft:i%2===1?16:0,borderRight:i%2===0?"1px solid var(--bd)":"none"}}>
                    <div style={{fontSize:".65rem",color:"var(--tx3)",marginBottom:3}}>{l}</div>
                    <div className="mono" style={{fontSize:".95rem",fontWeight:600}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            {act.speedChart?.length > 2 && (
              <div className="card" style={{padding:16,marginBottom:14}}>
                <SectionHead title="Pace per km"/>
                <ResponsiveContainer width="100%" height={90}>
                  <AreaChart data={act.speedChart} margin={{top:0,right:0,bottom:0,left:-30}}>
                    <defs><linearGradient id="pace-g" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={color} stopOpacity={.2}/><stop offset="95%" stopColor={color} stopOpacity={0}/></linearGradient></defs>
                    <YAxis reversed domain={["auto","auto"]} tick={{fill:"var(--tx3)",fontSize:8}}/>
                    <XAxis dataKey="km" tick={{fill:"var(--tx3)",fontSize:8}} axisLine={false} tickLine={false}/>
                    <Tooltip content={({active,payload})=>{if(!active||!payload?.length)return null;return <div style={{background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:8,padding:"6px 10px",fontSize:".72rem"}}>{payload[0]?.value?.toFixed(2)}/km</div>;}}/>
                    <Area type="monotone" dataKey="pace" stroke={color} strokeWidth={2} fill="url(#pace-g)" dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
        {tab==="heartrate"&&(
          <div>
            {act.avgHR ? (
              <>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                  {[{l:"Avg HR",v:`${act.avgHR}`,u:"bpm",c:"var(--rd)"},{l:"MAF HR",v:`${mafHR}`,u:"bpm",c:act.avgHR<=mafHR?"var(--gn)":"var(--yw)"}].map(s=>(
                    <div key={s.l} className="card3" style={{padding:"14px 12px",textAlign:"center"}}>
                      <div className="mono" style={{fontSize:"1.8rem",fontWeight:700,color:s.c,lineHeight:1}}>{s.v}<span style={{fontSize:".62rem",color:"var(--tx2)",fontWeight:400,marginLeft:2}}>{s.u}</span></div>
                      <div style={{fontSize:".62rem",color:"var(--tx2)",marginTop:5}}>{s.l}</div>
                    </div>
                  ))}
                </div>
                {displayZones ? (
                  <div className="card" style={{padding:16,marginBottom:14}}>
                    <SectionHead title="MAF Zone Distribution" sub={liveZones?"Live computed":"Stored data"}/>
                    {displayZones.map((z,i)=>(
                      <div key={z.zone} style={{marginBottom:i<4?12:0}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <Dot color={z.color} size={8}/>
                            <span style={{fontSize:".8rem",fontWeight:600}}>{z.zone}</span>
                            <span style={{fontSize:".72rem",color:"var(--tx2)"}}>{z.label}</span>
                            <span style={{fontSize:".63rem",color:"var(--tx3)"}}>
                              {z.bpmHi ? `${z.bpmLo}–${z.bpmHi}` : `>${z.bpmLo}`} bpm
                            </span>
                          </div>
                          <div style={{display:"flex",gap:8,alignItems:"center"}}>
                            <span className="mono" style={{fontSize:".76rem",color:"var(--tx2)"}}>{z.minutes}m</span>
                            <span className="mono" style={{fontSize:".9rem",color:z.color,fontWeight:700,minWidth:34,textAlign:"right"}}>{z.pct}%</span>
                          </div>
                        </div>
                        <div className="pb"><div className="pf" style={{width:`${z.pct}%`,background:z.color}}/></div>
                      </div>
                    ))}
                    <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid var(--bd)",fontSize:".65rem",color:"var(--tx3)",display:"flex",justifyContent:"space-between"}}>
                      <span>MAF = {mafHR} bpm{hrProfile?.age?` (180−${hrProfile.age})`:""}</span>
                      <span>Σ = {displayZones.reduce((s,z)=>s+z.pct,0)}%</span>
                    </div>
                  </div>
                ) : (
                  <div className="card2" style={{padding:20,textAlign:"center",color:"var(--tx2)"}}>
                    <div style={{fontSize:"1.4rem",marginBottom:8}}>🔄</div>
                    <div style={{fontSize:".82rem"}}>Re-upload this GPX to compute MAF zones.</div>
                  </div>
                )}
              </>
            ) : (
              <div style={{textAlign:"center",padding:"40px 0",color:"var(--tx2)"}}>
                <div style={{fontSize:"2rem",marginBottom:10}}>💔</div>
                <div style={{fontWeight:600,marginBottom:5}}>No HR data</div>
                <div style={{fontSize:".8rem"}}>This GPX file doesn't include heart rate.</div>
              </div>
            )}
          </div>
        )}
        {tab==="map"&&(
          <div className="card" style={{padding:16}}>
            {act.route?.length>2 ? (
              <RouteMap route={act.route}/>
            ) : (
              <div style={{height:220,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--tx2)",flexDirection:"column",gap:8}}>
                <div style={{fontSize:"2rem"}}>🗺️</div>
                <div style={{fontSize:".82rem"}}>No GPS route data</div>
              </div>
            )}
          </div>
        )}
        {tab==="splits"&&(
          <div className="card" style={{padding:16}}>
            <SectionHead title="km Splits" sub={`${act.kmSplits?.length||0} complete km`}/>
            {act.kmSplits?.length ? (
              <>
                {act.splitInsight && (
                  <div style={{marginBottom:14,padding:"10px 12px",borderRadius:12,
                    background:act.splitInsight.splitType==="negative"?"var(--gn3)":act.splitInsight.splitType==="positive"?"var(--rd2)":"var(--bl2)"}}>
                    <div style={{fontSize:".8rem",fontWeight:600,marginBottom:3,color:act.splitInsight.splitType==="negative"?"var(--gn)":act.splitInsight.splitType==="positive"?"var(--rd)":"var(--bl)"}}>
                      {act.splitInsight.splitType==="negative"?"⬆️ Negative Split":act.splitInsight.splitType==="positive"?"⬇️ Positive Split":"〰️ Even Split"}</div>
                    <div style={{fontSize:".72rem",color:"var(--tx2)"}}>Consistency: {act.splitInsight.consistencyScore}/100</div>
                  </div>
                )}
                {act.kmSplits.map((s,i)=>{
                  const diff=s.pace-act.avgPaceSecKm;
                  return(
                    <div key={i} style={{display:"grid",gridTemplateColumns:"36px 1fr 60px 60px",gap:8,padding:"10px 0",borderTop:"1px solid var(--bd)",alignItems:"center"}}>
                      <div className="mono" style={{fontWeight:600,color:"var(--tx3)",fontSize:".8rem"}}>{s.km}</div>
                      <div className="mono" style={{fontWeight:700,color,fontSize:".95rem"}}>{fmtPace(s.pace)}<span style={{fontSize:".62rem",color:"var(--tx2)",fontWeight:400}}>/km</span></div>
                      <div style={{fontSize:".76rem",color:"var(--tx2)"}}>{s.hr?`${s.hr} bpm`:"—"}</div>
                      <div style={{fontSize:".72rem",fontWeight:600,color:diff<0?"var(--gn)":"var(--rd)",textAlign:"right"}}>
                        {diff<0?"↑":"↓"}{fmtPace(Math.abs(diff))}
                      </div>
                    </div>
                  );
                })}
              </>
            ) : <div style={{color:"var(--tx2)",fontSize:".82rem",textAlign:"center",padding:"24px 0"}}>No splits available</div>}
          </div>
        )}
      </div>
    </div>
  );
};

const RouteMap = ({route,height=220}) => {
  if (!route||route.length<2) return null;
  const W=380,H=height,pad=20;
  const lats=route.map(p=>p.lat),lons=route.map(p=>p.lon);
  const minLat=Math.min(...lats),maxLat=Math.max(...lats);
  const minLon=Math.min(...lons),maxLon=Math.max(...lons);
  const latR=maxLat-minLat||.001,lonR=maxLon-minLon||.001;
  const aspect=lonR/latR*(Math.cos((minLat+maxLat)/2*Math.PI/180));
  let vW=W-2*pad,vH=H-2*pad;
  if(aspect>vW/vH){vH=vW/aspect;}else{vW=vH*aspect;}
  const toX=lon=>pad+(lon-minLon)/lonR*vW;
  const toY=lat=>pad+(maxLat-lat)/latR*vH;
  const d=route.map((p,i)=>`${i===0?"M":"L"}${toX(p.lon).toFixed(1)},${toY(p.lat).toFixed(1)}`).join(" ");
  const startPt=route[0],endPt=route[route.length-1];
  return(
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:H,borderRadius:12,background:"var(--s3)"}}>
      <defs>
        <linearGradient id="route-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f97316"/>
          <stop offset="100%" stopColor="#ef4444"/>
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="url(#route-g)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={toX(startPt.lon)} cy={toY(startPt.lat)} r="5" fill="var(--gn)"/>
      <circle cx={toX(endPt.lon)} cy={toY(endPt.lat)} r="5" fill="var(--rd)"/>
    </svg>
  );
};

const Upload = ({acts, hrProfile, onAdd, onClearAll}) => {
  const [queue, setQueue] = useState([]);
  const [drag, setDrag] = useState(false);
  const ref = useRef(null);

  const process = useCallback(async files => {
    const gpx = Array.from(files).filter(f=>f.name.toLowerCase().endsWith(".gpx"));
    if (!gpx.length) return;
    const items = gpx.map(f=>({file:f,status:"parsing",parsed:null,error:null}));
    setQueue(items);
    const results = await Promise.all(items.map(async item=>{
      try{
        const text = await item.file.text();
        const parsed = parseGPX(text, item.file.name, hrProfile);
        const isDupe = acts.some(a=>Math.abs(a.dateTs-parsed.dateTs)<60000&&Math.abs(a.distanceKm-parsed.distanceKm)<0.1);
        return {...item,status:isDupe?"duplicate":"preview",parsed,error:isDupe?"Already uploaded":null};
      }catch(e){return {...item,status:"error",error:e.message};}
    }));
    setQueue(results);
  },[acts, hrProfile]);

  const saveAll = () => {
    const valid = queue.filter(q=>q.status==="preview"&&q.parsed);
    if (!valid.length) return;
    onAdd(valid.map(q=>q.parsed));
    setQueue([]);
  };

  return (
    <div style={{padding:"18px 0 32px"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontWeight:700,fontSize:"1.1rem",marginBottom:4}}>Upload Runs</div>
        <div style={{fontSize:".82rem",color:"var(--tx2)"}}>Import GPX files from Garmin, Strava, or any GPS watch</div>
      </div>
      <div className={`dz a0 ${drag?"ov":""}`}
        style={{padding:"36px 24px",textAlign:"center",marginBottom:16,cursor:"pointer"}}
        onDragOver={e=>{e.preventDefault();setDrag(true);}}
        onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);process(e.dataTransfer.files);}}
        onClick={()=>ref.current?.click()}>
        <input ref={ref} type="file" accept=".gpx" multiple style={{display:"none"}} onChange={e=>process(e.target.files)}/>
        <div style={{fontSize:"2.4rem",marginBottom:12}}>📂</div>
        <div style={{fontWeight:600,marginBottom:5}}>Drop GPX files here</div>
        <div style={{fontSize:".8rem",color:"var(--tx2)",marginBottom:14}}>or tap to browse</div>
        <button className="btn b-or" style={{padding:"10px 24px",fontSize:".86rem"}}>Choose files</button>
      </div>
      {queue.length>0&&(
        <div className="card a1" style={{padding:16,marginBottom:14}}>
          {queue.map((item,idx)=>(
            <div key={idx} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:idx<queue.length-1?"1px solid var(--bd)":"none"}}>
              <div style={{width:36,height:36,borderRadius:10,background:item.status==="preview"?"var(--gn2)":item.status==="error"?"var(--rd2)":item.status==="duplicate"?"var(--yw2)":"var(--s3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem",flexShrink:0}}>
                {item.status==="parsing"?<Spinner size={16}/>:item.status==="preview"?"✓":item.status==="error"?"✗":"≈"}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:".83rem",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.file.name}</div>
                {item.parsed&&<div style={{fontSize:".72rem",color:"var(--tx2)",marginTop:2}}>{fmtKm(item.parsed.distanceKm)} km · {fmtDur(item.parsed.movingTimeSec)} · {item.parsed.runClass}</div>}
                {item.error&&<div style={{fontSize:".72rem",color:"var(--rd)",marginTop:2}}>{item.error}</div>}
              </div>
              <button className="tap" style={{background:"none",border:"none",color:"var(--tx3)",fontSize:".8rem",padding:4}} onClick={()=>setQueue(q=>q.filter((_,i)=>i!==idx))}>✕</button>
            </div>
          ))}
          {queue.some(q=>q.status==="preview")&&(
            <button className="btn b-or" style={{width:"100%",padding:"12px",fontSize:".88rem",marginTop:14}} onClick={saveAll}>
              Save {queue.filter(q=>q.status==="preview").length} run{queue.filter(q=>q.status==="preview").length!==1?"s":""}
            </button>
          )}
        </div>
      )}
      {acts.length>0&&(
        <div className="a2">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:".65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)"}}>Activity Library · {acts.length} runs</div>
            <button className="btn b-danger" style={{padding:"5px 11px",fontSize:".72rem"}} onClick={onClearAll}>Clear All</button>
          </div>
          {acts.slice(0,5).map((act,i)=>(
            <div key={act.id} className="card2" style={{padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:36,height:36,borderRadius:10,background:`${ACT_CLR[act.type]||"#6b7280"}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem"}}>{ACT_ICN[act.type]||"🏃"}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:".82rem",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{act.name}</div>
                <div style={{fontSize:".7rem",color:"var(--tx2)",marginTop:2}}>{fmtDateS(act.date)} · {fmtKm(act.distanceKm)} km</div>
              </div>
            </div>
          ))}
          {acts.length>5&&<div style={{fontSize:".75rem",color:"var(--tx2)",textAlign:"center",padding:"8px 0"}}>+{acts.length-5} more runs</div>}
        </div>
      )}
    </div>
  );
};

const RunFeedbackModal = ({run, mafHR, newBadges=[], onClose}) => {
  const feedbacks = useMemo(()=>getRunFeedback(run, mafHR),[run, mafHR]);
  if (!run || !feedbacks) return null;
  const badgeDefs = newBadges.map(id=>BADGE_DEFS.find(b=>b.id===id)).filter(Boolean);

  return (
    <div style={{position:"fixed",inset:0,zIndex:250,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="glass" style={{width:"100%",maxWidth:430,borderRadius:"20px 20px 0 0",padding:"24px 20px 40px",border:"1px solid var(--bd)",animation:"slideUp .28s ease"}}>
        <div style={{width:36,height:4,borderRadius:2,background:"var(--bd2)",margin:"0 auto 20px"}}/>
        {badgeDefs.length > 0 && (
          <div style={{marginBottom:20}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:"1rem",fontWeight:700,marginBottom:3}}>
                🎉 Badge{badgeDefs.length>1?"s":""} Unlocked!
              </div>
              <div style={{fontSize:".76rem",color:"var(--tx2)"}}>Keep going — your progress is paying off</div>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:10,justifyContent:"center",marginBottom:10}}>
              {badgeDefs.map((b,i)=>(
                <div key={b.id} style={{
                  display:"flex",flexDirection:"column",alignItems:"center",gap:6,
                  padding:"12px 14px",borderRadius:16,minWidth:90,flex:"0 0 auto",
                  background:`${b.color}15`,border:`1.5px solid ${b.color}40`,
                  animation:`badgePop .45s ${i*0.1}s cubic-bezier(.34,1.56,.64,1) both`,
                }}>
                  <span style={{fontSize:"2rem",filter:`drop-shadow(0 0 6px ${b.color}80)`}}>{b.icon}</span>
                  <div style={{fontWeight:700,fontSize:".72rem",color:b.color,textAlign:"center",lineHeight:1.3}}>{b.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{fontWeight:700,fontSize:"1rem",marginBottom:3}}>Run Feedback</div>
        <div style={{fontSize:".74rem",color:"var(--tx2)",marginBottom:14}}>
          {run.name} · {fmtKm(run.distanceKm)} km · {fmtDate(run.date)}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:20}}>
          {feedbacks.map((fb,i) => {
            const col = insightColors[fb.type] || "var(--tx2)";
            return (
              <div key={i} style={{display:"flex",gap:12,padding:"11px 13px",borderRadius:12,background:`${col}10`,border:`1px solid ${col}22`}}>
                <span style={{fontSize:"1.15rem",flexShrink:0,lineHeight:1.2}}>{fb.icon}</span>
                <div>
                  <div style={{fontWeight:700,fontSize:".86rem",color:"var(--tx)",marginBottom:2}}>{fb.title}</div>
                  <div style={{fontSize:".76rem",color:"var(--tx2)",lineHeight:1.5}}>{fb.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
        <button className="btn b-or" style={{width:"100%",padding:"13px",fontSize:".9rem"}} onClick={onClose}>Got it</button>
      </div>
    </div>
  );
};

const AllRunsView = ({acts, hrProfile, onSelect, onClose}) => {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const mafHR = getMafHR(hrProfile, null);

  const filtered = useMemo(() => {
    let list = [...acts].sort((a,b)=>b.dateTs-a.dateTs);
    if (filter !== "all") list = list.filter(a=>a.type===filter);
    if (search.trim()) list = list.filter(a=>a.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [acts, filter, search]);

  const types = ["all", ...new Set(acts.map(a=>a.type))].filter((v,i,arr)=>arr.indexOf(v)===i);

  return (
    <div style={{position:"fixed",inset:0,zIndex:220,background:"var(--bg)",display:"flex",flexDirection:"column"}}>
      <div className="glass" style={{padding:"14px 18px 0",borderBottom:"1px solid var(--bd)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:"1.05rem"}}>All Runs</div>
          <button className="btn b-ghost" style={{padding:"6px 14px",fontSize:".82rem"}} onClick={onClose}>✕ Close</button>
        </div>
        <input className="inp" value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search runs…" style={{marginBottom:12}}/>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:12}}>
          {types.map(t=>(
            <button key={t} className={`pill ${filter===t?"on":""}`} onClick={()=>setFilter(t)}
              style={{flexShrink:0,padding:"4px 12px",fontSize:".72rem",textTransform:"capitalize"}}>
              {t==="all"?`All (${acts.length})`:t}
            </button>
          ))}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"12px 18px 32px"}}>
        {filtered.length===0 ? (
          <div style={{textAlign:"center",padding:"40px 0",color:"var(--tx2)"}}>
            <div style={{fontSize:"1.8rem",marginBottom:10}}>🔍</div>
            <div>No runs found</div>
          </div>
        ) : filtered.map((act,i)=>{
          const clr = ACT_CLR[act.type]||"#6b7280";
          const aboveMaf = act.avgHR && act.avgHR > mafHR;
          return (
            <div key={act.id} className="card2 tap" style={{padding:"13px 14px",marginBottom:9,cursor:"pointer"}} onClick={()=>{onSelect(act);onClose();}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:38,height:38,borderRadius:11,background:`${clr}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem",flexShrink:0}}>{ACT_ICN[act.type]||"🏃"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:".84rem",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:4}}>{act.name}</div>
                  <div style={{display:"flex",gap:10,fontSize:".7rem",color:"var(--tx2)"}}>
                    <span>{fmtDateS(act.date)}</span>
                    <span style={{color:clr,fontWeight:600}}>{fmtKm(act.distanceKm)} km</span>
                    <span>{fmtPace(act.avgPaceSecKm)}/km</span>
                    {act.avgHR&&<span style={{color:aboveMaf?"var(--yw)":"var(--gn)"}}>♥ {act.avgHR}</span>}
                  </div>
                </div>
                <div style={{fontSize:".72rem",color:"var(--tx3)"}}>›</div>
              </div>
            </div>
          );
        })}
        <div style={{textAlign:"center",fontSize:".72rem",color:"var(--tx3)",padding:"8px 0"}}>{filtered.length} of {acts.length} runs</div>
      </div>
    </div>
  );
};

const monthKeyOf = ts => { const d=new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const monthLabelOf = k => { if(!k)return""; const[y,m]=k.split("-").map(Number); return new Date(y,m-1,1).toLocaleDateString("en-GB",{month:"long",year:"numeric"}); };

const MonthlyReport = ({acts, hrProfile, onClose}) => {
  const mafHR = getMafHR(hrProfile, null);

  const currentMK = monthKeyOf(Date.now());
  const monthGroups = useMemo(() => {
    const map = {};
    acts.filter(a=>a.distanceKm>0).forEach(a=>{
      const mk = monthKeyOf(a.dateTs||new Date(a.date).getTime());
      if (mk >= currentMK) return; // exclude current month
      if (!map[mk]) map[mk]=[];
      map[mk].push(a);
    });
    return Object.entries(map).sort((a,b)=>b[0].localeCompare(a[0]));
  }, [acts, currentMK]);

  const [selected, setSelected] = useState(monthGroups[0]?.[0] || "");
  const monthRuns = useMemo(()=>(monthGroups.find(([k])=>k===selected)||[,""])[1]||[], [monthGroups, selected]);

  const stats = useMemo(()=>{
    if (!monthRuns.length) return null;
    const km = monthRuns.reduce((s,r)=>s+r.distanceKm,0);
    const timeSec = monthRuns.reduce((s,r)=>s+(r.movingTimeSec||0),0);
    const paceRuns = monthRuns.filter(r=>r.avgPaceSecKm>0);
    const avgPace = paceRuns.length ? paceRuns.reduce((s,r)=>s+r.avgPaceSecKm,0)/paceRuns.length : 0;
    const hrRuns = monthRuns.filter(r=>r.avgHR);
    const avgHR = hrRuns.length ? Math.round(hrRuns.reduce((s,r)=>s+r.avgHR,0)/hrRuns.length) : null;
    const elevGain = monthRuns.reduce((s,r)=>s+(r.elevGainM||0),0);
    const longest = monthRuns.reduce((b,r)=>r.distanceKm>b.distanceKm?r:b, monthRuns[0]);
    const fastest = paceRuns.length ? paceRuns.reduce((b,r)=>r.avgPaceSecKm<b.avgPaceSecKm?r:b, paceRuns[0]) : null;
    const weekSet = new Set(monthRuns.map(r=>{ const d=new Date(r.dateTs||r.date); d.setHours(0,0,0,0); d.setDate(d.getDate()-((d.getDay()+6)%7)); return d.getTime(); }));
    const aboveMaf = hrRuns.filter(r=>r.avgHR>mafHR).length;
    const hrRatio = hrRuns.length ? aboveMaf/hrRuns.length : 0;
    let coachSummary = "";
    if (monthRuns.length >= 8) coachSummary = "Strong consistency this month — great work!";
    else if (monthRuns.length <= 3) coachSummary = "Low run count — aim for 3+ runs per week.";
    else if (hrRatio > 0.6) coachSummary = "Training intensity was too high — more easy runs next month.";
    else if (hrRatio < 0.3 && hrRuns.length > 2) coachSummary = "Strong aerobic base building — keep this up.";
    else coachSummary = "Solid mixed training month. Stay consistent.";
    return { km, timeSec, avgPace, avgHR, elevGain, longest, fastest, count:monthRuns.length, activeWeeks:weekSet.size, hrRatio, coachSummary };
  }, [monthRuns, mafHR]);

  const exportTxt = () => {
    if (!stats) return;
    const rows = [
      `RUNLYTICS — Monthly Report`,
      `Month: ${monthLabelOf(selected)}`,
      `Generated: ${new Date().toLocaleString()}`,
      ``,
      `── SUMMARY ──────────────────────────`,
      `Runs:         ${stats.count}`,
      `Distance:     ${fmtKm(stats.km)} km`,
      `Time:         ${fmtDur(stats.timeSec)}`,
      `Avg Pace:     ${fmtPace(stats.avgPace)} /km`,
      `Avg HR:       ${stats.avgHR ? stats.avgHR+" bpm" : "—"}`,
      `Elev Gain:    ${Math.round(stats.elevGain)} m`,
      `Longest:      ${fmtKm(stats.longest.distanceKm)} km`,
      `Active Weeks: ${stats.activeWeeks}`,
      ``,
      `── COACH SUMMARY ────────────────────`,
      stats.coachSummary,
      ``,
      `── RUN LOG ──────────────────────────`,
      ...monthRuns.slice().sort((a,b)=>(a.dateTs||0)-(b.dateTs||0)).map(r=>
        `  ${fmtDateS(r.date).padEnd(9)} ${fmtKm(r.distanceKm).padStart(5)} km  ${fmtPace(r.avgPaceSecKm)}/km  ${r.name}`
      ),
    ];
    const blob = new Blob([rows.join("\n")], {type:"text/plain"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download=`runlytics-${selected}.txt`; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };

  const exportPdf = null; // removed to reduce file size;

  return (
    <div style={{position:"fixed",inset:0,zIndex:220,background:"var(--bg)",display:"flex",flexDirection:"column",overflowY:"auto"}}>
      <div className="glass" style={{position:"sticky",top:0,zIndex:10,padding:"14px 18px 12px",borderBottom:"1px solid var(--bd)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:"1.05rem"}}>Monthly Report</div>
          <button className="btn b-ghost" style={{padding:"6px 14px",fontSize:".82rem"}} onClick={onClose}>✕ Close</button>
        </div>
        {monthGroups.length > 0 ? (
          <select value={selected} onChange={e=>setSelected(e.target.value)}
            style={{width:"100%",padding:"9px 12px",borderRadius:10,fontSize:".86rem",fontFamily:"inherit"}}>
            {monthGroups.map(([k])=><option key={k} value={k}>{monthLabelOf(k)}</option>)}
          </select>
        ) : null}
      </div>

      <div style={{padding:"18px 18px 40px"}}>
        {monthGroups.length === 0 ? (
          <div style={{textAlign:"center",padding:"48px 0",color:"var(--tx2)"}}>
            <div style={{fontSize:"2rem",marginBottom:12}}>📅</div>
            <div style={{fontWeight:600,marginBottom:6}}>No completed months yet</div>
            <div style={{fontSize:".82rem",lineHeight:1.6}}>Monthly reports are available from the 1st of each month for the previous month.</div>
          </div>
        ) : !stats ? (
          <div style={{textAlign:"center",padding:"40px 0",color:"var(--tx2)"}}>No runs in {monthLabelOf(selected)}</div>
        ) : (<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            {[
              {l:"Distance",  v:fmtKm(stats.km),        u:"km",   c:"var(--or)"},
              {l:"Runs",      v:stats.count,              u:"",     c:"var(--bl)"},
              {l:"Total Time",v:fmtDur(stats.timeSec),   u:"",     c:"var(--gn)"},
              {l:"Avg Pace",  v:fmtPace(stats.avgPace),  u:"/km",  c:"var(--pu)"},
              {l:"Avg HR",    v:stats.avgHR||"—",         u:stats.avgHR?"bpm":"", c:"var(--rd)"},
              {l:"Elev Gain", v:Math.round(stats.elevGain), u:"m", c:"var(--cy)"},
            ].map(x=>(
              <div key={x.l} className="card2" style={{padding:"13px 14px"}}>
                <div className="mono" style={{fontSize:"1.4rem",fontWeight:700,color:x.c,lineHeight:1}}>{x.v}<span style={{fontSize:".62rem",color:"var(--tx2)",fontWeight:400,marginLeft:2}}>{x.u}</span></div>
                <div style={{fontSize:".64rem",color:"var(--tx2)",marginTop:5}}>{x.l}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{padding:16,marginBottom:14}}>
            <SectionHead title="Highlights"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{background:"var(--or3)",borderRadius:12,padding:12}}>
                <div style={{fontSize:".6rem",fontWeight:700,color:"var(--or)",marginBottom:5}}>🏆 LONGEST</div>
                <div className="mono" style={{fontSize:"1.3rem",fontWeight:700,color:"var(--or)"}}>{fmtKm(stats.longest.distanceKm)}<span style={{fontSize:".62rem",color:"var(--tx2)",fontWeight:400}}> km</span></div>
                <div style={{fontSize:".68rem",color:"var(--tx2)",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{stats.longest.name}</div>
              </div>
              {stats.fastest&&(
                <div style={{background:"var(--bl2)",borderRadius:12,padding:12}}>
                  <div style={{fontSize:".6rem",fontWeight:700,color:"var(--bl)",marginBottom:5}}>⚡ FASTEST</div>
                  <div className="mono" style={{fontSize:"1.3rem",fontWeight:700,color:"var(--bl)"}}>{fmtPace(stats.fastest.avgPaceSecKm)}<span style={{fontSize:".62rem",color:"var(--tx2)",fontWeight:400}}>/km</span></div>
                  <div style={{fontSize:".68rem",color:"var(--tx2)",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{stats.fastest.name}</div>
                </div>
              )}
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <SectionHead title="Coach Summary"/>
            <CoachCard insight={{type:"info",icon:"🧠",title:monthLabelOf(selected),detail:stats.coachSummary}} defaultOpen={true}/>
          </div>
          <div className="card" style={{padding:16,marginBottom:16}}>
            <SectionHead title="All Runs" sub={`${stats.count} total`}/>
            {monthRuns.slice().sort((a,b)=>b.dateTs-a.dateTs).map((r,i,arr)=>(
              <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:i<arr.length-1?"1px solid var(--bd)":"none",gap:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:".8rem",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                  <div style={{fontSize:".68rem",color:"var(--tx2)",marginTop:2}}>{fmtDateS(r.date)}</div>
                </div>
                <div style={{display:"flex",gap:10,fontSize:".74rem",flexShrink:0}}>
                  <span className="mono" style={{color:"var(--or)",fontWeight:600}}>{fmtKm(r.distanceKm)} km</span>
                  <span className="mono" style={{color:"var(--tx2)"}}>{fmtPace(r.avgPaceSecKm)}/km</span>
                </div>
              </div>
            ))}
          </div>

          <button className="btn b-ghost" style={{width:"100%",padding:"12px",fontSize:".86rem"}} onClick={exportTxt}>
            📄 Download Monthly Report (.txt)
          </button>
        </>)}
      </div>
    </div>
  );
};

const HomeTab = ({acts, analytics, goals, hrProfile, profile, tasks, onSelectAct, onUpload, onEditGoals, onViewAll, onViewMonthly}) => {
  const lastRun = acts.length ? acts.reduce((b,a)=>a.dateTs>b.dateTs?a:b) : null;
  const mafHR = getMafHR(hrProfile, null);
  const insight = useMemo(()=>getMafCoachingInsight(acts, hrProfile),[acts, hrProfile]);
  const recommendation = useMemo(()=>getTodayRecommendation(acts, hrProfile),[acts, hrProfile]);

  const weekStart = new Date(); weekStart.setHours(0,0,0,0); weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));
  const thisWeekKm = useMemo(()=>acts.filter(a=>new Date(a.dateTs)>=weekStart).reduce((s,a)=>s+a.distanceKm,0),[acts]);
  const weekPct = Math.min(1, thisWeekKm / goals.weekly);

  const todayStr = todayKey();
  const todayTasks = tasks.filter(t=>t.enabled).slice(0,3);
  const todayDone = todayTasks.filter(t=>t.completions?.[todayStr]).length;

  return (
    <div style={{padding:"4px 0 32px"}}>
      <div className="a0" style={{marginBottom:20,paddingTop:4}}>
        <div style={{fontSize:".72rem",color:"var(--tx3)",fontWeight:500,marginBottom:4}}>{greet()}</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{fontSize:"1.55rem",fontWeight:700,lineHeight:1.2}}>
            {profile.name === "Runner" ? "Welcome back 👋" : `Welcome back, ${profile.name} 👋`}
          </div>
          {analytics.streak >= 2 && (
            <div style={{
              display:"flex",flexDirection:"column",alignItems:"center",
              padding:"8px 12px",borderRadius:14,flexShrink:0,
              background:"rgba(249,115,22,.1)",border:"1.5px solid rgba(249,115,22,.25)",
              animation:"sparkle 2.5s ease-in-out infinite",
            }}>
              <span style={{fontSize:"1.4rem",lineHeight:1}}>🔥</span>
              <span className="mono" style={{fontSize:"1.1rem",fontWeight:800,color:"var(--or)",lineHeight:1,marginTop:2}}>{analytics.streak}</span>
              <span style={{fontSize:".52rem",color:"var(--or)",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em"}}>day{analytics.streak!==1?"s":""}</span>
            </div>
          )}
        </div>
        {analytics.streak === 1 && (
          <div style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:8,padding:"4px 12px",borderRadius:20,background:"rgba(249,115,22,.1)",border:"1px solid rgba(249,115,22,.2)"}}>
            <span>🔥</span>
            <span style={{fontSize:".76rem",fontWeight:600,color:"var(--or)"}}>1 day streak — keep it going!</span>
          </div>
        )}
      </div>
      <div className="a1" style={{marginBottom:14}}>
        <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:7}}>Today's Recommendation</div>
        <div style={{
          background:`${insightColors[recommendation.type]||"var(--tx2)"}09`,
          border:`1px solid ${insightColors[recommendation.type]||"var(--bd)"}30`,
          borderRadius:14,padding:"14px 16px",display:"flex",alignItems:"center",gap:13,
        }}>
          <span style={{fontSize:"1.5rem",lineHeight:1,flexShrink:0}}>{recommendation.icon}</span>
          <div>
            <div style={{fontWeight:700,fontSize:".95rem",color:"var(--tx)",marginBottom:3}}>{recommendation.title}</div>
            <div style={{fontSize:".78rem",color:"var(--tx2)",lineHeight:1.5}}>{recommendation.sub}</div>
          </div>
        </div>
      </div>
      {lastRun ? (
        <div className="card a2 tap" style={{padding:20,marginBottom:14,cursor:"pointer",background:`linear-gradient(135deg,var(--s1),var(--s2))`}} onClick={()=>onSelectAct(lastRun)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
            <div>
              <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:ACT_CLR[lastRun.type]||"var(--or)",marginBottom:4}}>
                {ACT_ICN[lastRun.type]} Last Run
              </div>
              <div style={{fontWeight:600,fontSize:".9rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{lastRun.name}</div>
              <div style={{fontSize:".72rem",color:"var(--tx2)",marginTop:2}}>{fmtDate(lastRun.date)}</div>
            </div>
            <span style={{background:`${ACT_CLR[lastRun.type]||"var(--or)"}18`,color:ACT_CLR[lastRun.type]||"var(--or)",padding:"3px 10px",borderRadius:20,fontSize:".68rem",fontWeight:700}}>{lastRun.runClass}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {[
              {l:"Distance",v:fmtKm(lastRun.distanceKm),u:"km",c:"var(--or)"},
              {l:"Pace",v:fmtPace(lastRun.avgPaceSecKm),u:"/km",c:"var(--tx)"},
              {l:"Avg HR",v:lastRun.avgHR||"—",u:lastRun.avgHR?"bpm":"",c:lastRun.avgHR&&lastRun.avgHR>mafHR?"var(--yw)":"var(--gn)"},
            ].map(s=>(
              <div key={s.l} style={{textAlign:"center",padding:"10px 8px",background:"rgba(0,0,0,.25)",borderRadius:12}}>
                <div className="mono" style={{fontSize:"1.2rem",fontWeight:700,color:s.c,lineHeight:1}}>{s.v}<span style={{fontSize:".58rem",color:"var(--tx2)",fontWeight:400,marginLeft:2}}>{s.u}</span></div>
                <div style={{fontSize:".6rem",color:"var(--tx3)",marginTop:4}}>{s.l}</div>
              </div>
            ))}
          </div>
          {acts.length>1&&<div style={{marginTop:10,textAlign:"center",fontSize:".7rem",color:"var(--tx3)"}}>
            <span className="tap" style={{color:"var(--or)",fontWeight:600}} onClick={e=>{e.stopPropagation();onViewAll();}}>View all {acts.length} runs →</span>
          </div>}
        </div>
      ) : (
        <div className="card a2" style={{padding:24,textAlign:"center",marginBottom:14,borderStyle:"dashed"}}>
          <div style={{fontSize:"2.5rem",marginBottom:12}}>🏃</div>
          <div style={{fontWeight:600,marginBottom:6}}>No runs yet</div>
          <div style={{fontSize:".82rem",color:"var(--tx2)",marginBottom:16}}>Upload your first GPX file to get started</div>
          <button className="btn b-or" style={{padding:"11px 24px",fontSize:".86rem"}} onClick={onUpload}>Upload GPX</button>
        </div>
      )}
      <div className="a3" style={{marginBottom:14}}>
        <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:7}}>Coach Insight</div>
        <CoachCard insight={insight}/>
      </div>
      <div className="card a4" style={{padding:18,marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <Ring pct={weekPct} size={72} color={weekPct>=1?"var(--gn)":"var(--or)"}>
            <span style={{fontSize:".62rem",fontWeight:700,color:weekPct>=1?"var(--gn)":"var(--or)"}}>{Math.round(weekPct*100)}%</span>
          </Ring>
          <div style={{flex:1}}>
            <div style={{fontSize:".65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:6}}>Weekly Goal</div>
            <div style={{fontWeight:700,fontSize:"1.2rem",lineHeight:1,marginBottom:4}}>
              <span className="mono" style={{color:"var(--or)"}}>{fmtKm(thisWeekKm)}</span>
              <span style={{fontSize:".76rem",color:"var(--tx2)",fontWeight:400}}> / {goals.weekly} km</span>
            </div>
            {weekPct>=1
              ? <span style={{background:"var(--gn2)",color:"var(--gn)",padding:"2px 10px",borderRadius:20,fontSize:".68rem",fontWeight:700}}>✓ Goal reached!</span>
              : <div style={{fontSize:".75rem",color:"var(--tx2)"}}>{parseFloat((goals.weekly-thisWeekKm).toFixed(1))} km to go</div>
            }
          </div>
          <button className="tap" style={{background:"none",border:"none",color:"var(--tx3)",fontSize:".8rem",padding:4}} onClick={onEditGoals}>Edit</button>
        </div>
      </div>
      {todayTasks.length > 0 && (
        <div className="card a5" style={{padding:18}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:".65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)"}}>Today's Habits</div>
            <span style={{fontSize:".7rem",color:"var(--tx2)"}}>{todayDone}/{todayTasks.length} done</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {todayTasks.map(t=>{
              const done = !!t.completions?.[todayStr];
              return(
                <div key={t.id} style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:20,height:20,borderRadius:6,border:`2px solid ${done?"var(--gn)":"var(--bd2)"}`,background:done?"var(--gn)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {done&&<span style={{fontSize:".62rem",color:"#fff",fontWeight:700}}>✓</span>}
                  </div>
                  <span style={{fontSize:".82rem",color:done?"var(--tx3)":"var(--tx)",textDecoration:done?"line-through":"none",flex:1}}>{t.title}</span>
                  {t.streak>0&&<span style={{fontSize:".7rem",color:"var(--or)"}}>🔥{t.streak}</span>}
                </div>
              );
            })}
          </div>
          <div style={{marginTop:14}}>
            <div className="pb"><div className="pf" style={{width:`${(todayDone/todayTasks.length)*100}%`,background:"var(--gn)"}}/></div>
          </div>
        </div>
      )}
      {acts.length > 0 && (
        <div className="a5" style={{marginTop:14}}>
          <button className="btn b-ghost" style={{width:"100%",padding:"12px",fontSize:".82rem",gap:8,borderRadius:14}}
            onClick={onViewMonthly}>
            📅 Monthly Report
          </button>
        </div>
      )}
    </div>
  );
};

const StatsTab = ({acts, analytics, hrProfile, onViewAll, onViewMonthly}) => {
  const [range, setRange] = useState(8);
  const runs = acts.filter(a=>a.type==="Run"||a.type==="Walk");
  const totalKm = runs.reduce((s,a)=>s+a.distanceKm,0);
  const totalTime = runs.reduce((s,a)=>s+a.movingTimeSec,0);
  const weeklyData = analytics.weekly.slice(-range);

  const prs = runs.length ? {
    longest: runs.reduce((b,r)=>r.distanceKm>b.distanceKm?r:b),
    fastest: runs.filter(r=>r.avgPaceSecKm>0).reduce((b,r)=>r.avgPaceSecKm<b.avgPaceSecKm?r:b, runs.find(r=>r.avgPaceSecKm>0)||runs[0]),
    bestLoad: runs.reduce((b,r)=>r.trainingLoad>b.trainingLoad?r:b),
  } : null;

  const paceTrend = runs.filter(r=>r.avgPaceSecKm>0).slice(-16).map(r=>({
    date:fmtDateS(r.date),
    pace:parseFloat((r.avgPaceSecKm/60).toFixed(2)),
  }));

  return (
    <div style={{padding:"4px 0 32px"}}>
      <div className="a0" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:20}}>
        {[
          {l:"Total km",v:parseFloat(totalKm.toFixed(0)).toLocaleString(),c:"var(--or)"},
          {l:"Runs",v:runs.length,c:"var(--bl)"},
          {l:"Time",v:fmtDur(totalTime),c:"var(--gn)"},
        ].map(s=>(
          <div key={s.l} className="card2" style={{padding:"14px 10px",textAlign:"center"}}>
            <div className="mono" style={{fontSize:"1.35rem",fontWeight:700,color:s.c,lineHeight:1}}>{s.v}</div>
            <div style={{fontSize:".62rem",color:"var(--tx2)",marginTop:5}}>{s.l}</div>
          </div>
        ))}
      </div>
      {weeklyData.length > 1 && (
        <div className="card a1" style={{padding:18,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:".65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)"}}>Weekly Distance</div>
            <div style={{display:"flex",gap:5}}>
              {[4,8,12].map(w=>(
                <button key={w} className={`pill ${range===w?"on":""}`} style={{padding:"3px 10px",fontSize:".68rem"}} onClick={()=>setRange(w)}>{w}w</button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={weeklyData} barSize={20} margin={{top:0,right:0,bottom:0,left:-28}}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" vertical={false}/>
              <XAxis dataKey="label" tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false}/>
              <Tooltip content={({active,payload,label})=>active&&payload?.length?(
                <div style={{background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:10,padding:"8px 12px"}}>
                  <div style={{fontSize:".65rem",color:"var(--tx2)",marginBottom:3}}>{label}</div>
                  <div className="mono" style={{color:"var(--or)",fontSize:"1rem"}}>{payload[0]?.value} km</div>
                  <div style={{fontSize:".65rem",color:"var(--tx2)"}}>{payload[0]?.payload?.count} run{payload[0]?.payload?.count!==1?"s":""}</div>
                </div>
              ):null}/>
              <Bar dataKey="km" fill="var(--or)" radius={[5,5,0,0]} fillOpacity={.85}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {paceTrend.length > 2 && (
        <div className="card a2" style={{padding:18,marginBottom:14}}>
          <SectionHead title="Pace Trend" sub="Most recent runs"/>
          <ResponsiveContainer width="100%" height={100}>
            <AreaChart data={paceTrend} margin={{top:4,right:0,bottom:0,left:-30}}>
              <defs><linearGradient id="pt" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={.15}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" vertical={false}/>
              <XAxis dataKey="date" tick={{fill:"var(--tx3)",fontSize:8}} axisLine={false} tickLine={false}/>
              <YAxis reversed domain={["auto","auto"]} tick={{fill:"var(--tx3)",fontSize:8}} axisLine={false} tickLine={false}
                tickFormatter={v=>`${Math.floor(v)}:${Math.round((v%1)*60).toString().padStart(2,"0")}`}/>
              <Tooltip content={({active,payload})=>active&&payload?.length?(
                <div style={{background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:10,padding:"8px 12px"}}>
                  <div className="mono" style={{color:"var(--bl)",fontSize:".95rem"}}>{Math.floor(payload[0].value)}:{Math.round((payload[0].value%1)*60).toString().padStart(2,"0")}/km</div>
                </div>
              ):null}/>
              <Area type="monotone" dataKey="pace" stroke="var(--bl)" strokeWidth={2} fill="url(#pt)" dot={{r:3,fill:"var(--bl)",strokeWidth:0}}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {prs && (
        <div className="card a3" style={{padding:18,marginBottom:14}}>
          <SectionHead title="Personal Records"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[
              {l:"🏆 Longest",v:fmtKm(prs.longest?.distanceKm||0),u:"km",c:"var(--or)",sub:prs.longest?fmtDateS(prs.longest.date):""},
              {l:"⚡ Best Pace",v:fmtPace(prs.fastest?.avgPaceSecKm||0),u:"/km",c:"var(--bl)",sub:prs.fastest?fmtDateS(prs.fastest.date):""},
            ].map(s=>(
              <div key={s.l} className="card3" style={{padding:"14px 12px"}}>
                <div style={{fontSize:".62rem",color:"var(--tx3)",marginBottom:8}}>{s.l}</div>
                <div className="mono" style={{fontSize:"1.5rem",fontWeight:700,color:s.c,lineHeight:1}}>{s.v}<span style={{fontSize:".62rem",color:"var(--tx2)",fontWeight:400,marginLeft:2}}>{s.u}</span></div>
                <div style={{fontSize:".65rem",color:"var(--tx3)",marginTop:5}}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {analytics.prediction && (
        <div className="card a4" style={{padding:18,marginBottom:14}}>
          <SectionHead title="Race Predictions" sub="Based on recent fitness"/>
          <div style={{display:"flex",flexDirection:"column",gap:0}}>
            {Object.entries(analytics.prediction).filter(([k])=>k!=="Avg Pace").map(([dist,time],i,arr)=>(
              <div key={dist} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0",borderBottom:i<arr.length-1?"1px solid var(--bd)":"none"}}>
                <div style={{fontSize:".82rem",color:"var(--tx2)"}}>{dist}</div>
                <div className="mono" style={{fontSize:".96rem",fontWeight:700,color:"var(--or)"}}>{time}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {analytics.monthly?.length > 0 && (
        <div className="card a5" style={{padding:18}}>
          <SectionHead title="Monthly Breakdown"/>
          <div style={{display:"flex",flexDirection:"column",gap:0}}>
            {[...analytics.monthly].reverse().slice(0,4).map((m,i,arr)=>(
              <div key={m.month} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0",borderBottom:i<arr.length-1?"1px solid var(--bd)":"none"}}>
                <div>
                  <div style={{fontSize:".82rem",fontWeight:500}}>{new Date(m.month+"-01").toLocaleDateString("en-GB",{month:"long",year:"numeric"})}</div>
                  <div style={{fontSize:".68rem",color:"var(--tx2)",marginTop:2}}>{m.count} run{m.count!==1?"s":""}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div className="mono" style={{fontSize:".96rem",fontWeight:700,color:"var(--or)"}}>{fmtKm(m.km)} km</div>
                  {m.kmDelta!==null&&<div style={{fontSize:".68rem",color:m.kmDelta>=0?"var(--gn)":"var(--rd)",marginTop:2}}>{m.kmDelta>=0?"↑":"↓"}{Math.abs(m.kmDelta)}%</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!runs.length && (
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--tx2)"}}>
          <div style={{fontSize:"2.5rem",marginBottom:12}}>📊</div>
          <div style={{fontWeight:600,marginBottom:6}}>No data yet</div>
          <div style={{fontSize:".82rem"}}>Upload runs to see your stats</div>
        </div>
      )}
      {runs.length > 0 && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:8}}>
          <button className="btn b-ghost" style={{padding:"12px",fontSize:".8rem",borderRadius:14}} onClick={onViewAll}>
            🏃 All Runs ({acts.length})
          </button>
          <button className="btn b-ghost" style={{padding:"12px",fontSize:".8rem",borderRadius:14}} onClick={onViewMonthly}>
            📅 Monthly Report
          </button>
        </div>
      )}
    </div>
  );
};

const HRInsightsTab = ({acts, hrProfile, onEditHR}) => {
  const mafHR = getMafHR(hrProfile, null);
  const mafZones = getMafZones(mafHR);
  const runsWithHR = acts.filter(a=>a.avgHR&&a.distanceKm>0);
  const last5 = runsWithHR.slice(0,5);

  const aggZones = useMemo(()=>{
    if (!last5.length) return null;
    const allSecs = [0,0,0,0,0];
    let totalSec = 0;
    last5.forEach(r=>{
      const z = computeZones(r.hrSamples, mafHR);
      if (z) z.forEach((zone,i)=>{allSecs[i]+=zone.minutes*60;totalSec+=zone.minutes*60;});
    });
    if (!totalSec) return null;
    return mafZones.map((z,i)=>({...z,pct:Math.round(allSecs[i]/totalSec*100),minutes:parseFloat((allSecs[i]/60).toFixed(1))}));
  },[last5, mafHR]);

  const hrTrend = runsWithHR.slice().reverse().slice(-16).map(r=>({
    date:fmtDateS(r.date),hr:r.avgHR,maf:mafHR
  }));

  const verdict = useMemo(()=>{
    if (!last5.length) return {text:"No HR data",color:"var(--tx3)",icon:"❓"};
    const aboveMaf = last5.filter(r=>r.avgHR>mafHR).length;
    const ratio = aboveMaf/last5.length;
    if (ratio>=0.8) return {text:"Training Too Hard",color:"var(--rd)",icon:"🔴",bg:"var(--rd2)"};
    if (ratio>=0.5) return {text:"Mixed Intensity",color:"var(--yw)",icon:"🟡",bg:"var(--yw2)"};
    if (ratio<=0.2) return {text:"Great Aerobic Training",color:"var(--gn)",icon:"🟢",bg:"var(--gn2)"};
    return {text:"Good Balance",color:"var(--bl)",icon:"🔵",bg:"var(--bl2)"};
  },[last5, mafHR]);

  const insights = getMafCoachingInsight(acts, hrProfile);

  return (
    <div style={{padding:"4px 0 32px"}}>
      <div className="card a0" style={{padding:22,marginBottom:14,background:"linear-gradient(135deg,var(--s1),var(--s2))"}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{width:70,height:70,borderRadius:20,background:"rgba(249,115,22,.12)",border:"1px solid rgba(249,115,22,.2)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <div className="mono" style={{fontSize:"1.6rem",fontWeight:700,color:"var(--or)",lineHeight:1}}>{mafHR}</div>
            <div style={{fontSize:".52rem",color:"var(--or)",fontWeight:600,opacity:.7,marginTop:3}}>BPM</div>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:5}}>Your MAF Heart Rate</div>
            <div style={{fontWeight:700,fontSize:"1rem",marginBottom:4}}>Aerobic Training Zone</div>
            <div style={{fontSize:".75rem",color:"var(--tx2)",lineHeight:1.5}}>
              {hrProfile?.age ? `180 − ${hrProfile.age} = ${mafHR} bpm` : "Set your age in Settings"}
              <br/>Stay below this to build aerobic base
            </div>
          </div>
        </div>
        {!hrProfile?.age && (
          <button className="btn b-or" style={{width:"100%",marginTop:14,padding:"11px",fontSize:".86rem"}} onClick={onEditHR}>
            Set Up MAF Profile →
          </button>
        )}
      </div>
      {last5.length > 0 && (
        <div className="card a1" style={{padding:18,marginBottom:14,background:verdict.bg||"var(--s1)"}}>
          <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:10}}>Training Quality · Last {last5.length} Runs</div>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{fontSize:"2rem"}}>{verdict.icon}</div>
            <div>
              <div style={{fontSize:"1.1rem",fontWeight:700,color:verdict.color}}>{verdict.text}</div>
              <div style={{fontSize:".76rem",color:"var(--tx2)",marginTop:3}}>
                {last5.filter(r=>r.avgHR<=mafHR).length}/{last5.length} runs at or below MAF HR
              </div>
            </div>
          </div>
        </div>
      )}
      {aggZones && (
        <div className="card a2" style={{padding:18,marginBottom:14}}>
          <SectionHead title="Zone Distribution" sub={`Averaged over last ${last5.length} runs`}/>
          {aggZones.map((z,i)=>(
            <div key={z.zone} style={{marginBottom:i<4?13:0}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <Dot color={z.color} size={8}/>
                  <span style={{fontSize:".8rem",fontWeight:600}}>{z.zone}</span>
                  <span style={{fontSize:".72rem",color:"var(--tx2)"}}>{z.label}</span>
                  <span style={{fontSize:".6rem",color:"var(--tx3)"}}>
                    {z.hi===999?`>${z.bpmLo||Math.round(z.lo)} bpm`:`${z.bpmLo||Math.round(z.lo)}–${z.bpmHi||Math.round(z.hi)} bpm`}
                  </span>
                </div>
                <div className="mono" style={{fontSize:".9rem",fontWeight:700,color:z.color}}>{z.pct}%</div>
              </div>
              <div className="pb"><div className="pf" style={{width:`${z.pct}%`,background:z.color}}/></div>
            </div>
          ))}
          <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid var(--bd)"}}>
            <div style={{fontSize:".65rem",fontWeight:700,color:"var(--tx3)",marginBottom:8,textTransform:"uppercase",letterSpacing:".06em"}}>MAF zone boundaries</div>
            <div style={{display:"flex",gap:3,overflowX:"auto"}}>
              {getMafZones(mafHR).map(z=>(
                <div key={z.zone} style={{flex:1,textAlign:"center",padding:"6px 2px",background:`${z.color}10`,borderRadius:8,border:`1px solid ${z.color}22`,minWidth:52}}>
                  <div style={{fontSize:".62rem",fontWeight:700,color:z.color,marginBottom:2}}>{z.zone}</div>
                  <div style={{fontSize:".52rem",color:"var(--tx3)",lineHeight:1.4}}>
                    {z.hi===999?`>${Math.round(z.lo)}`:`${Math.round(z.lo)}–${Math.round(z.hi)}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {hrTrend.length > 2 && (
        <div className="card a3" style={{padding:18,marginBottom:14}}>
          <SectionHead title="HR Trend" sub="Avg HR per run vs MAF"/>
          <ResponsiveContainer width="100%" height={110}>
            <AreaChart data={hrTrend} margin={{top:4,right:0,bottom:0,left:-28}}>
              <defs>
                <linearGradient id="hr-g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={.2}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" vertical={false}/>
              <XAxis dataKey="date" tick={{fill:"var(--tx3)",fontSize:8}} axisLine={false} tickLine={false}/>
              <YAxis domain={["auto","auto"]} tick={{fill:"var(--tx3)",fontSize:8}} axisLine={false} tickLine={false}/>
              <ReferenceLine y={mafHR} stroke="var(--or)" strokeDasharray="4 2" strokeWidth={1.5}
                label={{value:"MAF",position:"right",fontSize:8,fill:"var(--or)"}}/>
              <Tooltip content={({active,payload})=>active&&payload?.length?(
                <div style={{background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:10,padding:"8px 12px"}}>
                  <div className="mono" style={{color:"var(--rd)",fontSize:".95rem"}}>{payload[0]?.value} bpm</div>
                  <div style={{fontSize:".65rem",color:"var(--tx2)"}}>MAF: {mafHR} bpm</div>
                </div>
              ):null}/>
              <Area type="monotone" dataKey="hr" stroke="var(--rd)" strokeWidth={2} fill="url(#hr-g)" dot={{r:3,fill:"var(--rd)",strokeWidth:0}}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="a4" style={{marginBottom:14}}>
        <SectionHead title="Coach Assessment"/>
        <CoachCard insight={insights}/>
      </div>
      {runsWithHR.slice(0,5).length > 0 && (
        <div className="card a5" style={{padding:18}}>
          <SectionHead title="Recent HR Data"/>
          {runsWithHR.slice(0,5).map((r,i,arr)=>{
            const zones = computeZones(r.hrSamples, mafHR);
            const aboveMaf = r.avgHR > mafHR;
            return(
              <div key={r.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",borderBottom:i<arr.length-1?"1px solid var(--bd)":"none"}}>
                <div style={{width:36,height:36,borderRadius:10,background:aboveMaf?"var(--rd2)":"var(--gn2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".8rem",flexShrink:0}}>
                  {aboveMaf?"🔴":"🟢"}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:".8rem",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                  <div style={{fontSize:".68rem",color:"var(--tx2)",marginTop:2}}>{fmtDateS(r.date)} · {fmtKm(r.distanceKm)} km</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div className="mono" style={{fontSize:".88rem",fontWeight:700,color:aboveMaf?"var(--rd)":"var(--gn)"}}>{r.avgHR} bpm</div>
                  <div style={{fontSize:".62rem",color:"var(--tx2)",marginTop:2}}>{aboveMaf?`+${r.avgHR-mafHR} over MAF`:`${mafHR-r.avgHR} below MAF`}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!runsWithHR.length && (
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--tx2)"}}>
          <div style={{fontSize:"2.5rem",marginBottom:12}}>❤️</div>
          <div style={{fontWeight:600,marginBottom:6}}>No HR data yet</div>
          <div style={{fontSize:".82rem",marginBottom:14}}>Upload GPX files with heart rate from a GPS watch</div>
          {!hrProfile?.age && <button className="btn b-or" style={{padding:"10px 22px"}} onClick={onEditHR}>Set up MAF Profile</button>}
        </div>
      )}
    </div>
  );
};

const TASK_COLORS = {hr:"var(--rd)",run:"var(--or)",recovery:"var(--gn)",load:"var(--yw)",wellness:"var(--bl)"};

const TasksTab = ({tasks, setTasks, hrProfile, acts}) => {
  const todayStr = todayKey();
  const mafHR = getMafHR(hrProfile, null);

  const toggle = (id) => {
    const updated = tasks.map(t=>{
      if (t.id!==id) return t;
      const alreadyDone = !!t.completions?.[todayStr];
      const completions = {...t.completions};
      if (alreadyDone) { delete completions[todayStr]; }
      else { completions[todayStr] = true; }
      return {...t, completions, streak:getStreak(completions)};
    });
    setTasks(updated);
    saveTasks(updated);
  };

  const todayDone = tasks.filter(t=>t.enabled&&t.completions?.[todayStr]).length;
  const totalEnabled = tasks.filter(t=>t.enabled).length;

  const last7 = Array.from({length:7},(_,i)=>{
    const d = new Date(); d.setDate(d.getDate()-(6-i)); d.setHours(0,0,0,0);
    return {key:d.toISOString().split("T")[0],label:d.toLocaleDateString("en-GB",{weekday:"short"}).slice(0,1)};
  });

  return (
    <div style={{padding:"4px 0 32px"}}>
      <div className="a0" style={{marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:10}}>
          <div>
            <div style={{fontSize:".65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:4}}>Today's Habits</div>
            <div style={{fontSize:"1.4rem",fontWeight:700,lineHeight:1}}>
              <span className="mono" style={{color:todayDone===totalEnabled?"var(--gn)":"var(--or)"}}>{todayDone}</span>
              <span style={{fontSize:"1rem",color:"var(--tx2)",fontWeight:400}}> / {totalEnabled}</span>
            </div>
          </div>
          <Ring pct={totalEnabled>0?todayDone/totalEnabled:0} size={56} color={todayDone===totalEnabled?"var(--gn)":"var(--or)"}>
            <span style={{fontSize:".58rem",fontWeight:700,color:todayDone===totalEnabled?"var(--gn)":"var(--or)"}}>{totalEnabled>0?Math.round(todayDone/totalEnabled*100):0}%</span>
          </Ring>
        </div>
        <div className="pb" style={{height:4}}>
          <div className="pf" style={{width:`${totalEnabled>0?todayDone/totalEnabled*100:0}%`,background:todayDone===totalEnabled?"var(--gn)":"var(--or)"}}/>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
        {tasks.filter(t=>t.enabled).map((task,i)=>{
          const done = !!task.completions?.[todayStr];
          const color = TASK_COLORS[task.category] || "var(--tx2)";
          const maxStreak = Math.max(...tasks.map(t=>t.streak));

          const detail = task.category==="hr" && hrProfile?.age
            ? `MAF = ${mafHR} bpm · Stay below this`
            : task.desc;

          return(
            <div key={task.id} className={`card tap a${Math.min(i,5)}`}
              style={{padding:"16px 16px",borderColor:done?`${color}35`:"var(--bd)",background:done?`${color}08`:"var(--s1)",transition:"all .2s"}}
              onClick={()=>toggle(task.id)}>
              <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
                <div style={{width:26,height:26,borderRadius:8,border:`2.5px solid ${done?color:"var(--bd2)"}`,background:done?color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1,transition:"all .18s"}}>
                  {done&&<span style={{color:"#fff",fontSize:".72rem",fontWeight:700}}>✓</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                    <div>
                      <div style={{fontSize:".9rem",fontWeight:600,textDecoration:done?"line-through":"none",color:done?"var(--tx2)":"var(--tx)",marginBottom:3}}>
                        {task.icon} {task.title}
                      </div>
                      <div style={{fontSize:".74rem",color:"var(--tx3)",lineHeight:1.4}}>{detail}</div>
                    </div>
                    {task.streak>0&&(
                      <div style={{textAlign:"center",flexShrink:0}}>
                        <div style={{fontSize:".82rem"}}>🔥</div>
                        <div className="mono" style={{fontSize:".72rem",fontWeight:700,color:"var(--or)",lineHeight:1}}>{task.streak}</div>
                      </div>
                    )}
                  </div>
                  <div style={{display:"flex",gap:4,marginTop:10}}>
                    {last7.map(({key,label})=>{
                      const completed = !!task.completions?.[key];
                      const isToday = key===todayStr;
                      return(
                        <div key={key} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:completed?color:isToday?"var(--bd2)":"var(--bd)",border:isToday?`1px solid ${color}50`:"none",transition:"background .2s"}}/>
                          <div style={{fontSize:".48rem",color:"var(--tx3)"}}>{label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {tasks.some(t=>t.streak>0) && (
        <div className="card a5" style={{padding:18}}>
          <SectionHead title="Streak Tracker"/>
          {tasks.filter(t=>t.streak>0).sort((a,b)=>b.streak-a.streak).map((t,i)=>(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:i<tasks.filter(tt=>tt.streak>0).length-1?"1px solid var(--bd)":"none"}}>
              <div style={{fontSize:".8rem",width:18,textAlign:"center",color:"var(--tx3)"}}>#{i+1}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:".82rem",fontWeight:500}}>{t.icon} {t.title}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <span style={{fontSize:".9rem"}}>🔥</span>
                <span className="mono" style={{fontSize:".96rem",fontWeight:700,color:"var(--or)"}}>{t.streak}</span>
                <span style={{fontSize:".68rem",color:"var(--tx3)"}}>days</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SettingsPanel = ({acts, goals, hrProfile, profile, onSaveGoals, onSaveHR, onSaveProfile, onClearAll, onClose}) => {
  const [view, setView] = useState("main"); // main | goals | hr | profile
  const [age, setAge] = useState(hrProfile.age||"");
  const [override, setOverride] = useState(hrProfile.maxHROverride||"");
  const [useOverride, setUseOverride] = useState(!!hrProfile.maxHROverride);
  const [weekly, setWeekly] = useState(goals.weekly);
  const [monthly, setMonthly] = useState(goals.monthly);
  const [name, setName] = useState(profile.name||"Runner");

  const ageNum = parseInt(age)||null;
  const previewMaf = useOverride&&parseInt(override) ? parseInt(override) : ageNum ? 180-ageNum : null;

  return(
    <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(0,0,0,.6)"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="glass" style={{width:"100%",maxWidth:430,borderRadius:"24px 24px 0 0",padding:"24px 20px 40px",maxHeight:"92vh",overflowY:"auto",border:"1px solid var(--bd)"}}>
        <div style={{width:36,height:4,borderRadius:2,background:"var(--bd2)",margin:"0 auto 20px"}}/>

        {view==="main"&&(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{fontWeight:700,fontSize:"1.05rem"}}>Settings</div>
              <button className="btn b-ghost" style={{padding:"6px 13px",fontSize:".8rem"}} onClick={onClose}>Done</button>
            </div>
            {[
              {icon:"👤",label:"Profile & Name",onClick:()=>setView("profile")},
              {icon:"❤️",label:"MAF HR Profile",onClick:()=>setView("hr")},
              {icon:"🎯",label:"Distance Goals",onClick:()=>setView("goals")},
            ].map((item,i)=>(
              <div key={item.label} className="tap card2" style={{padding:"15px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:14,borderRadius:14}} onClick={item.onClick}>
                <div style={{width:38,height:38,borderRadius:11,background:"var(--s3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem"}}>{item.icon}</div>
                <div style={{flex:1,fontWeight:500,fontSize:".88rem"}}>{item.label}</div>
                <div style={{color:"var(--tx3)",fontSize:".8rem"}}>›</div>
              </div>
            ))}
            <div className="card2" style={{padding:16,marginBottom:10,borderRadius:14}}>
              <div style={{fontSize:".65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:10}}>Library</div>
              {[["Activities",acts.length],["Storage",`${Math.round(JSON.stringify(acts).length/1024)} KB`]].map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0"}}>
                  <span style={{fontSize:".8rem",color:"var(--tx2)"}}>{l}</span>
                  <span className="mono" style={{fontSize:".8rem",fontWeight:600}}>{v}</span>
                </div>
              ))}
            </div>
            <button className="btn b-danger" style={{width:"100%",padding:"12px",fontSize:".84rem",marginTop:6}} onClick={onClearAll}>🗑 Delete All Activities</button>
          </>
        )}

        {view==="profile"&&(
          <>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
              <button className="tap" style={{background:"none",border:"none",color:"var(--tx2)",fontSize:"1.1rem"}} onClick={()=>setView("main")}>‹</button>
              <div style={{fontWeight:700,fontSize:"1.05rem"}}>Profile</div>
            </div>
            <label style={{fontSize:".76rem",fontWeight:600,display:"block",marginBottom:7}}>Your name</label>
            <input className="inp" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Alex" style={{marginBottom:18}}/>
            <button className="btn b-or" style={{width:"100%",padding:"12px",fontSize:".88rem"}} onClick={()=>{onSaveProfile({name:name||"Runner"});setView("main");}}>Save</button>
          </>
        )}

        {view==="hr"&&(
          <>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
              <button className="tap" style={{background:"none",border:"none",color:"var(--tx2)",fontSize:"1.1rem"}} onClick={()=>setView("main")}>‹</button>
              <div style={{fontWeight:700,fontSize:"1.05rem"}}>MAF HR Profile</div>
            </div>
            <label style={{fontSize:".76rem",fontWeight:600,display:"block",marginBottom:7}}>Age <span style={{color:"var(--or)"}}>*</span> <span style={{color:"var(--tx2)",fontWeight:400}}>· Used for 180−age formula</span></label>
            <input className="inp" type="number" min="10" max="100" placeholder="e.g. 32" value={age} onChange={e=>setAge(e.target.value)} style={{marginBottom:ageNum?"6px":"16px"}}/>
            {ageNum&&!useOverride&&<div style={{fontSize:".72rem",color:"var(--gn)",marginBottom:14}}>✓ MAF HR: <strong>{180-ageNum} bpm</strong></div>}

            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:useOverride?10:18}}>
              <button className="tog" style={{background:useOverride?"var(--or)":"var(--bd2)"}} onClick={()=>setUseOverride(v=>!v)}>
                <div className="tog-knob" style={{left:useOverride?19:3}}/>
              </button>
              <div style={{fontSize:".78rem",fontWeight:500}}>Custom MAF HR override</div>
            </div>
            {useOverride&&(
              <input className="inp" type="number" min="100" max="220" placeholder="e.g. 148" value={override} onChange={e=>setOverride(e.target.value)} style={{marginBottom:16}}/>
            )}

            {previewMaf&&(
              <div style={{marginBottom:18,padding:"12px 14px",background:"var(--or3)",border:"1px solid var(--or2)",borderRadius:12}}>
                <div style={{fontSize:".7rem",color:"var(--or)",fontWeight:600,marginBottom:8}}>Zone Preview · MAF = {previewMaf} bpm</div>
                {getMafZones(previewMaf).map(z=>(
                  <div key={z.zone} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                    <Dot color={z.color} size={7}/>
                    <span style={{fontSize:".72rem",flex:1}}>{z.zone} {z.label}</span>
                    <span style={{fontSize:".72rem",color:z.color,fontWeight:600}}>
                      {z.hi===999?`> ${Math.round(z.lo)}`:`${Math.round(z.lo)}–${Math.round(z.hi)}`} bpm
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <button className="btn b-ghost" style={{padding:"12px 16px"}} onClick={()=>{onSaveHR({age:null,restingHR:null,maxHROverride:null});setView("main");}}>Clear</button>
              <button className="btn b-or" style={{flex:1,padding:"12px"}} onClick={()=>{onSaveHR({age:ageNum,restingHR:null,maxHROverride:useOverride&&parseInt(override)?parseInt(override):null});setView("main");}}>Save Profile</button>
            </div>
          </>
        )}

        {view==="goals"&&(
          <>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
              <button className="tap" style={{background:"none",border:"none",color:"var(--tx2)",fontSize:"1.1rem"}} onClick={()=>setView("main")}>‹</button>
              <div style={{fontWeight:700,fontSize:"1.05rem"}}>Distance Goals</div>
            </div>
            {[["Weekly goal (km)",weekly,setWeekly],["Monthly goal (km)",monthly,setMonthly]].map(([l,v,sv])=>(
              <div key={l} style={{marginBottom:18}}>
                <label style={{fontSize:".76rem",fontWeight:600,display:"block",marginBottom:7}}>{l}</label>
                <input className="inp" type="number" min="1" max="500" value={v} onChange={e=>sv(Number(e.target.value))}/>
              </div>
            ))}
            <button className="btn b-or" style={{width:"100%",padding:"12px",fontSize:".88rem"}} onClick={()=>{onSaveGoals({weekly:Number(weekly),monthly:Number(monthly)});setView("main");}}>Save Goals</button>
          </>
        )}
      </div>
    </div>
  );
};

const AchievementsTab = ({earnedBadges, acts, analytics}) => {
  const totalKm = useMemo(()=>acts.reduce((s,r)=>s+r.distanceKm,0),[acts]);

  const earned = BADGE_DEFS.filter(b=>earnedBadges.has(b.id));
  const locked  = BADGE_DEFS.filter(b=>!earnedBadges.has(b.id));

  const grouped = useMemo(()=>{
    const all = BADGE_DEFS.map(b=>({...b, earned:earnedBadges.has(b.id)}));
    const map = {};
    BADGE_CAT_ORDER.forEach(c=>{ map[c] = all.filter(b=>b.cat===c); });
    return map;
  },[earnedBadges]);

  return (
    <div style={{padding:"4px 0 40px"}}>
      <div className="a0" style={{marginBottom:20}}>
        <div style={{fontSize:".65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:8}}>Achievements</div>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <Ring pct={earned.length/BADGE_DEFS.length} size={68} color="var(--or)">
            <span style={{fontSize:".6rem",fontWeight:700,color:"var(--or)"}}>{Math.round(earned.length/BADGE_DEFS.length*100)}%</span>
          </Ring>
          <div>
            <div style={{fontSize:"1.4rem",fontWeight:800,lineHeight:1}}>
              <span className="mono" style={{color:"var(--or)"}}>{earned.length}</span>
              <span style={{fontSize:".82rem",color:"var(--tx2)",fontWeight:400}}> / {BADGE_DEFS.length}</span>
            </div>
            <div style={{fontSize:".76rem",color:"var(--tx2)",marginTop:4}}>badges earned</div>
            <div style={{fontSize:".7rem",color:"var(--tx3)",marginTop:2}}>
              {fmtKm(totalKm)} km · {acts.length} runs · {analytics.streak}d streak
            </div>
          </div>
        </div>
      </div>
      {earned.length > 0 && (
        <div className="card a1" style={{padding:16,marginBottom:16,background:"linear-gradient(135deg,var(--s1),var(--s2))"}}>
          <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:12}}>Latest Badges</div>
          <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:4}} className="scroll-x">
            {earned.slice(-6).reverse().map((b,i)=>(
              <div key={b.id} style={{
                display:"flex",flexDirection:"column",alignItems:"center",gap:6,
                padding:"12px 10px",minWidth:76,borderRadius:14,flexShrink:0,
                background:`${b.color}12`,border:`1.5px solid ${b.color}35`,
                animation:`badgePop .4s ${i*0.06}s cubic-bezier(.34,1.56,.64,1) both`,
              }}>
                <span style={{fontSize:"1.8rem",filter:`drop-shadow(0 2px 8px ${b.color}60)`}}>{b.icon}</span>
                <div style={{fontSize:".6rem",fontWeight:700,color:b.color,textAlign:"center",lineHeight:1.3}}>{b.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {BADGE_CAT_ORDER.map((cat, ci) => {
        const badges = grouped[cat];
        if (!badges?.length) return null;
        const catEarned = badges.filter(b=>b.earned).length;
        return (
          <div key={cat} className={`a${Math.min(ci+2,5)}`} style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:".65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)"}}>
                {BADGE_CAT_LABEL[cat]}
              </div>
              <span style={{fontSize:".62rem",color:"var(--tx3)"}}>{catEarned}/{badges.length}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {badges.map(b=>(
                <div key={b.id} className="card2" style={{
                  padding:"13px 14px",
                  display:"flex",alignItems:"center",gap:14,
                  opacity: b.earned ? 1 : 0.45,
                  borderColor: b.earned ? `${b.color}30` : "var(--bd)",
                  background: b.earned ? `${b.color}08` : "var(--s2)",
                  transition:"all .2s",
                }}>
                  <div style={{
                    width:44,height:44,borderRadius:13,flexShrink:0,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    background: b.earned ? `${b.color}18` : "var(--s3)",
                    border: b.earned ? `1.5px solid ${b.color}35` : "1px solid var(--bd2)",
                    fontSize:"1.5rem",
                    filter: b.earned ? `drop-shadow(0 2px 6px ${b.color}50)` : "grayscale(1) brightness(.6)",
                  }}>{b.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:".86rem",color:b.earned?b.color:"var(--tx2)",marginBottom:3}}>{b.name}</div>
                    <div style={{fontSize:".72rem",color:"var(--tx3)",lineHeight:1.4}}>{b.desc}</div>
                  </div>
                  {b.earned && (
                    <div style={{width:22,height:22,borderRadius:"50%",background:"var(--gn)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{fontSize:".65rem",color:"#fff",fontWeight:700}}>✓</span>
                    </div>
                  )}
                  {!b.earned && (
                    <div style={{fontSize:".9rem",color:"var(--tx3)",flexShrink:0}}>🔒</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {acts.length === 0 && (
        <div style={{textAlign:"center",padding:"48px 0",color:"var(--tx2)"}}>
          <div style={{fontSize:"3rem",marginBottom:14}}>🏅</div>
          <div style={{fontWeight:600,marginBottom:6}}>No badges yet</div>
          <div style={{fontSize:".82rem",lineHeight:1.6}}>Upload your first run to start earning achievements</div>
        </div>
      )}
    </div>
  );
};

const TABS = [
  {id:"home",         icon:"🏃", label:"Home"},
  {id:"stats",        icon:"📊", label:"Stats"},
  {id:"hr",           icon:"❤️", label:"HR"},
  {id:"tasks",        icon:"✅", label:"Tasks"},
  {id:"achievements", icon:"🏅", label:"Awards"},
];

export default function App() {
  const [acts,      setActs]      = useState(()=>loadActs());
  const [goals,     setGoals]     = useState(()=>loadGoals());
  const [hrProfile, setHRProfile] = useState(()=>loadHRProfile());
  const [profile,   setProfile]   = useState(()=>loadProfile());
  const [tasks,     setTasks]     = useState(()=>loadTasks());
  const [seenBadges,setSeenBadges]= useState(()=>loadSeenBadges());
  const [tab,       setTab]       = useState("home");
  const [detail,    setDetail]    = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showUpload,   setShowUpload]   = useState(false);
  const [showSplash,   setShowSplash]   = useState(true);
  const [showAllRuns,  setShowAllRuns]  = useState(false);
  const [showMonthly,  setShowMonthly]  = useState(false);
  const [feedbackRun,  setFeedbackRun]  = useState(null);
  const scrollRef = useRef(null);

 

  useEffect(() => {
    history.replaceState({ _rl: "root" }, "");
    history.pushState({ _rl: "sentinel" }, "");
  }, []);

  const detailRef      = useRef(detail);
  const feedbackRef    = useRef(feedbackRun);
  const settingsRef    = useRef(showSettings);
  const allRunsRef     = useRef(showAllRuns);
  const monthlyRef     = useRef(showMonthly);
  const uploadRef      = useRef(showUpload);

  useEffect(() => { detailRef.current   = detail;       }, [detail]);
  useEffect(() => { feedbackRef.current = feedbackRun;  }, [feedbackRun]);
  useEffect(() => { settingsRef.current = showSettings; }, [showSettings]);
  useEffect(() => { allRunsRef.current  = showAllRuns;  }, [showAllRuns]);
  useEffect(() => { monthlyRef.current  = showMonthly;  }, [showMonthly]);
  useEffect(() => { uploadRef.current   = showUpload;   }, [showUpload]);

  useEffect(() => {
    const handlePop = () => {
      if (feedbackRef.current)  { history.pushState({_rl:"sentinel"},""); setFeedbackRun(null);    return; }
      if (detailRef.current)    { history.pushState({_rl:"sentinel"},""); setDetail(null);          return; }
      if (settingsRef.current)  { history.pushState({_rl:"sentinel"},""); setShowSettings(false);  return; }
      if (allRunsRef.current)   { history.pushState({_rl:"sentinel"},""); setShowAllRuns(false);   return; }
      if (monthlyRef.current)   { history.pushState({_rl:"sentinel"},""); setShowMonthly(false);   return; }
      if (uploadRef.current)    { history.pushState({_rl:"sentinel"},""); setShowUpload(false);    return; }
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []); // empty deps — refs keep values current without re-subscribing

 
  const openDetail = useCallback(act => {
    history.pushState({ _rl: "detail" }, "");
    setDetail(act);
  }, []);

  const openSettings = useCallback(() => {
    history.pushState({ _rl: "settings" }, "");
    setShowSettings(true);
  }, []);

  const openAllRuns = useCallback(() => {
    history.pushState({ _rl: "allRuns" }, "");
    setShowAllRuns(true);
  }, []);

  const openMonthly = useCallback(() => {
    history.pushState({ _rl: "monthly" }, "");
    setShowMonthly(true);
  }, []);

  const openUpload = useCallback(() => {
    history.pushState({ _rl: "upload" }, "");
    setShowUpload(true);
  }, []);

  const closeDetail   = useCallback(() => { history.back(); }, []);
  const closeSettings = useCallback(() => { history.back(); }, []);
  const closeAllRuns  = useCallback(() => { history.back(); }, []);
  const closeMonthly  = useCallback(() => { history.back(); }, []);
  const closeUpload   = useCallback(() => { history.back(); }, []);
  const closeFeedback = useCallback(() => {
    const next = new Set([...seenBadges, ...earnedBadges]);
    setSeenBadges(next);
    saveSeenBadges(next);
    setFeedbackRun(null);
  }, [earnedBadges, seenBadges]);

 
  useEffect(()=>{ saveActs(acts); },[acts]);
  useEffect(()=>{ scrollRef.current?.scrollTo({top:0,behavior:"smooth"}); },[tab]);

  const analytics = useMemo(()=>buildAnalytics(acts,hrProfile),[acts,hrProfile]);

  const mafHRGlobal   = useMemo(()=>getMafHR(hrProfile, null),[hrProfile]);
  const earnedBadges  = useMemo(()=>computeEarnedBadges(acts, analytics, mafHRGlobal),[acts, analytics, mafHRGlobal]);

  const newBadgesSinceLastCheck = useMemo(()=>{
    return [...earnedBadges].filter(id=>!seenBadges.has(id));
  },[earnedBadges, seenBadges]);

  const hasUnseen = newBadgesSinceLastCheck.length > 0;

  useEffect(()=>{
    if (tab==="achievements" && hasUnseen) {
      const next = new Set([...seenBadges, ...earnedBadges]);
      setSeenBadges(next);
      saveSeenBadges(next);
    }
  },[tab]); // intentionally only re-runs on tab change; seenBadges/earnedBadges read via closure

  const addActs = useCallback((parsed) => {
    setActs(prev => {
      const m = [...parsed, ...prev];
      m.sort((a,b) => b.dateTs - a.dateTs);
      return m;
    });
    if (parsed.length > 0) {
      const highlight = parsed.reduce((b,r) => r.distanceKm > b.distanceKm ? r : b, parsed[0]);
      setFeedbackRun(highlight);
    }
    if (uploadRef.current) history.back();
    setTab("home");
  }, []);

  const deleteAct = useCallback(id => {
    setActs(p => p.filter(a => a.id !== id));
    if (detailRef.current) history.back();
  }, []);

  const clearAll = () => {
    if (!confirm(`Delete all ${acts.length} activities? This cannot be undone.`)) return;
    setActs([]); saveActs([]);
  };

  const saveGoalsHandler   = g => { setGoals(g);     saveGoals(g);     history.back(); }; // closes settings
  const saveHRHandler      = p => { setHRProfile(p); saveHRProfile(p); };
  const saveProfileHandler = p => { setProfile(p);   saveProfile(p);   };

  const [splashOut, setSplashOut] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setSplashOut(true), 1500);
    const t2 = setTimeout(() => setShowSplash(false), 1860);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <>
      <Styles/>
      {showSplash && (
        <div style={{position:"fixed",inset:0,zIndex:999,background:"var(--bg)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:0,opacity:splashOut?0:1,transition:"opacity .35s ease",pointerEvents:splashOut?"none":"auto"}}>
          <div style={{position:"absolute",top:"30%",left:"50%",transform:"translate(-50%,-50%)",width:260,height:260,borderRadius:"50%",background:"radial-gradient(circle,rgba(249,115,22,.12) 0%,transparent 70%)",pointerEvents:"none"}}/>
          <div style={{width:68,height:68,borderRadius:20,background:"linear-gradient(135deg,#f97316,#c2410c)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"2.2rem",boxShadow:"0 16px 48px rgba(249,115,22,.3)",marginBottom:20,animation:"glow 2s infinite"}}>🏃</div>
          <div className="mono" style={{fontSize:"1.8rem",fontWeight:700,letterSpacing:".06em",marginBottom:8}}>RUNLYTICS</div>
          <div style={{fontSize:".88rem",color:"var(--tx2)"}}>Your personal running coach</div>
          <div style={{display:"flex",gap:6,marginTop:28}}>
            {[0,.15,.3].map(d=><div key={d} style={{width:6,height:6,borderRadius:"50%",background:"var(--or)",animation:`pulse 1.2s ${d}s ease infinite`}}/>)}
          </div>
        </div>
      )}
      {feedbackRun && (
        <RunFeedbackModal
          run={feedbackRun}
          mafHR={getMafHR(hrProfile, feedbackRun.maxHR)}
          newBadges={newBadgesSinceLastCheck}
          onClose={closeFeedback}/>
      )}
      {showAllRuns && (
        <AllRunsView
          acts={acts}
          hrProfile={hrProfile}
          onSelect={act => { openDetail(act); }}
          onClose={closeAllRuns}/>
      )}
      {showMonthly && (
        <MonthlyReport
          acts={acts}
          hrProfile={hrProfile}
          onClose={closeMonthly}/>
      )}
      {detail && (
        <Detail
          act={detail} allActs={acts} hrProfile={hrProfile}
          onClose={closeDetail}
          onDelete={id => deleteAct(id)}/>
      )}
      {showSettings && (
        <SettingsPanel
          acts={acts} goals={goals} hrProfile={hrProfile} profile={profile}
          onSaveGoals={saveGoalsHandler}
          onSaveHR={p => { saveHRHandler(p); closeSettings(); }}
          onSaveProfile={p => saveProfileHandler(p)}
          onClearAll={clearAll}
          onClose={closeSettings}/>
      )}
      <div style={{maxWidth:430,margin:"0 auto",minHeight:"100vh",background:"var(--bg)",display:"flex",flexDirection:"column",position:"relative"}}>
        <div className="glass" style={{position:"sticky",top:0,zIndex:50,padding:"14px 18px 12px",borderBottom:"1px solid var(--bd)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#f97316,#c2410c)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".85rem"}}>🏃</div>
              <span className="mono" style={{fontSize:"1rem",fontWeight:700,letterSpacing:".06em"}}>RUNLYTICS</span>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {acts.length>0 && (
                <span style={{background:"var(--or2)",color:"var(--or)",padding:"2px 9px",borderRadius:20,fontSize:".62rem",fontWeight:700}}>{acts.length} runs</span>
              )}
              <button className="btn b-or" style={{padding:"6px 13px",fontSize:".78rem"}}
                onClick={() => showUpload ? closeUpload() : openUpload()}>
                {showUpload ? "✕ Close" : "+ Upload"}
              </button>
              <button className="tap" style={{background:"none",border:"none",color:"var(--tx2)",fontSize:"1.1rem",padding:4}}
                onClick={openSettings}>⚙️</button>
            </div>
          </div>
        </div>
        <div ref={scrollRef} style={{flex:1,overflowY:"auto",padding:"0 18px"}}>
          {showUpload ? (
            <Upload acts={acts} hrProfile={hrProfile} onAdd={addActs} onClearAll={clearAll}/>
          ) : (
            <>
              {tab==="home" && (
                <HomeTab
                  acts={acts} analytics={analytics} goals={goals} hrProfile={hrProfile}
                  profile={profile} tasks={tasks}
                  onSelectAct={openDetail}
                  onUpload={openUpload}
                  onEditGoals={openSettings}
                  onViewAll={openAllRuns}
                  onViewMonthly={openMonthly}/>
              )}
              {tab==="stats" && (
                <StatsTab
                  acts={acts} analytics={analytics} hrProfile={hrProfile}
                  onViewAll={openAllRuns}
                  onViewMonthly={openMonthly}/>
              )}
              {tab==="hr" && (
                <HRInsightsTab acts={acts} hrProfile={hrProfile} onEditHR={openSettings}/>
              )}
              {tab==="tasks" && (
                <TasksTab tasks={tasks} setTasks={setTasks} hrProfile={hrProfile} acts={acts}/>
              )}
              {tab==="achievements" && (
                <AchievementsTab
                  earnedBadges={earnedBadges}
                  acts={acts}
                  analytics={analytics}/>
              )}
            </>
          )}
        </div>
        {!showUpload && (
          <div className="glass" style={{position:"sticky",bottom:0,borderTop:"1px solid var(--bd)",display:"flex",paddingBottom:"env(safe-area-inset-bottom,0)"}}>
            {TABS.map(t => (
              <button key={t.id} className={`tab-btn ${tab===t.id?"on":""}`}
                onClick={() => setTab(t.id)}
                style={{position:"relative"}}>
                <span style={{fontSize:"1.15rem",lineHeight:1,marginBottom:1}}>{t.icon}</span>
                {t.label}
                {t.id==="achievements" && hasUnseen && tab!=="achievements" && (
                  <span style={{
                    position:"absolute",top:6,right:"calc(50% - 12px)",
                    width:7,height:7,borderRadius:"50%",
                    background:"var(--or)",border:"1.5px solid var(--bg)",
                  }}/>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
