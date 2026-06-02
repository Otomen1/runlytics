import React, { useState } from 'react';
import { getMafZones } from '../../utils/analytics.js';

export function SettingsPanel({acts,goals,hrProfile,profile,onSaveGoals,onSaveHR,onSaveProfile,onClearAll,onImport,onClose,stravaAuth,stravaSync,onStravaConnect,onStravaSync,onStravaDisconnect}){
  const[view,setView]=useState("main");
  const[importMsg,setImportMsg]=useState("");
  const[age,setAge]=useState(hrProfile.age||"");
  const[ov,setOv]=useState(hrProfile.overrideMAF||"");
  const[useOv,setUseOv]=useState(!!hrProfile.overrideMAF);
  const[wk,setWk]=useState(goals.weekly);const[mo,setMo]=useState(goals.monthly);const[nm,setNm]=useState(profile.name||"Runner");
  const ageNum=parseInt(age)||null;
  const prevMaf=useOv&&parseInt(ov)?parseInt(ov):ageNum?180-ageNum:null;
  const backBtn=<button className="tap" style={{background:"none",border:"none",color:"var(--tx2)",fontSize:"1.1rem"}} onClick={()=>setView("main")}>‹</button>;
  return(
    <div className="fade-overlay" style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(0,0,0,.6)"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="glass sheet" style={{width:"100%",maxWidth:430,borderRadius:"22px 22px 0 0",padding:"22px 20px",paddingBottom:"max(40px,calc(env(safe-area-inset-bottom)+20px))",maxHeight:"92vh",overflowY:"auto",border:"1px solid var(--bd)"}}>
        <div style={{width:36,height:4,borderRadius:2,background:"var(--bd2)",margin:"0 auto 18px"}}/>
        {view==="main"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <div style={{fontWeight:700,fontSize:"1.05rem"}}>Settings</div>
              <button className="btn b-gh" style={{padding:"6px 13px",fontSize:".8rem"}} onClick={onClose}>Done</button>
            </div>
            {[{icon:"👤",label:"Profile",v:"profile"},{icon:"❤️",label:"MAF HR",v:"hr"},{icon:"🎯",label:"Goals",v:"goals"},{icon:"🟠",label:"Strava Sync",v:"strava"},{icon:"💾",label:"Export & Backup",v:"export"}].map(item=>(
              <div key={item.v} className="tap card2" style={{padding:"14px 15px",marginBottom:10,display:"flex",alignItems:"center",gap:14,borderRadius:12,cursor:"pointer"}} onClick={()=>setView(item.v)}>
                <div style={{width:36,height:36,borderRadius:10,background:"var(--s3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem"}}>{item.icon}</div>
                <div style={{flex:1,fontWeight:500,fontSize:".88rem"}}>{item.label}</div>
                <span style={{color:"var(--tx3)"}}>›</span>
              </div>
            ))}
            <div className="card2" style={{padding:14,marginBottom:10,borderRadius:12}}>
              {[["Activities",String(acts.length)],["Storage",Math.round(JSON.stringify(acts).length/1024)+" KB"]].map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0"}}>
                  <span style={{fontSize:".8rem",color:"var(--tx2)"}}>{l}</span>
                  <span style={{fontSize:".8rem",fontWeight:600}}>{v}</span>
                </div>
              ))}
            </div>
            <button className="btn b-rd" style={{width:"100%",padding:"12px",fontSize:".84rem"}} onClick={onClearAll}>🗑 Delete All Activities</button>
          </div>
        )}
        {view==="profile"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>{backBtn}<div className="screen-title">Profile</div></div>
            <label style={{fontSize:".76rem",fontWeight:600,display:"block",marginBottom:7}}>Your name</label>
            <input className="inp" value={nm} onChange={e=>setNm(e.target.value)} placeholder="e.g. Alex" style={{marginBottom:18}}/>
            <button className="btn b-or" style={{width:"100%",padding:"12px"}} onClick={()=>{onSaveProfile({name:nm||"Runner"});setView("main");}}>Save</button>
          </div>
        )}
        {view==="hr"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>{backBtn}<div className="screen-title">MAF HR Profile</div></div>
            <label style={{fontSize:".76rem",fontWeight:600,display:"block",marginBottom:7}}>Age · 180 − age formula</label>
            <input className="inp" type="number" min="10" max="100" placeholder="e.g. 32" value={age} onChange={e=>setAge(e.target.value)} style={{marginBottom:ageNum&&!useOv?6:14}}/>
            {ageNum&&!useOv&&<div style={{fontSize:".72rem",color:"var(--gn)",marginBottom:14}}>✓ MAF HR: {180-ageNum} bpm</div>}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:useOv?10:16}}>
              <div style={{width:36,height:20,borderRadius:10,background:useOv?"var(--or)":"var(--bd2)",position:"relative",cursor:"pointer",transition:"background .2s"}} onClick={()=>setUseOv(v=>!v)}>
                <div style={{position:"absolute",top:2,left:useOv?18:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
              </div>
              <span style={{fontSize:".78rem",cursor:"pointer"}} onClick={()=>setUseOv(v=>!v)}>Custom MAF override</span>
            </div>
            {useOv&&<input className="inp" type="number" min="100" max="220" placeholder="e.g. 148" value={ov} onChange={e=>setOv(e.target.value)} style={{marginBottom:14}}/>}
            {prevMaf&&(
              <div style={{marginBottom:16,padding:"12px",background:"rgba(249,115,22,.07)",border:"1px solid rgba(249,115,22,.2)",borderRadius:12}}>
                <div style={{fontSize:".7rem",color:"var(--or)",fontWeight:600,marginBottom:7}}>MAF = {prevMaf} bpm</div>
                {getMafZones(prevMaf).map(z=>(
                  <div key={z.zone} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:z.color}}/>
                    <span style={{fontSize:".72rem",flex:1}}>Zone {z.zone} {z.label}</span>
                    <span style={{fontSize:".72rem",color:z.color,fontWeight:600}}>{Math.round(z.lo)}–{Math.round(z.hi)} bpm</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <button className="btn b-gh" style={{padding:"12px 14px"}} onClick={()=>{onSaveHR({age:null,restingHR:null,overrideMAF:null});setView("main");}}>Clear</button>
              <button className="btn b-or" style={{flex:1,padding:"12px"}} onClick={()=>{onSaveHR({age:ageNum,restingHR:null,overrideMAF:useOv&&parseInt(ov)?parseInt(ov):null});setView("main");}}>Save</button>
            </div>
          </div>
        )}
        {view==="goals"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>{backBtn}<div className="screen-title">Distance Goals</div></div>
            {[["Weekly (km)",wk,setWk],["Monthly (km)",mo,setMo]].map(([l,v,sv])=>(
              <div key={l} style={{marginBottom:16}}>
                <label style={{fontSize:".76rem",fontWeight:600,display:"block",marginBottom:7}}>{l}</label>
                <input className="inp" type="number" min="1" max="500" value={v} onChange={e=>sv(Number(e.target.value))}/>
              </div>
            ))}
            <button className="btn b-or" style={{width:"100%",padding:"12px"}} onClick={()=>{onSaveGoals({weekly:Number(wk),monthly:Number(mo)});setView("main");}}>Save</button>
          </div>
        )}
        {view==="export"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>{backBtn}<div className="screen-title">Export & Backup</div></div>
            <div className="card2" style={{padding:14,borderRadius:12,marginBottom:16}}>
              {[["Activities",String(acts.length)],["Est. size",Math.round(JSON.stringify(acts).length/1024)+" KB"]].map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0"}}>
                  <span style={{fontSize:".8rem",color:"var(--tx2)"}}>{l}</span>
                  <span style={{fontSize:".8rem",fontWeight:600}}>{v}</span>
                </div>
              ))}
            </div>
            <button className="btn b-or" style={{width:"100%",padding:"12px",marginBottom:10}} onClick={()=>{
              const data=JSON.stringify(acts,null,2);
              const blob=new Blob([data],{type:"application/json"});
              const url=URL.createObjectURL(blob);
              const a=document.createElement("a");
              a.href=url;a.download="runlytics-backup-"+new Date().toISOString().slice(0,10)+".json";
              document.body.appendChild(a);a.click();document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}>⬇️ Export JSON backup</button>
            <div style={{borderTop:"1px solid var(--bd)",paddingTop:16,marginTop:4}}>
              <div style={{fontSize:".76rem",fontWeight:600,marginBottom:8}}>Restore from backup</div>
              <div style={{fontSize:".74rem",color:"var(--tx2)",marginBottom:12,lineHeight:1.6}}>Import a previously exported JSON file. Existing activities are kept — duplicates are skipped.</div>
              <label style={{display:"block",width:"100%"}}>
                <div className="btn b-gh" style={{padding:"12px",textAlign:"center",cursor:"pointer"}}>📂 Choose JSON file</div>
                <input type="file" accept=".json,application/json" style={{display:"none"}} onChange={async e=>{
                  const file=e.target.files[0];if(!file)return;
                  try{
                    const text=await file.text();
                    const parsed=JSON.parse(text);
                    if(!Array.isArray(parsed))throw new Error("Not an array");
                    onImport(parsed);
                    setImportMsg("✓ Import started — "+parsed.length+" activities processed");
                  }catch(err){void err;setImportMsg("✗ Invalid file: must be a JSON array of activities.");}
                  e.target.value="";
                }}/>
              </label>
              {importMsg&&<div style={{marginTop:10,fontSize:".74rem",color:importMsg.startsWith("✓")?"var(--gn)":"var(--rd)",padding:"8px 12px",borderRadius:9,background:"var(--s3)"}}>{importMsg}</div>}
            </div>
          </div>
        )}
        {view==="strava"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>{backBtn}<div className="screen-title">Strava Sync</div></div>
            {stravaAuth?(
              <div>
                <div style={{padding:"12px 14px",borderRadius:12,background:"rgba(34,197,94,.1)",border:"1px solid rgba(34,197,94,.2)",marginBottom:14,display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:"#fc4c02",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem",flexShrink:0}}>🟠</div>
                  <div><div style={{fontWeight:700,color:"var(--gn)"}}>✓ Connected</div><div style={{fontSize:".74rem",color:"var(--tx2)"}}>{stravaAuth.athlete&&stravaAuth.athlete.firstname||"Athlete"}</div></div>
                </div>
                <button className="btn b-or" style={{width:"100%",padding:"12px",marginBottom:10}} onClick={onStravaSync} disabled={stravaSync&&stravaSync.loading}>
                  {stravaSync&&stravaSync.loading?"Syncing...":"🔄 Sync from Strava"}
                </button>
                {stravaSync&&stravaSync.msg&&<div style={{fontSize:".74rem",color:"var(--tx2)",textAlign:"center",padding:"7px",background:"var(--s3)",borderRadius:9,marginBottom:10}}>{stravaSync.msg}</div>}
                <button className="btn b-rd" style={{width:"100%",padding:"11px",fontSize:".82rem"}} onClick={()=>{onStravaDisconnect();setView("main");}}>Disconnect Strava</button>
              </div>
            ):(
              <div>
                <div style={{textAlign:"center",padding:"16px 0 20px"}}>
                  <div style={{fontSize:"2.5rem",marginBottom:10}}>🟠</div>
                  <div style={{fontWeight:700,marginBottom:8}}>Connect Strava</div>
                  <div style={{fontSize:".8rem",color:"var(--tx2)",lineHeight:1.7,marginBottom:20}}>Import your runs automatically.</div>
                </div>
                <button className="btn b-or" style={{width:"100%",padding:"13px",marginBottom:10}} onClick={onStravaConnect}>🟠 Connect with Strava</button>
                {stravaSync&&stravaSync.msg&&<div style={{fontSize:".74rem",color:"var(--rd)",textAlign:"center",marginTop:8}}>{stravaSync.msg}</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
