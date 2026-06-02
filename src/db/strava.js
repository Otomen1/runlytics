import { STRAVA_KEY } from '../constants/keys.js';
import { migrateActivity, decodePolyline, classifyRun } from '../utils/activity.js';
import { todayKey } from '../utils/formatters.js';

const SESSION_TOKEN_KEY = 'runlytics_strava_access';
// Refresh tokens older than 90 days are cleared — user must reconnect
const REFRESH_TOKEN_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

// Persist only non-sensitive fields in localStorage; keep access_token in sessionStorage
export function loadStravaAuth(){
  try{
    const base=JSON.parse(localStorage.getItem(STRAVA_KEY)||"null");
    if(!base)return null;
    // Expire stale refresh tokens so they don't linger forever
    if(base.savedAt&&Date.now()-base.savedAt>REFRESH_TOKEN_MAX_AGE_MS){
      clearStravaAuth();
      return null;
    }
    const sessionToken=sessionStorage.getItem(SESSION_TOKEN_KEY);
    return sessionToken?{...base,access_token:sessionToken}:base;
  }catch(e){return null;}
}

export function saveStravaAuth(a){
  try{
    if(!a)return;
    const{access_token,...rest}=a;
    localStorage.setItem(STRAVA_KEY,JSON.stringify({...rest,savedAt:Date.now()}));
    if(access_token)sessionStorage.setItem(SESSION_TOKEN_KEY,access_token);
  }catch(e){}
}

export function clearStravaAuth(){
  try{
    localStorage.removeItem(STRAVA_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
  }catch(e){}
}

export async function getStravaToken(auth){
  if(!auth)return null;
  const sessionToken=sessionStorage.getItem(SESSION_TOKEN_KEY);
  if(sessionToken&&auth.expires_at&&Date.now()/1000<auth.expires_at-60)return sessionToken;
  if(!auth.refresh_token)return null;
  try{
    const r=await fetch("/api/strava-refresh",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refresh_token:auth.refresh_token})});
    if(!r.ok){
      // 401 means refresh token is invalid — clear so user reconnects
      if(r.status===401)clearStravaAuth();
      return null;
    }
    const data=await r.json();
    if(!data.access_token)return null;
    const updated={...auth,...data};
    saveStravaAuth(updated);
    return updated.access_token;
  }catch(e){return null;}
}

export function mapStravaActivity(a){
  if(!a||a.type&&!["Run","Walk","Hike","TrailRun","VirtualRun"].includes(a.type))return null;
  const distKm=(a.distance||0)/1000;
  const paceSecKm=distKm>0&&a.moving_time?a.moving_time/distKm:0;
  const d=a.start_date_local||a.start_date||new Date().toISOString();
  const trainingLoad=a.moving_time&&a.average_heartrate
    ?Math.round((a.moving_time/60)*(a.average_heartrate/100)*1.5)
    :Math.round(distKm*8);
  const encoded=a.map?.summary_polyline||a.map?.polyline||'';
  const route=encoded?decodePolyline(encoded):[];
  return migrateActivity({
    id:"s"+a.id, name:String(a.name||"Run").slice(0,128), type:a.sport_type||a.type||"Run",
    date:d.slice(0,10), dateTs:new Date(d).getTime(),
    distanceKm:parseFloat(distKm.toFixed(3)), movingTimeSec:a.moving_time||0,
    avgPaceSecKm:parseFloat(paceSecKm.toFixed(1)),
    avgHR:a.average_heartrate||null, maxHR:a.max_heartrate||null,
    elevGainM:Math.round(a.total_elevation_gain||0), elevLossM:0,
    runClass:classifyRun(distKm,paceSecKm),
    hrSamples:[], route, source:"strava", trainingLoad
  });
}
