import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// ── Persistence ──────────────────────────────────────────────────────────────
import {
  loadActivities, saveActivity, saveActivitiesBatch,
  deleteActivity, clearAllActivities, verifyActivityPersistence,
  migrateFromLocalStorage, loadActsLegacy,
} from './db/indexedDB.js';
import { loadStravaAuth, saveStravaAuth, clearStravaAuth, getStravaToken, mapStravaActivity } from './db/strava.js';

// ── Utils ────────────────────────────────────────────────────────────────────
import { fmtKm, fmtPace, fmtDur, fmtDate, fmtDateS, todayKey } from './utils/formatters.js';
import { migrateActivity, normalizeRoute } from './utils/activity.js';
import { buildAnalytics, computeTierProgress, computeEarnedBadges } from './utils/analytics.js';

// ── Constants ────────────────────────────────────────────────────────────────
import {
  GOALS_KEY, HR_KEY, PROFILE_KEY, TASKS_KEY, BADGES_KEY,
  TAB_KEY, STRAVA_KEY, ONBOARDING_KEY, MILESTONES_KEY, THEME_KEY,
} from './constants/keys.js';
import { TABS } from './constants/activityTypes.js';

// ── Styles ───────────────────────────────────────────────────────────────────
import { Styles } from './styles/GlobalStyles.jsx';

// ── Common Components ────────────────────────────────────────────────────────
import { Ring }      from './components/common/Ring.jsx';
import { SH }        from './components/common/SH.jsx';
import { CoachCard } from './components/common/CoachCard.jsx';

// ── Tab Screens ───────────────────────────────────────────────────────────────
import { HomeTab }         from './components/Tabs/HomeTab.jsx';
import { StatsTab }        from './components/Tabs/StatsTab.jsx';
import { HRTab }           from './components/Tabs/HRTab.jsx';
import { TasksTab }        from './components/Tabs/TasksTab.jsx';
import { AchievementsTab } from './components/Tabs/AchievementsTab.jsx';

// ── Overlays & Modals ────────────────────────────────────────────────────────
import { Detail }        from './components/Activity/Detail.jsx';
import { Upload }        from './components/Activity/Upload.jsx';
import { AllRunsView }   from './components/Activity/AllRunsView.jsx';
import { ShareModal }    from './components/Share/ShareModal.jsx';
import { ShareEditor }   from './components/Share/ShareEditor.jsx';
import { SettingsPanel } from './components/Modals/SettingsPanel.jsx';
import { MonthlyReport } from './components/Modals/MonthlyReport.jsx';
import { YearInReview }  from './components/Modals/YearInReview.jsx';
import { ShoeTracker }   from './components/Modals/ShoeTracker.jsx';
import { PRDetailModal } from './components/Modals/PRDetailModal.jsx';
import { DebugPanel }    from './components/Modals/DebugPanel.jsx';
import { Onboarding }   from './components/Modals/Onboarding.jsx';

// ── localStorage helpers (lightweight prefs only) ────────────────────────────
function loadGoals()    { try { return JSON.parse(localStorage.getItem(GOALS_KEY)||'null')||{weekly:40,monthly:160}; } catch { return {weekly:40,monthly:160}; } }
function saveGoals(g)   { try { localStorage.setItem(GOALS_KEY, JSON.stringify(g)); } catch {} }
function loadHRProfile(){ try { return JSON.parse(localStorage.getItem(HR_KEY)||'null')||{age:30,overrideMAF:null,modifier:0}; } catch { return {age:30,overrideMAF:null,modifier:0}; } }
function saveHRProfile(p){ try { localStorage.setItem(HR_KEY, JSON.stringify(p)); } catch {} }
function loadProfile()  { try { return JSON.parse(localStorage.getItem(PROFILE_KEY)||'null')||{name:'Runner'}; } catch { return {name:'Runner'}; } }
function saveProfile(p) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {} }
function loadTasks()    { try { return JSON.parse(localStorage.getItem(TASKS_KEY)||'null')||defaultTasks(); } catch { return defaultTasks(); } }
function saveTasks(t)   { try { localStorage.setItem(TASKS_KEY, JSON.stringify(t)); } catch {} }
function loadSeenBadges(){ try { return new Set(JSON.parse(localStorage.getItem(BADGES_KEY)||'[]')); } catch { return new Set(); } }
function saveSeenBadges(ids){ try { localStorage.setItem(BADGES_KEY, JSON.stringify([...ids])); } catch {} }
function loadTheme(){ try { return localStorage.getItem(THEME_KEY)||'dark'; } catch { return 'dark'; } }

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

function defaultTasks(){
  return[
    {id:"t1",title:"Morning stretch",icon:"🧘",color:"#3b82f6",category:"recovery",desc:"5 min of light stretching after waking up",enabled:true,streak:0,completions:{}},
    {id:"t2",title:"Hydrate 2L",icon:"💧",color:"#06b6d4",category:"wellness",desc:"Drink at least 2 litres of water today",enabled:true,streak:0,completions:{}},
    {id:"t3",title:"Post-run foam roll",icon:"🪴",color:"#8b5cf6",category:"recovery",desc:"Roll quads, calves and IT band after running",enabled:false,streak:0,completions:{}},
    {id:"t4",title:"Sleep 7-8 hours",icon:"😴",color:"#f97316",category:"wellness",desc:"Prioritise 7-8 hours of quality sleep",enabled:true,streak:0,completions:{}},
  ];
}

const App=()=>{
  // Activities start empty — populated async from IndexedDB in useEffect below.
  // We cannot use useState(loadActs) synchronously because IDB is async.
  const[acts,setActsRaw]=useState([]);
  const[dbReady,setDbReady]=useState(false);    // true once IDB load completes
  const[storageError,setStorageError]=useState(null); // visible error banner
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
  const[showYearReview,setShowYearReview]=useState(false);
  const[showShoes,setShowShoes]=useState(false);
  const[shareAct,setShareAct]=useState(null);
  const[prDetail,setPrDetail]=useState(null);
  const[showEditor,setShowEditor]=useState(false);
  const[editorAct,setEditorAct]=useState(null);
  const[stravaAuth,setStravaAuth]=useState(loadStravaAuth);
  const[stravaSync,setStravaSync]=useState({loading:false,msg:""});
  const[hasUnseen,setHasUnseen]=useState(false);
  const[showDebug,setShowDebug]=useState(false);
  const[theme,setTheme]=useState(loadTheme);
  const[toast,setToast]=useState(null);
  const toastTimerRef=useRef(null);
  const debugTapRef=useRef(0);

  const detRef=useRef(null),setRef=useRef(null),arRef=useRef(null),monRef=useRef(null),upRef=useRef(null),shaRef=useRef(null),prRef=useRef(null),yrRef=useRef(null),shRef=useRef(null);
  const isSyncingRef=useRef(false),lastSyncRef=useRef(0);

  // FIX #1: Removed feedbackRun from deps (was never declared as state — caused ReferenceError)
  const edRef=useRef(null);
  useEffect(()=>{
    detRef.current=detail;setRef.current=showSettings;
    arRef.current=showAllRuns;monRef.current=showMonthly;upRef.current=showUpload;
    shaRef.current=shareAct;prRef.current=prDetail;edRef.current=showEditor;yrRef.current=showYearReview;shRef.current=showShoes;
  },[detail,showSettings,showAllRuns,showMonthly,showUpload,shareAct,prDetail,showEditor,showYearReview,showShoes]);

  useEffect(()=>{
    try{history.replaceState({_rl:"root"},"");history.pushState({_rl:"s"},"");}catch(e){}
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
      if(yrRef.current){setShowYearReview(false);history.replaceState({_rl:"s"},"");return;}
      if(shRef.current){setShowShoes(false);history.replaceState({_rl:"s"},"");return;}
      if(upRef.current){setShowUpload(false);history.replaceState({_rl:"s"},"");return;}
      if(!e.state||e.state._rl==="root"){history.replaceState({_rl:"s"},"");}
    };
    window.addEventListener("popstate",h);return()=>window.removeEventListener("popstate",h);
  },[]);

  const back=useCallback(()=>history.back(),[]);

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

  const setTasks=useCallback(updater=>{
    setTasksRaw(prev=>{const next=typeof updater==="function"?updater(prev):updater;saveTasks(next);return next;});
  },[]);
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

  // deleteAct: update React state immediately, then remove from IDB.
  const deleteAct=useCallback(id=>{
    setActsRaw(p=>p.filter(a=>a.id!==id));
    if(detRef.current)history.back();
    deleteActivity(id).catch(err=>console.error("[IDB] deleteActivity failed:",err));
  },[]);

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
      let added=0,routesFixed=0;
      const toSave=[];
      setActsRaw(prev=>{
        const patched=prev.map(a=>{
          const fresh=mapped.find(m=>m.id===a.id);
          if(fresh&&(!a.route||a.route.length<2)&&fresh.route?.length>=2){
            routesFixed++;
            console.log(`[IDB] route restored for "${a.name}": ${fresh.route.length}pts`);
            const updated={...a,route:fresh.route};
            toSave.push(updated);
            return updated;
          }
          return a;
        });
        const existingIds=new Set(prev.map(a=>a.id));
        const newActs=mapped.filter(a=>!existingIds.has(a.id));
        added=newActs.length;
        newActs.forEach(a=>toSave.push(a));
        if(!newActs.length&&!routesFixed)return prev;
        return newActs.length?[...newActs,...patched]:patched;
      });
      // Persist each changed/new activity individually — no full dataset rewrite
      if(toSave.length){
        saveActivitiesBatch(toSave)
          .then(()=>console.log(`[IDB] Strava sync saved: +${added} new, ${routesFixed} routes fixed`))
          .catch(err=>setStorageError(`Strava sync save failed: ${err.message}`));
      }
      setStravaSync({loading:false,msg:(!added&&!routesFixed)?"":added?`\u2713 ${added} new run${added!==1?"s":""} synced`:(routesFixed?`\u2713 ${routesFixed} route${routesFixed!==1?"s":""} restored`:"Already up to date")});
    }catch(e){setStravaSync({loading:false,msg:"Sync failed."});}
    isSyncingRef.current=false;
  },[]);

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
          <button className="tap" style={{background:"none",border:"none",color:"var(--tx2)",fontSize:"1rem",cursor:"pointer",padding:"4px 6px"}} onClick={()=>setTheme(t=>t==='dark'?'light':'dark')} aria-label="Toggle theme">{theme==='dark'?'☀️':'🌙'}</button>
          <button className="tap" style={{background:"none",border:"none",color:"var(--tx2)",fontSize:"1.05rem",cursor:"pointer",padding:"4px 6px"}} onClick={openSettings} aria-label="Settings">⚙️</button>
        </div>
      </div>
      {/* Storage error banner — shown when IDB save/load fails */}
      {storageError&&(
        <div style={{background:"rgba(239,68,68,.1)",borderBottom:"1px solid rgba(239,68,68,.25)",padding:"9px 14px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <span style={{fontSize:".8rem",color:"var(--rd)",flex:1,lineHeight:1.5}}>⚠️ {storageError}</span>
          <button onClick={()=>setStorageError(null)} style={{background:"none",border:"none",color:"var(--rd)",cursor:"pointer",fontSize:".9rem",flexShrink:0,padding:"2px 4px"}}>✕</button>
        </div>
      )}
      {/* Loading state while IDB initialises */}
      {!dbReady
        ?<div style={{flex:1,padding:"16px 14px"}}>
            {[1,2,3].map(i=>(
              <div key={i} style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:14,padding:16,marginBottom:10,overflow:'hidden',position:'relative'}}>
                <div style={{height:10,borderRadius:5,background:'var(--bd)',width:'55%',marginBottom:10,backgroundImage:'linear-gradient(90deg,var(--bd) 25%,var(--bd2) 50%,var(--bd) 75%)',backgroundSize:'200% 100%',animation:'shimmer 1.4s ease infinite'}}/>
                <div style={{height:8,borderRadius:4,background:'var(--bd)',width:'35%',backgroundImage:'linear-gradient(90deg,var(--bd) 25%,var(--bd2) 50%,var(--bd) 75%)',backgroundSize:'200% 100%',animation:'shimmer 1.4s '+(i*0.15)+'s ease infinite'}}/>
              </div>
            ))}
          </div>
        :<div style={{flex:1,overflowY:"auto",padding:"0 14px 100px"}}>
          <div key={tab} className="tab-in">
            {tab==="home"&&<HomeTab acts={acts} analytics={analytics} goals={goals} hrProfile={hrProfile} profile={profile} tasks={tasks} onSelectAct={openDetail} onUpload={openUpload} onViewAll={openAllRuns} onViewMonthly={openMonthly} onEditGoals={openSettings}/>}
            {tab==="stats"&&<StatsTab acts={acts} analytics={analytics} onViewAll={openAllRuns} onViewMonthly={openMonthly} onOpenPR={openPR} onViewYearReview={openYearReview} onManageShoes={openShoes}/>}
            {tab==="hr"&&<HRTab acts={acts} hrProfile={hrProfile} onEditHR={openSettings}/>}
            {tab==="tasks"&&<TasksTab tasks={tasks} setTasks={setTasks} hrProfile={hrProfile}/>}
            {tab==="awards"&&<AchievementsTab earnedBadges={earnedBadgesSet} acts={acts} analytics={analytics} tierProgress={tierProgress} newTiers={[]}/>}
          </div>
        </div>
      }
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"rgba(6,8,15,.97)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderTop:"1px solid var(--bd)",display:"flex",zIndex:100,paddingBottom:"env(safe-area-inset-bottom)"}}>
        {TABS.map(t=>(
          <button key={t.id} className={"tab-btn"+(tab===t.id?" on":"")} onClick={()=>setTab(t.id)} style={{position:"relative"}}>
            {t.id==="awards"&&hasUnseen&&<div style={{position:"absolute",top:6,right:"20%",width:7,height:7,borderRadius:"50%",background:"var(--or)",animation:"pulse 1.5s ease infinite"}}/>}
            <span style={{fontSize:"1.1rem",lineHeight:1}}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      {detail&&<Detail act={detail} hrProfile={hrProfile} onClose={back} onDelete={deleteAct} onShare={()=>openShare(detail)}/>}
      {shareAct&&<ShareModal act={shareAct} onClose={back} onOpenEditor={switchToEditor}/>}
      {showEditor&&editorAct&&<ShareEditor act={editorAct} onClose={back}/>}
      {prDetail&&<PRDetailModal entry={prDetail} onClose={back}
        onOpenRun={id=>{setPrDetail(null);const found=acts.find(a=>a.id===id);if(found)openDetail(found);}}/>}
      {showUpload&&<Upload acts={acts} hrProfile={hrProfile} onAdd={newActs=>{newActs.forEach(a=>addAct(a));back();}}
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
            const newActs=imported.filter(a=>a&&a.id&&!existing.has(a.id)).map(migrateActivity);
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
        stravaAuth={stravaAuth} stravaSync={stravaSync}
        onStravaConnect={()=>{
          const cid=window.__STRAVA_CLIENT_ID;
          if(!cid){alert("Strava client ID not configured.");return;}
          const redirect=encodeURIComponent(window.location.origin+window.location.pathname);
          window.location.href="https://www.strava.com/oauth/authorize?client_id="+cid+"&redirect_uri="+redirect+"&response_type=code&scope=activity:read_all";
        }}
        onStravaDisconnect={()=>{clearStravaAuth();setStravaAuth(null);setStravaSync({loading:false,msg:"Disconnected."});if('caches' in window)caches.keys().then(ks=>ks.forEach(k=>caches.delete(k)));}}
        onStravaSync={()=>doStravaSync(false)}
        onClose={back}/>}
      {showAllRuns&&<AllRunsView acts={acts} onClose={back} onSelectAct={act=>{setShowAllRuns(false);openDetail(act);}}/>}
      {showMonthly&&<MonthlyReport acts={acts} onClose={back}/>}
      {showYearReview&&<YearInReview acts={acts} onClose={back}/>}
      {showShoes&&<ShoeTracker acts={acts} onClose={back}/>}
      {dbReady&&acts.length===0&&!localStorage.getItem(ONBOARDING_KEY)&&(
        <Onboarding profile={profile} goals={goals}
          onComplete={({name,weeklyGoal})=>{
            if(name&&name!=='Runner'){const p={...profile,name};setProfile(p);saveProfile(p);}
            const g={...goals,weekly:weeklyGoal};setGoals(g);saveGoals(g);
          }}
          onUpload={openUpload}
          onStravaConnect={()=>{
            const cid=window.__STRAVA_CLIENT_ID;
            if(!cid){alert("Strava client ID not configured.");return;}
            const redirect=encodeURIComponent(window.location.origin+window.location.pathname);
            window.location.href="https://www.strava.com/oauth/authorize?client_id="+cid+"&redirect_uri="+redirect+"&response_type=code&scope=activity:read_all";
          }}/>
      )}
      {toast&&(
        <div style={{position:'fixed',bottom:96,left:'50%',transform:'translateX(-50%)',zIndex:400,animation:'fadeUp .3s ease both',pointerEvents:'auto'}}>
          <div style={{background:'var(--s1)',border:'1.5px solid var(--or)',borderRadius:14,padding:'12px 18px',display:'flex',alignItems:'center',gap:10,boxShadow:'0 6px 28px rgba(0,0,0,.35)',minWidth:200,maxWidth:300}}>
            <span style={{fontSize:'1.5rem',flexShrink:0}}>{toast.emoji}</span>
            <span style={{fontWeight:700,fontSize:'.88rem',flex:1,lineHeight:1.4}}>{toast.msg}</span>
            <button onClick={()=>setToast(null)} style={{background:'none',border:'none',color:'var(--tx3)',cursor:'pointer',fontSize:'.9rem',flexShrink:0,padding:'2px 4px'}}>✕</button>
          </div>
        </div>
      )}
      {showDebug&&<DebugPanel acts={acts} onClose={()=>setShowDebug(false)}
        onRepairRoutes={()=>{
          // Remove Strava activities with no route so next sync re-imports with decoded polyline
          setActsRaw(prev=>{
            const fixed=prev.filter(a=>!(a.source==="strava"&&(!a.route||a.route.length<2)));
            const removed=prev.length-fixed.length;
            console.log(`[IDB] repairRoutes: removing ${removed} routeless Strava acts`);
            clearAllActivities()
              .then(()=>saveActivitiesBatch(fixed))
              .catch(err=>setStorageError("Repair failed: "+err.message));
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
