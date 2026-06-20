import { todayKey } from './formatters.js';

export function storageSizeKB(str){if(!str||typeof str!=='string')return 0;return Math.round(str.length*2/1024);}

export function normalizeRoute(pts){
  if(!Array.isArray(pts)||!pts.length)return[];
  const out=[];
  for(const p of pts){
    if(!p)continue;
    const lat=+p.lat;
    const lon=p.lon!=null?+p.lon:+p.lng;
    if(isFinite(lat)&&isFinite(lon)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180){
      out.push({lat,lon});
    }
  }
  return out;
}

export function classifyRun(distKm,paceSecKm){
  if(distKm>=13)return"long";
  if(paceSecKm>0&&paceSecKm<320)return"workout";
  return"easy";
}

export function getStreak(completions){
  if(!completions)return 0;
  let streak=0;
  const today=new Date();today.setHours(0,0,0,0);
  for(let i=0;i<365;i++){
    const d=new Date(today);d.setDate(d.getDate()-i);
    if(completions[d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')])streak++;
    else if(i>0)break;
  }
  return streak;
}

export function decodePolyline(encoded){
  if(!encoded||typeof encoded!=='string')return[];
  const pts=[];let index=0,lat=0,lng=0;
  try{
    while(index<encoded.length){
      let b,shift=0,result=0;
      do{b=encoded.charCodeAt(index++)-63;result|=(b&0x1f)<<shift;shift+=5;}while(b>=0x20);
      lat+=(result&1)?~(result>>1):(result>>1);
      shift=result=0;
      do{b=encoded.charCodeAt(index++)-63;result|=(b&0x1f)<<shift;shift+=5;}while(b>=0x20);
      lng+=(result&1)?~(result>>1):(result>>1);
      pts.push({lat:lat/1e5,lon:lng/1e5});
    }
  }catch(e){ console.warn('[runlytics] Polyline decode failed:', e.message); }
  return pts;
}

export function migrateActivity(a){
  if(!a||typeof a!=="object")return null;
  return{
    id:a.id||String(Date.now()+Math.random()),
    name:String(a.name||"Activity").slice(0,128),
    type:a.type||"Run",
    date:a.date||todayKey(),
    dateTs:a.dateTs||(a.date?new Date(a.date+'T00:00:00').getTime():0),
    distanceKm:isFinite(a.distanceKm)?+a.distanceKm:0,
    movingTimeSec:isFinite(a.movingTimeSec)?+a.movingTimeSec:0,
    avgPaceSecKm:isFinite(a.avgPaceSecKm)&&+a.avgPaceSecKm>0?+a.avgPaceSecKm:0,
    avgHR:isFinite(a.avgHR)&&a.avgHR>0?+a.avgHR:null,
    maxHR:isFinite(a.maxHR)&&a.maxHR>0?+a.maxHR:null,
    elevGainM:isFinite(a.elevGainM)?+a.elevGainM:0,
    elevLossM:isFinite(a.elevLossM)?+a.elevLossM:0,
    runClass:a.runClass||classifyRun(isFinite(a.distanceKm)?+a.distanceKm:0,isFinite(a.avgPaceSecKm)?+a.avgPaceSecKm:0),
    hrSamples:Array.isArray(a.hrSamples)?a.hrSamples.filter(s=>s&&isFinite(s.sec)&&isFinite(s.hr)&&s.hr>30&&s.hr<250).slice(0,500):[],
    route:normalizeRoute(a.route).slice(0,500),
    source:a.source||"gpx",
    trainingLoad:isFinite(a.trainingLoad)&&a.trainingLoad>=0?Math.round(+a.trainingLoad):0,
    notes:String(a.notes||"").slice(0,500),
    mood:a.mood||null,
    photoCount:typeof a.photoCount==='number'?a.photoCount:0,
    shoeId:a.shoeId||null,
    isRace:a.isRace||false,
    raceGoalSec:isFinite(a.raceGoalSec)&&a.raceGoalSec>0?+a.raceGoalSec:null,
    raceLocation:String(a.raceLocation||'').slice(0,64),
  };
}
