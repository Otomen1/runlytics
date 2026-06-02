import { TIER_TRACKS, TRACK_META, TIER_NAMES, TIER_COLS, BADGE_DEFS, getTierIcon } from '../constants/achievements.js';
import { weekOf, monthOf } from './formatters.js';
import { GOALS_KEY } from '../constants/keys.js';
function loadGoals(){try{return JSON.parse(localStorage.getItem(GOALS_KEY)||'null')||{weekly:40,monthly:160};}catch{return{weekly:40,monthly:160};}}
export function getMafHR(profile){
  if(!profile)return 150;
  if(profile.overrideMAF&&isFinite(profile.overrideMAF))return+profile.overrideMAF;
  const age=profile.age!=null&&isFinite(profile.age)&&+profile.age>0?+profile.age:30;
  const mod=profile.modifier&&isFinite(profile.modifier)?+profile.modifier:0;
  return Math.max(100,180-age+mod);
}

export function getMafZones(mafHR){
  const m=mafHR||150;
  return[
    {zone:1,label:"Recovery",lo:m-30,hi:m-20,color:"#3b82f6",pct:0},
    {zone:2,label:"Aerobic",lo:m-20,hi:m-10,color:"#22c55e",pct:0},
    {zone:3,label:"MAF",lo:m-10,hi:m,color:"#f97316",pct:0},
    {zone:4,label:"Threshold",lo:m,hi:m+10,color:"#eab308",pct:0},
    {zone:5,label:"Anaerobic",lo:m+10,hi:m+30,color:"#ef4444",pct:0},
  ];
}

export function computeZones(hrSamples,mafHR){
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

export function buildAnalytics(acts){
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

export function computeRacePRs(acts){
  const cats=[{cat:"5K",min:4.2,max:5.8,color:"#22c55e"},{cat:"10K",min:8.5,max:11.5,color:"#f97316"},{cat:"HM",min:19,max:23,color:"#8b5cf6"},{cat:"Marathon",min:40,max:44,color:"#ef4444"}];
  return cats.map(c=>{
    const candidates=acts.filter(a=>a.distanceKm>=c.min&&a.distanceKm<=c.max&&a.movingTimeSec>0).sort((a,b)=>a.avgPaceSecKm-b.avgPaceSecKm);
    if(!candidates.length)return{...c,best:null,top3:[],history:[]};
    const best=candidates[0];
    const top3=candidates.slice(0,3).map(r=>({...r,paceSecKm:r.avgPaceSecKm,stravaId:r.source==="strava"?r.id.replace(/^s/,""):null}));
    const history=[...candidates].sort((a,b)=>a.date>b.date?1:-1).map(r=>({date:r.date,paceSecKm:r.avgPaceSecKm}));
    return{...c,best,top3,history};
  }).filter(c=>c.best);
}

export function computeYearWrapped(acts,year){
  const y=String(year);
  const yearActs=acts.filter(a=>a.date&&a.date.startsWith(y+'-'));
  if(!yearActs.length)return null;
  const totalKm=yearActs.reduce((s,a)=>s+a.distanceKm,0);
  const totalSec=yearActs.reduce((s,a)=>s+a.movingTimeSec,0);
  const totalElev=yearActs.reduce((s,a)=>s+(a.elevGainM||0),0);
  const runCount=yearActs.length;
  const everests=totalElev/8849;
  const monthMap={};
  for(let m=1;m<=12;m++){const k=`${y}-${String(m).padStart(2,'0')}`;monthMap[k]={month:k,km:0,runs:0};}
  yearActs.forEach(a=>{const k=a.date.slice(0,7);if(monthMap[k]){monthMap[k].km+=a.distanceKm;monthMap[k].runs++;}});
  const months=Object.values(monthMap);
  const bestMonth=months.reduce((b,m)=>m.km>b.km?m:b,months[0]);
  const MOODS_ORDER=['strong','great','good','normal','tough'];
  const moodCounts={};
  yearActs.forEach(a=>{if(a.mood)moodCounts[a.mood]=(moodCounts[a.mood]||0)+1;});
  const topMood=MOODS_ORDER.find(m=>moodCounts[m])||null;
  const runDays=new Set(yearActs.map(a=>a.date));
  const longest=[...yearActs].sort((a,b)=>b.distanceKm-a.distanceKm)[0];
  const bestPace=yearActs.filter(a=>a.avgPaceSecKm>0).sort((a,b)=>a.avgPaceSecKm-b.avgPaceSecKm)[0]||null;
  return{totalKm,totalSec,totalElev,runCount,months,bestMonth,moodCounts,topMood,runDays,longest,bestPace,everests};
}

export function getTodayRecommendation(acts){
  const todayStr=new Date().toISOString().slice(0,10);
  if(acts.some(a=>a.date===todayStr))return{type:"rest",icon:"🧘",title:"Rest Today",sub:"You already ran today. Time to recover."};
  const weekKm=acts.filter(a=>a.date>new Date(Date.now()-7*86400000).toISOString().slice(0,10)).reduce((s,a)=>s+a.distanceKm,0);
  const goals=loadGoals();
  if(weekKm>=goals.weekly)return{type:"rest",icon:"🛌",title:"Goal Complete!",sub:"Weekly target hit. A rest day or light jog is perfect."};
  if(weekKm<goals.weekly*0.4)return{type:"easy",icon:"🏃",title:"Easy Run Day",sub:"Keep it aerobic — run at MAF heart rate, enjoy the motion."};
  return{type:"easy",icon:"🏃",title:"Aerobic Run",sub:"Steady aerobic effort. Keep HR below MAF for best adaptation."};
}

export function getMafCoachingInsight(acts,hrProfile){
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

export function computeTierProgress(acts){
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

function haversineKm(a,b){
  const R=6371,toR=Math.PI/180;
  const dLat=(b.lat-a.lat)*toR,dLon=((b.lon??b.lng)-(a.lon??a.lng))*toR;
  const x=Math.sin(dLat/2)**2+Math.cos(a.lat*toR)*Math.cos(b.lat*toR)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

export function computeSplits(act){
  const{route,hrSamples,distanceKm,movingTimeSec}=act;
  if(!route||route.length<4||!movingTimeSec||distanceKm<1)return null;
  const dist=[0];
  for(let i=1;i<route.length;i++)dist.push(dist[i-1]+haversineKm(route[i-1],route[i]));
  const totalDist=dist[dist.length-1];
  if(totalDist<0.5)return null;
  // GPX activities carry per-point timestamps (sec); Strava routes do not. Use real
  // timestamps when present, otherwise fall back to proportional distribution.
  const hasTimes=route[0].sec!=null;
  const source=hasTimes?"gps":"estimated";
  const hasEle=route.some(p=>p.ele!=null&&isFinite(p.ele));
  // secAt(d): interpolated second at cumulative distance d.
  // eleAt(i): elevation lookup (only used when hasEle).
  const secAt=d=>{
    if(!hasTimes)return(d/totalDist)*movingTimeSec;
    let i=dist.findIndex(x=>x>=d);
    if(i<=0)i=1;
    const d0=dist[i-1],d1=dist[i],s0=route[i-1].sec,s1=route[i].sec;
    if(d1<=d0)return s1;
    return s0+(d-d0)/(d1-d0)*(s1-s0);
  };
  const splits=[];
  let prevKmSec=0;
  for(let km=1;km<=Math.min(Math.floor(distanceKm),60);km++){
    if(dist[dist.length-1]<km)break;
    const kmEndSec=secAt(km);
    const kmStartSec=km===1?0:prevKmSec;
    const splitSec=kmEndSec-kmStartSec;
    prevKmSec=kmEndSec;
    let avgHR=null;
    if(hrSamples&&hrSamples.length){
      const s=hrSamples.filter(h=>h.sec>=kmStartSec&&h.sec<=kmEndSec&&h.hr>30);
      if(s.length>=2)avgHR=Math.round(s.reduce((a,h)=>a+h.hr,0)/s.length);
    }
    let elev=null;
    if(hasEle){
      // Sum positive elevation deltas across route points within this km band.
      elev=0;
      for(let i=1;i<route.length;i++){
        if(dist[i]<=km-1||dist[i-1]>=km)continue;
        const a=route[i-1].ele,b=route[i].ele;
        if(a!=null&&b!=null&&b>a)elev+=b-a;
      }
      elev=Math.round(elev);
    }
    splits.push({km,splitSec,cumulativeSec:kmEndSec,avgHR,elev,source});
  }
  if(splits.length<2)return null;
  splits.source=source;
  return splits;
}

export function computeEarnedBadges(acts){return BADGE_DEFS.filter(b=>{try{return b.check(acts);}catch(e){return false;}}).map(b=>b.id);}
