import{useState,useEffect,useRef,useMemo,useCallback}from"react";
import{ResponsiveContainer,BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip}from"recharts";

function debounce(fn,ms){let t;return function(...a){clearTimeout(t);t=setTimeout(()=>fn.apply(this,a),ms);};}
const saveActsDebounced=debounce(saveActs,500);
const DATA_KEY="runlytics_data_v1";
const GOALS_KEY="runlytics_goals_v1";
const HR_KEY="runlytics_hr_profile_v1";
const PROFILE_KEY="runlytics_profile_v1";
const TASKS_KEY="runlytics_tasks_v2";
const BADGES_KEY="runlytics_badges_v1";
const TIERS_KEY="runlytics_tiers_v1";
const TAB_KEY="runlytics_tab_v1";
const STRAVA_KEY="runlytics_strava_v1";

// FIX #5: .filter(Boolean) removes null entries from migrateActivity on corrupt data
function loadActs(){try{return JSON.parse(localStorage.getItem(DATA_KEY)||"[]").map(migrateActivity).filter(Boolean);}catch(e){return[];}}
function compressRoute(pts){if(!pts||!pts.length)return[];const step=Math.max(1,Math.floor(pts.length/300));return pts.filter((_,i)=>i%step===0||i===pts.length-1).map(p=>({lat:+p.lat.toFixed(4),lon:+p.lon.toFixed(4)}));}
function compressHR(samples){if(!samples||!samples.length)return[];const step=Math.max(1,Math.floor(samples.length/150));return samples.filter((_,i)=>i%step===0||i===samples.length-1);}
function prepareForStorage(acts){return acts.map(a=>({...a,route:compressRoute(a.route),hrSamples:compressHR(a.hrSamples)}));}
function saveActs(acts){try{localStorage.setItem(DATA_KEY,JSON.stringify(prepareForStorage(acts)));}catch(e){try{const stripped=acts.map(a=>({...a,route:[],hrSamples:[]}));localStorage.setItem(DATA_KEY,JSON.stringify(stripped));}catch(e2){}}}
function loadGoals(){try{return JSON.parse(localStorage.getItem(GOALS_KEY)||"null")||{weekly:40,monthly:160};}catch(e){return{weekly:40,monthly:160};}}
function saveGoals(g){try{localStorage.setItem(GOALS_KEY,JSON.stringify(g));}catch(e){}}
function loadHRProfile(){try{return JSON.parse(localStorage.getItem(HR_KEY)||"null")||{age:30,overrideMAF:null,modifier:0};}catch(e){return{age:30,overrideMAF:null,modifier:0};}}
function saveHRProfile(p){try{localStorage.setItem(HR_KEY,JSON.stringify(p));}catch(e){}}
function loadProfile(){try{return JSON.parse(localStorage.getItem(PROFILE_KEY)||"null")||{name:"Runner"};}catch(e){return{name:"Runner"};}}
function saveProfile(p){try{localStorage.setItem(PROFILE_KEY,JSON.stringify(p));}catch(e){}}
function loadTasks(){try{return JSON.parse(localStorage.getItem(TASKS_KEY)||"null")||defaultTasks();}catch(e){return defaultTasks();}}
function saveTasks(t){try{localStorage.setItem(TASKS_KEY,JSON.stringify(t));}catch(e){}}
function loadSeenBadges(){try{return new Set(JSON.parse(localStorage.getItem(BADGES_KEY)||"[]"));}catch(e){return new Set();}}
function saveSeenBadges(ids){try{localStorage.setItem(BADGES_KEY,JSON.stringify([...ids]));}catch(e){}}
function loadSeenTiers(){try{return JSON.parse(localStorage.getItem(TIERS_KEY)||"{}");}catch(e){return{};}}
function saveSeenTiers(t){try{localStorage.setItem(TIERS_KEY,JSON.stringify(t));}catch(e){}}
function loadStravaAuth(){try{return JSON.parse(localStorage.getItem(STRAVA_KEY)||"null");}catch(e){return null;}}
function saveStravaAuth(a){try{localStorage.setItem(STRAVA_KEY,JSON.stringify(a));}catch(e){}}
function clearStravaAuth(){try{localStorage.removeItem(STRAVA_KEY);}catch(e){}}

// FIX #15: Added icon/category/desc fields; emoji as real chars not HTML entity strings
function defaultTasks(){
  return[
    {id:"t1",title:"Morning stretch",icon:"🧘",color:"#3b82f6",category:"recovery",desc:"5 min of light stretching after waking up",enabled:true,streak:0,completions:{}},
    {id:"t2",title:"Hydrate 2L",icon:"💧",color:"#06b6d4",category:"wellness",desc:"Drink at least 2 litres of water today",enabled:true,streak:0,completions:{}},
    {id:"t3",title:"Post-run foam roll",icon:"🪴",color:"#8b5cf6",category:"recovery",desc:"Roll quads, calves and IT band after running",enabled:false,streak:0,completions:{}},
    {id:"t4",title:"Sleep 7-8 hours",icon:"😴",color:"#f97316",category:"wellness",desc:"Prioritise 7-8 hours of quality sleep",enabled:true,streak:0,completions:{}},
  ];
}
function todayKey(){return new Date().toISOString().slice(0,10);}

// FIX #4: getStreak called in TasksTab toggle but was never defined
function getStreak(completions){
  if(!completions)return 0;
  let streak=0;
  const today=new Date();today.setHours(0,0,0,0);
  for(let i=0;i<365;i++){
    const d=new Date(today);d.setDate(d.getDate()-i);
    if(completions[d.toISOString().slice(0,10)])streak++;
    else if(i>0)break;
  }
  return streak;
}

function migrateActivity(a){
  if(!a||typeof a!=="object")return null;
  return{
    id:a.id||String(Date.now()+Math.random()),name:a.name||"Activity",type:a.type||"Run",
    date:a.date||todayKey(),dateTs:a.dateTs||0,
    distanceKm:isFinite(a.distanceKm)?+a.distanceKm:0,
    movingTimeSec:isFinite(a.movingTimeSec)?+a.movingTimeSec:0,
    avgPaceSecKm:isFinite(a.avgPaceSecKm)?+a.avgPaceSecKm:0,
    avgHR:isFinite(a.avgHR)&&a.avgHR>0?+a.avgHR:null,
    maxHR:isFinite(a.maxHR)&&a.maxHR>0?+a.maxHR:null,
    elevGainM:isFinite(a.elevGainM)?+a.elevGainM:0,elevLossM:isFinite(a.elevLossM)?+a.elevLossM:0,
    runClass:a.runClass||classifyRun(isFinite(a.distanceKm)?+a.distanceKm:0,isFinite(a.avgPaceSecKm)?+a.avgPaceSecKm:0),
    hrSamples:Array.isArray(a.hrSamples)?a.hrSamples.filter(s=>s&&isFinite(s.sec)&&isFinite(s.hr)&&s.hr>30&&s.hr<250).slice(0,500):[],
    route:Array.isArray(a.route)&&a.route.length>=2?a.route.slice(0,500):[],
    source:a.source||"gpx",
    trainingLoad:isFinite(a.trainingLoad)&&a.trainingLoad>=0?Math.round(+a.trainingLoad):0,
  };
}

function fmtKm(km){return km==null?"0":parseFloat((+km).toFixed(2)).toString();}
function fmtPace(secPerKm){if(!secPerKm||!isFinite(secPerKm)||secPerKm<=0)return"--:--";const m=Math.floor(secPerKm/60),s=Math.round(secPerKm%60);return m+":"+(s<10?"0":"")+s;}
function fmtDur(sec){if(!sec||!isFinite(sec))return"0:00";const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=Math.floor(sec%60);if(h>0)return h+":"+(m<10?"0":"")+m+":"+(s<10?"0":"")+s;return m+":"+(s<10?"0":"")+s;}
function fmtDate(str){if(!str)return"";try{const d=new Date(str);if(!isFinite(d.getTime()))return str;return d.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});}catch(e){return str;}}
function fmtDateS(str){if(!str)return"";try{const d=new Date(str);if(!isFinite(d.getTime()))return str;return d.toLocaleDateString("en-US",{month:"short",day:"numeric"});}catch(e){return str;}}
function fmtRaceTime(sec){return fmtDur(sec);}
function weekOf(ts){const d=new Date(ts);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.toISOString().slice(0,10);}
function monthOf(ts){return new Date(ts).toISOString().slice(0,7);}
function greet(){const h=new Date().getHours();if(h<12)return"Good morning";if(h<18)return"Good afternoon";return"Good evening";}

const ACT_ICN={"Run":"🏃","Walk":"🚶","Hike":"⛰️","TrailRun":"🌳","VirtualRun":"💻"};
const ACT_CLR={"Run":"var(--or)","Walk":"var(--gn)","Hike":"#8b5cf6","TrailRun":"#14b8a6","VirtualRun":"var(--bl)"};
const IC={"rest":"var(--gn)","easy":"var(--or)","workout":"var(--rd)","long":"var(--bl)"};
const IC_BG={"rest":"rgba(34,197,94,.08)","easy":"rgba(249,115,22,.06)","workout":"rgba(239,68,68,.08)","long":"rgba(59,130,246,.08)"};
const IC_BD={"rest":"rgba(34,197,94,.18)","easy":"rgba(249,115,22,.15)","workout":"rgba(239,68,68,.18)","long":"rgba(59,130,246,.18)"};
function classifyRun(distKm,paceSecKm){if(distKm>=15)return"long";if(paceSecKm&&paceSecKm<320)return"workout";return"easy";}

// FIX #6: Accept optional fileName as fallback name when GPX has no <name> element
function parseGPX(xmlStr,fileName){
  if(!xmlStr||typeof xmlStr!=="string"||xmlStr.length<100)return null;
  if(xmlStr.length>10*1024*1024)return null;
  try{
    const parser=new DOMParser();
    const doc=parser.parseFromString(xmlStr,"application/xml");
    if(doc.querySelector("parsererror"))return null;
    const nameFallback=fileName?fileName.replace(/\.gpx$/i,""):"Activity";
    const name=doc.querySelector("name")?.textContent?.trim()||nameFallback;
    const trkpts=Array.from(doc.querySelectorAll("trkpt,rtept,wpt"));
    if(trkpts.length<2)return null;
    const pts=[];
    trkpts.forEach(pt=>{
      const lat=parseFloat(pt.getAttribute("lat")||"");const lon=parseFloat(pt.getAttribute("lon")||"");
      if(!isFinite(lat)||!isFinite(lon)||lat<-90||lat>90||lon<-180||lon>180)return;
      const ele=parseFloat(pt.querySelector("ele")?.textContent||"0")||0;
      const timeEl=pt.querySelector("time");const timeMs=timeEl?new Date(timeEl.textContent).getTime():0;
      const hrEl=pt.querySelector("extensions hr,heartrate,ns3\\:hr,gpxtpx\\:hr");
      const hr=hrEl?parseInt(hrEl.textContent)||null:null;
      pts.push({lat,lon,ele,time:timeMs,hr,sec:0});
    });
    if(pts.length<2)return null;
    const t0=pts[0].time;
    pts.forEach((p,i)=>{p.sec=p.time&&t0?Math.max(0,Math.round((p.time-t0)/1000)):i;});
    const R=6371000;let distM=0,elevGain=0,elevLoss=0;
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i];
      const dLa=(b.lat-a.lat)*Math.PI/180,dLo=(b.lon-a.lon)*Math.PI/180;
      const q=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLo/2)*Math.sin(dLo/2);
      distM+=2*R*Math.asin(Math.sqrt(Math.max(0,q)));
      const de=b.ele-a.ele;if(de>0)elevGain+=de;else elevLoss+=Math.abs(de);
    }
    const distKm=distM/1000;
    const timeSec=pts[pts.length-1].sec||((pts[pts.length-1].time-pts[0].time)/1000)||1;
    const paceSecKm=distKm>0?timeSec/distKm:0;
    const hrPts=pts.filter(p=>p.hr&&p.hr>40&&p.hr<220);
    const avgHR=hrPts.length?Math.round(hrPts.reduce((s,p)=>s+p.hr,0)/hrPts.length):null;
    const maxHR=hrPts.length?hrPts.reduce((m,p)=>p.hr>m?p.hr:m,0):null;
    const d=pts[0].time?new Date(pts[0].time):new Date();
    const dateStr=d.toISOString().slice(0,10);
    const trainingLoad=timeSec&&avgHR?Math.round((timeSec/60)*(avgHR/100)*1.5):Math.round(distKm*8);
    const step=Math.max(1,Math.floor(pts.length/400));
    const route=pts.filter((_,i)=>i%step===0||i===pts.length-1).map(p=>({lat:p.lat,lon:p.lon}));
    const hrSamples=hrPts.filter((_,i)=>i%Math.max(1,Math.floor(hrPts.length/200))===0).map(p=>({sec:p.sec,hr:p.hr}));
    return migrateActivity({id:"g"+Date.now(),name,type:"Run",date:dateStr,dateTs:d.getTime(),
      distanceKm:parseFloat(distKm.toFixed(3)),movingTimeSec:Math.round(timeSec),
      avgPaceSecKm:parseFloat(paceSecKm.toFixed(1)),avgHR,maxHR,
      elevGainM:Math.round(elevGain),elevLossM:Math.round(elevLoss),
      runClass:classifyRun(distKm,paceSecKm),hrSamples,route,source:"gpx",trainingLoad});
  }catch(e){return null;}
}

async function getStravaToken(auth){
  if(!auth)return null;
  if(Date.now()/1000<auth.expires_at-60)return auth.access_token;
  try{
    const r=await fetch("/api/strava-refresh",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refresh_token:auth.refresh_token})});
    if(!r.ok)return null;
    const data=await r.json();const updated={...auth,...data};saveStravaAuth(updated);return updated.access_token;
  }catch(e){return null;}
}
function mapStravaActivity(a){
  if(!a||a.type&&!["Run","Walk","Hike","TrailRun","VirtualRun"].includes(a.type))return null;
  const distKm=(a.distance||0)/1000;const paceSecKm=distKm>0&&a.moving_time?a.moving_time/distKm:0;
  const d=a.start_date_local||a.start_date||new Date().toISOString();
  const trainingLoad=a.moving_time&&a.average_heartrate?Math.round((a.moving_time/60)*(a.average_heartrate/100)*1.5):Math.round(distKm*8);
  return migrateActivity({id:"s"+a.id,name:a.name||"Run",type:a.sport_type||a.type||"Run",date:d.slice(0,10),dateTs:new Date(d).getTime(),
    distanceKm:parseFloat(distKm.toFixed(3)),movingTimeSec:a.moving_time||0,
    avgPaceSecKm:parseFloat(paceSecKm.toFixed(1)),avgHR:a.average_heartrate||null,maxHR:a.max_heartrate||null,
    elevGainM:Math.round(a.total_elevation_gain||0),elevLossM:0,
    runClass:classifyRun(distKm,paceSecKm),hrSamples:[],route:[],source:"strava",trainingLoad});
}

function getMafHR(profile){
  if(!profile)return 150;
  if(profile.overrideMAF&&isFinite(profile.overrideMAF))return+profile.overrideMAF;
  const age=profile.age&&isFinite(profile.age)?+profile.age:30;
  const mod=profile.modifier&&isFinite(profile.modifier)?+profile.modifier:0;
  return Math.max(100,180-age+mod);
}
function getMafZones(mafHR){
  const m=mafHR||150;
  return[
    {zone:1,label:"Recovery",lo:m-30,hi:m-20,color:"#3b82f6",pct:0},
    {zone:2,label:"Aerobic",lo:m-20,hi:m-10,color:"#22c55e",pct:0},
    {zone:3,label:"MAF",lo:m-10,hi:m,color:"#f97316",pct:0},
    {zone:4,label:"Threshold",lo:m,hi:m+10,color:"#eab308",pct:0},
    {zone:5,label:"Anaerobic",lo:m+10,hi:m+30,color:"#ef4444",pct:0},
  ];
}

// FIX #7: Now sets z.seconds + z.minutes so HRTab aggregation works correctly
function computeZones(hrSamples,mafHR){
  if(!hrSamples||!hrSamples.length||isNaN(mafHR))return getMafZones(mafHR);
  const valid=hrSamples.filter(s=>s&&isFinite(s.sec)&&isFinite(s.hr)&&s.hr>40);
  if(!valid.length)return getMafZones(mafHR);
  const zones=getMafZones(mafHR);
  for(let i=1;i<valid.length;i++){
    const dt=valid[i].sec-valid[i-1].sec;
    const hr=(valid[i].hr+valid[i-1].hr)/2;
    const z=zones.find(z=>hr>=z.lo&&hr<z.hi)||zones[hr<zones[0].lo?0:zones.length-1];
    if(z)z.pct=(z.pct||0)+dt;
  }
  const total=valid[valid.length-1].sec-valid[0].sec||1;
  zones.forEach(z=>{z.seconds=z.pct||0;z.minutes=parseFloat((z.seconds/60).toFixed(1));z.pct=Math.round(z.seconds/total*100);});
  return zones;
}

function buildAnalytics(acts){
  if(!acts||!acts.length)return{streak:0,totalKm:0,weeklyKm:[],monthlyKm:[]};
  const runDays=new Set(acts.map(a=>new Date(a.dateTs).toDateString()));
  const today=new Date();today.setHours(0,0,0,0);
  let streak=0;
  for(let i=0;i<365;i++){const d=new Date(today);d.setDate(d.getDate()-i);if(runDays.has(d.toDateString()))streak++;else if(i>0)break;}
  const weekMap={};
  acts.forEach(r=>{const w=weekOf(r.dateTs);if(!weekMap[w])weekMap[w]={km:0,load:0,runs:[]};weekMap[w].km+=r.distanceKm;weekMap[w].load+=r.trainingLoad||0;weekMap[w].runs.push(r);});
  const weeklyKm=Object.entries(weekMap).sort(([a],[b])=>a>b?1:-1).map(([w,v])=>({week:w,km:parseFloat(v.km.toFixed(1)),load:Math.round(v.load),runs:v.runs.length}));
  const monthMap={};
  acts.forEach(r=>{const m=monthOf(r.dateTs);if(!monthMap[m])monthMap[m]={km:0,runs:[],time:0};monthMap[m].km+=r.distanceKm;monthMap[m].runs.push(r);monthMap[m].time+=r.movingTimeSec;});
  const monthlyKm=Object.entries(monthMap).sort(([a],[b])=>a>b?1:-1).map(([m,v])=>({month:m,km:parseFloat(v.km.toFixed(1)),runs:v.runs.length,timeSec:v.time,acts:v.runs}));
  return{streak,totalKm:acts.reduce((s,a)=>s+a.distanceKm,0),weeklyKm,monthlyKm};
}

// FIX #11: Returns top3 array so PRDetailModal can render a leaderboard
function computeRacePRs(acts){
  const cats=[{cat:"5K",min:4.5,max:5.5,color:"#22c55e"},{cat:"10K",min:9,max:11,color:"#f97316"},{cat:"HM",min:20,max:22,color:"#8b5cf6"},{cat:"Marathon",min:41,max:43,color:"#ef4444"}];
  return cats.map(c=>{
    const candidates=acts.filter(a=>a.distanceKm>=c.min&&a.distanceKm<=c.max&&a.movingTimeSec>0).sort((a,b)=>a.avgPaceSecKm-b.avgPaceSecKm);
    if(!candidates.length)return{...c,best:null,top3:[]};
    const best=candidates[0];
    const top3=candidates.slice(0,3).map(r=>({...r,paceSecKm:r.avgPaceSecKm,stravaId:r.source==="strava"?r.id.replace(/^s/,""):null}));
    return{...c,best,top3};
  }).filter(c=>c.best);
}
function getTodayRecommendation(acts,hrProfile){
  const todayStr=new Date().toISOString().slice(0,10);
  if(acts.some(a=>a.date===todayStr))return{type:"rest",icon:"🧘",title:"Rest Today",sub:"You already ran today. Time to recover."};
  const weekKm=acts.filter(a=>a.date>new Date(Date.now()-7*86400000).toISOString().slice(0,10)).reduce((s,a)=>s+a.distanceKm,0);
  const goals=loadGoals();
  if(weekKm>=goals.weekly)return{type:"rest",icon:"🛌",title:"Goal Complete!",sub:"Weekly target hit. A rest day or light jog is perfect."};
  if(weekKm<goals.weekly*0.4)return{type:"easy",icon:"🏃",title:"Easy Run Day",sub:"Keep it aerobic — run at MAF heart rate, enjoy the motion."};
  return{type:"easy",icon:"🏃",title:"Aerobic Run",sub:"Steady aerobic effort. Keep HR below MAF for best adaptation."};
}
function getMafCoachingInsight(acts,hrProfile){
  if(!acts||acts.length<1)return{title:"Start Your Journey",body:"Upload a GPX or connect Strava to begin.",icon:"🏃"};
  const maf=getMafHR(hrProfile);
  const hrActs=acts.slice(0,10).filter(a=>a.avgHR&&a.avgHR>0);
  if(hrActs.length){
    const over=hrActs.filter(a=>a.avgHR>maf);
    if(over.length>hrActs.length*0.6)return{title:"Run Easier",body:"Many runs exceed MAF ("+maf+" bpm). Slow down to build your aerobic base.",icon:"❤️"};
    return{title:"Great HR Control",body:"Your HR stays near MAF ("+maf+" bpm). Aerobic fitness is building!",icon:"💪"};
  }
  const weekKm=acts.slice(0,5).reduce((s,a)=>s+a.distanceKm,0);
  if(weekKm>50)return{title:"High Mileage",body:"Strong week with "+Math.round(weekKm)+"km. Prioritize recovery.",icon:"🔥"};
  return{title:"Keep Going",body:"Consistency is the key to improvement. Aim for 3-5 runs per week.",icon:"📈"};
}

const TIER_TRACKS=[
  {id:"distance",label:"Distance",thresholds:[10,25,50,100,200,350,500,750,1000,1500,2000,2500,3000,4000,5000,7500],unit:"km"},
  {id:"runs",label:"Runs",thresholds:[5,10,20,30,50,75,100,150,200,300,400,500,600,750,1000,1500],unit:"runs"},
  {id:"streak",label:"Streak",thresholds:[3,5,7,10,14,21,28,40,60,90,120,180,240,300,365,500],unit:"days"},
  {id:"elevation",label:"Elevation",thresholds:[500,1000,2500,5000,8000,12000,20000,30000,42000,60000,80000,100000,130000,160000,200000,250000],unit:"m"},
];
const TIER_NAMES=["Bronze I","Bronze II","Bronze III","Bronze IV","Silver I","Silver II","Silver III","Silver IV","Gold I","Gold II","Gold III","Gold IV","Platinum I","Platinum II","Platinum III","Elite"];
const TIER_COLS=["#cd7f32","#cd7f32","#cd7f32","#cd7f32","#94a3b8","#94a3b8","#94a3b8","#94a3b8","#f59e0b","#f59e0b","#f59e0b","#f59e0b","#e2e8f0","#e2e8f0","#e2e8f0","#f97316"];
const TRACK_META={distance:{icon:"🗺️"},runs:{icon:"👟"},streak:{icon:"🔥"},elevation:{icon:"⛰️"}};
function getTierIcon(i){if(i<4)return"🥉";if(i<8)return"🥈";if(i<12)return"🥇";if(i<15)return"💎";return"👑";}

// FIX #10: Complete rewrite returning shape AchievementsTab actually reads
function computeTierProgress(acts){
  const totalKm=acts.reduce((s,a)=>s+a.distanceKm,0);
  const totalRuns=acts.length;
  const runDays=new Set(acts.map(a=>new Date(a.dateTs).toDateString()));
  const today=new Date();today.setHours(0,0,0,0);
  let streak=0,maxStreak=0;
  for(let i=0;i<365;i++){const d=new Date(today);d.setDate(d.getDate()-i);if(runDays.has(d.toDateString())){streak++;maxStreak=Math.max(maxStreak,streak);}else if(i>0&&streak>0)break;}
  const totalElev=acts.reduce((s,a)=>s+(a.elevGainM||0),0);
  const vals={distance:totalKm,runs:totalRuns,streak:maxStreak,elevation:totalElev};
  return TIER_TRACKS.map(t=>{
    const val=vals[t.id]||0;
    const meta=TRACK_META[t.id]||{icon:"🏅"};
    const tiers=t.thresholds.map((req,i)=>({level:i,icon:getTierIcon(i),label:TIER_NAMES[i],color:TIER_COLS[i],req}));
    const nextIdx=t.thresholds.findIndex(th=>val<th);
    const currentIdx=nextIdx<0?tiers.length-1:nextIdx===0?-1:nextIdx-1;
    const current=currentIdx>=0?tiers[currentIdx]:null;
    const next=nextIdx>=0?tiers[nextIdx]:null;
    const prevThresh=currentIdx>0?t.thresholds[currentIdx-1]:0;
    const nextThreshVal=next?next.req:null;
    const pct=nextThreshVal?Math.min(100,Math.round(Math.max(0,val-prevThresh)/(nextThreshVal-prevThresh)*100)):nextThreshVal===null?100:0;
    return{id:t.id,progress:parseFloat(val.toFixed(1)),pct,badge:{icon:meta.icon,name:t.label,unit:t.unit,tiers},current,next};
  });
}

// FIX #9: BD now uses `icon`+`name` (AchievementsTab reads these, was `emoji`/`label`)
function BD(id,cat,icon,color,name,desc,check){return{id,cat,icon,color,name,desc,check};}
const BADGE_DEFS=[
  BD("first_run","milestone","🏃","#f97316","First Steps","Complete your first run.",a=>a.length>=1),
  BD("km_10","distance","📍","#3b82f6","10 Kilometres","Run 10km total.",a=>a.reduce((s,r)=>s+r.distanceKm,0)>=10),
  BD("km_50","distance","🛣️","#3b82f6","50 Kilometres","Run 50km total.",a=>a.reduce((s,r)=>s+r.distanceKm,0)>=50),
  BD("km_100","distance","🌍","#3b82f6","Century Club","Run 100km total.",a=>a.reduce((s,r)=>s+r.distanceKm,0)>=100),
  BD("km_500","distance","🌎","#3b82f6","500km Warrior","Run 500km total.",a=>a.reduce((s,r)=>s+r.distanceKm,0)>=500),
  BD("runs_10","milestone","⭐","#eab308","10 Runs","Complete 10 runs.",a=>a.length>=10),
  BD("runs_50","milestone","🌟","#eab308","50 Runs","Complete 50 runs.",a=>a.length>=50),
  BD("runs_100","milestone","🏆","#eab308","100 Runs","Complete 100 runs.",a=>a.length>=100),
  BD("streak_3","streak","🔥","#ef4444","On Fire","Run 3+ days in a row.",
    a=>{const s=new Set(a.map(r=>new Date(r.dateTs).toDateString()));let c=0;const t=new Date();t.setHours(0,0,0,0);for(let i=0;i<100;i++){const d=new Date(t);d.setDate(d.getDate()-i);if(s.has(d.toDateString()))c++;else if(i>0)break;}return c>=3;}),
  BD("streak_7","streak","🧨","#ef4444","Week Warrior","Run 7+ days in a row.",
    a=>{const s=new Set(a.map(r=>new Date(r.dateTs).toDateString()));let c=0;const t=new Date();t.setHours(0,0,0,0);for(let i=0;i<200;i++){const d=new Date(t);d.setDate(d.getDate()-i);if(s.has(d.toDateString()))c++;else if(i>0)break;}return c>=7;}),
  BD("long_10","distance","🚗","#8b5cf6","10K Finisher","Run 10km in one go.",a=>a.some(r=>r.distanceKm>=10)),
  BD("long_21","distance","🏅","#8b5cf6","Half Marathon","Run 21km+ in one go.",a=>a.some(r=>r.distanceKm>=21)),
  BD("long_42","distance","🥇","#8b5cf6","Marathoner","Run 42km in one go.",a=>a.some(r=>r.distanceKm>=42)),
  BD("early_bird","habit","🌇","#f59e0b","Early Bird","Run before 7 AM.",a=>a.some(r=>{const h=new Date(r.dateTs).getHours();return h<7;})),
  BD("night_owl","habit","🌙","#a855f7","Night Owl","Run after 9 PM.",a=>a.some(r=>{const h=new Date(r.dateTs).getHours();return h>=21;})),
  BD("consistent_4","consistency","📅","#3b82f6","Consistent","Run in 4+ different weeks.",a=>new Set(a.map(r=>{const d=new Date(r.dateTs);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.toDateString();})).size>=4),
  BD("elevation_1000","elevation","⛰️","#22c55e","Mountain Climber","Climb 1000m total.",a=>a.reduce((s,r)=>s+(r.elevGainM||0),0)>=1000),
  BD("maf_master","training","🧠","#f97316","MAF Master","Run 10 times with HR data.",a=>a.filter(r=>r.avgHR&&r.hrSamples&&r.hrSamples.length>0).length>=10),
];
function computeEarnedBadges(acts){return BADGE_DEFS.filter(b=>{try{return b.check(acts);}catch(e){return false;}}).map(b=>b.id);}

const SH=({title,sub})=>(
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
    <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)"}}>{title}</div>
    {sub&&<div style={{fontSize:".62rem",color:"var(--tx3)"}}>{sub}</div>}
  </div>
);
function Ring({pct=0,size=64,color="var(--or)",children}){
  const r=(size-7)/2,c=2*Math.PI*r,off=c*(1-Math.min(1,Math.max(0,pct)));const done=pct>=1;
  return(
    <div style={{position:"relative",width:size,height:size,flexShrink:0,transition:"transform .3s cubic-bezier(.34,1.56,.64,1)",transform:done?"scale(1.06)":"scale(1)"}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bd)" strokeWidth={7}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={pct>0?color:"var(--bd)"} strokeWidth={7}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          style={{transition:"stroke-dashoffset 1s cubic-bezier(.4,0,.2,1),stroke .3s ease"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>{children}</div>
    </div>
  );
}

const Styles=()=><style>{`
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#06080f;color:#d8e6f7;-webkit-font-smoothing:antialiased;line-height:1.5;}
:root{--bg:#06080f;--s1:#0b0f1a;--s2:#101622;--s3:#141c2a;--bd:#1c2538;--bd2:#232f48;--or:#f97316;--or2:rgba(249,115,22,.14);--or3:rgba(249,115,22,.07);--gn:#22c55e;--gn2:rgba(34,197,94,.13);--rd:#ef4444;--rd2:rgba(239,68,68,.12);--bl:#3b82f6;--yw:#eab308;--tx:#d8e6f7;--tx2:#5a729a;--tx3:#2e3d55;}
::-webkit-scrollbar{width:0;}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes tabIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes pop{0%{transform:scale(.5);opacity:0}70%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
.a0{animation:fadeUp .28s ease both}.a1{animation:fadeUp .28s .07s ease both}.a2{animation:fadeUp .28s .14s ease both}.a3{animation:fadeUp .28s .21s ease both}
.tab-in{animation:tabIn .2s cubic-bezier(.4,0,.2,1) both}
.card{background:var(--s1);border:1px solid var(--bd);border-radius:16px;}
.card2{background:var(--s2);border:1px solid var(--bd);border-radius:12px;}
@media(hover:hover){.card:hover{border-color:var(--bd2);}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:none;border-radius:12px;font-family:inherit;font-weight:600;cursor:pointer;transition:opacity .15s,transform .12s;white-space:nowrap;}
.btn:active{opacity:.8;transform:scale(.97);}
.b-or{background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;box-shadow:0 2px 12px rgba(249,115,22,.25);}
@media(hover:hover){.b-or:hover{box-shadow:0 4px 18px rgba(249,115,22,.38);}}
.b-gh{background:var(--s2);color:var(--tx2);border:1px solid var(--bd2);}
.b-rd{background:var(--rd2);color:var(--rd);border:1px solid rgba(239,68,68,.2);}
.inp{width:100%;background:var(--s2);border:1.5px solid var(--bd);border-radius:11px;color:var(--tx);font-family:inherit;font-size:.88rem;padding:12px 14px;outline:none;transition:border-color .15s;}
.inp:focus{border-color:var(--or);box-shadow:0 0 0 3px rgba(249,115,22,.1);}
.tab-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 2px 10px;border:none;background:transparent;color:var(--tx3);cursor:pointer;font-size:.6rem;font-weight:600;font-family:inherit;letter-spacing:.04em;text-transform:uppercase;position:relative;transition:color .18s;}
.tab-btn.on{color:var(--or);}
.tab-btn::after{content:'';position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:2.5px;border-radius:2px;background:var(--or);transition:width .22s cubic-bezier(.4,0,.2,1);}
.tab-btn.on::after{width:20px;}
.pb{height:5px;background:var(--bd);border-radius:3px;overflow:hidden;}
.pf{height:100%;border-radius:3px;transition:width .9s cubic-bezier(.4,0,.2,1);}
.glass{background:rgba(6,8,14,.92);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.05);}
.tap{cursor:pointer;transition:opacity .15s,transform .12s;}.tap:active{opacity:.72;transform:scale(.98);}
@media(hover:hover){.tap:hover{opacity:.88;}}
.dz{border:2px dashed var(--bd2);border-radius:16px;transition:all .2s;}
.dz.ov{border-color:var(--or);background:var(--or3);}
.scroll-x{overflow-x:auto;scrollbar-width:none;}.scroll-x::-webkit-scrollbar{display:none;}
.pill{display:inline-flex;align-items:center;padding:5px 13px;border-radius:20px;border:1px solid var(--bd);background:transparent;cursor:pointer;font-size:.74rem;font-family:inherit;transition:all .15s;}
.pill.on{background:var(--or3);border-color:var(--or);color:var(--or);font-weight:600;}
`}</style>;

const PRESET_BGS=[
  {id:"night",css:"linear-gradient(155deg,#0f0c29,#302b63,#24243e)"},
  {id:"sunrise",css:"linear-gradient(155deg,#1a0533,#8b1a4a 45%,#fc4a1a 80%,#f7971e)"},
  {id:"forest",css:"linear-gradient(155deg,#0f2027,#203a43,#2c5364)"},
  {id:"storm",css:"linear-gradient(155deg,#141e30,#243b55)"},
  {id:"ember",css:"linear-gradient(155deg,#0d0d0d,#3d1200)"},
  {id:"dusk",css:"linear-gradient(155deg,#2d1b69,#11998e)"},
];

function drawRouteCanvas(ctx,route,ox,oy,W,H){
  if(!route||route.length<2)return;
  try{
    const pts=route.filter(p=>p&&isFinite(p.lat)&&isFinite(p.lon));if(pts.length<2)return;
    let x0=pts[0].lon,x1=pts[0].lon,y0=pts[0].lat,y1=pts[0].lat;
    for(const p of pts){if(p.lon<x0)x0=p.lon;if(p.lon>x1)x1=p.lon;if(p.lat<y0)y0=p.lat;if(p.lat>y1)y1=p.lat;}
    const pad=16,dx=x1-x0||.001,dy=y1-y0||.001;
    const tx=lon=>ox+pad+(lon-x0)/dx*(W-pad*2);const ty=lat=>oy+pad+(y1-lat)/dy*(H-pad*2);
    const step=Math.max(1,Math.floor(pts.length/150));
    const sp=pts.filter((_,i)=>i%step===0||i===pts.length-1);
    ctx.beginPath();sp.forEach((p,i)=>i===0?ctx.moveTo(tx(p.lon),ty(p.lat)):ctx.lineTo(tx(p.lon),ty(p.lat)));
    ctx.strokeStyle="rgba(249,115,22,0.7)";ctx.lineWidth=2;ctx.lineCap="round";ctx.stroke();
  }catch(e){}
}
function CoachCard({insight}){
  const[open,setOpen]=useState(false);if(!insight)return null;
  const col=IC[insight.type]||"var(--tx2)";const bg=IC_BG[insight.type]||"rgba(255,255,255,.04)";const bd=IC_BD[insight.type]||"rgba(255,255,255,.1)";
  const body=insight.detail||insight.body||null;
  return(
    <div style={{background:bg,border:"1px solid "+bd,borderRadius:12,cursor:body?"pointer":"default"}} onClick={()=>body&&setOpen(o=>!o)}>
      <div style={{padding:"12px 14px",display:"flex",alignItems:"center",gap:11}}>
        <span style={{fontSize:"1.15rem",flexShrink:0}}>{insight.icon||""}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:".88rem"}}>{insight.title}</div>
          {!open&&body&&<div style={{fontSize:".73rem",color:"var(--tx2)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{body}</div>}
        </div>
        {body&&<span style={{color:col,fontSize:".7rem",transform:open?"rotate(180deg)":"none",transition:"transform .2s"}}>▾</span>}
      </div>
      {open&&body&&<div style={{padding:"0 14px 12px 49px"}}><div style={{fontSize:".8rem",color:"var(--tx2)",lineHeight:1.6}}>{body}</div></div>}
    </div>
  );
}
function drawRunCard(ctx,act,tmpl,W,H){
  try{
    const OR="#f97316";
    const bg={"minimal":"#ffffff"}[tmpl]||"#111827";const fg={"minimal":"#0a0a0a"}[tmpl]||"#ffffff";
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    if(act.route&&act.route.length>1)drawRouteCanvas(ctx,act.route,0,0,W,H*.55);
    ctx.textAlign="center";
    ctx.fillStyle=OR;ctx.font="bold "+Math.round(H*.11)+"px system-ui";ctx.fillText(fmtKm(act.distanceKm),W/2,H*.45);
    ctx.fillStyle=fg;ctx.font="600 "+Math.round(H*.026)+"px system-ui";ctx.fillText("KM",W/2,H*.48);
    ctx.fillStyle=OR;ctx.fillRect(W*.2,H*.52,W*.6,2);
    ctx.fillStyle=fg;ctx.font="600 "+Math.round(H*.022)+"px system-ui";ctx.fillText((act.name||"Run").substring(0,28),W/2,H*.58);
    ctx.fillStyle="rgba(255,255,255,.5)";ctx.font=Math.round(H*.016)+"px system-ui";ctx.fillText(act.date+" · "+fmtPace(act.avgPaceSecKm)+"/km",W/2,H*.62);
    ctx.fillStyle=OR;ctx.font="bold "+Math.round(H*.016)+"px system-ui";ctx.textAlign="left";ctx.fillText("RUNLYTICS",W*.07,H*.068);
  }catch(e){}
}

function MiniRoute({route,W=160,H=110}){
  if(!route||!Array.isArray(route)||route.length<2)return null;
  try{
    const pts=route.filter(p=>p&&isFinite(p.lat)&&isFinite(p.lon));if(pts.length<2)return null;
    let x0=pts[0].lon,x1=pts[0].lon,y0=pts[0].lat,y1=pts[0].lat;
    for(const p of pts){if(p.lon<x0)x0=p.lon;if(p.lon>x1)x1=p.lon;if(p.lat<y0)y0=p.lat;if(p.lat>y1)y1=p.lat;}
    const pad=8,dx=x1-x0||.001,dy=y1-y0||.001;
    const tx=lon=>pad+(lon-x0)/dx*(W-pad*2);const ty=lat=>pad+(y1-lat)/dy*(H-pad*2);
    const d=pts.map((p,i)=>(i===0?"M":"L")+tx(p.lon).toFixed(1)+","+ty(p.lat).toFixed(1)).join(" ");
    const p0=pts[0],pN=pts[pts.length-1];
    return(<svg width={W} height={H} viewBox={"0 0 "+W+" "+H} style={{display:"block",borderRadius:8}}>
      <rect width={W} height={H} fill="#0d1117" rx={8}/>
      <path d={d} fill="none" stroke="#f97316" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.85}/>
      <circle cx={tx(p0.lon)} cy={ty(p0.lat)} r={4} fill="#22c55e"/>
      <circle cx={tx(pN.lon)} cy={ty(pN.lat)} r={4} fill="#ef4444"/>
    </svg>);
  }catch(e){return null;}
}

function StatRow({dark,W,durFmt,paceFmt}){
  const f=n=>Math.round(n*W/270)+"px";const fn=n=>Math.round(n*W/270);
  const tc=dark?"#0a0a0a":"#fff";const lc=dark?"rgba(0,0,0,.38)":"rgba(255,255,255,.32)";const dc=dark?"rgba(0,0,0,.1)":"rgba(255,255,255,.12)";
  return(
    <div style={{display:"flex",alignItems:"flex-start"}}>
      <div style={{flex:1}}>
        <div style={{display:"flex",alignItems:"center",gap:f(5),marginBottom:2}}>
          <span style={{fontSize:f(21),fontWeight:800,color:tc,fontFamily:"monospace"}}>{durFmt}</span>
        </div>
        <div style={{fontSize:f(6),color:lc,letterSpacing:".12em"}}>DURATION</div>
      </div>
      <div style={{width:1,height:fn(34)+"px",background:dc,flexShrink:0,marginTop:2}}/>
      <div style={{flex:1,paddingLeft:f(14)}}>
        <div style={{display:"flex",alignItems:"center",gap:f(5),marginBottom:2}}>
          <span style={{fontSize:f(21),fontWeight:800,color:tc,fontFamily:"monospace"}}>{paceFmt}</span>
        </div>
        <div style={{fontSize:f(6),color:lc,letterSpacing:".12em"}}>/KM</div>
      </div>
    </div>
  );
}

function ShareCard({type,act,W=270,H=480,bg="night",bgImg=null}){
  const dist=fmtKm(act.distanceKm);const durFmt=fmtDur(act.movingTimeSec);const paceFmt=fmtPace(act.avgPaceSecKm)+"/km";
  const hasRoute=act.route&&act.route.length>2;const runName=act.name||"Activity";
  const f=n=>Math.round(n*W/270)+"px";const fn=n=>Math.round(n*W/270);
  const d=act.dateTs?new Date(act.dateTs):null;
  const dateStr=d?d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):fmtDate(act.date);
  const OR="#f97316";const baseShell={width:W,height:H,borderRadius:18,flexShrink:0,overflow:"hidden",position:"relative"};
  const baseAnim={animation:"fadeUp .32s ease both"};

  if(type==="minimal")return(
    <div style={{...baseShell,background:"#f8f8f5",...baseAnim}}>
      <div style={{position:"absolute",top:f(22),left:f(22),fontSize:f(7),fontWeight:700,color:"rgba(0,0,0,.35)",letterSpacing:".16em"}}>RUNLYTICS</div>
      <div style={{position:"absolute",top:f(52),left:f(22),right:f(22)}}>
        <div style={{fontSize:f(92),fontWeight:900,color:"#0a0a0a",lineHeight:.85,letterSpacing:"-.04em"}}>{dist}</div>
        <div style={{fontSize:f(10),fontWeight:600,color:"rgba(0,0,0,.35)",letterSpacing:".2em",marginTop:f(8)}}>KM</div>
        <div style={{height:1,background:"rgba(0,0,0,.14)",margin:f(18)+" 0"}}/>
        <StatRow dark W={W} durFmt={durFmt} paceFmt={paceFmt}/>
      </div>
    </div>
  );

  const bgStyle=bgImg?{backgroundImage:"url("+bgImg+")",backgroundSize:"cover",backgroundPosition:"center"}:{background:(PRESET_BGS.find(p=>p.id===bg)||PRESET_BGS[0]).css};

  return(
    <div style={{...baseShell,background:"#0a0a0a",...baseAnim}}>
      <div style={{position:"absolute",top:f(22),left:f(22),fontSize:f(7),fontWeight:700,color:"rgba(255,255,255,.45)",letterSpacing:".16em"}}>RUNLYTICS</div>
      {hasRoute&&<div style={{position:"absolute",top:f(48),left:"5%",right:"5%",height:"50%",overflow:"hidden"}}><MiniRoute route={act.route} W={Math.round(W*.9)} H={Math.round(H*.5)}/></div>}
      <div style={{position:"absolute",bottom:f(24),left:f(22),right:f(22)}}>
        <div style={{display:"flex",alignItems:"baseline",gap:f(6),marginBottom:f(2)}}>
          <span style={{fontSize:f(52),fontWeight:900,color:"#fff",lineHeight:.9}}>{dist}</span>
          <span style={{fontSize:f(18),fontWeight:800,color:OR}}>KM</span>
        </div>
        <div style={{height:1,background:"rgba(255,255,255,.08)",margin:f(12)+" 0"}}/>
        <StatRow W={W} durFmt={durFmt} paceFmt={paceFmt}/>
        <div style={{marginTop:f(14)}}>
          <div style={{fontSize:f(11),fontWeight:700,color:OR,marginBottom:f(4)}}>{runName}</div>
          <div style={{fontSize:f(8),color:"rgba(255,255,255,.4)"}}>📍 {dateStr}</div>
        </div>
      </div>
    </div>
  );
}

function ShareModal({act,onClose}){
  const[idx,setIdx]=useState(0);const[busy,setBusy]=useState(false);const[mounted,setMounted]=useState(false);
  const scrollRef=useRef(null);
  useEffect(()=>{const t=requestAnimationFrame(()=>setMounted(true));return()=>cancelAnimationFrame(t);},[]);
  if(!act||typeof act.distanceKm!=="number")return(
    <div style={{position:"fixed",inset:0,zIndex:420,background:"#000",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <button style={{background:"rgba(255,255,255,.1)",border:"none",color:"rgba(255,255,255,.7)",padding:"10px 24px",borderRadius:10,cursor:"pointer"}} onClick={onClose}>Close</button>
    </div>
  );
  const TMPL=["minimal","orange","poster"];const LABELS=["Editorial","Route Art","Poster"];
  const onScroll=()=>{if(!scrollRef.current)return;setIdx(Math.round(scrollRef.current.scrollLeft/scrollRef.current.offsetWidth));};
  const doExport=async(fmt)=>{
    if(busy)return;setBusy(true);
    try{
      const W=1080,H=1920;const cv=document.createElement("canvas");cv.width=W;cv.height=H;
      const ctx=cv.getContext("2d");drawRunCard(ctx,act,TMPL[idx],W,H);
      const mimeType=fmt==="jpg"?"image/jpeg":"image/png";
      cv.toBlob(blob=>{if(!blob){setBusy(false);return;}const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="runlytics-share."+(fmt==="jpg"?"jpg":"png");a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setBusy(false);},mimeType,0.92);
    }catch(e){setBusy(false);}
  };
  return(
    <div style={{position:"fixed",inset:0,zIndex:420,background:"#000",display:"flex",flexDirection:"column"}}>
      <div style={{padding:"14px 20px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid rgba(255,255,255,.07)",flexShrink:0}}>
        <button style={{background:"none",border:"none",color:"rgba(255,255,255,.5)",fontSize:"1.3rem",cursor:"pointer",width:36}} onClick={onClose}>✕</button>
        <div style={{fontWeight:700,color:"rgba(255,255,255,.88)",fontSize:".84rem",letterSpacing:".1em"}}>SHARE ACTIVITY</div>
        <div style={{width:36}}/>
      </div>
      <div ref={scrollRef} onScroll={onScroll} style={{flex:1,display:"flex",overflowX:"auto",scrollSnapType:"x mandatory",scrollbarWidth:"none",alignItems:"center"}}>
        {mounted?TMPL.map(t=>(
          <div key={t} style={{minWidth:"100%",scrollSnapAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",padding:"12px 28px",boxSizing:"border-box"}}>
            <ShareCard type={t} act={act}/>
          </div>
        )):(
          <div style={{minWidth:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{width:270,height:480,borderRadius:18,background:"rgba(255,255,255,.04)"}}/>
          </div>
        )}
      </div>
      <div style={{padding:"14px 20px",borderTop:"1px solid rgba(255,255,255,.07)",flexShrink:0}}>
        <div style={{display:"flex",justifyContent:"center",gap:6,marginBottom:10}}>
          {TMPL.map((_,i)=><div key={i} style={{width:i===idx?20:6,height:6,borderRadius:3,background:i===idx?"var(--or)":"rgba(255,255,255,.2)",transition:"all .2s"}}/>)}
        </div>
        <div style={{fontSize:".72rem",color:"rgba(255,255,255,.35)",marginBottom:12,textAlign:"center"}}>{LABELS[idx]}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <button className="btn b-or" style={{padding:"13px",fontSize:".82rem",borderRadius:13}} onClick={()=>doExport("jpg")} disabled={busy}>{busy?"Saving...":"Save JPEG"}</button>
          <button className="btn b-gh" style={{padding:"13px",fontSize:".82rem",borderRadius:13}} onClick={()=>doExport("png")} disabled={busy}>Save PNG</button>
        </div>
      </div>
    </div>
  );
}

function RouteMapSVG({route,act}){
  const[drawn,setDrawn]=useState(false);const[hov,setHov]=useState(null);
  const svgRef=useRef(null);const canvasRef=useRef(null);
  const cumDist=useMemo(()=>{
    if(!route||route.length<2)return[];const R=6371000;let c=0;
    return route.map((p,i)=>{if(i>0){const a=route[i-1],dLa=(p.lat-a.lat)*Math.PI/180,dLo=(p.lon-a.lon)*Math.PI/180;const q=Math.sin(dLa/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(p.lat*Math.PI/180)*Math.sin(dLo/2)**2;c+=2*R*Math.asin(Math.sqrt(Math.max(0,q)));}return c;});
  },[route]);
  const map=useMemo(()=>{
    if(!route||route.length<2)return null;
    const clean=route.filter(p=>p&&isFinite(p.lat)&&isFinite(p.lon)&&p.lat>=-90&&p.lat<=90&&p.lon>=-180&&p.lon<=180);
    if(clean.length<2)return null;
    const W=360,H=280;
    let minLat=clean[0].lat,maxLat=clean[0].lat,minLon=clean[0].lon,maxLon=clean[0].lon;
    for(let i=1;i<clean.length;i++){const p=clean[i];if(p.lat<minLat)minLat=p.lat;if(p.lat>maxLat)maxLat=p.lat;if(p.lon<minLon)minLon=p.lon;if(p.lon>maxLon)maxLon=p.lon;}
    const lonR=maxLon-minLon||.01;
    const tyOf=lat=>(1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2;
    const txOf=lon=>(lon+180)/360;
    const zoom=Math.max(10,Math.min(16,Math.round(Math.log2(1080/Math.max(lonR,.005)))));
    const n=Math.pow(2,zoom);
    const txMin=Math.floor(txOf(minLon)*n)-1,txMax=Math.floor(txOf(maxLon)*n)+1;
    const tyMin=Math.floor(tyOf(maxLat)*n)-1,tyMax=Math.floor(tyOf(minLat)*n)+1;
    const tW=txMax-txMin+1,tH=tyMax-tyMin+1;if(tW<=0||tH<=0)return null;
    const sc=Math.min(W/(tW*256),H/(tH*256));const ox=(W-tW*256*sc)/2,oy=(H-tH*256*sc)/2;
    const toSX=lon=>(txOf(lon)*n-txMin)*256*sc+ox;const toSY=lat=>(tyOf(lat)*n-tyMin)*256*sc+oy;
    const tiles=[];
    for(let ty=tyMin;ty<=tyMax;ty++)for(let tx=txMin;tx<=txMax;tx++)tiles.push({k:ty+","+tx,url:"https://tile.openstreetmap.org/"+zoom+"/"+tx+"/"+ty+".png",x:(tx-txMin)*256*sc+ox,y:(ty-tyMin)*256*sc+oy,sz:256*sc});
    const MAX=600;
    const sIdx=clean.length<=MAX?Array.from({length:clean.length},(_,i)=>i):Array.from({length:MAX},(_,i)=>Math.min(Math.round(i*(clean.length-1)/(MAX-1)),clean.length-1));
    if(clean.length>MAX&&sIdx[sIdx.length-1]!==clean.length-1)sIdx.push(clean.length-1);
    const spts=sIdx.map(i=>({sx:toSX(clean[i].lon),sy:toSY(clean[i].lat),ri:i}));
    if(spts.some(p=>!isFinite(p.sx)||!isFinite(p.sy)))return null;
    const d=spts.map((p,i)=>(i===0?"M":"L")+p.sx.toFixed(1)+","+p.sy.toFixed(1)).join(" ");
    const pLen=spts.reduce((t,p,i)=>i===0?0:t+Math.hypot(p.sx-spts[i-1].sx,p.sy-spts[i-1].sy),0);
    const col=act&&act.avgPaceSecKm<270?"#22c55e":"#f97316";
    return{tiles,spts,d,pLen,col,s0:spts[0],sE:spts[spts.length-1],W,H};
  },[route,act]);
  useEffect(()=>{
    if(!map||!canvasRef.current)return;const canvas=canvasRef.current;const ctx=canvas.getContext("2d");
    ctx.fillStyle="#e8e4dc";ctx.fillRect(0,0,map.W,map.H);let active=true;
    map.tiles.forEach(t=>{const img=new Image();img.crossOrigin="anonymous";img.onload=()=>{if(active)ctx.drawImage(img,t.x,t.y,t.sz,t.sz);};img.src=t.url;});
    return()=>{active=false;};
  },[map]);
  useEffect(()=>{const t=setTimeout(()=>setDrawn(true),150);return()=>clearTimeout(t);},[]);
  if(!map)return<div style={{height:180,borderRadius:12,background:"var(--s2)",border:"1px solid var(--bd)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--tx3)",fontSize:".8rem"}}>No GPS route</div>;
  const{tiles,spts,d,pLen,col,s0,sE,W,H}=map;
  const onMove=e=>{
    if(!svgRef.current)return;const rc=svgRef.current.getBoundingClientRect();
    const mx=(e.clientX-rc.left)*W/rc.width,my=(e.clientY-rc.top)*H/rc.height;
    let minD=Infinity,best=null;for(const p of spts){const d2=Math.hypot(p.sx-mx,p.sy-my);if(d2<minD){minD=d2;best=p;}}
    if(best&&minD<22){const km=((cumDist[best.ri]||0)/1000).toFixed(2);const ttx=Math.max(35,Math.min(W-35,best.sx));const tty=best.sy>46?best.sy-14:best.sy+26;setHov({x:best.sx,y:best.sy,ttx,tty,km});}else setHov(null);
  };
  return(
    <div style={{position:"relative",borderRadius:12,overflow:"hidden",border:"1px solid #b8b0a4",boxShadow:"0 2px 14px rgba(0,0,0,.2)"}}>
      <canvas ref={canvasRef} width={W} height={H} style={{display:"block",width:"100%"}}/>
      <svg ref={svgRef} viewBox={"0 0 "+W+" "+H} style={{position:"absolute",inset:0,width:"100%",height:"100%",cursor:"crosshair"}} onMouseMove={onMove} onMouseLeave={()=>setHov(null)}>
        <path d={d} fill="none" stroke={col} strokeWidth={9} strokeOpacity={0.25} strokeLinecap="round" strokeLinejoin="round"/>
        <path d={d} fill="none" stroke={col} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={pLen.toFixed(0)} strokeDashoffset={drawn?"0":pLen.toFixed(0)}
          style={{transition:"stroke-dashoffset 1.6s cubic-bezier(.4,0,.2,1)"}}/>
        <circle cx={s0.sx} cy={s0.sy} r={8} fill="#22c55e" stroke="#fff" strokeWidth={2.5}/>
        <text x={s0.sx} y={s0.sy+4} textAnchor="middle" fontSize={7} fill="#fff" fontWeight="800">S</text>
        <circle cx={sE.sx} cy={sE.sy} r={8} fill="#ef4444" stroke="#fff" strokeWidth={2.5}/>
        <text x={sE.sx} y={sE.sy+4} textAnchor="middle" fontSize={7} fill="#fff" fontWeight="800">F</text>
        {hov&&<g>
          <circle cx={hov.x} cy={hov.y} r={5} fill="#fff" stroke={col} strokeWidth={2.5}/>
          <rect x={hov.ttx-33} y={hov.tty-12} width={66} height={16} rx={8} fill="rgba(0,0,0,.84)" stroke={col+"70"} strokeWidth={1}/>
          <text x={hov.ttx} y={hov.tty} textAnchor="middle" fontSize={8.5} fill={col} fontWeight="700">{hov.km+" km"}</text>
        </g>}
        {act&&<g>
          <rect x={W/2-56} y={H-24} width={112} height={18} rx={9} fill="rgba(0,0,0,.72)"/>
          <text x={W/2} y={H-12} textAnchor="middle" fontSize={10} fill="#fff" fontWeight="700">{fmtKm(act.distanceKm)+" km · "+fmtPace(act.avgPaceSecKm)+"/km"}</text>
        </g>}
        <text x={W-5} y={H-3} textAnchor="end" fontSize={6} fill="rgba(0,0,0,.5)">© OpenStreetMap</text>
      </svg>
    </div>
  );
}

function HomeTab({acts,analytics,goals,hrProfile,profile,tasks,onSelectAct,onUpload,onViewAll,onViewMonthly,onEditGoals}){
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
  return(<div style={{padding:"4px 0 32px"}}>
    <div className="a0" style={{marginBottom:20,paddingTop:4}}>
      <div style={{fontSize:".7rem",color:"var(--tx3)",marginBottom:3}}>{greet()}</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{fontSize:"1.45rem",fontWeight:700,lineHeight:1.2}}>{greetPfx}</div>
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
      <div style={{background:IC_BG[rec.type]||"rgba(255,255,255,.04)",border:"1px solid "+(IC_BD[rec.type]||"rgba(255,255,255,.1)"),borderRadius:12,padding:"13px 15px",display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:"1.4rem",flexShrink:0}}>{rec.icon}</span>
        <div><div style={{fontWeight:700,fontSize:".88rem",marginBottom:2}}>{rec.title}</div><div style={{fontSize:".77rem",color:"var(--tx2)",lineHeight:1.5}}>{rec.sub}</div></div>
      </div>
    </div>
    {lastRun&&(
      <div className="card a2 tap" style={{padding:18,marginBottom:14,cursor:"pointer"}} onClick={()=>onSelectAct(lastRun)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div>
            <div style={{fontSize:".6rem",fontWeight:700,color:ACT_CLR[lastRun.type]||"var(--or)",marginBottom:3,textTransform:"uppercase"}}>{lastRun.type}</div>
            <div style={{fontWeight:600,fontSize:".88rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{lastRun.name}</div>
            <div style={{fontSize:".7rem",color:"var(--tx2)",marginTop:2}}>{fmtDate(lastRun.date)}</div>
          </div>
          <span style={{background:(ACT_CLR[lastRun.type]||"var(--or)")+"20",color:ACT_CLR[lastRun.type]||"var(--or)",padding:"2px 9px",borderRadius:20,fontSize:".66rem",fontWeight:700}}>{lastRun.runClass}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          {[{v:fmtKm(lastRun.distanceKm),l:"km",c:"var(--or)"},{v:fmtPace(lastRun.avgPaceSecKm)+"/km",l:"pace",c:"var(--tx)"},{v:lastRun.avgHR?lastRun.avgHR+" bpm":"--",l:"HR",c:lastRun.avgHR&&lastRun.avgHR>mafHR?"var(--yw)":"var(--gn)"}].map(s=>(
            <div key={s.l} style={{textAlign:"center",padding:"9px 6px",background:"rgba(0,0,0,.25)",borderRadius:10}}>
              <div style={{fontSize:"1rem",fontWeight:700,color:s.c,lineHeight:1}}>{s.v}</div>
              <div style={{fontSize:".58rem",color:"var(--tx3)",marginTop:3}}>{s.l}</div>
            </div>
          ))}
        </div>
        {acts.length>1&&<div style={{marginTop:10,textAlign:"center",fontSize:".7rem"}}><span className="tap" style={{color:"var(--or)",fontWeight:600}} onClick={e=>{e.stopPropagation();onViewAll();}}>View all {acts.length} runs</span></div>}
      </div>
    )}
    {!lastRun&&(
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
            <span style={{fontSize:".76rem",color:"var(--tx2)",fontWeight:400}}> / {goals.weekly} km</span>
          </div>
          {weekPct>=1&&<span style={{background:"var(--gn2)",color:"var(--gn)",padding:"2px 9px",borderRadius:20,fontSize:".66rem",fontWeight:700}}>✓ Goal reached!</span>}
          {weekPct<1&&<div style={{fontSize:".74rem",color:"var(--tx2)"}}>{weekLeft} km to go</div>}
        </div>
        <button className="tap" style={{background:"none",border:"none",color:"var(--tx3)",fontSize:".8rem"}} onClick={onEditGoals}>Edit</button>
      </div>
    </div>
    {todayTasks.length>0&&(
      <div className="card a3" style={{padding:16,marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
          <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)"}}>Today's Habits</div>
          <span style={{fontSize:".7rem",color:"var(--tx2)"}}>{todayDone}/{todayTasks.length}</span>
        </div>
        {todayTasks.map(t=>{const done=!!(t.completions&&t.completions[todayStr]);return(
          <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <div style={{width:20,height:20,borderRadius:6,flexShrink:0,border:"2px solid "+(done?"var(--gn)":"var(--bd2)"),background:done?"var(--gn)":"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
              {done&&<span style={{fontSize:".6rem",color:"#fff",fontWeight:700}}>✓</span>}
            </div>
            <span style={{fontSize:".82rem",flex:1,color:done?"var(--tx3)":"var(--tx)",textDecoration:done?"line-through":"none"}}>{t.title}</span>
          </div>
        );})}
        <div className="pb" style={{marginTop:10}}><div className="pf" style={{width:Math.round(todayDone/(todayTasks.length||1)*100)+"%",background:"var(--gn)"}}/></div>
      </div>
    )}
    {acts.length>0&&<button className="btn b-gh" style={{width:"100%",padding:"11px",fontSize:".82rem",borderRadius:13,marginTop:4}} onClick={onViewMonthly}>📅 Monthly Report</button>}
  </div>);
}

function StatsTab({acts,analytics,onViewAll,onViewMonthly,onOpenPR}){
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
    <div style={{padding:"4px 0 32px"}}>
      <div className="a0" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:18}}>
        {[{l:"Total km",v:parseFloat(totalKm.toFixed(0)).toLocaleString(),c:"var(--or)"},{l:"Runs",v:runs.length,c:"var(--bl)"},{l:"Time",v:fmtDur(runs.reduce((s,a)=>s+a.movingTimeSec,0)),c:"var(--gn)"}].map(s=>(
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
              {[4,8,12].map(w=><button key={w} className={"pill "+(range===w?"on":"")} onClick={()=>setRange(w)} style={{padding:"3px 9px",fontSize:".68rem"}}>{w}w</button>)}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={weeklyData} barSize={20} margin={{top:0,right:0,bottom:0,left:-28}}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" vertical={false}/>
              <XAxis dataKey="week" tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:"var(--tx3)",fontSize:9}} axisLine={false} tickLine={false}/>
              <Tooltip content={({active,payload})=>{if(!active||!payload||!payload.length)return null;return<div style={{background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:8,padding:"6px 10px"}}><div style={{color:"var(--or)",fontWeight:700}}>{payload[0].value+" km"}</div></div>;}}/>
              <Bar dataKey="km" fill="var(--or)" radius={[5,5,0,0]}/>
            </BarChart>
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
              // FIX #11/#13: pass properly shaped object that PRDetailModal expects
              onClick={()=>best&&onOpenPR({cat:{icon:"🏅",label:pr.cat,color:pr.color},top3:pr.top3||[]})}>
              <div style={{padding:"12px 12px 8px",borderBottom:"1px solid "+(best?pr.color+"20":"var(--bd)")}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontSize:".6rem",fontWeight:700,color:best?pr.color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:3}}>{pr.cat}</div>
                    <div style={{fontSize:"1.25rem",fontWeight:800,color:best?pr.color:"var(--tx3)",fontFamily:"monospace",lineHeight:1}}>{best?fmtPace(best.avgPaceSecKm)+"/km":"--:--"}</div>
                  </div>
                  <span style={{fontSize:"1.2rem",opacity:best?1:.35}}>🏅</span>
                </div>
              </div>
              <div style={{padding:"8px 12px 10px"}}>
                {best?<div><div style={{fontSize:".72rem",fontWeight:600,color:"var(--tx)",marginBottom:3}}>{fmtKm(best.distanceKm)+" km"}</div><div style={{fontSize:".62rem",color:"var(--tx3)"}}>{fmtDateS(best.date)}</div></div>:<div style={{fontSize:".7rem",color:"var(--tx3)"}}>No record yet</div>}
              </div>
            </div>
          );})}
        </div>
        {!racePRs.length&&acts.length>0&&<div style={{marginTop:12,padding:"12px 14px",borderRadius:11,background:"var(--s2)",fontSize:".78rem",color:"var(--tx2)",lineHeight:1.7}}>Run near standard race distances (5K, 10K, 21K, 42K) to see PRs here.</div>}
      </div>
      {overallPRs&&(
        <div className="card a3" style={{padding:16,marginBottom:14}}>
          <SH title="Overall Bests"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[{l:"Longest",v:fmtKm(overallPRs.longest&&overallPRs.longest.distanceKm||0)+" km",c:"var(--or)",sub:overallPRs.longest?fmtDateS(overallPRs.longest.date):""},
              {l:"Best Pace",v:fmtPace(overallPRs.fastest&&overallPRs.fastest.avgPaceSecKm||0)+"/km",c:"var(--bl)",sub:overallPRs.fastest?fmtDateS(overallPRs.fastest.date):""}].map(s=>(
              <div key={s.l} className="card2" style={{padding:"13px 11px"}}>
                <div style={{fontSize:".6rem",color:"var(--tx3)",marginBottom:7}}>{s.l}</div>
                <div style={{fontSize:"1.3rem",fontWeight:700,color:s.c,lineHeight:1}}>{s.v}</div>
                <div style={{fontSize:".62rem",color:"var(--tx3)",marginTop:4}}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {runs.length>0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><button className="btn b-gh" style={{padding:"12px",fontSize:".8rem",borderRadius:13}} onClick={onViewAll}>All Runs ({acts.length})</button><button className="btn b-gh" style={{padding:"12px",fontSize:".8rem",borderRadius:13}} onClick={onViewMonthly}>Monthly</button></div>}
      {!runs.length&&<div style={{textAlign:"center",padding:"40px 0",color:"var(--tx2)"}}><div style={{fontSize:"2rem",marginBottom:8}}>📊</div><div>Upload runs to see stats</div></div>}
    </div>
  );
}

function HRTab({acts,hrProfile,onEditHR}){
  const mafHR=getMafHR(hrProfile);
  const runsWithHR=acts.filter(a=>a.avgHR&&a.distanceKm>0);
  const last5=runsWithHR.slice(0,5);
  // FIX #8: Use zone.seconds (not zone.minutes*60) — computeZones now provides seconds
  const aggZones=useMemo(()=>{
    if(!last5.length)return null;
    const secs=[0,0,0,0,0];let tot=0;
    last5.forEach(r=>{const z=computeZones(r.hrSamples,mafHR);if(z)z.forEach((zone,i)=>{secs[i]+=(zone.seconds||0);tot+=(zone.seconds||0);});});
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
      <div className="a2" style={{marginBottom:14}}><SH title="Coach Assessment"/><CoachCard insight={insight}/></div>
      {!runsWithHR.length&&<div style={{textAlign:"center",padding:"40px 0",color:"var(--tx2)"}}><div style={{fontSize:"2rem",marginBottom:8}}>❤️</div><div style={{marginBottom:12}}>No HR data yet</div><button className="btn b-or" style={{padding:"10px 20px"}} onClick={onEditHR}>Set up MAF Profile</button></div>}
    </div>
  );
}

function TasksTab({tasks,setTasks,hrProfile}){
  const todayStr=todayKey();const mafHR=getMafHR(hrProfile);
  const toggle=useCallback(id=>{
    setTasks(prev=>{
      const updated=prev.map(t=>{
        if(t.id!==id)return t;
        const done=!!(t.completions&&t.completions[todayStr]);
        const completions=Object.assign({},t.completions||{});
        if(done){delete completions[todayStr];}else{completions[todayStr]=true;}
        // FIX #4: getStreak is now defined above
        return Object.assign({},t,{completions,streak:getStreak(completions)});
      });
      saveTasks(updated);return updated;
    });
  },[todayStr]);
  const todayDone=tasks.filter(t=>t.enabled&&t.completions&&t.completions[todayStr]).length;
  const totalEnabled=tasks.filter(t=>t.enabled).length;
  const last7=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));d.setHours(0,0,0,0);return{key:d.toISOString().split("T")[0],label:d.toLocaleDateString("en-GB",{weekday:"short"}).slice(0,1)};});
  return(
    <div style={{padding:"4px 0 32px"}}>
      <div className="a0" style={{marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:8}}>
          <div>
            <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:4}}>Today's Habits</div>
            <div style={{fontSize:"1.3rem",fontWeight:700,lineHeight:1}}>
              <span style={{color:todayDone===totalEnabled?"var(--gn)":"var(--or)"}}>{todayDone}</span>
              <span style={{fontSize:".9rem",color:"var(--tx2)",fontWeight:400}}> / {totalEnabled}</span>
            </div>
          </div>
          <Ring pct={totalEnabled>0?todayDone/totalEnabled:0} size={50} color={todayDone===totalEnabled?"var(--gn)":"var(--or)"}>
            <span style={{fontSize:".55rem",fontWeight:700,color:todayDone===totalEnabled?"var(--gn)":"var(--or)"}}>{(totalEnabled>0?Math.round(todayDone/totalEnabled*100):0)+"%"}</span>
          </Ring>
        </div>
        <div className="pb" style={{height:4}}><div className="pf" style={{width:(totalEnabled>0?Math.round(todayDone/totalEnabled*100):0)+"%",background:todayDone===totalEnabled?"var(--gn)":"var(--or)"}}/></div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {tasks.filter(t=>t.enabled).map((task,i)=>{
          const done=!!(task.completions&&task.completions[todayStr]);
          // FIX #16: Handle missing icon/category/desc from old localStorage data
          const taskIcon=task.icon||"🏃";
          const detail=task.category==="hr"&&hrProfile&&hrProfile.age?"MAF = "+mafHR+" bpm · Stay below this":(task.desc||"");
          return(
            <div key={task.id} className={"card tap a"+(i<4?i:3)}
              style={{padding:"14px 15px",borderColor:done?task.color+"30":"var(--bd)",background:done?task.color+"08":"var(--s1)",transition:"all .2s",cursor:"pointer"}}
              onClick={()=>toggle(task.id)}>
              <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                <div style={{width:24,height:24,borderRadius:7,flexShrink:0,marginTop:1,border:"2.5px solid "+(done?task.color:"var(--bd2)"),background:done?task.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {done&&<span style={{color:"#fff",fontSize:".65rem",fontWeight:700}}>✓</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                    <div>
                      <div style={{fontSize:".88rem",fontWeight:600,textDecoration:done?"line-through":"none",color:done?"var(--tx2)":"var(--tx)",marginBottom:2}}>{taskIcon} {task.title}</div>
                      {detail&&<div style={{fontSize:".72rem",color:"var(--tx3)",lineHeight:1.4}}>{detail}</div>}
                    </div>
                    {task.streak>0&&<div style={{textAlign:"center",flexShrink:0}}><div style={{fontSize:".7rem",fontWeight:700,color:"var(--or)"}}>{task.streak}🔥</div></div>}
                  </div>
                  <div style={{display:"flex",gap:4,marginTop:9}}>
                    {last7.map(({key,label})=>{const comp=!!(task.completions&&task.completions[key]),isToday=key===todayStr;return(
                      <div key={key} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:comp?task.color:isToday?"var(--bd2)":"var(--bd)"}}/>
                        <div style={{fontSize:".46rem",color:"var(--tx3)"}}>{label}</div>
                      </div>
                    );})}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AchievementsTab({earnedBadges,acts,analytics,tierProgress,newTiers}){
  const[exp,setExp]=useState(null);
  // earnedBadges is a Set of IDs — .has() is correct
  const earned=BADGE_DEFS.filter(b=>earnedBadges.has(b.id));
  const pct=Math.round(earned.length/BADGE_DEFS.length*100);
  return(
    <div style={{padding:"4px 0 40px"}}>
      <div className="a0" style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}>
        <Ring pct={pct/100} size={62} color="var(--or)">
          <span style={{fontSize:".56rem",fontWeight:700,color:"var(--or)"}}>{pct}%</span>
        </Ring>
        <div>
          <div style={{fontSize:"1.3rem",fontWeight:800}}><span style={{color:"var(--or)"}}>{earned.length}</span><span style={{fontSize:".82rem",color:"var(--tx2)",fontWeight:400}}> / {BADGE_DEFS.length}</span></div>
          <div style={{fontSize:".74rem",color:"var(--tx2)",marginTop:4}}>badges earned</div>
          <div style={{fontSize:".68rem",color:"var(--tx3)",marginTop:2}}>{analytics.streak}d · {acts.length} runs</div>
        </div>
      </div>
      <div className="a1" style={{marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)"}}>Tier Progression</div>
          <div style={{fontSize:".6rem",color:"var(--tx3)"}}>Tap to expand</div>
        </div>
        {(tierProgress||[]).map(tp=>{
          const isExp=exp===tp.id;
          const c=tp.current?tp.current.color:"#6b7280";
          const isNew=newTiers&&newTiers.includes(tp.id);
          return(
            <div key={tp.id} className="card2 tap" style={{marginBottom:9,overflow:"hidden",borderColor:tp.current?c+"30":"var(--bd)",background:tp.current?c+"06":"var(--s2)",cursor:"pointer"}} onClick={()=>setExp(isExp?null:tp.id)}>
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
                        {tp.current?<span style={{fontSize:".72rem",fontWeight:700,color:c}}>{tp.current.icon} {tp.current.label}</span>:<span style={{fontSize:".7rem",color:"var(--tx3)"}}>Not started</span>}
                        <span style={{color:"var(--tx3)",fontSize:".7rem",display:"inline-block",transform:isExp?"rotate(180deg)":"none",transition:"transform .2s"}}>▾</span>
                      </div>
                    </div>
                    <div className="pb"><div className="pf" style={{width:tp.pct+"%",background:tp.current?c:"var(--tx3)"}}/></div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:5}}>
                      <span style={{fontSize:".64rem",color:"var(--tx3)"}}>{tp.progress} {tp.badge.unit}</span>
                      {tp.next?<span style={{fontSize:".64rem",color:"var(--tx2)"}}>Next: {tp.next.label} ({tp.next.req} {tp.badge.unit})</span>:<span style={{fontSize:".64rem",color:c,fontWeight:700}}>👑 Elite!</span>}
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
                        <div key={t.level} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:8,opacity:done?1:isNext?.8:.4,background:isCurr?t.color+"18":isNext?"var(--s3)":"transparent",border:isCurr?"1px solid "+t.color+"35":isNext?"1px solid var(--bd2)":"1px solid transparent"}}>
                          <span style={{fontSize:".85rem",flexShrink:0}}>{done?"✓":isNext?"▷":"○"}</span>
                          <div style={{flex:1,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <span style={{fontSize:".74rem",fontWeight:isCurr||done?600:400,color:done?t.color:"var(--tx2)"}}>{t.icon} {t.label}</span>
                            <span style={{fontSize:".68rem",color:"var(--tx3)"}}>{t.req} {tp.badge.unit}</span>
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
              <div key={b.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"10px 9px",minWidth:64,borderRadius:12,flexShrink:0,background:b.color+"15",border:"1.5px solid "+b.color+"30",animation:"pop .4s "+(i*.06)+"s both"}}>
                <span style={{fontSize:"1.6rem"}}>{b.icon}</span>
                <div style={{fontSize:".56rem",fontWeight:700,color:b.color,textAlign:"center"}}>{b.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="a3" style={{marginBottom:14}}>
        <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)",marginBottom:8}}>Locked ({BADGE_DEFS.filter(b=>!earnedBadges.has(b.id)).length})</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {BADGE_DEFS.filter(b=>!earnedBadges.has(b.id)).map(b=>(
            <div key={b.id} style={{padding:"5px 9px",borderRadius:20,border:"1px solid var(--bd)",background:"var(--s2)",display:"flex",alignItems:"center",gap:5,opacity:.6}}>
              <span style={{fontSize:".85rem",filter:"grayscale(1)"}}>{b.icon}</span>
              <span style={{fontSize:".68rem",color:"var(--tx3)"}}>{b.name}</span>
            </div>
          ))}
        </div>
      </div>
      {!acts.length&&<div style={{textAlign:"center",padding:"48px 0",color:"var(--tx2)"}}><div style={{fontSize:"3rem",marginBottom:12}}>🏅</div><div style={{fontWeight:600,marginBottom:5}}>No badges yet</div><div style={{fontSize:".82rem"}}>Upload your first run to start earning</div></div>}
    </div>
  );
}

function SettingsPanel({acts,goals,hrProfile,profile,onSaveGoals,onSaveHR,onSaveProfile,onClearAll,onClose,stravaAuth,stravaSync,onStravaConnect,onStravaSync,onStravaDisconnect}){
  const[view,setView]=useState("main");
  const[age,setAge]=useState(hrProfile.age||"");
  const[ov,setOv]=useState(hrProfile.maxHROverride||"");
  const[useOv,setUseOv]=useState(!!hrProfile.maxHROverride);
  const[wk,setWk]=useState(goals.weekly);const[mo,setMo]=useState(goals.monthly);const[nm,setNm]=useState(profile.name||"Runner");
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
            {ageNum&&!useOv&&<div style={{fontSize:".72rem",color:"var(--gn)",marginBottom:14}}>✓ MAF HR: {180-ageNum} bpm</div>}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:useOv?10:16}}>
              <div style={{width:36,height:20,borderRadius:10,background:useOv?"var(--or)":"var(--bd2)",position:"relative",cursor:"pointer",transition:"background .2s"}} onClick={()=>setUseOv(v=>!v)}>
                <div style={{position:"absolute",top:2,left:useOv?18:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
              </div>
              <span style={{fontSize:".78rem",cursor:"pointer"}} onClick={()=>setUseOv(v=>!v)}>Custom MAF override</span>
            </div>
            {useOv&&<input className="inp" type="number" min="100" max="220" placeholder="e.g. 148" value={ov} onChange={e=>setOv(e.target.value)} style={{marginBottom:14}}/>}
            {prevMaf&&(
              <div style={{marginBottom:16,padding:"12px",background:"rgba(249,115,22,.07)",border:"1px solid rgba(249,115,22,.2)",borderRadius:12}}>
                <div style={{fontSize:".7rem",color:"var(--or)",fontWeight:600,marginBottom:7}}>MAF = {prevMaf} bpm</div>
                {getMafZones(prevMaf).map(z=>(
                  <div key={z.zone} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:z.color}}/>
                    <span style={{fontSize:".72rem",flex:1}}>Zone {z.zone} {z.label}</span>
                    <span style={{fontSize:".72rem",color:z.color,fontWeight:600}}>{Math.round(z.lo)}–{Math.round(z.hi)} bpm</span>
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
                <button className="btn b-or" style={{width:"100%",padding:"12px",marginBottom:10}} onClick={onStravaSync} disabled={stravaSync&&stravaSync.loading}>
                  {stravaSync&&stravaSync.loading?"Syncing...":"🔄 Sync from Strava"}
                </button>
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
}

// FIX #2: RouteMap → RouteMapSVG (was crashing — component was named RouteMapSVG but called as RouteMap)
function Detail({act,hrProfile,onClose,onDelete,onShare}){
  const[tab,setTab]=useState("overview");
  const col=ACT_CLR[act.type]||"#6b7280";
  const mafHR=getMafHR(hrProfile);
  const zones=act.hrSamples&&act.hrSamples.length?computeZones(act.hrSamples,mafHR):null;
  return(
    <div style={{position:"fixed",inset:0,zIndex:240,background:"var(--bg)",display:"flex",flexDirection:"column",overflowY:"auto"}}>
      <div className="glass" style={{position:"sticky",top:0,zIndex:10,padding:"14px 18px 0",borderBottom:"1px solid var(--bd)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div style={{flex:1,minWidth:0,paddingRight:10}}>
            <div style={{fontSize:".62rem",fontWeight:700,color:col,marginBottom:4,textTransform:"uppercase"}}>{ACT_ICN[act.type]||"🏃"} {act.type} · {act.runClass}</div>
            <div style={{fontWeight:700,fontSize:".98rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{act.name}</div>
            <div style={{fontSize:".72rem",color:"var(--tx2)",marginTop:2}}>{fmtDate(act.date)}</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button className="btn b-rd" style={{padding:"7px 10px"}} onClick={()=>{if(window.confirm("Delete this run?"))onDelete(act.id);}}>🗑</button>
            <button className="btn b-gh" style={{padding:"7px 12px"}} onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={{display:"flex"}}>
          {["overview","heartrate","map"].map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{padding:"8px 14px",border:"none",background:"transparent",color:tab===t?"var(--or)":"var(--tx2)",fontFamily:"inherit",fontSize:".76rem",fontWeight:tab===t?600:400,cursor:"pointer",textTransform:"capitalize",borderBottom:tab===t?"2px solid var(--or)":"2px solid transparent",transition:"color .15s"}}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div style={{flex:1,padding:"18px 18px 32px"}}>
        {tab==="overview"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
              {[{l:"Distance",v:fmtKm(act.distanceKm)+" km",c:col},{l:"Pace",v:fmtPace(act.avgPaceSecKm)+"/km",c:"var(--tx)"},{l:"Time",v:fmtDur(act.movingTimeSec),c:"var(--tx)"}].map(s=>(
                <div key={s.l} className="card2" style={{padding:"12px 8px",textAlign:"center"}}>
                  <div style={{fontSize:"1.05rem",fontWeight:700,color:s.c,lineHeight:1,marginBottom:4}}>{s.v}</div>
                  <div style={{fontSize:".6rem",color:"var(--tx2)"}}>{s.l}</div>
                </div>
              ))}
            </div>
            <div className="card" style={{padding:16}}>
              {[["Elev Gain","+"+Math.round(act.elevGainM||0)+"m"],["Max HR",act.maxHR?(act.maxHR+" bpm"):"—"],["Avg HR",act.avgHR?(act.avgHR+" bpm"):"—"],["Load",String(act.trainingLoad||0)]].map(([l,v],i)=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:i<3?"1px solid var(--bd)":"none"}}>
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
                {[{l:"Avg HR",v:act.avgHR+" bpm",c:"var(--rd)"},{l:"MAF HR",v:mafHR+" bpm",c:act.avgHR<=mafHR?"var(--gn)":"var(--yw)"}].map(s=>(
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
                          <span style={{fontSize:".78rem",fontWeight:600}}>Zone {z.zone}</span>
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
              <div style={{fontSize:"2rem",marginBottom:8}}>❤️</div><div>No heart rate data</div>
            </div>
          )
        )}
        {tab==="map"&&(
          <div className="card" style={{padding:16}}>
            {/* FIX #2: was <RouteMap> — correct name is RouteMapSVG */}
            {act.route&&act.route.length>2?<RouteMapSVG route={act.route} act={act}/>:<div style={{height:160,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--tx2)"}}>No GPS route</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// FIX #6b: parseGPX call now passes only (text, filename) — removed stray hrProfile arg
function Upload({acts,hrProfile,onAdd,onClearAll}){
  const[queue,setQueue]=useState([]);const[drag,setDrag]=useState(false);const ref=useRef(null);
  const process=useCallback(async files=>{
    const gpx=Array.from(files).filter(f=>f.name.toLowerCase().endsWith(".gpx"));
    if(!gpx.length)return;
    const items=gpx.map(f=>({file:f,status:"parsing",parsed:null,error:null}));
    setQueue(items);
    const res=await Promise.all(items.map(async item=>{
      try{
        const text=await item.file.text();
        // FIX #6b: only pass text + filename (no hrProfile — parseGPX doesn't use it)
        const parsed=parseGPX(text,item.file.name);
        if(!parsed)return{...item,status:"error",error:"Could not parse GPX file"};
        const dupe=acts.some(a=>Math.abs(a.dateTs-parsed.dateTs)<60000&&Math.abs(a.distanceKm-parsed.distanceKm)<0.1);
        return{...item,status:dupe?"duplicate":"preview",parsed,error:dupe?"Already uploaded":null};
      }catch(e){return{...item,status:"error",error:e.message};}
    }));
    setQueue(res);
  },[acts]);
  const saveAll=()=>{
    const valid=queue.filter(q=>q.status==="preview"&&q.parsed);
    if(!valid.length)return;
    valid.forEach(q=>onAdd(q.parsed));
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
        <div style={{fontSize:"2.2rem",marginBottom:10}}>📁</div>
        <div style={{fontWeight:600,marginBottom:5}}>Drop GPX files here</div>
        <div style={{fontSize:".8rem",color:"var(--tx2)",marginBottom:14}}>or tap to browse</div>
        <button className="btn b-or" style={{padding:"10px 22px",fontSize:".86rem"}}>Choose files</button>
      </div>
      {queue.length>0&&(
        <div className="card a1" style={{padding:16,marginBottom:14}}>
          {queue.map((item,idx)=>(
            <div key={idx} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:idx<queue.length-1?"1px solid var(--bd)":"none"}}>
              <div style={{width:34,height:34,borderRadius:10,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:item.status==="preview"?"var(--gn2)":item.status==="error"?"var(--rd2)":"var(--s3)"}}>
                {item.status==="parsing"?<div style={{width:14,height:14,borderRadius:"50%",border:"2px solid var(--bd2)",borderTopColor:"var(--or)",animation:"spin 1s linear infinite"}}/>:item.status==="preview"?"✓":item.status==="error"?"✗":"≈"}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:".82rem",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.file.name}</div>
                {item.parsed&&<div style={{fontSize:".7rem",color:"var(--tx2)",marginTop:2}}>{fmtKm(item.parsed.distanceKm)} km · {fmtDur(item.parsed.movingTimeSec)}</div>}
                {item.error&&<div style={{fontSize:".7rem",color:"var(--rd)",marginTop:2}}>{item.error}</div>}
              </div>
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
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)"}}>Library · {acts.length} runs</div>
            <button className="btn b-rd" style={{padding:"5px 10px",fontSize:".72rem"}} onClick={onClearAll}>Clear All</button>
          </div>
          {acts.slice(0,5).map(a=>(
            <div key={a.id} className="card2" style={{padding:"11px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:34,height:34,borderRadius:9,background:(ACT_CLR[a.type]||"#6b7280")+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1rem"}}>{ACT_ICN[a.type]||"🏃"}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:".82rem",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
                <div style={{fontSize:".7rem",color:"var(--tx2)",marginTop:2}}>{fmtDateS(a.date)} · {fmtKm(a.distanceKm)} km</div>
              </div>
            </div>
          ))}
          {acts.length>5&&<div style={{fontSize:".74rem",color:"var(--tx2)",textAlign:"center",padding:"6px 0"}}>+{acts.length-5} more</div>}
        </div>
      )}
    </div>
  );
}

function MonthlyReport({acts,onClose}){
  const analytics=useMemo(()=>buildAnalytics(acts),[acts]);
  const monthly=analytics.monthlyKm||[];
  return(
    <div style={{position:"fixed",inset:0,zIndex:220,background:"var(--bg)",display:"flex",flexDirection:"column"}}>
      <div className="glass" style={{padding:"14px 18px 12px",borderBottom:"1px solid var(--bd)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontWeight:700,fontSize:"1.05rem"}}>Monthly Report</div>
        <button className="btn b-gh" style={{padding:"6px 13px",fontSize:".8rem"}} onClick={onClose}>✕ Close</button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"18px 18px 32px"}}>
        {monthly.length===0&&<div style={{textAlign:"center",padding:"60px 0",color:"var(--tx2)"}}><div style={{fontSize:"2.5rem",marginBottom:12}}>📅</div><div>No data yet</div></div>}
        {[...monthly].reverse().map(m=>(
          <div key={m.month} className="card" style={{padding:16,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontWeight:700}}>{m.month}</div>
              <span style={{fontSize:".72rem",color:"var(--tx2)"}}>{m.runs} runs</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[{l:"Distance",v:fmtKm(m.km)+" km",c:"var(--or)"},{l:"Time",v:fmtDur(m.timeSec),c:"var(--tx)"},{l:"Avg/run",v:fmtKm(m.km/m.runs)+" km",c:"var(--bl)"}].map(s=>(
                <div key={s.l} className="card2" style={{padding:"10px 8px",textAlign:"center"}}>
                  <div style={{fontSize:".95rem",fontWeight:700,color:s.c,lineHeight:1}}>{s.v}</div>
                  <div style={{fontSize:".58rem",color:"var(--tx3)",marginTop:3}}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PRDetailModal({entry,onClose,onOpenRun}){
  if(!entry)return null;
  const{cat,top3}=entry;
  const medals=["🥇","🥈","🥉"];
  return(
    <div style={{position:"fixed",inset:0,zIndex:260,background:"rgba(0,0,0,.8)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="glass" style={{width:"100%",maxWidth:430,borderRadius:"20px 20px 0 0",padding:"20px 18px 40px",border:"1px solid var(--bd)",maxHeight:"80vh",overflowY:"auto"}}>
        <div style={{width:36,height:4,borderRadius:2,background:"var(--bd2)",margin:"0 auto 14px"}}/>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <span style={{fontSize:"1.4rem"}}>{cat.icon}</span>
          <div style={{flex:1,fontWeight:700,color:cat.color}}>{cat.label}</div>
          <button className="btn b-gh" style={{padding:"5px 11px",fontSize:".76rem"}} onClick={onClose}>✕</button>
        </div>
        {(!top3||top3.length===0)
          ?<div style={{textAlign:"center",padding:"24px 0",color:"var(--tx2)"}}>No records yet</div>
          :top3.map((r,i)=>(
            <div key={r.id} className="tap"
              style={{borderRadius:12,marginBottom:10,padding:"12px 14px",cursor:"pointer",border:"1px solid "+(i===0?cat.color+"50":"var(--bd)"),background:i===0?cat.color+"08":"var(--s2)"}}
              // FIX #13: onOpenRun receives r.id (string); App resolves to activity by ID
              onClick={()=>{onClose();onOpenRun(r.id);}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:"1.3rem"}}>{medals[i]||"🏅"}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:".84rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                  <div style={{fontSize:".68rem",color:"var(--tx2)",marginTop:2}}>{fmtDateS(r.date)} · {fmtKm(r.distanceKm)} km</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontWeight:800,color:i===0?cat.color:"var(--tx)",fontFamily:"monospace"}}>{fmtRaceTime(r.movingTimeSec)}</div>
                  <div style={{fontSize:".7rem",color:"var(--tx2)"}}>{fmtPace(r.paceSecKm)}/km</div>
                </div>
                <span style={{color:"var(--tx3)",fontSize:".9rem",marginLeft:4}}>›</span>
              </div>
            </div>
          ))
        }
        <div style={{marginTop:6,textAlign:"center",fontSize:".68rem",color:"var(--tx3)"}}>Tap a run to view full details</div>
      </div>
    </div>
  );
}

// FIX #12: Renamed prop onSelect → onSelectAct to match how App calls this component
function AllRunsView({acts,onSelectAct,onClose}){
  const[filter,setFilter]=useState("all");const[search,setSearch]=useState("");
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
        <input className="inp" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search runs..." style={{marginBottom:12}}/>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:12}} className="scroll-x">
          {types.map(t=><button key={t} className={"pill "+(filter===t?"on":"")} onClick={()=>setFilter(t)} style={{flexShrink:0,textTransform:"capitalize"}}>{t==="all"?"All ("+acts.length+")":t}</button>)}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"12px 18px 32px"}}>
        {list.map(a=>{const clr=ACT_CLR[a.type]||"#6b7280";return(
          <div key={a.id} className="card2 tap" style={{padding:"12px 14px",marginBottom:8,cursor:"pointer"}} onClick={()=>onSelectAct(a)}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:36,height:36,borderRadius:10,background:clr+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1rem",flexShrink:0}}>{ACT_ICN[a.type]||"🏃"}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:".83rem",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>{a.name}</div>
                <div style={{display:"flex",gap:10,fontSize:".7rem",color:"var(--tx2)"}}>
                  <span>{fmtDateS(a.date)}</span>
                  <span style={{color:clr,fontWeight:600}}>{fmtKm(a.distanceKm)} km</span>
                  <span>{fmtPace(a.avgPaceSecKm)}/km</span>
                  {a.avgHR&&<span>HR {a.avgHR}</span>}
                </div>
              </div>
              <span style={{color:"var(--tx3)",fontSize:".8rem"}}>›</span>
            </div>
          </div>
        );})}
        <div style={{textAlign:"center",fontSize:".72rem",color:"var(--tx3)",padding:"8px 0"}}>{list.length} runs</div>
      </div>
    </div>
  );
}

const TABS=[
  {id:"home",icon:"🏠",label:"Home"},
  {id:"stats",icon:"📊",label:"Stats"},
  {id:"hr",icon:"❤️",label:"HR Zones"},
  {id:"tasks",icon:"✅",label:"Habits"},
  {id:"awards",icon:"🏆",label:"Awards"},
];

const App=()=>{
  const[acts,setActsRaw]=useState(loadActs);
  const[goals,setGoals]=useState(loadGoals);
  const[hrProfile,setHRProfile]=useState(loadHRProfile);
  const[profile,setProfile]=useState(loadProfile);
  const[tasks,setTasksRaw]=useState(loadTasks);
  const[tab,setTabRaw]=useState(()=>localStorage.getItem(TAB_KEY)||"home");
  const[detail,setDetail]=useState(null);
  const[showUpload,setShowUpload]=useState(false);
  const[showSettings,setShowSettings]=useState(false);
  const[showAllRuns,setShowAllRuns]=useState(false);
  const[showMonthly,setShowMonthly]=useState(false);
  const[shareAct,setShareAct]=useState(null);
  const[prDetail,setPrDetail]=useState(null);
  const[stravaAuth,setStravaAuth]=useState(loadStravaAuth);
  const[stravaSync,setStravaSync]=useState({loading:false,msg:""});
  const[hasUnseen,setHasUnseen]=useState(false);

  const detRef=useRef(null),setRef=useRef(null),arRef=useRef(null),monRef=useRef(null),upRef=useRef(null),shaRef=useRef(null),prRef=useRef(null);
  const isSyncingRef=useRef(false),lastSyncRef=useRef(0);

  // FIX #1: Removed feedbackRun from deps (was never declared as state — caused ReferenceError)
  useEffect(()=>{
    detRef.current=detail;setRef.current=showSettings;
    arRef.current=showAllRuns;monRef.current=showMonthly;upRef.current=showUpload;
    shaRef.current=shareAct;prRef.current=prDetail;
  },[detail,showSettings,showAllRuns,showMonthly,showUpload,shareAct,prDetail]);

  useEffect(()=>{
    history.replaceState({_rl:"root"},"");history.pushState({_rl:"s"},"");
  },[]);

  useEffect(()=>{
    const h=(e)=>{
      if(shaRef.current){setShareAct(null);history.replaceState({_rl:"s"},"");return;}
      if(prRef.current){setPrDetail(null);history.replaceState({_rl:"s"},"");return;}
      if(detRef.current){setDetail(null);history.replaceState({_rl:"s"},"");return;}
      if(setRef.current){setShowSettings(false);history.replaceState({_rl:"s"},"");return;}
      if(arRef.current){setShowAllRuns(false);history.replaceState({_rl:"s"},"");return;}
      if(monRef.current){setShowMonthly(false);history.replaceState({_rl:"s"},"");return;}
      if(upRef.current){setShowUpload(false);history.replaceState({_rl:"s"},"");return;}
      if(!e.state||e.state._rl==="root"){history.replaceState({_rl:"s"},"");}
    };
    window.addEventListener("popstate",h);return()=>window.removeEventListener("popstate",h);
  },[]);

  const back=useCallback(()=>history.back(),[]);

  const setActs=useCallback(updater=>{
    setActsRaw(prev=>{const next=typeof updater==="function"?updater(prev):updater;saveActsDebounced(next);return next;});
  },[]);
  const setTasks=useCallback(updater=>{
    setTasksRaw(prev=>{const next=typeof updater==="function"?updater(prev):updater;saveTasks(next);return next;});
  },[]);
  const setTab=useCallback(t=>{setTabRaw(t);try{localStorage.setItem(TAB_KEY,t);}catch(e){}},[]); 

  const openDetail=useCallback(act=>{history.pushState({_rl:"d"},"");setDetail(act);},[]);
  const openShare=useCallback(act=>{history.pushState({_rl:"sh"},"");setShareAct(act);},[]);
  const openPR=useCallback(entry=>{history.pushState({_rl:"pr"},"");setPrDetail(entry);},[]);
  const openSettings=useCallback(()=>{history.pushState({_rl:"se"},"");setShowSettings(true);},[]);
  const openAllRuns=useCallback(()=>{history.pushState({_rl:"a"},"");setShowAllRuns(true);},[]);
  const openMonthly=useCallback(()=>{history.pushState({_rl:"m"},"");setShowMonthly(true);},[]);
  const openUpload=useCallback(()=>{history.pushState({_rl:"u"},"");setShowUpload(true);},[]);

  const deleteAct=useCallback(id=>{setActs(p=>p.filter(a=>a.id!==id));if(detRef.current)history.back();},[setActs]);
  const addAct=useCallback(act=>{setActs(p=>{if(p.some(a=>a.id===act.id))return p;return[act,...p];});},[setActs]);

  // FIX #14: Use \u2713 (Unicode) not &#x2713; (HTML entity) in JS strings
  const doStravaSync=useCallback(async(silent=true)=>{
    if(isSyncingRef.current)return;
    if(Date.now()-lastSyncRef.current<60000)return;
    const auth=loadStravaAuth();if(!auth)return;
    isSyncingRef.current=true;lastSyncRef.current=Date.now();
    if(!silent)setStravaSync({loading:true,msg:""});else setStravaSync(p=>({...p,loading:true}));
    try{
      const token=await getStravaToken(auth);
      if(!token){setStravaSync({loading:false,msg:"Token refresh failed."});isSyncingRef.current=false;return;}
      const r=await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=30&page=1",{headers:{Authorization:"Bearer "+token}});
      if(!r.ok){setStravaSync({loading:false,msg:"Sync failed ("+r.status+")."});isSyncingRef.current=false;return;}
      const data=await r.json();
      const mapped=data.map(mapStravaActivity).filter(Boolean);
      let added=0;
      setActs(prev=>{const ids=new Set(prev.map(a=>a.id));const fresh=mapped.filter(a=>!ids.has(a.id));added=fresh.length;return fresh.length?[...fresh,...prev]:prev;});
      // FIX #14: \u2713 renders as ✓ when used as a JS string value
      setStravaSync({loading:false,msg:silent&&!added?"":added?("\u2713 "+added+" new run"+(added>1?"s":"")+" synced"):"Already up to date"});
    }catch(e){setStravaSync({loading:false,msg:"Sync failed."});}
    isSyncingRef.current=false;
  },[setActs]);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);const code=params.get("code");
    if(!code)return;
    window.history.replaceState({},"",window.location.pathname);
    (async()=>{
      try{
        const r=await fetch("/api/strava-token?code="+code);if(!r.ok)return;
        const data=await r.json();saveStravaAuth(data);setStravaAuth(data);
        setTimeout(()=>doStravaSync(false),500);
      }catch(e){}
    })();
  },[doStravaSync]);

  useEffect(()=>{
    if(stravaAuth)doStravaSync(true);
    const onFocus=()=>{if(stravaAuth&&Date.now()-lastSyncRef.current>300000)doStravaSync(true);};
    window.addEventListener("focus",onFocus);
    const t=setInterval(()=>{if(stravaAuth)doStravaSync(true);},300000);
    return()=>{window.removeEventListener("focus",onFocus);clearInterval(t);};
  },[stravaAuth,doStravaSync]);

  const analytics=useMemo(()=>buildAnalytics(acts),[acts]);
  const tierProgress=useMemo(()=>computeTierProgress(acts),[acts]);
  const earnedBadgeIds=useMemo(()=>computeEarnedBadges(acts),[acts]);
  // FIX #9: earnedBadges is a Set of IDs so AchievementsTab's .has() calls work
  const earnedBadgesSet=useMemo(()=>new Set(earnedBadgeIds),[earnedBadgeIds]);

  useEffect(()=>{
    const seen=loadSeenBadges();setHasUnseen(earnedBadgeIds.some(id=>!seen.has(id)));
  },[earnedBadgeIds]);
  useEffect(()=>{
    if(tab==="awards"){const seen=loadSeenBadges();saveSeenBadges(new Set([...seen,...earnedBadgeIds]));setHasUnseen(false);}
  },[tab,earnedBadgeIds]);

  return(
    <div style={{maxWidth:480,margin:"0 auto",minHeight:"100vh",display:"flex",flexDirection:"column",background:"var(--bg)"}}>
      <Styles/>
      <div style={{padding:"12px 16px 8px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{fontWeight:800,fontSize:"1.1rem",letterSpacing:".04em",color:"var(--or)"}}>RUNLYTICS</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {stravaSync.loading&&<div style={{width:16,height:16,borderRadius:"50%",border:"2px solid var(--or)",borderTopColor:"transparent",animation:"spin .8s linear infinite"}}/>}
          {/* FIX #14: plain {stravaSync.msg} — no dangerouslySetInnerHTML needed now msg uses unicode */}
          {stravaAuth&&!stravaSync.loading&&stravaSync.msg&&(
            <div style={{fontSize:".68rem",color:"var(--gn)",background:"var(--gn2)",padding:"2px 8px",borderRadius:20}}>{stravaSync.msg}</div>
          )}
          <button className="tap" style={{background:"none",border:"none",color:"var(--tx2)",fontSize:"1.1rem",cursor:"pointer",padding:"4px 8px"}} onClick={openSettings} aria-label="Settings">⚙️</button>
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 14px",paddingBottom:80}}>
        <div key={tab} className="tab-in">
          {tab==="home"&&<HomeTab acts={acts} analytics={analytics} goals={goals} hrProfile={hrProfile} profile={profile} tasks={tasks} onSelectAct={openDetail} onUpload={openUpload} onViewAll={openAllRuns} onViewMonthly={openMonthly} onEditGoals={openSettings}/>}
          {tab==="stats"&&<StatsTab acts={acts} analytics={analytics} onViewAll={openAllRuns} onViewMonthly={openMonthly} onOpenPR={openPR}/>}
          {tab==="hr"&&<HRTab acts={acts} hrProfile={hrProfile} onEditHR={openSettings}/>}
          {tab==="tasks"&&<TasksTab tasks={tasks} setTasks={setTasks} hrProfile={hrProfile}/>}
          {tab==="awards"&&<AchievementsTab earnedBadges={earnedBadgesSet} acts={acts} analytics={analytics} tierProgress={tierProgress} newTiers={[]}/>}
        </div>
      </div>
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"rgba(6,8,15,.97)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",borderTop:"1px solid var(--bd)",display:"flex",zIndex:100}}>
        {TABS.map(t=>(
          <button key={t.id} className={"tab-btn"+(tab===t.id?" on":"")} onClick={()=>setTab(t.id)} style={{position:"relative"}}>
            {t.id==="awards"&&hasUnseen&&<div style={{position:"absolute",top:6,right:"20%",width:7,height:7,borderRadius:"50%",background:"var(--or)",animation:"pulse 1.5s ease infinite"}}/>}
            <span style={{fontSize:"1.1rem",lineHeight:1}}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      {detail&&<Detail act={detail} hrProfile={hrProfile} onClose={back} onDelete={deleteAct} onShare={()=>openShare(detail)}/>}
      {shareAct&&<ShareModal act={shareAct} onClose={back}/>}
      {prDetail&&<PRDetailModal entry={prDetail} onClose={back}
        // FIX #13: onOpenRun receives an ID string; find the activity then open detail
        onOpenRun={id=>{setPrDetail(null);const found=acts.find(a=>a.id===id);if(found)openDetail(found);}}/>}
      {/* FIX #3: AllRuns → AllRunsView (component was named AllRunsView but called as AllRuns) */}
      {showUpload&&<Upload acts={acts} hrProfile={hrProfile} onAdd={act=>{addAct(act);back();}} onClearAll={()=>{setActs([]);back();}}/>}
      {showSettings&&<SettingsPanel acts={acts} goals={goals} hrProfile={hrProfile} profile={profile}
        onSaveGoals={g=>{setGoals(g);saveGoals(g);}} onSaveHR={p=>{setHRProfile(p);saveHRProfile(p);}}
        onSaveProfile={p=>{setProfile(p);saveProfile(p);}}
        onClearAll={()=>{setActs([]);back();}}
        stravaAuth={stravaAuth} stravaSync={stravaSync}
        onStravaConnect={()=>{
          const cid=window.__STRAVA_CLIENT_ID;
          if(!cid){alert("Strava client ID not configured.");return;}
          const redirect=encodeURIComponent(window.location.origin+window.location.pathname);
          window.location.href="https://www.strava.com/oauth/authorize?client_id="+cid+"&redirect_uri="+redirect+"&response_type=code&scope=activity:read_all";
        }}
        onStravaDisconnect={()=>{clearStravaAuth();setStravaAuth(null);setStravaSync({loading:false,msg:"Disconnected."});}}
        onStravaSync={()=>doStravaSync(false)}
        onClose={back}/>}
      {showAllRuns&&<AllRunsView acts={acts} onClose={back} onSelectAct={act=>{setShowAllRuns(false);openDetail(act);}}/>}
      {showMonthly&&<MonthlyReport acts={acts} onClose={back}/>}
    </div>
  );
};

export default App;
