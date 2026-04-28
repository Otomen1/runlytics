import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar,
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
      } catch(e) {}
    }
    return [];
  } catch(e) { return []; }
}
function saveActs(a) {
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify({version:SCHEMA_VER,savedAt:Date.now(),data:Array.isArray(a)?a:[]})); }
  catch(e) { if(e.name==="QuotaExceededError") console.error("[Runlytics] Storage full"); }
}

function loadGoals() {
  try { return {...{weekly:30,monthly:120},...JSON.parse(localStorage.getItem(GOALS_KEY)||"{}")}; } catch(e) { return {weekly:30,monthly:120}; }
}
function saveGoals(g) { try { localStorage.setItem(GOALS_KEY,JSON.stringify(g)); } catch(e) {} }

function loadHRProfile() {
  try { return {...{age:null,restingHR:null,maxHROverride:null},...JSON.parse(localStorage.getItem(HR_PROFILE_KEY)||"{}")}; } catch(e) { return {age:null,restingHR:null,maxHROverride:null}; }
}
function saveHRProfile(p) { try { localStorage.setItem(HR_PROFILE_KEY,JSON.stringify(p)); } catch(e) {} }

function loadProfile() {
  try { return {...{name:"Runner"},...JSON.parse(localStorage.getItem(PROFILE_KEY)||"{}")}; } catch(e) { return {name:"Runner"}; }
}
function saveProfile(p) { try { localStorage.setItem(PROFILE_KEY,JSON.stringify(p)); } catch(e) {} }

const STRAVA_KEY = "runlytics_strava_v1";
function loadStravaAuth() { try { return JSON.parse(localStorage.getItem(STRAVA_KEY)||"null"); } catch(e) { return null; } }
function saveStravaAuth(d) { try { localStorage.setItem(STRAVA_KEY,JSON.stringify(d)); } catch(e) {} }
function clearStravaAuth() { try { localStorage.removeItem(STRAVA_KEY); } catch(e) {} }

function mapStravaActivity(a) {
  const km = a.distance / 1000;
  const paceSecKm = km > 0 ? Math.round(a.moving_time / km) : 0;
  const TM = {Run:"Run",Walk:"Walk",Ride:"Ride",Swim:"Swim",Hike:"Hike",TrailRun:"Run",VirtualRun:"Run"};
  const type = TM[a.sport_type] || TM[a.type] || "Run";
  const dateTs = new Date(a.start_date).getTime();
  const dateLocal = (a.start_date_local||"").split("T")[0] || new Date(dateTs).toISOString().split("T")[0];
  return {
    id:`strava_${a.id}`, source:"strava", stravaId:a.id,
    name:a.name, type, date:dateLocal, dateTs,
    startDateLocal: new Date(a.start_date_local||a.start_date).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"}),
    startTimeLocal: (a.start_date_local||"").split("T")[1]?.slice(0,5)||"",
    distanceKm: parseFloat(km.toFixed(2)),
    movingTimeSec: a.moving_time||0,
    elapsedTimeSec: a.elapsed_time||0,
    avgPaceSecKm: paceSecKm,
    avgHR: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    maxHR: a.max_heartrate ? Math.round(a.max_heartrate) : null,
    avgCad: a.average_cadence ? Math.round(a.average_cadence) : null,
    elevGainM: Math.round(a.total_elevation_gain||0),
    elevLossM: 0, hrZones:null, hrSamples:[], hrMaxUsed:null,
    kmSplits:[], route:[], speedChart:[], splitInsight:null, bestEfforts:{},
    distanceM: a.distance||0,
    totalTimeSec: a.elapsed_time||0,
    hasTimestamps: true,
    avgSpeedKmh: km>0&&a.moving_time>0 ? parseFloat((km/(a.moving_time/3600)).toFixed(2)) : 0,
    pointCount: 0,
    parsedAt: Date.now(),
    loadLabel: (() => { const t = a.average_heartrate&&a.moving_time ? Math.min(100,Math.round((a.moving_time/60)*(a.average_heartrate/145)*1.1)) : Math.min(100,Math.round((a.moving_time/60)*0.5)); return t<=40?"Easy":t<=70?"Moderate":"Hard"; })(),
    loadColor: (() => { const t = a.average_heartrate&&a.moving_time ? Math.min(100,Math.round((a.moving_time/60)*(a.average_heartrate/145)*1.1)) : Math.min(100,Math.round((a.moving_time/60)*0.5)); return t<=40?"#22c55e":t<=70?"#f97316":"#ef4444"; })(),
    runClass: paceSecKm>390?"Easy":paceSecKm>330?"Moderate":"Tempo",
    trainingLoad: a.average_heartrate&&a.moving_time
      ? Math.min(100,Math.round((a.moving_time/60)*(a.average_heartrate/145)*1.1))
      : Math.min(100,Math.round((a.moving_time/60)*0.5)),
  };
}

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
    movingTimeSec:movingTime,totalTimeSec:totalTime,avgPaceSecKm:avgPaceSec,avgSpeedKmh:movingTime>0?parseFloat((totalDist/movingTime*3.6).toFixed(2)):0,
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
  } catch(e) { return initTasks(); }
}
function initTasks() {
  return DEFAULT_TASKS.map(t=>({...t,streak:0,completions:{},enabled:true}));
}
function saveTasks(tasks) {
  try { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks.map(t=>({id:t.id,streak:t.streak,completions:t.completions,enabled:t.enabled})))); } catch(e) {}
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


const Styles=()=><style>{`
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#06080f;color:#d8e6f7;-webkit-font-smoothing:antialiased;}
:root{--bg:#06080f;--s1:#0b0f1a;--s2:#101622;--s3:#141c2a;--bd:#1a2336;--bd2:#212e45;--or:#f97316;--or2:rgba(249,115,22,.14);--or3:rgba(249,115,22,.07);--gn:#22c55e;--gn2:rgba(34,197,94,.13);--rd:#ef4444;--rd2:rgba(239,68,68,.12);--bl:#3b82f6;--yw:#eab308;--tx:#d8e6f7;--tx2:#6178a0;--tx3:#2e3d55;}
::-webkit-scrollbar{width:0;}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes glow{0%,100%{box-shadow:0 0 0 0 rgba(249,115,22,.3)}60%{box-shadow:0 0 0 8px rgba(249,115,22,0)}}
@keyframes pop{0%{transform:scale(.5);opacity:0}70%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
.a0{animation:fadeUp .25s ease both}
.a1{animation:fadeUp .25s .07s ease both}
.a2{animation:fadeUp .25s .14s ease both}
.a3{animation:fadeUp .25s .21s ease both}
.card{background:var(--s1);border:1px solid var(--bd);border-radius:16px;}
.card2{background:var(--s2);border:1px solid var(--bd);border-radius:12px;}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:none;border-radius:11px;font-family:inherit;font-weight:600;cursor:pointer;transition:opacity .15s;white-space:nowrap;}
.btn:active{opacity:.75;}
.b-or{background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;}
.b-gh{background:var(--s2);color:var(--tx2);border:1px solid var(--bd2);}
.b-rd{background:var(--rd2);color:var(--rd);border:1px solid rgba(239,68,68,.2);}
.inp{width:100%;background:var(--s2);border:1.5px solid var(--bd);border-radius:10px;color:var(--tx);font-family:inherit;font-size:.88rem;padding:11px 14px;outline:none;}
.inp:focus{border-color:var(--or);}
.tab-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 2px 10px;border:none;background:transparent;color:var(--tx3);cursor:pointer;font-size:.56rem;font-weight:600;font-family:inherit;letter-spacing:.04em;text-transform:uppercase;position:relative;}
.tab-btn.on{color:var(--or);}
.tab-btn.on::after{content:'';position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:18px;height:2px;border-radius:2px;background:var(--or);}
.pb{height:5px;background:var(--bd);border-radius:3px;overflow:hidden;}
.pf{height:100%;border-radius:3px;transition:width .8s;}
.glass{background:rgba(6,8,14,.9);backdrop-filter:blur(20px);}
.tap{cursor:pointer;transition:opacity .15s;}.tap:active{opacity:.7;}
.dz{border:2px dashed var(--bd2);border-radius:16px;transition:all .2s;}
.dz.ov{border-color:var(--or);background:var(--or3);}
.scroll-x{overflow-x:auto;scrollbar-width:none;}.scroll-x::-webkit-scrollbar{display:none;}
.pill{display:inline-flex;align-items:center;padding:4px 11px;border-radius:20px;border:1px solid var(--bd);background:transparent;cursor:pointer;font-size:.72rem;font-family:inherit;transition:all .15s;}
.pill.on{background:var(--or3);border-color:var(--or);color:var(--or);font-weight:600;}
`}</style>;

const IC={good:"var(--gn)",positive:"var(--gn)",warning:"var(--yw)",danger:"var(--rd)",info:"var(--bl)",neutral:"var(--tx2)"};

const Spn=()=>(
  <div style={{width:16,height:16,borderRadius:"50%",border:"2px solid var(--bd2)",borderTopColor:"var(--or)",animation:"spin 1s linear infinite"}}/>
);

const SH=({title,sub=null})=>(
  <div style={{marginBottom:sub?4:12}}>
    <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)"}}>{title}</div>
    {sub&&<div style={{fontSize:".76rem",color:"var(--tx2)",marginTop:2}}>{sub}</div>}
  </div>
);

const Ring=({pct=0,size=64,color="var(--or)",children})=>{
  const r=(size-7)/2,c=2*Math.PI*r,off=c*(1-Math.min(1,Math.max(0,pct)));
  return(
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bd)" strokeWidth={7}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={pct>0?color:"var(--bd)"} strokeWidth={7}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{transition:"stroke-dashoffset 1s"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>{children}</div>
    </div>
  );
};

const RouteMap=({route})=>{
  if(!route||route.length<2)return null;
  const lats=route.map(r=>r.lat),lons=route.map(r=>r.lon);
  const minLat=Math.min(...lats),maxLat=Math.max(...lats),minLon=Math.min(...lons),maxLon=Math.max(...lons);
  const latR=maxLat-minLat||.001,lonR=maxLon-minLon||.001;
  const W=340,H=180,p=16;
  const asp=lonR/latR*Math.cos((minLat+maxLat)/2*Math.PI/180);
  let vW=W-2*p,vH=H-2*p;
  if(asp>vW/vH){vH=vW/asp;}else{vW=vH*asp;}
  const toX=lon=>p+(lon-minLon)/lonR*vW;
  const toY=lat=>p+(maxLat-lat)/latR*vH;
  const d=route.map((r,i)=>(i===0?"M":"L")+toX(r.lon).toFixed(1)+","+toY(r.lat).toFixed(1)).join(" ");
  return(
    <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:H,borderRadius:10,background:"var(--s3)"}}>
      <path d={d} fill="none" stroke="var(--or)" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx={toX(route[0].lon)} cy={toY(route[0].lat)} r="5" fill="var(--gn)"/>
      <circle cx={toX(route[route.length-1].lon)} cy={toY(route[route.length-1].lat)} r="5" fill="var(--rd)"/>
    </svg>
  );
};

const CoachCard=({insight})=>{
  const[open,setOpen]=useState(false);
  if(!insight)return null;
  const col=IC[insight.type]||"var(--tx2)";
  const body=insight.detail||insight.body;
  return(
    <div style={{background:col.replace(")",", .08)").replace("var(","rgba("),border:"1px solid "+col.replace(")",", .22)").replace("var(","rgba("),borderRadius:12,cursor:body?"pointer":"default"}} onClick={()=>body&&setOpen(o=>!o)}>
      <div style={{padding:"12px 14px",display:"flex",alignItems:"center",gap:11}}>
        <span style={{fontSize:"1.15rem",flexShrink:0}}>{insight.icon||"💡"}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:".88rem"}}>{insight.title}</div>
          {!open&&body&&<div style={{fontSize:".73rem",color:"var(--tx2)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{body}</div>}
        </div>
        {body&&<span style={{color:col,fontSize:".7rem",transform:open?"rotate(180deg)":"none",transition:"transform .2s"}}>▾</span>}
      </div>
      {open&&body&&(
        <div style={{padding:"0 14px 12px 49px"}}>
          <div style={{fontSize:".8rem",color:"var(--tx2)",lineHeight:1.6}}>{body}</div>
          {insight.action&&<div style={{fontSize:".75rem",color:col,fontWeight:600,marginTop:6}}>{insight.action}</div>}
        </div>
      )}
    </div>
  );
};

const Detail=({act,hrProfile,onClose,onDelete})=>{
  const[tab,setTab]=useState("overview");
  const col=ACT_CLR[act.type]||"#6b7280";
  const mafHR=getMafHR(hrProfile,act.maxHR);
  const zones=act.hrSamples&&act.hrSamples.length?computeZones(act.hrSamples,mafHR):act.hrZones;
  const TABS=["overview","heartrate","map"];
  return(
    <div style={{position:"fixed",inset:0,zIndex:240,background:"var(--bg)",display:"flex",flexDirection:"column",overflowY:"auto"}}>
      <div className="glass" style={{position:"sticky",top:0,zIndex:10,padding:"14px 18px 0",borderBottom:"1px solid var(--bd)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div style={{flex:1,minWidth:0,paddingRight:10}}>
            <div style={{fontSize:".62rem",fontWeight:700,color:col,marginBottom:4,textTransform:"uppercase"}}>
              {ACT_ICN[act.type]} {act.type} · {act.runClass}
            </div>
            <div style={{fontWeight:700,fontSize:".98rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{act.name}</div>
            <div style={{fontSize:".72rem",color:"var(--tx2)",marginTop:2}}>{act.startDateLocal||fmtDate(act.date)}</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button className="btn b-rd" style={{padding:"7px 10px"}}
              onClick={()=>{ if(confirm("Delete this run?")) onDelete(act.id); }}>🗑</button>
            <button className="btn b-gh" style={{padding:"7px 12px"}} onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={{display:"flex"}}>
          {TABS.map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{padding:"8px 14px",border:"none",background:"transparent",
                color:tab===t?"var(--or)":"var(--tx2)",fontFamily:"inherit",fontSize:".76rem",
                fontWeight:tab===t?600:400,cursor:"pointer",
                borderBottom:tab===t?"2px solid var(--or)":"2px solid transparent",
                textTransform:"capitalize",transition:"color .15s"}}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div style={{flex:1,padding:"18px 18px 32px"}}>
        {tab==="overview"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
              {[
                {l:"Distance",v:fmtKm(act.distanceKm)+" km",c:col},
                {l:"Pace",v:fmtPace(act.avgPaceSecKm)+"/km",c:"var(--tx)"},
                {l:"Time",v:fmtDur(act.movingTimeSec),c:"var(--tx)"}
              ].map(s=>(
                <div key={s.l} className="card2" style={{padding:"12px 8px",textAlign:"center"}}>
                  <div style={{fontSize:"1.05rem",fontWeight:700,color:s.c,lineHeight:1,marginBottom:4}}>{s.v}</div>
                  <div style={{fontSize:".6rem",color:"var(--tx2)"}}>{s.l}</div>
                </div>
              ))}
            </div>
            <div className="card" style={{padding:16}}>
              {[
                ["Elev Gain","+"+Math.round(act.elevGainM||0)+"m"],
                ["Max HR",act.maxHR?(act.maxHR+" bpm"):"—"],
                ["Avg HR",act.avgHR?(act.avgHR+" bpm"):"—"],
                ["Training Load",String(act.trainingLoad||0)]
              ].map(([l,v],i)=>(
                <div key={l} style={{
                  display:"flex",justifyContent:"space-between",padding:"9px 0",
                  borderBottom:i<3?"1px solid var(--bd)":"none"
                }}>
                  <span style={{fontSize:".8rem",color:"var(--tx2)"}}>{l}</span>
                  <span style={{fontSize:".84rem",fontWeight:600}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab==="heartrate"&&(
          act.avgHR?(
            <div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                {[
                  {l:"Avg HR",v:act.avgHR+" bpm",c:"var(--rd)"},
                  {l:"MAF HR",v:mafHR+" bpm",c:act.avgHR<=mafHR?"var(--gn)":"var(--yw)"}
                ].map(s=>(
                  <div key={s.l} className="card2" style={{padding:"14px 12px",textAlign:"center"}}>
                    <div style={{fontSize:"1.6rem",fontWeight:700,color:s.c,lineHeight:1,marginBottom:5}}>{s.v}</div>
                    <div style={{fontSize:".62rem",color:"var(--tx2)"}}>{s.l}</div>
                  </div>
                ))}
              </div>
              {zones&&(
                <div className="card" style={{padding:16}}>
                  <SH title="HR Zones" sub={"MAF "+mafHR+" bpm"}/>
                  {zones.map((z,i)=>(
                    <div key={z.zone} style={{marginBottom:i<4?10:0}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <div style={{display:"flex",alignItems:"center",gap:7}}>
                          <div style={{width:8,height:8,borderRadius:2,background:z.color}}/>
                          <span style={{fontSize:".78rem",fontWeight:600}}>{z.zone}</span>
                          <span style={{fontSize:".7rem",color:"var(--tx2)"}}>{z.label}</span>
                        </div>
                        <span style={{fontSize:".88rem",color:z.color,fontWeight:700}}>{z.pct}%</span>
                      </div>
                      <div className="pb"><div className="pf" style={{width:z.pct+"%",background:z.color}}/></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ):(
            <div style={{textAlign:"center",padding:"40px 0",color:"var(--tx2)"}}>
              <div style={{fontSize:"2rem",marginBottom:8}}>💔</div>
              <div>No heart rate data</div>
            </div>
          )
        )}
        {tab==="map"&&(
          <div className="card" style={{padding:16}}>
            {act.route&&act.route.length>2
              ?<RouteMap route={act.route}/>
              :<div style={{height:160,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--tx2)"}}>No GPS route</div>
            }
          </div>
        )}
      </div>
    </div>
  );
};

const Upload=({acts,hrProfile,onAdd,onClearAll})=>{
  const[queue,setQueue]=useState([]);
  const[drag,setDrag]=useState(false);
  const ref=useRef(null);
  const process=useCallback(async files=>{
    const gpx=Array.from(files).filter(f=>f.name.toLowerCase().endsWith(".gpx"));
    if(!gpx.length)return;
    const items=gpx.map(f=>({file:f,status:"parsing",parsed:null,error:null}));
    setQueue(items);
    const res=await Promise.all(items.map(async item=>{
      try{
        const text=await item.file.text();
        const parsed=parseGPX(text,item.file.name,hrProfile);
        const dupe=acts.some(a=>Math.abs(a.dateTs-parsed.dateTs)<60000&&Math.abs(a.distanceKm-parsed.distanceKm)<0.1);
        return{...item,status:dupe?"duplicate":"preview",parsed,error:dupe?"Already uploaded":null};
      }catch(e){return{...item,status:"error",error:e.message};}
    }));
    setQueue(res);
  },[acts,hrProfile]);

  const saveAll=()=>{
    const valid=queue.filter(q=>q.status==="preview"&&q.parsed);
    if(!valid.length)return;
    onAdd(valid.map(q=>q.parsed));
    setQueue([]);
  };
  return(
    <div style={{padding:"18px 0 32px"}}>
      <div style={{fontWeight:700,fontSize:"1.1rem",marginBottom:4}}>Upload Runs</div>
      <div style={{fontSize:".82rem",color:"var(--tx2)",marginBottom:18}}>Import GPX files from Garmin, Strava or any GPS watch</div>
      <div className={"dz a0 "+(drag?"ov":"")} style={{padding:"32px 20px",textAlign:"center",marginBottom:14,cursor:"pointer"}}
        onDragOver={e=>{e.preventDefault();setDrag(true);}}
        onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);process(e.dataTransfer.files);}}
        onClick={()=>ref.current&&ref.current.click()}>
        <input ref={ref} type="file" accept=".gpx" multiple style={{display:"none"}} onChange={e=>process(e.target.files)}/>
        <div style={{fontSize:"2.2rem",marginBottom:10}}>📂</div>
        <div style={{fontWeight:600,marginBottom:5}}>Drop GPX files here</div>
        <div style={{fontSize:".8rem",color:"var(--tx2)",marginBottom:14}}>or tap to browse</div>
        <button className="btn b-or" style={{padding:"10px 22px",fontSize:".86rem"}}>Choose files</button>
      </div>
      {queue.length>0&&(
        <div className="card a1" style={{padding:16,marginBottom:14}}>
          {queue.map((item,idx)=>(
            <div key={idx} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:idx<queue.length-1?"1px solid var(--bd)":"none"}}>
              <div style={{width:34,height:34,borderRadius:10,background:item.status==="preview"?"var(--gn2)":item.status==="error"?"var(--rd2)":"var(--s3)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {item.status==="parsing"?<Spn/>:item.status==="preview"?"✓":item.status==="error"?"✗":"≈"}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:".82rem",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.file.name}</div>
                {item.parsed&&<div style={{fontSize:".7rem",color:"var(--tx2)",marginTop:2}}>{fmtKm(item.parsed.distanceKm)+" km · "+fmtDur(item.parsed.movingTimeSec)}</div>}
                {item.error&&<div style={{fontSize:".7rem",color:"var(--rd)",marginTop:2}}>{item.error}</div>}
              </div>
            </div>
          ))}
          {queue.some(q=>q.status==="preview")&&(
            <button className="btn b-or" style={{width:"100%",padding:"12px",fontSize:".88rem",marginTop:14}} onClick={saveAll}>
              {"Save "+queue.filter(q=>q.status==="preview").length+" run"+(queue.filter(q=>q.status==="preview").length!==1?"s":"")}
            </button>
          )}
        </div>
      )}
      {acts.length>0&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)"}}>{"Library · "+acts.length+" runs"}</div>
            <button className="btn b-rd" style={{padding:"5px 10px",fontSize:".72rem"}} onClick={onClearAll}>Clear All</button>
          </div>
          {acts.slice(0,5).map(a=>(
            <div key={a.id} className="card2" style={{padding:"11px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:34,height:34,borderRadius:9,background:(ACT_CLR[a.type]||"#6b7280")+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1rem"}}>{ACT_ICN[a.type]||"🏃"}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:".82rem",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
                <div style={{fontSize:".7rem",color:"var(--tx2)",marginTop:2}}>{fmtDateS(a.date)+" · "+fmtKm(a.distanceKm)+" km"}</div>
              </div>
            </div>
          ))}
          {acts.length>5&&<div style={{fontSize:".74rem",color:"var(--tx2)",textAlign:"center",padding:"6px 0"}}>{"+"+(acts.length-5)+" more"}</div>}
        </div>
      )}
    </div>
  );
};

const FeedbackModal=({run,mafHR,newBadges,onClose})=>{
  const feedbacks=useMemo(()=>getRunFeedback(run,mafHR),[run,mafHR]);
  const bdgs=useMemo(()=>(newBadges||[]).map(id=>BADGE_DEFS.find(b=>b.id===id)).filter(Boolean),[newBadges]);
  if(!run||!feedbacks)return null;
  return(
    <div style={{position:"fixed",inset:0,zIndex:250,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="glass" style={{width:"100%",maxWidth:430,borderRadius:"20px 20px 0 0",padding:"22px 20px 40px",border:"1px solid var(--bd)"}}>
        <div style={{width:36,height:4,borderRadius:2,background:"var(--bd2)",margin:"0 auto 18px"}}/>
        {bdgs.length>0&&(
          <div style={{marginBottom:18,textAlign:"center"}}>
            <div style={{fontWeight:700,marginBottom:12}}>{"🎉 Badge"+(bdgs.length>1?"s":"")+" Unlocked!"}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center"}}>
              {bdgs.map((b,i)=>(
                <div key={b.id} style={{padding:"10px 12px",borderRadius:12,background:b.color+"20",border:"1.5px solid "+b.color+"40",textAlign:"center",animation:"pop .4s "+(i*0.1)+"s both"}}>
                  <div style={{fontSize:"1.8rem"}}>{b.icon}</div>
                  <div style={{fontSize:".68rem",fontWeight:700,color:b.color,marginTop:4}}>{b.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{fontWeight:700,fontSize:"1rem",marginBottom:3}}>Run Feedback</div>
        <div style={{fontSize:".74rem",color:"var(--tx2)",marginBottom:14}}>{run.name+" · "+fmtKm(run.distanceKm)+" km"}</div>
        <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:18}}>
          {feedbacks.map((fb,i)=>{
            const col=IC[fb.type]||"var(--tx2)";
            return(
              <div key={i} style={{display:"flex",gap:11,padding:"11px 13px",borderRadius:11,background:col+"12",border:"1px solid "+col+"22"}}>
                <span style={{fontSize:"1.1rem",flexShrink:0}}>{fb.icon}</span>
                <div>
                  <div style={{fontWeight:700,fontSize:".86rem",marginBottom:2}}>{fb.title}</div>
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

const AllRunsView=({acts,hrProfile,onSelect,onClose})=>{
  const[filter,setFilter]=useState("all");
  const[search,setSearch]=useState("");
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
          <div style={{fontWeight:700,fontSize:"1.05rem"}}>All Runs</div>
          <button className="btn b-gh" style={{padding:"6px 12px",fontSize:".8rem"}} onClick={onClose}>✕ Close</button>
        </div>
        <input className="inp" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search runs…" style={{marginBottom:12}}/>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:12}} className="scroll-x">
          {types.map(t=>(
            <button key={t} className={"pill "+(filter===t?"on":"")} onClick={()=>setFilter(t)} style={{flexShrink:0,textTransform:"capitalize"}}>
              {t==="all"?"All ("+acts.length+")":t}
            </button>
          ))}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"12px 18px 32px"}}>
        {list.map(a=>{
          const clr=ACT_CLR[a.type]||"#6b7280";
          return(
            <div key={a.id} className="card2 tap" style={{padding:"12px 14px",marginBottom:8,cursor:"pointer"}} onClick={()=>onSelect(a)}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:36,height:36,borderRadius:10,background:clr+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1rem",flexShrink:0}}>{ACT_ICN[a.type]||"🏃"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:".83rem",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>{a.name}</div>
                  <div style={{display:"flex",gap:10,fontSize:".7rem",color:"var(--tx2)"}}>
                    <span>{fmtDateS(a.date)}</span>
                    <span style={{color:clr,fontWeight:600}}>{fmtKm(a.distanceKm)+" km"}</span>
                    <span>{fmtPace(a.avgPaceSecKm)+"/km"}</span>
                    {a.avgHR&&<span>{"♥ "+a.avgHR}</span>}
                  </div>
                </div>
                <span style={{color:"var(--tx3)",fontSize:".8rem"}}>›</span>
              </div>
            </div>
          );
        })}
        <div style={{textAlign:"center",fontSize:".72rem",color:"var(--tx3)",padding:"8px 0"}}>{list.length+" runs"}</div>
      </div>
    </div>
  );
};

const HomeTab=({acts,analytics,goals,hrProfile,profile,tasks,onSelectAct,onUpload,onViewAll,onViewMonthly,onEditGoals})=>{
  const lastRun=acts.length?acts.reduce((b,a)=>a.dateTs>b.dateTs?a:b):null;
  const mafHR=getMafHR(hrProfile,null);
  const insight=useMemo(()=>getMafCoachingInsight(acts,hrProfile),[acts,hrProfile]);
  const rec=useMemo(()=>getTodayRecommendation(acts,hrProfile),[acts,hrProfile]);
  const weekStart=useMemo(()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d;},[]);
  const thisWeekKm=useMemo(()=>acts.filter(a=>new Date(a.dateTs)>=weekStart).reduce((s,a)=>s+a.distanceKm,0),[acts,weekStart]);
  const weekPct=Math.min(1,thisWeekKm/goals.weekly);
  const todayStr=todayKey();
  const todayTasks=tasks.filter(t=>t.enabled).slice(0,3);
  const todayDone=todayTasks.filter(t=>t.completions&&t.completions[todayStr]).length;
  const recCol=IC[rec.type]||"var(--tx2)";
  return(
    <div style={{padding:"4px 0 32px"}}>
      <div className="a0" style={{marginBottom:20,paddingTop:4}}>
        <div style={{fontSize:".7rem",color:"var(--tx3)",marginBottom:3}}>{greet()}</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{fontSize:"1.45rem",fontWeight:700,lineHeight:1.2}}>
            {profile.name==="Runner"?"Welcome back 👋":"Welcome back, "+profile.name+" 👋"}
          </div>
          {analytics.streak>=2&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"8px 11px",borderRadius:12,background:"rgba(249,115,22,.1)",border:"1.5px solid rgba(249,115,22,.25)",flexShrink:0}}>
              <span style={{fontSize:"1.2rem"}}>🔥</span>
              <span style={{fontSize:"1rem",fontWeight:800,color:"var(--or)",lineHeight:1}}>{analytics.streak}</span>
              <span style={{fontSize:".5rem",color:"var(--or)",fontWeight:600}}>DAYS</span>
            </div>
          )}
        </div>
        {analytics.streak===1&&(
          <div style={{display:"inline-flex",alignItems:"center",gap:5,marginTop:8,padding:"3px 10px",borderRadius:20,background:"rgba(249,115,22,.1)",border:"1px solid rgba(249,115,22,.2)"}}>
            <span>🔥</span><span style={{fontSize:".74rem",fontWeight:600,color:"var(--or)"}}>1 day streak — keep going!</span>
          </div>
        )}
      </div>

      <div className="a1" style={{marginBottom:14}}>
        <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:7}}>Today's Recommendation</div>
        <div style={{background:recCol+"10",border:"1px solid "+recCol+"25",borderRadius:12,padding:"13px 15px",display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:"1.4rem",flexShrink:0}}>{rec.icon}</span>
          <div>
            <div style={{fontWeight:700,fontSize:".88rem",marginBottom:2}}>{rec.title}</div>
            <div style={{fontSize:".77rem",color:"var(--tx2)",lineHeight:1.5}}>{rec.sub}</div>
          </div>
        </div>
      </div>

      {lastRun?(
        <div className="card a2 tap" style={{padding:18,marginBottom:14,cursor:"pointer"}} onClick={()=>onSelectAct(lastRun)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
            <div>
              <div style={{fontSize:".6rem",fontWeight:700,color:ACT_CLR[lastRun.type]||"var(--or)",marginBottom:3,textTransform:"uppercase"}}>{ACT_ICN[lastRun.type]+" Last Run"}</div>
              <div style={{fontWeight:600,fontSize:".88rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{lastRun.name}</div>
              <div style={{fontSize:".7rem",color:"var(--tx2)",marginTop:2}}>{fmtDate(lastRun.date)}</div>
            </div>
            <span style={{background:(ACT_CLR[lastRun.type]||"var(--or)")+"20",color:ACT_CLR[lastRun.type]||"var(--or)",padding:"2px 9px",borderRadius:20,fontSize:".66rem",fontWeight:700}}>{lastRun.runClass}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {[
              {l:"km",v:fmtKm(lastRun.distanceKm),c:"var(--or)"},
              {l:"pace",v:fmtPace(lastRun.avgPaceSecKm)+"/km",c:"var(--tx)"},
              {l:"HR",v:lastRun.avgHR?(lastRun.avgHR+" bpm"):"—",c:lastRun.avgHR&&lastRun.avgHR>mafHR?"var(--yw)":"var(--gn)"}
            ].map(s=>(
              <div key={s.l} style={{textAlign:"center",padding:"9px 6px",background:"rgba(0,0,0,.25)",borderRadius:10}}>
                <div style={{fontSize:"1rem",fontWeight:700,color:s.c,lineHeight:1}}>{s.v}</div>
                <div style={{fontSize:".58rem",color:"var(--tx3)",marginTop:3}}>{s.l}</div>
              </div>
            ))}
          </div>
          {acts.length>1&&(
            <div style={{marginTop:10,textAlign:"center",fontSize:".7rem"}}>
              <span className="tap" style={{color:"var(--or)",fontWeight:600}}
                onClick={e=>{e.stopPropagation();onViewAll();}}>
                {"View all "+acts.length+" runs →"}
              </span>
            </div>
          )}
        </div>
      ):(
        <div className="card a2" style={{padding:24,textAlign:"center",marginBottom:14,borderStyle:"dashed"}}>
          <div style={{fontSize:"2.5rem",marginBottom:10}}>🏃</div>
          <div style={{fontWeight:600,marginBottom:6}}>No runs yet</div>
          <div style={{fontSize:".82rem",color:"var(--tx2)",marginBottom:14}}>Upload your first GPX file to get started</div>
          <button className="btn b-or" style={{padding:"10px 22px",fontSize:".86rem"}} onClick={onUpload}>Upload GPX</button>
        </div>
      )}

      <div className="a3" style={{marginBottom:14}}>
        <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:7}}>Coach Insight</div>
        <CoachCard insight={insight}/>
      </div>

      <div className="card a3" style={{padding:16,marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <Ring pct={weekPct} size={62} color={weekPct>=1?"var(--gn)":"var(--or)"}>
            <span style={{fontSize:".58rem",fontWeight:700,color:weekPct>=1?"var(--gn)":"var(--or)"}}>{Math.round(weekPct*100)+"%"}</span>
          </Ring>
          <div style={{flex:1}}>
            <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:5}}>Weekly Goal</div>
            <div style={{fontSize:"1.15rem",fontWeight:700,lineHeight:1,marginBottom:4}}>
              <span style={{color:"var(--or)"}}>{fmtKm(thisWeekKm)}</span>
              <span style={{fontSize:".76rem",color:"var(--tx2)",fontWeight:400}}>{" / "+goals.weekly+" km"}</span>
            </div>
            {weekPct>=1
              ?<span style={{background:"var(--gn2)",color:"var(--gn)",padding:"2px 9px",borderRadius:20,fontSize:".66rem",fontWeight:700}}>✓ Goal reached!</span>
              :<div style={{fontSize:".74rem",color:"var(--tx2)"}}>{parseFloat((goals.weekly-thisWeekKm).toFixed(1))+" km to go"}</div>
            }
          </div>
          <button className="tap" style={{background:"none",border:"none",color:"var(--tx3)",fontSize:".8rem"}} onClick={onEditGoals}>Edit</button>
        </div>
      </div>

      {todayTasks.length>0&&(
        <div className="card a3" style={{padding:16,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
            <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)"}}>Today's Habits</div>
            <span style={{fontSize:".7rem",color:"var(--tx2)"}}>{todayDone+"/"+todayTasks.length}</span>
          </div>
          {todayTasks.map(t=>{
            const done=!!(t.completions&&t.completions[todayStr]);
            return(
              <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <div style={{width:20,height:20,borderRadius:6,border:"2px solid "+(done?"var(--gn)":"var(--bd2)"),background:done?"var(--gn)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {done&&<span style={{fontSize:".6rem",color:"#fff",fontWeight:700}}>✓</span>}
                </div>
                <span style={{fontSize:".82rem",color:done?"var(--tx3)":"var(--tx)",textDecoration:done?"line-through":"none",flex:1}}>{t.title}</span>
                {t.streak>0&&<span style={{fontSize:".7rem",color:"var(--or)"}}>{"🔥"+t.streak}</span>}
              </div>
            );
          })}
          <div className="pb" style={{marginTop:10}}>
            <div className="pf" style={{width:(todayTasks.length>0?Math.round(todayDone/todayTasks.length*100):0)+"%",background:"var(--gn)"}}/>
          </div>
        </div>
      )}
      {acts.length>0&&(
        <button className="btn b-gh" style={{width:"100%",padding:"11px",fontSize:".82rem",borderRadius:13,marginTop:4}} onClick={onViewMonthly}>📅 Monthly Report</button>
      )}
    </div>
  );
};

const StatsTab=({acts,analytics,onViewAll,onViewMonthly})=>{
  const[range,setRange]=useState(8);
  const runs=acts.filter(a=>a.type==="Run"||a.type==="Walk");
  const totalKm=runs.reduce((s,a)=>s+a.distanceKm,0);
  const weeklyData=analytics.weekly.slice(-range);
  const prs=runs.length?{
    longest:runs.reduce((b,r)=>r.distanceKm>b.distanceKm?r:b),
    fastest:runs.filter(r=>r.avgPaceSecKm>0).reduce((b,r)=>r.avgPaceSecKm<b.avgPaceSecKm?r:b,runs.find(r=>r.avgPaceSecKm>0)||runs[0])
  }:null;
  return(
    <div style={{padding:"4px 0 32px"}}>
      <div className="a0" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:18}}>
        {[
          {l:"Total km",v:parseFloat(totalKm.toFixed(0)).toLocaleString(),c:"var(--or)"},
          {l:"Runs",v:runs.length,c:"var(--bl)"},
          {l:"Time",v:fmtDur(runs.reduce((s,a)=>s+a.movingTimeSec,0)),c:"var(--gn)"}
        ].map(s=>(
          <div key={s.l} className="card2" style={{padding:"13px 10px",textAlign:"center"}}>
            <div style={{fontSize:"1.25rem",fontWeight:700,color:s.c,lineHeight:1}}>{s.v}</div>
            <div style={{fontSize:".6rem",color:"var(--tx2)",marginTop:4}}>{s.l}</div>
          </div>
        ))}
      </div>
      {weeklyData.length>1&&(
        <div className="card a1" style={{padding:16,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <SH title="Weekly Distance"/>
            <div style={{display:"flex",gap:5}}>
              {[4,8,12].map(w=>(
                <button key={w} className={"pill "+(range===w?"on":"")} onClick={()=>setRange(w)} style={{padding:"3px 9px",fontSize:".68rem"}}>{w+"w"}</button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={weeklyData} barSize={20} margin={{top:0,right:0,bottom:0,left:-28}}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" vertical={false}/>
              <XAxis dataKey="label" tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false}/>
              <Tooltip content={({active,payload,label})=>{
                if(!active||!payload||!payload.length)return null;
                return(
                  <div style={{background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:8,padding:"6px 10px"}}>
                    <div style={{fontSize:".65rem",color:"var(--tx2)"}}>{label}</div>
                    <div style={{color:"var(--or)",fontWeight:700}}>{payload[0].value+" km"}</div>
                  </div>
                );
              }}/>
              <Bar dataKey="km" fill="var(--or)" radius={[5,5,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {prs&&(
        <div className="card a2" style={{padding:16,marginBottom:14}}>
          <SH title="Personal Records"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[
              {l:"🏆 Longest",v:fmtKm(prs.longest&&prs.longest.distanceKm||0)+" km",c:"var(--or)",sub:prs.longest?fmtDateS(prs.longest.date):""},
              {l:"⚡ Best Pace",v:fmtPace(prs.fastest&&prs.fastest.avgPaceSecKm||0)+"/km",c:"var(--bl)",sub:prs.fastest?fmtDateS(prs.fastest.date):""}
            ].map(s=>(
              <div key={s.l} className="card2" style={{padding:"13px 11px"}}>
                <div style={{fontSize:".6rem",color:"var(--tx3)",marginBottom:7}}>{s.l}</div>
                <div style={{fontSize:"1.3rem",fontWeight:700,color:s.c,lineHeight:1}}>{s.v}</div>
                <div style={{fontSize:".62rem",color:"var(--tx3)",marginTop:4}}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {runs.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <button className="btn b-gh" style={{padding:"12px",fontSize:".8rem",borderRadius:13}} onClick={onViewAll}>{"🏃 All Runs ("+acts.length+")"}</button>
          <button className="btn b-gh" style={{padding:"12px",fontSize:".8rem",borderRadius:13}} onClick={onViewMonthly}>📅 Monthly</button>
        </div>
      )}
      {!runs.length&&(
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--tx2)"}}>
          <div style={{fontSize:"2rem",marginBottom:8}}>📊</div>
          <div>Upload runs to see stats</div>
        </div>
      )}
    </div>
  );
};

const HRTab=({acts,hrProfile,onEditHR})=>{
  const mafHR=getMafHR(hrProfile,null);
  const runsWithHR=acts.filter(a=>a.avgHR&&a.distanceKm>0);
  const last5=runsWithHR.slice(0,5);
  const aggZones=useMemo(()=>{
    if(!last5.length)return null;
    const secs=[0,0,0,0,0];let tot=0;
    last5.forEach(r=>{
      const z=computeZones(r.hrSamples,mafHR);
      if(z)z.forEach((zone,i)=>{secs[i]+=zone.minutes*60;tot+=zone.minutes*60;});
    });
    if(!tot)return null;
    return getMafZones(mafHR).map((z,i)=>({...z,pct:Math.round(secs[i]/tot*100),minutes:parseFloat((secs[i]/60).toFixed(1))}));
  },[last5,mafHR]);
  const insight=useMemo(()=>getMafCoachingInsight(acts,hrProfile),[acts,hrProfile]);
  return(
    <div style={{padding:"4px 0 32px"}}>
      <div className="card a0" style={{padding:20,marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:64,height:64,borderRadius:18,background:"rgba(249,115,22,.1)",border:"1px solid rgba(249,115,22,.2)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <div style={{fontSize:"1.4rem",fontWeight:700,color:"var(--or)",lineHeight:1}}>{mafHR}</div>
            <div style={{fontSize:".5rem",color:"var(--or)",opacity:.7,marginTop:2}}>BPM</div>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:".6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:4}}>MAF Heart Rate</div>
            <div style={{fontWeight:700,fontSize:".95rem",marginBottom:4}}>Aerobic Zone Target</div>
            <div style={{fontSize:".74rem",color:"var(--tx2)",lineHeight:1.5}}>
              {hrProfile&&hrProfile.age?"180 − "+hrProfile.age+" = "+mafHR+" bpm":"Set age in Settings"}
            </div>
          </div>
        </div>
        {!(hrProfile&&hrProfile.age)&&(
          <button className="btn b-or" style={{width:"100%",marginTop:14,padding:"10px",fontSize:".86rem"}} onClick={onEditHR}>Set Up MAF Profile →</button>
        )}
      </div>
      {aggZones&&(
        <div className="card a1" style={{padding:16,marginBottom:14}}>
          <SH title="Zone Distribution" sub={"Last "+last5.length+" runs"}/>
          {aggZones.map((z,i)=>(
            <div key={z.zone} style={{marginBottom:i<4?11:0}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <div style={{width:8,height:8,borderRadius:2,background:z.color}}/>
                  <span style={{fontSize:".78rem",fontWeight:600}}>{z.zone}</span>
                  <span style={{fontSize:".7rem",color:"var(--tx2)"}}>{z.label}</span>
                </div>
                <span style={{fontSize:".88rem",color:z.color,fontWeight:700}}>{z.pct+"%"}</span>
              </div>
              <div className="pb"><div className="pf" style={{width:z.pct+"%",background:z.color}}/></div>
            </div>
          ))}
        </div>
      )}
      <div className="a2" style={{marginBottom:14}}>
        <SH title="Coach Assessment"/>
        <CoachCard insight={insight}/>
      </div>
      {!runsWithHR.length&&(
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--tx2)"}}>
          <div style={{fontSize:"2rem",marginBottom:8}}>❤️</div>
          <div style={{marginBottom:12}}>No HR data yet</div>
          <button className="btn b-or" style={{padding:"10px 20px"}} onClick={onEditHR}>Set up MAF Profile</button>
        </div>
      )}
    </div>
  );
};

const TasksTab=({tasks,setTasks,hrProfile})=>{
  const todayStr=todayKey();
  const mafHR=getMafHR(hrProfile,null);
  const toggle=useCallback(id=>{
    setTasks(prev=>{
      const updated=prev.map(t=>{
        if(t.id!==id)return t;
        const done=!!(t.completions&&t.completions[todayStr]);
        const completions=Object.assign({},t.completions||{});
        if(done){delete completions[todayStr];}
        else{completions[todayStr]=true;}
        return Object.assign({},t,{completions,streak:getStreak(completions)});
      });
      saveTasks(updated);
      return updated;
    });
  },[todayStr]);
  const todayDone=tasks.filter(t=>t.enabled&&t.completions&&t.completions[todayStr]).length;
  const totalEnabled=tasks.filter(t=>t.enabled).length;
  const last7=Array.from({length:7},(_,i)=>{
    const d=new Date();d.setDate(d.getDate()-(6-i));d.setHours(0,0,0,0);
    return{key:d.toISOString().split("T")[0],label:d.toLocaleDateString("en-GB",{weekday:"short"}).slice(0,1)};
  });
  const TCLR={hr:"var(--rd)",run:"var(--or)",recovery:"var(--gn)",load:"var(--yw)",wellness:"var(--bl)"};
  return(
    <div style={{padding:"4px 0 32px"}}>
      <div className="a0" style={{marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:8}}>
          <div>
            <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:4}}>Today's Habits</div>
            <div style={{fontSize:"1.3rem",fontWeight:700,lineHeight:1}}>
              <span style={{color:todayDone===totalEnabled?"var(--gn)":"var(--or)"}}>{todayDone}</span>
              <span style={{fontSize:".9rem",color:"var(--tx2)",fontWeight:400}}>{" / "+totalEnabled}</span>
            </div>
          </div>
          <Ring pct={totalEnabled>0?todayDone/totalEnabled:0} size={50} color={todayDone===totalEnabled?"var(--gn)":"var(--or)"}>
            <span style={{fontSize:".55rem",fontWeight:700,color:todayDone===totalEnabled?"var(--gn)":"var(--or)"}}>{(totalEnabled>0?Math.round(todayDone/totalEnabled*100):0)+"%"}</span>
          </Ring>
        </div>
        <div className="pb" style={{height:4}}>
          <div className="pf" style={{width:(totalEnabled>0?Math.round(todayDone/totalEnabled*100):0)+"%",background:todayDone===totalEnabled?"var(--gn)":"var(--or)"}}/>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {tasks.filter(t=>t.enabled).map((task,i)=>{
          const done=!!(task.completions&&task.completions[todayStr]);
          const col=TCLR[task.category]||"var(--tx2)";
          const detail=task.category==="hr"&&hrProfile&&hrProfile.age?"MAF = "+mafHR+" bpm · Stay below this":task.desc;
          return(
            <div key={task.id} className={"card tap a"+(i<4?i:3)}
              style={{padding:"14px 15px",borderColor:done?col+"30":"var(--bd)",background:done?col+"08":"var(--s1)",transition:"all .2s",cursor:"pointer"}}
              onClick={()=>toggle(task.id)}>
              <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                <div style={{width:24,height:24,borderRadius:7,border:"2.5px solid "+(done?col:"var(--bd2)"),background:done?col:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1,transition:"all .15s"}}>
                  {done&&<span style={{color:"#fff",fontSize:".65rem",fontWeight:700}}>✓</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                    <div>
                      <div style={{fontSize:".88rem",fontWeight:600,textDecoration:done?"line-through":"none",color:done?"var(--tx2)":"var(--tx)",marginBottom:2}}>{task.icon+" "+task.title}</div>
                      <div style={{fontSize:".72rem",color:"var(--tx3)",lineHeight:1.4}}>{detail}</div>
                    </div>
                    {task.streak>0&&<div style={{textAlign:"center",flexShrink:0}}><div>🔥</div><div style={{fontSize:".7rem",fontWeight:700,color:"var(--or)"}}>{task.streak}</div></div>}
                  </div>
                  <div style={{display:"flex",gap:4,marginTop:9}}>
                    {last7.map(({key,label})=>{
                      const comp=!!(task.completions&&task.completions[key]);
                      const isToday=key===todayStr;
                      return(
                        <div key={key} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:comp?col:isToday?"var(--bd2)":"var(--bd)"}}/>
                          <div style={{fontSize:".46rem",color:"var(--tx3)"}}>{label}</div>
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
    </div>
  );
};

const AchievementsTab=({earnedBadges,acts,analytics})=>{
  const earned=BADGE_DEFS.filter(b=>earnedBadges.has(b.id));
  const grouped=useMemo(()=>{
    const map={};
    BADGE_CAT_ORDER.forEach(c=>{map[c]=BADGE_DEFS.filter(b=>b.cat===c).map(b=>Object.assign({},b,{earned:earnedBadges.has(b.id)}));});
    return map;
  },[earnedBadges]);
  return(
    <div style={{padding:"4px 0 40px"}}>
      <div className="a0" style={{marginBottom:18}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <Ring pct={earned.length/BADGE_DEFS.length} size={62} color="var(--or)">
            <span style={{fontSize:".56rem",fontWeight:700,color:"var(--or)"}}>{Math.round(earned.length/BADGE_DEFS.length*100)+"%"}</span>
          </Ring>
          <div>
            <div style={{fontSize:"1.3rem",fontWeight:800,lineHeight:1}}>
              <span style={{color:"var(--or)"}}>{earned.length}</span>
              <span style={{fontSize:".82rem",color:"var(--tx2)",fontWeight:400}}>{" / "+BADGE_DEFS.length}</span>
            </div>
            <div style={{fontSize:".74rem",color:"var(--tx2)",marginTop:4}}>badges earned</div>
            <div style={{fontSize:".68rem",color:"var(--tx3)",marginTop:2}}>{analytics.streak+"d streak · "+acts.length+" runs"}</div>
          </div>
        </div>
      </div>
      {earned.length>0&&(
        <div className="card a1" style={{padding:16,marginBottom:14}}>
          <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:10}}>Latest Badges</div>
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}} className="scroll-x">
            {earned.slice(-5).reverse().map((b,i)=>(
              <div key={b.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"10px 9px",minWidth:68,borderRadius:12,flexShrink:0,background:b.color+"15",border:"1.5px solid "+b.color+"30",animation:"pop .4s "+(i*0.06)+"s both"}}>
                <span style={{fontSize:"1.7rem"}}>{b.icon}</span>
                <div style={{fontSize:".58rem",fontWeight:700,color:b.color,textAlign:"center",lineHeight:1.3}}>{b.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {BADGE_CAT_ORDER.map((cat,ci)=>{
        const badges=grouped[cat];
        if(!badges||!badges.length)return null;
        const catEarned=badges.filter(b=>b.earned).length;
        return(
          <div key={cat} className={"a"+(ci<3?ci+1:3)} style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)"}}>{BADGE_CAT_LABEL[cat]}</div>
              <span style={{fontSize:".62rem",color:"var(--tx3)"}}>{catEarned+"/"+badges.length}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {badges.map(b=>(
                <div key={b.id} className="card2" style={{padding:"12px 13px",display:"flex",alignItems:"center",gap:12,opacity:b.earned?1:.45,borderColor:b.earned?b.color+"28":"var(--bd)",background:b.earned?b.color+"07":"var(--s2)"}}>
                  <div style={{width:40,height:40,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",background:b.earned?b.color+"18":"var(--s3)",border:"1px solid "+(b.earned?b.color+"30":"var(--bd2)"),fontSize:"1.4rem",flexShrink:0,filter:b.earned?"none":"grayscale(1) brightness(.5)"}}>{b.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:".84rem",color:b.earned?b.color:"var(--tx2)",marginBottom:2}}>{b.name}</div>
                    <div style={{fontSize:".7rem",color:"var(--tx3)",lineHeight:1.4}}>{b.desc}</div>
                  </div>
                  {b.earned
                    ?<div style={{width:20,height:20,borderRadius:"50%",background:"var(--gn)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:".6rem",color:"#fff",fontWeight:700}}>✓</span></div>
                    :<span style={{fontSize:".9rem",color:"var(--tx3)"}}>🔒</span>
                  }
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {!acts.length&&(
        <div style={{textAlign:"center",padding:"48px 0",color:"var(--tx2)"}}>
          <div style={{fontSize:"3rem",marginBottom:12}}>🏅</div>
          <div style={{fontWeight:600,marginBottom:5}}>No badges yet</div>
          <div style={{fontSize:".82rem"}}>Upload your first run to start earning</div>
        </div>
      )}
    </div>
  );
};

const MonthlyReport=({acts,onClose})=>(
  <div style={{position:"fixed",inset:0,zIndex:220,background:"var(--bg)",display:"flex",flexDirection:"column"}}>
    <div className="glass" style={{padding:"14px 18px 12px",borderBottom:"1px solid var(--bd)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{fontWeight:700,fontSize:"1.05rem"}}>Monthly Report</div>
      <button className="btn b-gh" style={{padding:"6px 13px",fontSize:".8rem"}} onClick={onClose}>✕ Close</button>
    </div>
    <div style={{flex:1,padding:"24px 18px",textAlign:"center",color:"var(--tx2)"}}>
      <div style={{fontSize:"2.5rem",marginBottom:12}}>📅</div>
      <div style={{fontWeight:600,marginBottom:8}}>Monthly Reports</div>
      <div style={{fontSize:".84rem",lineHeight:1.7,maxWidth:280,margin:"0 auto"}}>
        Full monthly reports with stats, HR analysis and coach summaries are available in your live app at your Vercel URL.
      </div>
    </div>
  </div>
);

const SettingsPanel=({
  acts,goals,hrProfile,profile,
  onSaveGoals,onSaveHR,onSaveProfile,onClearAll,onClose,
  stravaAuth,stravaSync,onStravaConnect,onStravaSync,onStravaDisconnect
})=>{
  const[view,setView]=useState("main");
  const[age,setAge]=useState(hrProfile.age||"");
  const[override,setOverride]=useState(hrProfile.maxHROverride||"");
  const[useOv,setUseOv]=useState(!!hrProfile.maxHROverride);
  const[weekly,setWeekly]=useState(goals.weekly);
  const[monthly,setMonthly]=useState(goals.monthly);
  const[name,setName]=useState(profile.name||"Runner");
  const ageNum=parseInt(age)||null;
  const previewMaf=useOv&&parseInt(override)?parseInt(override):ageNum?180-ageNum:null;
  return(
    <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(0,0,0,.6)"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="glass" style={{width:"100%",maxWidth:430,borderRadius:"22px 22px 0 0",padding:"22px 20px 40px",maxHeight:"92vh",overflowY:"auto",border:"1px solid var(--bd)"}}>
        <div style={{width:36,height:4,borderRadius:2,background:"var(--bd2)",margin:"0 auto 18px"}}/>
        {view==="main"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <div style={{fontWeight:700,fontSize:"1.05rem"}}>Settings</div>
              <button className="btn b-gh" style={{padding:"6px 13px",fontSize:".8rem"}} onClick={onClose}>Done</button>
            </div>
            {[
              {icon:"👤",label:"Profile",action:()=>setView("profile")},
              {icon:"❤️",label:"MAF HR Profile",action:()=>setView("hr")},
              {icon:"🎯",label:"Distance Goals",action:()=>setView("goals")},
              {icon:"🟠",label:"Strava Sync",action:()=>setView("strava")}
            ].map(item=>(
              <div key={item.label} className="tap card2" style={{padding:"14px 15px",marginBottom:10,display:"flex",alignItems:"center",gap:14,borderRadius:12,cursor:"pointer"}} onClick={item.action}>
                <div style={{width:36,height:36,borderRadius:10,background:"var(--s3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem"}}>{item.icon}</div>
                <div style={{flex:1,fontWeight:500,fontSize:".88rem"}}>{item.label}</div>
                <div style={{color:"var(--tx3)"}}>›</div>
              </div>
            ))}
            <div className="card2" style={{padding:14,marginBottom:10,borderRadius:12}}>
              <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:8}}>Library</div>
              {[["Activities",String(acts.length)],["Storage",Math.round(JSON.stringify(acts).length/1024)+" KB"]].map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0"}}>
                  <span style={{fontSize:".8rem",color:"var(--tx2)"}}>{l}</span>
                  <span style={{fontSize:".8rem",fontWeight:600}}>{v}</span>
                </div>
              ))}
            </div>
            <button className="btn b-rd" style={{width:"100%",padding:"12px",fontSize:".84rem"}} onClick={onClearAll}>🗑 Delete All Activities</button>
          </div>
        )}
        {view==="profile"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <button className="tap" style={{background:"none",border:"none",color:"var(--tx2)",fontSize:"1.1rem"}} onClick={()=>setView("main")}>‹</button>
              <div style={{fontWeight:700,fontSize:"1.05rem"}}>Profile</div>
            </div>
            <label style={{fontSize:".76rem",fontWeight:600,display:"block",marginBottom:7}}>Your name</label>
            <input className="inp" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Alex" style={{marginBottom:18}}/>
            <button className="btn b-or" style={{width:"100%",padding:"12px"}} onClick={()=>{onSaveProfile({name:name||"Runner"});setView("main");}}>Save</button>
          </div>
        )}
        {view==="hr"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <button className="tap" style={{background:"none",border:"none",color:"var(--tx2)",fontSize:"1.1rem"}} onClick={()=>setView("main")}>‹</button>
              <div style={{fontWeight:700,fontSize:"1.05rem"}}>MAF HR Profile</div>
            </div>
            <label style={{fontSize:".76rem",fontWeight:600,display:"block",marginBottom:7}}>{"Age · 180 − age formula"}</label>
            <input className="inp" type="number" min="10" max="100" placeholder="e.g. 32" value={age} onChange={e=>setAge(e.target.value)} style={{marginBottom:ageNum&&!useOv?6:14}}/>
            {ageNum&&!useOv&&<div style={{fontSize:".72rem",color:"var(--gn)",marginBottom:14}}>{"✓ MAF HR: "+(180-ageNum)+" bpm"}</div>}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:useOv?10:16}}>
              <div style={{width:36,height:20,borderRadius:10,background:useOv?"var(--or)":"var(--bd2)",position:"relative",cursor:"pointer",transition:"background .2s"}} onClick={()=>setUseOv(v=>!v)}>
                <div style={{position:"absolute",top:2,left:useOv?18:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
              </div>
              <label style={{fontSize:".78rem",fontWeight:500,cursor:"pointer"}} onClick={()=>setUseOv(v=>!v)}>Custom MAF override</label>
            </div>
            {useOv&&<input className="inp" type="number" min="100" max="220" placeholder="e.g. 148" value={override} onChange={e=>setOverride(e.target.value)} style={{marginBottom:14}}/>}
            {previewMaf&&(
              <div style={{marginBottom:16,padding:"12px 13px",background:"rgba(249,115,22,.07)",border:"1px solid rgba(249,115,22,.2)",borderRadius:12}}>
                <div style={{fontSize:".7rem",color:"var(--or)",fontWeight:600,marginBottom:7}}>{"Preview · MAF = "+previewMaf+" bpm"}</div>
                {getMafZones(previewMaf).map(z=>(
                  <div key={z.zone} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:z.color}}/>
                    <span style={{fontSize:".72rem",flex:1}}>{z.zone+" "+z.label}</span>
                    <span style={{fontSize:".72rem",color:z.color,fontWeight:600}}>{z.hi===999?">"+(Math.round(z.lo))+" bpm":Math.round(z.lo)+"–"+Math.round(z.hi)+" bpm"}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <button className="btn b-gh" style={{padding:"12px 14px"}} onClick={()=>{onSaveHR({age:null,restingHR:null,maxHROverride:null});setView("main");}}>Clear</button>
              <button className="btn b-or" style={{flex:1,padding:"12px"}} onClick={()=>{onSaveHR({age:ageNum,restingHR:null,maxHROverride:useOv&&parseInt(override)?parseInt(override):null});setView("main");}}>Save Profile</button>
            </div>
          </div>
        )}
        {view==="goals"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <button className="tap" style={{background:"none",border:"none",color:"var(--tx2)",fontSize:"1.1rem"}} onClick={()=>setView("main")}>‹</button>
              <div style={{fontWeight:700,fontSize:"1.05rem"}}>Distance Goals</div>
            </div>
            {[["Weekly goal (km)",weekly,setWeekly],["Monthly goal (km)",monthly,setMonthly]].map(([l,v,sv])=>(
              <div key={l} style={{marginBottom:16}}>
                <label style={{fontSize:".76rem",fontWeight:600,display:"block",marginBottom:7}}>{l}</label>
                <input className="inp" type="number" min="1" max="500" value={v} onChange={e=>sv(Number(e.target.value))}/>
              </div>
            ))}
            <button className="btn b-or" style={{width:"100%",padding:"12px"}} onClick={()=>{onSaveGoals({weekly:Number(weekly),monthly:Number(monthly)});setView("main");}}>Save Goals</button>
          </div>
        )}
        {view==="strava"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
              <button className="tap" style={{background:"none",border:"none",color:"var(--tx2)",fontSize:"1.1rem"}} onClick={()=>setView("main")}>‹</button>
              <div style={{fontWeight:700,fontSize:"1.05rem"}}>Strava Sync</div>
            </div>
            {stravaAuth?(
              <div>
                <div style={{padding:"12px 14px",borderRadius:12,background:"var(--gn2)",border:"1px solid rgba(34,197,94,.2)",marginBottom:14,display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:38,height:38,borderRadius:"50%",background:"#fc4c02",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.2rem",flexShrink:0}}>🟠</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:".88rem",color:"var(--gn)"}}>✓ Connected to Strava</div>
                    <div style={{fontSize:".74rem",color:"var(--tx2)",marginTop:2}}>{(stravaAuth.athlete&&stravaAuth.athlete.firstname)||"Athlete"}</div>
                  </div>
                </div>
                <button className="btn b-or" style={{width:"100%",padding:"12px",fontSize:".88rem",marginBottom:10}} onClick={onStravaSync} disabled={stravaSync&&stravaSync.loading}>
                  {stravaSync&&stravaSync.loading?"⏳ Syncing…":"🔄 Sync from Strava"}
                </button>
                {stravaSync&&stravaSync.msg&&<div style={{fontSize:".74rem",color:"var(--tx2)",textAlign:"center",marginBottom:12,padding:"7px",background:"var(--s3)",borderRadius:9}}>{stravaSync.msg}</div>}
                <button className="btn b-rd" style={{width:"100%",padding:"11px",fontSize:".82rem"}} onClick={()=>{onStravaDisconnect();setView("main");}}>Disconnect Strava</button>
              </div>
            ):(
              <div>
                <div style={{textAlign:"center",padding:"16px 0 20px"}}>
                  <div style={{fontSize:"2.5rem",marginBottom:10}}>🟠</div>
                  <div style={{fontWeight:700,marginBottom:8}}>Connect Strava</div>
                  <div style={{fontSize:".8rem",color:"var(--tx2)",lineHeight:1.7,marginBottom:20}}>Import your runs automatically. No GPX uploads needed.</div>
                </div>
                <button className="btn b-or" style={{width:"100%",padding:"13px",fontSize:".9rem",marginBottom:10}} onClick={onStravaConnect}>🟠 Connect with Strava</button>
                {stravaSync&&stravaSync.msg&&<div style={{fontSize:".74rem",color:"var(--rd)",textAlign:"center",marginTop:8}}>{stravaSync.msg}</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const TABS=[
  {id:"home",icon:"🏃",label:"Home"},
  {id:"stats",icon:"📊",label:"Stats"},
  {id:"hr",icon:"❤️",label:"HR"},
  {id:"tasks",icon:"✅",label:"Tasks"},
  {id:"awards",icon:"🏅",label:"Awards"}
];

export default function App(){
  const[acts,setActs]=useState(()=>loadActs());
  const[goals,setGoals]=useState(()=>loadGoals());
  const[hrProfile,setHRProfile]=useState(()=>loadHRProfile());
  const[profile,setProfile]=useState(()=>loadProfile());
  const[tasks,setTasks]=useState(()=>loadTasks());
  const[seenBadges,setSeenBadges]=useState(()=>loadSeenBadges());
  const[tab,setTab]=useState("home");
  const[detail,setDetail]=useState(null);
  const[showSettings,setShowSettings]=useState(false);
  const[showUpload,setShowUpload]=useState(false);
  const[showSplash,setShowSplash]=useState(true);
  const[showAllRuns,setShowAllRuns]=useState(false);
  const[showMonthly,setShowMonthly]=useState(false);
  const[feedbackRun,setFeedbackRun]=useState(null);
  const[stravaAuth,setStravaAuth]=useState(()=>loadStravaAuth());
  const[stravaSync,setStravaSync]=useState({loading:false,msg:""});
  const scrollRef=useRef(null);

  useEffect(()=>{saveActs(acts);},[acts]);
  useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTo({top:0,behavior:"smooth"});},[tab]);

  const analytics=useMemo(()=>buildAnalytics(acts,hrProfile),[acts,hrProfile]);
  const mafHRGlobal=useMemo(()=>getMafHR(hrProfile,null),[hrProfile]);
  const earnedBadges=useMemo(()=>computeEarnedBadges(acts,analytics,mafHRGlobal),[acts,analytics,mafHRGlobal]);
  const newBadges=useMemo(()=>[...earnedBadges].filter(id=>!seenBadges.has(id)),[earnedBadges,seenBadges]);
  const hasUnseen=newBadges.length>0;

  useEffect(()=>{
    if(tab==="awards"&&hasUnseen){
      const next=new Set([...seenBadges,...earnedBadges]);
      setSeenBadges(next);saveSeenBadges(next);
    }
  },[tab]);

  const doStravaRef=useRef(null);
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const code=params.get("code");
    if(!code)return;
    window.history.replaceState({},"",window.location.pathname);
    setStravaSync({loading:true,msg:"Connecting to Strava…"});
    fetch("/api/strava-token?code="+code)
      .then(r=>r.json())
      .then(data=>{
        if(!data.access_token){setStravaSync({loading:false,msg:"Connection failed."});return;}
        saveStravaAuth(data);setStravaAuth(data);
        setStravaSync({loading:false,msg:"Connected ✓"});
        if(doStravaRef.current)doStravaRef.current(data);
      })
      .catch(()=>setStravaSync({loading:false,msg:"Connection failed."}));
  },[]);

  const getStravaToken=useCallback(async auth=>{
    if(!auth)return null;
    if(Date.now()/1000<auth.expires_at-300)return auth.access_token;
    try{
      const r=await fetch("/api/strava-refresh",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refresh_token:auth.refresh_token})});
      const fresh=await r.json();
      if(!fresh.access_token)return null;
      const upd=Object.assign({},auth,fresh);
      saveStravaAuth(upd);setStravaAuth(upd);
      return fresh.access_token;
    }catch(e){return null;}
  },[]);

  const doStravaSync=useCallback(async authOverride=>{
    const auth=authOverride||stravaAuth;
    if(!auth){setStravaSync({loading:false,msg:"Not connected."});return;}
    setStravaSync({loading:true,msg:"Fetching from Strava…"});
    const token=await getStravaToken(auth);
    if(!token){setStravaSync({loading:false,msg:"Session expired — reconnect Strava."});return;}
    try{
      const res=await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=100&page=1",{headers:{Authorization:"Bearer "+token}});
      const data=await res.json();
      if(!Array.isArray(data)){setStravaSync({loading:false,msg:"Sync error."});return;}
      const mapped=data.filter(a=>["Run","Walk","Hike","TrailRun","VirtualRun"].includes(a.sport_type||a.type)).map(mapStravaActivity);
      let added=0;
      setActs(prev=>{
        const ids=new Set(prev.map(a=>a.id));
        const fresh=mapped.filter(a=>!ids.has(a.id));
        added=fresh.length;
        if(!fresh.length)return prev;
        return [...fresh,...prev].sort((a,b)=>b.dateTs-a.dateTs);
      });
      setStravaSync({loading:false,msg:"Synced "+mapped.length+" activities (+"+ added+" new) ✓"});
    }catch(e){setStravaSync({loading:false,msg:"Sync failed."});}
  },[stravaAuth,getStravaToken]);

  useEffect(()=>{doStravaRef.current=doStravaSync;},[doStravaSync]);

  useEffect(()=>{history.replaceState({_rl:"root"},"");history.pushState({_rl:"s"},"");},[]);

  const detRef=useRef(null),fbRef=useRef(null),setRef=useRef(null),arRef=useRef(null),monRef=useRef(null),upRef=useRef(null);
  useEffect(()=>{detRef.current=detail;},[detail]);
  useEffect(()=>{fbRef.current=feedbackRun;},[feedbackRun]);
  useEffect(()=>{setRef.current=showSettings;},[showSettings]);
  useEffect(()=>{arRef.current=showAllRuns;},[showAllRuns]);
  useEffect(()=>{monRef.current=showMonthly;},[showMonthly]);
  useEffect(()=>{upRef.current=showUpload;},[showUpload]);

  useEffect(()=>{
    const h=()=>{
      if(fbRef.current){history.pushState({_rl:"s"},"");setFeedbackRun(null);return;}
      if(detRef.current){history.pushState({_rl:"s"},"");setDetail(null);return;}
      if(setRef.current){history.pushState({_rl:"s"},"");setShowSettings(false);return;}
      if(arRef.current){history.pushState({_rl:"s"},"");setShowAllRuns(false);return;}
      if(monRef.current){history.pushState({_rl:"s"},"");setShowMonthly(false);return;}
      if(upRef.current){history.pushState({_rl:"s"},"");setShowUpload(false);return;}
    };
    window.addEventListener("popstate",h);
    return()=>window.removeEventListener("popstate",h);
  },[]);

  const openDetail=useCallback(act=>{history.pushState({_rl:"d"},"");setDetail(act);},[]);
  const openSettings=useCallback(()=>{history.pushState({_rl:"s"},"");setShowSettings(true);},[]);
  const openAllRuns=useCallback(()=>{history.pushState({_rl:"a"},"");setShowAllRuns(true);},[]);
  const openMonthly=useCallback(()=>{history.pushState({_rl:"m"},"");setShowMonthly(true);},[]);
  const openUpload=useCallback(()=>{history.pushState({_rl:"u"},"");setShowUpload(true);},[]);
  const back=useCallback(()=>history.back(),[]);

  const handleStravaConnect=useCallback(()=>{
    const clientId=window.__STRAVA_CLIENT_ID||localStorage.getItem("strava_client_id")||"";
    if(!clientId){
      const id=prompt("Enter your Strava Client ID (from strava.com/settings/api):");
      if(!id)return;
      localStorage.setItem("strava_client_id",id.trim());
      window.location.href="https://www.strava.com/oauth/authorize?client_id="+id.trim()+"&redirect_uri="+encodeURIComponent(window.location.origin+"/")+"&response_type=code&approval_prompt=auto&scope=activity:read_all";
      return;
    }
    window.location.href="https://www.strava.com/oauth/authorize?client_id="+clientId+"&redirect_uri="+encodeURIComponent(window.location.origin+"/")+"&response_type=code&approval_prompt=auto&scope=activity:read_all";
  },[]);

  const addActs=useCallback(parsed=>{
    setActs(prev=>{const m=[...parsed,...prev];m.sort((a,b)=>b.dateTs-a.dateTs);return m;});
    if(parsed.length>0){const h=parsed.reduce((b,r)=>r.distanceKm>b.distanceKm?r:b,parsed[0]);setFeedbackRun(h);}
    if(upRef.current)history.back();
    setTab("home");
  },[]);

  const deleteAct=useCallback(id=>{setActs(p=>p.filter(a=>a.id!==id));if(detRef.current)history.back();},[]);

  const clearAll=()=>{if(!confirm("Delete all "+acts.length+" activities?"))return;setActs([]);saveActs([]);};

  const closeFeedback=useCallback(()=>{
    const next=new Set([...seenBadges,...earnedBadges]);
    setSeenBadges(next);saveSeenBadges(next);setFeedbackRun(null);
  },[earnedBadges,seenBadges]);

  const[splashOut,setSplashOut]=useState(false);
  useEffect(()=>{
    const t1=setTimeout(()=>setSplashOut(true),1400);
    const t2=setTimeout(()=>setShowSplash(false),1750);
    return()=>{clearTimeout(t1);clearTimeout(t2);};
  },[]);

  return(
    <div>
      <Styles/>
      {showSplash&&(
        <div style={{position:"fixed",inset:0,zIndex:999,background:"var(--bg)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",opacity:splashOut?0:1,transition:"opacity .33s ease",pointerEvents:splashOut?"none":"auto"}}>
          <div style={{width:64,height:64,borderRadius:18,background:"linear-gradient(135deg,#f97316,#c2410c)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"2rem",animation:"glow 2s infinite",marginBottom:18}}>🏃</div>
          <div style={{fontSize:"1.7rem",fontWeight:700,letterSpacing:".06em",marginBottom:7}}>RUNLYTICS</div>
          <div style={{fontSize:".88rem",color:"var(--tx2)"}}>Your personal running coach</div>
          <div style={{display:"flex",gap:6,marginTop:26}}>
            {[0,.15,.3].map(d=>(
              <div key={d} style={{width:6,height:6,borderRadius:"50%",background:"var(--or)",animation:"pulse 1.2s "+d+"s ease infinite"}}/>
            ))}
          </div>
        </div>
      )}
      {feedbackRun&&<FeedbackModal run={feedbackRun} mafHR={getMafHR(hrProfile,feedbackRun.maxHR)} newBadges={newBadges} onClose={closeFeedback}/>}
      {showAllRuns&&<AllRunsView acts={acts} hrProfile={hrProfile} onSelect={openDetail} onClose={back}/>}
      {showMonthly&&<MonthlyReport acts={acts} onClose={back}/>}
      {detail&&<Detail act={detail} hrProfile={hrProfile} onClose={back} onDelete={id=>deleteAct(id)}/>}
      {showSettings&&(
        <SettingsPanel
          acts={acts} goals={goals} hrProfile={hrProfile} profile={profile}
          onSaveGoals={g=>{setGoals(g);saveGoals(g);back();}}
          onSaveHR={p=>{setHRProfile(p);saveHRProfile(p);}}
          onSaveProfile={p=>{setProfile(p);saveProfile(p);}}
          onClearAll={clearAll} onClose={back}
          stravaAuth={stravaAuth} stravaSync={stravaSync}
          onStravaConnect={handleStravaConnect}
          onStravaSync={()=>doStravaSync()}
          onStravaDisconnect={()=>{clearStravaAuth();setStravaAuth(null);setStravaSync({loading:false,msg:""}); }}
        />
      )}
      <div style={{maxWidth:430,margin:"0 auto",minHeight:"100vh",background:"var(--bg)",display:"flex",flexDirection:"column"}}>
        <div className="glass" style={{position:"sticky",top:0,zIndex:50,padding:"13px 18px 11px",borderBottom:"1px solid var(--bd)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:26,height:26,borderRadius:7,background:"linear-gradient(135deg,#f97316,#c2410c)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".82rem"}}>🏃</div>
              <span style={{fontSize:".96rem",fontWeight:700,letterSpacing:".06em"}}>RUNLYTICS</span>
            </div>
            <div style={{display:"flex",gap:7,alignItems:"center"}}>
              {acts.length>0&&<span style={{background:"var(--or2)",color:"var(--or)",padding:"2px 8px",borderRadius:20,fontSize:".6rem",fontWeight:700}}>{acts.length+" runs"}</span>}
              <button className="btn b-or" style={{padding:"6px 12px",fontSize:".76rem"}} onClick={()=>showUpload?back():openUpload()}>
                {showUpload?"✕ Close":"+ Upload"}
              </button>
              <button className="tap" style={{background:"none",border:"none",color:"var(--tx2)",fontSize:"1.05rem"}} onClick={openSettings}>⚙️</button>
            </div>
          </div>
        </div>
        <div ref={scrollRef} style={{flex:1,overflowY:"auto",padding:"0 18px"}}>
          {showUpload?(
            <Upload acts={acts} hrProfile={hrProfile} onAdd={addActs} onClearAll={clearAll}/>
          ):(
            <div>
              {tab==="home"&&(
                <HomeTab acts={acts} analytics={analytics} goals={goals} hrProfile={hrProfile} profile={profile} tasks={tasks}
                  onSelectAct={openDetail} onUpload={openUpload} onViewAll={openAllRuns}
                  onViewMonthly={openMonthly} onEditGoals={openSettings}/>
              )}
              {tab==="stats"&&<StatsTab acts={acts} analytics={analytics} onViewAll={openAllRuns} onViewMonthly={openMonthly}/>}
              {tab==="hr"&&<HRTab acts={acts} hrProfile={hrProfile} onEditHR={openSettings}/>}
              {tab==="tasks"&&<TasksTab tasks={tasks} setTasks={setTasks} hrProfile={hrProfile}/>}
              {tab==="awards"&&<AchievementsTab earnedBadges={earnedBadges} acts={acts} analytics={analytics}/>}
            </div>
          )}
        </div>
        {!showUpload&&(
          <div className="glass" style={{position:"sticky",bottom:0,borderTop:"1px solid var(--bd)",display:"flex",paddingBottom:"env(safe-area-inset-bottom,0)"}}>
            {TABS.map(t=>(
              <button key={t.id} className={"tab-btn "+(tab===t.id?"on":"")} onClick={()=>setTab(t.id)} style={{position:"relative"}}>
                <span style={{fontSize:"1.1rem",lineHeight:1,marginBottom:1}}>{t.icon}</span>
                {t.label}
                {t.id==="awards"&&hasUnseen&&tab!=="awards"&&(
                  <span style={{position:"absolute",top:5,right:"calc(50% - 10px)",width:6,height:6,borderRadius:"50%",background:"var(--or)",border:"1.5px solid var(--bg)"}}/>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
