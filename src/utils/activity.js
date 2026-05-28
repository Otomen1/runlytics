import { todayKey } from './formatters.js';

export function storageSizeKB(str){return Math.round(str.length*2/1024);}

export function normalizeRoute(pts){
  if(!Array.isArray(pts)||!pts.length)return[];
  const out=[];
  for(const p of pts){
    if(!p)continue;
    const lat=+p.lat;
    const lon=p.lon!=null?+p.lon:+p.lng; // handle {lat,lng} legacy format
    if(isFinite(lat)&&isFinite(lon)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180){
      out.push({lat,lon});
    }
  }
  return out;
}

export function todayKey(){return new Date().toISOString().slice(0,10);}

export function getStreak(completions){
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

export function classifyRun(distKm,paceSecKm){if(distKm>=15)return"long";if(paceSecKm&&paceSecKm<320)return"workout";return"easy";}

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
  }catch(e){}
  return pts;
}

export function migrateActivity(a){
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
    route:normalizeRoute(a.route).slice(0,500),
    source:a.source||"gpx",
    trainingLoad:isFinite(a.trainingLoad)&&a.trainingLoad>=0?Math.round(+a.trainingLoad):0,
  };
}
