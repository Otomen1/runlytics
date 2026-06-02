import React, { useState, useMemo, useEffect, useRef } from 'react';
import { RouteMapSVG } from '../Map/RouteMapSVG.jsx';
import { SH } from '../common/SH.jsx';
import { ACT_ICN, ACT_CLR } from '../../constants/activityTypes.js';
import { fmtKm, fmtDur, fmtPace, fmtDate } from '../../utils/formatters.js';
import { getMafHR, computeZones, computeSplits } from '../../utils/analytics.js';
import { JournalTab } from './JournalTab.jsx';
import { saveActivity, getPhotos } from '../../db/indexedDB.js';

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
  const col=ACT_CLR[actState.type]||"#6b7280";
  const mafHR=getMafHR(hrProfile);
  const zones=actState.hrSamples&&actState.hrSamples.length?computeZones(actState.hrSamples,mafHR):null;

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
            <div style={{fontSize:".62rem",fontWeight:700,color:col,marginBottom:4,textTransform:"uppercase"}}>{ACT_ICN[act.type]||"🏃"} {act.type} · {act.runClass}</div>
            <div style={{fontWeight:700,fontSize:".98rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{act.name}</div>
            <div style={{fontSize:".72rem",color:"var(--tx2)",marginTop:2}}>{fmtDate(act.date)}</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {onShare&&<button className="btn b-or" style={{padding:"7px 16px",fontSize:".82rem",fontWeight:700}} onClick={onShare}>📤 Share</button>}
            <button className="btn b-rd" style={{padding:"7px 10px"}} onClick={()=>{if(window.confirm("Delete this run?"))onDelete(act.id);}}>🗑</button>
            <button className="btn b-gh" style={{padding:"7px 12px"}} onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={{display:"flex"}}>
          {[{id:"overview",label:"overview"},{id:"splits",label:"⚡ splits"},{id:"heartrate",label:"heartrate"},{id:"map",label:"map"},{id:"journal",label:"📓 journal"}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{padding:"8px 14px",border:"none",background:"transparent",color:tab===t.id?"var(--or)":"var(--tx2)",fontFamily:"inherit",fontSize:".78rem",fontWeight:tab===t.id?600:400,cursor:"pointer",textTransform:"capitalize",borderBottom:tab===t.id?"2px solid var(--or)":"2px solid transparent",transition:"color .15s"}}>
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
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
              {[{l:"Distance",v:fmtKm(act.distanceKm)+" km",c:col},{l:"Pace",v:fmtPace(act.avgPaceSecKm)+"/km",c:"var(--tx)"},{l:"Time",v:fmtDur(act.movingTimeSec),c:"var(--tx)"}].map(s=>(
                <div key={s.l} className="card2" style={{padding:"12px 8px",textAlign:"center"}}>
                  <div style={{fontSize:"1.1rem",fontWeight:700,color:s.c,lineHeight:1,marginBottom:5}}>{s.v}</div>
                  <div style={{fontSize:".65rem",color:"var(--tx2)",letterSpacing:".04em"}}>{s.l}</div>
                </div>
              ))}
            </div>
            <div className="card" style={{padding:16}}>
              {[["Elev Gain","+"+Math.round(act.elevGainM||0)+"m"],["Max HR",act.maxHR?(act.maxHR+" bpm"):"—"],["Avg HR",act.avgHR?(act.avgHR+" bpm"):"—"],["Load",String(act.trainingLoad||0)]].map(([l,v],i)=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:i<3?"1px solid var(--bd)":"none"}}>
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
          <div className="card" style={{padding:16}}>
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
        )}
        {tab==="splits"&&<SplitsTab act={actState} mafHR={mafHR}/>}
        {tab==="journal"&&<JournalTab act={actState} onPatch={onPatch}/>}
      </div>
    </div>
  );
}

function SplitsTab({ act, mafHR }) {
  const splits = React.useMemo(() => computeSplits(act), [act]);
  if (!splits) return (
    <div style={{textAlign:"center",padding:"44px 0",color:"var(--tx2)"}}>
      <div style={{fontSize:"2rem",marginBottom:8}}>⚡</div>
      <div style={{fontWeight:600,marginBottom:4}}>No splits available</div>
      <div style={{fontSize:".78rem"}}>Splits require GPS route data.</div>
    </div>
  );
  const best = Math.min(...splits.map(s => s.splitSec));
  const worst = Math.max(...splits.map(s => s.splitSec));
  const isGps = splits.source==="gps";
  const hasEle = splits.some(s=>s.elev!=null);
  const cols = "30px 1fr 48px 60px";
  return (
    <div>
      <div className="card" style={{padding:16}}>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
          <span style={{fontSize:".58rem",fontWeight:700,letterSpacing:".06em",padding:"2px 7px",borderRadius:20,
            color:isGps?"var(--gn)":"var(--yw)",background:isGps?"var(--gn2)":"rgba(234,179,8,.12)"}}>
            {isGps?"GPS":"est."}
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
      <div style={{marginTop:10,fontSize:".7rem",color:"var(--tx3)",textAlign:"center"}}>{isGps?"Splits from GPS timestamps":"Estimated from GPS distance"} · HR from sensor data</div>
    </div>
  );
}
