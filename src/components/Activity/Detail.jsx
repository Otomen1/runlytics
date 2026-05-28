import React, { useState, useMemo } from 'react';
import { RouteMapSVG } from '../Map/RouteMapSVG.jsx';
import { SH } from '../common/SH.jsx';
import { ACT_ICN, ACT_CLR } from '../../constants/activityTypes.js';
import { fmtKm, fmtDur, fmtPace, fmtDate, fmtDateS } from '../../utils/formatters.js';
import { getMafHR, computeZones } from '../../utils/analytics.js';

export function Detail({act,hrProfile,onClose,onDelete,onShare}){
  const[tab,setTab]=useState("overview");
  const col=ACT_CLR[act.type]||"#6b7280";
  const mafHR=getMafHR(hrProfile);
  const zones=act.hrSamples&&act.hrSamples.length?computeZones(act.hrSamples,mafHR):null;
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
            {onShare&&<button className="btn b-gh" style={{padding:"7px 13px",fontSize:".9rem"}} onClick={onShare} aria-label="Share">📤</button>}
            <button className="btn b-rd" style={{padding:"7px 10px"}} onClick={()=>{if(window.confirm("Delete this run?"))onDelete(act.id);}}>🗑</button>
            <button className="btn b-gh" style={{padding:"7px 12px"}} onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={{display:"flex"}}>
          {["overview","heartrate","map"].map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{padding:"8px 14px",border:"none",background:"transparent",color:tab===t?"var(--or)":"var(--tx2)",fontFamily:"inherit",fontSize:".78rem",fontWeight:tab===t?600:400,cursor:"pointer",textTransform:"capitalize",borderBottom:tab===t?"2px solid var(--or)":"2px solid transparent",transition:"color .15s"}}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div style={{flex:1,padding:"18px 18px 32px"}}>
        {tab==="overview"&&(
          <div>
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
      </div>
    </div>
  );
}

// FileReader fallback for file.text() — file.text() is ES2019+ and missing
// in iOS Safari <14, older Android WebView, and some Samsung Browser versions.
// This is the primary cause of silent mobile upload failures.
function readFileText(file){
  if(typeof file.text==='function')return file.text();
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=e=>resolve(e.target.result);
    reader.onerror=()=>reject(new Error('File read failed'));
    reader.readAsText(file,'UTF-8');
  });
}
