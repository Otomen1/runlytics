// ═══════════════════════════════════════════════════════════════════
//  RUNLYTICS v8  —  GPX Running Coach Platform
//  100% offline · No external services · Pure GPX analytics
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";

// ─────────────────────────────────────────────────────────────────
// §A  GPX PARSER ENGINE
// ─────────────────────────────────────────────────────────────────
function parseGPX(xmlText, fileName, hrProfile = null) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid GPX file");

  const nameEl = doc.querySelector("trk > name") || doc.querySelector("name");
  const typeEl = doc.querySelector("trk > type") || doc.querySelector("type");
  const rawName = nameEl?.textContent?.trim() || fileName.replace(/\.gpx$/i,"");
  const rawType = (typeEl?.textContent?.trim()||"running").toLowerCase();
  const typeMap = { running:"Run",run:"Run",9:"Run",cycling:"Ride",biking:"Ride",ride:"Ride",1:"Ride",walking:"Walk",walk:"Walk",swimming:"Swim",hiking:"Hike" };
  const actType = typeMap[rawType] || typeMap[rawType.split(" ")[0]] || "Run";

  // Parse all trackpoints
  let pts = Array.from(doc.querySelectorAll("trkpt")).map(p => ({
    lat: parseFloat(p.getAttribute("lat")),
    lon: parseFloat(p.getAttribute("lon")),
    ele: parseFloat(p.querySelector("ele")?.textContent || "0") || 0,
    time: p.querySelector("time")?.textContent || null,
    hr:  parseInt(p.querySelector("extensions hr, TrackPointExtension hr, heartrate")?.textContent||"0")||null,
    cad: parseInt(p.querySelector("extensions cad, cadence, TrackPointExtension cad")?.textContent||"0")||null,
  })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));

  if (pts.length < 2) throw new Error("Not enough GPS points");

  // Deduplicate: remove consecutive identical lat/lon
  pts = pts.filter((p,i) => i===0 || p.lat!==pts[i-1].lat || p.lon!==pts[i-1].lon);

  // Haversine distance in metres
  const hav = (a,b) => {
    const R=6371000, dL=(b.lat-a.lat)*Math.PI/180, dl=(b.lon-a.lon)*Math.PI/180;
    const x=Math.sin(dL/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dl/2)**2;
    return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
  };

  // ── Elevation smoothing (Gaussian 5-point kernel, removes GPS noise) ──
  // Only smooth if we have real ele data (not all zeros)
  const hasEle = pts.some(p=>p.ele>0);
  if (hasEle) {
    const kernel=[0.1,0.2,0.4,0.2,0.1]; // Gaussian weights sum=1
    const raw=pts.map(p=>p.ele);
    for (let i=2;i<pts.length-2;i++) {
      pts[i].ele=kernel.reduce((s,w,k)=>s+w*raw[i-2+k],0);
    }
  }

  // Build segments
  let totalDist=0, elevGain=0, elevLoss=0;
  const ELEV_NOISE=3; // ignore changes < 3m (GPS noise threshold)
  let pendingElev=0;  // accumulate small changes until threshold crossed
  const segs=[];
  for (let i=1;i<pts.length;i++) {
    const dist = hav(pts[i-1],pts[i]);
    const dt   = pts[i].time&&pts[i-1].time ? (new Date(pts[i].time)-new Date(pts[i-1].time))/1000 : 0;

    // Noise-filtered elevation: accumulate pending, only commit when ≥ 3m
    pendingElev += pts[i].ele - pts[i-1].ele;
    if (Math.abs(pendingElev) >= ELEV_NOISE) {
      if (pendingElev>0) elevGain+=pendingElev;
      else               elevLoss+=Math.abs(pendingElev);
      pendingElev=0;
    }

    totalDist+=dist;
    const speed = (dt>0&&dt<300) ? dist/dt : 0;
    segs.push({ dist, totalDist, dt, ele:pts[i].ele, speed, hr:pts[i].hr });
  }

  // Moving time: exclude pauses (dt>60s with near-zero movement)
  const movingSegs = segs.filter(s=>s.dt>0&&s.dt<120||s.speed>0.5);
  const movingTime = movingSegs.reduce((a,s)=>a+s.dt,0);
  const totalTime  = segs.reduce((a,s)=>a+s.dt,0);

  // KM splits
  const kmSplits=[];
  let bDist=0,bTime=0,bHR=[],km=1;
  for (const s of segs) {
    bDist+=s.dist; if(s.dt>0&&s.dt<120)bTime+=s.dt; if(s.hr)bHR.push(s.hr);
    if(bDist>=1000){ kmSplits.push({km,pace:bTime/(bDist/1000),hr:bHR.length?Math.round(bHR.reduce((a,b)=>a+b)/bHR.length):null}); km++;bDist=0;bTime=0;bHR=[]; }
  }

  // Elevation profile (max 100 points)
  const step=Math.max(1,Math.floor(segs.length/100));
  const elevProfile=segs.filter((_,i)=>i%step===0).map((s,i)=>({km:parseFloat((s.totalDist/1000).toFixed(2)),ele:Math.round(s.ele)}));

  // Speed chart for activity detail
  const speedStep=Math.max(1,Math.floor(segs.length/60));
  const speedChart=segs.filter((_,i)=>i%speedStep===0&&segs[i].speed>0).map(s=>({km:parseFloat((s.totalDist/1000).toFixed(2)),pace:s.speed>0?parseFloat((1000/s.speed/60).toFixed(2)):null})).filter(p=>p.pace&&p.pace<20);

  // HR stats
  const hrVals=segs.map(s=>s.hr).filter(Boolean);
  const avgHR=hrVals.length?Math.round(hrVals.reduce((a,b)=>a+b)/hrVals.length):null;
  const actMaxHR=hrVals.length?Math.max(...hrVals):null;

  // Determine maxHR to use for zone calculation:
  // Priority: user manual override → user age formula → activity detected max
  const userMaxHR = getMaxHR(hrProfile, actMaxHR);

  // Compact HR samples: store {hr, sec} pairs for every segment with HR data
  // (max 300 samples — enough to recompute zones with any future maxHR)
  const hrSampleStep = Math.max(1, Math.floor(segs.length / 300));
  const hrSamples = segs
    .filter((_,i) => i % hrSampleStep === 0)
    .filter(s => s.hr && s.dt > 0 && s.dt < 120)
    .map(s => ({ hr: s.hr, sec: s.dt }));

  // Compute zones using user profile maxHR (or activity max as fallback)
  const hrZones = hrSamples.length > 0
    ? computeZones(hrSamples, userMaxHR)
    : null;

  // Also expose the maxHR that was actually used — shown in UI for transparency
  const maxHR = actMaxHR;
  const hrMaxUsed = userMaxHR;

  // Split analysis — negative/positive split + consistency score
  const splitInsight = kmSplits.length >= 2 ? (() => {
    const firstHalf = kmSplits.slice(0, Math.floor(kmSplits.length/2));
    const secondHalf= kmSplits.slice(Math.floor(kmSplits.length/2));
    const avgFirst  = firstHalf.reduce((s,k)=>s+k.pace,0)/firstHalf.length;
    const avgSecond = secondHalf.reduce((s,k)=>s+k.pace,0)/secondHalf.length;
    const splitType = avgSecond < avgFirst ? "negative" : avgSecond > avgFirst*1.03 ? "positive" : "even";
    // Consistency: std deviation of paces relative to mean
    const avgP=kmSplits.reduce((s,k)=>s+k.pace,0)/kmSplits.length;
    const variance=kmSplits.reduce((s,k)=>s+Math.pow(k.pace-avgP,2),0)/kmSplits.length;
    const stdDev=Math.sqrt(variance);
    const cv=stdDev/avgP; // coefficient of variation
    const consistencyScore=Math.max(0,Math.round(100-cv*500));
    return { splitType, firstAvg:avgFirst, secondAvg:avgSecond, consistencyScore };
  })() : null;

  // Cadence
  const cadVals=pts.map(p=>p.cad).filter(Boolean);
  const avgCad=cadVals.length?Math.round(cadVals.reduce((a,b)=>a+b)/cadVals.length):null;

  // Best efforts
  const BE={};
  for (const [n,tgt] of Object.entries({"1km":1000,"5km":5000,"10km":10000,"HM":21097,"Marathon":42195})) {
    if(totalDist<tgt*.95)continue;
    let best=null,lo=0,cd=0;
    for(let hi=0;hi<segs.length;hi++){cd+=segs[hi].dist;while(cd-segs[lo].dist>tgt&&lo<hi){cd-=segs[lo].dist;lo++;}if(Math.abs(cd-tgt)<tgt*.05){const t=segs.slice(lo,hi+1).filter(s=>s.dt<120).reduce((a,s)=>a+s.dt,0);if(!best||t<best)best=t;}}
    if(best)BE[n]=best;
  }

  // GPS route (subsample to max 300 points for rendering)
  const routeStep=Math.max(1,Math.floor(pts.length/300));
  const route=pts.filter((_,i)=>i%routeStep===0||i===pts.length-1).map(p=>({lat:p.lat,lon:p.lon}));

  // Date/time
  const firstPt=pts.find(p=>p.time);
  const startUTC=firstPt?.time?new Date(firstPt.time):null;
  const lastPt=[...pts].reverse().find(p=>p.time);
  const endUTC=lastPt?.time?new Date(lastPt.time):null;

  // Run classification
  const avgPaceSec=movingTime>0&&totalDist>0?movingTime/(totalDist/1000):0;
  let runClass="Easy";
  if(totalDist>=16000)runClass="Long Run";
  else if(avgPaceSec<330)runClass="Race/Interval";
  else if(avgPaceSec<360)runClass="Tempo";
  else if(avgPaceSec<420)runClass="Moderate";

  // ── Training Load Score (0–100) ──────────────────────────────────
  // Formula: Duration(min) × (avgHR / estimatedMaxHR)
  // If no HR data, estimate from pace effort (slower = less load)
  const estimatedMaxHR = maxHR ? maxHR * (1/0.95) : 190; // assume avg HR is ~95% of max during run
  const durationMin = movingTime / 60;
  let trainingLoad = 0;
  if (avgHR && durationMin > 0) {
    const hrRatio = avgHR / estimatedMaxHR;
    // Raw load = duration × HR ratio, scaled to typical range
    trainingLoad = Math.min(100, Math.round(durationMin * hrRatio * 1.2));
  } else if (durationMin > 0) {
    // No HR: estimate from pace (faster relative pace = higher load)
    const paceEffort = avgPaceSec > 0 ? Math.max(0, Math.min(1, (600 - avgPaceSec) / 300)) : 0.5;
    trainingLoad = Math.min(100, Math.round(durationMin * 0.6 * (0.5 + paceEffort)));
  }
  const loadLabel = trainingLoad <= 40 ? "Easy" : trainingLoad <= 70 ? "Moderate" : "Hard";
  const loadColor = trainingLoad <= 40 ? "#22c55e" : trainingLoad <= 70 ? "#f97316" : "#ef4444";

  return {
    id:`gpx_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    name:rawName, type:actType, runClass,
    date:startUTC?startUTC.toISOString():new Date().toISOString(),
    dateTs:startUTC?startUTC.getTime():Date.now(),
    startTimeLocal:startUTC?startUTC.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}):null,
    endTimeLocal:endUTC?endUTC.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}):null,
    startDateLocal:startUTC?startUTC.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}):null,
    hasTimestamps:!!startUTC,
    distanceM:totalDist, distanceKm:parseFloat((totalDist/1000).toFixed(2)),
    movingTimeSec:movingTime, totalTimeSec:totalTime,
    avgPaceSecKm:avgPaceSec, avgSpeedKmh:totalDist/movingTime*3.6,
    elevGainM:Math.round(elevGain), elevLossM:Math.round(elevLoss),
    avgHR, maxHR, avgCad,
    hrSamples,   // compact HR series — lets zones be recomputed with any maxHR later
    hrMaxUsed,   // the maxHR actually used for zone calculation (from user profile or activity)
    trainingLoad, loadLabel, loadColor,
    pointCount:pts.length,
    kmSplits, splitInsight, elevProfile, speedChart, hrZones, bestEfforts:BE,
    route,
    bounds:{minLat:Math.min(...pts.map(p=>p.lat)),maxLat:Math.max(...pts.map(p=>p.lat)),minLon:Math.min(...pts.map(p=>p.lon)),maxLon:Math.max(...pts.map(p=>p.lon))},
    parsedAt:Date.now(),
  };
}

// ─────────────────────────────────────────────────────────────────
// §B  ANALYTICS ENGINE
// ─────────────────────────────────────────────────────────────────
function buildAnalytics(acts) {
  const runs = acts.filter(a=>a.type==="Run"||a.type==="Hike"||a.type==="Walk");
  if(!runs.length) return { insights:[], weekly:[], monthly:[], streak:0, prediction:null, consistency:0, weeklyLoad:[] };

  const sorted = [...runs].sort((a,b)=>a.dateTs-b.dateTs);

  // Week/month helpers
  const weekOf  = ts => { const d=new Date(ts); d.setHours(0,0,0,0); d.setDate(d.getDate()-((d.getDay()+6)%7)); return d.getTime(); };
  const monthOf = ts => { const d=new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };

  // Weekly buckets (km + training load)
  const weekMap = {};
  sorted.forEach(r=>{
    const w=weekOf(r.dateTs);
    if(!weekMap[w]) weekMap[w]={km:0,load:0,runs:[],days:new Set()};
    weekMap[w].km   += r.distanceKm;
    weekMap[w].load += r.trainingLoad||0;
    weekMap[w].runs.push(r);
    weekMap[w].days.add(new Date(r.dateTs).toDateString());
  });

  const now=Date.now();
  const weekly=Array.from({length:12},(_,i)=>{
    const wStart=weekOf(now-(11-i)*7*86400000);
    const d=new Date(wStart);
    const w=weekMap[wStart]||{km:0,load:0,runs:[],days:new Set()};
    return { wStart, label:`${d.getDate()}/${d.getMonth()+1}`, km:parseFloat(w.km.toFixed(1)), load:w.load, count:w.runs.length, days:w.days.size, runs:w.runs };
  });

  // Monthly buckets
  const monthMap={};
  sorted.forEach(r=>{ const m=monthOf(r.dateTs); if(!monthMap[m])monthMap[m]={km:0,runs:[],paces:[]}; monthMap[m].km+=r.distanceKm; monthMap[m].runs.push(r); if(r.avgPaceSecKm)monthMap[m].paces.push(r.avgPaceSecKm); });
  const monthKeys=[...new Set(sorted.map(r=>monthOf(r.dateTs)))].sort().slice(-6);
  const monthly=monthKeys.map((m,i)=>{
    const mo=monthMap[m], prev=monthKeys[i-1]?monthMap[monthKeys[i-1]]:null;
    const avgPace=mo.paces.length?mo.paces.reduce((a,b)=>a+b)/mo.paces.length:0;
    const prevPace=prev?.paces.length?prev.paces.reduce((a,b)=>a+b)/prev.paces.length:0;
    return { month:m, km:parseFloat(mo.km.toFixed(1)), count:mo.runs.length,
      longest:Math.max(...mo.runs.map(r=>r.distanceKm)), avgPace,
      kmDelta:prev?parseFloat(((mo.km-prev.km)/prev.km*100).toFixed(1)):null,
      paceDelta:prevPace&&avgPace?parseFloat(((prevPace-avgPace)/prevPace*100).toFixed(1)):null };
  });

  // Streak
  const runDays=new Set(sorted.map(r=>new Date(r.dateTs).toDateString()));
  let streak=0;
  const today=new Date(); today.setHours(0,0,0,0);
  for(let i=0;i<365;i++){const d=new Date(today);d.setDate(today.getDate()-i);if(runDays.has(d.toDateString()))streak++;else if(i>0)break;}

  // Consistency score (% of last 8 weeks with at least 1 run)
  const recentWeeks=weekly.slice(-8);
  const consistency=Math.round(recentWeeks.filter(w=>w.count>0).length/8*100);

  // ── Performance Prediction (corrected Riegel formula) ────────────
  // Riegel: T2 = T1 × (D2/D1)^1.06  where T is time in seconds
  const recentRuns=sorted.filter(r=>r.avgPaceSecKm>0&&r.distanceKm>=2).slice(-8);
  let prediction=null;
  if(recentRuns.length>=2){
    // Weight recent runs more heavily
    const weights=recentRuns.map((_,i)=>i+1);
    const totalW=weights.reduce((a,b)=>a+b,0);
    const weightedPace=recentRuns.reduce((s,r,i)=>s+r.avgPaceSecKm*weights[i],0)/totalW;
    const consistency8w=consistency/100;
    // Adjust prediction: low consistency = slower predicted time (+3% per 25% missing)
    const consFactor=1+(1-consistency8w)*0.12;

    const fmt=s=>{ const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=Math.round(s%60); return h?`${h}:${m.toString().padStart(2,"0")}:${ss.toString().padStart(2,"0")}`:`${m}:${ss.toString().padStart(2,"0")}`; };
    // Base: use weighted avg pace as reference for shortest distance run
    const baseRef=recentRuns[recentRuns.length-1]; // most recent run
    const baseT=baseRef.avgPaceSecKm*baseRef.distanceKm; // total seconds
    const baseD=baseRef.distanceKm;
    const p5k =baseT*Math.pow(5/baseD,1.06)*consFactor;
    const p10k=baseT*Math.pow(10/baseD,1.06)*consFactor;
    const pHM =baseT*Math.pow(21.1/baseD,1.06)*consFactor;
    prediction={ "5K":fmt(p5k),"10K":fmt(p10k),"Half Marathon":fmt(pHM),"Avg Pace":`${fmtPace(weightedPace)}/km` };
  }

  // ── Structured Coaching Insights ─────────────────────────────────
  // Each insight: { icon, type, title, signal, risk, recommendation }
  const insights=[];
  const thisW=weekly[11], prevW=weekly[10];

  // 1. Training load change
  if(thisW.load>0&&prevW.load>0){
    const loadDelta=((thisW.load-prevW.load)/prevW.load*100);
    if(loadDelta>40){
      insights.push({icon:"⚠️",type:"danger",title:"High Training Load Spike",
        signal:`Training load jumped ${Math.round(loadDelta)}% this week (${prevW.load}→${thisW.load} pts)`,
        risk:"High",
        recommendation:`Take an easy day. Cap next run to 60–70% of usual intensity.`});
    } else if(loadDelta>15){
      insights.push({icon:"📊",type:"warning",title:"Load Increasing",
        signal:`Training load up ${Math.round(loadDelta)}% vs last week`,
        risk:"Medium",
        recommendation:"Monitor fatigue. Add a rest day mid-week if legs feel heavy."});
    } else if(loadDelta<-30&&prevW.load>20){
      insights.push({icon:"💤",type:"info",title:"Load Drop — Good Recovery",
        signal:`Training load decreased ${Math.round(Math.abs(loadDelta))}% — planned or unplanned?`,
        risk:"Low",
        recommendation:"If intentional: great taper. If not: aim for consistent weekly load."});
    }
  }

  // 2. Mileage spike (10% rule)
  if(thisW.km>0&&prevW.km>0){
    const spike=(thisW.km-prevW.km)/prevW.km*100;
    const safeMax=parseFloat((prevW.km*1.1).toFixed(1));
    if(spike>30){
      insights.push({icon:"🚨",type:"danger",title:"Mileage Spike — Injury Risk",
        signal:`Volume jumped ${Math.round(spike)}% (${prevW.km}→${thisW.km} km)`,
        risk:"High",
        recommendation:`Limit next week to ≤${safeMax} km. The 10% rule is a hard ceiling for safe progression.`});
    } else if(spike>10){
      insights.push({icon:"📈",type:"info",title:"Mileage Increasing",
        signal:`Volume up ${Math.round(spike)}% this week (${thisW.km} km vs ${prevW.km} km)`,
        risk:"Low",
        recommendation:"Good progression. Maintain this level for 2–3 weeks before increasing again."});
    }
  }

  // 3. Pace trend (last 4 vs prior 4 runs)
  if(sorted.length>=4){
    const recent=sorted.slice(-4).filter(r=>r.avgPaceSecKm>0);
    const older =sorted.slice(-8,-4).filter(r=>r.avgPaceSecKm>0);
    if(recent.length&&older.length){
      const rp=recent.reduce((s,r)=>s+r.avgPaceSecKm,0)/recent.length;
      const op=older.reduce((s,r) =>s+r.avgPaceSecKm,0)/older.length;
      const pct=Math.round((op-rp)/op*100);
      if(pct>=5){
        insights.push({icon:"📈",type:"positive",title:"Pace Improving",
          signal:`Avg pace improved by ${pct}% over last 4 runs (${fmtPace(op)} → ${fmtPace(rp)}/km)`,
          risk:"Low",
          recommendation:"Keep building aerobic base with 80% easy runs. Add one quality session per week."});
      } else if(pct<=-5){
        insights.push({icon:"📉",type:"warning",title:"Pace Declining",
          signal:`Pace slowed by ${Math.abs(pct)}% over last 4 runs`,
          risk:"Medium",
          recommendation:"Add a full rest day this week. Check sleep quality and nutrition before next run."});
      }
    }
  }

  // 4. Fatigue signal (3 runs with progressively slower pace)
  const last3=sorted.slice(-3).filter(r=>r.avgPaceSecKm>0);
  if(last3.length===3&&last3[2].avgPaceSecKm>last3[0].avgPaceSecKm*1.06){
    insights.push({icon:"😴",type:"warning",title:"Cumulative Fatigue Signal",
      signal:`Each of your last 3 runs was slower than the previous despite similar distances`,
      risk:"Medium",
      recommendation:"Full rest day tomorrow. Consider 2 days easy before your next quality session."});
  }

  // 5. HR zone analysis (overtraining / under-aerobic)
  const lastHR=sorted.filter(r=>r.hrZones).slice(-3);
  if(lastHR.length){
    const avgZ5=lastHR.reduce((s,r)=>s+(r.hrZones[4]?.pct||0),0)/lastHR.length;
    const avgZ2=lastHR.reduce((s,r)=>s+(r.hrZones[1]?.pct||0),0)/lastHR.length;
    if(avgZ5>20){
      insights.push({icon:"❤️",type:"danger",title:"Running Too Hard",
        signal:`${Math.round(avgZ5)}% of recent runs in Z5 (Max effort) — well above safe limits`,
        risk:"High",
        recommendation:"Next 2 runs should be Z1–Z2 only. Slow down until HR drops below 75% of max."});
    } else if(avgZ2<20&&sorted.length>=4){
      insights.push({icon:"💚",type:"info",title:"Build Your Aerobic Base",
        signal:`Only ${Math.round(avgZ2)}% of time in Z2 (aerobic development zone)`,
        risk:"Low",
        recommendation:"80% of your runs should be easy (Z2). Slow down — you'll get faster long-term."});
    }
  }

  // 6. Consistency
  const weekCount=recentWeeks.filter(w=>w.count>0).length;
  if(consistency>=75){
    insights.push({icon:"🔥",type:"positive",title:"Excellent Consistency",
      signal:`Active in ${weekCount}/8 recent weeks`,
      risk:"Low",
      recommendation:"Consistency is your biggest asset. Protect it — don't skip runs for minor discomfort."});
  } else if(consistency<38){
    insights.push({icon:"💤",type:"warning",title:"Inconsistent Training",
      signal:`Only ran in ${weekCount} of the last 8 weeks`,
      risk:"Medium",
      recommendation:"Aim for 3 runs per week minimum. Short easy runs still build fitness — don't skip for time reasons."});
  }

  // 7. PR detection
  const paceRuns=sorted.filter(r=>r.avgPaceSecKm>0&&r.distanceKm>=5);
  if(paceRuns.length>=2){
    const best=paceRuns.reduce((b,r)=>r.avgPaceSecKm<b.avgPaceSecKm?r:b);
    if(best===paceRuns[paceRuns.length-1]){
      insights.push({icon:"🏆",type:"positive",title:"New Pace Record!",
        signal:`Latest run is your fastest ever: ${fmtPace(best.avgPaceSecKm)}/km`,
        risk:"Low",
        recommendation:"Great form! Recovery is now critical — take an easy day before your next hard effort."});
    }
  }

  if(!insights.length) insights.push({icon:"👟",type:"info",title:"Keep Building",
    signal:"Not enough data yet to detect trends",
    risk:"Low",
    recommendation:"Upload 3–5 more runs to unlock personalised coaching insights."});

  return { insights, weekly, monthly, streak, prediction, consistency, runDays };
}

// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// §C  STORAGE  —  Versioned, migration-safe, corruption-resistant
// ─────────────────────────────────────────────────────────────────

// ── Stable keys — NEVER change these after first deployment ──────
const STORAGE_KEY = "runlytics_data_v1";   // main activities store
const GOALS_KEY   = "runlytics_goals_v1";  // goals store (separate)
const SCHEMA_VER  = "1.0";                 // bump only when adding migrations below

// ── Legacy keys that may exist from older builds ─────────────────
const LEGACY_KEYS = ["runlytics_v8", "runlytics_activities_v2", "runlytics_v7"];

// ── Activity field defaults (used during migration) ──────────────
const ACTIVITY_DEFAULTS = {
  id:             null,
  name:           "Unnamed Run",
  type:           "Run",
  runClass:       "Easy",
  date:           new Date().toISOString(),
  dateTs:         Date.now(),
  startTimeLocal: null,
  endTimeLocal:   null,
  startDateLocal: null,
  hasTimestamps:  false,
  distanceM:      0,
  distanceKm:     0,
  movingTimeSec:  0,
  totalTimeSec:   0,
  avgPaceSecKm:   null,
  avgSpeedKmh:    0,
  elevGainM:      0,
  elevLossM:      0,
  avgHR:          null,
  maxHR:          null,
  avgCad:         null,
  hrSamples:      [],    // compact HR series for zone recomputation
  hrMaxUsed:      null,  // maxHR used when zones were calculated
  trainingLoad:   0,
  loadLabel:      "Easy",
  loadColor:      "#22c55e",
  pointCount:     0,
  kmSplits:       [],
  splitInsight:   null,
  elevProfile:    [],
  speedChart:     [],
  hrZones:        null,
  bestEfforts:    {},
  route:          [],
  bounds:         null,
  parsedAt:       Date.now(),
};

// ── Migrate a single activity: fill missing fields with defaults ──
function migrateActivity(raw) {
  if (!raw || typeof raw !== "object") return null;
  const migrated = { ...ACTIVITY_DEFAULTS, ...raw };
  // Ensure id always exists
  if (!migrated.id) migrated.id = `migrated_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  // Ensure dateTs is a number
  if (!migrated.dateTs || isNaN(migrated.dateTs)) {
    migrated.dateTs = raw.date ? new Date(raw.date).getTime() : Date.now();
  }
  // distanceKm fallback from distanceM
  if (!migrated.distanceKm && migrated.distanceM) {
    migrated.distanceKm = parseFloat((migrated.distanceM / 1000).toFixed(2));
  }
  // Ensure arrays are arrays
  ["kmSplits","elevProfile","speedChart","route"].forEach(k => {
    if (!Array.isArray(migrated[k])) migrated[k] = [];
  });
  return migrated;
}

// ── Migrate a raw array of activities (legacy format) ────────────
function migrateOldData(oldArray) {
  if (!Array.isArray(oldArray)) return [];
  console.warn("[Runlytics] Migrating legacy data:", oldArray.length, "activities");
  return oldArray.map(migrateActivity).filter(Boolean);
}

// ── Load activities with full migration pipeline ──────────────────
function loadActs() {
  try {
    // 1. Try current versioned key
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);

      // Versioned format: { version, data: [...] }
      if (parsed && parsed.version && Array.isArray(parsed.data)) {
        // Future migrations go here:
        // if (parsed.version === "1.0") return migrate_1_0_to_1_1(parsed.data)
        return parsed.data.map(migrateActivity).filter(Boolean);
      }

      // Old format: bare array stored under the new key
      if (Array.isArray(parsed)) {
        const migrated = migrateOldData(parsed);
        saveActs(migrated); // re-save in versioned format
        return migrated;
      }
    }

    // 2. Nothing at current key — check all legacy keys
    for (const legacyKey of LEGACY_KEYS) {
      const legacyRaw = localStorage.getItem(legacyKey);
      if (!legacyRaw) continue;
      try {
        const legacyParsed = JSON.parse(legacyRaw);
        const source = Array.isArray(legacyParsed) ? legacyParsed
          : (legacyParsed?.data && Array.isArray(legacyParsed.data)) ? legacyParsed.data
          : null;
        if (source && source.length > 0) {
          console.warn(`[Runlytics] Found legacy data at "${legacyKey}" (${source.length} activities) — migrating…`);
          const migrated = migrateOldData(source);
          saveActs(migrated); // save under new stable key
          return migrated;
        }
      } catch { /* skip corrupted legacy key */ }
    }

    return []; // fresh start — no data anywhere
  } catch (e) {
    console.error("[Runlytics] Failed to load activities — data may be corrupted:", e);
    console.warn("[Runlytics] Starting with empty activity list to prevent crash");
    return [];
  }
}

// ── Save activities — always writes versioned wrapper ─────────────
function saveActs(activities) {
  try {
    if (!Array.isArray(activities)) {
      console.error("[Runlytics] saveActs: expected array, got", typeof activities);
      return;
    }
    const payload = { version: SCHEMA_VER, savedAt: Date.now(), data: activities };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    if (e.name === "QuotaExceededError") {
      console.error("[Runlytics] localStorage full — consider exporting and clearing old data");
    } else {
      console.error("[Runlytics] Failed to save activities:", e);
    }
  }
}

// ── Goals storage ─────────────────────────────────────────────────
const GOALS_DEFAULTS = { weekly: 30, monthly: 120 };

function loadGoals() {
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    if (!raw) return { ...GOALS_DEFAULTS };
    const parsed = JSON.parse(raw);
    // Merge with defaults so new goal fields added later don't break
    return { ...GOALS_DEFAULTS, ...parsed };
  } catch {
    console.warn("[Runlytics] Goals data corrupted — using defaults");
    return { ...GOALS_DEFAULTS };
  }
}

function saveGoals(goals) {
  try {
    localStorage.setItem(GOALS_KEY, JSON.stringify({ ...GOALS_DEFAULTS, ...goals }));
  } catch (e) {
    console.error("[Runlytics] Failed to save goals:", e);
  }
}

// ── HR Profile storage (separate key — never touches activity data) ──
const HR_PROFILE_KEY = "runlytics_hr_profile_v1";
const HR_PROFILE_DEFAULTS = {
  age:        null,   // number, e.g. 30
  restingHR:  null,   // number bpm, optional
  maxHROverride: null,// number bpm — if set, overrides 220-age formula
};

function loadHRProfile() {
  try {
    const raw = localStorage.getItem(HR_PROFILE_KEY);
    if (!raw) return { ...HR_PROFILE_DEFAULTS };
    return { ...HR_PROFILE_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...HR_PROFILE_DEFAULTS };
  }
}

function saveHRProfile(profile) {
  try {
    localStorage.setItem(HR_PROFILE_KEY, JSON.stringify({ ...HR_PROFILE_DEFAULTS, ...profile }));
  } catch (e) {
    console.error("[Runlytics] Failed to save HR profile:", e);
  }
}

// ── Derive maxHR from profile (used at parse-time and display-time) ──
function getMaxHR(hrProfile, activityMaxHR) {
  if (hrProfile?.maxHROverride) return hrProfile.maxHROverride;  // manual override wins
  if (hrProfile?.age)           return 220 - hrProfile.age;       // age formula
  return activityMaxHR || 190;                                     // fallback to GPS-detected max
}

// Zone boundaries: fixed percentages applied to maxHR
const ZONE_DEFS = [
  { zone:"Z1", label:"Easy",      lo:.50, hi:.60, color:"#3b82f6" },
  { zone:"Z2", label:"Aerobic",   lo:.60, hi:.70, color:"#22c55e" },
  { zone:"Z3", label:"Tempo",     lo:.70, hi:.80, color:"#eab308" },
  { zone:"Z4", label:"Threshold", lo:.80, hi:.90, color:"#f97316" },
  { zone:"Z5", label:"Max",       lo:.90, hi:1.01, color:"#ef4444" },
];

// ── Compute HR zones from compact samples + a maxHR value ────────────
// hrSamples: [{hr, sec}]  (stored on each activity parsed after this version)
// Falls back gracefully to stored hrZones for older activities.
function computeZones(hrSamples, maxHR) {
  if (!hrSamples?.length || !maxHR) return null;
  const totalSec = hrSamples.reduce((s, x) => s + x.sec, 0);
  if (!totalSec) return null;
  return ZONE_DEFS.map(z => {
    const lo = z.lo * maxHR, hi = z.hi * maxHR;
    let zoneSec = 0;
    hrSamples.forEach(x => { if (x.hr >= lo && x.hr < hi) zoneSec += x.sec; });
    const pct = Math.round(zoneSec / totalSec * 100);
    const minutes = parseFloat((zoneSec / 60).toFixed(1));
    return { ...z, pct, minutes };
  });
}

// ── Export all data as a downloadable JSON backup ─────────────────
function exportBackup(activities, goals) {
  const backup = {
    app:       "Runlytics",
    version:   SCHEMA_VER,
    exportedAt: new Date().toISOString(),
    goals,
    activities,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `runlytics-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Import backup JSON — merges with existing, no duplicates ──────
function importBackup(jsonText, existingActs) {
  const parsed = JSON.parse(jsonText); // let caller catch errors

  // Accept both bare array and our backup envelope
  const incoming = Array.isArray(parsed)          ? parsed
    : Array.isArray(parsed.activities)             ? parsed.activities
    : Array.isArray(parsed.data)                   ? parsed.data
    : null;

  if (!incoming) throw new Error("Unrecognised backup format — expected an array of activities");

  const migrated = migrateOldData(incoming);

  // Merge: keep existing, add any activities whose id doesn't already exist
  const existingIds = new Set(existingActs.map(a => a.id));
  const newOnes     = migrated.filter(a => a.id && !existingIds.has(a.id));
  const merged      = [...existingActs, ...newOnes].sort((a,b) => b.dateTs - a.dateTs);

  return { merged, added: newOnes.length, goals: parsed.goals || null };
}

// ─────────────────────────────────────────────────────────────────
// §D  HELPERS
// ─────────────────────────────────────────────────────────────────
const fmtPace=s=>{ if(!s||s<=0)return"—"; return `${Math.floor(s/60)}:${Math.round(s%60).toString().padStart(2,"0")}`; };
const fmtDur=s=>{ if(!s)return"—"; const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=Math.floor(s%60); return h?`${h}:${m.toString().padStart(2,"0")}:${ss.toString().padStart(2,"0")}`:`${m}:${ss.toString().padStart(2,"0")}`; };
const fmtKm=n=>n!=null?parseFloat(n.toFixed(1)).toString():"—";
const fmtDate=d=>d?new Date(d).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"}):"—";
const fmtDateS=d=>d?new Date(d).toLocaleDateString("en-GB",{day:"numeric",month:"short"}):"—";
const fmtMonth=m=>{ const [y,mo]=m.split("-"); return new Date(+y,+mo-1,1).toLocaleDateString("en-GB",{month:"short",year:"2-digit"}); };
const RUN_COLORS={ Run:"#f97316",Ride:"#3b82f6",Walk:"#22c55e",Swim:"#06b6d4",Hike:"#a855f7" };
const RUN_ICONS={ Run:"🏃",Ride:"🚴",Walk:"🚶",Swim:"🏊",Hike:"🥾" };
const CLASS_COLOR={ "Easy":"#22c55e","Moderate":"#3b82f6","Tempo":"#f97316","Long Run":"#a855f7","Race/Interval":"#ef4444" };
const rc=t=>RUN_COLORS[t]||"#6b7280";

// ─────────────────────────────────────────────────────────────────
// §E  GLOBAL STYLES
// ─────────────────────────────────────────────────────────────────
const Styles=()=>(
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&family=Barlow+Condensed:wght@700;900&display=swap');
    :root{
      --bg:#06080e;--s1:#0b0f18;--s2:#10151f;--s3:#141a27;
      --bd:#1a2235;--bd2:#222d42;
      --or:#f97316;--or2:rgba(249,115,22,.1);--or3:rgba(249,115,22,.06);
      --gn:#22c55e;--gn2:rgba(34,197,94,.1);
      --rd:#ef4444;--rd2:rgba(239,68,68,.08);
      --bl:#3b82f6;--bl2:rgba(59,130,246,.1);
      --pu:#a855f7;--pu2:rgba(168,85,247,.1);
      --cy:#06b6d4;--cy2:rgba(6,182,212,.1);
      --yw:#eab308;--yw2:rgba(234,179,8,.1);
      --tx:#dde6f5;--tx2:#6b7e9a;--tx3:#3a4a62;
      font-family:'Geist',sans-serif;
    }
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:var(--bg);color:var(--tx);-webkit-font-smoothing:antialiased;}
    ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:2px}
    .num{font-family:'Barlow Condensed',sans-serif;}
    .mo{font-family:'Geist Mono',monospace;}
    @keyframes fu{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    @keyframes sk{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes sp{from{transform:rotate(0)}to{transform:rotate(360deg)}}
    @keyframes pp{0%{opacity:0;transform:scale(.94)}100%{opacity:1;transform:scale(1)}}
    @keyframes gw{0%,100%{box-shadow:0 0 0 0 rgba(249,115,22,.25)}50%{box-shadow:0 0 0 8px rgba(249,115,22,0)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
    .f0{animation:fu .26s ease both} .f1{animation:fu .26s .06s ease both} .f2{animation:fu .26s .12s ease both}
    .f3{animation:fu .26s .18s ease both} .f4{animation:fu .26s .24s ease both}
    .pop{animation:pp .2s ease both}
    .card{background:var(--s1);border:1px solid var(--bd);border-radius:18px;}
    .c2{background:var(--s2);border:1px solid var(--bd);border-radius:14px;}
    .c3{background:var(--s3);border:1px solid var(--bd2);border-radius:10px;}
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:none;border-radius:11px;font-family:'Geist',sans-serif;font-weight:600;cursor:pointer;transition:all .14s;white-space:nowrap;}
    .btn:disabled{opacity:.35;cursor:not-allowed;}
    .b-or{background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;box-shadow:0 4px 16px rgba(249,115,22,.2);}
    .b-or:hover:not(:disabled){filter:brightness(1.08);box-shadow:0 6px 24px rgba(249,115,22,.3);}
    .b-or:active:not(:disabled){transform:scale(.97);}
    .b-gh{background:transparent;color:var(--tx2);border:1px solid var(--bd);}
    .b-gh:hover:not(:disabled){color:var(--tx);border-color:var(--bd2);}
    .b-rd{background:var(--rd2);color:var(--rd);border:1px solid rgba(239,68,68,.18);}
    .inp{width:100%;background:var(--s2);border:1.5px solid var(--bd);border-radius:10px;color:var(--tx);font-family:'Geist',sans-serif;font-size:.87rem;padding:11px 14px;outline:none;transition:border-color .2s,box-shadow .2s;}
    .inp:focus{border-color:var(--or);box-shadow:0 0 0 3px rgba(249,115,22,.1);}
    .inp::placeholder{color:var(--tx3);}
    .badge{display:inline-flex;align-items:center;gap:3px;padding:2px 9px;border-radius:20px;font-size:.63rem;font-weight:700;letter-spacing:.04em;}
    .sk{background:linear-gradient(90deg,var(--s2) 25%,var(--s3) 50%,var(--s2) 75%);background-size:200%;animation:sk 1.5s infinite;border-radius:8px;}
    .sp{animation:sp 1s linear infinite;}
    .pill{display:inline-flex;align-items:center;gap:5px;padding:6px 13px;border-radius:20px;border:1.5px solid var(--bd);background:transparent;cursor:pointer;font-size:.75rem;transition:all .14s;user-select:none;font-family:'Geist',sans-serif;}
    .pill.on{background:var(--or3);border-color:var(--or);color:var(--or);font-weight:600;}
    .pill:hover:not(.on){border-color:var(--bd2);}
    .tab{padding:7px 14px;border-radius:9px;border:none;background:transparent;color:var(--tx2);cursor:pointer;font-size:.8rem;transition:all .15s;font-family:'Geist',sans-serif;}
    .tab.on{background:var(--s2);color:var(--tx);font-weight:600;}
    .hov{transition:transform .14s,box-shadow .14s;}
    .hov:hover{transform:translateY(-2px);box-shadow:0 6px 28px rgba(0,0,0,.35);}
    .nsc{overflow-x:auto;scrollbar-width:none;} .nsc::-webkit-scrollbar{display:none;}
    .dz{border:2px dashed var(--bd2);border-radius:18px;transition:all .2s;}
    .dz.ov{border-color:var(--or);background:var(--or3);}
    .pb{height:6px;background:var(--bd);border-radius:3px;overflow:hidden;}
    .pf{height:100%;border-radius:3px;transition:width 1.2s cubic-bezier(.4,0,.2,1);}
    .ring{fill:none;stroke:var(--bd);stroke-width:7;}
    .ring-prog{fill:none;stroke-width:7;stroke-linecap:round;transition:stroke-dashoffset 1.3s cubic-bezier(.4,0,.2,1);}
    input[type=range]{-webkit-appearance:none;height:4px;border-radius:2px;background:var(--bd);outline:none;width:100%;}
    input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--or);cursor:pointer;}
    .ins-positive{background:rgba(34,197,94,.06);border-color:rgba(34,197,94,.2);}
    .ins-warning{background:rgba(234,179,8,.06);border-color:rgba(234,179,8,.2);}
    .ins-danger{background:rgba(239,68,68,.06);border-color:rgba(239,68,68,.2);}
    .ins-info{background:rgba(59,130,246,.06);border-color:rgba(59,130,246,.2);}
    @keyframes ins-open{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
    .ins-body{animation:ins-open .18s ease both;}
    .ins-row{cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;}
    .ins-row:active{opacity:.85;}
  `}</style>
);

// ─────────────────────────────────────────────────────────────────
// §F  PRIMITIVE COMPONENTS
// ─────────────────────────────────────────────────────────────────
const Sk=({h=20,w="100%",r=8})=><div className="sk" style={{height:h,width:w,borderRadius:r}}/>;
const Spin=({s=16,c="var(--or)"})=><div className="sp" style={{width:s,height:s,border:`2px solid var(--bd2)`,borderTopColor:c,borderRadius:"50%",flexShrink:0}}/>;

const CT=({active,payload,label,unit=""})=>{
  if(!active||!payload?.length)return null;
  return <div style={{background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:10,padding:"8px 13px",boxShadow:"0 4px 20px rgba(0,0,0,.4)"}}>
    <div style={{fontSize:".65rem",color:"var(--tx2)",marginBottom:2}}>{label}</div>
    {payload.map((p,i)=><div key={i} className="num" style={{fontSize:"1rem",color:p.color||"var(--or)",fontWeight:700}}>{p.value}{unit}</div>)}
  </div>;
};

const SH=({title,sub,right,badge})=>(
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontWeight:600,fontSize:".96rem"}}>{title}</span>
        {badge}
      </div>
      {sub&&<div style={{fontSize:".72rem",color:"var(--tx2)",marginTop:2}}>{sub}</div>}
    </div>
    {right}
  </div>
);

// Ring progress
const Ring=({pct,color,size=64,label,sub})=>{
  const r=24,C=2*Math.PI*r,off=C*(1-Math.min(pct,1));
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
      <div style={{position:"relative",width:size,height:size}}>
        <svg width={size} height={size} viewBox="0 0 56 56">
          <circle className="ring" cx="28" cy="28" r={r}/>
          <circle className="ring-prog" cx="28" cy="28" r={r} stroke={color}
            strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 28 28)"/>
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:".72rem",fontWeight:700,color}}>{Math.round(pct*100)}%</div>
      </div>
      {label&&<div style={{fontSize:".68rem",fontWeight:600,color:"var(--tx)",textAlign:"center",maxWidth:64,lineHeight:1.2}}>{label}</div>}
      {sub&&<div style={{fontSize:".62rem",color:"var(--tx2)",textAlign:"center"}}>{sub}</div>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// §G  MAP COMPONENT  (SVG route renderer)
// ─────────────────────────────────────────────────────────────────
const RouteMap=({route,kmSplits,height=220})=>{
  if(!route||route.length<2)return(
    <div style={{height,display:"flex",alignItems:"center",justifyContent:"center",background:"var(--s3)",borderRadius:12,color:"var(--tx2)",fontSize:".82rem"}}>
      No GPS route data
    </div>
  );

  const W=400,H=height;
  const lats=route.map(p=>p.lat), lons=route.map(p=>p.lon);
  const minLat=Math.min(...lats),maxLat=Math.max(...lats);
  const minLon=Math.min(...lons),maxLon=Math.max(...lons);
  const pad=20;
  const latR=maxLat-minLat||.001, lonR=maxLon-minLon||.001;
  // Preserve aspect ratio
  const aspect=lonR/latR*(Math.cos((minLat+maxLat)/2*Math.PI/180));
  let vW=W-2*pad, vH=H-2*pad;
  if(aspect>vW/vH){ vH=vW/aspect; } else { vW=vH*aspect; }
  const oX=(W-vW)/2, oY=(H-vH)/2;

  const px=lon=>oX+(lon-minLon)/lonR*vW;
  const py=lat=>oY+(maxLat-lat)/latR*vH;

  // Color segments by pace if splits available
  const pathD=route.map((p,i)=>`${i===0?"M":"L"}${px(p.lon).toFixed(1)},${py(p.lat).toFixed(1)}`).join(" ");

  const start=route[0], end=route[route.length-1];

  return (
    <div style={{background:"#0a1020",borderRadius:12,overflow:"hidden",position:"relative"}}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:"block"}}>
        {/* Grid lines */}
        {[.25,.5,.75].map(t=>(
          <g key={t} opacity={.12}>
            <line x1={0} y1={H*t} x2={W} y2={H*t} stroke="#fff" strokeWidth={.5}/>
            <line x1={W*t} y1={0} x2={W*t} y2={H} stroke="#fff" strokeWidth={.5}/>
          </g>
        ))}
        {/* Route shadow */}
        <path d={pathD} fill="none" stroke="rgba(249,115,22,.15)" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round"/>
        {/* Route */}
        <path d={pathD} fill="none" stroke="#f97316" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"/>
        {/* Start marker */}
        <circle cx={px(start.lon)} cy={py(start.lat)} r={7} fill="#22c55e" stroke="#0a1020" strokeWidth={2}/>
        <text x={px(start.lon)+10} y={py(start.lat)+4} fill="#22c55e" fontSize={9} fontFamily="Geist,sans-serif" fontWeight={600}>START</text>
        {/* End marker */}
        <circle cx={px(end.lon)} cy={py(end.lat)} r={7} fill="#ef4444" stroke="#0a1020" strokeWidth={2}/>
        <text x={px(end.lon)+10} y={py(end.lat)+4} fill="#ef4444" fontSize={9} fontFamily="Geist,sans-serif" fontWeight={600}>END</text>
      </svg>
      <div style={{position:"absolute",bottom:8,left:10,fontSize:".64rem",color:"rgba(255,255,255,.35)",fontFamily:"Geist Mono,monospace"}}>
        {route.length} GPS points · {(Math.abs(maxLat-minLat)*111).toFixed(2)}km N–S
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// §H  ACTIVITY DETAIL
// ─────────────────────────────────────────────────────────────────
const Detail=({act,allActs,onClose,onDelete,hrProfile})=>{
  const [tab,setTab]=useState("overview");
  const color=rc(act.type);
  const classColor=CLASS_COLOR[act.runClass]||"#6b7280";

  // Recompute HR zones live using user profile maxHR (if hrSamples stored)
  // Falls back to stored hrZones for older activities without hrSamples
  const userMaxHR  = getMaxHR(hrProfile, act.maxHR);
  const liveZones  = act.hrSamples?.length
    ? computeZones(act.hrSamples, userMaxHR)
    : null;
  const displayZones = liveZones || act.hrZones;  // live recomputed > stored

  // Zone computation source label shown in UI
  const zonesSource = liveZones
    ? (hrProfile?.maxHROverride
        ? `Custom max HR: ${userMaxHR} bpm`
        : hrProfile?.age
          ? `Age-based max HR: ${userMaxHR} bpm (220 − ${hrProfile.age})`
          : `Activity max HR: ${userMaxHR} bpm`)
    : "Stored (re-upload to apply profile)";

  // Is this a personal best pace?
  const allPaces=allActs.filter(a=>a.avgPaceSecKm>0&&a.distanceKm>=5).map(a=>a.avgPaceSecKm);
  const isPBpace=allPaces.length>1&&act.avgPaceSecKm===Math.min(...allPaces);
  const isLongest=allActs.length>1&&act.distanceKm===Math.max(...allActs.map(a=>a.distanceKm));

  const TABS=["overview","map","pace","elevation","heartrate","splits"];

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(6,8,14,.98)",zIndex:200,display:"flex",flexDirection:"column",overflowY:"auto"}}>
      {/* Sticky header */}
      <div style={{padding:"14px 18px",borderBottom:"1px solid var(--bd)",background:"rgba(6,8,14,.95)",backdropFilter:"blur(12px)",position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{flex:1,minWidth:0,paddingRight:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
              <span style={{fontSize:"1.3rem"}}>{RUN_ICONS[act.type]||"⚡"}</span>
              <span style={{fontWeight:700,fontSize:".98rem"}}>{act.name}</span>
              <span className="badge" style={{background:`${classColor}18`,color:classColor}}>{act.runClass}</span>
              {isPBpace&&<span className="badge" style={{background:"rgba(234,179,8,.15)",color:"#eab308"}}>⚡ Best Pace</span>}
              {isLongest&&<span className="badge" style={{background:"rgba(168,85,247,.15)",color:"#a855f7"}}>🏆 Longest</span>}
            </div>
            <div style={{fontSize:".72rem",color:"var(--tx2)"}}>
              📅 {act.startDateLocal||fmtDate(act.date)}
              {act.startTimeLocal&&<span style={{marginLeft:8}}>🕐 {act.startTimeLocal}{act.endTimeLocal?` – ${act.endTimeLocal}`:""}</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:7,flexShrink:0}}>
            <button className="btn b-rd" style={{padding:"6px 10px",fontSize:".74rem"}} onClick={()=>confirm("Delete?")&&onDelete(act.id)}>🗑</button>
            <button className="btn b-gh" style={{padding:"6px 12px",fontSize:".8rem"}} onClick={onClose}>✕</button>
          </div>
        </div>
      </div>

      <div style={{padding:"14px 18px 32px",flex:1}}>
        {/* Hero */}
        <div className="card pop" style={{padding:18,marginBottom:14,background:`linear-gradient(135deg,var(--s1),${color}06)`}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14}}>
            {[{l:"Distance",v:`${fmtKm(act.distanceKm)} km`,c:color},{l:"Time",v:fmtDur(act.movingTimeSec),c:"var(--tx)"},{l:"Avg Pace",v:`${fmtPace(act.avgPaceSecKm)}/km`,c:"var(--tx)"}].map(s=>(
              <div key={s.l} style={{textAlign:"center"}}>
                <div className="num" style={{fontSize:"1.8rem",fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</div>
                <div style={{fontSize:".64rem",color:"var(--tx2)",marginTop:3}}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
            {[["⛰️",`${act.elevGainM}m`,"Elev Gain"],["❤️",act.avgHR?`${act.avgHR}`:"-","Avg HR bpm"],["💓",act.maxHR?`${act.maxHR}`:"-","Max HR bpm"],["👟",act.avgCad?`${act.avgCad*2}`:"—","Cadence spm"]].map(([ic,v,l])=>(
              <div key={l} className="c3" style={{padding:"8px 4px",textAlign:"center"}}>
                <div style={{fontSize:".9rem",marginBottom:3}}>{ic}</div>
                <div className="num" style={{fontSize:".95rem",fontWeight:800}}>{v}</div>
                <div style={{fontSize:".58rem",color:"var(--tx2)",marginTop:1}}>{l}</div>
              </div>
            ))}
          </div>
          {/* Training Load bar */}
          {act.trainingLoad>0&&(
            <div style={{marginTop:12,padding:"10px 14px",background:"rgba(0,0,0,.2)",borderRadius:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{fontSize:".74rem",color:"var(--tx2)",fontWeight:600}}>Training Load</div>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <span className="num" style={{fontSize:"1.1rem",fontWeight:800,color:act.loadColor}}>{act.trainingLoad}</span>
                  <span className="badge" style={{background:`${act.loadColor}18`,color:act.loadColor}}>{act.loadLabel}</span>
                </div>
              </div>
              <div className="pb" style={{height:8}}>
                <div className="pf" style={{width:`${act.trainingLoad}%`,background:`linear-gradient(90deg,#22c55e,${act.loadColor})`}}/>
              </div>
              <div style={{fontSize:".64rem",color:"var(--tx3)",marginTop:5}}>
                Based on {act.avgHR?"heart rate":"pace estimate"} × duration · Scale: 0 Easy → 100 Max effort
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:3,background:"var(--s1)",border:"1px solid var(--bd)",borderRadius:12,padding:3,marginBottom:14,overflowX:"auto"}}>
          {TABS.map(t=><button key={t} className={`tab ${tab===t?"on":""}`} style={{flex:1,minWidth:60,padding:"6px 4px",fontSize:".72rem",textTransform:"capitalize"}} onClick={()=>setTab(t)}>{t}</button>)}
        </div>

        {/* OVERVIEW */}
        {tab==="overview"&&(
          <div className="f0">
            {Object.keys(act.bestEfforts||{}).length>0&&(
              <div className="card" style={{padding:16,marginBottom:14}}>
                <SH title="Best Efforts"/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {Object.entries(act.bestEfforts).map(([n,s])=>(
                    <div key={n} className="c3" style={{padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:".8rem",fontWeight:600}}>{n}</span>
                      <span className="num" style={{fontSize:".96rem",color,fontWeight:800}}>{fmtDur(s)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="card" style={{padding:16}}>
              <SH title="All Stats"/>
              {[
                ["📅 Run date",act.startDateLocal||fmtDate(act.date)],
                ["🕐 Start time",act.startTimeLocal||"—"],
                ["🕑 End time",act.endTimeLocal||"—"],
                ["📍 Distance",`${fmtKm(act.distanceKm)} km`],
                ["⏱️ Moving time",fmtDur(act.movingTimeSec)],
                ["⌛ Elapsed time",fmtDur(act.totalTimeSec)],
                ["⚡ Avg pace",`${fmtPace(act.avgPaceSecKm)}/km`],
                ["🚀 Avg speed",`${(act.avgSpeedKmh||0).toFixed(1)} km/h`],
                ["⛰️ Elev gain",`${act.elevGainM} m`],
                ["⬇️ Elev loss",`${act.elevLossM} m`],
                ["❤️ Avg HR",act.avgHR?`${act.avgHR} bpm`:"—"],
                ["💓 Max HR",act.maxHR?`${act.maxHR} bpm`:"—"],
                ["👟 Cadence",act.avgCad?`${act.avgCad*2} spm`:"—"],
                ["📡 GPS points",act.pointCount?.toLocaleString()||"—"],
              ].map(([k,v],i,a)=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<a.length-1?"1px solid var(--bd)":"none"}}>
                  <span style={{fontSize:".8rem",color:"var(--tx2)"}}>{k}</span>
                  <span style={{fontSize:".84rem",fontWeight:600,textAlign:"right",maxWidth:"55%"}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MAP */}
        {tab==="map"&&(
          <div className="f0">
            <div className="card" style={{padding:14,marginBottom:14}}>
              <SH title="GPS Route" sub={`${act.route?.length||0} sampled points`}/>
              <RouteMap route={act.route} kmSplits={act.kmSplits} height={260}/>
            </div>
            <div className="card" style={{padding:14}}>
              <SH title="Bounding Box"/>
              {act.bounds&&[
                ["NW",`${act.bounds.maxLat.toFixed(4)}°N, ${act.bounds.minLon.toFixed(4)}°E`],
                ["SE",`${act.bounds.minLat.toFixed(4)}°N, ${act.bounds.maxLon.toFixed(4)}°E`],
              ].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid var(--bd)"}}>
                  <span style={{fontSize:".78rem",color:"var(--tx2)"}}>{k}</span>
                  <span className="mo" style={{fontSize:".74rem"}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PACE */}
        {tab==="pace"&&(
          <div className="f0">
            {act.speedChart?.length>1?(
              <div className="card" style={{padding:16}}>
                <SH title="Pace over Distance" sub={`Avg: ${fmtPace(act.avgPaceSecKm)}/km · Orange line = average`}/>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={act.speedChart}>
                    <defs>
                      <linearGradient id="pgf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={.15}/>
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" vertical={false}/>
                    <XAxis dataKey="km" tick={{fill:"var(--tx2)",fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>`${v}km`}/>
                    <YAxis domain={["auto","auto"]} tick={{fill:"var(--tx2)",fontSize:9}} axisLine={false} tickLine={false} reversed
                      tickFormatter={v=>`${Math.floor(v)}:${Math.round((v%1)*60).toString().padStart(2,"0")}`}/>
                    <Tooltip content={({active,payload,label})=>{
                      if(!active||!payload?.length)return null;
                      const p=payload[0]?.value;
                      const avg=act.avgPaceSecKm/60;
                      const diff=p-avg;
                      return <div style={{background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:10,padding:"8px 13px"}}>
                        <div style={{fontSize:".66rem",color:"var(--tx2)",marginBottom:2}}>{label}km</div>
                        <div className="num" style={{fontSize:"1rem",color:"var(--or)"}}>{Math.floor(p)}:{Math.round((p%1)*60).toString().padStart(2,"0")} /km</div>
                        <div style={{fontSize:".68rem",marginTop:3,color:diff<0?"var(--gn)":"var(--rd)"}}>
                          {diff<0?`↑ ${Math.abs(diff*60).toFixed(0)}s faster than avg`:`↓ ${(diff*60).toFixed(0)}s slower than avg`}
                        </div>
                      </div>;
                    }}/>
                    {act.avgPaceSecKm&&<ReferenceLine y={parseFloat((act.avgPaceSecKm/60).toFixed(2))} stroke="rgba(249,115,22,.6)" strokeWidth={1.5} strokeDasharray="5 4" label={{value:"avg",position:"insideTopRight",fill:"var(--or)",fontSize:9}}/>}
                    <Area type="monotone" dataKey="pace" stroke="#f97316" strokeWidth={2} fill="url(#pgf)" dot={false}/>
                  </ComposedChart>
                </ResponsiveContainer>
                {/* Faster/slower segment legend */}
                <div style={{display:"flex",gap:14,marginTop:10,justifyContent:"center",fontSize:".68rem",color:"var(--tx2)"}}>
                  <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:10,height:3,background:"var(--gn)",borderRadius:2,display:"inline-block"}}/> Faster than avg</span>
                  <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:10,height:3,background:"var(--rd)",borderRadius:2,display:"inline-block"}}/> Slower than avg</span>
                </div>
              </div>
            ):<div style={{textAlign:"center",padding:"40px 0",color:"var(--tx2)"}}>No pace data available.</div>}
          </div>
        )}

        {/* ELEVATION */}
        {tab==="elevation"&&(
          <div className="f0">
            {act.elevProfile?.length>1?(
              <div className="card" style={{padding:16}}>
                <SH title="Elevation Profile" sub={`+${act.elevGainM}m gain · −${act.elevLossM}m loss`}/>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={act.elevProfile}>
                    <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={.25}/><stop offset="95%" stopColor="#22c55e" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" vertical={false}/>
                    <XAxis dataKey="km" tick={{fill:"var(--tx2)",fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>`${v}km`}/>
                    <YAxis tick={{fill:"var(--tx2)",fontSize:9}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<CT unit="m"/>}/>
                    <Area type="monotone" dataKey="ele" stroke="#22c55e" strokeWidth={2} fill="url(#eg)" dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ):<div style={{textAlign:"center",padding:"40px 0",color:"var(--tx2)"}}>No elevation data in this file.</div>}
          </div>
        )}

        {/* HEART RATE */}
        {tab==="heartrate"&&(
          <div className="f0">
            {act.avgHR?(
              <>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                  {[{l:"Avg HR",v:`${act.avgHR}`,u:"bpm",c:"var(--rd)"},{l:"Max HR",v:`${act.maxHR||"—"}`,u:"bpm",c:"var(--rd)"}].map(s=>(
                    <div key={s.l} className="c2" style={{padding:14,textAlign:"center"}}>
                      <div className="num" style={{fontSize:"2rem",fontWeight:900,color:s.c}}>{s.v}<span style={{fontSize:".76rem",color:"var(--tx2)",fontWeight:400}}>{s.u}</span></div>
                      <div style={{fontSize:".7rem",color:"var(--tx2)",marginTop:4}}>{s.l}</div>
                    </div>
                  ))}
                </div>
                {act.hrZones&&(
                  <div className="card" style={{padding:16,marginBottom:14}}>
                    <SH title="Heart Rate Zones" sub="Time spent per zone"/>
                    {/* Zone overtraining alert */}
                    {act.hrZones[4]?.pct>20&&(
                      <div style={{background:"var(--rd2)",border:"1px solid rgba(239,68,68,.2)",borderRadius:10,padding:"9px 12px",marginBottom:12,fontSize:".76rem",color:"var(--rd)"}}>
                        ⚠️ {act.hrZones[4].pct}% of run in Z5 (Max) — very high intensity. Add recovery runs.
                      </div>
                    )}
                    {act.hrZones[1]?.pct<15&&(
                      <div style={{background:"rgba(34,197,94,.06)",border:"1px solid rgba(34,197,94,.2)",borderRadius:10,padding:"9px 12px",marginBottom:12,fontSize:".76rem",color:"var(--gn)"}}>
                        💚 Low Z2 time ({act.hrZones[1].pct}%) — slow down to build aerobic base.
                      </div>
                    )}
                    {act.hrZones.map((z,i)=>(
                      <div key={z.zone} style={{marginBottom:i<4?10:0}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{width:8,height:8,borderRadius:2,background:z.color}}/>
                            <span style={{fontSize:".8rem",fontWeight:600}}>{z.zone}</span>
                            <span style={{fontSize:".72rem",color:"var(--tx2)"}}>{z.label}</span>
                          </div>
                          <div style={{display:"flex",gap:8,alignItems:"center"}}>
                            <span className="num" style={{fontSize:".82rem",color:"var(--tx2)"}}>{z.minutes}min</span>
                            <span className="num" style={{fontSize:".9rem",color:z.color,fontWeight:700,width:32,textAlign:"right"}}>{z.pct}%</span>
                          </div>
                        </div>
                        <div className="pb"><div className="pf" style={{width:`${z.pct}%`,background:z.color}}/></div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ):<div style={{textAlign:"center",padding:"40px 0",color:"var(--tx2)"}}>
              <div style={{fontSize:"2rem",marginBottom:12}}>💔</div>
              <div style={{fontWeight:600,marginBottom:6}}>No HR data</div>
              <div style={{fontSize:".8rem"}}>Your GPX doesn't include heart rate. Use a GPS watch with HR sensor.</div>
            </div>}
          </div>
        )}

        {/* SPLITS */}
        {tab==="splits"&&(
          <div className="f0">
            <div className="card" style={{padding:16}}>
              <SH title="km Splits" sub={`${act.kmSplits?.length||0} complete km`}/>
              {act.kmSplits?.length?(
                <>
                  {/* Split insight */}
                  {act.splitInsight&&(
                    <div style={{marginBottom:14,padding:"10px 12px",borderRadius:10,
                      background:act.splitInsight.splitType==="negative"?"var(--gn2)":act.splitInsight.splitType==="positive"?"var(--rd2)":"var(--bl2)",
                      border:`1px solid ${act.splitInsight.splitType==="negative"?"rgba(34,197,94,.25)":act.splitInsight.splitType==="positive"?"rgba(239,68,68,.2)":"rgba(59,130,246,.2)"}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <span style={{fontWeight:700,fontSize:".84rem",color:act.splitInsight.splitType==="negative"?"var(--gn)":act.splitInsight.splitType==="positive"?"var(--rd)":"var(--bl)"}}>
                          {act.splitInsight.splitType==="negative"?"⬆️ Negative Split — Excellent pacing!":act.splitInsight.splitType==="positive"?"⬇️ Positive Split — Started too fast":act.splitInsight.splitType==="even"?"〰️ Even Split — Great consistency":null}
                        </span>
                        <span className="num" style={{fontSize:".82rem",color:"var(--tx2)"}}>
                          Consistency: <span style={{color:"var(--tx)",fontWeight:700}}>{act.splitInsight.consistencyScore}/100</span>
                        </span>
                      </div>
                      <div style={{fontSize:".72rem",color:"var(--tx2)"}}>
                        First half avg: {fmtPace(act.splitInsight.firstAvg)}/km · Second half: {fmtPace(act.splitInsight.secondAvg)}/km
                      </div>
                    </div>
                  )}
                  <div style={{display:"grid",gridTemplateColumns:"40px 1fr 1fr 1fr",gap:8,padding:"6px 0",marginBottom:4}}>
                    {["km","Pace","HR","vs Avg"].map(h=><div key={h} style={{fontSize:".63rem",color:"var(--tx3)",fontWeight:700,textTransform:"uppercase"}}>{h}</div>)}
                  </div>
                  {act.kmSplits.map((s,i)=>{
                    const diff=s.pace-act.avgPaceSecKm;
                    return (
                      <div key={i} style={{display:"grid",gridTemplateColumns:"40px 1fr 1fr 1fr",gap:8,padding:"9px 0",borderTop:"1px solid var(--bd)",alignItems:"center"}}>
                        <div className="num" style={{fontWeight:700,color:"var(--tx2)"}}>{s.km}</div>
                        <div className="num" style={{fontWeight:800,fontSize:".96rem",color:rc(act.type)}}>{fmtPace(s.pace)}</div>
                        <div style={{fontSize:".8rem",color:"var(--tx2)"}}>{s.hr?`${s.hr}bpm`:"—"}</div>
                        <span className="badge" style={{background:diff<0?"var(--gn2)":"var(--rd2)",color:diff<0?"var(--gn)":"var(--rd)",width:"fit-content"}}>
                          {diff<0?"↑":"↓"}{fmtPace(Math.abs(diff))}
                        </span>
                      </div>
                    );
                  })}
                  {/* Splits bar chart */}
                  <div style={{marginTop:14}}>
                    <ResponsiveContainer width="100%" height={100}>
                      <BarChart data={act.kmSplits.map(s=>({km:s.km,pace:parseFloat((s.pace/60).toFixed(2))}))} barSize={16}>
                        <XAxis dataKey="km" tick={{fill:"var(--tx2)",fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>`${v}km`}/>
                        <YAxis domain={["auto","auto"]} reversed hide/>
                        <Tooltip content={<CT unit=" min/km"/>}/>
                        {act.avgPaceSecKm&&<ReferenceLine y={parseFloat((act.avgPaceSecKm/60).toFixed(2))} stroke="rgba(249,115,22,.5)" strokeDasharray="3 3"/>}
                        <Bar dataKey="pace" radius={[4,4,0,0]}>
                          {act.kmSplits.map((s,i)=>{
                            const diff=s.pace-act.avgPaceSecKm;
                            return <rect key={i} fill={diff<-5?"#22c55e":diff>5?"#ef4444":"#f97316"}/>;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ):<div style={{textAlign:"center",padding:"24px 0",color:"var(--tx2)",fontSize:".84rem"}}>Activity shorter than 1 km.</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// §I  UPLOAD SCREEN
// ─────────────────────────────────────────────────────────────────
const Upload=({acts,onAdd,onClearAll,hrProfile})=>{
  const [over,setOver]=useState(false);
  const [queue,setQueue]=useState([]); // [{file,status,parsed,error}]
  const [saving,setSaving]=useState(false);
  const ref=useRef(null);

  const process=useCallback(async files=>{
    const gpx=Array.from(files).filter(f=>f.name.toLowerCase().endsWith(".gpx"));
    if(!gpx.length)return;
    const items=gpx.map(f=>({file:f,status:"parsing",parsed:null,error:null}));
    setQueue(items);
    const results=await Promise.all(items.map(async item=>{
      try{
        const text=await item.file.text();
        const parsed=parseGPX(text,item.file.name, hrProfile);
        // Duplicate check
        const isDupe=acts.some(a=>Math.abs(a.dateTs-parsed.dateTs)<60000&&Math.abs(a.distanceKm-parsed.distanceKm)<0.1);
        return {...item,status:isDupe?"duplicate":parsed.hasTimestamps?"preview":"preview",parsed,error:isDupe?"Already uploaded":null};
      }catch(e){ return {...item,status:"error",error:e.message}; }
    }));
    setQueue(results);
  },[acts]);

  const saveAll=()=>{
    const valid=queue.filter(q=>q.status==="preview"&&q.parsed);
    if(!valid.length)return;
    onAdd(valid.map(q=>q.parsed));
    setQueue([]);
  };

  const removeFromQueue=id=>setQueue(q=>q.filter((_,i)=>i!==id));

  return (
    <div style={{paddingTop:16,paddingBottom:28}}>
      <div className="f0" style={{marginBottom:18}}>
        <div style={{fontSize:"1.2rem",fontWeight:700,marginBottom:4}}>Upload GPX Files</div>
        <div style={{fontSize:".82rem",color:"var(--tx2)"}}>Supports Garmin · Coros · Apple Watch · Wahoo · Polar · Suunto</div>
      </div>

      {/* Drop zone */}
      <div className={`dz ${over?"ov":""}`} style={{padding:"36px 20px",textAlign:"center",cursor:"pointer",marginBottom:16}}
        onClick={()=>ref.current?.click()}
        onDrop={e=>{e.preventDefault();setOver(false);process(e.dataTransfer.files);}}
        onDragOver={e=>{e.preventDefault();setOver(true);}}
        onDragLeave={()=>setOver(false)}>
        <input ref={ref} type="file" accept=".gpx" multiple style={{display:"none"}} onChange={e=>process(e.target.files)}/>
        <div style={{fontSize:"2.8rem",marginBottom:10}}>{over?"📂":"📁"}</div>
        <div style={{fontWeight:700,fontSize:"1rem",marginBottom:6,color:over?"var(--or)":"var(--tx)"}}>{over?"Drop files!":"Drag & drop GPX files"}</div>
        <div style={{fontSize:".78rem",color:"var(--tx2)",marginBottom:16}}>or click to browse · upload multiple at once</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center"}}>
          {["Garmin Connect","Apple Fitness","Coros","Wahoo","Polar Flow","Suunto","Strava Export"].map(d=>(
            <span key={d} style={{fontSize:".66rem",background:"var(--s3)",border:"1px solid var(--bd2)",borderRadius:20,padding:"3px 10px",color:"var(--tx2)"}}>{d}</span>
          ))}
        </div>
      </div>

      {/* Queue */}
      {queue.length>0&&(
        <div className="f0" style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:".82rem",fontWeight:600}}>{queue.length} file{queue.length>1?"s":""} ready</div>
            <button className="btn b-or" style={{padding:"8px 16px",fontSize:".8rem"}} onClick={saveAll}>
              Add {queue.filter(q=>q.status==="preview").length} to Library
            </button>
          </div>
          {queue.map((q,i)=>(
            <div key={i} className="c2 f0" style={{padding:"12px 14px",marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:q.parsed?8:0}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
                    {q.status==="parsing"&&<Spin s={12}/>}
                    {q.status==="preview"&&<span style={{color:"var(--gn)",fontSize:".8rem"}}>✓</span>}
                    {q.status==="duplicate"&&<span style={{color:"var(--yw)",fontSize:".8rem"}}>⚠</span>}
                    {q.status==="error"&&<span style={{color:"var(--rd)",fontSize:".8rem"}}>✕</span>}
                    <span style={{fontSize:".82rem",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.parsed?.name||q.file.name}</span>
                  </div>
                  {q.parsed&&<div style={{fontSize:".72rem",color:"var(--tx2)"}}>{q.parsed.startDateLocal||fmtDate(q.parsed.date)} · {fmtKm(q.parsed.distanceKm)}km · {fmtDur(q.parsed.movingTimeSec)}</div>}
                  {q.error&&<div style={{fontSize:".72rem",color:q.status==="duplicate"?"var(--yw)":"var(--rd)"}}>{q.error}</div>}
                </div>
                <button className="btn b-gh" style={{padding:"4px 8px",fontSize:".7rem",marginLeft:8,flexShrink:0}} onClick={()=>removeFromQueue(i)}>✕</button>
              </div>
              {q.parsed&&q.status==="preview"&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                  {[{l:"Dist",v:`${fmtKm(q.parsed.distanceKm)}km`},{l:"Pace",v:`${fmtPace(q.parsed.avgPaceSecKm)}/km`},{l:"Elev",v:`+${q.parsed.elevGainM}m`}].map(s=>(
                    <div key={s.l} className="c3" style={{padding:"5px 8px",textAlign:"center"}}>
                      <div className="num" style={{fontSize:".82rem",fontWeight:700}}>{s.v}</div>
                      <div style={{fontSize:".58rem",color:"var(--tx2)"}}>{s.l}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Export guide */}
      <div className="c2" style={{padding:14}}>
        <div style={{fontSize:".75rem",fontWeight:600,marginBottom:10}}>📋 How to export GPX</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[["Strava","Activity → ⋮ → Export GPX"],["Garmin","Connect → Activity → Export"],["Coros","App → Activity → Share → GPX"],["Apple Watch","WorkOutDoors app → Export"],["Polar","Flow → Activity → Export"],["Suunto","App → Training → Export GPX"]].map(([a,h])=>(
            <div key={a} style={{fontSize:".68rem",lineHeight:1.5}}>
              <span style={{color:"var(--or)",fontWeight:600}}>{a}: </span>
              <span style={{color:"var(--tx2)"}}>{h}</span>
            </div>
          ))}
        </div>
      </div>

      {acts.length>0&&(
        <div className="c2" style={{padding:14,marginTop:16}}>
          <div style={{fontSize:".76rem",fontWeight:600,marginBottom:10}}>💾 Backup & Restore</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <button className="btn b-gh" style={{padding:"10px",fontSize:".8rem"}}
              onClick={()=>exportBackup(acts,goals)}>
              ⬇️ Export Backup
            </button>
            <label className="btn b-gh" style={{padding:"10px",fontSize:".8rem",cursor:"pointer"}}>
              ⬆️ Import Backup
              <input type="file" accept=".json" style={{display:"none"}} onChange={async e=>{
                const file=e.target.files?.[0]; if(!file)return;
                try{
                  const text=await file.text();
                  const {merged,added,goals:importedGoals}=importBackup(text,acts);
                  // Only pass truly new activities to onAdd (no duplicates)
                  const brandNew=merged.filter(m=>!acts.some(a=>a.id===m.id));
                  if(brandNew.length>0) onAdd(brandNew);
                  if(importedGoals&&setGoals){
                    const updated={...goals,...importedGoals};
                    setGoals(updated);
                    saveGoals(updated);
                  }
                  alert(`✓ Imported ${added} new activit${added===1?"y":"ies"}${importedGoals?" + goals":""}.\n${merged.length-added} duplicates skipped.`);
                }catch(err){
                  alert("Import failed: "+err.message);
                }
                e.target.value="";
              }}/>
            </label>
          </div>
          <div style={{fontSize:".68rem",color:"var(--tx3)",lineHeight:1.5}}>
            Export saves all your runs as a JSON file you can keep as a backup or transfer to another device. Import merges without deleting existing data.
          </div>
        </div>
      )}

      {acts.length>0&&(
        <div style={{marginTop:12,textAlign:"center"}}>
          <button className="btn b-rd" style={{padding:"9px 18px",fontSize:".78rem"}} onClick={onClearAll}>
            🗑 Delete All Activities
          </button>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// §J  GOAL WIDGET  (smart goal intelligence)
// ─────────────────────────────────────────────────────────────────
const GoalWidget=({acts,goals,onEdit})=>{
  const now=new Date();
  const weekStart=new Date(now); weekStart.setHours(0,0,0,0); weekStart.setDate(now.getDate()-((now.getDay()+6)%7));
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const monthEnd  =new Date(now.getFullYear(),now.getMonth()+1,0); // last day of month
  const daysLeftMonth=monthEnd.getDate()-now.getDate();
  const daysLeftWeek =7-(now.getDay()+6)%7-1;

  const weekKm =acts.filter(a=>new Date(a.date)>=weekStart).reduce((s,a)=>s+a.distanceKm,0);
  const monthKm=acts.filter(a=>new Date(a.date)>=monthStart).reduce((s,a)=>s+a.distanceKm,0);

  const wPct=weekKm/goals.weekly;
  const mPct=monthKm/goals.monthly;

  const wRemain=Math.max(0,parseFloat((goals.weekly-weekKm).toFixed(1)));
  const mRemain=Math.max(0,parseFloat((goals.monthly-monthKm).toFixed(1)));
  const wDailyNeeded=daysLeftWeek>0?parseFloat((wRemain/daysLeftWeek).toFixed(1)):wRemain;
  const mDailyNeeded=daysLeftMonth>0?parseFloat((mRemain/daysLeftMonth).toFixed(1)):mRemain;

  return (
    <div className="card f1" style={{padding:16,marginBottom:14}}>
      <SH title="Goals" right={<button className="btn b-gh" style={{padding:"4px 12px",fontSize:".74rem"}} onClick={onEdit}>Edit</button>}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {[
          {l:"Weekly",cur:weekKm,goal:goals.weekly,pct:wPct,c:"var(--or)",remain:wRemain,daily:wDailyNeeded,daysLeft:daysLeftWeek,unit:"wk"},
          {l:"Monthly",cur:monthKm,goal:goals.monthly,pct:mPct,c:"var(--pu)",remain:mRemain,daily:mDailyNeeded,daysLeft:daysLeftMonth,unit:"mo"}
        ].map(g=>(
          <div key={g.l} style={{textAlign:"center"}}>
            <Ring pct={g.pct} color={g.pct>=1?"var(--gn)":g.c} size={72}/>
            <div className="num" style={{fontSize:"1rem",fontWeight:800,marginTop:6,color:g.pct>=1?"var(--gn)":g.c}}>
              {fmtKm(g.cur)}<span style={{fontSize:".7rem",color:"var(--tx2)",fontWeight:400}}>/{g.goal}km</span>
            </div>
            <div style={{fontSize:".64rem",color:"var(--tx2)",marginTop:2}}>{g.l}</div>
            {g.pct>=1
              ? <div className="badge" style={{background:"var(--gn2)",color:"var(--gn)",marginTop:5}}>✓ Goal reached!</div>
              : g.remain>0&&(
                <div style={{marginTop:6,padding:"6px 8px",background:"var(--s3)",borderRadius:8}}>
                  <div style={{fontSize:".67rem",color:"var(--tx2)",lineHeight:1.5}}>
                    <span style={{color:"var(--tx)",fontWeight:600}}>{g.remain}km</span> to go
                  </div>
                  {g.daysLeft>0&&<div style={{fontSize:".62rem",color:"var(--tx3)",marginTop:2}}>
                    ~{g.daily}km/day · {g.daysLeft}d left
                  </div>}
                  {g.daysLeft===0&&g.remain>0&&<div style={{fontSize:".62rem",color:"var(--rd)",marginTop:2}}>Last day!</div>}
                </div>
              )
            }
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// §K  GOALS EDITOR
// ─────────────────────────────────────────────────────────────────
const GoalEditor=({goals,onSave,onClose})=>{
  const [w,setW]=useState(goals.weekly);
  const [m,setM]=useState(goals.monthly);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(6,8,14,.9)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div className="card" style={{width:"100%",maxWidth:430,borderRadius:"20px 20px 0 0",padding:24}}>
        <div style={{fontSize:"1rem",fontWeight:700,marginBottom:20}}>Set Distance Goals</div>
        {[{l:"Weekly goal (km)",v:w,set:setW,max:150},{l:"Monthly goal (km)",v:m,set:setM,max:500}].map(g=>(
          <div key={g.l} style={{marginBottom:20}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <label style={{fontSize:".82rem",color:"var(--tx2)"}}>{g.l}</label>
              <span className="num" style={{fontSize:"1.1rem",color:"var(--or)",fontWeight:800}}>{g.v} km</span>
            </div>
            <input type="range" min={5} max={g.max} step={5} value={g.v} onChange={e=>g.set(+e.target.value)}/>
          </div>
        ))}
        <div style={{display:"flex",gap:10}}>
          <button className="btn b-gh" style={{flex:1,padding:12}} onClick={onClose}>Cancel</button>
          <button className="btn b-or" style={{flex:1,padding:12}} onClick={()=>{onSave({weekly:w,monthly:m});onClose();}}>Save Goals</button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// §L  INSIGHTS PANEL
// ─────────────────────────────────────────────────────────────────
const RISK_COLOR = { Low:"var(--gn)", Medium:"var(--yw)", High:"var(--rd)" };
const RISK_BG    = { Low:"rgba(34,197,94,.12)", Medium:"rgba(234,179,8,.12)", High:"rgba(239,68,68,.12)" };
const TYPE_LEFT  = { positive:"var(--gn)", warning:"var(--yw)", danger:"var(--rd)", info:"var(--bl)" };

// ── Single accordion insight card ────────────────────────────────
const InsightCard = ({ ins, isOpen, onToggle }) => {
  const accentColor = TYPE_LEFT[ins.type] || "var(--tx2)";
  const riskColor   = ins.risk ? RISK_COLOR[ins.risk] : accentColor;

  // Short one-line summary shown when collapsed
  const summary = ins.signal
    ? ins.signal.length > 55 ? ins.signal.slice(0, 52) + "…" : ins.signal
    : ins.body
    ? ins.body.length   > 55 ? ins.body.slice(0, 52)   + "…" : ins.body
    : null;

  return (
    <div
      className={`ins-${ins.type} ins-row`}
      style={{
        border: "1px solid",
        borderRadius: 13,
        overflow: "hidden",
        // Left accent stripe via box-shadow inset
        boxShadow: `inset 3px 0 0 0 ${accentColor}`,
      }}
      onClick={onToggle}
      role="button"
      aria-expanded={isOpen}
    >
      {/* ── Collapsed row (always visible) ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 12px 11px 14px",
        minHeight: 48,
      }}>
        {/* Icon */}
        <span style={{ fontSize: "1.1rem", flexShrink: 0, lineHeight: 1 }}>{ins.icon}</span>

        {/* Title + optional one-liner */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: ".85rem", lineHeight: 1.3 }}>{ins.title}</span>
            {ins.risk && (
              <span style={{
                fontSize: ".6rem", fontWeight: 700, letterSpacing: ".04em",
                background: RISK_BG[ins.risk], color: riskColor,
                padding: "1px 7px", borderRadius: 20, flexShrink: 0,
              }}>
                {ins.risk}
              </span>
            )}
          </div>
          {!isOpen && summary && (
            <div style={{
              fontSize: ".73rem", color: "var(--tx2)", marginTop: 2,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {summary}
            </div>
          )}
        </div>

        {/* Chevron */}
        <span style={{
          fontSize: ".72rem", color: "var(--tx2)", flexShrink: 0,
          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform .2s ease",
          display: "inline-block",
          paddingLeft: 4,
        }}>▼</span>
      </div>

      {/* ── Expanded body ── */}
      {isOpen && (
        <div className="ins-body" style={{ padding: "0 14px 12px 14px" }}>
          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,.06)", marginBottom: 10 }}/>

          {/* Signal */}
          {ins.signal && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: ".64rem", fontWeight: 700, textTransform: "uppercase",
                letterSpacing: ".06em", color: "var(--tx3)", marginBottom: 4 }}>
                Signal
              </div>
              <div style={{ fontSize: ".8rem", color: "var(--tx2)", lineHeight: 1.55 }}>
                {ins.signal}
              </div>
            </div>
          )}

          {/* Legacy body fallback */}
          {ins.body && !ins.signal && (
            <div style={{ fontSize: ".8rem", color: "var(--tx2)", lineHeight: 1.55, marginBottom: 10 }}>
              {ins.body}
            </div>
          )}

          {/* Recommendation */}
          {ins.recommendation && (
            <div style={{
              background: "rgba(0,0,0,.25)", borderRadius: 9,
              padding: "9px 11px", display: "flex", gap: 8, alignItems: "flex-start",
            }}>
              <span style={{ fontSize: ".85rem", flexShrink: 0, marginTop: 1 }}>💡</span>
              <div style={{ fontSize: ".77rem", color: "var(--tx)", lineHeight: 1.6 }}>
                {ins.recommendation}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Insights section — accordion, one open at a time ─────────────
const Insights = ({ insights }) => {
  const [openIdx, setOpenIdx] = useState(null);

  const toggle = i => setOpenIdx(prev => prev === i ? null : i);

  // Count by risk for the summary bar
  const highCount   = insights.filter(x => x.risk === "High").length;
  const mediumCount = insights.filter(x => x.risk === "Medium").length;

  return (
    <div className="f0" style={{ marginBottom: 14 }}>
      {/* Section header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: ".72rem", fontWeight: 700, textTransform: "uppercase",
          letterSpacing: ".08em", color: "var(--tx2)" }}>
          🧠 Coach Insights
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {highCount > 0 && (
            <span style={{ fontSize: ".62rem", fontWeight: 700, background: "var(--rd2)",
              color: "var(--rd)", padding: "1px 8px", borderRadius: 20 }}>
              {highCount} High
            </span>
          )}
          {mediumCount > 0 && (
            <span style={{ fontSize: ".62rem", fontWeight: 700, background: "var(--yw2)",
              color: "var(--yw)", padding: "1px 8px", borderRadius: 20 }}>
              {mediumCount} Medium
            </span>
          )}
          <span style={{ fontSize: ".62rem", color: "var(--tx3)", padding: "1px 6px" }}>
            {insights.length} total
          </span>
        </div>
      </div>

      {/* Tap hint (shown only when all collapsed) */}
      {openIdx === null && (
        <div style={{ fontSize: ".68rem", color: "var(--tx3)", marginBottom: 8, textAlign: "right" }}>
          tap any card to expand ↓
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {insights.map((ins, i) => (
          <InsightCard
            key={i}
            ins={ins}
            isOpen={openIdx === i}
            onToggle={() => toggle(i)}
          />
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// §M  DASHBOARD
// ─────────────────────────────────────────────────────────────────
const Dashboard=({acts,analytics,goals,onEditGoals,onSelectAct})=>{
  const {insights,weekly,monthly,streak,prediction,consistency}=analytics;
  const runs=acts.filter(a=>a.type==="Run");
  const totalKm=runs.reduce((s,a)=>s+a.distanceKm,0);
  const avgPace=runs.filter(a=>a.avgPaceSecKm>0).length?runs.filter(a=>a.avgPaceSecKm>0).reduce((s,a)=>s+a.avgPaceSecKm,0)/runs.filter(a=>a.avgPaceSecKm>0).length:0;
  const [chartMetric,setChartMetric]=useState("km"); // km | count | days
  const [chartRange,setChartRange]=useState(8); // 8 | 12 weeks

  const chartData=weekly.slice(-chartRange);

  // Monthly comparison
  const curMonth=monthly[monthly.length-1];
  const prevMonth=monthly[monthly.length-2];

  return (
    <div style={{paddingTop:14,paddingBottom:24}}>
      {/* Streak + consistency */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <div className="card f0" style={{padding:14,textAlign:"center"}}>
          <div style={{fontSize:"2rem",marginBottom:4}}>🔥</div>
          <div className="num" style={{fontSize:"2.2rem",fontWeight:900,color:"var(--or)",lineHeight:1}}>{streak}</div>
          <div style={{fontSize:".7rem",color:"var(--tx2)",marginTop:4}}>Day streak</div>
        </div>
        <div className="card f0" style={{padding:14,textAlign:"center"}}>
          <Ring pct={consistency/100} color={consistency>=75?"var(--gn)":"var(--or)"} size={64}/>
          <div style={{fontSize:".7rem",color:"var(--tx2)",marginTop:6}}>8-week consistency</div>
        </div>
      </div>

      {/* Insights */}
      {insights.length>0&&<Insights insights={insights}/>}

      {/* Goals */}
      <GoalWidget acts={acts} goals={goals} onEdit={onEditGoals}/>

      {/* Summary stats */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        {[
          {ic:"📍",l:"Total Distance",v:fmtKm(totalKm),u:"km",c:"var(--or)"},
          {ic:"🏃",l:"Total Runs",v:runs.length,u:"",c:"var(--bl)"},
          {ic:"⚡",l:"Avg Pace",v:fmtPace(avgPace),u:"/km",c:"var(--pu)"},
          {ic:"⛰️",l:"Total Elevation",v:fmtKm(runs.reduce((s,a)=>s+(a.elevGainM||0),0)/1000),u:"km",c:"var(--gn)"},
        ].map((s,i)=>(
          <div key={s.l} className={`card f${i} hov`} style={{padding:14}}>
            <div style={{width:32,height:32,borderRadius:8,background:`${s.c}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:".95rem",marginBottom:8}}>{s.ic}</div>
            <div className="num" style={{fontSize:"1.6rem",fontWeight:900,color:s.c,lineHeight:1}}>{s.v}<span style={{fontSize:".72rem",fontWeight:400,color:"var(--tx2)",marginLeft:2}}>{s.u}</span></div>
            <div style={{fontSize:".68rem",color:"var(--tx2)",marginTop:3}}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Weekly chart */}
      {chartData.some(w=>w.km>0)&&(
        <div className="card f2" style={{padding:16,marginBottom:14}}>
          <SH title="Weekly Volume" sub="Actual run dates from GPS"
            right={
              <div style={{display:"flex",gap:4}}>
                {[["8w",8],["12w",12]].map(([l,v])=>(
                  <button key={l} className={`pill ${chartRange===v?"on":""}`} style={{padding:"3px 9px",fontSize:".7rem"}} onClick={()=>setChartRange(v)}>{l}</button>
                ))}
              </div>
            }/>
          {/* Metric toggle */}
          <div style={{display:"flex",gap:4,marginBottom:12}}>
            {[["km","Distance (km)"],["load","Training Load"],["count","Runs"],["days","Active Days"]].map(([id,l])=>(
              <button key={id} className={`pill ${chartMetric===id?"on":""}`} style={{padding:"3px 9px",fontSize:".7rem"}} onClick={()=>setChartMetric(id)}>{l}</button>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" vertical={false}/>
              <XAxis dataKey="label" tick={{fill:"var(--tx2)",fontSize:9}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:"var(--tx2)",fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip content={({active,payload,label})=>{
                if(!active||!payload?.length)return null;
                const d=chartData.find(w=>w.label===label);
                return <div style={{background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:10,padding:"8px 13px"}}>
                  <div style={{fontSize:".66rem",color:"var(--tx2)",marginBottom:4}}>{label}</div>
                  <div className="num" style={{fontSize:"1rem",color:"var(--or)"}}>{payload[0]?.value} {chartMetric==="km"?"km":chartMetric==="load"?"load pts":chartMetric==="count"?"runs":"days"}</div>
                  {d&&<div style={{fontSize:".66rem",color:"var(--tx2)",marginTop:2}}>{d.count} run{d.count!==1?"s":""} · {d.km} km · Load: {d.load}</div>}
                </div>;
              }}/>
              <Bar dataKey={chartMetric} fill={chartMetric==="load"?"#a855f7":"var(--or)"} radius={[5,5,0,0]} opacity={.9}/>
              {chartMetric==="km"&&<Line type="monotone" dataKey="km" stroke="rgba(249,115,22,.4)" strokeWidth={1.5} dot={false} strokeDasharray="4 4"/>}
            </ComposedChart>
          </ResponsiveContainer>
          {chartMetric==="load"&&(
            <div style={{marginTop:8,fontSize:".68rem",color:"var(--tx2)",display:"flex",gap:12,justifyContent:"center"}}>
              {[["#22c55e","Easy (0–40)"],["#f97316","Moderate (41–70)"],["#ef4444","Hard (71–100)"]].map(([c,l])=>(
                <span key={l} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:"50%",background:c,display:"inline-block"}}/>{l}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Monthly comparison */}
      {monthly.length>=2&&(
        <div className="card f3" style={{padding:16,marginBottom:14}}>
          <SH title="Monthly Summary"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {[curMonth,prevMonth].filter(Boolean).map((m,i)=>(
              <div key={m.month} className="c2" style={{padding:12}}>
                <div style={{fontSize:".68rem",color:"var(--tx2)",marginBottom:6}}>{i===0?"This month":"Last month"} · {fmtMonth(m.month)}</div>
                <div className="num" style={{fontSize:"1.4rem",fontWeight:900,color:i===0?"var(--or)":"var(--tx2)"}}>{fmtKm(m.km)}<span style={{fontSize:".7rem",fontWeight:400}}> km</span></div>
                <div style={{fontSize:".72rem",color:"var(--tx2)",marginTop:4}}>{m.count} runs · best {fmtKm(m.longest)}km</div>
                {i===0&&m.kmDelta!=null&&(
                  <span className="badge" style={{marginTop:6,background:m.kmDelta>=0?"var(--gn2)":"var(--rd2)",color:m.kmDelta>=0?"var(--gn)":"var(--rd)"}}>
                    {m.kmDelta>=0?"↑":"↓"}{Math.abs(m.kmDelta)}% vs last
                  </span>
                )}
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={monthly} barSize={20}>
              <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{fill:"var(--tx2)",fontSize:9}} axisLine={false} tickLine={false}/>
              <YAxis hide/>
              <Tooltip content={({active,payload,label})=>{
                if(!active||!payload?.length)return null;
                return <div style={{background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:10,padding:"8px 13px"}}>
                  <div style={{fontSize:".66rem",color:"var(--tx2)"}}>{fmtMonth(label)}</div>
                  <div className="num" style={{color:"var(--or)"}}>{payload[0]?.value} km</div>
                </div>;
              }}/>
              <Bar dataKey="km" radius={[4,4,0,0]}>
                {monthly.map((_,i)=><rect key={i} fill={i===monthly.length-1?"var(--or)":"var(--tx3)"}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Performance prediction */}
      {prediction&&(
        <div className="card f4" style={{padding:16,marginBottom:14,background:"linear-gradient(135deg,var(--s1),rgba(168,85,247,.04))",border:"1px solid rgba(168,85,247,.15)"}}>
          <SH title="🔮 Race Predictions" sub="Riegel formula · based on recent runs"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {Object.entries(prediction).filter(([k])=>k!=="Base pace").map(([k,v])=>(
              <div key={k} className="c3" style={{padding:"10px 12px",textAlign:"center"}}>
                <div style={{fontSize:".68rem",color:"var(--tx2)",marginBottom:4}}>{k}</div>
                <div className="num" style={{fontSize:"1.2rem",fontWeight:900,color:"#a855f7"}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{fontSize:".7rem",color:"var(--tx2)",marginTop:10,fontStyle:"italic",textAlign:"center"}}>Estimates only. Consult a coach for training plans.</div>
        </div>
      )}

      {/* Recent runs (preview) */}
      {acts.length>0&&(
        <div className="f4">
          <div style={{fontWeight:600,fontSize:".9rem",marginBottom:10}}>Recent Runs</div>
          {acts.slice(0,3).map((act,i)=>(
            <div key={act.id} className={`c2 hov f${i}`} style={{padding:"12px 14px",marginBottom:8,cursor:"pointer"}} onClick={()=>onSelectAct(act)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div style={{flex:1,minWidth:0,paddingRight:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                    <span style={{fontWeight:600,fontSize:".88rem",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{act.name}</span>
                    <span className="badge" style={{background:`${CLASS_COLOR[act.runClass]||"#6b7280"}18`,color:CLASS_COLOR[act.runClass]||"#6b7280",flexShrink:0}}>{act.runClass}</span>
                  </div>
                  <div style={{fontSize:".7rem",color:"var(--tx2)"}}>{fmtDateS(act.date)}{act.startTimeLocal?` · ${act.startTimeLocal}`:""}</div>
                </div>
                <span style={{fontSize:".7rem",color:"var(--tx2)",flexShrink:0}}>→</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7}}>
                {[{l:"Dist",v:`${fmtKm(act.distanceKm)}km`},{l:"Time",v:fmtDur(act.movingTimeSec)},{l:"Pace",v:`${fmtPace(act.avgPaceSecKm)}/km`}].map(s=>(
                  <div key={s.l} className="c3" style={{padding:"6px 8px",textAlign:"center"}}>
                    <div style={{fontSize:".58rem",color:"var(--tx2)",marginBottom:2}}>{s.l}</div>
                    <div className="num" style={{fontSize:".84rem",fontWeight:700}}>{s.v}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// §N  ACTIVITIES LIST
// ─────────────────────────────────────────────────────────────────
const ActivityList=({acts,allActs,onSelect})=>{
  const [filter,setFilter]=useState("all");
  const [search,setSearch]=useState("");
  const [sort,setSort]=useState("date");

  const allPaces=allActs.filter(a=>a.avgPaceSecKm>0&&a.distanceKm>=5).map(a=>a.avgPaceSecKm);
  const bestPace=allPaces.length?Math.min(...allPaces):null;
  const longestKm=allActs.length?Math.max(...allActs.map(a=>a.distanceKm)):0;

  const types=[...new Set(acts.map(a=>a.type))].sort();
  const vis=useMemo(()=>{
    let list=[...acts];
    if(filter!=="all")list=list.filter(a=>a.type===filter);
    if(search.trim())list=list.filter(a=>a.name.toLowerCase().includes(search.toLowerCase())||a.runClass?.toLowerCase().includes(search.toLowerCase()));
    if(sort==="dist")list.sort((a,b)=>b.distanceKm-a.distanceKm);
    else if(sort==="pace")list.sort((a,b)=>a.avgPaceSecKm-b.avgPaceSecKm);
    return list;
  },[acts,filter,search,sort]);

  return (
    <div style={{paddingTop:14,paddingBottom:24}}>
      <div className="f0" style={{marginBottom:14}}>
        <input className="inp" placeholder="🔍 Search by name or type…" value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      <div className="nsc f1" style={{display:"flex",gap:6,paddingBottom:8,marginBottom:10}}>
        {["all",...types].map(t=>(
          <button key={t} className={`pill ${filter===t?"on":""}`} style={{flexShrink:0,textTransform:"capitalize"}} onClick={()=>setFilter(t)}>
            {t==="all"?"All":`${RUN_ICONS[t]||"⚡"} ${t}`}
          </button>
        ))}
      </div>
      <div style={{display:"flex",gap:5,alignItems:"center",marginBottom:14}}>
        <span style={{fontSize:".72rem",color:"var(--tx3)"}}>Sort:</span>
        {[["date","Date"],["dist","Distance"],["pace","Pace"]].map(([id,l])=>(
          <button key={id} className={`pill ${sort===id?"on":""}`} style={{padding:"3px 10px",fontSize:".72rem"}} onClick={()=>setSort(id)}>{l}</button>
        ))}
        <span style={{marginLeft:"auto",fontSize:".7rem",color:"var(--tx3)"}}>{vis.length} shown</span>
      </div>

      {vis.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:"var(--tx2)",fontSize:".84rem"}}>No activities match your filter.</div>}

      {vis.map((act,i)=>{
        const color=rc(act.type);
        const isPB=bestPace&&act.avgPaceSecKm===bestPace&&act.distanceKm>=5;
        const isLong=act.distanceKm===longestKm&&longestKm>=10;
        return (
          <div key={act.id} className={`c2 hov f${Math.min(i,4)}`} style={{padding:"13px 15px",marginBottom:10,cursor:"pointer"}} onClick={()=>onSelect(act)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div style={{flex:1,minWidth:0,paddingRight:8}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:3}}>
                  <span style={{fontWeight:600,fontSize:".9rem",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{act.name}</span>
                  <span className="badge" style={{background:`${CLASS_COLOR[act.runClass]||"#6b7280"}15`,color:CLASS_COLOR[act.runClass]||"#6b7280",flexShrink:0}}>{act.runClass}</span>
                  {isPB&&<span className="badge" style={{background:"rgba(234,179,8,.15)",color:"#eab308",flexShrink:0}}>⚡ Best Pace</span>}
                  {isLong&&<span className="badge" style={{background:"rgba(168,85,247,.15)",color:"#a855f7",flexShrink:0}}>🏆 Longest</span>}
                </div>
                <div style={{fontSize:".7rem",color:"var(--tx2)",display:"flex",alignItems:"center",gap:6}}>
                  <span>📅 {act.startDateLocal||fmtDate(act.date)}</span>
                  {act.startTimeLocal&&<span style={{color:"var(--tx3)"}}>· 🕐 {act.startTimeLocal}</span>}
                </div>
              </div>
              <span style={{background:`${color}15`,color,padding:"3px 10px",borderRadius:20,fontSize:".67rem",fontWeight:700,flexShrink:0}}>{RUN_ICONS[act.type]||"⚡"} {act.type}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[{l:"Distance",v:`${fmtKm(act.distanceKm)} km`},{l:"Time",v:fmtDur(act.movingTimeSec)},{l:"Pace",v:`${fmtPace(act.avgPaceSecKm)}/km`}].map(s=>(
                <div key={s.l} style={{background:"var(--s1)",borderRadius:10,padding:"7px 8px",textAlign:"center"}}>
                  <div style={{fontSize:".58rem",color:"var(--tx2)",marginBottom:3}}>{s.l}</div>
                  <div className="num" style={{fontSize:".86rem",fontWeight:700}}>{s.v}</div>
                </div>
              ))}
            </div>
            {act.elevGainM>0&&(
              <div style={{display:"flex",gap:10,marginTop:8,paddingTop:8,borderTop:"1px solid var(--bd)",fontSize:".7rem",color:"var(--tx2)"}}>
                {[["⛰️",`+${act.elevGainM}m`],act.avgHR?["❤️",`${act.avgHR}bpm`]:null].filter(Boolean).map(([ic,v])=>(
                  <span key={ic} style={{display:"flex",alignItems:"center",gap:3}}><span>{ic}</span><span>{v}</span></span>
                ))}
                {act.trainingLoad>0&&(
                  <span style={{display:"flex",alignItems:"center",gap:3,marginLeft:4}}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:act.loadColor,display:"inline-block"}}/>
                    <span style={{color:act.loadColor,fontWeight:600}}>{act.trainingLoad}pts {act.loadLabel}</span>
                  </span>
                )}
                <span style={{marginLeft:"auto",color:"var(--tx3)"}}>tap for details →</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// §O  EMPTY STATE
// ─────────────────────────────────────────────────────────────────
const Empty=({onUpload})=>(
  <div className="f0" style={{textAlign:"center",paddingTop:48,paddingBottom:32}}>
    <div style={{fontSize:"3.5rem",marginBottom:16}}>🏃</div>
    <div style={{fontSize:"1.2rem",fontWeight:700,marginBottom:8}}>No activities yet</div>
    <div style={{fontSize:".84rem",color:"var(--tx2)",marginBottom:24,lineHeight:1.7,maxWidth:280,margin:"0 auto 24px"}}>
      Upload GPX files to unlock AI insights, pace trends, route maps, and personalized coaching.
    </div>
    <button className="btn b-or" style={{padding:"14px 28px",fontSize:".96rem"}} onClick={onUpload}>📁 Upload GPX Files</button>
    <div className="c2" style={{margin:"24px auto 0",padding:14,maxWidth:340,textAlign:"left"}}>
      <div style={{fontSize:".76rem",fontWeight:600,marginBottom:8}}>📋 Export GPX from:</div>
      {[["Strava","Activity → ⋮ → Export GPX"],["Garmin","Connect → Activity → Export"],["Coros","App → Activity → Share → GPX"],["Apple Watch","WorkOutDoors or Strava app"]].map(([a,h])=>(
        <div key={a} style={{fontSize:".7rem",color:"var(--tx2)",marginBottom:5}}>
          <span style={{color:"var(--or)",fontWeight:600}}>{a}: </span>{h}
        </div>
      ))}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────
// §Q  HR PROFILE EDITOR  (modal overlay)
// ─────────────────────────────────────────────────────────────────
const HRProfileEditor = ({ profile, onSave, onClose }) => {
  const [age,       setAge]      = useState(profile.age       ?? "");
  const [resting,   setResting]  = useState(profile.restingHR ?? "");
  const [override,  setOverride] = useState(profile.maxHROverride ?? "");
  const [useOverride, setUseOverride] = useState(!!profile.maxHROverride);

  const ageNum      = parseInt(age)      || null;
  const restingNum  = parseInt(resting)  || null;
  const overrideNum = parseInt(override) || null;

  // Live preview of maxHR that will be used
  const previewMax = useOverride && overrideNum
    ? overrideNum
    : ageNum ? 220 - ageNum : null;

  const previewZones = previewMax
    ? ZONE_DEFS.map(z => ({
        ...z,
        lo_bpm: Math.round(z.lo * previewMax),
        hi_bpm: Math.round(z.hi === 1.01 ? previewMax : z.hi * previewMax),
      }))
    : null;

  const save = () => {
    onSave({
      age:           ageNum,
      restingHR:     restingNum,
      maxHROverride: useOverride ? overrideNum : null,
    });
    onClose();
  };

  const clear = () => { onSave({ ...HR_PROFILE_DEFAULTS }); onClose(); };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(6,8,14,.92)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div className="card" style={{width:"100%",maxWidth:430,borderRadius:"20px 20px 0 0",padding:"24px 20px 32px",maxHeight:"90vh",overflowY:"auto"}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div>
            <div style={{fontWeight:700,fontSize:"1.05rem"}}>❤️ Heart Rate Profile</div>
            <div style={{fontSize:".74rem",color:"var(--tx2)",marginTop:2}}>
              Used to calculate personalised HR zones for every activity
            </div>
          </div>
          <button className="btn b-gh" style={{padding:"6px 12px",fontSize:".8rem"}} onClick={onClose}>✕</button>
        </div>

        {/* Age input */}
        <div style={{marginBottom:16}}>
          <label style={{fontSize:".78rem",fontWeight:600,display:"block",marginBottom:6}}>
            Age <span style={{color:"var(--or)"}}>*</span>
            <span style={{fontWeight:400,color:"var(--tx2)",marginLeft:6}}>Used for 220 − age formula</span>
          </label>
          <input className="inp" type="number" min="10" max="100"
            placeholder="e.g. 32"
            value={age} onChange={e => setAge(e.target.value)}/>
          {ageNum && !useOverride && (
            <div style={{fontSize:".72rem",color:"var(--gn)",marginTop:5}}>
              ✓ Calculated max HR: <strong>{220 - ageNum} bpm</strong>
            </div>
          )}
        </div>

        {/* Resting HR (optional) */}
        <div style={{marginBottom:16}}>
          <label style={{fontSize:".78rem",fontWeight:600,display:"block",marginBottom:6}}>
            Resting Heart Rate
            <span style={{fontWeight:400,color:"var(--tx2)",marginLeft:6}}>optional · bpm on waking</span>
          </label>
          <input className="inp" type="number" min="30" max="120"
            placeholder="e.g. 55"
            value={resting} onChange={e => setResting(e.target.value)}/>
          {restingNum && previewMax && (
            <div style={{fontSize:".72rem",color:"var(--tx2)",marginTop:5}}>
              Heart Rate Reserve: {previewMax - restingNum} bpm
              &nbsp;· Useful for Karvonen-method training in the future
            </div>
          )}
        </div>

        {/* Max HR override */}
        <div style={{marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <button
              onClick={() => setUseOverride(v => !v)}
              style={{
                width:36, height:20, borderRadius:10, border:"none", cursor:"pointer",
                background: useOverride ? "var(--or)" : "var(--bd)",
                position:"relative", transition:"background .2s", flexShrink:0,
              }}>
              <div style={{
                position:"absolute", top:2, left: useOverride ? 18 : 2,
                width:16, height:16, borderRadius:"50%", background:"#fff",
                transition:"left .2s",
              }}/>
            </button>
            <label style={{fontSize:".78rem",fontWeight:600,cursor:"pointer"}} onClick={() => setUseOverride(v=>!v)}>
              Use custom max HR
              <span style={{fontWeight:400,color:"var(--tx2)",marginLeft:6}}>overrides the formula</span>
            </label>
          </div>
          {useOverride && (
            <input className="inp" type="number" min="140" max="230"
              placeholder="e.g. 185 — from a max effort test or lab result"
              value={override} onChange={e => setOverride(e.target.value)}/>
          )}
          {useOverride && overrideNum && (
            <div style={{fontSize:".72rem",color:"var(--or)",marginTop:5}}>
              ✓ Custom max HR: <strong>{overrideNum} bpm</strong> — overrides formula
            </div>
          )}
        </div>

        {/* Live zone preview */}
        {previewZones ? (
          <div style={{marginBottom:20}}>
            <div style={{fontSize:".76rem",fontWeight:600,marginBottom:10}}>
              Zone preview — max HR: <span style={{color:"var(--or)"}}>{previewMax} bpm</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {previewZones.map(z => (
                <div key={z.zone} style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:24,flexShrink:0}}>
                    <span className="badge" style={{background:`${z.color}18`,color:z.color,padding:"2px 6px"}}>{z.zone}</span>
                  </div>
                  <div style={{flex:1,fontSize:".78rem",color:"var(--tx2)"}}>{z.label}</div>
                  <div className="num" style={{fontSize:".88rem",fontWeight:700,color:z.color,minWidth:90,textAlign:"right"}}>
                    {z.lo_bpm} – {z.hi_bpm} bpm
                  </div>
                  <div style={{width:60}}>
                    <div className="pb" style={{height:4}}>
                      <div className="pf" style={{width:`${(z.hi - z.lo) / 0.5 * 100}%`, background:z.color}}/>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{marginBottom:20,padding:"12px 14px",background:"var(--s3)",borderRadius:12,fontSize:".78rem",color:"var(--tx2)"}}>
            Enter your age above to preview your personalised HR zones.
          </div>
        )}

        {/* Note about existing activities */}
        <div style={{marginBottom:20,padding:"10px 13px",background:"var(--bl2)",border:"1px solid rgba(59,130,246,.2)",borderRadius:10,fontSize:".74rem",color:"var(--bl)"}}>
          💡 <strong>Existing activities</strong> will show updated zones instantly if they contain HR data.
          New uploads will use these zones automatically.
        </div>

        {/* Buttons */}
        <div style={{display:"flex",gap:8}}>
          <button className="btn b-gh" style={{padding:"12px 16px",fontSize:".82rem"}} onClick={clear}>
            Clear Profile
          </button>
          <button className="btn b-or" style={{flex:1,padding:"12px",fontSize:".9rem"}} onClick={save}
            disabled={!ageNum && !(useOverride && overrideNum)}>
            Save Profile
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// §R  SETTINGS SCREEN
// ─────────────────────────────────────────────────────────────────
const SettingsScreen = ({ acts, goals, hrProfile, onEditGoals, onEditHR, onClearAll }) => {
  const totalKm  = acts.reduce((s,a) => s + a.distanceKm, 0);
  const withHR   = acts.filter(a => a.avgHR).length;
  const withRoute= acts.filter(a => a.route?.length > 2).length;

  const userMaxHR = getMaxHR(hrProfile, null);
  const hrConfigured = !!(hrProfile?.age || hrProfile?.maxHROverride);

  return (
    <div style={{paddingTop:16,paddingBottom:32}}>

      {/* HR Profile card */}
      <div className="card f0" style={{padding:18,marginBottom:14,border: hrConfigured ? "1px solid rgba(249,115,22,.25)" : "1px solid var(--bd)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div style={{fontWeight:700,fontSize:".96rem",marginBottom:3}}>❤️ Heart Rate Profile</div>
            <div style={{fontSize:".74rem",color:"var(--tx2)"}}>Personalises zone calculations for every activity</div>
          </div>
          <button className="btn b-or" style={{padding:"7px 14px",fontSize:".8rem",flexShrink:0}} onClick={onEditHR}>
            {hrConfigured ? "Edit" : "Set Up"}
          </button>
        </div>

        {hrConfigured ? (
          <>
            {/* Current profile summary */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
              {[
                { l:"Age",           v: hrProfile.age     ? `${hrProfile.age} yr`   : "—",     c:"var(--tx)"  },
                { l:"Resting HR",    v: hrProfile.restingHR ? `${hrProfile.restingHR} bpm` : "—", c:"var(--tx)" },
                { l:"Max HR used",   v: `${userMaxHR} bpm`,
                  c: hrProfile.maxHROverride ? "var(--or)" : "var(--gn)",
                  note: hrProfile.maxHROverride ? "manual" : "formula" },
              ].map(s=>(
                <div key={s.l} className="c3" style={{padding:"10px 8px",textAlign:"center"}}>
                  <div className="num" style={{fontSize:"1.1rem",fontWeight:800,color:s.c}}>{s.v}</div>
                  <div style={{fontSize:".62rem",color:"var(--tx2)",marginTop:3}}>{s.l}</div>
                  {s.note&&<div style={{fontSize:".6rem",color:s.c,marginTop:2,opacity:.8}}>{s.note}</div>}
                </div>
              ))}
            </div>

            {/* Mini zone reference */}
            <div style={{fontSize:".72rem",fontWeight:600,color:"var(--tx2)",marginBottom:8}}>Your zones (bpm)</div>
            <div style={{display:"flex",gap:4}}>
              {ZONE_DEFS.map(z => {
                const lo = Math.round(z.lo * userMaxHR);
                const hi = Math.round(z.hi === 1.01 ? userMaxHR : z.hi * userMaxHR);
                return (
                  <div key={z.zone} style={{flex:1,textAlign:"center",padding:"6px 2px",background:`${z.color}12`,borderRadius:8,border:`1px solid ${z.color}28`}}>
                    <div style={{fontSize:".65rem",fontWeight:700,color:z.color,marginBottom:2}}>{z.zone}</div>
                    <div style={{fontSize:".58rem",color:"var(--tx2)",lineHeight:1.3}}>{lo}–{hi}</div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{padding:"14px 0 2px"}}>
            <div style={{fontSize:".82rem",color:"var(--tx2)",lineHeight:1.7,marginBottom:10}}>
              Without a profile, zones are estimated from the highest HR recorded in each activity — which may be inaccurate.
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {["Enter your age to use the 220−age formula","Or set a custom max HR from a lab or field test","Zones recalculate instantly across all uploaded activities"].map((t,i)=>(
                <div key={i} style={{fontSize:".76rem",color:"var(--tx2)",display:"flex",gap:7}}>
                  <span style={{color:"var(--or)",flexShrink:0}}>→</span>{t}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Distance Goals card */}
      <div className="card f1" style={{padding:18,marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div>
            <div style={{fontWeight:700,fontSize:".96rem",marginBottom:3}}>🎯 Distance Goals</div>
            <div style={{fontSize:".74rem",color:"var(--tx2)"}}>Weekly and monthly km targets</div>
          </div>
          <button className="btn b-gh" style={{padding:"7px 14px",fontSize:".8rem"}} onClick={onEditGoals}>Edit</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[{l:"Weekly goal",v:`${goals.weekly} km`},{l:"Monthly goal",v:`${goals.monthly} km`}].map(s=>(
            <div key={s.l} className="c3" style={{padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:".78rem",color:"var(--tx2)"}}>{s.l}</span>
              <span className="num" style={{fontSize:"1rem",fontWeight:800,color:"var(--or)"}}>{s.v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Library stats */}
      <div className="card f2" style={{padding:18,marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:".96rem",marginBottom:14}}>📚 Activity Library</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[
            {l:"Total activities",     v:acts.length},
            {l:"Total distance",       v:`${parseFloat(totalKm.toFixed(1))} km`},
            {l:"With HR data",         v:withHR},
            {l:"With GPS route",       v:withRoute},
            {l:"Storage used",         v:`${Math.round(JSON.stringify(acts).length/1024)} KB`},
            {l:"Schema version",       v:"v1.0"},
          ].map(s=>(
            <div key={s.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid var(--bd)"}}>
              <span style={{fontSize:".78rem",color:"var(--tx2)"}}>{s.l}</span>
              <span className="num" style={{fontSize:".88rem",fontWeight:700}}>{s.v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* About */}
      <div className="card f3" style={{padding:18,marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:".96rem",marginBottom:12}}>ℹ️ About Runlytics</div>
        {[
          ["Version",      "v9.0"],
          ["Data storage", "Browser localStorage (private)"],
          ["Backend",      "None — 100% offline"],
          ["HR zones",     "Z1 50–60% · Z2 60–70% · Z3 70–80% · Z4 80–90% · Z5 90–100%"],
          ["Predictions",  "Riegel formula (T2 = T1 × (D2/D1)^1.06)"],
          ["Elev filter",  "Gaussian smoothing + 3m noise threshold"],
        ].map(([k,v],i,a)=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"8px 0",borderBottom:i<a.length-1?"1px solid var(--bd)":"none",gap:10}}>
            <span style={{fontSize:".78rem",color:"var(--tx2)",flexShrink:0}}>{k}</span>
            <span style={{fontSize:".76rem",textAlign:"right",lineHeight:1.5}}>{v}</span>
          </div>
        ))}
      </div>

      {/* Danger zone */}
      <div className="card f4" style={{padding:18,border:"1px solid rgba(239,68,68,.15)"}}>
        <div style={{fontWeight:700,fontSize:".96rem",color:"var(--rd)",marginBottom:12}}>⚠️ Data</div>
        <div style={{fontSize:".78rem",color:"var(--tx2)",marginBottom:14,lineHeight:1.6}}>
          All activities are stored locally in your browser. Clearing activities removes them permanently — export your data first if needed.
        </div>
        <button className="btn b-rd" style={{width:"100%",padding:"12px",fontSize:".86rem"}} onClick={onClearAll}>
          🗑 Delete All Activities
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// §P  APP ROOT
// ─────────────────────────────────────────────────────────────────
const NAVS=[
  {id:"home",    ic:"📊", l:"Dashboard"},
  {id:"runs",    ic:"🏃", l:"Activities"},
  {id:"upload",  ic:"📁", l:"Upload"},
  {id:"settings",ic:"⚙️", l:"Settings"},
];

export default function App(){
  const [acts,       setActs]       = useState(()=>loadActs());
  const [goals,      setGoals]      = useState(()=>loadGoals());
  const [hrProfile,  setHRProfile]  = useState(()=>loadHRProfile());
  const [detail,     setDetail]     = useState(null);
  const [tab,        setTab]        = useState("home");
  const [showGoalEdit, setShowGoalEdit] = useState(false);
  const [showHREdit,   setShowHREdit]   = useState(false);
  const scrollRef = useRef(null);

  useEffect(()=>{ saveActs(acts); }, [acts]);
  useEffect(()=>{ scrollRef.current?.scrollTo({top:0}); }, [tab, detail]);

  const analytics = useMemo(()=>buildAnalytics(acts), [acts]);

  const addActs = useCallback(parsed => {
    setActs(prev => {
      const merged = [...parsed, ...prev];
      merged.sort((a,b) => b.dateTs - a.dateTs);
      return merged;
    });
    setTab("home");
  }, []);

  const deleteAct = useCallback(id => {
    setActs(p => p.filter(a => a.id !== id));
    setDetail(null);
  }, []);

  const clearAll = () => {
    if (!confirm(`Delete all ${acts.length} activities? This cannot be undone.\n\nTip: Export a backup first!`)) return;
    setActs([]);
    saveActs([]);
  };

  const saveGoalsHandler  = g => { setGoals(g);     saveGoals(g);     };
  const saveHRHandler     = p => { setHRProfile(p); saveHRProfile(p); };

  // Notify user when HR profile is set but activities predate hrSamples feature
  const legacyHRCount = hrProfile?.age
    ? acts.filter(a => a.avgHR && !a.hrSamples?.length).length
    : 0;

  return (
    <>
      <Styles/>
      <div style={{maxWidth:430,margin:"0 auto",minHeight:"100vh",background:"var(--bg)",display:"flex",flexDirection:"column"}}>

        {/* Activity detail overlay */}
        {detail && (
          <Detail
            act={detail}
            allActs={acts}
            hrProfile={hrProfile}
            onClose={()=>setDetail(null)}
            onDelete={id=>{ deleteAct(id); setDetail(null); }}
          />
        )}

        {/* Goal editor overlay */}
        {showGoalEdit && (
          <GoalEditor goals={goals} onSave={saveGoalsHandler} onClose={()=>setShowGoalEdit(false)}/>
        )}

        {/* HR profile editor overlay */}
        {showHREdit && (
          <HRProfileEditor profile={hrProfile} onSave={saveHRHandler} onClose={()=>setShowHREdit(false)}/>
        )}

        {/* Top bar */}
        <div style={{padding:"14px 18px 10px",borderBottom:"1px solid var(--bd)",background:"rgba(6,8,14,.95)",backdropFilter:"blur(16px)",position:"sticky",top:0,zIndex:50}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:9}}>
              <div style={{width:30,height:30,borderRadius:8,background:"linear-gradient(135deg,#f97316,#c2410c)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".9rem",animation:"gw 2.5s infinite"}}>⚡</div>
              <div>
                <span className="num" style={{fontSize:"1.15rem",fontWeight:900,letterSpacing:".04em"}}>RUNLYTICS</span>
                <div style={{fontSize:".6rem",color:"var(--tx3)",letterSpacing:".05em"}}>GPX ANALYTICS</div>
              </div>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              {acts.length>0 && <span className="badge" style={{background:"var(--or2)",color:"var(--or)"}}>{acts.length} {acts.length===1?"run":"runs"}</span>}
              {analytics.streak>0 && <span className="badge" style={{background:"rgba(249,115,22,.15)",color:"var(--or)"}}>🔥 {analytics.streak}d</span>}
              <button className="btn b-or" style={{padding:"6px 13px",fontSize:".78rem"}} onClick={()=>setTab("upload")}>+ Upload</button>
            </div>
          </div>
          <div style={{display:"flex",background:"var(--s1)",border:"1px solid var(--bd)",borderRadius:11,padding:3,gap:3}}>
            {NAVS.map(n=>(
              <button key={n.id} className={`tab ${tab===n.id?"on":""}`}
                style={{flex:1,padding:"7px 4px",fontSize:".72rem",position:"relative"}}
                onClick={()=>setTab(n.id)}>
                {n.ic} {n.l}
                {/* Red dot when HR profile not configured */}
                {n.id==="settings" && !hrProfile?.age && !hrProfile?.maxHROverride && (
                  <span style={{position:"absolute",top:4,right:6,width:6,height:6,borderRadius:"50%",background:"var(--or)",display:"block"}}/>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Legacy HR data notice */}
        {legacyHRCount > 0 && tab === "settings" && (
          <div style={{margin:"12px 16px 0",padding:"10px 14px",background:"rgba(234,179,8,.07)",border:"1px solid rgba(234,179,8,.2)",borderRadius:12,fontSize:".75rem",color:"var(--yw)"}}>
            ⚠️ {legacyHRCount} activit{legacyHRCount===1?"y":"ies"} with HR data predate the samples feature.
            Re-upload those GPX files to apply your profile zones.
          </div>
        )}

        {/* Content */}
        <div ref={scrollRef} style={{flex:1,overflowY:"auto",padding:"0 16px"}}>
          {tab==="home" && (
            acts.length===0
              ? <Empty onUpload={()=>setTab("upload")}/>
              : <Dashboard acts={acts} analytics={analytics} goals={goals} onEditGoals={()=>setShowGoalEdit(true)} onSelectAct={setDetail}/>
          )}
          {tab==="runs" && (
            acts.length===0
              ? <Empty onUpload={()=>setTab("upload")}/>
              : <ActivityList acts={acts} allActs={acts} onSelect={setDetail}/>
          )}
          {tab==="upload" && (
            <Upload acts={acts} onAdd={addActs} onClearAll={clearAll} hrProfile={hrProfile}/>
          )}
          {tab==="settings" && (
            <SettingsScreen
              acts={acts}
              goals={goals}
              hrProfile={hrProfile}
              onEditGoals={()=>setShowGoalEdit(true)}
              onEditHR={()=>setShowHREdit(true)}
              onClearAll={clearAll}
            />
          )}
        </div>
      </div>
    </>
  );
}
