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
  for(let i=0;i<365;i++){const d=new Date(today);d.setDate(d.getDate()-i);if(runDays.has(d.toDateString())){streak++;maxStreak=Math.max(maxStreak,streak);}else{streak=0;}}
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
@keyframes cardEntrance{from{opacity:0;transform:translateY(18px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes floatCard{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes successPop{0%{transform:scale(1)}35%{transform:scale(1.06)}100%{transform:scale(1)}}
@keyframes bounceIn{0%{transform:scale(.35);opacity:0}60%{transform:scale(1.14)}100%{transform:scale(1);opacity:1}}
@keyframes slideDown{from{opacity:0;transform:translateY(-7px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideUp2{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes pressDot{0%{transform:scale(1)}40%{transform:scale(.72)}100%{transform:scale(1)}}
@keyframes exportRing{to{stroke-dashoffset:0}}
.card-entrance{animation:cardEntrance .38s cubic-bezier(.34,1.56,.64,1) both}
.float-card{animation:floatCard 4s ease-in-out infinite}
.slide-down{animation:slideDown .22s ease both}
.slide-up2{animation:slideUp2 .24s ease both}
.success-pop{animation:successPop .4s ease}
.bounce-in{animation:bounceIn .45s cubic-bezier(.34,1.56,.64,1)}
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
// ── Canvas Typography System ─────────────────────────────────────────────────
// All sizes are ratios of canvas H for resolution-independence.
// Exact ratios match previous magic numbers to preserve visual parity.
const CANVAS_TYPE = {
  hero:    { ratio: 0.11,  weight: 'bold', family: 'system-ui' }, // big distance number
  unit:    { ratio: 0.026, weight: 600,    family: 'system-ui' }, // "KM" unit label
  title:   { ratio: 0.022, weight: 600,    family: 'system-ui' }, // activity name
  brand:   { ratio: 0.016, weight: 'bold', family: 'system-ui' }, // RUNLYTICS wordmark
  caption: { ratio: 0.016, weight: 400,    family: 'system-ui' }, // date · pace line
};

// ── Canvas Layout Tokens ─────────────────────────────────────────────────────
// Named positions replacing inline magic numbers. Fractions of W or H.
const CANVAS_LAYOUT = {
  padX:     0.07,   // horizontal padding (fraction of W)
  brandY:   0.068,  // RUNLYTICS baseline (fraction of H)
  heroY:    0.45,   // distance number baseline
  unitY:    0.48,   // "KM" baseline
  divX:     0.20,   // divider left edge (fraction of W)
  divY:     0.52,   // divider Y
  divW:     0.60,   // divider width (fraction of W)
  nameY:    0.58,   // activity name baseline
  captionY: 0.62,   // date/pace baseline
  routeH:   0.55,   // route occupies top fraction of H
};

// ── Canvas Primitive Functions ────────────────────────────────────────────────
function cFont(H, key) {
  const t = CANVAS_TYPE[key];
  return `${t.weight} ${Math.round(H * t.ratio)}px ${t.family}`;
}
function cDrawBg(ctx, W, H, color) {
  ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
}
function cDrawBranding(ctx, W, H, color) {
  ctx.save();
  ctx.fillStyle = color; ctx.textAlign = 'left';
  ctx.font = cFont(H, 'brand');
  ctx.fillText('RUNLYTICS', W * CANVAS_LAYOUT.padX, H * CANVAS_LAYOUT.brandY);
  ctx.restore();
}
function cDrawHero(ctx, W, H, dist, fg, accent) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = accent; ctx.font = cFont(H, 'hero');
  ctx.fillText(dist, W / 2, H * CANVAS_LAYOUT.heroY);
  ctx.fillStyle = fg; ctx.font = cFont(H, 'unit');
  ctx.fillText('KM', W / 2, H * CANVAS_LAYOUT.unitY);
  ctx.restore();
}
function cDrawDivider(ctx, W, H, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(W * CANVAS_LAYOUT.divX, H * CANVAS_LAYOUT.divY, W * CANVAS_LAYOUT.divW, 2);
  ctx.restore();
}
function cDrawTitle(ctx, W, H, name, color) {
  ctx.save();
  ctx.fillStyle = color; ctx.textAlign = 'center';
  ctx.font = cFont(H, 'title');
  ctx.fillText(name.substring(0, 28), W / 2, H * CANVAS_LAYOUT.nameY);
  ctx.restore();
}
function cDrawCaption(ctx, W, H, text, color) {
  ctx.save();
  ctx.fillStyle = color; ctx.textAlign = 'center';
  ctx.font = cFont(H, 'caption');
  ctx.fillText(text, W / 2, H * CANVAS_LAYOUT.captionY);
  ctx.restore();
}

// ── Additional Canvas Primitives ─────────────────────────────────────────────
function cDrawVignette(ctx,W,H,intensity=0.55){
  const vg=ctx.createRadialGradient(W/2,H/2,H*0.2,W/2,H/2,H*0.85);
  vg.addColorStop(0,'transparent'); vg.addColorStop(1,`rgba(0,0,0,${intensity})`);
  ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);
}
function cDrawRadialGlow(ctx,cx,cy,r,color){
  const gl=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
  gl.addColorStop(0,color); gl.addColorStop(1,'transparent');
  ctx.fillStyle=gl; ctx.fillRect(Math.max(0,cx-r),Math.max(0,cy-r),r*2,r*2);
}
function cDrawLinGrad(ctx,W,H,x0,y0,x1,y1,stops){
  const gr=ctx.createLinearGradient(x0,y0,x1,y1);
  stops.forEach(([p,c])=>gr.addColorStop(p,c));
  ctx.fillStyle=gr; ctx.fillRect(0,0,W,H);
}

// ── Per-Template Canvas Renderers ─────────────────────────────────────────────
// Each function is the sole authority for one template's full canvas output.
// Add a template: write cRenderXxx below + add one row to CANVAS_RENDERERS.

function cRenderVelocity(ctx,act,W,H){
  cDrawBg(ctx,W,H,'#faf8f4');
  cDrawLinGrad(ctx,W,H, 0,H*0.55,0,H, [[0,'transparent'],[1,'rgba(249,115,22,.07)']]);
  cDrawBranding(ctx,W,H,'rgba(0,0,0,.2)');
  ctx.save(); ctx.textAlign='center';
  ctx.fillStyle='#0a0a0a'; ctx.font=cFont(H,'hero');
  ctx.fillText(fmtKm(act.distanceKm),W/2,H*CANVAS_LAYOUT.heroY);
  ctx.fillStyle='rgba(0,0,0,.28)'; ctx.font=`600 ${Math.round(H*.018)}px system-ui`;
  ctx.fillText('KILOMETRES',W/2,H*(CANVAS_LAYOUT.unitY+.008));
  ctx.restore();
  ctx.fillStyle='#f97316'; ctx.fillRect(W*0.07,H*CANVAS_LAYOUT.divY,W*0.1,3);
  ctx.fillStyle='rgba(0,0,0,.09)'; ctx.fillRect(W*0.07+W*0.1+W*0.015,H*CANVAS_LAYOUT.divY,W*0.555,1);
  cDrawTitle(ctx,W,H,act.name||'Run','rgba(0,0,0,.75)');
  cDrawCaption(ctx,W,H,act.date+' · '+fmtPace(act.avgPaceSecKm)+'/km','rgba(0,0,0,.36)');
}

function cRenderRaceDay(ctx,act,W,H){
  cDrawBg(ctx,W,H,'#060810');
  if(act.route&&act.route.length>1){
    drawRouteCanvas(ctx,act.route,0,0,W,H*0.63);
    cDrawLinGrad(ctx,W,H, 0,H*0.28,0,H*0.65, [[0,'transparent'],[1,'#060810']]);
  }
  cDrawRadialGlow(ctx,W/2,H*0.67,W*0.55,'rgba(249,115,22,.2)');
  cDrawVignette(ctx,W,H,0.58);
  ctx.save(); ctx.textAlign='center';
  ctx.fillStyle='#fff'; ctx.font=cFont(H,'hero');
  ctx.fillText(fmtKm(act.distanceKm),W/2,H*0.70);
  ctx.fillStyle='#f97316'; ctx.font=`700 ${Math.round(H*.013)}px system-ui`;
  ctx.fillText('KILOMETRES',W/2,H*0.752);
  ctx.restore();
  cDrawBranding(ctx,W,H,'rgba(255,255,255,.22)');
  cDrawCaption(ctx,W,H,(act.name||'Run').substring(0,26)+' · '+fmtPace(act.avgPaceSecKm)+'/km','rgba(255,255,255,.32)');
}

function cRenderEndurance(ctx,act,W,H){
  cDrawBg(ctx,W,H,'#0a0c14');
  cDrawRadialGlow(ctx,W/2,0,W*0.8,'rgba(249,115,22,.06)');
  cDrawVignette(ctx,W,H,0.42);
  const px=W*CANVAS_LAYOUT.padX;
  ctx.save(); ctx.textAlign='left';
  ctx.fillStyle='rgba(255,255,255,.18)'; ctx.font=cFont(H,'brand');
  ctx.fillText('RUNLYTICS',px,H*CANVAS_LAYOUT.brandY);
  ctx.fillStyle='#fff'; ctx.font=cFont(H,'hero'); ctx.fillText(fmtKm(act.distanceKm),px,H*0.42);
  ctx.fillStyle='rgba(255,255,255,.32)'; ctx.font=cFont(H,'unit'); ctx.fillText('KM',px,H*0.468);
  ctx.fillStyle='#f97316'; ctx.fillRect(px,H*0.492,W*0.11,3);
  ctx.fillStyle='rgba(255,255,255,.06)'; ctx.fillRect(px,H*0.548,W*0.86,1);
  const mF=`700 ${Math.round(H*.026)}px monospace`;
  const lF=`600 ${Math.round(H*.014)}px system-ui`;
  const rX=W*(1-CANVAS_LAYOUT.padX);
  [[H*0.615,'DURATION',fmtDur(act.movingTimeSec)],[H*0.675,'PACE',fmtPace(act.avgPaceSecKm)+'/km']].forEach(([y,lbl,val])=>{
    ctx.textAlign='left'; ctx.fillStyle='rgba(255,255,255,.28)'; ctx.font=lF; ctx.fillText(lbl,px,y);
    ctx.textAlign='right'; ctx.fillStyle='#fff'; ctx.font=mF; ctx.fillText(val,rX,y);
  });
  ctx.restore();
  if(act.route&&act.route.length>1){
    ctx.globalAlpha=0.32; drawRouteCanvas(ctx,act.route,W*0.44,H*0.73,W*0.5,H*0.21); ctx.globalAlpha=1;
  }
}

function cRenderCinematic(ctx,act,W,H){
  cDrawBg(ctx,W,H,'#0d0520');
  cDrawLinGrad(ctx,W,H, 0,0,W,H, [[0,'rgba(100,40,180,.2)'],[0.5,'transparent'],[1,'rgba(249,115,22,.1)']]);
  if(act.route&&act.route.length>1){
    ctx.globalAlpha=0.28; drawRouteCanvas(ctx,act.route,-W*0.05,0,W*1.1,H*0.66); ctx.globalAlpha=1;
    cDrawLinGrad(ctx,W,H, 0,H*0.26,0,H*0.68, [[0,'transparent'],[1,'rgba(13,5,32,.97)']]);
  }
  cDrawVignette(ctx,W,H,0.65);
  cDrawRadialGlow(ctx,W/2,H*0.67,W*0.5,'rgba(140,70,230,.18)');
  ctx.save(); ctx.textAlign='center';
  ctx.fillStyle='#fff'; ctx.font=cFont(H,'hero'); ctx.fillText(fmtKm(act.distanceKm),W/2,H*0.71);
  ctx.fillStyle='rgba(160,90,255,.85)'; ctx.font=`700 ${Math.round(H*.013)}px system-ui`;
  ctx.fillText('KILOMETRES',W/2,H*0.758);
  ctx.restore();
  cDrawBranding(ctx,W,H,'rgba(255,255,255,.18)');
  cDrawCaption(ctx,W,H,(act.name||'Run').substring(0,28),'rgba(255,255,255,.3)');
}

function cRenderGlass(ctx,act,W,H){
  cDrawBg(ctx,W,H,'#0c1120');
  cDrawRadialGlow(ctx,W/2,H*0.12,W*0.75,'rgba(249,115,22,.06)');
  cDrawVignette(ctx,W,H,0.38);
  const gx=W*0.06,gy=H*0.1,gw=W*0.88,gh=H*0.76;
  const rad=W*0.04;
  ctx.save();
  ctx.fillStyle='rgba(255,255,255,.04)';
  ctx.strokeStyle='rgba(255,255,255,.1)'; ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(gx+rad,gy); ctx.lineTo(gx+gw-rad,gy);
  ctx.quadraticCurveTo(gx+gw,gy,gx+gw,gy+rad);
  ctx.lineTo(gx+gw,gy+gh-rad); ctx.quadraticCurveTo(gx+gw,gy+gh,gx+gw-rad,gy+gh);
  ctx.lineTo(gx+rad,gy+gh); ctx.quadraticCurveTo(gx,gy+gh,gx,gy+gh-rad);
  ctx.lineTo(gx,gy+rad); ctx.quadraticCurveTo(gx,gy,gx+rad,gy);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.09)'; ctx.fillRect(gx,gy,gw,1);
  ctx.restore();
  if(act.route&&act.route.length>1){
    ctx.globalAlpha=0.5; drawRouteCanvas(ctx,act.route,gx+gw*0.04,gy+gh*0.54,gw*0.92,gh*0.41); ctx.globalAlpha=1;
  }
  ctx.save(); ctx.textAlign='center';
  ctx.fillStyle='#fff'; ctx.font=cFont(H,'hero'); ctx.fillText(fmtKm(act.distanceKm),W/2,gy+gh*0.38);
  ctx.fillStyle='rgba(255,255,255,.28)'; ctx.font=cFont(H,'unit'); ctx.fillText('KILOMETRES',W/2,gy+gh*0.44);
  ctx.restore();
  cDrawDivider(ctx,W,H,'rgba(255,255,255,.06)');
  cDrawBranding(ctx,W,H,'rgba(255,255,255,.18)');
  cDrawCaption(ctx,W,H,(act.name||'Run').substring(0,28),'rgba(255,255,255,.28)');
}

const CANVAS_RENDERERS={velocity:cRenderVelocity,raceday:cRenderRaceDay,endurance:cRenderEndurance,cinematic:cRenderCinematic,glass:cRenderGlass};

function renderToCanvas(ctx,act,templateId,W,H){
  const render=CANVAS_RENDERERS[templateId]||CANVAS_RENDERERS.raceday;
  try{render(ctx,act,W,H);}catch(e){}
}

// ── Export Pipeline ───────────────────────────────────────────────────────────
// Single place to change canvas dimensions, quality, or MIME handling.
const EXPORT_CONFIG = { W: 1080, H: 1920, quality: 0.92 };

function canvasToBlob(canvas, format) {
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  return new Promise(resolve => canvas.toBlob(resolve, mime, EXPORT_CONFIG.quality));
}

async function downloadExport(act, templateId, format) {
  const { W, H } = EXPORT_CONFIG;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  renderToCanvas(canvas.getContext('2d'), act, templateId, W, H);
  const blob = await canvasToBlob(canvas, format);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `runlytics-share.${format === 'jpg' ? 'jpg' : 'png'}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function MiniRoute({route,W=160,H=110,glowColor='#f97316',bgColor=null}){
  const[drawn,setDrawn]=useState(false);
  useEffect(()=>{const t=setTimeout(()=>setDrawn(true),120);return()=>clearTimeout(t);},[]);

  if(!route||!Array.isArray(route)||route.length<2){
    const cx=W/2,cy=H/2,r=Math.min(W,H)*0.28;
    return(
      <svg width={W} height={H} viewBox={"0 0 "+W+" "+H} style={{display:"block",borderRadius:8}}>
        {bgColor&&<rect width={W} height={H} fill={bgColor}/>}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={glowColor} strokeWidth={1.2}
          strokeDasharray="4 3.5" opacity={0.2}/>
        <path d={"M"+(cx-r*.55)+" "+(cy+r*.2)+" C"+(cx-r*.2)+" "+(cy-r*.4)+" "+(cx+r*.2)+" "+(cy-r*.35)+" "+(cx+r*.55)+" "+(cy+r*.25)}
          fill="none" stroke={glowColor} strokeWidth={1.5} strokeLinecap="round" opacity={0.18}/>
        <text x={cx} y={cy+r+Math.min(W,H)*.13} textAnchor="middle" fill={glowColor}
          fontSize={Math.round(Math.min(W,H)*.095)} fontFamily="system-ui" opacity={0.16}>no GPS</text>
      </svg>
    );
  }

  try{
    const pts=route.filter(p=>p&&isFinite(p.lat)&&isFinite(p.lon));
    if(pts.length<2)return null;
    let x0=pts[0].lon,x1=pts[0].lon,y0=pts[0].lat,y1=pts[0].lat;
    for(const p of pts){if(p.lon<x0)x0=p.lon;if(p.lon>x1)x1=p.lon;if(p.lat<y0)y0=p.lat;if(p.lat>y1)y1=p.lat;}
    const pad=10,dx=x1-x0||.001,dy=y1-y0||.001;
    const tx=lon=>pad+(lon-x0)/dx*(W-pad*2);
    const ty=lat=>pad+(y1-lat)/dy*(H-pad*2);
    const d=pts.map((p,i)=>(i===0?"M":"L")+tx(p.lon).toFixed(1)+","+ty(p.lat).toFixed(1)).join(" ");
    const p0=pts[0],pN=pts[pts.length-1];
    const pathLen=pts.reduce((tot,p,i)=>i===0?0:tot+Math.hypot(tx(p.lon)-tx(pts[i-1].lon),ty(p.lat)-ty(pts[i-1].lat)),0);
    const fid="rg"+glowColor.replace(/[^a-z0-9]/gi,"")+W;
    return(
      <svg width={W} height={H} viewBox={"0 0 "+W+" "+H} style={{display:"block"}}>
        <defs>
          <filter id={fid} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>
          </filter>
        </defs>
        {bgColor&&<rect width={W} height={H} fill={bgColor}/>}
        <path d={d} fill="none" stroke={glowColor} strokeWidth={10} opacity={0.18}
          filter={"url(#"+fid+")"} strokeLinecap="round" strokeLinejoin="round"/>
        <path d={d} fill="none" stroke={glowColor} strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round" opacity={0.92}
          strokeDasharray={pathLen.toFixed(1)}
          strokeDashoffset={drawn?0:pathLen.toFixed(1)}
          style={{transition:drawn?'stroke-dashoffset 1.3s cubic-bezier(.4,0,.2,1)':'none'}}/>
        <circle cx={tx(p0.lon)} cy={ty(p0.lat)} r={drawn?5:0} fill="#22c55e" opacity={0.9}
          style={{transition:'r .25s .5s ease'}}/>
        <circle cx={tx(p0.lon)} cy={ty(p0.lat)} r={drawn?9:0} fill="#22c55e" opacity={0.15}
          style={{transition:'r .25s .5s ease'}}/>
        <circle cx={tx(pN.lon)} cy={ty(pN.lat)} r={drawn?5:0} fill={glowColor} opacity={0.9}
          style={{transition:'r .25s 1.1s ease'}}/>
        <circle cx={tx(pN.lon)} cy={ty(pN.lat)} r={drawn?9:0} fill={glowColor} opacity={0.15}
          style={{transition:'r .25s 1.1s ease'}}/>
      </svg>
    );
  }catch(e){return null;}
}

function StatRow({dark,W,durFmt,paceFmt}){
  const f=n=>Math.round(n*W/270)+"px";
  const fn=n=>Math.round(n*W/270);
  const tc=dark?"#1a1a1a":"#ffffff";
  const lc=dark?"rgba(0,0,0,.32)":"rgba(255,255,255,.28)";
  const dc=dark?"rgba(0,0,0,.1)":"rgba(255,255,255,.1)";
  return(
    <div style={{display:"flex",alignItems:"flex-start"}}>
      <div style={{flex:1}}>
        <span style={{fontSize:f(20),fontWeight:800,color:tc,fontFamily:"monospace",letterSpacing:"-.01em"}}>{durFmt}</span>
        <div style={{fontSize:f(5.5),color:lc,letterSpacing:".14em",marginTop:f(2)}}>DURATION</div>
      </div>
      <div style={{width:1,height:fn(30)+"px",background:dc,flexShrink:0,marginTop:fn(2)+"px"}}/>
      <div style={{flex:1,paddingLeft:f(14)}}>
        <span style={{fontSize:f(20),fontWeight:800,color:tc,fontFamily:"monospace",letterSpacing:"-.01em"}}>{paceFmt}</span>
        <div style={{fontSize:f(5.5),color:lc,letterSpacing:".14em",marginTop:f(2)}}>/KM</div>
      </div>
    </div>
  );
}

// ── React Share Card Primitives ───────────────────────────────────────────────
const CardBrand=({f,color='rgba(255,255,255,.28)'})=>(
  <div style={{fontSize:f(6),fontWeight:700,color,letterSpacing:'.2em'}}>RUNLYTICS</div>
);
const CardKilometres=({f,dist,distColor='#fff',accentColor='#f97316'})=>(
  <div>
    <div style={{fontSize:f(54),fontWeight:900,color:distColor,lineHeight:.84,letterSpacing:'-.04em'}}>{dist}</div>
    <div style={{fontSize:f(7),fontWeight:700,color:accentColor,letterSpacing:'.22em',marginTop:f(6)}}>KILOMETRES</div>
  </div>
);
const CardRule=({f,accentColor='#f97316',muteColor='rgba(255,255,255,.1)'})=>(
  <div style={{display:'flex',alignItems:'center',gap:f(8),margin:`${f(14)} 0`}}>
    <div style={{width:f(22),height:2,background:accentColor,borderRadius:1,flexShrink:0}}/>
    <div style={{flex:1,height:1,background:muteColor}}/>
  </div>
);
const CardGlass=({f,children,style={}})=>(
  <div style={{background:'rgba(255,255,255,.055)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',
    border:'1px solid rgba(255,255,255,.1)',borderRadius:f(11),
    boxShadow:'inset 0 1px 0 rgba(255,255,255,.08)',padding:`${f(12)} ${f(14)}`,...style}}>
    {children}
  </div>
);

// ── Share Card Templates ──────────────────────────────────────────────────────
function ShareCard({type,act,W=270,H=480}){
  const f=n=>Math.round(n*W/270)+"px";
  const fn=n=>Math.round(n*W/270);
  const dist=fmtKm(act.distanceKm);
  const durFmt=fmtDur(act.movingTimeSec);
  const paceFmt=fmtPace(act.avgPaceSecKm)+"/km";
  const hasRoute=act.route&&act.route.length>2;
  const runName=act.name||"Activity";
  const d=act.dateTs?new Date(act.dateTs):null;
  const dateStr=d?d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):fmtDate(act.date);
  const shell={width:W,height:H,borderRadius:fn(20)+"px",flexShrink:0,overflow:"hidden",position:"relative"};
  const anim={animation:"cardEntrance .38s cubic-bezier(.34,1.56,.64,1) both"};

  // ── VELOCITY — clean editorial, light background ──────────────────────────
  if(type==="velocity")return(
    <div style={{...shell,background:"#faf8f4",...anim}}>
      {/* Warm gradient wash */}
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:"42%",
        background:"linear-gradient(to top,rgba(249,115,22,.07) 0%,transparent 100%)",pointerEvents:"none"}}/>
      {/* Top row: wordmark + date */}
      <div style={{position:"absolute",top:f(22),left:f(22),right:f(22),display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <CardBrand f={f} color="rgba(0,0,0,.22)"/>
        <div style={{fontSize:f(7),color:"rgba(0,0,0,.25)",letterSpacing:".06em"}}>{dateStr}</div>
      </div>
      {/* Main content block */}
      <div style={{position:"absolute",top:f(56),left:f(22),right:f(22)}}>
        {/* Activity type badge */}
        <div style={{display:"inline-flex",alignItems:"center",padding:`${f(3)} ${f(9)}`,borderRadius:f(20),
          background:"rgba(0,0,0,.06)",border:"1px solid rgba(0,0,0,.07)",marginBottom:f(16)}}>
          <span style={{fontSize:f(6),fontWeight:700,color:"rgba(0,0,0,.38)",letterSpacing:".14em"}}>{(act.type||"RUN").toUpperCase()}</span>
        </div>
        {/* Giant distance hero */}
        <div style={{fontSize:f(86),fontWeight:900,color:"#0a0a0a",lineHeight:.82,letterSpacing:"-.05em",marginBottom:f(7)}}>{dist}</div>
        <div style={{fontSize:f(8),fontWeight:600,color:"rgba(0,0,0,.28)",letterSpacing:".24em",marginBottom:f(20)}}>KILOMETRES</div>
        {/* Asymmetric accent rule */}
        <div style={{display:"flex",alignItems:"center",gap:f(8),marginBottom:f(20)}}>
          <div style={{width:f(22),height:2,background:"#f97316",borderRadius:1,flexShrink:0}}/>
          <div style={{flex:1,height:1,background:"rgba(0,0,0,.1)"}}/>
        </div>
        <StatRow dark W={W} durFmt={durFmt} paceFmt={paceFmt}/>
        {/* Run name */}
        <div style={{marginTop:f(20),paddingTop:f(16),borderTop:"1px solid rgba(0,0,0,.08)"}}>
          <div style={{fontSize:f(9),fontWeight:600,color:"rgba(0,0,0,.55)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:f(3)}}>{runName}</div>
          {act.avgHR&&<div style={{display:"inline-flex",alignItems:"center",gap:f(4),padding:`${f(3)} ${f(8)}`,borderRadius:f(16),background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.12)"}}>
            <span style={{fontSize:f(7),color:"#ef4444",fontWeight:700,fontFamily:"monospace"}}>{act.avgHR}</span>
            <span style={{fontSize:f(5.5),color:"rgba(239,68,68,.65)",letterSpacing:".1em"}}>BPM</span>
          </div>}
        </div>
      </div>
    </div>
  );

  // ── RACE DAY — route as hero art on dark ─────────────────────────────────
  if(type==="raceday")return(
    <div style={{...shell,background:"#060810",...anim}}>
      {/* Route fills top */}
      {hasRoute&&(
        <div style={{position:"absolute",top:0,left:0,right:0,height:"60%",overflow:"hidden"}}>
          <MiniRoute route={act.route} W={W} H={fn(H*.62)} glowColor="#f97316"/>
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:"65%",
            background:"linear-gradient(to bottom,transparent,#060810)"}}/>
        </div>
      )}
      {/* Edge vignette */}
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 50%,transparent 35%,rgba(0,0,0,.55) 100%)",pointerEvents:"none"}}/>
      {/* Orange glow behind distance */}
      <div style={{position:"absolute",bottom:"26%",left:"50%",transform:"translateX(-50%)",
        width:f(160),height:f(48),background:"radial-gradient(ellipse at center,rgba(249,115,22,.22) 0%,transparent 70%)",filter:"blur(10px)",pointerEvents:"none"}}/>
      {/* Bottom content */}
      <div style={{position:"absolute",bottom:f(28),left:f(22),right:f(22)}}>
        <div style={{textAlign:"center",marginBottom:f(14)}}>
          <div style={{fontSize:f(54),fontWeight:900,color:"#fff",lineHeight:.86,letterSpacing:"-.04em"}}>{dist}</div>
          <div style={{fontSize:f(7),fontWeight:700,color:"#f97316",letterSpacing:".24em",marginTop:f(7)}}>KILOMETRES</div>
        </div>
        {/* Frosted glass stat panel */}
        <CardGlass f={f} style={{marginBottom:f(12)}}>
          <StatRow W={W} durFmt={durFmt} paceFmt={paceFmt}/>
        </CardGlass>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:f(7),color:"rgba(255,255,255,.3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"68%"}}>{runName}</div>
          <CardBrand f={f} color="rgba(255,255,255,.22)"/>
        </div>
      </div>
    </div>
  );

  // ── ENDURANCE — left-aligned cinematic poster ─────────────────────────────
  if(type==="endurance")return(
    <div style={{...shell,background:"#0a0c14",...anim}}>
      {/* Subtle top glow */}
      <div style={{position:"absolute",top:"-8%",left:"15%",right:"15%",height:"28%",
        background:"radial-gradient(ellipse at center,rgba(249,115,22,.06) 0%,transparent 70%)",pointerEvents:"none"}}/>
      {/* Edge darkening */}
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 50%,transparent 50%,rgba(0,0,0,.38) 100%)",pointerEvents:"none"}}/>
      {/* Content — left-aligned */}
      <div style={{position:"absolute",top:f(32),left:f(24),right:f(24)}}>
        <div style={{fontSize:f(6),fontWeight:700,color:"rgba(255,255,255,.16)",letterSpacing:".22em",marginBottom:f(28)}}>RUNLYTICS</div>
        {/* Distance block */}
        <div style={{fontSize:f(76),fontWeight:900,color:"#fff",lineHeight:.82,letterSpacing:"-.05em",marginBottom:f(8)}}>{dist}</div>
        <div style={{display:"flex",alignItems:"center",gap:f(10),marginBottom:f(26)}}>
          <div style={{width:f(26),height:3,background:"#f97316",borderRadius:1.5}}/>
          <div style={{fontSize:f(7),fontWeight:700,color:"rgba(255,255,255,.36)",letterSpacing:".18em"}}>KM</div>
        </div>
        {/* Stat list */}
        <div style={{borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:f(18)}}>
          {[["DURATION",durFmt],["PACE",paceFmt]].map(([lbl,val])=>(
            <div key={lbl} style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:f(13)}}>
              <span style={{fontSize:f(6),color:"rgba(255,255,255,.26)",letterSpacing:".14em"}}>{lbl}</span>
              <span style={{fontSize:f(16),fontWeight:700,color:"#fff",fontFamily:"monospace"}}>{val}</span>
            </div>
          ))}
          {act.avgHR&&(
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:f(13)}}>
              <span style={{fontSize:f(6),color:"rgba(255,255,255,.26)",letterSpacing:".14em"}}>HR</span>
              <span style={{fontSize:f(16),fontWeight:700,color:"#f97316",fontFamily:"monospace"}}>{act.avgHR} <span style={{fontSize:f(7),fontWeight:600,opacity:.7}}>BPM</span></span>
            </div>
          )}
        </div>
        <div style={{fontSize:f(7),color:"rgba(255,255,255,.2)",marginTop:f(8),overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{runName}</div>
      </div>
      {/* Route as decorative bottom-right art */}
      {hasRoute&&(
        <div style={{position:"absolute",bottom:f(18),right:0,width:"52%",height:"22%",overflow:"hidden",opacity:.32}}>
          <MiniRoute route={act.route} W={fn(W*.52)} H={fn(H*.22)} glowColor="#f97316"/>
        </div>
      )}
    </div>
  );

  // ── CINEMATIC — atmospheric gradient with route ghost ─────────────────────
  if(type==="cinematic")return(
    <div style={{...shell,background:"linear-gradient(160deg,#0d0520 0%,#150830 40%,#080d18 100%)",...anim}}>
      {/* Atmospheric light sources */}
      <div style={{position:"absolute",top:"-5%",left:"15%",width:"70%",height:"45%",
        background:"radial-gradient(ellipse at center,rgba(110,50,200,.18) 0%,transparent 70%)",pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:"10%",right:"10%",width:"55%",height:"35%",
        background:"radial-gradient(ellipse at center,rgba(249,115,22,.1) 0%,transparent 70%)",pointerEvents:"none"}}/>
      {/* Route as blurred background art */}
      {hasRoute&&(
        <div style={{position:"absolute",top:"-2%",left:"-5%",right:"-5%",height:"62%",overflow:"hidden",opacity:.28,filter:"blur(1.5px)"}}>
          <MiniRoute route={act.route} W={fn(W*1.1)} H={fn(H*.64)} glowColor="#a855f7"/>
        </div>
      )}
      {/* Dark gradient masking lower portion */}
      <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,transparent 22%,rgba(8,5,22,.94) 62%)",pointerEvents:"none"}}/>
      {/* Vignette */}
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 50%,transparent 38%,rgba(0,0,0,.6) 100%)",pointerEvents:"none"}}/>
      {/* Purple glow behind distance */}
      <div style={{position:"absolute",bottom:"28%",left:"50%",transform:"translateX(-50%)",
        width:f(150),height:f(44),background:"radial-gradient(ellipse at center,rgba(140,70,255,.2) 0%,transparent 70%)",filter:"blur(12px)",pointerEvents:"none"}}/>
      {/* Content */}
      <div style={{position:"absolute",bottom:f(28),left:f(22),right:f(22),textAlign:"center"}}>
        <div style={{fontSize:f(56),fontWeight:900,color:"#fff",lineHeight:.84,letterSpacing:"-.04em",marginBottom:f(8)}}>{dist}</div>
        <div style={{fontSize:f(7),fontWeight:700,color:"rgba(168,85,247,.85)",letterSpacing:".22em",marginBottom:f(16)}}>KILOMETRES</div>
        <div style={{height:1,background:"linear-gradient(to right,transparent,rgba(255,255,255,.12),transparent)",marginBottom:f(16)}}/>
        <StatRow W={W} durFmt={durFmt} paceFmt={paceFmt}/>
        <div style={{marginTop:f(14),display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:f(7),color:"rgba(255,255,255,.26)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"65%"}}>{runName}</div>
          <CardBrand f={f} color="rgba(255,255,255,.2)"/>
        </div>
      </div>
    </div>
  );

  // ── GLASS — frosted luxury card with inner panel ──────────────────────────
  return(
    <div style={{...shell,background:"linear-gradient(145deg,#0c1120 0%,#080d1a 100%)",...anim}}>
      {/* Subtle grid texture */}
      <div style={{position:"absolute",inset:0,
        backgroundImage:"linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px)",
        backgroundSize:`${f(18)} ${f(18)}`,pointerEvents:"none"}}/>
      {/* Top accent glow */}
      <div style={{position:"absolute",top:"-8%",left:"18%",right:"18%",height:"32%",
        background:"radial-gradient(ellipse at center,rgba(249,115,22,.07) 0%,transparent 70%)",pointerEvents:"none"}}/>
      {/* Main glass panel */}
      <div style={{position:"absolute",top:f(38),left:f(14),right:f(14),
        background:"rgba(255,255,255,.045)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",
        borderRadius:f(16),border:"1px solid rgba(255,255,255,.1)",overflow:"hidden"}}>
        {/* Inner top highlight */}
        <div style={{height:1,background:"linear-gradient(to right,transparent,rgba(255,255,255,.18),transparent)"}}/>
        <div style={{padding:`${f(18)} ${f(16)} ${f(14)}`}}>
          {/* Icon badge */}
          <div style={{textAlign:"center",marginBottom:f(14)}}>
            <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
              width:f(36),height:f(36),borderRadius:"50%",
              background:"rgba(249,115,22,.12)",border:"1px solid rgba(249,115,22,.2)",
              fontSize:f(17),marginBottom:f(12)}}>🏃</div>
            <div style={{fontSize:f(56),fontWeight:900,color:"#fff",lineHeight:.84,letterSpacing:"-.04em"}}>{dist}</div>
            <div style={{fontSize:f(7),fontWeight:600,color:"rgba(255,255,255,.28)",letterSpacing:".2em",marginTop:f(6)}}>KILOMETRES</div>
          </div>
          <div style={{height:1,background:"rgba(255,255,255,.07)",marginBottom:f(14)}}/>
          <StatRow W={W} durFmt={durFmt} paceFmt={paceFmt}/>
        </div>
        {/* Route inside glass */}
        {hasRoute&&(
          <div style={{margin:`0 ${f(4)} ${f(4)}`,borderRadius:f(10),overflow:"hidden",border:"1px solid rgba(255,255,255,.06)"}}>
            <MiniRoute route={act.route} W={W-fn(14)*2-fn(8)} H={fn((W-fn(14)*2-fn(8))*.45)} glowColor="#f97316" bgColor="#0a0e1a"/>
          </div>
        )}
      </div>
      {/* Below-panel info */}
      <div style={{position:"absolute",bottom:f(20),left:f(22),right:f(22),display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:f(8),fontWeight:500,color:"rgba(255,255,255,.4)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"72%"}}>{runName}</div>
        <CardBrand f={f} color="rgba(255,255,255,.2)"/>
      </div>
    </div>
  );
}

// ── Share Modal UI Style Constants ────────────────────────────────────────────
const SHARE_UI={
  shell:      {position:"fixed",inset:0,zIndex:420,background:"#060810",display:"flex",flexDirection:"column",overscrollBehavior:"contain"},
  floatClose: {position:"absolute",top:16,right:16,zIndex:10,background:"rgba(255,255,255,.1)",
    backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",
    border:"1px solid rgba(255,255,255,.12)",color:"rgba(255,255,255,.7)",
    width:34,height:34,borderRadius:"50%",fontSize:".8rem",cursor:"pointer",
    display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"},
  carousel:   {flex:1,display:"flex",overflowX:"auto",scrollSnapType:"x mandatory",
    scrollbarWidth:"none",WebkitOverflowScrolling:"touch",alignItems:"center",paddingTop:8},
  slide:      {minWidth:"100%",scrollSnapAlign:"center",display:"flex",
    alignItems:"center",justifyContent:"center",padding:"0 20px",boxSizing:"border-box"},
  footer:     {padding:"18px 20px 30px",flexShrink:0},
  skeleton:   {width:270,height:480,borderRadius:20,background:"rgba(255,255,255,.04)",
    border:"1px solid rgba(255,255,255,.06)"},
  dot:        (active)=>({width:active?22:6,height:6,borderRadius:3,
    background:active?"#f97316":"rgba(255,255,255,.18)",
    transition:"all .3s cubic-bezier(.4,0,.2,1)"}),
};

// Template registry — add new template: implement above + add row here
const SHARE_TEMPLATES=[
  {id:"velocity",  label:"Velocity",   sub:"Clean editorial"},
  {id:"raceday",   label:"Race Day",   sub:"Route art"},
  {id:"endurance", label:"Endurance",  sub:"Cinematic poster"},
  {id:"cinematic", label:"Cinematic",  sub:"Atmospheric"},
  {id:"glass",     label:"Glass",      sub:"Frosted luxury"},
];

function ShareModal({act,onClose,onOpenEditor}){
  const[idx,setIdx]=useState(0);
  const[exportState,setExportState]=useState('idle'); // idle|exporting|success
  const[exportFmt,setExportFmt]=useState('');
  const[mounted,setMounted]=useState(false);
  const scrollRef=useRef(null);
  const slideRefs=useRef([]);  // direct DOM refs for depth scaling
  const rafRef=useRef(null);
  const scrollTimerRef=useRef(null);

  useEffect(()=>{const t=requestAnimationFrame(()=>setMounted(true));return()=>cancelAnimationFrame(t);},[]);

  // Depth carousel: scale slides via direct DOM manipulation to avoid React re-renders on every scroll frame
  useEffect(()=>{
    if(!mounted||!scrollRef.current)return;
    const carousel=scrollRef.current;

    const updateScales=()=>{
      const{scrollLeft,offsetWidth}=carousel;
      if(!offsetWidth)return;
      const pos=scrollLeft/offsetWidth;
      slideRefs.current.forEach((el,i)=>{
        if(!el)return;
        const dist=Math.min(Math.abs(i-pos),1);
        el.style.transform=`scale(${(1-dist*0.09).toFixed(3)})`;
        el.style.opacity=(1-dist*0.28).toFixed(3);
      });
      setIdx(Math.round(pos));
    };

    const onScroll=()=>{
      // Drop transitions during scroll so scaling tracks finger without lag
      slideRefs.current.forEach(el=>{if(el)el.style.transition='none';});
      cancelAnimationFrame(rafRef.current);
      rafRef.current=requestAnimationFrame(updateScales);
      // Restore transitions ~150ms after scroll settles (for programmatic jumps)
      clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current=setTimeout(()=>{
        slideRefs.current.forEach(el=>{if(el)el.style.transition='transform .3s ease,opacity .3s ease';});
      },150);
    };

    carousel.addEventListener('scroll',onScroll,{passive:true});
    updateScales();
    return()=>{
      carousel.removeEventListener('scroll',onScroll);
      cancelAnimationFrame(rafRef.current);
      clearTimeout(scrollTimerRef.current);
    };
  },[mounted]);

  if(!act||typeof act.distanceKm!=='number')return(
    <div style={SHARE_UI.shell}><button style={SHARE_UI.floatClose} onClick={onClose}>✕</button></div>
  );

  const jumpTo=i=>{
    if(!scrollRef.current)return;
    // Restore transitions before programmatic scroll
    slideRefs.current.forEach(el=>{if(el)el.style.transition='transform .3s ease,opacity .3s ease';});
    scrollRef.current.scrollTo({left:i*scrollRef.current.offsetWidth,behavior:'smooth'});
    setIdx(i);
  };

  const doExport=async fmt=>{
    if(exportState!=='idle')return;
    setExportFmt(fmt);setExportState('exporting');
    try{
      await downloadExport(act,SHARE_TEMPLATES[idx].id,fmt);
      setExportState('success');
      setTimeout(()=>setExportState('idle'),2500);
    }catch{setExportState('idle');}
  };

  const tmpl=SHARE_TEMPLATES[idx];

  return(
    <div style={SHARE_UI.shell}>
      <button style={SHARE_UI.floatClose} onClick={onClose}>✕</button>

      {/* Depth carousel — previews scale with scroll position via direct DOM manipulation */}
      <div ref={scrollRef} style={SHARE_UI.carousel}>
        {mounted?SHARE_TEMPLATES.map((t,i)=>(
          <div key={t.id} style={SHARE_UI.slide}>
            {/* This div receives direct style mutations from the scroll RAF */}
            <div ref={el=>slideRefs.current[i]=el}
              style={{transition:'transform .3s ease,opacity .3s ease',willChange:'transform,opacity',
                display:'flex',alignItems:'center',justifyContent:'center'}}>
              {/* Floating wrapper — active card gently bobs when carousel is settled */}
              <div style={{animation:i===idx?'floatCard 4.2s ease-in-out infinite':'none',willChange:'transform'}}>
                <ShareCard type={t.id} act={act}/>
              </div>
            </div>
          </div>
        )):(
          <div style={{minWidth:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
            {/* Animated shimmer skeleton */}
            <div style={{...SHARE_UI.skeleton,
              background:'linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.08) 50%,rgba(255,255,255,.04) 75%)',
              backgroundSize:'200% 100%',animation:'shimmer 1.6s ease infinite'}}/>
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div style={SHARE_UI.footer}>

        {/* Template label — re-animates on idx change via key */}
        <div key={tmpl.id} style={{textAlign:'center',marginBottom:14,animation:'slideDown .2s ease'}}>
          <div style={{fontSize:'1rem',fontWeight:700,color:'#fff',letterSpacing:'.02em',lineHeight:1.2}}>{tmpl.label}</div>
          <div style={{fontSize:'.65rem',color:'rgba(255,255,255,.28)',marginTop:4,letterSpacing:'.1em'}}>
            {tmpl.sub} · {idx+1} of {SHARE_TEMPLATES.length}
          </div>
        </div>

        {/* Dot indicators — tappable with press feedback */}
        <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:5,marginBottom:18}}>
          {SHARE_TEMPLATES.map((_,i)=>(
            <button key={i} onClick={()=>jumpTo(i)}
              style={{background:'none',border:'none',padding:5,cursor:'pointer',display:'flex',alignItems:'center',
                WebkitTapHighlightColor:'transparent'}}
              onPointerDown={e=>e.currentTarget.style.transform='scale(.75)'}
              onPointerUp={e=>e.currentTarget.style.transform='scale(1)'}
              onPointerLeave={e=>e.currentTarget.style.transform='scale(1)'}>
              <div style={SHARE_UI.dot(i===idx)}/>
            </button>
          ))}
        </div>

        {/* Export — three distinct states: idle → exporting → success */}
        {exportState==='idle'&&(
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:8,animation:'slideUp2 .22s ease'}}>
            <button className="btn b-or" style={{padding:'14px',fontSize:'.84rem',borderRadius:14,fontWeight:700,letterSpacing:'.03em'}}
              onClick={()=>doExport('jpg')}>Save JPEG</button>
            <button className="btn b-gh" style={{padding:'14px',fontSize:'.84rem',borderRadius:14,fontWeight:600}}
              onClick={()=>doExport('png')}>Save PNG</button>
          </div>
        )}
        {exportState==='exporting'&&(
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,padding:'14px',
            borderRadius:14,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',
            marginBottom:8}}>
            <div style={{width:18,height:18,borderRadius:'50%',border:'2px solid rgba(255,255,255,.15)',
              borderTopColor:'#f97316',animation:'spin .7s linear infinite',flexShrink:0}}/>
            <span style={{color:'rgba(255,255,255,.52)',fontSize:'.84rem'}}>
              Preparing {exportFmt.toUpperCase()}…
            </span>
          </div>
        )}
        {exportState==='success'&&(
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,padding:'14px',
            borderRadius:14,background:'rgba(34,197,94,.1)',border:'1px solid rgba(34,197,94,.22)',
            marginBottom:8,animation:'successPop .4s ease'}}>
            <span style={{fontSize:'1.15rem',animation:'bounceIn .45s cubic-bezier(.34,1.56,.64,1)'}}>✓</span>
            <span style={{color:'#22c55e',fontSize:'.84rem',fontWeight:600}}>Saved to downloads</span>
          </div>
        )}

        {/* Custom editor entry */}
        {onOpenEditor&&(
          <button onClick={()=>onOpenEditor(act)}
            style={{width:'100%',padding:'10px',borderRadius:12,border:'1px solid rgba(255,255,255,.1)',
              background:'transparent',color:'rgba(255,255,255,.4)',fontSize:'.76rem',cursor:'pointer',
              fontFamily:'inherit',fontWeight:500,letterSpacing:'.04em',
              display:'flex',alignItems:'center',justifyContent:'center',gap:7,
              transition:'color .15s,border-color .15s'}}
            onPointerEnter={e=>{e.currentTarget.style.color='rgba(255,255,255,.65)';e.currentTarget.style.borderColor='rgba(255,255,255,.2)';}}
            onPointerLeave={e=>{e.currentTarget.style.color='rgba(255,255,255,.4)';e.currentTarget.style.borderColor='rgba(255,255,255,.1)';}}>
            <span style={{fontSize:'.88rem'}}>🎨</span> Custom Editor — full control
          </button>
        )}
        <div style={{textAlign:'center',marginTop:8,fontSize:'.6rem',color:'rgba(255,255,255,.13)',letterSpacing:'.08em'}}>
          1080 × 1920 · Instagram Story size
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
  const[ov,setOv]=useState(hrProfile.overrideMAF||"");
  const[useOv,setUseOv]=useState(!!hrProfile.overrideMAF);
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
              <button className="btn b-gh" style={{padding:"12px 14px"}} onClick={()=>{onSaveHR({age:null,restingHR:null,overrideMAF:null});setView("main");}}>Clear</button>
              <button className="btn b-or" style={{flex:1,padding:"12px"}} onClick={()=>{onSaveHR({age:ageNum,restingHR:null,overrideMAF:useOv&&parseInt(ov)?parseInt(ov):null});setView("main");}}>Save</button>
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


// ═══════════════════════════════════════════════════════════════════════════
// SHARE CUSTOM EDITOR — Phase 3
// Drag-and-position, live-preview, multi-layer card builder
// Builds on Phase 1 canvas infrastructure (cDrawVignette, cDrawRadialGlow,
// drawRouteCanvas, EXPORT_CONFIG, canvasToBlob, hexToRgba)
// ═══════════════════════════════════════════════════════════════════════════

const EDITOR_PRESETS_KEY = 'runlytics_share_presets_v1';

const ACCENT_PRESETS = ['#f97316','#22c55e','#3b82f6','#a855f7','#ef4444','#eab308','#06b6d4','#ec4899','#ffffff'];
const BG_PRESETS     = ['#060810','#0a0c14','#111827','#0d0520','#050505','#1a0a30','#0a1628','#faf8f4'];

const EDITOR_DEFAULTS = {
  bg: {
    type: 'color', color: '#060810',
    gradAngle: 155, gradStop1: '#0d0520', gradStop2: '#1a0835',
    imageData: null, imageX: 50, imageY: 50, imageZoom: 100,
    blur: 0, brightness: 100, overlayColor: '#000000', overlayOpacity: 0,
  },
  fx: {
    vignette: 0.35, grain: 0,
    glowActive: false, glowColor: '#f97316',
    glowX: 50, glowY: 65, glowRadius: 45, glowOpacity: 0.2,
  },
  elements: {
    route:    { x: 50, y: 26, scale: 1,    visible: true  },
    distance: { x: 50, y: 61, scale: 1,    visible: true  },
    stats:    { x: 50, y: 75, scale: 1,    visible: true  },
    name:     { x: 50, y: 84, scale: 0.9,  visible: true  },
    branding: { x: 8,  y: 6,  scale: 1,    visible: true  },
  },
  style: { accentColor: '#f97316', textColor: '#ffffff' },
};

// Safe merge: saved state fields override defaults, missing fields fall back
function mergeEditorState(saved) {
  const d = EDITOR_DEFAULTS;
  if (!saved || typeof saved !== 'object') return d;
  const mergeObj = (def, src) => ({ ...def, ...(src && typeof src === 'object' ? src : {}) });
  return {
    bg:       mergeObj(d.bg,    saved.bg),
    fx:       mergeObj(d.fx,    saved.fx),
    elements: {
      route:    mergeObj(d.elements.route,    saved.elements?.route),
      distance: mergeObj(d.elements.distance, saved.elements?.distance),
      stats:    mergeObj(d.elements.stats,    saved.elements?.stats),
      name:     mergeObj(d.elements.name,     saved.elements?.name),
      branding: mergeObj(d.elements.branding, saved.elements?.branding),
    },
    style: mergeObj(d.style, saved.style),
  };
}

// ── Canvas export for custom editor ──────────────────────────────────────────
async function exportCustomCard(act, state, format) {
  const { W, H } = EXPORT_CONFIG;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const { bg, fx, elements: el, style: st } = state;

  // 1. Background
  if (bg.type === 'gradient') {
    const ang = bg.gradAngle * Math.PI / 180;
    const len = Math.sqrt(W * W + H * H) * 0.55;
    const gr = ctx.createLinearGradient(W/2 - Math.cos(ang)*len, H/2 - Math.sin(ang)*len, W/2 + Math.cos(ang)*len, H/2 + Math.sin(ang)*len);
    gr.addColorStop(0, bg.gradStop1); gr.addColorStop(1, bg.gradStop2);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  } else if (bg.type === 'image' && bg.imageData) {
    await new Promise(res => {
      const img = new Image();
      img.onload = () => {
        if (bg.brightness !== 100) ctx.filter = `brightness(${bg.brightness / 100})`;
        const sc = Math.max(W / img.width, H / img.height) * (bg.imageZoom / 100);
        const dw = img.width * sc, dh = img.height * sc;
        ctx.drawImage(img, (W - dw) * bg.imageX / 100, (H - dh) * bg.imageY / 100, dw, dh);
        ctx.filter = 'none'; res();
      };
      img.onerror = () => { cDrawBg(ctx, W, H, '#060810'); res(); };
      img.src = bg.imageData;
    });
  } else {
    cDrawBg(ctx, W, H, bg.color || '#060810');
  }
  if (bg.overlayOpacity > 0) {
    ctx.globalAlpha = bg.overlayOpacity;
    ctx.fillStyle = bg.overlayColor || '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // 2. Route
  if (el.route.visible && act.route?.length > 1) {
    const rW = Math.round(W * 0.82 * el.route.scale);
    const rH = Math.round(rW * 0.55);
    drawRouteCanvas(ctx, act.route, Math.round(el.route.x / 100 * W - rW / 2), Math.round(el.route.y / 100 * H - rH / 2), rW, rH);
  }

  // 3. FX
  if (fx.vignette > 0) cDrawVignette(ctx, W, H, fx.vignette);
  if (fx.glowActive) cDrawRadialGlow(ctx, fx.glowX / 100 * W, fx.glowY / 100 * H, fx.glowRadius / 100 * W, hexToRgba(fx.glowColor, fx.glowOpacity));

  // 4. Elements
  if (el.distance.visible) {
    const sc = el.distance.scale, dX = el.distance.x / 100 * W, dY = el.distance.y / 100 * H;
    ctx.save(); ctx.textAlign = 'center';
    ctx.fillStyle = st.textColor; ctx.font = `900 ${Math.round(H * 0.11 * sc)}px system-ui`;
    ctx.fillText(fmtKm(act.distanceKm), dX, dY);
    ctx.fillStyle = st.accentColor; ctx.font = `700 ${Math.round(H * 0.013 * sc)}px system-ui`;
    ctx.fillText('KILOMETRES', dX, dY + Math.round(H * 0.048 * sc));
    ctx.restore();
  }
  if (el.stats.visible) {
    const sc = el.stats.scale, sX = el.stats.x / 100 * W, sY = el.stats.y / 100 * H, hw = W * 0.36 * sc;
    const vF = `700 ${Math.round(H * 0.022 * sc)}px monospace`;
    const lF = `600 ${Math.round(H * 0.012 * sc)}px system-ui`;
    ctx.save();
    [[sY, 'DURATION', fmtDur(act.movingTimeSec)], [sY + Math.round(H * 0.042 * sc), 'PACE', fmtPace(act.avgPaceSecKm) + '/km']].forEach(([y, lbl, val], i) => {
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.font = lF;
      ctx.fillText(lbl, sX - hw, y - (i === 0 ? Math.round(H * 0.006) : 0));
      ctx.textAlign = 'right'; ctx.fillStyle = st.textColor; ctx.font = vF;
      ctx.fillText(val, sX + hw, y);
    });
    ctx.restore();
  }
  if (el.name.visible) {
    ctx.save(); ctx.textAlign = 'center'; ctx.globalAlpha = 0.42; ctx.fillStyle = st.textColor;
    ctx.font = `500 ${Math.round(H * 0.016 * el.name.scale)}px system-ui`;
    ctx.fillText((act.name || 'Activity').substring(0, 32), el.name.x / 100 * W, el.name.y / 100 * H);
    ctx.restore();
  }
  if (el.branding.visible) {
    ctx.save(); ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.font = `700 ${Math.round(H * 0.016 * el.branding.scale)}px system-ui`;
    ctx.fillText('RUNLYTICS', el.branding.x / 100 * W, el.branding.y / 100 * H);
    ctx.restore();
  }

  // 5. Grain (last — applied to pixel data)
  if (fx.grain > 0) {
    const id = ctx.getImageData(0, 0, W, H); const d = id.data; const str = fx.grain * 55;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * str; d[i] += n; d[i+1] += n; d[i+2] += n; }
    ctx.putImageData(id, 0, 0);
  }

  const blob = await canvasToBlob(canvas, format);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `runlytics-custom.${format === 'jpg' ? 'jpg' : 'png'}`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Editor UI Primitives ──────────────────────────────────────────────────────
function Slider({ label, value, min=0, max=1, step=0.05, onChange, unit='', pct=false }) {
  const rafRef = useRef(null);
  const display = pct ? Math.round(value * 100) + '%' : (step < 1 ? value.toFixed(2) : Math.round(value)) + unit;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom: 5 }}>
        <span style={{ fontSize:'.68rem', color:'rgba(255,255,255,.4)', letterSpacing:'.08em' }}>{label}</span>
        <span style={{ fontSize:'.68rem', color:'rgba(255,255,255,.65)', fontFamily:'monospace' }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => {
          const val = parseFloat(e.target.value);
          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(() => onChange(val));
        }}
        style={{ width:'100%', height:4, cursor:'pointer', accentColor:'#f97316', display:'block' }}/>
    </div>
  );
}

function EditorToggle({ label, value, onChange }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
      <span style={{ fontSize:'.76rem', color:'rgba(255,255,255,.62)' }}>{label}</span>
      <div style={{ width:36, height:20, borderRadius:10, background:value?'#f97316':'rgba(255,255,255,.12)',
        position:'relative', cursor:'pointer', transition:'background .18s', flexShrink:0 }}
        onClick={() => onChange(!value)}>
        <div style={{ position:'absolute', top:2, left:value?18:2, width:16, height:16, borderRadius:'50%',
          background:'#fff', transition:'left .18s', boxShadow:'0 1px 4px rgba(0,0,0,.35)' }}/>
      </div>
    </div>
  );
}

function SwatchRow({ label, value, onChange, presets }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ fontSize:'.68rem', color:'rgba(255,255,255,.4)', letterSpacing:'.08em', marginBottom:8 }}>{label}</div>}
      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
        {presets.map(c => (
          <div key={c} onClick={() => onChange(c)} style={{
            width:22, height:22, borderRadius:'50%', background:c, cursor:'pointer', flexShrink:0,
            border: c === value ? '2.5px solid #fff' : '2px solid rgba(255,255,255,.1)',
            boxShadow: c === value ? '0 0 0 2px #f97316' : 'none', transition:'box-shadow .15s' }}/>
        ))}
        <label style={{ display:'flex', cursor:'pointer' }}>
          <input type="color" value={value} onChange={e => onChange(e.target.value)}
            style={{ width:22, height:22, borderRadius:'50%', border:'2px solid rgba(255,255,255,.15)',
              cursor:'pointer', padding:0, background:'transparent' }}/>
        </label>
      </div>
    </div>
  );
}

// ── Live Preview Card ─────────────────────────────────────────────────────────
function EditorPreview({ act, state, W, H, cardRef, selected, onSelect, onDragStart }) {
  const fn = n => Math.round(n * W / 270);
  const f  = n => fn(n) + 'px';
  const { bg, fx, elements: el, style: st } = state;
  const dist     = fmtKm(act.distanceKm);
  const durFmt   = fmtDur(act.movingTimeSec);
  const paceFmt  = fmtPace(act.avgPaceSecKm) + '/km';
  const hasRoute = act.route && act.route.length > 2;
  const runName  = (act.name || 'Activity').substring(0, 28);

  const bgStyle = useMemo(() => {
    if (bg.type === 'gradient') return { background: `linear-gradient(${bg.gradAngle}deg,${bg.gradStop1},${bg.gradStop2})` };
    if (bg.type === 'image' && bg.imageData) return {
      backgroundImage: `url(${bg.imageData})`, backgroundSize: `${bg.imageZoom}%`,
      backgroundPosition: `${bg.imageX}% ${bg.imageY}%`, backgroundRepeat: 'no-repeat',
      filter: `brightness(${bg.brightness / 100}) blur(${bg.blur}px)`,
    };
    return { background: bg.color };
  }, [bg]);

  const SNAP_THRESH = 3.5;
  const SNAP_PTS = [0, 25, 33.3, 50, 66.7, 75, 100];

  const dragProps = useCallback((key) => ({
    onPointerDown: e => { e.preventDefault(); e.stopPropagation(); onDragStart(key, e, SNAP_PTS, SNAP_THRESH); },
    onClick: e => { e.stopPropagation(); onSelect(key); },
    style: {
      position: 'absolute',
      left: `${el[key].x}%`, top: `${el[key].y}%`,
      transform: `translate(-50%,-50%) scale(${el[key].scale})`,
      transformOrigin: 'center center',
      cursor: 'grab', touchAction: 'none', userSelect: 'none',
      outline: selected === key ? '2px solid rgba(59,130,246,.75)' : 'none',
      outlineOffset: 4, borderRadius: 3,
      filter: selected === key ? 'drop-shadow(0 0 8px rgba(59,130,246,.45))' : 'none',
      transition: 'left .08s ease, top .08s ease, outline .1s, filter .1s',
      willChange: 'transform, left, top',
    },
  }), [el, selected, onDragStart, onSelect]);

  return (
    <div ref={cardRef} onClick={() => onSelect(null)}
      style={{ width: W, height: H, borderRadius: fn(18) + 'px', overflow: 'hidden',
        position: 'relative', flexShrink: 0, boxShadow: '0 12px 50px rgba(0,0,0,.75)',
        cursor: 'default', animation: 'cardEntrance .38s cubic-bezier(.34,1.56,.64,1) both' }}>

      {/* Background */}
      <div style={{ position:'absolute', inset:0, ...bgStyle }}/>

      {/* BG overlay */}
      {bg.overlayOpacity > 0 && (
        <div style={{ position:'absolute', inset:0, background:bg.overlayColor, opacity:bg.overlayOpacity, pointerEvents:'none' }}/>
      )}

      {/* Vignette */}
      {fx.vignette > 0 && (
        <div style={{ position:'absolute', inset:0, background:`radial-gradient(ellipse at 50% 50%,transparent 28%,rgba(0,0,0,${fx.vignette}) 100%)`, pointerEvents:'none' }}/>
      )}

      {/* Glow overlay */}
      {fx.glowActive && (
        <div style={{ position:'absolute', left:`${fx.glowX}%`, top:`${fx.glowY}%`,
          transform:'translate(-50%,-50%)', width:`${fx.glowRadius * 2}%`, height:`${fx.glowRadius}%`,
          background:`radial-gradient(ellipse at center,${hexToRgba(fx.glowColor, fx.glowOpacity)} 0%,transparent 70%)`,
          filter:`blur(${fn(9)}px)`, pointerEvents:'none' }}/>
      )}

      {/* Grain */}
      {fx.grain > 0 && (
        <div style={{ position:'absolute', inset:0, opacity: fx.grain * 0.45, mixBlendMode:'overlay', pointerEvents:'none',
          backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }}/>
      )}

      {/* Route element */}
      {el.route.visible && hasRoute && (
        <div {...dragProps('route')}>
          <MiniRoute route={act.route} W={fn(220 * el.route.scale)} H={fn(121 * el.route.scale)} glowColor={st.accentColor}/>
        </div>
      )}

      {/* Distance element */}
      {el.distance.visible && (
        <div {...dragProps('distance')}>
          <div style={{ textAlign:'center', pointerEvents:'none' }}>
            <div style={{ fontSize:f(52), fontWeight:900, color:st.textColor, lineHeight:.84, letterSpacing:'-.04em' }}>{dist}</div>
            <div style={{ fontSize:f(7), fontWeight:700, color:st.accentColor, letterSpacing:'.22em', marginTop:f(5) }}>KILOMETRES</div>
          </div>
        </div>
      )}

      {/* Stats element */}
      {el.stats.visible && (
        <div {...dragProps('stats')} style={{ ...dragProps('stats').style, width: f(210) }}>
          <StatRow W={fn(210 * el.stats.scale)} durFmt={durFmt} paceFmt={paceFmt}/>
        </div>
      )}

      {/* Name element */}
      {el.name.visible && (
        <div {...dragProps('name')}>
          <div style={{ fontSize:f(7.5), color:st.textColor, opacity:.42, textAlign:'center', maxWidth:f(190),
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', pointerEvents:'none' }}>{runName}</div>
        </div>
      )}

      {/* Branding */}
      {el.branding.visible && (
        <div {...dragProps('branding')}>
          <div style={{ fontSize:f(6), fontWeight:700, color:'rgba(255,255,255,.28)', letterSpacing:'.2em', pointerEvents:'none' }}>RUNLYTICS</div>
        </div>
      )}

      {/* Snap guide lines (shown when element selected) */}
      {selected && <>
        <div style={{ position:'absolute', left:'50%', top:0, bottom:0, width:1, background:'rgba(59,130,246,.2)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', top:'50%', left:0, right:0, height:1, background:'rgba(59,130,246,.2)', pointerEvents:'none' }}/>
        {[33.3, 66.7].map(p => (
          <div key={p} style={{ position:'absolute', top:`${p}%`, left:0, right:0, height:1, background:'rgba(59,130,246,.1)', pointerEvents:'none' }}/>
        ))}
      </>}
    </div>
  );
}

// ── Control Panels ────────────────────────────────────────────────────────────
function BgTab({ bg, set }) {
  const fileRef = useRef(null);
  const onImage = e => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set({ ...bg, type:'image', imageData:ev.target.result });
    reader.readAsDataURL(file);
  };
  const tabBtn = (type, label) => (
    <button key={type} onClick={() => set({ ...bg, type })} style={{
      flex:1, padding:'8px 0', borderRadius:8, fontFamily:'inherit', cursor:'pointer', fontSize:'.72rem', fontWeight:600,
      border:`1px solid ${bg.type===type?'#f97316':'rgba(255,255,255,.1)'}`,
      background:bg.type===type?'rgba(249,115,22,.12)':'transparent',
      color:bg.type===type?'#f97316':'rgba(255,255,255,.38)', transition:'all .15s' }}>
      {label}
    </button>
  );
  return (
    <div>
      <div style={{ display:'flex', gap:6, marginBottom:16 }}>
        {tabBtn('color','Color')} {tabBtn('gradient','Gradient')} {tabBtn('image','Photo')}
      </div>
      {bg.type === 'color' && (
        <SwatchRow label="Background Color" value={bg.color} onChange={c => set({...bg,color:c})} presets={BG_PRESETS}/>
      )}
      {bg.type === 'gradient' && (
        <div>
          <div style={{ display:'flex', gap:12, marginBottom:4 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'.65rem', color:'rgba(255,255,255,.35)', marginBottom:6 }}>From</div>
              <SwatchRow value={bg.gradStop1} onChange={c => set({...bg,gradStop1:c})} presets={BG_PRESETS}/>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'.65rem', color:'rgba(255,255,255,.35)', marginBottom:6 }}>To</div>
              <SwatchRow value={bg.gradStop2} onChange={c => set({...bg,gradStop2:c})} presets={['#f97316','#060810','#3b82f6','#a855f7','#22c55e','#faf8f4','#0d0520']}/>
            </div>
          </div>
          <Slider label="Angle" value={bg.gradAngle} min={0} max={360} step={5} onChange={v => set({...bg,gradAngle:v})} unit="°"/>
        </div>
      )}
      {bg.type === 'image' && (
        <div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={onImage}/>
          {bg.imageData ? (
            <div>
              <div style={{ width:'100%', height:54, borderRadius:8, backgroundImage:`url(${bg.imageData})`,
                backgroundSize:'cover', backgroundPosition:'center', marginBottom:10, border:'1px solid rgba(255,255,255,.1)' }}/>
              <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                <button onClick={() => fileRef.current?.click()} style={{ flex:1, padding:'7px', borderRadius:8,
                  border:'1px solid rgba(255,255,255,.15)', background:'transparent',
                  color:'rgba(255,255,255,.55)', fontSize:'.72rem', cursor:'pointer', fontFamily:'inherit' }}>Change photo</button>
                <button onClick={() => set({...bg,imageData:null,type:'color'})} style={{ padding:'7px 10px', borderRadius:8,
                  border:'1px solid rgba(239,68,68,.2)', background:'rgba(239,68,68,.06)',
                  color:'#ef4444', fontSize:'.72rem', cursor:'pointer', fontFamily:'inherit' }}>Remove</button>
              </div>
              <Slider label="Zoom" value={bg.imageZoom} min={80} max={220} step={5} onChange={v => set({...bg,imageZoom:v})} unit="%"/>
              <Slider label="H Position" value={bg.imageX} min={0} max={100} step={1} onChange={v => set({...bg,imageX:v})} pct/>
              <Slider label="V Position" value={bg.imageY} min={0} max={100} step={1} onChange={v => set({...bg,imageY:v})} pct/>
              <Slider label="Brightness" value={bg.brightness} min={40} max={160} step={5} onChange={v => set({...bg,brightness:v})} unit="%"/>
              <Slider label="Blur" value={bg.blur} min={0} max={16} step={1} onChange={v => set({...bg,blur:v})} unit="px"/>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              style={{ width:'100%', padding:'22px 0', borderRadius:10, border:'2px dashed rgba(255,255,255,.12)',
                background:'transparent', color:'rgba(255,255,255,.35)', fontSize:'.8rem', cursor:'pointer', fontFamily:'inherit' }}>
              📷  Upload photo
            </button>
          )}
        </div>
      )}
      {bg.type !== 'color' && (
        <div style={{ marginTop:6, paddingTop:12, borderTop:'1px solid rgba(255,255,255,.06)' }}>
          <Slider label="Overlay Opacity" value={bg.overlayOpacity} min={0} max={0.88} step={0.04} onChange={v => set({...bg,overlayOpacity:v})} pct/>
          <SwatchRow label="Overlay Color" value={bg.overlayColor} onChange={c => set({...bg,overlayColor:c})} presets={['#000000','#060810','#0d0520','#1a0a30','#ffffff']}/>
        </div>
      )}
    </div>
  );
}

function FxTab({ fx, set }) {
  return (
    <div>
      <Slider label="Vignette" value={fx.vignette} min={0} max={0.88} step={0.04} onChange={v => set({...fx,vignette:v})} pct/>
      <Slider label="Film Grain" value={fx.grain} min={0} max={1} step={0.05} onChange={v => set({...fx,grain:v})} pct/>
      <div style={{ borderTop:'1px solid rgba(255,255,255,.06)', paddingTop:12, marginTop:4 }}>
        <EditorToggle label="Glow Overlay" value={fx.glowActive} onChange={v => set({...fx,glowActive:v})}/>
        {fx.glowActive && (
          <div>
            <SwatchRow label="Glow Color" value={fx.glowColor} onChange={c => set({...fx,glowColor:c})} presets={ACCENT_PRESETS}/>
            <Slider label="X Position" value={fx.glowX} min={0} max={100} step={1} onChange={v => set({...fx,glowX:v})} pct/>
            <Slider label="Y Position" value={fx.glowY} min={0} max={100} step={1} onChange={v => set({...fx,glowY:v})} pct/>
            <Slider label="Spread" value={fx.glowRadius} min={10} max={80} step={5} onChange={v => set({...fx,glowRadius:v})} unit="%"/>
            <Slider label="Intensity" value={fx.glowOpacity} min={0.05} max={0.6} step={0.05} onChange={v => set({...fx,glowOpacity:v})} pct/>
          </div>
        )}
      </div>
    </div>
  );
}

const ELEMENT_META = {
  route:    { label:'Route Map', icon:'🗺️' },
  distance: { label:'Distance',  icon:'📍' },
  stats:    { label:'Stats',     icon:'📊' },
  name:     { label:'Run Name',  icon:'✏️' },
  branding: { label:'Branding',  icon:'⚡' },
};

function ElementsTab({ elements, style, setElements, setStyle, selected, onSelect }) {
  const setEl = (key, patch) => setElements(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const el = selected ? elements[selected] : null;
  return (
    <div>
      {/* Element chips */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:14 }}>
        {Object.entries(ELEMENT_META).map(([key, meta]) => (
          <button key={key} onClick={() => onSelect(selected === key ? null : key)} style={{
            display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:20, cursor:'pointer', fontFamily:'inherit',
            border:`1px solid ${selected===key?'#3b82f6':elements[key].visible?'rgba(249,115,22,.3)':'rgba(255,255,255,.08)'}`,
            background:selected===key?'rgba(59,130,246,.14)':elements[key].visible?'rgba(249,115,22,.05)':'transparent',
            color:selected===key?'#60a5fa':elements[key].visible?'rgba(255,255,255,.65)':'rgba(255,255,255,.25)',
            fontSize:'.68rem', fontWeight:500, transition:'all .15s' }}>
            <span style={{ fontSize:'.8rem' }}>{meta.icon}</span> {meta.label}
          </button>
        ))}
      </div>

      {/* Selected element controls */}
      {el && selected && (
        <div style={{ background:'rgba(255,255,255,.03)', borderRadius:10, padding:'12px', border:'1px solid rgba(255,255,255,.07)', marginBottom:14 }}>
          <div style={{ fontSize:'.68rem', fontWeight:700, color:'rgba(255,255,255,.35)', letterSpacing:'.1em', marginBottom:10 }}>
            {ELEMENT_META[selected]?.label.toUpperCase()} · drag card to reposition
          </div>
          <EditorToggle label="Visible" value={el.visible} onChange={v => setEl(selected, {visible:v})}/>
          <Slider label="Scale" value={el.scale} min={0.4} max={1.8} step={0.05} onChange={v => setEl(selected, {scale:v})}/>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginTop:4 }}>
            {[['X', 'x', 0, 100], ['Y', 'y', 0, 100]].map(([lbl, key, min, max]) => (
              <div key={lbl}>
                <div style={{ fontSize:'.62rem', color:'rgba(255,255,255,.3)', marginBottom:5 }}>{lbl} %</div>
                <input type="number" min={min} max={max} value={Math.round(el[key])} step={1}
                  onChange={e => setEl(selected, {[key]: Math.max(min, Math.min(max, +e.target.value))})}
                  style={{ width:'100%', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)',
                    borderRadius:7, color:'#fff', padding:'7px 8px', fontSize:'.78rem', fontFamily:'monospace', outline:'none' }}/>
              </div>
            ))}
            <div>
              <div style={{ fontSize:'.62rem', color:'rgba(255,255,255,.3)', marginBottom:5 }}>Center</div>
              <button onClick={() => setEl(selected, {x:50})} style={{ width:'100%', padding:'8px 0', borderRadius:7,
                border:'1px solid rgba(255,255,255,.1)', background:'transparent',
                color:'rgba(255,255,255,.4)', fontSize:'.7rem', cursor:'pointer', fontFamily:'inherit' }}>↔</button>
            </div>
          </div>
        </div>
      )}

      {/* Style controls */}
      <div style={{ borderTop:'1px solid rgba(255,255,255,.06)', paddingTop:12 }}>
        <SwatchRow label="Accent Color" value={style.accentColor} onChange={c => setStyle(p => ({...p,accentColor:c}))} presets={ACCENT_PRESETS}/>
        <SwatchRow label="Text Color" value={style.textColor} onChange={c => setStyle(p => ({...p,textColor:c}))} presets={['#ffffff','#f0ede8','#d8e6f7','#0a0a0a','#1a1a1a']}/>
      </div>
    </div>
  );
}

function PresetsTab({ currentState, onLoad }) {
  const [presets, setPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(EDITOR_PRESETS_KEY) || '[]'); } catch { return []; }
  });
  const [name, setName] = useState('');

  const save = () => {
    const n = name.trim(); if (!n) return;
    const updated = [{ name:n, state:currentState, date:new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}) }, ...presets.slice(0, 7)];
    setPresets(updated); setName('');
    try { localStorage.setItem(EDITOR_PRESETS_KEY, JSON.stringify(updated)); } catch {}
  };

  const remove = i => {
    const updated = presets.filter((_,j) => j !== i);
    setPresets(updated);
    try { localStorage.setItem(EDITOR_PRESETS_KEY, JSON.stringify(updated)); } catch {}
  };

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        <input value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key==='Enter'&&save()}
          placeholder="Name this layout…"
          style={{ flex:1, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)',
            borderRadius:9, color:'#fff', padding:'9px 12px', fontSize:'.8rem', fontFamily:'inherit', outline:'none' }}/>
        <button onClick={save} disabled={!name.trim()} style={{
          padding:'9px 16px', borderRadius:9, border:'none', fontFamily:'inherit', fontWeight:700,
          background:name.trim()?'linear-gradient(135deg,#f97316,#ea580c)':'rgba(255,255,255,.06)',
          color:name.trim()?'#fff':'rgba(255,255,255,.3)', cursor:name.trim()?'pointer':'default', fontSize:'.8rem' }}>Save</button>
      </div>
      {presets.length === 0 && (
        <div style={{ textAlign:'center', padding:'28px 0', color:'rgba(255,255,255,.22)', fontSize:'.78rem', lineHeight:1.7 }}>
          No saved layouts yet.<br/>Set up a look you like, then save it here.
        </div>
      )}
      {presets.map((p, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 12px', borderRadius:10,
          background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.07)', marginBottom:8 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:'.82rem', fontWeight:600, color:'rgba(255,255,255,.78)', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
            <div style={{ fontSize:'.66rem', color:'rgba(255,255,255,.28)' }}>{p.date}</div>
          </div>
          <button onClick={() => onLoad(p.state)} style={{ padding:'5px 11px', borderRadius:7, fontFamily:'inherit', fontWeight:600,
            background:'rgba(249,115,22,.1)', border:'1px solid rgba(249,115,22,.22)', color:'#f97316', fontSize:'.72rem', cursor:'pointer' }}>
            Load
          </button>
          <button onClick={() => remove(i)} style={{ padding:'5px 9px', borderRadius:7, fontFamily:'inherit',
            background:'rgba(239,68,68,.07)', border:'1px solid rgba(239,68,68,.18)', color:'#ef4444', fontSize:'.72rem', cursor:'pointer' }}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Main Share Editor Component ───────────────────────────────────────────────
function ShareEditor({ act, onClose }) {
  const PREV_W = 230;
  const PREV_H = Math.round(PREV_W * 16 / 9); // 409

  const [state, setStateRaw] = useState(EDITOR_DEFAULTS);
  const [tab,   setTab]       = useState('bg');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy]         = useState(false);
  const cardRef  = useRef(null);
  const dragRef  = useRef(null);

  const setElements = useCallback(updater =>
    setStateRaw(prev => ({ ...prev, elements: typeof updater === 'function' ? updater(prev.elements) : updater }))
  , []);

  const startDrag = useCallback((key, e, snapPoints, snapThresh) => {
    e.preventDefault(); e.stopPropagation();
    setSelected(key);
    const card = cardRef.current; if (!card) return;
    const rect = card.getBoundingClientRect();
    const getXY = ev => ({
      cx: ev.touches ? ev.touches[0].clientX : ev.clientX,
      cy: ev.touches ? ev.touches[0].clientY : ev.clientY,
    });
    const { cx: startCX, cy: startCY } = getXY(e);
    let startEl;
    setStateRaw(prev => { startEl = { ...prev.elements[key] }; return prev; });
    dragRef.current = true;

    const snap = val => { for (const p of snapPoints) if (Math.abs(val - p) < snapThresh) return p; return Math.round(val * 10) / 10; };

    const onMove = ev => {
      if (!dragRef.current) return;
      ev.preventDefault();
      const { cx, cy } = getXY(ev);
      const nx = snap(Math.max(4, Math.min(96, startEl.x + (cx - startCX) / rect.width  * 100)));
      const ny = snap(Math.max(3, Math.min(97, startEl.y + (cy - startCY) / rect.height * 100)));
      setStateRaw(prev => ({ ...prev, elements: { ...prev.elements, [key]: { ...prev.elements[key], x:nx, y:ny } } }));
    };

    const onUp = () => {
      dragRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchend', onUp);
    };

    document.addEventListener('mousemove', onMove, { passive:false });
    document.addEventListener('touchmove', onMove, { passive:false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
  }, []);

  const doExport = async fmt => {
    if (busy) return;
    setBusy(true);
    try { await exportCustomCard(act, state, fmt); } catch {}
    setBusy(false);
  };

  const EDITOR_TABS = [
    { id:'bg',      label:'BG'       },
    { id:'fx',      label:'FX'       },
    { id:'layout',  label:'Elements' },
    { id:'presets', label:'Saved'    },
  ];

  return (
    <div style={{ position:'fixed', inset:0, zIndex:430, background:'#05080f', display:'flex', flexDirection:'column', overscrollBehavior:'contain' }}>

      {/* Header */}
      <div style={{ flexShrink:0, padding:'12px 18px 11px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid rgba(255,255,255,.07)' }}>
        <button onClick={onClose} style={{ background:'none', border:'none', color:'rgba(255,255,255,.45)', fontSize:'.82rem', cursor:'pointer', fontFamily:'inherit', padding:0 }}>
          ‹ Back
        </button>
        <div style={{ fontWeight:700, fontSize:'.78rem', color:'rgba(255,255,255,.55)', letterSpacing:'.12em' }}>CUSTOM EDITOR</div>
        <button onClick={() => { setStateRaw(EDITOR_DEFAULTS); setSelected(null); }}
          style={{ background:'none', border:'none', color:'rgba(255,255,255,.3)', fontSize:'.72rem', cursor:'pointer', fontFamily:'inherit' }}>
          Reset
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex:1, overflowY:'auto', paddingBottom:78 }}>

        {/* Live preview */}
        <div style={{ display:'flex', justifyContent:'center', padding:'20px 0 18px', position:'relative' }}>
          <EditorPreview act={act} state={state} W={PREV_W} H={PREV_H}
            cardRef={cardRef} selected={selected}
            onSelect={setSelected} onDragStart={startDrag}/>
          {selected && (
            <div style={{ position:'absolute', bottom:4, left:'50%', transform:'translateX(-50%)',
              background:'rgba(59,130,246,.15)', border:'1px solid rgba(59,130,246,.25)',
              borderRadius:20, padding:'3px 12px', fontSize:'.62rem', color:'#93c5fd',
              letterSpacing:'.04em', pointerEvents:'none', whiteSpace:'nowrap' }}>
              Drag to move · tap elsewhere to deselect
            </div>
          )}
        </div>

        {/* Sticky tab bar */}
        <div style={{ position:'sticky', top:0, zIndex:5, background:'#05080f', display:'flex',
          borderTop:'1px solid rgba(255,255,255,.07)', borderBottom:'1px solid rgba(255,255,255,.07)' }}>
          {EDITOR_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex:1, padding:'10px 2px', border:'none', background:'transparent', fontFamily:'inherit', cursor:'pointer',
              color: tab===t.id?'#f97316':'rgba(255,255,255,.35)',
              fontSize:'.64rem', fontWeight:tab===t.id?700:500, letterSpacing:'.08em', textTransform:'uppercase',
              borderBottom:tab===t.id?'2px solid #f97316':'2px solid transparent', transition:'color .15s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div style={{ padding:'16px 18px 20px' }}>
          {tab === 'bg'     && <BgTab bg={state.bg} set={bg => setStateRaw(p => ({...p,bg}))}/>}
          {tab === 'fx'     && <FxTab fx={state.fx} set={fx => setStateRaw(p => ({...p,fx}))}/>}
          {tab === 'layout' && <ElementsTab
            elements={state.elements} style={state.style}
            setElements={setElements}
            setStyle={fn => setStateRaw(p => ({...p, style: typeof fn==='function'?fn(p.style):fn}))}
            selected={selected} onSelect={setSelected}/>}
          {tab === 'presets' && <PresetsTab currentState={state} onLoad={s => { setStateRaw(mergeEditorState(s)); setSelected(null); }}/>}
        </div>
      </div>

      {/* Fixed export bar */}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'11px 18px 24px',
        background:'rgba(5,8,15,.96)', backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)',
        borderTop:'1px solid rgba(255,255,255,.07)' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <button className="btn b-or" style={{ padding:'13px', fontSize:'.84rem', borderRadius:13, fontWeight:700 }}
            onClick={() => doExport('jpg')} disabled={busy}>{busy?'Saving…':'Save JPEG'}</button>
          <button className="btn b-gh" style={{ padding:'13px', fontSize:'.84rem', borderRadius:13 }}
            onClick={() => doExport('png')} disabled={busy}>Save PNG</button>
        </div>
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
  const[showEditor,setShowEditor]=useState(false);
  const[editorAct,setEditorAct]=useState(null);
  const[stravaAuth,setStravaAuth]=useState(loadStravaAuth);
  const[stravaSync,setStravaSync]=useState({loading:false,msg:""});
  const[hasUnseen,setHasUnseen]=useState(false);

  const detRef=useRef(null),setRef=useRef(null),arRef=useRef(null),monRef=useRef(null),upRef=useRef(null),shaRef=useRef(null),prRef=useRef(null);
  const isSyncingRef=useRef(false),lastSyncRef=useRef(0);

  // FIX #1: Removed feedbackRun from deps (was never declared as state — caused ReferenceError)
  const edRef=useRef(null);
  useEffect(()=>{
    detRef.current=detail;setRef.current=showSettings;
    arRef.current=showAllRuns;monRef.current=showMonthly;upRef.current=showUpload;
    shaRef.current=shareAct;prRef.current=prDetail;edRef.current=showEditor;
  },[detail,showSettings,showAllRuns,showMonthly,showUpload,shareAct,prDetail,showEditor]);

  useEffect(()=>{
    history.replaceState({_rl:"root"},"");history.pushState({_rl:"s"},"");
  },[]);

  useEffect(()=>{
    const h=(e)=>{
      if(edRef.current){setShowEditor(false);history.replaceState({_rl:"s"},"");return;}
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
  const openEditor=useCallback(act=>{history.pushState({_rl:"ed"},"");setEditorAct(act);setShowEditor(true);},[]);
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
      {shareAct&&<ShareModal act={shareAct} onClose={back} onOpenEditor={act=>{back();openEditor(act);}}/>}
      {showEditor&&editorAct&&<ShareEditor act={editorAct} onClose={back}/>}
      {prDetail&&<PRDetailModal entry={prDetail} onClose={back}
        // FIX #13: onOpenRun receives an ID string; find the activity then open detail
        onOpenRun={id=>{setPrDetail(null);const found=acts.find(a=>a.id===id);if(found)openDetail(found);}}/>}
      {/* FIX #3: AllRuns → AllRunsView (component was named AllRunsView but called as AllRuns) */}
      {showUpload&&<Upload acts={acts} hrProfile={hrProfile} onAdd={newActs=>{newActs.forEach(a=>addAct(a));back();}} onClearAll={()=>{setActs([]);back();}}/>}
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
