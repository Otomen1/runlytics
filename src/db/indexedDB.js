/**
 * IndexedDB Persistence Layer
 * Why: localStorage is synchronous, 5-10 MB quota, rewrites all data every save.
 * IndexedDB is async, per-record writes, GB-level quota on all modern mobile browsers.
 */
import { IDB_NAME, IDB_VERSION, IDB_ACTS, IDB_PHOTOS, IDB_MIGRATED, DATA_KEY } from '../constants/keys.js';
import { migrateActivity } from '../utils/activity.js';

// Singleton DB connection — reused across all operations
let _db = null;

function openIDB(){
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
      if(e.oldVersion<2){
        const photoStore=db.createObjectStore(IDB_PHOTOS,{keyPath:"id",autoIncrement:true});
        photoStore.createIndex("by_activity","activityId",{unique:false});
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

function idbReadAll(){
  return openIDB().then(db=>new Promise((resolve,reject)=>{
    const req=db.transaction(IDB_ACTS,"readonly").objectStore(IDB_ACTS).getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=e=>reject(e.target.error);
  }));
}

function idbGet(id){
  return openIDB().then(db=>new Promise((resolve,reject)=>{
    const req=db.transaction(IDB_ACTS,"readonly").objectStore(IDB_ACTS).get(id);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=e=>reject(e.target.error);
  }));
}

function idbPut(act){
  return openIDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_ACTS,"readwrite");
    tx.objectStore(IDB_ACTS).put(act);
    tx.oncomplete=()=>resolve();
    tx.onerror=e=>reject(e.target.error);
    tx.onabort=e=>reject(new Error("IDB put aborted: "+e.target.error?.message));
  }));
}

function idbPutBatch(acts){
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

function idbDelete(id){
  return openIDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_ACTS,"readwrite");
    tx.objectStore(IDB_ACTS).delete(id);
    tx.oncomplete=()=>resolve();
    tx.onerror=e=>reject(e.target.error);
  }));
}

function idbClear(){
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

export async function saveActivity(act){
  if(!act?.id)throw new Error("saveActivity: missing id");
  await idbPut(act);
  console.log(`[IDB] saved "${act.name}" route:${act.route?.length||0}pts hr:${act.hrSamples?.length||0}pts`);
}

export async function saveActivitiesBatch(acts){
  await idbPutBatch(acts);
  console.log(`[IDB] batch saved ${acts.length} acts`);
}

export async function deleteActivity(id){
  await idbDelete(id);
  console.log("[IDB] deleted",id);
}

export async function clearAllActivities(){
  await idbClear();
  console.log("[IDB] cleared all activities");
}

export async function verifyActivityPersistence(id,expectRoute=false){
  const saved=await idbGet(id);
  if(!saved){
    console.error(`[IDB] VERIFY FAIL: ${id} not found after save`);
    return{ok:false,reason:"not_found"};
  }
  const hasRoute=saved.route&&saved.route.length>=2;
  if(expectRoute&&!hasRoute){
    console.warn(`[IDB] VERIFY WARN: "${saved.name}" saved without route (source:${saved.source})`);
    return{ok:false,reason:"no_route"};
  }
  console.log(`[IDB] verified "${saved.name}" route:${saved.route?.length||0}pts hr:${saved.hrSamples?.length||0}pts`);
  return{ok:true};
}

export async function migrateFromLocalStorage(){
  if(localStorage.getItem(IDB_MIGRATED))return false;
  const raw=localStorage.getItem(DATA_KEY);
  if(!raw){localStorage.setItem(IDB_MIGRATED,"1");return false;}
  try{
    console.log("[IDB] migrating localStorage → IndexedDB…");
    const acts=JSON.parse(raw).map(migrateActivity).filter(Boolean);
    if(acts.length){
      await saveActivitiesBatch(acts);
      console.log(`[IDB] migration complete: ${acts.length} acts preserved`);
    }
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

const ALLOWED_PHOTO_MIME = new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif']);

export async function addPhoto(activityId, blob, thumbBlob, mimeType){
  if(!ALLOWED_PHOTO_MIME.has(mimeType)){
    throw new Error(`Unsupported photo type: ${mimeType}. Use JPEG, PNG, or WebP.`);
  }
  if(blob.size>10*1024*1024){
    throw new Error('Photo exceeds 10 MB limit.');
  }
  return openIDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_PHOTOS,"readwrite");
    const req=tx.objectStore(IDB_PHOTOS).add({activityId,blob,thumbBlob,mimeType,addedAt:Date.now()});
    req.onsuccess=()=>resolve(req.result);
    req.onerror=e=>reject(e.target.error);
    tx.onerror=e=>reject(e.target.error);
  }));
}

export async function getPhotos(activityId){
  return openIDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_PHOTOS,"readonly");
    const idx=tx.objectStore(IDB_PHOTOS).index("by_activity");
    const req=idx.getAll(activityId);
    req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>a.addedAt-b.addedAt));
    req.onerror=e=>reject(e.target.error);
  }));
}

export async function deletePhoto(id){
  return openIDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_PHOTOS,"readwrite");
    tx.objectStore(IDB_PHOTOS).delete(id);
    tx.oncomplete=()=>resolve();
    tx.onerror=e=>reject(e.target.error);
  }));
}

export async function deletePhotosForActivity(activityId){
  return openIDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_PHOTOS,"readwrite");
    const store=tx.objectStore(IDB_PHOTOS);
    const req=store.index("by_activity").getAllKeys(activityId);
    req.onsuccess=()=>{req.result.forEach(k=>store.delete(k));};
    tx.oncomplete=()=>resolve();
    tx.onerror=e=>reject(e.target.error);
  }));
}

export async function cleanupOrphanedPhotos(validActivityIds){
  return openIDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_PHOTOS,"readwrite");
    const store=tx.objectStore(IDB_PHOTOS);
    const req=store.getAll();
    req.onsuccess=()=>{req.result.forEach(photo=>{if(!validActivityIds.has(photo.activityId))store.delete(photo.id);});};
    tx.oncomplete=()=>resolve();
    tx.onerror=e=>reject(e.target.error);
  }));
}

export function loadActsLegacy(){
  try{
    const raw=localStorage.getItem(DATA_KEY)||"[]";
    return JSON.parse(raw).map(migrateActivity).filter(Boolean);
  }catch{return[];}
}
