import { STRAVA_KEY, STRAVA_ACCESS_KEY, STRAVA_REFRESH_KEY, STRAVA_REFRESH_LS_KEY } from '../constants/keys.js';
import { REFRESH_TOKEN_MAX_AGE_MS } from '../constants/limits.js';
import { migrateActivity, decodePolyline, classifyRun, calcTrainingLoad } from '../utils/activity.js';

const SESSION_TOKEN_KEY = STRAVA_ACCESS_KEY;

// Security model: non-sensitive metadata (athlete name, expires_at, createdAt) goes to
// localStorage. The access_token lives in sessionStorage (cleared on tab close). The
// refresh_token is stored in both sessionStorage AND localStorage so auth survives tab
// close/reopen — trade-off: any XSS on this origin can read it. Mitigated by REFRESH_TOKEN_MAX_AGE_MS
// expiry (checked against createdAt, written once at initial OAuth and never overwritten).
export function loadStravaAuth(){
  try{
    const base=JSON.parse(localStorage.getItem(STRAVA_KEY)||"null");
    if(!base)return null;
    // Use createdAt (written once at initial OAuth) so active users aren't exempt from expiry
    const ageTs=base.createdAt||base.savedAt;
    if(ageTs&&Date.now()-ageTs>REFRESH_TOKEN_MAX_AGE_MS){
      clearStravaAuth();
      return null;
    }
    const sessionToken=sessionStorage.getItem(SESSION_TOKEN_KEY);
    // Fall back to localStorage refresh token so auth survives tab close/reopen
    const refreshToken=sessionStorage.getItem(STRAVA_REFRESH_KEY)||localStorage.getItem(STRAVA_REFRESH_LS_KEY)||undefined;
    if(!refreshToken)return null;
    return{...base,access_token:sessionToken||undefined,refresh_token:refreshToken};
  }catch(e){return null;}
}

export function saveStravaAuth(a){
  try{
    if(!a)return;
    const{access_token,refresh_token,...rest}=a;
    const existing=JSON.parse(localStorage.getItem(STRAVA_KEY)||"null");
    // createdAt is written once at initial OAuth and never overwritten — used for expiry check
    const createdAt=existing?.createdAt||Date.now();
    localStorage.setItem(STRAVA_KEY,JSON.stringify({...rest,createdAt,savedAt:Date.now()}));
    if(access_token)sessionStorage.setItem(SESSION_TOKEN_KEY,access_token);
    if(refresh_token){
      sessionStorage.setItem(STRAVA_REFRESH_KEY,refresh_token);
      localStorage.setItem(STRAVA_REFRESH_LS_KEY,refresh_token);
    }
  }catch(e){}
}

export function clearStravaAuth(){
  try{
    localStorage.removeItem(STRAVA_KEY);
    localStorage.removeItem(STRAVA_REFRESH_LS_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(STRAVA_REFRESH_KEY);
  }catch(e){}
}

export async function getStravaToken(auth){
  if(!auth)return null;
  const sessionToken=sessionStorage.getItem(SESSION_TOKEN_KEY);
  if(sessionToken&&auth.expires_at&&Date.now()/1000<auth.expires_at-300)return sessionToken;
  const refreshToken=sessionStorage.getItem(STRAVA_REFRESH_KEY)||auth.refresh_token;
  if(!refreshToken)return null;
  try{
    const r=await fetch("/api/strava-refresh",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refresh_token:refreshToken})});
    if(!r.ok){
      // 401 means refresh token is invalid — clear so user reconnects
      if(r.status===401){clearStravaAuth();window.dispatchEvent(new CustomEvent('strava-auth-expired'));}
      return null;
    }
    const data=await r.json();
    if(!data.access_token)return null;
    const updated={...auth,...data};
    saveStravaAuth(updated);
    return updated.access_token;
  }catch(e){return null;}
}

export async function fetchStravaSplits(stravaNumericId, token){
  if(!stravaNumericId||!token)return null;
  try{
    const r=await fetch(`https://www.strava.com/api/v3/activities/${stravaNumericId}`,{
      headers:{Authorization:`Bearer ${token}`}
    });
    if(!r.ok)return null;
    const data=await r.json();
    const raw=data.splits_metric;
    if(!Array.isArray(raw)||!raw.length)return null;
    let cumSec=0;
    const mapped=raw.map(s=>{
      const splitSec=isFinite(+s.moving_time)&&+s.moving_time>0?+s.moving_time:null;
      const km=isFinite(+s.split)&&+s.split>0?+s.split:null;
      if(!splitSec||!km)return null;
      cumSec+=splitSec;
      return{
        km,
        splitSec,
        cumulativeSec:cumSec,
        avgHR:isFinite(+s.average_heartrate)&&+s.average_heartrate>0?Math.round(+s.average_heartrate):null,
        elev:isFinite(+s.elevation_difference)?Math.round(+s.elevation_difference):null,
        source:"strava"
      };
    }).filter(Boolean);
    return mapped.length?mapped:null;
  }catch(e){return null;}
}

export function mapStravaActivity(a){
  const actType=a?.sport_type||a?.type;
  if(!a||!actType||!["Run","Walk","Hike","TrailRun","VirtualRun"].includes(actType))return null;
  const distM=isFinite(+a.distance)?+a.distance:0;
  const distKm=distM/1000;
  const movingTime=isFinite(+a.moving_time)&&+a.moving_time>0?+a.moving_time:0;
  const paceSecKm=distKm>0&&movingTime>0?movingTime/distKm:0;
  const d=a.start_date_local||a.start_date||new Date().toISOString();
  const dateTs=new Date(d).getTime();
  if(!isFinite(dateTs))return null;
  const avgHR=isFinite(+a.average_heartrate)&&+a.average_heartrate>0?Math.round(+a.average_heartrate):null;
  const maxHR=isFinite(+a.max_heartrate)&&+a.max_heartrate>0?Math.round(+a.max_heartrate):null;
  const elevGain=isFinite(+a.total_elevation_gain)?Math.round(+a.total_elevation_gain):0;
  const trainingLoad=calcTrainingLoad(movingTime,avgHR,distKm);
  const encoded=a.map?.summary_polyline||a.map?.polyline||'';
  const route=encoded?decodePolyline(encoded):[];
  // Strava workout_type: 0=default, 1=race, 2=long run, 3=workout/tempo
  // Use it to override auto-classification so plan completion counts correctly
  const wt=a.workout_type;
  const runClass=wt===2?'long':wt===3?'workout':undefined;
  return migrateActivity({
    id:"s"+a.id, name:String(a.name||"Run").slice(0,128), type:a.sport_type||a.type||"Run",
    date:d.split('T')[0], dateTs,
    distanceKm:parseFloat(distKm.toFixed(3)), movingTimeSec:movingTime,
    avgPaceSecKm:parseFloat(paceSecKm.toFixed(1)),
    avgHR, maxHR, elevGainM:elevGain, elevLossM:0,
    ...(runClass?{runClass}:{}),
    hrSamples:[], route, source:"strava", trainingLoad
  });
}
