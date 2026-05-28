import { IDB_NAME, IDB_VERSION, IDB_ACTS, IDB_MIGRATED, DATA_KEY } from '../constants/keys.js';
import { migrateActivity } from '../utils/activity.js';

let _db = null;

export function openIDB(){
  if(_db)return Promise.resolve(_db);
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==="undefined"){
      return reject(new Error("IndexedDB not available in this environment"));
    }
    const req=indexedDB.open(IDB_NAME,IDB_VERSION);
    req.onupgradeneeded=e=>{
      const db=e.target.result;
      if(!db.objectStoreNames.contains(IDB_ACTS)){
        const store=db.createObjectStore(IDB_ACTS,{keyPath:"id"});
        store.createIndex("by_date","dateTs",{unique:false});
        store.createIndex("by_source","source",{unique:false});
      }
    };
    req.onsuccess=e=>{
      _db=e.target.result;
      // Reset cached handle if the DB is closed externally (e.g. version bump)
      _db.onclose=()=>{_db=null;};
      _db.onversionchange=()=>{_db.close();_db=null;};
      resolve(_db);
    };
    req.onerror=e=>reject(new Error("IDB open failed: "+(e.target.error?.message||"unknown")));
    req.onblocked=()=>console.warn("[IDB] open blocked — another tab has an older version open");
  });
}

export function idbReadAll(){
  return openIDB().then(db=>new Promise((resolve,reject)=>{
    const req=db.transaction(IDB_ACTS,"readonly").objectStore(IDB_ACTS).getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=e=>reject(e.target.error);
  }));
}

export function idbGet(id){
  return openIDB().then(db=>new Promise((resolve,reject)=>{
    const req=db.transaction(IDB_ACTS,"readonly").objectStore(IDB_ACTS).get(id);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=e=>reject(e.target.error);
  }));
}

export function idbPut(act){
  return openIDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_ACTS,"readwrite");
    tx.objectStore(IDB_ACTS).put(act);
    tx.oncomplete=()=>resolve();
    tx.onerror=e=>reject(e.target.error);
    tx.onabort=e=>reject(new Error("IDB put aborted: "+e.target.error?.message));
  }));
}

export function idbPutBatch(acts){
  if(!acts.length)return Promise.resolve();
  return openIDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_ACTS,"readwrite");
    const store=tx.objectStore(IDB_ACTS);
    acts.forEach(a=>store.put(a));
    tx.oncomplete=()=>resolve();
    tx.onerror=e=>reject(e.target.error);
    tx.onabort=e=>reject(new Error("IDB batch aborted: "+e.target.error?.message));
  }));
}

export function idbDelete(id){
  return openIDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_ACTS,"readwrite");
    tx.objectStore(IDB_ACTS).delete(id);
    tx.oncomplete=()=>resolve();
    tx.onerror=e=>reject(e.target.error);
  }));
}

export function idbClear(){
  return openIDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_ACTS,"readwrite");
    tx.objectStore(IDB_ACTS).clear();
    tx.oncomplete=()=>resolve();
    tx.onerror=e=>reject(e.target.error);
  }));
}

export async function loadActivities(){
  const raw=await idbReadAll();
  const acts=raw.map(migrateActivity).filter(Boolean);
  acts.sort((a,b)=>(b.dateTs||0)-(a.dateTs||0));
  const withRoutes=acts.filter(a=>a.route?.length>=2).length;
  console.log(`[IDB] load: ${acts.length} acts, ${withRoutes} with routes`);
  if(withRoutes<acts.length)
    console.warn(`[IDB] ${acts.length-withRoutes} act(s) have no route — Strava acts may need re-sync`);
  return acts;
}

export async function deleteActivity(id){
  await idbDelete(id);
  console.log("[IDB] deleted",id);
}

export   if(!saved){
    console.error(`[IDB] VERIFY FAIL: ${id} not found after save`);
    return{ok:false,reason:"not_found"};
  }

export   }
  console.log(`[IDB] verified "${saved.name}" route:${saved.route?.length||0}pts hr:${saved.hrSamples?.length||0}pts`);
  return{ok:true};
}

// ── One-time migration from localStorage ─────────────────────────────────────
// Reads the legacy JSON blob, writes each activity individually to IDB,
// then sets a flag so this only runs once.
async function migrateFromLocalStorage(){
  if(localStorage.getItem(IDB_MIGRATED))return false;
  const raw=localStorage.getItem(DATA_KEY);
  if(!raw){localStorage.setItem(IDB_MIGRATED,"1");return false;}
  try{

export   if(localStorage.getItem(IDB_MIGRATED))return false;
  const raw=localStorage.getItem(DATA_KEY);

export     }
    localStorage.setItem(IDB_MIGRATED,"1");
    // Keep legacy key for one session as a safety backup.
    // A future version can delete it: localStorage.removeItem(DATA_KEY)
    return true;
  }catch(e){
    // Don't set flag — retry next session
    console.error("[IDB] migration failed:",e.message);
    return false;
  }
}

// ── Read-only legacy fallback (used only when IDB is unavailable) ─────────────
function loadActsLegacy(){
  try{
    const raw=localStorage.getItem(DATA_KEY)||"[]";
    return JSON.parse(raw).map(migrateActivity).filter(Boolean);
  }catch{return[];}
}

// ── Retained utilities ────────────────────────────────────────────────────────
function storageSizeKB(str){return Math.round(str.length*2/1024);}

// normalizeRoute — single source of truth for point validation and normalisation.
// Accepts {lat,lon} OR {lat,lng} (older Strava/Garmin integrations).
// Used in: migrateActivity, mapStravaActivity, all renderers.
function normalizeRoute(pts){
  if(!Array.isArray(pts)||!pts.length)return[];
  const out=[];
  for(const p of pts){
    if(!p)continue;
    const lat=+p.lat;
    const lon=p.lon!=null?+p.lon:+p.lng; // handle {lat,lng} legacy format
    if(isFinite(lat)&&isFinite(lon)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180){

export function loadActsLegacy(){
  try{
    const raw=localStorage.getItem(DATA_KEY)||"[]";
    return JSON.parse(raw).map(migrateActivity).filter(Boolean);
  }catch{return[];}
}

export function loadActsLegacy(){
  try{
    const raw=localStorage.getItem(DATA_KEY)||"[]";
    return JSON.parse(raw).map(migrateActivity).filter(Boolean);
  }catch{return[];}
}
