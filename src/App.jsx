import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

const STORAGE_KEY    = "runlytics_data_v1";
const GOALS_KEY      = "runlytics_goals_v1";
const NAV_KEY        = "runlytics_nav_v1";
const TAB_KEY        = "runlytics_tab_v1";
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
    loadLabel: (()=>{
      const t=a.average_heartrate&&a.moving_time
        ?Math.min(100,Math.round((a.moving_time/60)*(a.average_heartrate/145)*1.1))
        :Math.min(100,Math.round((a.moving_time/60)*0.5));
      return t<=40?"Easy":t<=70?"Moderate":"Hard";
    })(),
    loadColor: (()=>{const t=a.average_heartrate&&a.moving_time?Math.min(100,Math.round((a.moving_time/60)*(a.average_heartrate/145)*1.1)):Math.min(100,Math.round((a.moving_time/60)*0.5));return t<=40?"#22c55e":t<=70?"#f97316":"#ef4444";})(),
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
  if (!runsWithHR.length) return { type:"neutral", title:"Set up your HR profile", body:"Enter your age in HR Insights to unlock MAF-based coaching.", action:"Go to HR Insights \\u2192" };
  const aboveMaf = runsWithHR.filter(a=>a.avgHR>mafHR).length;
  const ratio = aboveMaf/runsWithHR.length;
  const avgHR = Math.round(runsWithHR.reduce((s,a)=>s+a.avgHR,0)/runsWithHR.length);
  if (ratio>=0.6)
    return { type:"warning", title:"Training too hard", body:`${Math.round(ratio*100)}% of recent runs exceeded your MAF HR (${mafHR} bpm). This limits aerobic development.`, action:"Slow down on next run \\u2192", mafHR, avgHR };
  if (ratio<=0.2)
    return { type:"positive", title:"Great aerobic training", body:`You're staying below MAF HR consistently. This builds the aerobic base that makes you faster long-term.`, action:"Keep it up \\u2192", mafHR, avgHR };
  return { type:"info", title:"Mixed intensity", body:`Some runs above MAF (${mafHR} bpm). Aim for 80% of runs to be below MAF for optimal aerobic development.`, action:"See HR breakdown \\u2192", mafHR, avgHR };
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
  if (!acts.length) return { icon:"\ud83d\udc5f", title:"Upload your first run", sub:"Import a GPX file to start coaching.", type:"neutral" };
  if (highLoadStreak) return { icon:"\ud83d\ude34", title:"Rest or recover today", sub:"3 hard sessions in a row \u2014 your body needs recovery.", type:"warning" };
  if (hrRatio >= 0.6 && last?.avgHR) return { icon:"\ud83d\udc9a", title:"Easy run today", sub:`Stay below ${mafHR} bpm to build aerobic base.`, type:"positive" };
  if (daysSinceLast >= 3) return { icon:"\ud83c\udfc3", title:"Time to run again", sub:`${daysSinceLast} days off \u2014 an easy run keeps consistency.`, type:"info" };
  if (daysSinceLast >= 2) return { icon:"\ud83c\udfc3", title:"Easy run recommended", sub:"2 days rest \u2014 a light aerobic run today is ideal.", type:"info" };
  if (hrRatio <= 0.2 && runsWithHR.length >= 3) return { icon:"\ud83d\udcc8", title:"You're building well", sub:"Consistent aerobic pace \u2014 keep it up.", type:"positive" };
  if (avgLoad > 70) return { icon:"\u26a1", title:"High load this week", sub:"Consider rest or recovery today.", type:"warning" };
  return { icon:"\u2705", title:"Stay consistent", sub:"Your training is on track. Keep the aerobic pace.", type:"neutral" };
}

function getRunFeedback(run, mafHR) {
  if (!run) return null;
  const { avgHR, trainingLoad, splitInsight, distanceKm } = run;
  const feedbacks = [];
  if (avgHR && avgHR <= mafHR)
    feedbacks.push({ type:"positive", icon:"\ud83d\udc9a", title:"Good aerobic run", detail:"You stayed at or below MAF \u2014 perfect for endurance building." });
  else if (avgHR && avgHR > mafHR)
    feedbacks.push({ type:"warning", icon:"\u26a0\ufe0f", title:"Above MAF HR", detail:`Avg ${avgHR} bpm exceeded your MAF (${mafHR} bpm). Slow down next time.` });
  if (splitInsight?.splitType === "negative")
    feedbacks.push({ type:"positive", icon:"\u2b06\ufe0f", title:"Great pacing", detail:"Negative split \u2014 you ran the second half faster. Excellent control." });
  else if (splitInsight?.splitType === "positive")
    feedbacks.push({ type:"info", icon:"\u2b07\ufe0f", title:"Started too fast", detail:"Positive split \u2014 try starting easier and building pace." });
  if ((trainingLoad||0) > 70)
    feedbacks.push({ type:"warning", icon:"\ud83d\udd25", title:"High training load", detail:"This was a tough session. Prioritise sleep and recovery." });
  if (!avgHR)
    feedbacks.push({ type:"neutral", icon:"\ud83d\udcca", title:"No HR data", detail:"Upload from a HR-enabled watch to unlock MAF coaching." });
  return feedbacks.length ? feedbacks : [{ type:"positive", icon:"\u2705", title:"Run saved", detail:`${distanceKm?.toFixed(1)} km logged successfully.` }];
}

function parseGPX(xmlText, fileName, hrProfile=null) {
  const doc=new DOMParser().parseFromString(xmlText,"application/xml");
  if(doc.querySelector("parsererror"))throw new Error("Invalid GPX file");
  const name=(doc.querySelector("trk > name")||doc.querySelector("name"))?.textContent?.trim()||fileName.replace(/\.gpx$/i,"");
  const pts=Array.from(doc.querySelectorAll("trkpt")).map(p=>({
    lat:parseFloat(p.getAttribute("lat")),lon:parseFloat(p.getAttribute("lon")),
    ele:parseFloat(p.querySelector("ele")?.textContent||"0")||0,
    time:p.querySelector("time")?.textContent||null,
    hr:parseInt(p.querySelector("extensions hr,heartrate")?.textContent)||null,
  })).filter(p=>!isNaN(p.lat)&&!isNaN(p.lon));
  if(!pts.length)throw new Error("No track points found");
  let dist=0,movingTime=0,elevGain=0,hrSum=0,hrCt=0;
  const R=6371000;
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i];
    const dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lon-a.lon)*Math.PI/180;
    const s=2*R*Math.asin(Math.sqrt(Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2));
    dist+=s;if(b.ele>a.ele)elevGain+=b.ele-a.ele;
    if(b.time&&a.time){const dt=(new Date(b.time)-new Date(a.time))/1000;if(dt>0&&dt<300)movingTime+=dt;}
    if(b.hr){hrSum+=b.hr;hrCt++;}
  }
  const km=dist/1000,pace=km>0&&movingTime>0?Math.round(movingTime/km):0;
  const dateTs=pts[0].time?new Date(pts[0].time).getTime():Date.now();
  const mafHR=getMafHR(hrProfile,hrCt?Math.round(hrSum/hrCt):null);
  return{...ACTIVITY_DEFAULTS,id:"gpx_"+dateTs+"_"+Math.random().toString(36).slice(2,6),
    name,type:"Run",date:new Date(dateTs).toISOString().split("T")[0],dateTs,
    distanceM:dist,distanceKm:parseFloat(km.toFixed(2)),movingTimeSec:Math.round(movingTime),
    avgPaceSecKm:pace,elevGainM:Math.round(elevGain),
    avgHR:hrCt?Math.round(hrSum/hrCt):null,maxHR:hrCt?Math.max(...pts.filter(p=>p.hr).map(p=>p.hr)):null,
    hrSamples:pts.filter(p=>p.hr&&p.time).map((p,i,arr)=>({hr:p.hr,sec:i>0?(new Date(p.time)-new Date(arr[0].time))/1000:0})),
    route:pts.filter((_,i)=>i%5===0).map(p=>({lat:p.lat,lon:p.lon})),
    trainingLoad:Math.min(100,Math.round((movingTime/60)*0.6)),
    parsedAt:Date.now(),hasTimestamps:!!pts[0].time,
    runClass:pace>390?"Easy":pace>330?"Moderate":"Tempo",
  };
}

function buildAnalytics(acts,hrProfile){
  const runs=acts.filter(a=>a.type==="Run"||a.type==="Walk"||a.type==="Hike");
  if(!runs.length)return{weekly:[],monthly:[],streak:0,prediction:null,consistency:0};
  const sorted=[...runs].sort((a,b)=>a.dateTs-b.dateTs);
  const weekOf=ts=>{const d=new Date(ts);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getTime();};
  const monthOf=ts=>{const d=new Date(ts);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");};
  const wkMap={};
  sorted.forEach(r=>{const w=weekOf(r.dateTs);if(!wkMap[w])wkMap[w]={km:0,load:0,runs:[],days:new Set()};wkMap[w].km+=r.distanceKm;wkMap[w].load+=r.trainingLoad||0;wkMap[w].runs.push(r);wkMap[w].days.add(new Date(r.dateTs).toDateString());});
  const now=Date.now();
  const weekly=Array.from({length:12},(_,i)=>{
    const wS=weekOf(now-(11-i)*7*86400000),d=new Date(wS),w=wkMap[wS]||{km:0,load:0,runs:[],days:new Set()};
    return{wStart:wS,label:d.getDate()+"/"+(d.getMonth()+1),km:parseFloat(w.km.toFixed(1)),load:w.load,count:w.runs.length,days:w.days.size,runs:w.runs};
  });
  const moMap={};sorted.forEach(r=>{const m=monthOf(r.dateTs);if(!moMap[m])moMap[m]={km:0,runs:[],paces:[]};moMap[m].km+=r.distanceKm;moMap[m].runs.push(r);if(r.avgPaceSecKm)moMap[m].paces.push(r.avgPaceSecKm);});
  const moKeys=[...new Set(sorted.map(r=>monthOf(r.dateTs)))].sort().slice(-6);
  const monthly=moKeys.map((m,i)=>{
    const mo=moMap[m],pv=moKeys[i-1]?moMap[moKeys[i-1]]:null;
    const ap=mo.paces.length?mo.paces.reduce((a,b)=>a+b)/mo.paces.length:0;
    const pp=pv&&pv.paces.length?pv.paces.reduce((a,b)=>a+b)/pv.paces.length:0;
    return{month:m,km:parseFloat(mo.km.toFixed(1)),count:mo.runs.length,
      longest:Math.max(...mo.runs.map(r=>r.distanceKm)),avgPace:ap,
      kmDelta:pv?parseFloat(((mo.km-pv.km)/pv.km*100).toFixed(1)):null,
      paceDelta:pp&&ap?parseFloat(((pp-ap)/pp*100).toFixed(1)):null};
  });
  const runDays=new Set(sorted.map(r=>new Date(r.dateTs).toDateString()));
  let streak=0;const today=new Date();today.setHours(0,0,0,0);
  for(let i=0;i<365;i++){const d=new Date(today);d.setDate(today.getDate()-i);if(runDays.has(d.toDateString()))streak++;else if(i>0)break;}
  const consistency=Math.round(weekly.slice(-8).filter(w=>w.count>0).length/8*100);
  const rRuns=sorted.filter(r=>r.avgPaceSecKm>0&&r.distanceKm>=2).slice(-8);
  let prediction=null;
  if(rRuns.length>=2){
    const ws=rRuns.map((_,i)=>i+1),tw=ws.reduce((a,b)=>a+b,0);
    const wp=rRuns.reduce((s,r,i)=>s+r.avgPaceSecKm*ws[i],0)/tw;
    const cf=1+(1-consistency/100)*0.12,br=rRuns[rRuns.length-1];
    const bT=br.avgPaceSecKm*br.distanceKm,bD=br.distanceKm;
    const fmt=s=>{const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=Math.round(s%60);
      return h?(h+":"+String(m).padStart(2,"0")+":"+String(ss).padStart(2,"0")):(m+":"+String(ss).padStart(2,"0"));};
    prediction={"5K":fmt(bT*Math.pow(5/bD,1.06)*cf),"10K":fmt(bT*Math.pow(10/bD,1.06)*cf),"Half":fmt(bT*Math.pow(21.1/bD,1.06)*cf),"Pace":fmtPace(wp)+"/km"};
  }
  return{weekly,monthly,streak,prediction,consistency,runDays};
}

const PR_CATS = [
  {id:"5k",   label:"5K",             shortLabel:"5K",    icon:"⭐", exactKm:5.0,     tol:0.15, color:"#06b6d4"},
  {id:"10k",  label:"10K",            shortLabel:"10K",   icon:"🏅", exactKm:10.0,    tol:0.2,  color:"#3b82f6"},
  {id:"15k",  label:"15K",            shortLabel:"15K",   icon:"🎯", exactKm:15.0,    tol:0.25, color:"#22c55e"},
  {id:"half", label:"Half Marathon",  shortLabel:"21.1K", icon:"🥈", exactKm:21.0975, tol:0.3,  color:"#a855f7"},
  {id:"30k",  label:"30K",            shortLabel:"30K",   icon:"💪", exactKm:30.0,    tol:0.4,  color:"#f97316"},
  {id:"full", label:"Marathon",       shortLabel:"42.2K", icon:"🏆", exactKm:42.195,  tol:0.5,  color:"#eab308"},
  {id:"50k",  label:"50K",            shortLabel:"50K",   icon:"👑", exactKm:50.0,    tol:0.6,  color:"#ef4444"},
];

function computeRacePRs(acts) {
  if (!Array.isArray(acts)) return {};
  const runs = acts.filter(a =>
    a && a.type==="Run" &&
    typeof a.distanceKm==="number" && a.distanceKm>0 &&
    typeof a.movingTimeSec==="number" && a.movingTimeSec>0
  );
  const result = {};
  PR_CATS.forEach(cat => {
    try {
      const bucket = runs
        .filter(r => Math.abs(r.distanceKm - cat.exactKm) <= cat.tol)
        .sort((a,b) => {
          if (a.movingTimeSec !== b.movingTimeSec) return a.movingTimeSec - b.movingTimeSec;
          return (a.movingTimeSec/a.distanceKm) - (b.movingTimeSec/b.distanceKm);
        });
      const top3 = bucket.slice(0, 3).map((r, i) => ({
        rank: i + 1,
        id: r.id||("pr_"+i),
        name: r.name||"Unnamed",
        date: r.date||"",
        dateTs: r.dateTs||0,
        distanceKm: r.distanceKm,
        movingTimeSec: r.movingTimeSec,
        paceSecKm: Math.round(r.movingTimeSec / r.distanceKm),
        stravaId: r.stravaId||null,
      }));
      result[cat.id] = { cat, best: top3[0]||null, top3, total: bucket.length };
    } catch(e) {
      result[cat.id] = { cat, best: null, top3: [], total: 0 };
    }
  });
  return result;
}

function fmtRaceTime(sec) {
  if (!sec || sec <= 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return h+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
  return m+":"+String(s).padStart(2,"0");
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

// ── Tier Badge System ─────────────────────────────────────────────
const TIER_LABELS=["Bronze 5","Bronze 4","Bronze 3","Bronze 2","Bronze 1","Silver 5","Silver 4","Silver 3","Silver 2","Silver 1","Gold 5","Gold 4","Gold 3","Gold 2","Gold 1","Elite"];
const TIER_COLORS=["#cd7c2f","#cd7c2f","#cd7c2f","#cd7c2f","#cd7c2f","#9ca3af","#9ca3af","#9ca3af","#9ca3af","#9ca3af","#eab308","#eab308","#eab308","#eab308","#eab308","#a855f7"];
const TIER_PREFIX=["🥉","🥉","🥉","🥉","🥉","🥈","🥈","🥈","🥈","🥈","🥇","🥇","🥇","🥇","🥇","👑"];

function makeTiers(reqs){
  return reqs.map((req,i)=>({level:i+1,label:TIER_LABELS[i],color:TIER_COLORS[i],icon:TIER_PREFIX[i],req}));
}

const TIER_BADGES=[
  {id:"t_dist",name:"Distance",icon:"🛣️",unit:"km",
    getValue:acts=>Math.round(acts.filter(a=>a.type==="Run"||a.type==="Walk").reduce((s,a)=>s+a.distanceKm,0)),
    tiers:makeTiers([10,25,50,75,100,150,200,300,400,500,700,900,1200,1500,2000,3000])},
  {id:"t_runs",name:"Total Runs",icon:"🏃",unit:"runs",
    getValue:acts=>acts.filter(a=>a.type==="Run").length,
    tiers:makeTiers([3,5,10,15,20,30,50,75,100,150,200,300,400,500,750,1000])},
  {id:"t_longest",name:"Longest Run",icon:"📏",unit:"km",
    getValue:acts=>{const r=acts.filter(a=>a.type==="Run");return r.length?parseFloat(Math.max(...r.map(a=>a.distanceKm)).toFixed(1)):0;},
    tiers:makeTiers([3,5,7,10,15,21.1,25,30,35,42.2,50,60,70,80,90,100])},
  {id:"t_streak",name:"Best Streak",icon:"🔥",unit:"days",
    getValue:(acts,an)=>an&&an.streak?an.streak:0,
    tiers:makeTiers([2,3,5,7,10,14,20,30,45,60,75,100,150,200,300,365])},
];

function computeTierProgress(acts,analytics){
  return TIER_BADGES.map(badge=>{
    let progress;
    try{progress=badge.getValue(acts,analytics)||0;}catch(e){progress=0;}
    const earned=badge.tiers.filter(t=>progress>=t.req);
    const current=earned.length?earned[earned.length-1]:null;
    const next=badge.tiers.find(t=>progress<t.req)||null;
    let pct=0;
    if(current&&next){
      pct=Math.round((progress-current.req)/(next.req-current.req)*100);
    }else if(current){
      pct=100;
    }else if(next){
      pct=Math.round(progress/next.req*100);
    }
    return{id:badge.id,badge,progress,current,next,pct:Math.min(100,Math.max(0,pct)),totalTiers:badge.tiers.length,earnedCount:earned.length};
  });
}

const TIERS_KEY="runlytics_tiers_v1";
function loadSeenTiers(){try{return JSON.parse(localStorage.getItem(TIERS_KEY)||"{}");}catch(e){return {};}}
function saveSeenTiers(obj){try{localStorage.setItem(TIERS_KEY,JSON.stringify(obj));}catch(e){}}

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
function initTasks() {return DEFAULT_TASKS.map(t=>({...t,streak:0,completions:{},enabled:true}));}
function saveTasks(tasks) {
  try { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks.map(t=>({id:t.id,streak:t.streak,completions:t.completions,enabled:t.enabled})))); } catch(e) {}
}
const todayKey = () => new Date().toISOString().split("T")[0];
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

const PRDetailModal=({entry,onClose,onOpenRun})=>{
  if(!entry)return null;
  const{cat,top3}=entry;
  const RL=["🥇","🥈","🥉"];
  return(
    <div style={{position:"fixed",inset:0,zIndex:260,background:"rgba(0,0,0,.8)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="glass" style={{width:"100%",maxWidth:430,borderRadius:"20px 20px 0 0",padding:"20px 18px 40px",border:"1px solid var(--bd)",maxHeight:"80vh",overflowY:"auto"}}>
        <div style={{width:36,height:4,borderRadius:2,background:"var(--bd2)",margin:"0 auto 14px"}}/>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <span style={{fontSize:"1.4rem"}}>{cat.icon}</span>
          <div style={{flex:1,fontWeight:700,color:cat.color}}>{cat.label}</div>
          <button className="btn b-gh" style={{padding:"5px 11px",fontSize:".76rem"}} onClick={onClose}>✕</button>
        </div>
        {top3.length===0
          ?<div style={{textAlign:"center",padding:"24px 0",color:"var(--tx2)"}}>{"No records for "+cat.label}</div>
          :top3.map((r,i)=>(
            <div key={r.id}
              className="tap"
              style={{borderRadius:12,marginBottom:10,padding:"12px 14px",cursor:"pointer",
                border:"1px solid "+(i===0?cat.color+"50":"var(--bd)"),
                background:i===0?cat.color+"08":"var(--s2)",
                transition:"transform .12s, box-shadow .12s"}}
              onClick={()=>{ onClose(); onOpenRun(r.id); }}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:"1.3rem"}}>{RL[i]}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:".84rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                  <div style={{fontSize:".68rem",color:"var(--tx2)",marginTop:2}}>{fmtDateS(r.date)+" · "+fmtKm(r.distanceKm)+" km"}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontWeight:800,color:i===0?cat.color:"var(--tx)",fontFamily:"monospace"}}>{fmtRaceTime(r.movingTimeSec)}</div>
                  <div style={{fontSize:".7rem",color:"var(--tx2)"}}>{fmtPace(r.paceSecKm)+"/km"}</div>
                </div>
                <span style={{color:"var(--tx3)",fontSize:".9rem",marginLeft:4}}>›</span>
              </div>
              {r.stravaId&&(
                <a href={"https://www.strava.com/activities/"+r.stravaId} target="_blank"
                  rel="noopener noreferrer"
                  onClick={e=>e.stopPropagation()}
                  style={{display:"inline-block",marginTop:8,fontSize:".7rem",color:"#fc4c02",fontWeight:600,textDecoration:"none"}}>
                  🟠 View on Strava
                </a>
              )}
            </div>
          ))
        }
        <div style={{marginTop:6,textAlign:"center",fontSize:".68rem",color:"var(--tx3)"}}>Tap a run to view full details</div>
      </div>
    </div>
  );
};
const IC_BG={good:"rgba(34,197,94,.08)",positive:"rgba(34,197,94,.08)",warning:"rgba(234,179,8,.08)",danger:"rgba(239,68,68,.08)",info:"rgba(59,130,246,.08)",neutral:"rgba(255,255,255,.04)"};
const IC_BD={good:"rgba(34,197,94,.22)",positive:"rgba(34,197,94,.22)",warning:"rgba(234,179,8,.22)",danger:"rgba(239,68,68,.22)",info:"rgba(59,130,246,.22)",neutral:"rgba(255,255,255,.1)"};

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

// ── Map street generation (pure function, no hooks) ────────────────
function genMapStreets(W,H,seed){
  const rng=n=>(((Math.sin(seed*.137+n*6.753)*98765)%1)+1)%1;
  const bW=Math.max(30,Math.min(55,W/7)),bH=Math.max(30,Math.min(55,H/6));
  const h=[],v=[];
  for(let y=0;y<H+bH;y+=bH){const idx=Math.round(y/bH);h.push({y,major:idx%3===0,sec:idx%3===1});}
  for(let x=0;x<W+bW;x+=bW){const idx=Math.round(x/bW);v.push({x,major:idx%3===0,sec:idx%3===1});}
  const parks=[];
  for(let i=0;i<3;i++){
    const xi=Math.floor(rng(i*11+3)*(v.length-2)),yi=Math.floor(rng(i*11+4)*(h.length-2));
    if(xi>=1&&yi>=1&&xi<v.length-1&&yi<h.length-1)
      parks.push({x:v[xi].x+2,y:h[yi].y+2,w:Math.max(0,v[xi+1].x-v[xi].x-4),h:Math.max(0,h[yi+1].y-h[yi].y-4)});
  }
  return{h,v,parks};
}

// Web Mercator Y — accurate latitude-aware projection
function mercY(lat){
  const r=lat*Math.PI/180;
  return-Math.log(Math.tan(Math.PI/4+r/2));
}

// Iterative Douglas-Peucker — no recursion depth risk on large GPX tracks
function rdpSimplify(pts,eps){
  if(pts.length<3)return pts;
  const keep=new Set([0,pts.length-1]);
  const stack=[[0,pts.length-1]];
  while(stack.length){
    const[s,e]=stack.pop();
    if(e-s<2)continue;
    const[a,z]=[pts[s],pts[e]];
    const dx=z.x-a.x,dy=z.y-a.y,L=Math.hypot(dx,dy)||1e-9;
    let maxD=0,maxI=s+1;
    for(let i=s+1;i<e;i++){
      const d=Math.abs(dy*(pts[i].x-a.x)-dx*(pts[i].y-a.y))/L;
      if(d>maxD){maxD=d;maxI=i;}
    }
    if(maxD>eps){keep.add(maxI);stack.push([s,maxI],[maxI,e]);}
  }
  return pts.filter((_,i)=>keep.has(i));
}

// Haversine in km for tooltip cumulative distance
function hvKm(a,b){
  const R=6371,dLa=(b.lat-a.lat)*Math.PI/180,dLo=(b.lon-a.lon)*Math.PI/180;
  const s=Math.sin(dLa/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLo/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));
}

const RouteMapSVG=({route,act})=>{
  const[drawn,setDrawn]=useState(false);
  const[hov,setHov]=useState(null);
  const svgRef=useRef(null);
  const canvasRef=useRef(null);

  // Haversine cumulative distances for accurate hover km
  const cumDist=useMemo(()=>{
    if(!route||route.length<2)return[];
    const R=6371000;let c=0;
    return route.map((p,i)=>{
      if(i>0){
        const a=route[i-1],dLa=(p.lat-a.lat)*Math.PI/180,dLo=(p.lon-a.lon)*Math.PI/180;
        const q=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(a.lat*Math.PI/180)*Math.cos(p.lat*Math.PI/180)*Math.sin(dLo/2)*Math.sin(dLo/2);
        c+=2*R*Math.asin(Math.sqrt(Math.max(0,q)));
      }
      return c;
    });
  },[route]);

  // All map geometry in one memo — tiles, projection, sampled route
  const map=useMemo(()=>{
    if(!route||route.length<2)return null;
    const W=360,H=280;
    const lats=route.map(r=>r.lat),lons=route.map(r=>r.lon);
    const minLat=Math.min(...lats),maxLat=Math.max(...lats);
    const minLon=Math.min(...lons),maxLon=Math.max(...lons);
    const lonR=maxLon-minLon||.01;
    // Exact Web Mercator — same formula used by OSM/Google/Strava
    const tyOf=lat=>(1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2;
    const txOf=lon=>(lon+180)/360;
    // Zoom so route spans ~3 tile-widths (fills ~75% of viewport)
    const zoom=Math.max(10,Math.min(16,Math.round(Math.log2(1080/Math.max(lonR,.005)))));
    const n=Math.pow(2,zoom);
    // Tile grid with 1-tile padding for street context
    const txMin=Math.floor(txOf(minLon)*n)-1,txMax=Math.floor(txOf(maxLon)*n)+1;
    const tyMin=Math.floor(tyOf(maxLat)*n)-1,tyMax=Math.floor(tyOf(minLat)*n)+1;
    const tW=txMax-txMin+1,tH=tyMax-tyMin+1;
    // Scale tile grid to fill SVG viewport
    const sc=Math.min(W/(tW*256),H/(tH*256));
    const ox=(W-tW*256*sc)/2,oy=(H-tH*256*sc)/2;
    // GPS → pixel — identical formula for both tiles and route overlay
    const toSX=lon=>(txOf(lon)*n-txMin)*256*sc+ox;
    const toSY=lat=>(tyOf(lat)*n-tyMin)*256*sc+oy;
    // OSM tile list
    const tiles=[];
    for(let ty=tyMin;ty<=tyMax;ty++)
      for(let tx=txMin;tx<=txMax;tx++)
        tiles.push({k:ty+","+tx,
          url:"https://tile.openstreetmap.org/"+zoom+"/"+tx+"/"+ty+".png",
          x:(tx-txMin)*256*sc+ox,y:(ty-tyMin)*256*sc+oy,sz:256*sc});
    // Adaptive sampling ≤600 pts
    const MAX=600;
    const sIdx=route.length<=MAX
      ?Array.from({length:route.length},(_,i)=>i)
      :Array.from({length:MAX},(_,i)=>Math.min(Math.round(i*(route.length-1)/(MAX-1)),route.length-1));
    if(route.length>MAX&&sIdx[sIdx.length-1]!==route.length-1)sIdx.push(route.length-1);
    const spts=sIdx.map(i=>({sx:toSX(route[i].lon),sy:toSY(route[i].lat),ri:i}));
    const d=spts.map((p,i)=>(i===0?"M":"L")+p.sx.toFixed(1)+","+p.sy.toFixed(1)).join(" ");
    const pLen=spts.reduce((t,p,i)=>i===0?0:t+Math.hypot(p.sx-spts[i-1].sx,p.sy-spts[i-1].sy),0);
    const col=act&&act.avgPaceSecKm<270?"#22c55e":act&&act.avgPaceSecKm<360?"#f97316":"#f97316";
    return{tiles,spts,d,pLen,col,s0:spts[0],sE:spts[spts.length-1],W,H};
  },[route,act]);

  // Load real map tiles into canvas (bypasses SVG img-src CSP restrictions)
  useEffect(()=>{
    if(!map||!canvasRef.current)return;
    const canvas=canvasRef.current;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#e8e4dc';
    ctx.fillRect(0,0,map.W,map.H);
    let active=true;
    map.tiles.forEach(t=>{
      const img=new Image();
      img.crossOrigin='anonymous';
      img.onload=()=>{if(active)ctx.drawImage(img,t.x,t.y,t.sz,t.sz);};
      img.src=t.url;
    });
    return()=>{active=false;};
  },[map]);

  // Route draw animation
  useEffect(()=>{const t=setTimeout(()=>setDrawn(true),150);return()=>clearTimeout(t);},[]);

  if(!map)return null;
  const{tiles,spts,d,pLen,col,s0,sE,W,H}=map;

  const onMove=e=>{
    if(!svgRef.current)return;
    const rc=svgRef.current.getBoundingClientRect();
    const mx=(e.clientX-rc.left)*W/rc.width,my=(e.clientY-rc.top)*H/rc.height;
    let minD=Infinity,best=null;
    for(const p of spts){const d2=Math.hypot(p.sx-mx,p.sy-my);if(d2<minD){minD=d2;best=p;}}
    if(best&&minD<22){
      const km=((cumDist[best.ri]||0)/1000).toFixed(2);
      const ttx=Math.max(35,Math.min(W-35,best.sx));
      const tty=best.sy>46?best.sy-14:best.sy+26;
      setHov({x:best.sx,y:best.sy,ttx,tty,km});
    }else setHov(null);
  };

  return(
    <div style={{position:"relative",borderRadius:12,overflow:"hidden",border:"1px solid #b8b0a4",boxShadow:"0 2px 14px rgba(0,0,0,.2)"}}>
      {/* Canvas receives real OSM tile images */}
      <canvas ref={canvasRef} width={W} height={H} style={{display:"block",width:"100%"}}/>
      {/* SVG overlay: route + markers + hover — rendered on top of tiles */}
      <svg ref={svgRef} viewBox={"0 0 "+W+" "+H}
        style={{position:"absolute",inset:0,width:"100%",height:"100%",cursor:"crosshair"}}
        onMouseMove={onMove} onMouseLeave={()=>setHov(null)}>
        <path d={d} fill="none" stroke={col} strokeWidth={9} strokeOpacity={0.25}
          strokeLinecap="round" strokeLinejoin="round"/>
        <path d={d} fill="none" stroke={col} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={pLen.toFixed(0)} strokeDashoffset={drawn?"0":pLen.toFixed(0)}
          style={{transition:"stroke-dashoffset 1.6s cubic-bezier(.4,0,.2,1)"}}/>
        <path d={d} fill="none" stroke="transparent" strokeWidth={20}/>
        <circle cx={s0.sx} cy={s0.sy} r={8} fill="#22c55e" stroke="#fff" strokeWidth={2.5}/>
        <text x={s0.sx} y={s0.sy+4} textAnchor="middle" fontSize={7} fill="#fff" fontWeight="800">S</text>
        <circle cx={sE.sx} cy={sE.sy} r={8} fill="#ef4444" stroke="#fff" strokeWidth={2.5}/>
        <text x={sE.sx} y={sE.sy+4} textAnchor="middle" fontSize={7} fill="#fff" fontWeight="800">F</text>
        {hov&&(
          <g>
            <circle cx={hov.x} cy={hov.y} r={5} fill="#fff" stroke={col} strokeWidth={2.5}/>
            <rect x={hov.ttx-33} y={hov.tty-12} width={66} height={16} rx={8}
              fill="rgba(0,0,0,.84)" stroke={col+"70"} strokeWidth={1}/>
            <text x={hov.ttx} y={hov.tty} textAnchor="middle" fontSize={8.5} fill={col} fontWeight="700">
              {hov.km+" km"}
            </text>
          </g>
        )}
        {act&&(
          <g>
            <rect x={W/2-56} y={H-24} width={112} height={18} rx={9} fill="rgba(0,0,0,.72)"/>
            <text x={W/2} y={H-12} textAnchor="middle" fontSize={10} fill="#fff" fontWeight="700">
              {fmtKm(act.distanceKm)+" km · "+fmtPace(act.avgPaceSecKm)+"/km"}
            </text>
          </g>
        )}
        <text x={W-5} y={H-3} textAnchor="end" fontSize={6} fill="rgba(0,0,0,.5)">© OpenStreetMap</text>
      </svg>
    </div>
  );
};


// ── Share Activity Feature ────────────────────────────────────────────

function drawRouteCanvas(ctx,route,rx,ry,rW,rH,lw){
  if(!route||route.length<2)return;
  const lats=route.map(r=>r.lat),lons=route.map(r=>r.lon);
  const minLat=Math.min(...lats),maxLat=Math.max(...lats),minLon=Math.min(...lons),maxLon=Math.max(...lons);
  const latR=maxLat-minLat||.001,lonR=maxLon-minLon||.001;
  const asp=lonR/latR*Math.cos((minLat+maxLat)/2*Math.PI/180),pad=lw*3;
  let vW=rW-2*pad,vH=rH-2*pad;
  if(asp>vW/vH){vH=vW/asp;}else{vW=vH*asp;}
  const ox=rx+(rW-vW)/2,oy=ry+(rH-vH)/2;
  const X=lon=>ox+(lon-minLon)/lonR*vW,Y=lat=>oy+(maxLat-lat)/latR*vH;
  const step=Math.max(1,Math.floor(route.length/250));
  const pts=route.filter((_,i)=>i%step===0||i===route.length-1);
  ctx.lineCap="round";ctx.lineJoin="round";
  ctx.beginPath();ctx.strokeStyle="rgba(249,115,22,.22)";ctx.lineWidth=lw*3.5;
  pts.forEach((p,i)=>i===0?ctx.moveTo(X(p.lon),Y(p.lat)):ctx.lineTo(X(p.lon),Y(p.lat)));
  ctx.stroke();
  ctx.beginPath();ctx.strokeStyle="#f97316";ctx.lineWidth=lw;
  pts.forEach((p,i)=>i===0?ctx.moveTo(X(p.lon),Y(p.lat)):ctx.lineTo(X(p.lon),Y(p.lat)));
  ctx.stroke();
  const r=lw*1.8;
  ctx.beginPath();ctx.fillStyle="#22c55e";ctx.arc(X(route[0].lon),Y(route[0].lat),r,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.fillStyle="#ef4444";ctx.arc(X(route[route.length-1].lon),Y(route[route.length-1].lat),r,0,Math.PI*2);ctx.fill();
}

function drawRunCard(ctx,act,tmpl,W,H){
  const dist=fmtKm(act.distanceKm),pace=fmtPace(act.avgPaceSecKm)+"/km";
  const s=act.movingTimeSec||0;
  const dur=(s>=3600?Math.floor(s/3600)+"h ":"")+Math.floor((s%3600)/60)+"m";
  const date=fmtDate(act.date);
  const tf=(sz,w)=>{ctx.font=(w||"700")+" "+Math.round(sz)+"px system-ui,sans-serif";};
  const c=(v)=>{ctx.fillStyle=v;};
  ctx.textBaseline="alphabetic";
  if(tmpl==="orange"){
    c("#f97316");ctx.fillRect(0,0,W,H);
    tf(H*.026,"800");c("rgba(0,0,0,.45)");ctx.fillText("RUNLYTICS",W*.07,H*.068);
    tf(W*.4,"900");c("#000");ctx.fillText(dist,W*.07,H*.42);
    tf(H*.02,"800");c("rgba(0,0,0,.38)");ctx.fillText("KILOMETERS",W*.07,H*.475);
    tf(H*.042,"800");c("#000");ctx.fillText(pace,W*.07,H*.59);ctx.fillText(dur,W*.52,H*.59);
    tf(H*.017,"700");c("rgba(0,0,0,.38)");ctx.fillText("PACE",W*.07,H*.63);ctx.fillText("TIME",W*.52,H*.63);
    tf(H*.017,"400");c("rgba(0,0,0,.3)");ctx.fillText(date,W*.07,H*.935);
    return;
  }
  if(tmpl==="cinematic"){
    const g=ctx.createLinearGradient(0,0,W,H);
    g.addColorStop(0,"#06080f");g.addColorStop(.55,"#120720");g.addColorStop(1,"#060c12");
    c(g);ctx.fillRect(0,0,W,H);
    tf(H*.024,"800");c("rgba(249,115,22,.75)");ctx.fillText("RUNLYTICS",W*.07,H*.067);
    ctx.textAlign="center";
    tf(W*.38,"900");c("#fff");ctx.fillText(dist,W/2,H*.44);
    tf(H*.018,"700");c("rgba(255,255,255,.33)");ctx.fillText("KILOMETERS",W/2,H*.488);
    tf(H*.038,"700");c("rgba(255,255,255,.9)");
    ctx.fillText(pace,W*.3,H*.6);ctx.fillText(dur,W*.7,H*.6);
    tf(H*.015,"700");c("rgba(255,255,255,.3)");
    ctx.fillText("PACE",W*.3,H*.633);ctx.fillText("TIME",W*.7,H*.633);
    tf(H*.024,"400");c("rgba(255,255,255,.55)");ctx.fillText("Keep showing up.",W/2,H*.82);
    tf(H*.019,"400");c("rgba(255,255,255,.3)");ctx.fillText("The results follow.",W/2,H*.855);
    tf(H*.016,"400");c("rgba(255,255,255,.22)");ctx.fillText(date,W/2,H*.93);
    ctx.textAlign="left";
    return;
  }
  c("#08090f");ctx.fillRect(0,0,W,H);
  tf(H*.023,"800");c("rgba(255,255,255,.4)");ctx.fillText("RUNLYTICS",W*.07,H*.065);
  ctx.textAlign="right";tf(H*.016,"400");c("rgba(255,255,255,.25)");ctx.fillText(date,W*.93,H*.065);ctx.textAlign="left";
  if(act.route&&act.route.length>2)drawRouteCanvas(ctx,act.route,W*.07,H*.12,W*.86,H*.38,5);
  tf(W*.38,"900");c("#fff");ctx.fillText(dist,W*.07,H*.7);
  tf(H*.018,"700");c("rgba(255,255,255,.28)");ctx.fillText("KILOMETERS",W*.07,H*.744);
  tf(H*.04,"700");c("#f97316");ctx.fillText(pace,W*.07,H*.83);
  c("rgba(255,255,255,.85)");ctx.fillText(dur,W*.52,H*.83);
  tf(H*.015,"700");c("rgba(255,255,255,.22)");ctx.fillText("PACE",W*.07,H*.862);ctx.fillText("TIME",W*.52,H*.862);
}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
// Returns template-specific plain text for clipboard copy
function getCardText(act,tmpl){
  const dist=fmtKm(act.distanceKm);
  const pace=fmtPace(act.avgPaceSecKm)+"/km";
  const s=act.movingTimeSec||0;
  const dur=(s>=3600?Math.floor(s/3600)+"h ":"")+Math.floor((s%3600)/60)+"m";
  const date=fmtDate(act.date);
  const name=act.name?act.name+"\n":"";
  const B="RUNLYTICS \u2022 runlytics.app";
  if(tmpl==="orange")return(
    name+dist+"\nKM\n\n\u23f1 "+pace+"  PACE\n\u23f0 "+dur+"  TIME\n\n"+date+"\n\n"+B
  );
  if(tmpl==="cinematic")return(
    name+dist+"\nKM\n\n"+pace+"  PACE\n"+dur+"  TIME\n\n\u201cKeep showing up.\nThe results follow.\u201d\n\n\u2014 "+B
  );
  if(tmpl==="glass")return(
    dist+"\nKM\n\n"+pace+"  PACE\n"+dur+"  TIME\n\n"+date+"\n\nrunlytics.app"
  );
  if(tmpl==="poster"){
    const badge=act.distanceKm>=42?"\uD83C\uDFC6 Marathon":act.distanceKm>=21?"\uD83E\uDD48 Half Marathon":act.distanceKm>=10?"\uD83D\uDD25 10 KM":act.distanceKm>=5?"\u26A1 5 KM":"\uD83C\uDFC3 Activity";
    return badge+"\n\n"+dist+"\nKM\n\n"+pace+"  PACE\n"+dur+"  TIME\n\n"+date+"\n\n"+B;
  }
  return name+dist+"\nKM\n\n"+pace+"  PACE\n"+dur+"  TIME\n\n"+date+"\n\n"+B;
}

function drawRunCardExtra(ctx,act,tmpl,W,H){
  const dist=fmtKm(act.distanceKm),pace=fmtPace(act.avgPaceSecKm)+"/km";
  const s=act.movingTimeSec||0,dur=(s>=3600?Math.floor(s/3600)+"h ":"")+Math.floor((s%3600)/60)+"m";
  const date=fmtDate(act.date);
  const tf=(sz,w)=>{ctx.font=(w||"700")+" "+Math.round(sz)+"px system-ui,sans-serif";};
  const c=(v)=>{ctx.fillStyle=v;};
  ctx.textBaseline="alphabetic";
  if(tmpl==="glass"){
    // Background: deep navy gradient
    const bg=ctx.createLinearGradient(0,0,W,H);
    bg.addColorStop(0,"#0a0f1e");bg.addColorStop(.5,"#0d1428");bg.addColorStop(1,"#080c18");
    c(bg);ctx.fillRect(0,0,W,H);
    // Subtle noise dots for depth
    ctx.save();ctx.globalAlpha=0.04;
    for(let i=0;i<300;i++){ctx.fillStyle="#fff";ctx.fillRect(Math.random()*W,Math.random()*H,1.5,1.5);}
    ctx.restore();
    // Route behind glass if available
    if(act.route&&act.route.length>2)drawRouteCanvas(ctx,act.route,0,H*.2,W,H*.5,4);
    // Glass panel
    ctx.save();
    ctx.globalAlpha=0.13;c("#a8c4e8");
    const gX=W*.08,gY=H*.25,gW=W*.84,gH=H*.46;
    roundRect(ctx,gX,gY,gW,gH,W*.04);ctx.fill();
    ctx.globalAlpha=0.22;ctx.strokeStyle="#a8d4ff";ctx.lineWidth=W*.002;
    roundRect(ctx,gX,gY,gW,gH,W*.04);ctx.stroke();
    ctx.restore();
    // Inner glow top edge
    const glow=ctx.createLinearGradient(gX,gY,gX,gY+H*.1);
    glow.addColorStop(0,"rgba(180,210,255,.18)");glow.addColorStop(1,"rgba(0,0,0,0)");
    c(glow);roundRect(ctx,gX,gY,gW,H*.1,W*.04);ctx.fill();
    // Stats inside glass
    ctx.textAlign="center";
    tf(H*.022,"800");c("rgba(180,210,255,.6)");ctx.fillText("RUNLYTICS",W/2,gY+H*.05);
    tf(W*.32,"900");c("#fff");ctx.fillText(dist,W/2,gY+H*.22);
    tf(H*.017,"700");c("rgba(180,210,255,.5)");ctx.fillText("KILOMETERS",W/2,gY+H*.258);
    // Divider
    ctx.globalAlpha=0.2;ctx.strokeStyle="#a8d4ff";ctx.lineWidth=W*.001;
    ctx.beginPath();ctx.moveTo(gX+gW*.15,gY+H*.3);ctx.lineTo(gX+gW*.85,gY+H*.3);ctx.stroke();
    ctx.globalAlpha=1;
    tf(H*.038,"700");c("rgba(255,255,255,.9)");
    ctx.fillText(pace,W*.32,gY+H*.38);ctx.fillText(dur,W*.68,gY+H*.38);
    tf(H*.015,"600");c("rgba(180,210,255,.45)");
    ctx.fillText("PACE",W*.32,gY+H*.415);ctx.fillText("TIME",W*.68,gY+H*.415);
    tf(H*.016,"400");c("rgba(180,210,255,.35)");ctx.fillText(date,W/2,gY+gH-H*.025);
    ctx.textAlign="left";
    return;
  }
  if(tmpl==="poster"){
    // White base
    c("#f8f7f4");ctx.fillRect(0,0,W,H);
    // Top accent bar
    const accent=ctx.createLinearGradient(0,0,W,0);
    accent.addColorStop(0,"#f97316");accent.addColorStop(1,"#c2410c");
    c(accent);ctx.fillRect(0,0,W,H*.008);
    // RUNLYTICS header
    tf(H*.024,"800");c("rgba(0,0,0,.35)");ctx.fillText("RUNLYTICS",W*.07,H*.067);
    // BIB-style bold number region
    const bigY=H*.18;
    tf(W*.55,"900");c("#111");ctx.fillText(dist,W*.06,bigY+H*.26);
    tf(H*.032,"800");c("rgba(0,0,0,.4)");ctx.fillText("KILOMETERS",W*.07,bigY+H*.3);
    // Horizontal rule
    c("rgba(0,0,0,.12)");ctx.fillRect(W*.07,bigY+H*.32,W*.86,W*.003);
    // Achievement badge if Strava / notable
    const badge=act.distanceKm>=42?"🏆 MARATHON":act.distanceKm>=21?"🥈 HALF MARATHON":act.distanceKm>=10?"🔥 10K":act.distanceKm>=5?"⚡ 5K":"🏃 ACTIVITY";
    tf(H*.022,"800");c("#f97316");ctx.fillText(badge,W*.07,bigY+H*.37);
    // Stats grid
    const stats=[["PACE",pace],["TIME",dur]];
    stats.forEach(([l,v],i)=>{
      const sx=W*.07+i*(W*.42);
      tf(H*.042,"800");c("#111");ctx.fillText(v,sx,bigY+H*.5);
      tf(H*.017,"700");c("rgba(0,0,0,.35)");ctx.fillText(l,sx,bigY+H*.535);
    });
    // Route preview box
    if(act.route&&act.route.length>2){
      const rx=W*.07,ry=bigY+H*.57,rW=W*.86,rH=H*.27;
      c("rgba(0,0,0,.05)");roundRect(ctx,rx,ry,rW,rH,W*.02);ctx.fill();
      drawRouteCanvas(ctx,act.route,rx+W*.03,ry+H*.02,rW-W*.06,rH-H*.04,4);
    }
    // Date + bottom bar
    tf(H*.016,"400");c("rgba(0,0,0,.3)");ctx.fillText(date,W*.07,H*.955);
    c("#111");ctx.fillRect(0,H*.992,W,H*.008);
  }
}

const MiniRoute=({route,W=160,H=110})=>{
  if(!route||route.length<2)return null;
  const lats=route.map(r=>r.lat),lons=route.map(r=>r.lon);
  const minLat=Math.min(...lats),maxLat=Math.max(...lats),minLon=Math.min(...lons),maxLon=Math.max(...lons);
  const latR=maxLat-minLat||.001,lonR=maxLon-minLon||.001;
  const asp=lonR/latR*Math.cos((minLat+maxLat)/2*Math.PI/180),pad=14;
  let vW=W-2*pad,vH=H-2*pad;
  if(asp>vW/vH){vH=vW/asp;}else{vW=vH*asp;}
  const ox=(W-vW)/2,oy=(H-vH)/2;
  const X=lon=>ox+(lon-minLon)/lonR*vW,Y=lat=>oy+(maxLat-lat)/latR*vH;
  const st=Math.max(1,Math.floor(route.length/100));
  const pts=route.filter((_,i)=>i%st===0||i===route.length-1);
  const d=pts.map((r,i)=>(i===0?"M":"L")+X(r.lon).toFixed(1)+","+Y(r.lat).toFixed(1)).join(" ");
  return(
    <svg viewBox={"0 0 "+W+" "+H} style={{width:W,height:H,display:"block",overflow:"hidden"}}>
      <defs><clipPath id={"rc"+W}><rect width={W} height={H}/></clipPath></defs>
      <g clipPath={"url(#rc"+W+")"}>
        <path d={d} fill="none" stroke="#f97316" strokeWidth={6} strokeOpacity={0.12} strokeLinecap="round" strokeLinejoin="round"/>
        <path d={d} fill="none" stroke="#f97316" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
      </g>
      <circle cx={X(route[0].lon)} cy={Y(route[0].lat)} r={3.5} fill="#22c55e" stroke="rgba(255,255,255,.6)" strokeWidth={1}/>
      <circle cx={X(route[route.length-1].lon)} cy={Y(route[route.length-1].lat)} r={3.5} fill="#ef4444" stroke="rgba(255,255,255,.6)" strokeWidth={1}/>
    </svg>
  );
};


const ShareCard=({type,act,W=270,H=480})=>{
  const dist=fmtKm(act.distanceKm),pace=fmtPace(act.avgPaceSecKm)+"/km";
  const s=act.movingTimeSec||0,dur=(s>=3600?Math.floor(s/3600)+"h ":"")+Math.floor((s%3600)/60)+"m";
  const hasRoute=act.route&&act.route.length>2;
  const f=n=>Math.round(n*W/270)+"px";
  const Stat=({label,value,vc,dark})=>(
    <div>
      <div style={{fontSize:f(20),fontWeight:800,color:vc||(dark?"#000":"#fff"),lineHeight:1,letterSpacing:"-.01em"}}>{value}</div>
      <div style={{fontSize:f(8),fontWeight:600,color:dark?"rgba(0,0,0,.35)":"rgba(255,255,255,.32)",letterSpacing:".12em",marginTop:4,textTransform:"uppercase"}}>{label}</div>
    </div>
  );
  const baseAnim={animation:"fadeUp .32s ease both"};
  if(type==="orange")return(
    <div style={{width:W,height:H,borderRadius:18,background:"#f97316",padding:"32px 28px",display:"flex",flexDirection:"column",justifyContent:"space-between",boxShadow:"0 12px 40px rgba(249,115,22,.35)",flexShrink:0,...baseAnim}}>
      <div style={{fontSize:f(9),fontWeight:800,color:"rgba(0,0,0,.35)",letterSpacing:".16em"}}>RUNLYTICS</div>
      <div>
        <div style={{fontSize:f(80),fontWeight:900,color:"#000",lineHeight:.85,letterSpacing:"-.03em"}}>{dist}</div>
        <div style={{fontSize:f(11),fontWeight:700,color:"rgba(0,0,0,.35)",letterSpacing:".18em",marginTop:10}}>KM</div>
      </div>
      <div style={{display:"flex",gap:f(32)}}>
        <Stat dark label="Pace" value={pace}/><Stat dark label="Time" value={dur}/>
      </div>
      <div style={{fontSize:f(9),color:"rgba(0,0,0,.3)",letterSpacing:".04em"}}>{fmtDate(act.date)}</div>
    </div>
  );
  if(type==="cinematic")return(
    <div style={{width:W,height:H,borderRadius:18,flexShrink:0,overflow:"hidden",
      background:"linear-gradient(170deg,#080a12 0%,#0e0618 60%,#06090f 100%)",
      padding:"32px 28px",display:"flex",flexDirection:"column",justifyContent:"space-between",
      boxShadow:"0 12px 48px rgba(0,0,0,.7)",...baseAnim}}>
      <div style={{fontSize:f(9),fontWeight:800,color:"rgba(249,115,22,.6)",letterSpacing:".16em"}}>RUNLYTICS</div>
      <div style={{textAlign:"center",padding:"0 8px"}}>
        <div style={{fontSize:f(68),fontWeight:900,color:"#fff",lineHeight:.85,letterSpacing:"-.03em"}}>{dist}</div>
        <div style={{fontSize:f(10),fontWeight:600,color:"rgba(255,255,255,.25)",letterSpacing:".18em",marginTop:10}}>KM</div>
        {hasRoute&&<div style={{margin:"20px auto 0",maxWidth:W*.7}}><MiniRoute route={act.route} W={Math.round(W*.72)} H={Math.round(W*.44)}/></div>}
      </div>
      <div>
        <div style={{height:1,background:"linear-gradient(90deg,transparent,rgba(255,255,255,.1),transparent)",marginBottom:16}}/>
        <div style={{display:"flex",justifyContent:"space-between",padding:"0 4px"}}>
          <Stat label="Pace" value={pace}/><Stat label="Time" value={dur}/>
        </div>
        <div style={{marginTop:20,textAlign:"center"}}>
          <div style={{fontSize:f(11),fontStyle:"italic",color:"rgba(255,255,255,.42)",lineHeight:1.7,letterSpacing:".01em"}}>Keep showing up.</div>
          <div style={{fontSize:f(9),fontStyle:"italic",color:"rgba(255,255,255,.22)"}}>The results follow.</div>
        </div>
      </div>
      <div style={{textAlign:"center",fontSize:f(8),color:"rgba(255,255,255,.2)",letterSpacing:".04em"}}>{fmtDate(act.date)}</div>
    </div>
  );
  if(type==="glass")return(
    <div style={{width:W,height:H,borderRadius:18,flexShrink:0,overflow:"hidden",
      background:"linear-gradient(155deg,#0a0f1e 0%,#0d1428 50%,#080c18 100%)",
      boxShadow:"0 12px 48px rgba(0,20,60,.8)",position:"relative",...baseAnim}}>
      {hasRoute&&(
        <div style={{position:"absolute",top:0,left:0,right:0,height:"52%",overflow:"hidden",
          maskImage:"linear-gradient(to bottom,rgba(0,0,0,.35) 60%,transparent 100%)",
          WebkitMaskImage:"linear-gradient(to bottom,rgba(0,0,0,.35) 60%,transparent 100%)"}}>
          <MiniRoute route={act.route} W={W} H={Math.round(H*.52)}/>
        </div>
      )}
      <div style={{position:"absolute",inset:0,padding:"28px 22px",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
        <div style={{fontSize:f(9),fontWeight:800,color:"rgba(160,200,255,.45)",letterSpacing:".16em"}}>RUNLYTICS</div>
        <div style={{backdropFilter:"blur(18px) saturate(1.3)",WebkitBackdropFilter:"blur(18px) saturate(1.3)",
          background:"rgba(120,170,220,.08)",border:"1px solid rgba(180,220,255,.14)",
          borderRadius:f(14),padding:"26px 22px",
          boxShadow:"0 2px 20px rgba(0,10,40,.3),inset 0 1px 0 rgba(255,255,255,.09)"}}>
          <div style={{textAlign:"center",marginBottom:18}}>
            <div style={{fontSize:f(62),fontWeight:900,color:"#fff",lineHeight:.85,letterSpacing:"-.02em"}}>{dist}</div>
            <div style={{fontSize:f(9),fontWeight:600,color:"rgba(160,200,255,.38)",letterSpacing:".18em",marginTop:10}}>KM</div>
          </div>
          <div style={{height:1,background:"linear-gradient(90deg,transparent,rgba(160,210,255,.15),transparent)",marginBottom:18}}/>
          <div style={{display:"flex",justifyContent:"space-around"}}>
            <Stat label="Pace" value={pace} vc="rgba(255,255,255,.9)"/><Stat label="Time" value={dur} vc="rgba(255,255,255,.9)"/>
          </div>
          <div style={{textAlign:"center",marginTop:14,fontSize:f(8),color:"rgba(160,200,255,.28)",letterSpacing:".04em"}}>{fmtDate(act.date)}</div>
        </div>
        <div style={{textAlign:"center",fontSize:f(7),color:"rgba(160,200,255,.2)",letterSpacing:".06em"}}>runlytics.app</div>
      </div>
    </div>
  );
  if(type==="poster"){
    const badge=act.distanceKm>=42?"🏆 Marathon":act.distanceKm>=21?"🥈 Half Marathon":act.distanceKm>=10?"🔥 10 KM":act.distanceKm>=5?"⚡ 5 KM":"🏃 Activity";
    return(
      <div style={{width:W,height:H,borderRadius:18,flexShrink:0,overflow:"hidden",
        background:"#f8f7f4",boxShadow:"0 12px 40px rgba(0,0,0,.2)",
        display:"flex",flexDirection:"column",...baseAnim}}>
        <div style={{height:3,background:"linear-gradient(90deg,#f97316,#c2410c)",flexShrink:0}}/>
        <div style={{flex:1,padding:"24px 26px 20px",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
          <div style={{fontSize:f(9),fontWeight:800,color:"rgba(0,0,0,.28)",letterSpacing:".16em"}}>RUNLYTICS</div>
          <div>
            <div style={{fontSize:f(80),fontWeight:900,color:"#0a0a0a",lineHeight:.85,letterSpacing:"-.04em"}}>{dist}</div>
            <div style={{fontSize:f(11),fontWeight:700,color:"rgba(0,0,0,.32)",letterSpacing:".18em",marginTop:10}}>KM</div>
            <div style={{width:"100%",height:1,background:"rgba(0,0,0,.08)",margin:"14px 0 10px"}}/>
            <div style={{fontSize:f(11),fontWeight:700,color:"#f97316",letterSpacing:".04em"}}>{badge}</div>
          </div>
          <div style={{display:"flex",gap:f(28)}}>
            <Stat dark label="Pace" value={pace}/><Stat dark label="Time" value={dur}/>
          </div>
          {hasRoute&&(
            <div style={{background:"rgba(0,0,0,.04)",borderRadius:f(10),padding:"10px",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <MiniRoute route={act.route} W={W-72} H={Math.round((W-72)*.55)}/>
            </div>
          )}
          <div style={{fontSize:f(8),color:"rgba(0,0,0,.25)",letterSpacing:".04em"}}>{fmtDate(act.date)}</div>
        </div>
        <div style={{height:3,background:"rgba(0,0,0,.85)",flexShrink:0}}/>
      </div>
    );
  }
  return(
    <div style={{width:W,height:H,borderRadius:18,flexShrink:0,
      background:"#0c0e18",padding:"32px 28px",display:"flex",
      flexDirection:"column",justifyContent:"space-between",
      border:"1px solid rgba(255,255,255,.06)",boxShadow:"0 12px 48px rgba(0,0,0,.7)",...baseAnim}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{fontSize:f(9),fontWeight:800,color:"rgba(255,255,255,.35)",letterSpacing:".16em"}}>RUNLYTICS</div>
        <div style={{fontSize:f(8),color:"rgba(255,255,255,.2)",letterSpacing:".02em"}}>{fmtDate(act.date)}</div>
      </div>
      {hasRoute&&<div style={{display:"flex",justifyContent:"center",margin:"4px 0"}}><MiniRoute route={act.route} W={W-52} H={Math.round((W-52)*.58)}/></div>}
      <div>
        <div style={{fontSize:f(72),fontWeight:900,color:"#fff",lineHeight:.85,letterSpacing:"-.03em"}}>{dist}</div>
        <div style={{fontSize:f(11),fontWeight:600,color:"rgba(255,255,255,.22)",letterSpacing:".18em",marginTop:10}}>KM</div>
      </div>
      <div>
        <div style={{height:1,background:"linear-gradient(90deg,rgba(249,115,22,.3),rgba(249,115,22,.05))",marginBottom:16}}/>
        <div style={{display:"flex",gap:f(28)}}>
          <Stat label="Pace" value={pace} vc="#f97316"/><Stat label="Time" value={dur}/>
        </div>
      </div>
    </div>
  );
};


const ShareModal=({act,onClose})=>{
  const[idx,setIdx]=useState(0);
  const[busy,setBusy]=useState(false);
  const[copied,setCopied]=useState(false);
  const copyText=()=>{
    const text=getCardText(act,TMPL[idx]);
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);}).catch(()=>{});
    }else{
      try{
        const ta=document.createElement("textarea");
        ta.value=text;ta.style.position="fixed";ta.style.opacity="0";
        document.body.appendChild(ta);ta.select();
        document.execCommand("copy");document.body.removeChild(ta);
        setCopied(true);setTimeout(()=>setCopied(false),2000);
      }catch(e){}
    }
  };
  const scrollRef=useRef(null);
  const TMPL=["minimal","orange","cinematic","glass","poster"];
  const LABELS=["Minimal Dark","Bold Orange","Cinematic","Glassmorphism","Race Poster"];
  const scrollTo=i=>{
    if(!scrollRef.current)return;
    scrollRef.current.scrollTo({left:i*scrollRef.current.offsetWidth,behavior:"smooth"});
    setIdx(i);
  };
  const onScroll=()=>{
    if(!scrollRef.current)return;
    const i=Math.round(scrollRef.current.scrollLeft/Math.max(1,scrollRef.current.offsetWidth));
    setIdx(Math.max(0,Math.min(TMPL.length-1,i)));
  };
  const doExport=async(fmt)=>{
    if(busy)return;
    setBusy(fmt);
    try{
      const W=1080,H=1920;
      const cv=document.createElement("canvas");
      cv.width=W;cv.height=H;
      const ctx=cv.getContext("2d");
      if(TMPL[idx]==="glass"||TMPL[idx]==="poster"){drawRunCardExtra(ctx,act,TMPL[idx],W,H);}
      else{drawRunCard(ctx,act,TMPL[idx],W,H);}
      const isPng=fmt==="png";
      cv.toBlob(blob=>{
        if(!blob){setBusy(false);return;}
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");
        a.href=url;a.download="runlytics-"+TMPL[idx]+"."+(isPng?"png":"jpg");
        document.body.appendChild(a);a.click();
        setTimeout(()=>{try{document.body.removeChild(a);}catch(e){}URL.revokeObjectURL(url);},900);
        setBusy(false);
      },isPng?"image/png":"image/jpeg",isPng?undefined:0.92);
    }catch(e){setBusy(false);}
  };
  return(
    <div style={{position:"fixed",inset:0,zIndex:420,background:"#000",display:"flex",flexDirection:"column",overscrollBehavior:"contain"}}>
      <div style={{padding:"14px 20px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid rgba(255,255,255,.07)",flexShrink:0}}>
        <button style={{background:"none",border:"none",color:"rgba(255,255,255,.5)",fontSize:"1.4rem",cursor:"pointer",lineHeight:1,padding:4}} onClick={onClose}>&#x2715;</button>
        <div style={{fontWeight:700,color:"rgba(255,255,255,.88)",fontSize:".84rem",letterSpacing:".1em"}}>SHARE ACTIVITY</div>
        <div style={{width:36}}/>
      </div>
      <div ref={scrollRef} onScroll={onScroll}
        style={{flex:1,display:"flex",overflowX:"auto",scrollSnapType:"x mandatory",scrollbarWidth:"none",WebkitOverflowScrolling:"touch",alignItems:"center"}}>
        {TMPL.map(t=>(
          <div key={t} style={{minWidth:"100%",scrollSnapAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",padding:"12px 28px",boxSizing:"border-box"}}>
            <ShareCard type={t} act={act}/>
          </div>
        ))}
      </div>
      <div style={{padding:"12px 20px 36px",borderTop:"1px solid rgba(255,255,255,.07)",flexShrink:0}}>
        <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:6,marginBottom:12}}>
          {TMPL.map((_,i)=>(
            <div key={i} onClick={()=>scrollTo(i)}
              style={{height:5,borderRadius:3,cursor:"pointer",transition:"all .3s ease",
                width:i===idx?22:5,background:i===idx?"#f97316":"rgba(255,255,255,.16)"}}/>
          ))}
        </div>
        <div style={{textAlign:"center",fontSize:".68rem",color:"rgba(255,255,255,.25)",marginBottom:16,letterSpacing:".1em"}}>
          {LABELS[idx].toUpperCase()}
        </div>
        <button onClick={copyText}
          style={{width:"100%",padding:"11px",borderRadius:10,border:"1px solid rgba(255,255,255,.12)",cursor:"pointer",
            marginBottom:10,transition:"all .2s",
            background:copied?"rgba(34,197,94,.15)":"rgba(255,255,255,.04)",
            color:copied?"#22c55e":"rgba(255,255,255,.6)",
            fontWeight:600,fontSize:".84rem",letterSpacing:".03em"}}>
          {copied?"\u2713 Text Copied!":"\uD83D\uDCCB Copy Text"}
        </button>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>doExport("jpg")} disabled={!!busy}
            style={{flex:2,padding:"13px 0",borderRadius:12,border:"none",cursor:busy?"wait":"pointer",
              background:busy==="jpg"?"rgba(249,115,22,.4)":"#f97316",
              color:busy==="jpg"?"rgba(255,255,255,.4)":"#fff",
              fontWeight:700,fontSize:".9rem",transition:"background .2s",letterSpacing:".02em"}}>
            {busy==="jpg"?"⏳ Saving...":"⬇ JPEG"}
          </button>
          <button onClick={()=>doExport("png")} disabled={!!busy}
            style={{flex:1,padding:"13px 0",borderRadius:12,cursor:busy?"wait":"pointer",
              background:busy==="png"?"rgba(255,255,255,.08)":"rgba(255,255,255,.05)",
              color:busy==="png"?"rgba(255,255,255,.35)":"rgba(255,255,255,.65)",
              fontWeight:600,fontSize:".88rem",transition:"background .2s",letterSpacing:".02em",
              border:"1px solid rgba(255,255,255,.12)"}}>
            {busy==="png"?"⏳":"PNG"}
          </button>
        </div>
        <div style={{textAlign:"center",marginTop:10,fontSize:".62rem",color:"rgba(255,255,255,.15)",letterSpacing:".06em"}}>
          1080 × 1920 · Story Format
        </div>
      </div>
    </div>
  );
};



const CoachCard=({insight})=>{
  const[open,setOpen]=useState(false);
  if(!insight)return null;
  const col=IC[insight.type]||"var(--tx2)";
  const bg=IC_BG[insight.type]||"rgba(255,255,255,.04)";
  const bd=IC_BD[insight.type]||"rgba(255,255,255,.1)";
  const body=insight.detail||insight.body||null;
  return(
    <div style={{background:bg,border:"1px solid "+bd,borderRadius:12,cursor:body?"pointer":"default"}} onClick={()=>body&&setOpen(o=>!o)}>
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

const Detail=({act,hrProfile,onClose,onDelete,onShare})=>{
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
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",
                  borderBottom:i<3?"1px solid var(--bd)":"none"
                }}>
                  <span style={{fontSize:".8rem",color:"var(--tx2)"}}>{l}</span>
                  <span style={{fontSize:".84rem",fontWeight:600}}>{v}</span>
                </div>
              ))}
            </div>
            {onShare&&(
              <button className="btn" onClick={onShare}
                style={{width:"100%",marginTop:12,padding:"13px",borderRadius:12,
                  background:"linear-gradient(135deg,#f97316,#c2410c)",color:"#fff",
                  fontWeight:700,fontSize:".92rem",border:"none",cursor:"pointer",
                  letterSpacing:".03em",boxShadow:"0 4px 16px rgba(249,115,22,.35)"}}>
                ✦ Share Activity
              </button>
            )}
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
          <div>
            {act.route&&act.route.length>2?(
              <div>
                <RouteMapSVG route={act.route} act={act}/>
                <div className="card2" style={{padding:"12px 14px",marginTop:10,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:0}}>
                  <div style={{paddingRight:10,borderRight:"1px solid var(--bd)"}}>
                    <div style={{fontSize:".58rem",color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:3}}>Distance</div>
                    <div style={{fontSize:".88rem",fontWeight:700,color:"var(--or)"}}>{fmtKm(act.distanceKm)+" km"}</div>
                  </div>
                  <div style={{padding:"0 10px",borderRight:"1px solid var(--bd)"}}>
                    <div style={{fontSize:".58rem",color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:3}}>Pace</div>
                    <div style={{fontSize:".88rem",fontWeight:700}}>{fmtPace(act.avgPaceSecKm)+"/km"}</div>
                  </div>
                  <div style={{paddingLeft:10}}>
                    <div style={{fontSize:".58rem",color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:3}}>Elevation</div>
                    <div style={{fontSize:".88rem",fontWeight:700,color:"var(--gn)"}}>{"+"+Math.round(act.elevGainM||0)+"m"}</div>
                  </div>
                </div>
              </div>
            ):(
              <div className="card" style={{padding:16,height:160,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--tx2)"}}>No GPS route</div>
            )}
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
            const fbg=IC_BG[fb.type]||"rgba(255,255,255,.04)";
            const fbd=IC_BD[fb.type]||"rgba(255,255,255,.1)";
            return(
              <div key={i} style={{display:"flex",gap:11,padding:"11px 13px",borderRadius:11,background:fbg,border:"1px solid "+fbd}}>
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
  const recBg=IC_BG[rec.type]||"rgba(255,255,255,.04)";
  const recBd=IC_BD[rec.type]||"rgba(255,255,255,.1)";
  return(
    <div style={{padding:"4px 0 32px"}}>
      <div className="a0" style={{marginBottom:20,paddingTop:4}}>
        <div style={{fontSize:".7rem",color:"var(--tx3)",marginBottom:3}}>{greet()}</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{fontSize:"1.45rem",fontWeight:700,lineHeight:1.2}}>{profile.name==="Runner"?"Welcome back 👋":"Welcome back, "+profile.name+" 👋"}</div>
          {analytics.streak>=2&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"8px 11px",borderRadius:12,background:"rgba(249,115,22,.1)",border:"1.5px solid rgba(249,115,22,.25)",flexShrink:0}}>
              <span style={{fontSize:"1.2rem"}}>🔥</span>
              <span style={{fontSize:"1rem",fontWeight:800,color:"var(--or)",lineHeight:1}}>{analytics.streak}</span>
              <span style={{fontSize:".5rem",color:"var(--or)",fontWeight:600}}>DAYS</span>
            </div>
          )}
        </div>
      </div>
      <div className="a1" style={{marginBottom:14}}>
        <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:7}}>Today's Recommendation</div>
        <div style={{background:recBg,border:"1px solid "+recBd,borderRadius:12,padding:"13px 15px",display:"flex",alignItems:"center",gap:12}}>
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
              <span className="tap" style={{color:"var(--or)",fontWeight:600}} onClick={e=>{e.stopPropagation();onViewAll();}}>{"View all "+acts.length+" runs →"}</span>
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
          {todayTasks.map(t=>{const done=!!(t.completions&&t.completions[todayStr]);return(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <div style={{width:20,height:20,borderRadius:6,flexShrink:0,
                border:"2px solid "+(done?"var(--gn)":"var(--bd2)"),background:done?"var(--gn)":"transparent",
                display:"flex",alignItems:"center",justifyContent:"center"}}>{done&&<span style={{fontSize:".6rem",color:"#fff",fontWeight:700}}>✓</span>}</div>
              <span style={{fontSize:".82rem",color:done?"var(--tx3)":"var(--tx)",textDecoration:done?"line-through":"none",flex:1}}>{t.title}</span>
              {t.streak>0&&<span style={{fontSize:".7rem",color:"var(--or)"}}>{"🔥"+t.streak}</span>}
            </div>
          );})}
          <div className="pb" style={{marginTop:10}}><div className="pf" style={{width:(todayTasks.length>0?Math.round(todayDone/todayTasks.length*100):0)+"%",background:"var(--gn)"}}/></div>
        </div>
      )}
      {acts.length>0&&<button className="btn b-gh" style={{width:"100%",padding:"11px",fontSize:".82rem",borderRadius:13,marginTop:4}} onClick={onViewMonthly}>📅 Monthly Report</button>}
    </div>
  );
};

const StatsTab=({acts,analytics,onViewAll,onViewMonthly,onOpenPR})=>{
  const[range,setRange]=useState(8);
  const runs=acts.filter(a=>a.type==="Run"||a.type==="Walk");
  const totalKm=runs.reduce((s,a)=>s+a.distanceKm,0);
  const weeklyData=analytics.weekly.slice(-range);
  const racePRs=useMemo(()=>computeRacePRs(acts),[acts]);
  const hasAnyPR=PR_CATS.some(cat=>racePRs[cat.id]&&racePRs[cat.id].best);
  const overallPRs=runs.length?{
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
      <div className="a2" style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <SH title="Personal Records 🏆"/>
          <span style={{fontSize:".68rem",color:"var(--tx3)"}}>Tap for Top 3</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {PR_CATS.map(cat=>{
            const entry=racePRs[cat.id];
            const best=entry?entry.best:null;
            const total=entry?entry.total:0;
            const hasMore=total>1;
            return(
              <div key={cat.id}
                className="tap"
                style={{
                  borderRadius:14,overflow:"hidden",border:"1.5px solid "+(best?cat.color+"45":"var(--bd)"),
                  background:best?cat.color+"07":"var(--s2)",
                  cursor:"pointer",
                  transition:"transform .15s, box-shadow .15s",
                }}
                onClick={()=>entry&&onOpenPR(entry)}>
                <div style={{padding:"12px 12px 8px",borderBottom:"1px solid "+(best?cat.color+"20":"var(--bd)")}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontSize:".6rem",fontWeight:700,color:best?cat.color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:3}}>
                        {cat.shortLabel}
                      </div>
                      <div style={{fontSize:"1.25rem",fontWeight:800,color:best?cat.color:"var(--tx3)",fontFamily:"monospace",lineHeight:1}}>
                        {best?fmtRaceTime(best.movingTimeSec):"—"}
                      </div>
                    </div>
                    <span style={{fontSize:"1.2rem",opacity:best?1:.35}}>{cat.icon}</span>
                  </div>
                </div>
                <div style={{padding:"8px 12px 10px"}}>
                  {best?(
                    <div>
                      <div style={{fontSize:".72rem",fontWeight:600,color:"var(--tx)",marginBottom:3}}>{fmtPace(best.paceSecKm)+"/km"}</div>
                      <div style={{fontSize:".62rem",color:"var(--tx3)"}}>{fmtDateS(best.date)}</div>
                    </div>
                  ):(
                    <div style={{fontSize:".7rem",color:"var(--tx3)",lineHeight:1.4}}>No record yet</div>
                  )}
                  {hasMore&&(
                    <div style={{marginTop:6,fontSize:".6rem",color:cat.color,fontWeight:600}}>
                      {"+"+( total-1)+" more · View Top 3 →"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {!hasAnyPR&&acts.length>0&&(
          <div style={{marginTop:12,padding:"12px 14px",borderRadius:11,background:"var(--s2)",fontSize:".78rem",color:"var(--tx2)",lineHeight:1.7}}>
            {"Race PRs appear after you run distances close to standard race distances (5K, 10K, 21.1K, 42.2K etc). Sync Strava or upload a GPX from a race."}
          </div>
        )}
      </div>
      {overallPRs&&(
        <div className="card a3" style={{padding:16,marginBottom:14}}>
          <SH title="Overall Bests"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[
              {l:"🏆 Longest",v:fmtKm(overallPRs.longest&&overallPRs.longest.distanceKm||0)+" km",c:"var(--or)",sub:overallPRs.longest?fmtDateS(overallPRs.longest.date):""},
              {l:"⚡ Best Pace",v:fmtPace(overallPRs.fastest&&overallPRs.fastest.avgPaceSecKm||0)+"/km",c:"var(--bl)",sub:overallPRs.fastest?fmtDateS(overallPRs.fastest.date):""}
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
  const TCLR={hr:"#ef4444",run:"#f97316",recovery:"#22c55e",load:"#eab308",wellness:"#3b82f6"};
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
                <div style={{width:24,height:24,borderRadius:7,flexShrink:0,marginTop:1,transition:"all .15s",border:"2.5px solid "+(done?col:"var(--bd2)"),background:done?col:"transparent",
                  display:"flex",alignItems:"center",justifyContent:"center"}}>
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

const AchievementsTab=({earnedBadges,acts,analytics,tierProgress,newTiers})=>{
  const[exp,setExp]=useState(null);
  const earned=BADGE_DEFS.filter(b=>earnedBadges.has(b.id));
  const pct=Math.round(earned.length/BADGE_DEFS.length*100);
  return(
    <div style={{padding:"4px 0 40px"}}>
      <div className="a0" style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}>
        <Ring pct={pct/100} size={62} color="var(--or)">
          <span style={{fontSize:".56rem",fontWeight:700,color:"var(--or)"}}>{pct+"%"}</span>
        </Ring>
        <div>
          <div style={{fontSize:"1.3rem",fontWeight:800}}>
            <span style={{color:"var(--or)"}}>{earned.length}</span>
            <span style={{fontSize:".82rem",color:"var(--tx2)",fontWeight:400}}>{" / "+BADGE_DEFS.length}</span>
          </div>
          <div style={{fontSize:".74rem",color:"var(--tx2)",marginTop:4}}>badges earned</div>
          <div style={{fontSize:".68rem",color:"var(--tx3)",marginTop:2}}>{analytics.streak+"d · "+acts.length+" runs"}</div>
        </div>
      </div>
      <div className="a1" style={{marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)"}}>Tier Progression</div>
          <div style={{fontSize:".6rem",color:"var(--tx3)"}}>Tap to expand</div>
        </div>
        {(tierProgress||[]).map(tp=>{
          const isExp=exp===tp.id,c=tp.current?tp.current.color:"#6b7280";
          const isNew=newTiers&&newTiers.includes(tp.id);
          return(
            <div key={tp.id} className="card2 tap" style={{marginBottom:9,overflow:"hidden",borderColor:tp.current?c+"30":"var(--bd)",background:tp.current?c+"06":"var(--s2)",cursor:"pointer"}}
              onClick={()=>setExp(isExp?null:tp.id)}>
              <div style={{padding:"12px 14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:"1.3rem",flexShrink:0}}>{tp.badge.icon}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontWeight:700,fontSize:".86rem"}}>{tp.badge.name}</span>
                        {isNew&&<span style={{fontSize:".58rem",background:"var(--or)",color:"#fff",padding:"1px 6px",borderRadius:8,fontWeight:700}}>NEW!</span>}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                        {tp.current?<span style={{fontSize:".72rem",fontWeight:700,color:c}}>{tp.current.icon+" "+tp.current.label}</span>:<span style={{fontSize:".7rem",color:"var(--tx3)"}}>Not started</span>}
                        <span style={{color:"var(--tx3)",fontSize:".7rem",display:"inline-block",transform:isExp?"rotate(180deg)":"none",transition:"transform .2s"}}>▾</span>
                      </div>
                    </div>
                    <div className="pb"><div className="pf" style={{width:tp.pct+"%",background:tp.current?c:"var(--tx3)"}}/></div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:5}}>
                      <span style={{fontSize:".64rem",color:"var(--tx3)"}}>{tp.progress+" "+tp.badge.unit}</span>
                      {tp.next?<span style={{fontSize:".64rem",color:"var(--tx2)"}}>{"Next: "+tp.next.label+" ("+tp.next.req+" "+tp.badge.unit+")"}</span>:<span style={{fontSize:".64rem",color:c,fontWeight:700}}>👑 Elite!</span>}
                    </div>
                  </div>
                </div>
              </div>
              {isExp&&(
                <div style={{padding:"0 14px 12px",borderTop:"1px solid var(--bd)"}}>
                  <div style={{fontSize:".6rem",color:"var(--tx3)",marginBottom:8,marginTop:10,textTransform:"uppercase",letterSpacing:".08em"}}>Full Ladder</div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {tp.badge.tiers.map(t=>{
                      const done=tp.progress>=t.req,isCurr=tp.current&&tp.current.level===t.level,isNext=tp.next&&tp.next.level===t.level;
                      return(
                        <div key={t.level} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:8,
                          opacity:done?1:isNext?.8:.4,background:isCurr?t.color+"18":isNext?"var(--s3)":"transparent",
                          border:isCurr?"1px solid "+t.color+"35":isNext?"1px solid var(--bd2)":"1px solid transparent"}}>
                          <span style={{fontSize:".85rem",flexShrink:0}}>{done?"✓":isNext?"▷":"○"}</span>
                          <div style={{flex:1,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <span style={{fontSize:".74rem",fontWeight:isCurr||done?600:400,color:done?t.color:"var(--tx2)"}}>{t.icon+" "+t.label}</span>
                            <span style={{fontSize:".68rem",color:"var(--tx3)"}}>{t.req+" "+tp.badge.unit}</span>
                          </div>
                          {isCurr&&<span style={{fontSize:".58rem",background:t.color,color:"#fff",padding:"1px 5px",borderRadius:6,fontWeight:700,flexShrink:0}}>NOW</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {earned.length>0&&(
        <div className="card a2" style={{padding:16,marginBottom:14}}>
          <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:10}}>Achievement Badges</div>
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}} className="scroll-x">
            {earned.slice(-6).reverse().map((b,i)=>(
              <div key={b.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,
                padding:"10px 9px",minWidth:64,borderRadius:12,flexShrink:0,
                background:b.color+"15",border:"1.5px solid "+b.color+"30",animation:"pop .4s "+(i*.06)+"s both"}}>
                <span style={{fontSize:"1.6rem"}}>{b.icon}</span>
                <div style={{fontSize:".56rem",fontWeight:700,color:b.color,textAlign:"center"}}>{b.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="a3" style={{marginBottom:14}}>
        <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:8}}>{"Locked ("+BADGE_DEFS.filter(b=>!earnedBadges.has(b.id)).length+")"}</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {BADGE_DEFS.filter(b=>!earnedBadges.has(b.id)).map(b=>(
            <div key={b.id} style={{padding:"5px 9px",borderRadius:20,border:"1px solid var(--bd)",background:"var(--s2)",display:"flex",alignItems:"center",gap:5,opacity:.6}}>
              <span style={{fontSize:".85rem",filter:"grayscale(1)"}}>{b.icon}</span>
              <span style={{fontSize:".68rem",color:"var(--tx3)"}}>{b.name}</span>
            </div>
          ))}
        </div>
      </div>
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

const MonthlyReport=({acts,goals,onClose})=>{
  // Group activities by calendar month
  const byMonth=useMemo(()=>{
    const map={};
    acts.forEach(a=>{
      if(!["Run","Walk","Hike"].includes(a.type))return;
      const d=new Date(a.dateTs);
      const key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
      if(!map[key])map[key]={key,label:d.toLocaleDateString("en-GB",{month:"long",year:"numeric"}),runs:[],km:0,timeSec:0,paces:[],hrs:[],elevGain:0};
      const m=map[key];
      m.runs.push(a);m.km+=a.distanceKm;m.timeSec+=a.movingTimeSec||0;
      if(a.avgPaceSecKm)m.paces.push(a.avgPaceSecKm);
      if(a.avgHR)m.hrs.push(a.avgHR);
      m.elevGain+=a.elevGainM||0;
    });
    return Object.values(map).sort((a,b)=>b.key.localeCompare(a.key));
  },[acts]);

  if(!byMonth.length)return(
    <div style={{position:"fixed",inset:0,zIndex:220,background:"var(--bg)",display:"flex",flexDirection:"column"}}>
      <div className="glass" style={{padding:"14px 18px 12px",borderBottom:"1px solid var(--bd)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontWeight:700,fontSize:"1.05rem"}}>Monthly Report</div>
        <button className="btn b-gh" style={{padding:"6px 13px",fontSize:".8rem"}} onClick={onClose}>✕ Close</button>
      </div>
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,color:"var(--tx2)"}}>
        <span style={{fontSize:"3rem"}}>📅</span>
        <div style={{fontWeight:600}}>No runs recorded yet</div>
        <div style={{fontSize:".84rem"}}>Upload your first GPX to generate a report</div>
      </div>
    </div>
  );

  return(
    <div style={{position:"fixed",inset:0,zIndex:220,background:"var(--bg)",display:"flex",flexDirection:"column"}}>
      <div className="glass" style={{padding:"14px 18px 12px",borderBottom:"1px solid var(--bd)",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div>
          <div style={{fontWeight:700,fontSize:"1.05rem"}}>Monthly Report</div>
          <div style={{fontSize:".68rem",color:"var(--tx2)",marginTop:2}}>{byMonth.length+" month"+(byMonth.length!==1?"s":"")+" of data"}</div>
        </div>
        <button className="btn b-gh" style={{padding:"6px 13px",fontSize:".8rem"}} onClick={onClose}>✕ Close</button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"16px 18px 40px"}}>
        {byMonth.map((m,mi)=>{
          const longest=m.runs.reduce((b,r)=>r.distanceKm>b.distanceKm?r:b,m.runs[0]);
          const bestPace=m.paces.length?Math.min(...m.paces):null;
          const avgHR=m.hrs.length?Math.round(m.hrs.reduce((s,h)=>s+h,0)/m.hrs.length):null;
          const avgPace=m.paces.length?Math.round(m.paces.reduce((s,p)=>s+p,0)/m.paces.length):null;
          const monthGoal=goals&&goals.monthly?goals.monthly:0;
          const goalPct=monthGoal?Math.min(100,Math.round(m.km/monthGoal*100)):0;
          const isCurrent=mi===0;
          const totalH=Math.floor(m.timeSec/3600),totalM=Math.floor((m.timeSec%3600)/60);
          const totalTime=(totalH>0?totalH+"h ":"")+totalM+"m";
          return(
            <div key={m.key} className={"card a"+Math.min(mi,3)} style={{marginBottom:16,padding:0,overflow:"hidden",border:isCurrent?"1px solid rgba(249,115,22,.3)":"1px solid var(--bd)"}}>
              {/* Month header */}
              <div style={{padding:"14px 16px 12px",background:isCurrent?"rgba(249,115,22,.07)":"var(--s2)",borderBottom:"1px solid var(--bd)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:".96rem",color:isCurrent?"var(--or)":"var(--tx)"}}>{m.label}</div>
                  <div style={{fontSize:".68rem",color:"var(--tx2)",marginTop:2}}>{m.runs.length+" run"+(m.runs.length!==1?"s":"")}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:"1.4rem",fontWeight:800,color:isCurrent?"var(--or)":"var(--tx)",lineHeight:1}}>{fmtKm(m.km)}</div>
                  <div style={{fontSize:".6rem",color:"var(--tx2)",letterSpacing:".08em"}}>KM TOTAL</div>
                </div>
              </div>
              {/* Goal progress bar */}
              {monthGoal>0&&(
                <div style={{padding:"10px 16px 0"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <span style={{fontSize:".64rem",color:"var(--tx2)"}}>Monthly goal</span>
                    <span style={{fontSize:".64rem",color:goalPct>=100?"var(--gn)":"var(--tx2)",fontWeight:600}}>{goalPct+"% of "+monthGoal+" km"}</span>
                  </div>
                  <div className="pb"><div className="pf" style={{width:goalPct+"%",background:goalPct>=100?"var(--gn)":"var(--or)"}}/></div>
                </div>
              )}
              {/* Stats grid */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:1,background:"var(--bd)",margin:"10px 0 0",borderTop:"1px solid var(--bd)"}}>
                {[
                  {l:"Avg Pace",v:avgPace?fmtPace(avgPace)+"/km":"—"},
                  {l:"Best Pace",v:bestPace?fmtPace(bestPace)+"/km":"—"},
                  {l:"Total Time",v:totalTime||"—"},
                  {l:"Longest",v:longest?fmtKm(longest.distanceKm)+" km":"—"},
                  {l:"Elev Gain",v:"+"+Math.round(m.elevGain)+"m"},
                  {l:"Avg HR",v:avgHR?(avgHR+" bpm"):"—"},
                ].map(({l,v})=>(
                  <div key={l} style={{background:"var(--bg)",padding:"11px 12px",textAlign:"center"}}>
                    <div style={{fontSize:".86rem",fontWeight:700,marginBottom:3}}>{v}</div>
                    <div style={{fontSize:".6rem",color:"var(--tx2)"}}>{l}</div>
                  </div>
                ))}
              </div>
              {/* Top 3 runs */}
              <div style={{padding:"10px 16px 14px"}}>
                <div style={{fontSize:".6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:"var(--tx3)",marginBottom:8}}>Runs this month</div>
                {[...m.runs].sort((a,b)=>b.distanceKm-a.distanceKm).slice(0,3).map((r,i)=>(
                  <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:i<2?"1px solid var(--bd)":"none"}}>
                    <div style={{minWidth:0,flex:1,paddingRight:10}}>
                      <div style={{fontSize:".76rem",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                      <div style={{fontSize:".64rem",color:"var(--tx2)",marginTop:1}}>{fmtDate(r.date)}</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:".82rem",fontWeight:700,color:"var(--or)"}}>{fmtKm(r.distanceKm)+" km"}</div>
                      <div style={{fontSize:".64rem",color:"var(--tx2)"}}>{fmtPace(r.avgPaceSecKm)+"/km"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SettingsPanel=({acts,goals,hrProfile,profile,onSaveGoals,onSaveHR,onSaveProfile,onClearAll,onClose,stravaAuth,stravaSync,onStravaConnect,onStravaSync,onStravaDisconnect})=>{
  const[view,setView]=useState("main");
  const[age,setAge]=useState(hrProfile.age||"");
  const[ov,setOv]=useState(hrProfile.maxHROverride||"");
  const[useOv,setUseOv]=useState(!!hrProfile.maxHROverride);
  const[wk,setWk]=useState(goals.weekly);
  const[mo,setMo]=useState(goals.monthly);
  const[nm,setNm]=useState(profile.name||"Runner");
  const ageNum=parseInt(age)||null;
  const prevMaf=useOv&&parseInt(ov)?parseInt(ov):ageNum?180-ageNum:null;
  const backBtn=<button className="tap" style={{background:"none",border:"none",color:"var(--tx2)",fontSize:"1.1rem"}} onClick={()=>setView("main")}>‹</button>;
  return(
    <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(0,0,0,.6)"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="glass" style={{width:"100%",maxWidth:430,borderRadius:"22px 22px 0 0",padding:"22px 20px 40px",maxHeight:"92vh",overflowY:"auto",border:"1px solid var(--bd)"}}>
        <div style={{width:36,height:4,borderRadius:2,background:"var(--bd2)",margin:"0 auto 18px"}}/>
        {view==="main"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <div style={{fontWeight:700,fontSize:"1.05rem"}}>Settings</div>
              <button className="btn b-gh" style={{padding:"6px 13px",fontSize:".8rem"}} onClick={onClose}>Done</button>
            </div>
            {[{icon:"👤",label:"Profile",v:"profile"},{icon:"❤️",label:"MAF HR",v:"hr"},{icon:"🎯",label:"Goals",v:"goals"},{icon:"🟠",label:"Strava Sync",v:"strava"}].map(item=>(
              <div key={item.v} className="tap card2" style={{padding:"14px 15px",marginBottom:10,display:"flex",alignItems:"center",gap:14,borderRadius:12,cursor:"pointer"}} onClick={()=>setView(item.v)}>
                <div style={{width:36,height:36,borderRadius:10,background:"var(--s3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem"}}>{item.icon}</div>
                <div style={{flex:1,fontWeight:500,fontSize:".88rem"}}>{item.label}</div>
                <span style={{color:"var(--tx3)"}}>›</span>
              </div>
            ))}
            <div className="card2" style={{padding:14,marginBottom:10,borderRadius:12}}>
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
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>{backBtn}<div style={{fontWeight:700,fontSize:"1.05rem"}}>Profile</div></div>
            <label style={{fontSize:".76rem",fontWeight:600,display:"block",marginBottom:7}}>Your name</label>
            <input className="inp" value={nm} onChange={e=>setNm(e.target.value)} placeholder="e.g. Alex" style={{marginBottom:18}}/>
            <button className="btn b-or" style={{width:"100%",padding:"12px"}} onClick={()=>{onSaveProfile({name:nm||"Runner"});setView("main");}}>Save</button>
          </div>
        )}
        {view==="hr"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>{backBtn}<div style={{fontWeight:700,fontSize:"1.05rem"}}>MAF HR Profile</div></div>
            <label style={{fontSize:".76rem",fontWeight:600,display:"block",marginBottom:7}}>Age · 180 − age formula</label>
            <input className="inp" type="number" min="10" max="100" placeholder="e.g. 32" value={age} onChange={e=>setAge(e.target.value)} style={{marginBottom:ageNum&&!useOv?6:14}}/>
            {ageNum&&!useOv&&<div style={{fontSize:".72rem",color:"var(--gn)",marginBottom:14}}>{"✓ MAF HR: "+(180-ageNum)+" bpm"}</div>}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:useOv?10:16}}>
              <div style={{width:36,height:20,borderRadius:10,background:useOv?"var(--or)":"var(--bd2)",position:"relative",cursor:"pointer",transition:"background .2s"}} onClick={()=>setUseOv(v=>!v)}>
                <div style={{position:"absolute",top:2,left:useOv?18:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
              </div>
              <span style={{fontSize:".78rem",cursor:"pointer"}} onClick={()=>setUseOv(v=>!v)}>Custom MAF override</span>
            </div>
            {useOv&&<input className="inp" type="number" min="100" max="220" placeholder="e.g. 148" value={ov} onChange={e=>setOv(e.target.value)} style={{marginBottom:14}}/>}
            {prevMaf&&(
              <div style={{marginBottom:16,padding:"12px",background:"rgba(249,115,22,.07)",border:"1px solid rgba(249,115,22,.2)",borderRadius:12}}>
                <div style={{fontSize:".7rem",color:"var(--or)",fontWeight:600,marginBottom:7}}>{"MAF = "+prevMaf+" bpm"}</div>
                {getMafZones(prevMaf).map(z=>(
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
              <button className="btn b-or" style={{flex:1,padding:"12px"}} onClick={()=>{onSaveHR({age:ageNum,restingHR:null,maxHROverride:useOv&&parseInt(ov)?parseInt(ov):null});setView("main");}}>Save</button>
            </div>
          </div>
        )}
        {view==="goals"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>{backBtn}<div style={{fontWeight:700,fontSize:"1.05rem"}}>Distance Goals</div></div>
            {[["Weekly (km)",wk,setWk],["Monthly (km)",mo,setMo]].map(([l,v,sv])=>(
              <div key={l} style={{marginBottom:16}}>
                <label style={{fontSize:".76rem",fontWeight:600,display:"block",marginBottom:7}}>{l}</label>
                <input className="inp" type="number" min="1" max="500" value={v} onChange={e=>sv(Number(e.target.value))}/>
              </div>
            ))}
            <button className="btn b-or" style={{width:"100%",padding:"12px"}} onClick={()=>{onSaveGoals({weekly:Number(wk),monthly:Number(mo)});setView("main");}}>Save</button>
          </div>
        )}
        {view==="strava"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>{backBtn}<div style={{fontWeight:700,fontSize:"1.05rem"}}>Strava Sync</div></div>
            {stravaAuth?(
              <div>
                <div style={{padding:"12px 14px",borderRadius:12,background:"rgba(34,197,94,.1)",border:"1px solid rgba(34,197,94,.2)",marginBottom:14,display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:"#fc4c02",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem",flexShrink:0}}>🟠</div>
                  <div><div style={{fontWeight:700,color:"var(--gn)"}}>✓ Connected</div><div style={{fontSize:".74rem",color:"var(--tx2)"}}>{stravaAuth.athlete&&stravaAuth.athlete.firstname||"Athlete"}</div></div>
                </div>
                <button className="btn b-or" style={{width:"100%",padding:"12px",marginBottom:10}} onClick={onStravaSync} disabled={stravaSync&&stravaSync.loading}>{stravaSync&&stravaSync.loading?"⏳ Syncing…":"🔄 Sync from Strava"}</button>
                {stravaSync&&stravaSync.msg&&<div style={{fontSize:".74rem",color:"var(--tx2)",textAlign:"center",padding:"7px",background:"var(--s3)",borderRadius:9,marginBottom:10}}>{stravaSync.msg}</div>}
                <button className="btn b-rd" style={{width:"100%",padding:"11px",fontSize:".82rem"}} onClick={()=>{onStravaDisconnect();setView("main");}}>Disconnect Strava</button>
              </div>
            ):(
              <div>
                <div style={{textAlign:"center",padding:"16px 0 20px"}}>
                  <div style={{fontSize:"2.5rem",marginBottom:10}}>🟠</div>
                  <div style={{fontWeight:700,marginBottom:8}}>Connect Strava</div>
                  <div style={{fontSize:".8rem",color:"var(--tx2)",lineHeight:1.7,marginBottom:20}}>Import your runs automatically.</div>
                </div>
                <button className="btn b-or" style={{width:"100%",padding:"13px",marginBottom:10}} onClick={onStravaConnect}>🟠 Connect with Strava</button>
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
  const[tab,setTab]=useState(()=>{try{return localStorage.getItem(TAB_KEY)||"home";}catch(e){return"home";}});
  const setTabPersist=useCallback(t=>{setTab(t);try{localStorage.setItem(TAB_KEY,t);}catch(e){}},[]);
  const[detail,setDetail]=useState(null);
  const[shareAct,setShareAct]=useState(null);
  const[showSettings,setShowSettings]=useState(false);
  const[showUpload,setShowUpload]=useState(false);
  const[showSplash,setShowSplash]=useState(true);
  const[showAllRuns,setShowAllRuns]=useState(false);
  const[showMonthly,setShowMonthly]=useState(false);
  const[feedbackRun,setFeedbackRun]=useState(null);
  const[stravaAuth,setStravaAuth]=useState(()=>loadStravaAuth());
  const[stravaSync,setStravaSync]=useState({loading:false,msg:""});
  const[prDetail,setPrDetail]=useState(null);
  const scrollRef=useRef(null);
  useEffect(()=>{saveActs(acts);},[acts]);
  useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTo({top:0,behavior:"smooth"});},[tab]);
  const analytics=useMemo(()=>buildAnalytics(acts,hrProfile),[acts,hrProfile]);
  const mafHRGlobal=useMemo(()=>getMafHR(hrProfile,null),[hrProfile]);
  const earnedBadges=useMemo(()=>computeEarnedBadges(acts,analytics,mafHRGlobal),[acts,analytics,mafHRGlobal]);
  const newBadges=useMemo(()=>[...earnedBadges].filter(id=>!seenBadges.has(id)),[earnedBadges,seenBadges]);
  const[seenTiers,setSeenTiers]=useState(()=>loadSeenTiers());
  const tierProgress=useMemo(()=>computeTierProgress(acts,analytics),[acts,analytics]);
  const newTiers=useMemo(()=>tierProgress.filter(tp=>{const prev=seenTiers[tp.id]||0;return tp.earnedCount>prev;}).map(tp=>tp.id),[tierProgress,seenTiers]);
  const hasUnseen=newBadges.length>0||newTiers.length>0;
  useEffect(()=>{
    if(tab==="awards"&&hasUnseen){
      const next=new Set([...seenBadges,...earnedBadges]);
      setSeenBadges(next);saveSeenBadges(next);
      const tierSeen={};tierProgress.forEach(tp=>{tierSeen[tp.id]=tp.earnedCount;});
      setSeenTiers(tierSeen);saveSeenTiers(tierSeen);
    }
  },[tab]);
  const doStravaRef=useRef(null);
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search),code=params.get("code");
    if(!code)return;
    window.history.replaceState({},"",window.location.pathname);
    setStravaSync({loading:true,msg:"Connecting to Strava…"});
    fetch("/api/strava-token?code="+code).then(r=>r.json()).then(data=>{
      if(!data.access_token){setStravaSync({loading:false,msg:"Connection failed."});return;}
      saveStravaAuth(data);setStravaAuth(data);setStravaSync({loading:false,msg:"Connected ✓"});
      if(doStravaRef.current)doStravaRef.current(data);
    }).catch(()=>setStravaSync({loading:false,msg:"Connection failed."}));
  },[]);
  const getStravaToken=useCallback(async auth=>{
    if(!auth)return null;
    if(auth.expires_at&&Date.now()/1000<auth.expires_at-300)return auth.access_token;
    try{
      const r=await fetch("/api/strava-refresh",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refresh_token:auth.refresh_token})});
      const fresh=await r.json();
      if(!fresh.access_token)return null;
      const upd=Object.assign({},auth,fresh);
      saveStravaAuth(upd);setStravaAuth(upd);
      return fresh.access_token;
    }catch(e){return null;}
  },[]);
  const isSyncingRef=useRef(false);
  const lastSyncRef=useRef(0);
  const doStravaSync=useCallback(async(authOverride,silent=false)=>{
    const auth=authOverride||stravaAuth;
    if(!auth)return;
    const now=Date.now();
    if(isSyncingRef.current)return;
    if(!authOverride&&now-lastSyncRef.current<10000)return;
    isSyncingRef.current=true;lastSyncRef.current=now;
    if(!silent)setStravaSync({loading:true,msg:"Syncing…"});
    else setStravaSync(s=>({...s,loading:true}));
    const token=await getStravaToken(auth);
    if(!token){isSyncingRef.current=false;setStravaSync({loading:false,msg:"Session expired — reconnect Strava."});return;}
    try{
      const res=await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=30&page=1",{headers:{Authorization:"Bearer "+token}});
      const data=await res.json();
      if(!Array.isArray(data)){setStravaSync({loading:false,msg:"Sync error."});return;}
      const mapped=data.filter(a=>["Run","Walk","Hike","TrailRun","VirtualRun"].includes(a.sport_type||a.type)).map(mapStravaActivity);
      let added=0;
      setActs(prev=>{const ids=new Set(prev.map(a=>a.id));const fresh=mapped.filter(a=>!ids.has(a.id));added=fresh.length;if(!fresh.length)return prev;return [...fresh,...prev].sort((a,b)=>b.dateTs-a.dateTs);});
      if(silent&&added===0){setStravaSync(s=>({...s,loading:false}));}
      else{setStravaSync({loading:false,msg:added>0?"+"+added+" new activit"+(added===1?"y":"ies")+" synced ✓":"Up to date ✓"});if(added===0)setTimeout(()=>setStravaSync(s=>({...s,msg:""})),3000);}
    }catch(e){setStravaSync({loading:false,msg:"Sync failed."});}
    finally{isSyncingRef.current=false;}
  },[stravaAuth,getStravaToken]);
  useEffect(()=>{doStravaRef.current=doStravaSync;},[doStravaSync]);
  useEffect(()=>{if(stravaAuth)doStravaSync(null,true);},[]);
  useEffect(()=>{
    if(!stravaAuth)return;
    const onFocus=()=>doStravaSync(null,true);
    window.addEventListener("focus",onFocus);
    return()=>window.removeEventListener("focus",onFocus);
  },[stravaAuth,doStravaSync]);
  useEffect(()=>{
    if(!stravaAuth)return;
    const id=setInterval(()=>doStravaSync(null,true),5*60*1000);
    return()=>clearInterval(id);
  },[stravaAuth,doStravaSync]);
  useEffect(()=>{
    history.replaceState({_rl:"root"},"");
    history.pushState({_rl:"s"},"");
    history.pushState({_rl:"s"},"");
  },[]);
  const detRef=useRef(null),fbRef=useRef(null),setRef=useRef(null),arRef=useRef(null),monRef=useRef(null),upRef=useRef(null);
  useEffect(()=>{detRef.current=detail;},[detail]);
  useEffect(()=>{fbRef.current=feedbackRun;},[feedbackRun]);
  useEffect(()=>{setRef.current=showSettings;},[showSettings]);
  useEffect(()=>{arRef.current=showAllRuns;},[showAllRuns]);
  useEffect(()=>{monRef.current=showMonthly;},[showMonthly]);
  useEffect(()=>{upRef.current=showUpload;},[showUpload]);
  useEffect(()=>{
    const h=(e)=>{
      if(fbRef.current){history.pushState({_rl:"s"},"");setFeedbackRun(null);return;}
      if(detRef.current){history.pushState({_rl:"s"},"");setDetail(null);return;}
      if(setRef.current){history.pushState({_rl:"s"},"");setShowSettings(false);return;}
      if(arRef.current){history.pushState({_rl:"s"},"");setShowAllRuns(false);return;}
      if(monRef.current){history.pushState({_rl:"s"},"");setShowMonthly(false);return;}
      if(upRef.current){history.pushState({_rl:"s"},"");setShowUpload(false);return;}
      const state=e.state;
      if(!state||state._rl==="root"){
        history.pushState({_rl:"s"},"");
      }
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
    const clientId=window.__STRAVA_CLIENT_ID||"";
    if(!clientId){
      alert("Strava Client ID not configured. Check your Vercel environment variables.");
      return;
    }
    window.location.href="https://www.strava.com/oauth/authorize?client_id="+clientId+"&redirect_uri="+encodeURIComponent(window.location.origin+"/")+"&response_type=code&approval_prompt=auto&scope=activity:read_all";
  },[]);
  const addActs=useCallback(parsed=>{
    setActs(prev=>{const m=[...parsed,...prev];m.sort((a,b)=>b.dateTs-a.dateTs);return m;});
    if(parsed.length>0){const h=parsed.reduce((b,r)=>r.distanceKm>b.distanceKm?r:b,parsed[0]);setFeedbackRun(h);}
    if(upRef.current)history.back();
    setTabPersist("home");
  },[setTabPersist]);
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
        <div style={{position:"fixed",inset:0,zIndex:999,background:"var(--bg)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
          opacity:splashOut?0:1,transition:"opacity .33s ease",pointerEvents:splashOut?"none":"auto"}}>
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
      {prDetail&&<PRDetailModal entry={prDetail} onClose={()=>setPrDetail(null)}
        onOpenRun={id=>{const act=acts.find(a=>a.id===id);if(act){setPrDetail(null);openDetail(act);}}}
      />}
      {showAllRuns&&<AllRunsView acts={acts} hrProfile={hrProfile} onSelect={openDetail} onClose={back}/>}
      {showMonthly&&<MonthlyReport acts={acts} goals={goals} onClose={back}/>}
      {detail&&<Detail act={detail} hrProfile={hrProfile} onClose={back} onDelete={id=>deleteAct(id)} onShare={()=>setShareAct(detail)}/>}
      {shareAct&&<ShareModal act={shareAct} onClose={()=>setShareAct(null)}/>}
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
              {stravaSync.loading&&<span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:".6rem",color:"var(--tx2)",padding:"2px 8px",borderRadius:20,background:"var(--s2)"}}>
                <span style={{width:6,height:6,borderRadius:"50%",border:"1.5px solid var(--tx3)",borderTopColor:"var(--or)",animation:"spin 1s linear infinite",display:"inline-block"}}/>
                Syncing
              </span>}
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
              {tab==="stats"&&<StatsTab acts={acts} analytics={analytics} onViewAll={openAllRuns} onViewMonthly={openMonthly} onOpenPR={setPrDetail}/>}
              {tab==="hr"&&<HRTab acts={acts} hrProfile={hrProfile} onEditHR={openSettings}/>}
              {tab==="tasks"&&<TasksTab tasks={tasks} setTasks={setTasks} hrProfile={hrProfile}/>}
              {tab==="awards"&&<AchievementsTab earnedBadges={earnedBadges} acts={acts} analytics={analytics}
                tierProgress={tierProgress}
                newTierIds={newTiers}
                onClearNewTiers={()=>{const s={};tierProgress.forEach(tp=>{s[tp.id]=tp.earnedCount;});setSeenTiers(s);saveSeenTiers(s);}}
              />}
            </div>
          )}
        </div>
        {!showUpload&&(
          <div className="glass" style={{position:"sticky",bottom:0,borderTop:"1px solid var(--bd)",display:"flex",paddingBottom:"env(safe-area-inset-bottom,0)"}}>
            {TABS.map(t=>(
              <button key={t.id} className={"tab-btn "+(tab===t.id?"on":"")} onClick={()=>setTabPersist(t.id)} style={{position:"relative"}}>
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
