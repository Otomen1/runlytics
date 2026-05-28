import { STRAVA_KEY } from '../constants/keys.js';
import { migrateActivity, decodePolyline } from '../utils/activity.js';
import { todayKey, fmtKm } from '../utils/formatters.js';
import { classifyRun } from '../utils/activity.js';

export function loadStravaAuth(){try{return JSON.parse(localStorage.getItem(STRAVA_KEY)||"null");}catch(e){return null;}}
function saveStravaAuth(a){try{localStorage.setItem(STRAVA_KEY,JSON.stringify(a));}catch(e){}}
export function saveStravaAuth(a){try{localStorage.setItem(STRAVA_KEY,JSON.stringify(a));}catch(e){}}
function clearStravaAuth(){try{localStorage.removeItem(STRAVA_KEY);}catch(e){}}
export function clearStravaAuth(){try{localStorage.removeItem(STRAVA_KEY);}catch(e){}}
export // FIX #15: Added icon/category/desc fields; emoji as real chars not HTML entity strings
function defaultTasks(){
  return[
    {id:"t1",title:"Morning stretch",icon:"🧘",color:"#3b82f6",category:"recovery",desc:"5 min of light stretching after waking up",enabled:true,streak:0,completions:{}},
    {id:"t2",title:"Hydrate 2L",icon:"💧",color:"#06b6d4",category:"wellness",desc:"Drink at least 2 litres of water today",enabled:true,streak:0,completions:{}},
    {id:"t3",title:"Post-run foam roll",icon:"🪴",color:"#8b5cf6",category:"recovery",desc:"Roll quads, calves and IT band after running",enabled:false,streak:0,completions:{}},
    {id:"t4",title:"Sleep 7-8 hours",icon:"😴",color:"#f97316",category:"wellness",desc:"Prioritise 7-8 hours of quality sleep",enabled:true,streak:0,completions:{}},
  ];
}
export function mapStravaActivity(a){
  if(!a||a.type&&!["Run","Walk","Hike","TrailRun","VirtualRun"].includes(a.type))return null;
  const distKm=(a.distance||0)/1000;const paceSecKm=distKm>0&&a.moving_time?a.moving_time/distKm:0;
  const d=a.start_date_local||a.start_date||new Date().toISOString();
  const trainingLoad=a.moving_time&&a.average_heartrate?Math.round((a.moving_time/60)*(a.average_heartrate/100)*1.5):Math.round(distKm*8);
  // Decode Strava's encoded polyline — summary_polyline is the compressed version,
  // polyline is the full-resolution version. Use whichever is available.
  const encoded=a.map?.summary_polyline||a.map?.polyline||'';
  const route=encoded?decodePolyline(encoded):[];
  return migrateActivity({id:"s"+a.id,name:a.name||"Run",type:a.sport_type||a.type||"Run",date:d.slice(0,10),dateTs:new Date(d).getTime(),
    distanceKm:parseFloat(distKm.toFixed(3)),movingTimeSec:a.moving_time||0,
    avgPaceSecKm:parseFloat(paceSecKm.toFixed(1)),avgHR:a.average_heartrate||null,maxHR:a.max_heartrate||null,
    elevGainM:Math.round(a.total_elevation_gain||0),elevLossM:0,
    runClass:classifyRun(distKm,paceSecKm),hrSamples:[],route,source:"strava",trainingLoad});
}
