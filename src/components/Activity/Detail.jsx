import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RcTooltip } from 'recharts';
import { RouteMapSVG } from '../Map/RouteMapSVG.jsx';
import { SH } from '../common/SH.jsx';
import { ACT_ICN, ACT_CLR } from '../../constants/activityTypes.js';
import { SHOES_KEY } from '../../constants/keys.js';
import { fmtKm, fmtDur, fmtPace, fmtDate } from '../../utils/formatters.js';
import { getMafHR, computeZones, computeSplits } from '../../utils/analytics.js';
import { JournalTab } from './JournalTab.jsx';
import { saveActivity, getPhotos } from '../../db/indexedDB.js';
import { fetchStravaSplits, loadStravaAuth, getStravaToken } from '../../db/strava.js';

const MOODS_MAP = {
  great:  { emoji: '😀', label: 'Great' },
  good:   { emoji: '🙂', label: 'Good' },
  normal: { emoji: '😐', label: 'Normal' },
  tough:  { emoji: '😫', label: 'Tough' },
  strong: { emoji: '🔥', label: 'Strong' },
};

export function Detail({act,hrProfile,onClose,onDelete,onShare}){
  const[tab,setTab]=useState("overview");
  const[actState,setActState]=useState(act);
  const elevData=useMemo(()=>{
    if(!act.route||!act.route.some(p=>p.ele!=null))return null;
    let km=0;const pts=[];
    for(let i=0;i<act.route.length;i++){
      const p=act.route[i];if(p.ele==null)continue;
      if(i>0){
        const v=act.route[i-1];
        const dLa=(p.lat-v.lat)*Math.PI/180,dLo=(p.lon-v.lon)*Math.PI/180;
        const a=Math.min(1,Math.sin(dLa/2)**2+Math.cos(v.lat*Math.PI/180)*Math.cos(p.lat*Math.PI/180)*Math.sin(dLo/2)**2);
        km+=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))/1000;
      }
      pts.push({km:parseFloat(km.toFixed(2)),ele:Math.round(p.ele)});
    }
    if(pts.length<2)return null;
    // Downsample to ≤200 points for chart performance
    if(pts.length>200){
      const s=Math.ceil(pts.length/200);
      return pts.filter((_,i)=>i%s===0||i===pts.length-1);
    }
    return pts;
  },[act.route]);
  const col=ACT_CLR[actState.type]||"#6b7280";
  const mafHR=getMafHR(hrProfile);
  const zones=actState.hrSamples&&actState.hrSamples.length?computeZones(actState.hrSamples,mafHR):null;
  const shoes=useMemo(()=>{try{return JSON.parse(localStorage.getItem(SHOES_KEY)||'{}');}catch{return{};}
  },[]);
  const shoeLabel=useMemo(()=>{
    if(!actState.shoeId||!shoes[actState.shoeId])return null;
    const s=shoes[actState.shoeId];
    return(`${s.brand||''} ${s.model||''}`.trim()||null);
  },[actState.shoeId,shoes]);

  const [coverUrl, setCoverUrl] = useState(null);
  const coverUrlRef = useRef(null);
  useEffect(() => {
    if (!actState.photoCount) { setCoverUrl(null); return; }
    let active = true;
    getPhotos(actState.id).then(photos => {
      if (!active || !photos[0]) return;
      const url = URL.createObjectURL(photos[0].thumbBlob);
      coverUrlRef.current = url;
      setCoverUrl(url);
    }).catch(console.error);
    return () => {
      active = false;
      if (coverUrlRef.current) { URL.revokeObjectURL(coverUrlRef.current); coverUrlRef.current = null; }
    };
  }, [actState.id, actState.photoCount]);

  const onPatch=updates=>{
    setActState(prev=>{
      const next={...prev,...updates};
      saveActivity(next).catch(console.error);
      return next;
    });
  };
  return(
    <div style={{position:"fixed",inset:0,zIndex:240,background:"var(--bg)",display:"flex",flexDirection:"column",overflowY:"auto"}}>
      <div className="glass" style={{position:"sticky",top:0,zIndex:10,padding:"14px 18px 0",borderBottom:"1px solid var(--bd)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div style={{flex:1,minWidth:0,paddingRight:10}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
              <span style={{fontSize:".62rem",fontWeight:700,color:col,textTransform:"uppercase"}}>{ACT_ICN[act.type]||"🏃"} {act.type}</span>
              {act.runClass&&<span style={{fontSize:'.58rem',fontWeight:700,textTransform:'capitalize',padding:'1px 7px',borderRadius:10,
                background:{easy:'#3b82f622',long:'#8b5cf622',workout:'#f9731622'}[act.runClass]||'var(--bd)',
                color:{easy:'#3b82f6',long:'#8b5cf6',workout:'#f97316'}[act.runClass]||'var(--tx3)',
              }}>{act.runClass}</span>}
            </div>
            <div style={{fontWeight:700,fontSize:".98rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{act.name}</div>
            <div style={{fontSize:".72rem",color:"var(--tx2)",marginTop:2}}>{fmtDate(act.date)}</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {onShare&&<button className="btn b-or" style={{padding:"7px 16px",fontSize:".82rem",fontWeight:700}} onClick={onShare}>📤 Share</button>}
            <button className="btn b-rd" style={{padding:"7px 10px"}} onClick={()=>{if(window.confirm("Delete this run?"))onDelete(act.id);}}>🗑</button>
            <button className="btn b-gh" style={{padding:"7px 12px"}} onClick={onClose}>✕</button>
          </div>
        </div>
        <div role="tablist" style={{display:"flex"}}>
          {[{id:"overview",label:"Overview"},{id:"splits",label:"⚡ Splits"},{id:"heartrate",label:"Heart Rate"},{id:"map",label:"Map"},{id:"journal",label:"📓 Journal"}].map(t=>(
            <button key={t.id} role="tab" aria-selected={tab===t.id} onClick={()=>setTab(t.id)}
              style={{padding:"8px 14px",border:"none",background:"transparent",color:tab===t.id?"var(--or)":"var(--tx2)",fontFamily:"inherit",fontSize:".78rem",fontWeight:tab===t.id?600:400,cursor:"pointer",borderBottom:tab===t.id?"2px solid var(--or)":"2px solid transparent",transition:"color .15s"}}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{flex:1,padding:"18px 18px 32px"}}>
        {tab==="overview"&&(
          <div>
            {coverUrl && (
              <img src={coverUrl} alt="" loading="lazy"
                style={{width:'100%',maxHeight:220,objectFit:'cover',borderRadius:12,marginBottom:14,display:'block'}}
              />
            )}
            {(actState.mood || actState.notes) && (
              <div className="card" style={{padding:'12px 14px',marginBottom:14,borderLeft:'4px solid var(--or)'}}>
                {actState.mood && MOODS_MAP[actState.mood] && (
                  <div style={{fontSize:'.88rem',fontWeight:600,marginBottom:4}}>
                    {MOODS_MAP[actState.mood].emoji} {MOODS_MAP[actState.mood].label}
                  </div>
                )}
                <div style={{fontSize:'.78rem',color:'var(--tx2)',marginBottom:actState.notes?4:0}}>
                  {fmtKm(actState.distanceKm)} km · {fmtPace(actState.avgPaceSecKm)}/km
                </div>
                {actState.notes && (
                  <div style={{fontSize:'.8rem',fontStyle:'italic',color:'var(--tx2)',lineHeight:1.5}}>
                    "{actState.notes.length>100?actState.notes.slice(0,100)+'…':actState.notes}"
                  </div>
                )}
              </div>
            )}
            {actState.isRace&&(
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,padding:'10px 14px',borderRadius:12,background:'rgba(234,179,8,.1)',border:'1px solid rgba(234,179,8,.3)'}}>
                <span style={{fontSize:'1.2rem'}}>🏅</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'.8rem',fontWeight:700,color:'var(--yw)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{actState.raceLocation||'Race'}</div>
                  {actState.raceGoalSec>0&&<div style={{fontSize:'.7rem',color:'var(--tx2)',marginTop:1}}>Goal: {fmtDur(actState.raceGoalSec)}</div>}
                </div>
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
              {[{l:"Distance",v:fmtKm(act.distanceKm)+" km",c:col},{l:"Pace",v:fmtPace(act.avgPaceSecKm)+"/km",c:"var(--tx)"},{l:"Time",v:fmtDur(act.movingTimeSec),c:"var(--tx)"}].map(s=>(
                <div key={s.l} className="card2" style={{padding:"12px 8px",textAlign:"center"}}>
                  <div style={{fontSize:"1.1rem",fontWeight:700,color:s.c,lineHeight:1,marginBottom:5}}>{s.v}</div>
                  <div style={{fontSize:".65rem",color:"var(--tx2)",letterSpacing:".04em"}}>{s.l}</div>
                </div>
              ))}
            </div>
            <div className="card" style={{padding:16}}>
              {([["Elev Gain","+"+Math.round(act.elevGainM||0)+"m"],["Max HR",act.maxHR?(act.maxHR+" bpm"):"—"],["Avg HR",act.avgHR?(act.avgHR+" bpm"):"—"],["Load",String(act.trainingLoad||0)],...(shoeLabel?[["Shoe",shoeLabel]]:[])]).map(([l,v],i,arr)=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:i<arr.length-1?"1px solid var(--bd)":"none"}}>
                  <span style={{fontSize:".8rem",color:"var(--tx2)"}}>{l}</span>
                  <span style={{fontSize:".84rem",fontWeight:600}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab==="heartrate"&&(
          act.avgHR?(
            <div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                {[{l:"Avg HR",v:act.avgHR+" bpm",c:"var(--rd)"},{l:"MAF HR",v:mafHR+" bpm",c:act.avgHR<=mafHR?"var(--gn)":"var(--yw)"}].map(s=>(
                  <div key={s.l} className="card2" style={{padding:"14px 12px",textAlign:"center"}}>
                    <div style={{fontSize:"1.35rem",fontWeight:700,color:s.c,lineHeight:1,marginBottom:5}}>{s.v}</div>
                    <div style={{fontSize:".65rem",color:"var(--tx2)",letterSpacing:".04em"}}>{s.l}</div>
                  </div>
                ))}
              </div>
              {actState.hrSamples?.length>0&&(
                <div className="card" style={{padding:16,marginBottom:14}}>
                  <div style={{fontSize:'.6rem',fontWeight:700,color:'var(--tx3)',letterSpacing:'.06em',textTransform:'uppercase',marginBottom:10}}>
                    Heart Rate · {Math.round(actState.movingTimeSec/60)} min
                  </div>
                  <ResponsiveContainer width="100%" height={120}>
                    <AreaChart data={actState.hrSamples} margin={{top:4,right:4,bottom:0,left:-20}}>
                      <defs>
                        <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ef4444" stopOpacity={0.5}/>
                          <stop offset="100%" stopColor="#ef4444" stopOpacity={0.04}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="sec" tick={{fill:'var(--tx3)',fontSize:8}} axisLine={false} tickLine={false}
                        tickFormatter={v=>Math.floor(v/60)+'m'} interval="preserveStartEnd"/>
                      <YAxis tick={{fill:'var(--tx3)',fontSize:8}} axisLine={false} tickLine={false} width={34}/>
                      <RcTooltip content={({active,payload})=>{
                        if(!active||!payload?.length)return null;
                        const{sec,hr}=payload[0].payload;
                        return<div className="chart-tip"><div className="chart-tip-val">{hr} bpm</div><div className="chart-tip-sub">{Math.floor(sec/60)}:{String(sec%60|0).padStart(2,'0')}</div></div>;
                      }}/>
                      <Area dataKey="hr" fill="url(#hrGrad)" stroke="#ef4444" strokeWidth={1.5} dot={false} isAnimationActive={false}/>
                    </AreaChart>
                  </ResponsiveContainer>
                  {mafHR&&<div style={{fontSize:'.68rem',color:'var(--tx3)',marginTop:6}}>MAF target: {mafHR} bpm</div>}
                </div>
              )}
              {zones&&(
                <div className="card" style={{padding:16}}>
                  <SH title="HR Zones" sub={"MAF "+mafHR+" bpm"}/>
                  {zones.map((z,i)=>(
                    <div key={z.zone} style={{marginBottom:i<4?10:0}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <div style={{display:"flex",alignItems:"center",gap:7}}>
                          <div style={{width:10,height:10,borderRadius:3,background:z.color,flexShrink:0}}/>
                          <span style={{fontSize:".8rem",fontWeight:600}}>Zone {z.zone}</span>
                          <span style={{fontSize:".72rem",color:"var(--tx2)"}}>{z.label}</span>
                        </div>
                        <span style={{fontSize:".88rem",color:z.color,fontWeight:700}}>{z.pct}%</span>
                      </div>
                      <div className="pb"><div className="pf" style={{width:z.pct+"%",background:z.color}}/></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ):(
            <div style={{textAlign:"center",padding:"40px 0",color:"var(--tx2)"}}>
              <div style={{fontSize:"2rem",marginBottom:8}}>❤️</div><div>No heart rate data</div>
            </div>
          )
        )}
        {tab==="map"&&(
          <div>
            <div className="card" style={{padding:16,marginBottom:elevData?12:0}}>
            {act.route&&act.route.length>=2
              ?<RouteMapSVG route={act.route} act={act}/>
              :<div style={{minHeight:160,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,textAlign:"center",padding:"8px 0"}}>
                <span style={{fontSize:"2rem",opacity:.5}}>🗺️</span>
                <div style={{fontWeight:600,fontSize:".88rem",color:"var(--tx2)"}}>No GPS route saved</div>
                <div style={{fontSize:".74rem",color:"var(--tx3)",lineHeight:1.6,maxWidth:240}}>
                  {act.source==="strava"
                    ?"This run was synced from Strava before route decoding was enabled.\nGo to Settings → Strava Sync → Sync to re-import with map data."
                    :"Route data is missing. Re-upload the original GPX file to restore the map."}
                </div>
              </div>
            }
            </div>
            {elevData&&(
              <div className="card" style={{padding:16}}>
                <div style={{fontSize:'.6rem',fontWeight:700,color:'var(--tx3)',letterSpacing:'.06em',textTransform:'uppercase',marginBottom:10}}>Elevation Profile</div>
                <ResponsiveContainer width="100%" height={100}>
                  <AreaChart data={elevData} margin={{top:4,right:4,bottom:0,left:-20}}>
                    <defs>
                      <linearGradient id="eleGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.55}/>
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0.04}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="km" tick={{fill:'var(--tx3)',fontSize:8}} axisLine={false} tickLine={false}
                      tickFormatter={v=>v+'k'} interval="preserveStartEnd"/>
                    <YAxis tick={{fill:'var(--tx3)',fontSize:8}} axisLine={false} tickLine={false} width={34}
                      tickFormatter={v=>v+'m'}/>
                    <RcTooltip content={({active,payload})=>{
                      if(!active||!payload?.length)return null;
                      return(<div className="chart-tip"><div className="chart-tip-val">{payload[0].payload.ele}m</div><div className="chart-tip-sub">{payload[0].payload.km} km</div></div>);
                    }}/>
                    <Area dataKey="ele" fill="url(#eleGrad)" stroke="#22c55e" strokeWidth={1.5} dot={false} isAnimationActive={false}/>
                  </AreaChart>
                </ResponsiveContainer>
                <div style={{fontSize:'.68rem',color:'var(--tx3)',marginTop:4}}>+{Math.round(act.elevGainM||0)}m gain</div>
              </div>
            )}
          </div>
        )}
        {tab==="splits"&&<SplitsTab act={actState} mafHR={mafHR} onPatch={onPatch}/>}
        {tab==="journal"&&<JournalTab act={actState} onPatch={onPatch}/>}
      </div>
    </div>
  );
}

function SplitsTab({ act, mafHR, onPatch }) {
  const [stravaSplits, setStravaSplits] = React.useState(act.stravaSplits || null);
  const [loading, setLoading] = React.useState(false);
  const [fetchError, setFetchError] = React.useState(false);

  React.useEffect(() => {
    if (act.source !== "strava" || stravaSplits) return;
    const stravaId = act.id?.toString().replace(/^s/, '');
    if (!stravaId) return;
    setLoading(true);
    setFetchError(false);
    const auth = loadStravaAuth();
    getStravaToken(auth).then(token => {
      if (!token) { setLoading(false); return; }
      return fetchStravaSplits(stravaId, token);
    }).then(splits => {
      setLoading(false);
      if (!splits) return;
      setStravaSplits(splits);
      onPatch({ stravaSplits: splits });
    }).catch(() => { setLoading(false); setFetchError(true); });
  }, [act.id, act.source]);

  const gpsSplits = React.useMemo(() => computeSplits(act), [act]);
  const splits = act.source === "strava" ? (stravaSplits || gpsSplits) : gpsSplits;

  if (loading) return (
    <div style={{textAlign:"center",padding:"44px 0",color:"var(--tx2)"}}>
      <div className="spinner" style={{margin:"0 auto 12px"}}/>
      <div style={{fontSize:".8rem"}}>Loading splits from Strava…</div>
    </div>
  );
  if (fetchError && !splits) return (
    <div style={{textAlign:"center",padding:"44px 0",color:"var(--tx2)"}}>
      <div style={{fontSize:"2rem",marginBottom:8}}>⚡</div>
      <div style={{fontWeight:600,marginBottom:4}}>Could not load splits</div>
      <div style={{fontSize:".78rem",color:"var(--tx3)"}}>Check your connection and try opening this run again.</div>
    </div>
  );
  if (!splits) return (
    <div style={{textAlign:"center",padding:"44px 0",color:"var(--tx2)"}}>
      <div style={{fontSize:"2rem",marginBottom:8}}>⚡</div>
      <div style={{fontWeight:600,marginBottom:4}}>No splits available</div>
      <div style={{fontSize:".78rem"}}>Splits require GPS route data.</div>
    </div>
  );
  const best = Math.min(...splits.map(s => s.splitSec));
  const worst = Math.max(...splits.map(s => s.splitSec));
  const isGps = splits.source==="gps" || splits.source==="strava";
  const hasEle = splits.some(s=>s.elev!=null);
  const cols = "30px 1fr 48px 60px";
  return (
    <div>
      <div className="card" style={{padding:16}}>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
          <span style={{fontSize:".58rem",fontWeight:700,letterSpacing:".06em",padding:"2px 7px",borderRadius:20,
            color:isGps?"var(--gn)":"var(--yw)",background:isGps?"var(--gn2)":"rgba(234,179,8,.12)"}}>
            {splits.source==="strava"?"Strava":splits.source==="gps"?"GPS":"est."}
          </span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:cols,gap:"6px 10px",marginBottom:10}}>
          {[{h:"KM",a:"left"},{h:"PACE",a:"left"},{h:"ELEV",a:"right"},{h:"HR",a:"right"}].map(c=>(
            <div key={c.h} style={{fontSize:".6rem",fontWeight:700,color:"var(--tx3)",letterSpacing:".06em",textAlign:c.a}}>{c.h}</div>
          ))}
        </div>
        {splits.map((s,i) => {
          const isBest = s.splitSec===best, isWorst = s.splitSec===worst;
          const hrCol = s.avgHR ? (s.avgHR<=mafHR?"var(--gn)":s.avgHR<=mafHR+10?"var(--yw)":"var(--rd)") : "var(--tx3)";
          const barW = Math.max(10, Math.round((1-(s.splitSec-best)/(worst-best||1))*100));
          return (
            <div key={s.km} style={{display:"grid",gridTemplateColumns:cols,gap:"6px 10px",padding:"7px 0",borderBottom:i<splits.length-1?"1px solid var(--bd)":"none",alignItems:"center"}}>
              <div style={{fontSize:".88rem",fontWeight:700,color:"var(--or)"}}>{s.km}</div>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontFamily:"monospace",fontSize:".88rem",fontWeight:isBest?700:400,color:isBest?"var(--gn)":isWorst?"var(--rd)":"var(--tx)"}}>{fmtPace(s.splitSec)}/km</span>
                  {isBest&&<span style={{fontSize:".6rem",color:"var(--gn)",fontWeight:700}}>BEST</span>}
                  <span style={{fontSize:".62rem",color:"var(--tx3)",fontFamily:"monospace"}}>{fmtDur(s.cumulativeSec)}</span>
                </div>
                <div style={{marginTop:3,height:3,borderRadius:2,background:"var(--bd)",overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:2,width:barW+"%",background:isBest?"var(--gn)":isWorst?"var(--rd)":"var(--or)",opacity:.7}}/>
                </div>
              </div>
              <div style={{fontFamily:"monospace",fontSize:".78rem",fontWeight:600,color:"var(--tx2)",textAlign:"right"}}>{s.elev!=null?"+"+s.elev+"m":(hasEle?"—":"·")}</div>
              <div style={{fontFamily:"monospace",fontSize:".8rem",fontWeight:600,color:hrCol,textAlign:"right"}}>{s.avgHR?s.avgHR:"—"}</div>
            </div>
          );
        })}
      </div>
      <div style={{marginTop:10,fontSize:".7rem",color:"var(--tx3)",textAlign:"center"}}>{splits.source==="strava"?"Splits from Strava":splits.source==="gps"?"Splits from GPS timestamps":"Estimated from GPS distance"} · HR from sensor data</div>
    </div>
  );
}
