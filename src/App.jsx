import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';

// ── Persistence ──────────────────────────────────────────────────────────────
import {
  loadActivities, saveActivity, saveActivitiesBatch,
  deleteActivity, clearAllActivities, verifyActivityPersistence,
  migrateFromLocalStorage, loadActsLegacy,
} from './db/indexedDB.js';
import { loadStravaAuth, saveStravaAuth, clearStravaAuth, getStravaToken, mapStravaActivity } from './db/strava.js';

// ── Utils ────────────────────────────────────────────────────────────────────
import { migrateActivity } from './utils/activity.js';
import { buildAnalytics, computeTierProgress } from './utils/analytics.js';
import { computeEarnedBadges } from './constants/achievements.js';
import { checkAndNotify } from './utils/notifications.js';

// ── Constants ────────────────────────────────────────────────────────────────
import {
  GOALS_KEY, HR_KEY, PROFILE_KEY, BADGES_KEY,
  TAB_KEY, ONBOARDING_KEY, MILESTONES_KEY, THEME_KEY, TIERS_KEY,
} from './constants/keys.js';
import { TABS } from './constants/activityTypes.js';

// ── Styles ───────────────────────────────────────────────────────────────────
import { Styles } from './styles/GlobalStyles.jsx';

// ── Tab Screens ───────────────────────────────────────────────────────────────
import { HomeTab }         from './components/Tabs/HomeTab.jsx';
const StatsTab = lazy(()=>import('./components/Tabs/StatsTab.jsx').then(m=>({default:m.StatsTab})));
import { MoreTab }         from './components/Tabs/MoreTab.jsx';
import { MemoriesTab }     from './components/Tabs/MemoriesTab.jsx';
import { AchievementsTab } from './components/Tabs/AchievementsTab.jsx';

// ── Overlays & Modals ────────────────────────────────────────────────────────
import { Detail }        from './components/Activity/Detail.jsx';
import { Upload }        from './components/Activity/Upload.jsx';
import { AllRunsView }   from './components/Activity/AllRunsView.jsx';
import { SettingsPanel } from './components/Modals/SettingsPanel.jsx';
import { PRDetailModal } from './components/Modals/PRDetailModal.jsx';
import { DebugPanel }    from './components/Modals/DebugPanel.jsx';
import { Onboarding }   from './components/Modals/Onboarding.jsx';
// Heavy modals — lazy-loaded on first use to keep initial bundle smaller
const ShareModal     = lazy(()=>import('./components/Share/ShareModal.jsx').then(m=>({default:m.ShareModal})));
const ShareEditor    = lazy(()=>import('./components/Share/ShareEditor.jsx').then(m=>({default:m.ShareEditor})));
const MonthlyReport  = lazy(()=>import('./components/Modals/MonthlyReport.jsx').then(m=>({default:m.MonthlyReport})));
const MonthlyWrapped = lazy(()=>import('./components/Modals/MonthlyWrapped.jsx').then(m=>({default:m.MonthlyWrapped})));
const YearInReview   = lazy(()=>import('./components/Modals/YearInReview.jsx').then(m=>({default:m.YearInReview})));
const ShoeTracker    = lazy(()=>import('./components/Modals/ShoeTracker.jsx').then(m=>({default:m.ShoeTracker})));
const PlanBuilderModal = lazy(()=>import('./components/Modals/PlanBuilderModal.jsx').then(m=>({default:m.PlanBuilderModal})));

// ── localStorage helpers (lightweight prefs only) ────────────────────────────
let _onStorageError=null; // set by App to surface quota errors to the UI
function lsSet(key,val){
  try{localStorage.setItem(key,JSON.stringify(val));}
  catch(e){if(_onStorageError&&(e.name==='QuotaExceededError'||e.code===22))_onStorageError('Settings storage full — some preferences may not persist.');}
}
function lsGet(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}}
function loadGoals()    { return lsGet(GOALS_KEY,{weekly:40,monthly:160}); }
function saveGoals(g)   { lsSet(GOALS_KEY,g); }
function loadHRProfile(){ return lsGet(HR_KEY,{age:30,overrideMAF:null,modifier:0}); }
function saveHRProfile(p){ lsSet(HR_KEY,p); }
function loadProfile()  { return lsGet(PROFILE_KEY,{name:'Runner'}); }
function saveProfile(p) { lsSet(PROFILE_KEY,p); }
function loadSeenBadges(){ try{return new Set(JSON.parse(localStorage.getItem(BADGES_KEY)||'[]'));}catch{return new Set();} }
function saveSeenBadges(ids){ lsSet(BADGES_KEY,[...ids]); }
function loadTheme(){ try{return localStorage.getItem(THEME_KEY)||'dark';}catch{return 'dark';} }

function checkMilestones(acts, analytics) {
  if (!acts.length) return null;
  try {
    const seen = new Set(JSON.parse(localStorage.getItem(MILESTONES_KEY)||'[]'));
    const total = acts.reduce((s,a)=>s+a.distanceKm,0);
    const streak = analytics.streak||0;
    const ms = [
      {key:'first_run',   cond:acts.length>=1,    emoji:'🎉', msg:'First run logged!'},
      {key:'km_100',      cond:total>=100,         emoji:'💯', msg:'100 km total — milestone!'},
      {key:'km_500',      cond:total>=500,         emoji:'🚀', msg:'500 km total — you\'re on fire!'},
      {key:'km_1000',     cond:total>=1000,        emoji:'🏆', msg:'1,000 km — elite runner!'},
      {key:'streak_7',    cond:streak>=7,          emoji:'🔥', msg:'7-day run streak!'},
      {key:'streak_30',   cond:streak>=30,         emoji:'👑', msg:'30-day streak — legendary!'},
    ];
    for (const m of ms) {
      if (m.cond && !seen.has(m.key)) {
        seen.add(m.key);
        localStorage.setItem(MILESTONES_KEY, JSON.stringify([...seen]));
        return {emoji:m.emoji, msg:m.msg};
      }
    }
  } catch {}
  return null;
}


const App=()=>{
  // Activities start empty — populated async from IndexedDB in useEffect below.
  // We cannot use useState(loadActs) synchronously because IDB is async.
  const[acts,setActsRaw]=useState([]);
  const[dbReady,setDbReady]=useState(false);    // true once IDB load completes
  const[storageError,setStorageError]=useState(null); // visible error banner
  _onStorageError=setStorageError; // route quota errors to the UI banner
  const[goals,setGoals]=useState(loadGoals);
  const[hrProfile,setHRProfile]=useState(loadHRProfile);
  const[profile,setProfile]=useState(loadProfile);
  const[tab,setTabRaw]=useState(()=>{const t=localStorage.getItem(TAB_KEY)||"home";return t==="tasks"?"home":t;});
  const[detail,setDetail]=useState(null);
  const[showUpload,setShowUpload]=useState(false);
  const[showSettings,setShowSettings]=useState(false);
  const[showAllRuns,setShowAllRuns]=useState(false);
  const[showMonthly,setShowMonthly]=useState(false);
  const[wrappedMonth,setWrappedMonth]=useState(null);
  const[showYearReview,setShowYearReview]=useState(false);
  const[showShoes,setShowShoes]=useState(false);
  const[shareAct,setShareAct]=useState(null);
  const[prDetail,setPrDetail]=useState(null);
  const[showEditor,setShowEditor]=useState(false);
  const[editorAct,setEditorAct]=useState(null);
  const[isOnline,setIsOnline]=useState(()=>navigator.onLine);
  const[stravaAuth,setStravaAuth]=useState(loadStravaAuth);
  const[stravaSync,setStravaSync]=useState({loading:false,msg:""});
  const[hasUnseen,setHasUnseen]=useState(false);
  const[showDebug,setShowDebug]=useState(false);
  const[showPlanBuilder,setShowPlanBuilder]=useState(false);
  const[theme,setTheme]=useState(loadTheme);
  const[toast,setToast]=useState(null);
  const toastTimerRef=useRef(null);
  const debugTapRef=useRef(0);

  // ── Pull-to-refresh state (callbacks defined after doStravaSync to avoid TDZ) ─
  const[pullY,setPullY]=useState(0);
  const[pullReleasing,setPullReleasing]=useState(false);
  const pullStartRef=useRef(null);
  const scrollRef=useRef(null);
  const PULL_THRESHOLD=60;

  const isSyncingRef=useRef(false),lastSyncRef=useRef(0),isRepairingRef=useRef(false);
  // Undo-delete: hold a pending delete in memory for 3 s before committing to IDB
  const pendingDeleteRef=useRef(null);
  const deleteTimerRef=useRef(null);

  // Single ref map for all open modals — drives both popstate and keydown without duplication
  const modalCloseOrder=useRef([
    {get:()=>showEditor,     set:()=>setShowEditor(false)},
    {get:()=>shareAct,       set:()=>setShareAct(null)},
    {get:()=>prDetail,       set:()=>setPrDetail(null)},
    {get:()=>detail,         set:()=>setDetail(null)},
    {get:()=>showSettings,   set:()=>setShowSettings(false)},
    {get:()=>showAllRuns,    set:()=>setShowAllRuns(false)},
    {get:()=>showMonthly,    set:()=>setShowMonthly(false)},
    {get:()=>showYearReview, set:()=>setShowYearReview(false)},
    {get:()=>showShoes,      set:()=>setShowShoes(false)},
    {get:()=>showUpload,     set:()=>setShowUpload(false)},
  ]);

  const closeTopModal=useCallback(()=>{
    const entries=modalCloseOrder.current;
    for(const entry of entries){
      if(entry.get()){entry.set();history.replaceState({_rl:"s"},"");return true;}
    }
    return false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[showEditor,shareAct,prDetail,detail,showSettings,showAllRuns,showMonthly,showYearReview,showShoes,showUpload]);

  useEffect(()=>{
    try{history.replaceState({_rl:"root"},"");history.pushState({_rl:"s"},"");}catch(e){}
  },[]);

  useEffect(()=>{
    const h=(e)=>{
      if(!closeTopModal()&&(!e.state||e.state._rl==="root")){history.replaceState({_rl:"s"},"");}
    };
    window.addEventListener("popstate",h);return()=>window.removeEventListener("popstate",h);
  },[closeTopModal]);

  useEffect(()=>{
    const onKey=(e)=>{
      if(e.key!=='Escape')return;
      const tag=document.activeElement&&document.activeElement.tagName;
      if(tag==='INPUT'||tag==='TEXTAREA')return;
      closeTopModal();
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[closeTopModal]);

  const back=useCallback(()=>history.back(),[]);

  // Kick off the Strava OAuth authorize redirect (used by Settings and Onboarding).
  const startStravaConnect=useCallback(()=>{
    const cid=window.__STRAVA_CLIENT_ID;
    if(!cid){alert("Strava client ID not configured.");return;}
    const state=crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
    try{sessionStorage.setItem('_rl_oauth_state',state);}catch{}
    const redirect=encodeURIComponent(window.location.origin+window.location.pathname);
    window.location.href="https://www.strava.com/oauth/authorize?client_id="+cid+"&redirect_uri="+redirect+"&response_type=code&scope=activity:read_all&state="+encodeURIComponent(state);
  },[]);

  // ── Async DB initialisation ─────────────────────────────────────────────────
  // Run once on mount: migrate legacy localStorage data → IDB, then load.
  // Falls back to localStorage data if IDB is unavailable (private browsing, old WebView).
  useEffect(()=>{
    (async()=>{
      try{
        await migrateFromLocalStorage();
        const loaded=await loadActivities();
        setActsRaw(loaded);
      }catch(e){
        console.error("[IDB] init failed — falling back to localStorage:",e.message);
        setStorageError("Storage initialisation failed. Data may not persist across sessions.");
        try{setActsRaw(loadActsLegacy());}catch{}
      }finally{
        setDbReady(true);
      }
    })();
  },[]);

  useEffect(()=>{
    document.documentElement.setAttribute('data-theme',theme);
    try{localStorage.setItem(THEME_KEY,theme);}catch{}
  },[theme]);

  // setActs: state-only updater. Persistence is handled per-operation below.
  // Do NOT use this for saves — use saveActivity/deleteActivity/clearAllActivities.
  const setActs=useCallback(updater=>{setActsRaw(updater);},[]);

  const setTab=useCallback(t=>{setTabRaw(t);try{localStorage.setItem(TAB_KEY,t);}catch(e){}},[]); 

  const openDetail=useCallback(act=>{history.pushState({_rl:"d"},"");setDetail(act);},[]);
  const openShare=useCallback(act=>{history.pushState({_rl:"sh"},"");setShareAct(act);},[]);
  const openEditor=useCallback(act=>{history.pushState({_rl:"ed"},"");setEditorAct(act);setShowEditor(true);},[]);
  const switchToEditor=useCallback(act=>{
    history.replaceState({_rl:"ed"},"");
    setShareAct(null);
    setEditorAct(act);
    setShowEditor(true);
  },[]);
  const openPR=useCallback(entry=>{history.pushState({_rl:"pr"},"");setPrDetail(entry);},[]);
  const openSettings=useCallback(()=>{history.pushState({_rl:"se"},"");setShowSettings(true);},[]);
  const openAllRuns=useCallback(()=>{history.pushState({_rl:"a"},"");setShowAllRuns(true);},[]);
  const openMonthly=useCallback(()=>{history.pushState({_rl:"m"},"");setShowMonthly(true);},[]);
  const openYearReview=useCallback(()=>{history.pushState({_rl:"yr"},"");setShowYearReview(true);},[]);
  const openShoes=useCallback(()=>{history.pushState({_rl:"sh"},"");setShowShoes(true);},[]);
  const openUpload=useCallback(()=>{history.pushState({_rl:"u"},"");setShowUpload(true);},[]);

  const undoDelete=useCallback(()=>{
    if(!pendingDeleteRef.current)return;
    clearTimeout(deleteTimerRef.current);
    const restored=pendingDeleteRef.current;
    pendingDeleteRef.current=null;
    setActsRaw(p=>[...p,restored].sort((a,b)=>b.date-a.date));
    setToast(null);
  },[]);

  // deleteAct: optimistic UI remove + 3.5-second undo window before IDB delete
  const deleteAct=useCallback(id=>{
    const found=acts.find(a=>a.id===id);
    setActsRaw(p=>p.filter(a=>a.id!==id));
    history.back();
    // Cancel any in-flight pending delete first
    if(deleteTimerRef.current){clearTimeout(deleteTimerRef.current);if(pendingDeleteRef.current)deleteActivity(pendingDeleteRef.current.id).catch(()=>{});}
    pendingDeleteRef.current=found||null;
    clearTimeout(toastTimerRef.current);
    setToast({emoji:'🗑',msg:'Run deleted',undo:true});
    deleteTimerRef.current=setTimeout(()=>{
      if(pendingDeleteRef.current){deleteActivity(pendingDeleteRef.current.id).catch(err=>console.error("[IDB] deleteActivity failed:",err));pendingDeleteRef.current=null;}
      setToast(null);
    },3500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[acts]);

  // addAct: optimistic state update first (instant UI), then persist to IDB.
  // Verification checks that route data was actually written — surfaces error if not.
  const addAct=useCallback(act=>{
    setActsRaw(prev=>{
      if(prev.some(a=>a.id===act.id))return prev;
      return[act,...prev];
    });
    const expectRoute=act.source==="gpx"&&act.route?.length>=2;
    saveActivity(act)
      .then(()=>verifyActivityPersistence(act.id,expectRoute))
      .then(v=>{
        if(!v.ok){
          const msg=v.reason==="no_route"
            ?`Route data missing for "${act.name}" after save. Re-upload the GPX to restore.`
            :`Save verification failed for "${act.name}" (${v.reason}).`;
          setStorageError(msg);
        }
      })
      .catch(err=>setStorageError(`Save failed: ${err.message}. Data is in memory but may not persist.`));
  },[]);

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
      setActsRaw(prev=>{
        const existingIds=new Set(prev.map(a=>a.id));
        const newActs=mapped.filter(a=>!existingIds.has(a.id));
        const toSave=[];
        const patched=prev.map(a=>{
          const fresh=mapped.find(m=>m.id===a.id);
          if(fresh&&(!a.route||a.route.length<2)&&fresh.route?.length>=2){
            const updated={...a,route:fresh.route};
            toSave.push(updated);
            return updated;
          }
          return a;
        });
        newActs.forEach(a=>toSave.push(a));
        const routesFixed=toSave.length-newActs.length;
        if(newActs.length)console.log(`[IDB] Strava sync: +${newActs.length} new`);
        if(routesFixed)console.log(`[IDB] routes restored: ${routesFixed}`);
        if(!newActs.length&&!routesFixed)return prev;
        if(toSave.length)saveActivitiesBatch(toSave).catch(err=>{console.error('[IDB] Strava sync save failed:',err);setStorageError('Strava sync save failed. Please refresh and try again.');});
        const syncMsg=newActs.length?`✓ ${newActs.length} new run${newActs.length!==1?"s":""} synced`:routesFixed?`✓ ${routesFixed} route${routesFixed!==1?"s":""} restored`:"";
        if(syncMsg)setTimeout(()=>setStravaSync({loading:false,msg:syncMsg}),0);
        return newActs.length?[...newActs,...patched]:patched;
      });
    }catch(e){setStravaSync({loading:false,msg:"Sync failed."});}
    isSyncingRef.current=false;
  },[]);

  const onPullStart=useCallback((e)=>{
    if(tab!=="home"||!isOnline)return;
    const el=scrollRef.current;
    if(!el||el.scrollTop>0)return;
    pullStartRef.current=e.touches[0].clientY;
    setPullReleasing(false);
  },[tab,isOnline]);
  const onPullMove=useCallback((e)=>{
    if(pullStartRef.current==null)return;
    const el=scrollRef.current;
    if(el&&el.scrollTop>0){pullStartRef.current=null;setPullY(0);return;}
    const dy=e.touches[0].clientY-pullStartRef.current;
    if(dy<=0){setPullY(0);return;}
    setPullY(Math.min(110,dy*0.5));
  },[]);
  const onPullEnd=useCallback(()=>{
    if(pullStartRef.current==null)return;
    pullStartRef.current=null;
    const triggered=pullY>=PULL_THRESHOLD;
    setPullReleasing(true);
    setPullY(0);
    if(triggered&&stravaAuth)doStravaSync(false);
  },[pullY,stravaAuth,doStravaSync]);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);const code=params.get("code");
    if(!code)return;
    const returnedState=params.get("state");
    let savedState=null;try{savedState=sessionStorage.getItem('_rl_oauth_state');sessionStorage.removeItem('_rl_oauth_state');}catch{}
    if(!savedState||returnedState!==savedState){console.warn('[OAuth] state mismatch or missing — ignoring callback');return;}
    window.history.replaceState({},"",window.location.pathname);
    (async()=>{
      try{
        const r=await fetch("/api/strava-token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code})});if(!r.ok)return;
        const data=await r.json();saveStravaAuth(data);setStravaAuth(data);
        setTimeout(()=>doStravaSync(false),500);
      }catch(e){}
    })();
  },[doStravaSync]);

  useEffect(()=>{
    const goOnline =()=>{setIsOnline(true); if(stravaAuth)doStravaSync(true);};
    const goOffline=()=>setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline",goOffline);
    return()=>{window.removeEventListener("online",goOnline);window.removeEventListener("offline",goOffline);};
  },[stravaAuth,doStravaSync]);

  useEffect(()=>{
    if(stravaAuth&&isOnline)doStravaSync(true);
    const onFocus=()=>{if(stravaAuth&&isOnline&&Date.now()-lastSyncRef.current>300000)doStravaSync(true);};
    window.addEventListener("focus",onFocus);
    const t=setInterval(()=>{if(stravaAuth&&isOnline)doStravaSync(true);},300000);
    return()=>{window.removeEventListener("focus",onFocus);clearInterval(t);};
  },[stravaAuth,doStravaSync,isOnline]);

  const analytics=useMemo(()=>buildAnalytics(acts),[acts]);
  const tierProgress=useMemo(()=>computeTierProgress(acts),[acts]);
  const earnedBadgeIds=useMemo(()=>computeEarnedBadges(acts),[acts]);
  const earnedBadgesSet=useMemo(()=>new Set(earnedBadgeIds),[earnedBadgeIds]);
  const newTiers=useMemo(()=>{
    if(!dbReady||!tierProgress.length)return[];
    try{
      const seen=new Set(JSON.parse(localStorage.getItem(TIERS_KEY)||'[]'));
      const fresh=tierProgress.filter(tp=>tp.completed&&!seen.has(tp.id)).map(tp=>tp.id);
      if(fresh.length){localStorage.setItem(TIERS_KEY,JSON.stringify([...seen,...fresh]));}
      return fresh;
    }catch{return[];}
  },[tierProgress,dbReady]);

  useEffect(()=>{
    if(!dbReady)return;
    checkAndNotify(acts,goals);
  },[dbReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{
    if(!dbReady||!acts.length)return;
    const milestone=checkMilestones(acts,analytics);
    if(!milestone)return;
    clearTimeout(toastTimerRef.current);
    setToast(milestone);
    toastTimerRef.current=setTimeout(()=>setToast(null),4000);
  },[acts,analytics,dbReady]);

  useEffect(()=>{
    const seen=loadSeenBadges();setHasUnseen(earnedBadgeIds.some(id=>!seen.has(id)));
  },[earnedBadgeIds]);
  useEffect(()=>{
    if(tab==="awards"){const seen=loadSeenBadges();saveSeenBadges(new Set([...seen,...earnedBadgeIds]));setHasUnseen(false);}
  },[tab,earnedBadgeIds]);

  return(
    <div style={{maxWidth:480,margin:"0 auto",minHeight:"100vh",display:"flex",flexDirection:"column",background:"var(--bg)"}}>
      <Styles/>
      <div style={{padding:"max(14px,calc(env(safe-area-inset-top)+8px)) 16px 10px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0,borderBottom:"1px solid var(--bd)"}}>
        <div style={{fontWeight:800,fontSize:"1.05rem",letterSpacing:".06em",color:"var(--or)",cursor:"pointer",userSelect:"none"}}
          onClick={()=>{if(!import.meta.env.DEV)return;debugTapRef.current++;if(debugTapRef.current>=5){setShowDebug(true);debugTapRef.current=0;}setTimeout(()=>{debugTapRef.current=0;},1500);}}>RUNLYTICS</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {stravaSync.loading&&<div className="spinner"/>}
          {stravaAuth&&!stravaSync.loading&&stravaSync.msg&&(
            <div style={{fontSize:".68rem",color:"var(--gn)",background:"var(--gn2)",padding:"2px 8px",borderRadius:20,fontWeight:600}}>{stravaSync.msg}</div>
          )}
          <button className="hdr-btn" onClick={()=>setTheme(t=>t==='dark'?'light':'dark')} aria-label="Toggle theme">{theme==='dark'?'☀️':'🌙'}</button>
          <button className="hdr-btn" onClick={openSettings} aria-label="Settings">⚙️</button>
        </div>
      </div>
      {/* Offline banner */}
      {!isOnline&&(
        <div style={{background:"rgba(234,179,8,.1)",borderBottom:"1px solid rgba(234,179,8,.25)",padding:"7px 14px",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <span style={{fontSize:".75rem",color:"var(--yw)",flex:1}}>📶 You're offline — your data is safe, sync resumes when reconnected.</span>
        </div>
      )}
      {/* Storage error banner — shown when IDB save/load fails */}
      {storageError&&(
        <div style={{background:"rgba(239,68,68,.1)",borderBottom:"1px solid rgba(239,68,68,.25)",padding:"9px 14px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <span style={{fontSize:".8rem",color:"var(--rd)",flex:1,lineHeight:1.5}}>⚠️ {storageError}</span>
          <button onClick={()=>setStorageError(null)} style={{background:"none",border:"none",color:"var(--rd)",cursor:"pointer",fontSize:".9rem",flexShrink:0,padding:"2px 4px"}}>✕</button>
        </div>
      )}
      {/* Loading state while IDB initialises */}
      {!dbReady
        ?<div style={{flex:1,padding:"16px 14px",overflowY:"hidden"}}>
            {/* Fake stats header */}
            <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:14,padding:16,marginBottom:14}}>
              <div style={{height:10,borderRadius:5,width:'40%',marginBottom:14,backgroundImage:'linear-gradient(90deg,var(--bd) 25%,var(--bd2) 50%,var(--bd) 75%)',backgroundSize:'200% 100%',animation:'shimmer 1.4s ease infinite'}}/>
              <div style={{display:'flex',gap:10,marginBottom:10}}>
                {[0,1,2].map(i=>(
                  <div key={i} style={{flex:1,height:52,borderRadius:10,backgroundImage:'linear-gradient(90deg,var(--bd) 25%,var(--bd2) 50%,var(--bd) 75%)',backgroundSize:'200% 100%',animation:`shimmer 1.4s ${i*0.12}s ease infinite`}}/>
                ))}
              </div>
              <div style={{height:8,borderRadius:4,width:'60%',backgroundImage:'linear-gradient(90deg,var(--bd) 25%,var(--bd2) 50%,var(--bd) 75%)',backgroundSize:'200% 100%',animation:'shimmer 1.4s 0.3s ease infinite'}}/>
            </div>
            {/* Fake run card rows */}
            {[0,1,2,3].map(i=>(
              <div key={i} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:14,padding:'13px 13px',marginBottom:9,display:'flex',alignItems:'center',gap:12}}>
                <div style={{flex:1}}>
                  <div style={{height:10,borderRadius:5,width:'65%',marginBottom:10,backgroundImage:'linear-gradient(90deg,var(--bd) 25%,var(--bd2) 50%,var(--bd) 75%)',backgroundSize:'200% 100%',animation:`shimmer 1.4s ${i*0.1}s ease infinite`}}/>
                  <div style={{height:18,borderRadius:5,width:'40%',marginBottom:8,backgroundImage:'linear-gradient(90deg,var(--bd) 25%,var(--bd2) 50%,var(--bd) 75%)',backgroundSize:'200% 100%',animation:`shimmer 1.4s ${i*0.1+0.1}s ease infinite`}}/>
                  <div style={{height:8,borderRadius:4,width:'50%',backgroundImage:'linear-gradient(90deg,var(--bd) 25%,var(--bd2) 50%,var(--bd) 75%)',backgroundSize:'200% 100%',animation:`shimmer 1.4s ${i*0.1+0.2}s ease infinite`}}/>
                </div>
                <div style={{width:52,height:52,borderRadius:10,flexShrink:0,backgroundImage:'linear-gradient(90deg,var(--bd) 25%,var(--bd2) 50%,var(--bd) 75%)',backgroundSize:'200% 100%',animation:`shimmer 1.4s ${i*0.1+0.15}s ease infinite`}}/>
              </div>
            ))}
          </div>
        :<div ref={scrollRef} onTouchStart={onPullStart} onTouchMove={onPullMove} onTouchEnd={onPullEnd} onTouchCancel={onPullEnd}
            style={{flex:1,overflowY:"auto",padding:"0 14px 100px",position:"relative"}}>
          {tab==="home"&&isOnline&&(pullY>0||pullReleasing)&&(
            <div style={{position:"absolute",top:0,left:0,right:0,display:"flex",justifyContent:"center",alignItems:"center",
              height:Math.max(0,pullY),overflow:"hidden",pointerEvents:"none",zIndex:5,
              transition:pullReleasing?"height .25s ease":"none"}}>
              <div className="spinner" style={{opacity:Math.min(1,pullY/PULL_THRESHOLD),transform:`rotate(${pullY*3}deg)`}}/>
            </div>
          )}
          <div key={tab} className="tab-in"
            style={{transform:`translateY(${pullY}px)`,transition:pullReleasing?"transform .25s ease":"none"}}
            onTransitionEnd={()=>{if(pullReleasing)setPullReleasing(false);}}>
            {tab==="home"&&<HomeTab acts={acts} analytics={analytics} goals={goals} hrProfile={hrProfile} profile={profile} onSelectAct={openDetail} onUpload={openUpload} onViewAll={openAllRuns} onViewMonthly={openMonthly} onEditGoals={openSettings} onOpenPlan={()=>setShowPlanBuilder(true)} onOpenSettings={openSettings}/>}
            {tab==="stats"&&<Suspense fallback={<div style={{display:"flex",justifyContent:"center",paddingTop:60}}><div className="spinner"/></div>}><StatsTab acts={acts} analytics={analytics} hrProfile={hrProfile} onViewAll={openAllRuns} onViewMonthly={openMonthly} onOpenPR={openPR} onViewYearReview={openYearReview} onManageShoes={openShoes}/></Suspense>}
            {tab==="hr"&&<MoreTab acts={acts} hrProfile={hrProfile} onEditHR={openSettings} onViewMonthly={openMonthly} onViewYearReview={openYearReview} onOpenPlan={()=>setShowPlanBuilder(true)}/>}
            {tab==="memories"&&<MemoriesTab acts={acts} onSelectAct={openDetail} onOpenWrapped={setWrappedMonth}/>}
            {tab==="awards"&&<AchievementsTab earnedBadges={earnedBadgesSet} acts={acts} analytics={analytics} tierProgress={tierProgress} newTiers={newTiers}/>}
          </div>
        </div>
      }
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"rgba(6,8,15,.97)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderTop:"1px solid var(--bd)",display:"flex",zIndex:100,paddingBottom:"max(env(safe-area-inset-bottom),4px)"}}>
        {TABS.map(t=>(
          <button key={t.id} className={"tab-btn"+(tab===t.id?" on":"")} onClick={()=>setTab(t.id)} style={{position:"relative"}}>
            {t.id==="awards"&&hasUnseen&&<div style={{position:"absolute",top:6,right:"20%",width:7,height:7,borderRadius:"50%",background:"var(--or)",animation:"pulse 1.5s ease infinite"}}/>}
            <span style={{fontSize:"1.1rem",lineHeight:1}}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      {detail&&<Detail act={detail} hrProfile={hrProfile} onClose={back} onDelete={deleteAct} onShare={()=>openShare(detail)}/>}
      {shareAct&&<Suspense fallback={null}><ShareModal act={shareAct} onClose={back} onOpenEditor={switchToEditor}/></Suspense>}
      {showEditor&&editorAct&&<Suspense fallback={null}><ShareEditor act={editorAct} onClose={back}/></Suspense>}
      {prDetail&&<PRDetailModal entry={prDetail} onClose={back}
        onOpenRun={id=>{setPrDetail(null);const found=acts.find(a=>a.id===id);if(found)openDetail(found);}}/>}
      {showUpload&&<Upload acts={acts} onAdd={newActs=>{newActs.forEach(a=>addAct(a));back();}}
        onClearAll={()=>{
          setActsRaw([]);
          clearAllActivities().catch(err=>setStorageError("Clear failed: "+err.message));
          back();
        }}/>}
      {showSettings&&<SettingsPanel acts={acts} goals={goals} hrProfile={hrProfile} profile={profile}
        onSaveGoals={g=>{setGoals(g);saveGoals(g);}} onSaveHR={p=>{setHRProfile(p);saveHRProfile(p);}}
        onSaveProfile={p=>{setProfile(p);saveProfile(p);}}
        onImport={imported=>{
          setActsRaw(prev=>{
            const existing=new Set(prev.map(a=>a.id));
            const newActs=imported.filter(a=>a&&a.id&&!existing.has(a.id)).map(migrateActivity).filter(Boolean);
            if(!newActs.length)return prev;
            newActs.forEach(a=>saveActivity(a).catch(console.error));
            return[...newActs,...prev];
          });
        }}
        onClearAll={()=>{
          setActsRaw([]);
          clearAllActivities().catch(err=>setStorageError("Clear failed: "+err.message));
          back();
        }}
        stravaAuth={stravaAuth} stravaSync={stravaSync} isOnline={isOnline}
        onStravaConnect={startStravaConnect}
        onStravaDisconnect={()=>{clearStravaAuth();setStravaAuth(null);setStravaSync({loading:false,msg:"Disconnected."});if('caches' in window)caches.keys().then(ks=>ks.forEach(k=>caches.delete(k)));}}
        onStravaSync={()=>doStravaSync(false)}
        onClose={back}/>}
      {showAllRuns&&<AllRunsView acts={acts} onClose={back} onSelectAct={act=>{setShowAllRuns(false);openDetail(act);}}/>}
      {showMonthly&&<Suspense fallback={null}><MonthlyReport acts={acts} onClose={back}/></Suspense>}
      {wrappedMonth&&<Suspense fallback={null}><MonthlyWrapped acts={acts} yearMonth={wrappedMonth} onClose={()=>setWrappedMonth(null)} onSelectAct={a=>{setWrappedMonth(null);openDetail(a);}}/></Suspense>}
      {showYearReview&&<Suspense fallback={null}><YearInReview acts={acts} onClose={back}/></Suspense>}
      {showShoes&&<Suspense fallback={null}><ShoeTracker acts={acts} onClose={back}/></Suspense>}
      {dbReady&&acts.length===0&&!localStorage.getItem(ONBOARDING_KEY)&&(
        <Onboarding profile={profile} goals={goals}
          onComplete={({name,weeklyGoal})=>{
            if(name&&name!=='Runner'){const p={...profile,name};setProfile(p);saveProfile(p);}
            const g={...goals,weekly:weeklyGoal};setGoals(g);saveGoals(g);
          }}
          onUpload={openUpload}
          isOnline={isOnline}
          onStravaConnect={startStravaConnect}/>
      )}
      {toast&&(
        <div style={{position:'fixed',bottom:96,left:'50%',transform:'translateX(-50%)',zIndex:400,animation:'fadeUp .3s ease both',pointerEvents:'auto'}}>
          <div style={{background:'var(--s1)',border:'1.5px solid var(--or)',borderRadius:14,padding:'12px 18px',display:'flex',alignItems:'center',gap:10,boxShadow:'0 6px 28px rgba(0,0,0,.35)',minWidth:200,maxWidth:320}}>
            <span style={{fontSize:'1.5rem',flexShrink:0}}>{toast.emoji}</span>
            <span style={{fontWeight:700,fontSize:'.88rem',flex:1,lineHeight:1.4}}>{toast.msg}</span>
            {toast.undo&&<button onClick={undoDelete} style={{background:'var(--or2)',border:'1px solid var(--or)',color:'var(--or)',borderRadius:8,cursor:'pointer',fontSize:'.8rem',fontWeight:700,fontFamily:'inherit',padding:'4px 10px',flexShrink:0}}>Undo</button>}
            <button onClick={()=>setToast(null)} style={{background:'none',border:'none',color:'var(--tx3)',cursor:'pointer',fontSize:'.9rem',flexShrink:0,padding:'2px 4px'}}>✕</button>
          </div>
        </div>
      )}
      {showPlanBuilder&&<Suspense fallback={null}><PlanBuilderModal acts={acts} analytics={analytics} onClose={()=>setShowPlanBuilder(false)}/></Suspense>}
      {showDebug&&<DebugPanel acts={acts} onClose={()=>setShowDebug(false)}
        onRepairRoutes={()=>{
          if(isRepairingRef.current)return;
          isRepairingRef.current=true;
          isSyncingRef.current=true;
          setActsRaw(prev=>{
            const fixed=prev.filter(a=>!(a.source==="strava"&&(!a.route||a.route.length<2)));
            console.log(`[IDB] repairRoutes: removing ${prev.length-fixed.length} routeless Strava acts`);
            clearAllActivities()
              .then(()=>saveActivitiesBatch(fixed))
              .then(()=>{isRepairingRef.current=false;isSyncingRef.current=false;})
              .catch(err=>{setStorageError("Repair failed: "+err.message);isRepairingRef.current=false;isSyncingRef.current=false;});
            return fixed;
          });
          setShowDebug(false);
          lastSyncRef.current=0;
          setTimeout(()=>doStravaSync(false),300);
        }}/>}
    </div>
  );
};

export default App;
