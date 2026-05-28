import React from 'react';
import { MiniRoute } from '../Map/MiniRoute.jsx';
import { fmtKm, fmtDur, fmtPace, fmtDate, fmtDateS } from '../../utils/formatters.js';
import { drawRouteCanvas, cClipRounded, renderToCanvas, canvasToBlob, downloadExport, EXPORT_CONFIG, CANVAS_TYPE, CANVAS_LAYOUT } from '../../utils/canvas.js';
import { ACT_ICN, ACT_CLR } from '../../constants/activityTypes.js';
import { SHARE_TEMPLATES } from '../../constants/canvas.js';

function StatRow({dark,W,durFmt,paceFmt}){
  const f=n=>Math.round(n*W/270)+"px";
  const fn=n=>Math.round(n*W/270);
  const tc=dark?"#1a1a1a":"#ffffff";
  const lc=dark?"rgba(0,0,0,.32)":"rgba(255,255,255,.28)";
  const dc=dark?"rgba(0,0,0,.1)":"rgba(255,255,255,.1)";
  return(
    <div style={{display:"flex",alignItems:"flex-start"}}>
      <div style={{flex:1}}>
        <span style={{fontSize:f(20),fontWeight:800,color:tc,fontFamily:"monospace",letterSpacing:"-.01em"}}>{durFmt}</span>
        <div style={{fontSize:f(5.5),color:lc,letterSpacing:".14em",marginTop:f(2)}}>DURATION</div>
      </div>
      <div style={{width:1,height:fn(30)+"px",background:dc,flexShrink:0,marginTop:fn(2)+"px"}}/>
      <div style={{flex:1,paddingLeft:f(14)}}>
        <span style={{fontSize:f(20),fontWeight:800,color:tc,fontFamily:"monospace",letterSpacing:"-.01em"}}>{paceFmt}</span>
        <div style={{fontSize:f(5.5),color:lc,letterSpacing:".14em",marginTop:f(2)}}>/KM</div>
      </div>
    </div>
  );
}

const CardBrand=({f,color='rgba(255,255,255,.28)'})=>(
  <div style={{fontSize:f(6),fontWeight:700,color,letterSpacing:'.2em'}}>RUNLYTICS</div>
const CardKilometres=({f,dist,distColor='#fff',accentColor='#f97316'})=>(
  <div>
const CardRule=({f,accentColor='#f97316',muteColor='rgba(255,255,255,.1)'})=>(
  <div style={{display:'flex',alignItems:'center',gap:f(8),margin:`${f(14)} 0`}}>
const CardGlass=({f,children,style={}})=>(
  <div style={{background:'rgba(255,255,255,.055)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',
    border:'1px solid rgba(255,255,255,.1)',borderRadius:f(11),
    boxShadow:'inset 0 1px 0 rgba(255,255,255,.08)',padding:`${f(12)} ${f(14)}`,...style}}>

export function ShareCard({type,act,W=270,H=480}){
  const f=n=>Math.round(n*W/270)+"px";
  const fn=n=>Math.round(n*W/270);
  const dist=fmtKm(act.distanceKm);
  const durFmt=fmtDur(act.movingTimeSec);
  const paceFmt=fmtPace(act.avgPaceSecKm)+"/km";
  const hasRoute=act.route&&act.route.length>=2;
  const runName=act.name||"Activity";
  const d=act.dateTs?new Date(act.dateTs):null;
  const dateStr=d?d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):fmtDate(act.date);
  const shell={width:W,height:H,borderRadius:fn(20)+"px",flexShrink:0,overflow:"hidden",position:"relative"};
  const anim={animation:"cardEntrance .38s cubic-bezier(.34,1.56,.64,1) both"};

  // ── VELOCITY — clean editorial, light background ──────────────────────────
  if(type==="velocity")return(
    <div style={{...shell,background:"#faf8f4",...anim}}>
      {/* Warm gradient wash */}
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:"42%",
        background:"linear-gradient(to top,rgba(249,115,22,.07) 0%,transparent 100%)",pointerEvents:"none"}}/>
      {/* Top row: wordmark + date */}
      <div style={{position:"absolute",top:f(22),left:f(22),right:f(22),display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <CardBrand f={f} color="rgba(0,0,0,.22)"/>
        <div style={{fontSize:f(7),color:"rgba(0,0,0,.25)",letterSpacing:".06em"}}>{dateStr}</div>
      </div>
      {/* Main content block */}
      <div style={{position:"absolute",top:f(56),left:f(22),right:f(22)}}>
        {/* Activity type badge */}
        <div style={{display:"inline-flex",alignItems:"center",padding:`${f(3)} ${f(9)}`,borderRadius:f(20),
          background:"rgba(0,0,0,.06)",border:"1px solid rgba(0,0,0,.07)",marginBottom:f(16)}}>
          <span style={{fontSize:f(6),fontWeight:700,color:"rgba(0,0,0,.38)",letterSpacing:".14em"}}>{(act.type||"RUN").toUpperCase()}</span>
        </div>
        {/* Giant distance hero */}
        <div style={{fontSize:f(86),fontWeight:900,color:"#0a0a0a",lineHeight:.82,letterSpacing:"-.05em",marginBottom:f(7)}}>{dist}</div>
        <div style={{fontSize:f(8),fontWeight:600,color:"rgba(0,0,0,.28)",letterSpacing:".24em",marginBottom:f(20)}}>KILOMETRES</div>
        {/* Asymmetric accent rule */}
        <div style={{display:"flex",alignItems:"center",gap:f(8),marginBottom:f(20)}}>
          <div style={{width:f(22),height:2,background:"#f97316",borderRadius:1,flexShrink:0}}/>
          <div style={{flex:1,height:1,background:"rgba(0,0,0,.1)"}}/>
        </div>
        <StatRow dark W={W} durFmt={durFmt} paceFmt={paceFmt}/>
        {/* Run name */}
        <div style={{marginTop:f(20),paddingTop:f(16),borderTop:"1px solid rgba(0,0,0,.08)"}}>
          <div style={{fontSize:f(9),fontWeight:600,color:"rgba(0,0,0,.55)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:f(3)}}>{runName}</div>
          {act.avgHR&&<div style={{display:"inline-flex",alignItems:"center",gap:f(4),padding:`${f(3)} ${f(8)}`,borderRadius:f(16),background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.12)"}}>
            <span style={{fontSize:f(7),color:"#ef4444",fontWeight:700,fontFamily:"monospace"}}>{act.avgHR}</span>
            <span style={{fontSize:f(5.5),color:"rgba(239,68,68,.65)",letterSpacing:".1em"}}>BPM</span>
          </div>}
        </div>
      </div>
    </div>
  );

  // ── RACE DAY — route as hero art on dark ─────────────────────────────────
  if(type==="raceday")return(
    <div style={{...shell,background:"#060810",...anim}}>
      {/* Route fills top */}
      {hasRoute&&(
        <div style={{position:"absolute",top:0,left:0,right:0,height:"60%",overflow:"hidden"}}>
          <MiniRoute route={act.route} W={W} H={fn(H*.62)} glowColor="#f97316"/>
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:"65%",
            background:"linear-gradient(to bottom,transparent,#060810)"}}/>
        </div>
      )}
      {/* Edge vignette */}
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 50%,transparent 35%,rgba(0,0,0,.55) 100%)",pointerEvents:"none"}}/>
      {/* Orange glow behind distance */}
      <div style={{position:"absolute",bottom:"26%",left:"50%",transform:"translateX(-50%)",
        width:f(160),height:f(48),background:"radial-gradient(ellipse at center,rgba(249,115,22,.22) 0%,transparent 70%)",filter:"blur(10px)",pointerEvents:"none"}}/>
      {/* Bottom content */}
      <div style={{position:"absolute",bottom:f(28),left:f(22),right:f(22)}}>
        <div style={{textAlign:"center",marginBottom:f(14)}}>
          <div style={{fontSize:f(54),fontWeight:900,color:"#fff",lineHeight:.86,letterSpacing:"-.04em"}}>{dist}</div>
          <div style={{fontSize:f(7),fontWeight:700,color:"#f97316",letterSpacing:".24em",marginTop:f(7)}}>KILOMETRES</div>
        </div>
        {/* Frosted glass stat panel */}
        <CardGlass f={f} style={{marginBottom:f(12)}}>
          <StatRow W={W} durFmt={durFmt} paceFmt={paceFmt}/>
        </CardGlass>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:f(7),color:"rgba(255,255,255,.3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"68%"}}>{runName}</div>
          <CardBrand f={f} color="rgba(255,255,255,.22)"/>
        </div>
      </div>
    </div>
  );

  // ── ENDURANCE — left-aligned cinematic poster ─────────────────────────────
  if(type==="endurance")return(
    <div style={{...shell,background:"#0a0c14",...anim}}>
      {/* Subtle top glow */}
      <div style={{position:"absolute",top:"-8%",left:"15%",right:"15%",height:"28%",
        background:"radial-gradient(ellipse at center,rgba(249,115,22,.06) 0%,transparent 70%)",pointerEvents:"none"}}/>
      {/* Edge darkening */}
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 50%,transparent 50%,rgba(0,0,0,.38) 100%)",pointerEvents:"none"}}/>
      {/* Content — left-aligned */}
      <div style={{position:"absolute",top:f(32),left:f(24),right:f(24)}}>
        <div style={{fontSize:f(6),fontWeight:700,color:"rgba(255,255,255,.16)",letterSpacing:".22em",marginBottom:f(28)}}>RUNLYTICS</div>
        {/* Distance block */}
        <div style={{fontSize:f(76),fontWeight:900,color:"#fff",lineHeight:.82,letterSpacing:"-.05em",marginBottom:f(8)}}>{dist}</div>
        <div style={{display:"flex",alignItems:"center",gap:f(10),marginBottom:f(26)}}>
          <div style={{width:f(26),height:3,background:"#f97316",borderRadius:1.5}}/>
          <div style={{fontSize:f(7),fontWeight:700,color:"rgba(255,255,255,.36)",letterSpacing:".18em"}}>KM</div>
        </div>
        {/* Stat list */}
        <div style={{borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:f(18)}}>
          {[["DURATION",durFmt],["PACE",paceFmt]].map(([lbl,val])=>(
            <div key={lbl} style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:f(13)}}>
              <span style={{fontSize:f(6),color:"rgba(255,255,255,.26)",letterSpacing:".14em"}}>{lbl}</span>
              <span style={{fontSize:f(16),fontWeight:700,color:"#fff",fontFamily:"monospace"}}>{val}</span>
            </div>
          ))}
          {act.avgHR&&(
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:f(13)}}>
              <span style={{fontSize:f(6),color:"rgba(255,255,255,.26)",letterSpacing:".14em"}}>HR</span>
              <span style={{fontSize:f(16),fontWeight:700,color:"#f97316",fontFamily:"monospace"}}>{act.avgHR} <span style={{fontSize:f(7),fontWeight:600,opacity:.7}}>BPM</span></span>
            </div>
          )}
        </div>
        <div style={{fontSize:f(7),color:"rgba(255,255,255,.2)",marginTop:f(8),overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{runName}</div>
      </div>
      {/* Route as decorative bottom-right art */}
      {hasRoute&&(
        <div style={{position:"absolute",bottom:f(18),right:0,width:"52%",height:"22%",overflow:"hidden",opacity:.32}}>
          <MiniRoute route={act.route} W={fn(W*.52)} H={fn(H*.22)} glowColor="#f97316"/>
        </div>
      )}
    </div>
  );

  // ── CINEMATIC — atmospheric gradient with route ghost ─────────────────────
  if(type==="cinematic")return(
    <div style={{...shell,background:"linear-gradient(160deg,#0d0520 0%,#150830 40%,#080d18 100%)",...anim}}>
      {/* Atmospheric light sources */}
      <div style={{position:"absolute",top:"-5%",left:"15%",width:"70%",height:"45%",
        background:"radial-gradient(ellipse at center,rgba(110,50,200,.18) 0%,transparent 70%)",pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:"10%",right:"10%",width:"55%",height:"35%",
        background:"radial-gradient(ellipse at center,rgba(249,115,22,.1) 0%,transparent 70%)",pointerEvents:"none"}}/>
      {/* Route as blurred background art */}
      {hasRoute&&(
        <div style={{position:"absolute",top:"-2%",left:"-5%",right:"-5%",height:"62%",overflow:"hidden",opacity:.28,filter:"blur(1.5px)"}}>
          <MiniRoute route={act.route} W={fn(W*1.1)} H={fn(H*.64)} glowColor="#a855f7"/>
        </div>
      )}
      {/* Dark gradient masking lower portion */}
      <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,transparent 22%,rgba(8,5,22,.94) 62%)",pointerEvents:"none"}}/>
      {/* Vignette */}
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 50%,transparent 38%,rgba(0,0,0,.6) 100%)",pointerEvents:"none"}}/>
      {/* Purple glow behind distance */}
      <div style={{position:"absolute",bottom:"28%",left:"50%",transform:"translateX(-50%)",
        width:f(150),height:f(44),background:"radial-gradient(ellipse at center,rgba(140,70,255,.2) 0%,transparent 70%)",filter:"blur(12px)",pointerEvents:"none"}}/>
      {/* Content */}
      <div style={{position:"absolute",bottom:f(28),left:f(22),right:f(22),textAlign:"center"}}>
        <div style={{fontSize:f(56),fontWeight:900,color:"#fff",lineHeight:.84,letterSpacing:"-.04em",marginBottom:f(8)}}>{dist}</div>
        <div style={{fontSize:f(7),fontWeight:700,color:"rgba(168,85,247,.85)",letterSpacing:".22em",marginBottom:f(16)}}>KILOMETRES</div>
        <div style={{height:1,background:"linear-gradient(to right,transparent,rgba(255,255,255,.12),transparent)",marginBottom:f(16)}}/>
        <StatRow W={W} durFmt={durFmt} paceFmt={paceFmt}/>
        <div style={{marginTop:f(14),display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:f(7),color:"rgba(255,255,255,.26)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"65%"}}>{runName}</div>
          <CardBrand f={f} color="rgba(255,255,255,.2)"/>
        </div>
      </div>
    </div>
  );

  // ── GLASS — frosted luxury card with inner panel ──────────────────────────
  return(
    <div style={{...shell,background:"linear-gradient(145deg,#0c1120 0%,#080d1a 100%)",...anim}}>
      {/* Subtle grid texture */}
      <div style={{position:"absolute",inset:0,
        backgroundImage:"linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px)",
        backgroundSize:`${f(18)} ${f(18)}`,pointerEvents:"none"}}/>
      {/* Top accent glow */}
      <div style={{position:"absolute",top:"-8%",left:"18%",right:"18%",height:"32%",
        background:"radial-gradient(ellipse at center,rgba(249,115,22,.07) 0%,transparent 70%)",pointerEvents:"none"}}/>
      {/* Main glass panel */}
      <div style={{position:"absolute",top:f(38),left:f(14),right:f(14),
        background:"rgba(255,255,255,.045)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",
        borderRadius:f(16),border:"1px solid rgba(255,255,255,.1)",overflow:"hidden"}}>
        {/* Inner top highlight */}
        <div style={{height:1,background:"linear-gradient(to right,transparent,rgba(255,255,255,.18),transparent)"}}/>
        <div style={{padding:`${f(18)} ${f(16)} ${f(14)}`}}>
          {/* Icon badge */}
          <div style={{textAlign:"center",marginBottom:f(14)}}>
            <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
              width:f(36),height:f(36),borderRadius:"50%",
              background:"rgba(249,115,22,.12)",border:"1px solid rgba(249,115,22,.2)",
              fontSize:f(17),marginBottom:f(12)}}>🏃</div>
            <div style={{fontSize:f(56),fontWeight:900,color:"#fff",lineHeight:.84,letterSpacing:"-.04em"}}>{dist}</div>
            <div style={{fontSize:f(7),fontWeight:600,color:"rgba(255,255,255,.28)",letterSpacing:".2em",marginTop:f(6)}}>KILOMETRES</div>
          </div>
          <div style={{height:1,background:"rgba(255,255,255,.07)",marginBottom:f(14)}}/>
          <StatRow W={W} durFmt={durFmt} paceFmt={paceFmt}/>
        </div>
        {/* Route inside glass */}
        {hasRoute&&(
          <div style={{margin:`0 ${f(4)} ${f(4)}`,borderRadius:f(10),overflow:"hidden",border:"1px solid rgba(255,255,255,.06)"}}>
            <MiniRoute route={act.route} W={W-fn(14)*2-fn(8)} H={fn((W-fn(14)*2-fn(8))*.45)} glowColor="#f97316" bgColor="#0a0e1a"/>
          </div>
        )}
      </div>
      {/* Below-panel info */}
      <div style={{position:"absolute",bottom:f(20),left:f(22),right:f(22),display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:f(8),fontWeight:500,color:"rgba(255,255,255,.4)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"72%"}}>{runName}</div>
        <CardBrand f={f} color="rgba(255,255,255,.2)"/>
      </div>
    </div>
  );
}
