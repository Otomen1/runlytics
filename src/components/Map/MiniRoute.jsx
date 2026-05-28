import React, { useState, useEffect } from 'react';
import { normalizeRoute } from '../../utils/activity.js';

export function MiniRoute({route,W=160,H=110,glowColor='#f97316',bgColor=null}){
  const[drawn,setDrawn]=useState(false);
  useEffect(()=>{const t=setTimeout(()=>setDrawn(true),120);return()=>clearTimeout(t);},[]);

  if(!route||!Array.isArray(route)||route.length<2){
    const cx=W/2,cy=H/2,r=Math.min(W,H)*0.28;
    return(
      <svg width={W} height={H} viewBox={"0 0 "+W+" "+H} style={{display:"block",borderRadius:8}}>
        {bgColor&&<rect width={W} height={H} fill={bgColor}/>}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={glowColor} strokeWidth={1.2}
          strokeDasharray="4 3.5" opacity={0.2}/>
        <path d={"M"+(cx-r*.55)+" "+(cy+r*.2)+" C"+(cx-r*.2)+" "+(cy-r*.4)+" "+(cx+r*.2)+" "+(cy-r*.35)+" "+(cx+r*.55)+" "+(cy+r*.25)}
          fill="none" stroke={glowColor} strokeWidth={1.5} strokeLinecap="round" opacity={0.18}/>
        <text x={cx} y={cy+r+Math.min(W,H)*.13} textAnchor="middle" fill={glowColor}
          fontSize={Math.round(Math.min(W,H)*.095)} fontFamily="system-ui" opacity={0.16}>no GPS</text>
      </svg>
    );
  }

  try{
    const pts=normalizeRoute(route);
    if(pts.length<2)return null;
    let x0=pts[0].lon,x1=pts[0].lon,y0=pts[0].lat,y1=pts[0].lat;
    for(const p of pts){if(p.lon<x0)x0=p.lon;if(p.lon>x1)x1=p.lon;if(p.lat<y0)y0=p.lat;if(p.lat>y1)y1=p.lat;}
    const pad=10,dx=x1-x0||.001,dy=y1-y0||.001;
    const tx=lon=>pad+(lon-x0)/dx*(W-pad*2);
    const ty=lat=>pad+(y1-lat)/dy*(H-pad*2);
    const d=pts.map((p,i)=>(i===0?"M":"L")+tx(p.lon).toFixed(1)+","+ty(p.lat).toFixed(1)).join(" ");
    const p0=pts[0],pN=pts[pts.length-1];
    const pathLen=pts.reduce((tot,p,i)=>i===0?0:tot+Math.hypot(tx(p.lon)-tx(pts[i-1].lon),ty(p.lat)-ty(pts[i-1].lat)),0);
    const fid="rg"+glowColor.replace(/[^a-z0-9]/gi,"")+W;
    return(
      <svg width={W} height={H} viewBox={"0 0 "+W+" "+H} style={{display:"block"}}>
        <defs>
          <filter id={fid} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>
          </filter>
        </defs>
        {bgColor&&<rect width={W} height={H} fill={bgColor}/>}
        <path d={d} fill="none" stroke={glowColor} strokeWidth={10} opacity={0.18}
          filter={"url(#"+fid+")"} strokeLinecap="round" strokeLinejoin="round"/>
        <path d={d} fill="none" stroke={glowColor} strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round" opacity={0.92}
          strokeDasharray={pathLen.toFixed(1)}
          strokeDashoffset={drawn?0:pathLen.toFixed(1)}
          style={{transition:drawn?'stroke-dashoffset 1.3s cubic-bezier(.4,0,.2,1)':'none'}}/>
        <circle cx={tx(p0.lon)} cy={ty(p0.lat)} r={drawn?5:0} fill="#22c55e" opacity={0.9}
          style={{transition:'r .25s .5s ease'}}/>
        <circle cx={tx(p0.lon)} cy={ty(p0.lat)} r={drawn?9:0} fill="#22c55e" opacity={0.15}
          style={{transition:'r .25s .5s ease'}}/>
        <circle cx={tx(pN.lon)} cy={ty(pN.lat)} r={drawn?5:0} fill={glowColor} opacity={0.9}
          style={{transition:'r .25s 1.1s ease'}}/>
        <circle cx={tx(pN.lon)} cy={ty(pN.lat)} r={drawn?9:0} fill={glowColor} opacity={0.15}
          style={{transition:'r .25s 1.1s ease'}}/>
      </svg>
    );
  }catch(e){return null;}
}

