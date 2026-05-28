import React, { useState, useRef, useCallback } from 'react';
import { ACT_ICN, ACT_CLR } from '../../constants/activityTypes.js';
import { fmtKm, fmtDur, fmtDateS } from '../../utils/formatters.js';
import { parseGPX, readFileText } from '../../utils/gps.js';

export function Upload({acts,hrProfile,onAdd,onClearAll}){
  const[queue,setQueue]=useState([]);const[drag,setDrag]=useState(false);const ref=useRef(null);
  const process=useCallback(async files=>{
    const gpx=Array.from(files).filter(f=>f.name.toLowerCase().endsWith(".gpx"));
    if(!gpx.length)return;
    const items=gpx.map(f=>({file:f,status:"parsing",parsed:null,error:null}));
    setQueue(items);
    const res=await Promise.all(items.map(async item=>{
      try{
        const text=await readFileText(item.file);
        // FIX #6b: only pass text + filename (no hrProfile — parseGPX doesn't use it)
        const parsed=parseGPX(text,item.file.name);
        if(!parsed)return{...item,status:"error",error:"Could not parse GPX file"};
        const dupe=acts.some(a=>Math.abs(a.dateTs-parsed.dateTs)<60000&&Math.abs(a.distanceKm-parsed.distanceKm)<0.1);
        return{...item,status:dupe?"duplicate":"preview",parsed,error:dupe?"Already uploaded":null};
      }catch(e){return{...item,status:"error",error:e.message};}
    }));
    setQueue(res);
  },[acts]);
  const saveAll=()=>{
    const valid=queue.filter(q=>q.status==="preview"&&q.parsed);
    if(!valid.length)return;
    onAdd(valid.map(q=>q.parsed));
    setQueue([]);
  };
  return(
    <div style={{position:"fixed",inset:0,zIndex:210,background:"var(--bg)",display:"flex",flexDirection:"column"}}>
      <div className="glass" style={{padding:"max(14px,calc(env(safe-area-inset-top)+8px)) 18px 12px",borderBottom:"1px solid var(--bd)",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div className="screen-title">Upload Runs</div>
        <button className="btn b-gh" style={{padding:"6px 13px"}} onClick={()=>onAdd([])}>✕ Close</button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"18px 16px",paddingBottom:"max(32px,calc(env(safe-area-inset-bottom)+16px))"}}>
      <div style={{fontSize:".82rem",color:"var(--tx2)",marginBottom:18}}>Import GPX files from Garmin, Strava or any GPS watch</div>
      <div className={"dz a0 "+(drag?"ov":"")} style={{padding:"28px 20px",textAlign:"center",marginBottom:14,cursor:"pointer"}}
        onDragOver={e=>{e.preventDefault();setDrag(true);}}
        onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);process(e.dataTransfer.files);}}
        onClick={()=>ref.current&&ref.current.click()}>
        <input ref={ref} type="file" accept=".gpx" multiple style={{display:"none"}} onChange={e=>process(e.target.files)}/>
        <div style={{fontSize:"2.2rem",marginBottom:10}}>📁</div>
        <div style={{fontWeight:600,marginBottom:5}}>Drop GPX files here</div>
        <div style={{fontSize:".8rem",color:"var(--tx2)",marginBottom:14}}>or tap to browse</div>
        <button className="btn b-or" style={{padding:"10px 22px",fontSize:".86rem"}}>Choose files</button>
      </div>
      {queue.length>0&&(
        <div className="card a1" style={{padding:16,marginBottom:14}}>
          {queue.map((item,idx)=>(
            <div key={idx} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:idx<queue.length-1?"1px solid var(--bd)":"none"}}>
              <div style={{width:34,height:34,borderRadius:10,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:item.status==="preview"?"var(--gn2)":item.status==="error"?"var(--rd2)":"var(--s3)"}}>
                {item.status==="parsing"?<div className="spinner"/>:item.status==="preview"?"✓":item.status==="error"?"✗":"≈"}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:".82rem",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.file.name}</div>
                {item.parsed&&<div style={{fontSize:".7rem",color:"var(--tx2)",marginTop:2}}>{fmtKm(item.parsed.distanceKm)} km · {fmtDur(item.parsed.movingTimeSec)}</div>}
                {item.error&&<div style={{fontSize:".7rem",color:"var(--rd)",marginTop:2}}>{item.error}</div>}
              </div>
            </div>
          ))}
          {queue.some(q=>q.status==="preview")&&(
            <button className="btn b-or" style={{width:"100%",padding:"12px",fontSize:".88rem",marginTop:14}} onClick={saveAll}>
              Save {queue.filter(q=>q.status==="preview").length} run{queue.filter(q=>q.status==="preview").length!==1?"s":""}
            </button>
          )}
        </div>
      )}
      {acts.length>0&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:".62rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--tx3)"}}>Library · {acts.length} runs</div>
            <button className="btn b-rd" style={{padding:"5px 10px",fontSize:".72rem"}} onClick={onClearAll}>Clear All</button>
          </div>
          {acts.slice(0,5).map(a=>(
            <div key={a.id} className="card2" style={{padding:"11px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:34,height:34,borderRadius:9,background:(ACT_CLR[a.type]||"#6b7280")+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1rem"}}>{ACT_ICN[a.type]||"🏃"}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:".82rem",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
                <div style={{fontSize:".7rem",color:"var(--tx2)",marginTop:2}}>{fmtDateS(a.date)} · {fmtKm(a.distanceKm)} km</div>
              </div>
            </div>
          ))}
          {acts.length>5&&<div style={{fontSize:".74rem",color:"var(--tx2)",textAlign:"center",padding:"6px 0"}}>+{acts.length-5} more</div>}
        </div>
      )}
      </div>
    </div>
  );
}

