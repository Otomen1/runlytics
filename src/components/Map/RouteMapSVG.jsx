import React, { useState, useEffect, useRef, useMemo } from 'react';
import { normalizeRoute } from '../../utils/activity.js';
import { fmtKm, fmtPace } from '../../utils/formatters.js';

export function RouteMapSVG({route,act}){
  const[drawn,setDrawn]=useState(false);const[hov,setHov]=useState(null);
  const svgRef=useRef(null);const canvasRef=useRef(null);
  const cumDist=useMemo(()=>{
    if(!route||route.length<2)return[];const R=6371000;let c=0;const clean=normalizeRoute(route);
    return clean.map((p,i)=>{if(i>0){const a=clean[i-1],dLa=(p.lat-a.lat)*Math.PI/180,dLo=(p.lon-a.lon)*Math.PI/180;const q=Math.sin(dLa/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(p.lat*Math.PI/180)*Math.sin(dLo/2)**2;c+=2*R*Math.asin(Math.sqrt(Math.max(0,q)));}return c;});
  },[route]);
  const map=useMemo(()=>{
    if(!route||route.length<2)return null;
    const clean=normalizeRoute(route);
    if(clean.length<2)return null;
    const W=360,H=280;
    let minLat=clean[0].lat,maxLat=clean[0].lat,minLon=clean[0].lon,maxLon=clean[0].lon;
    for(let i=1;i<clean.length;i++){const p=clean[i];if(p.lat<minLat)minLat=p.lat;if(p.lat>maxLat)maxLat=p.lat;if(p.lon<minLon)minLon=p.lon;if(p.lon>maxLon)maxLon=p.lon;}
    const lonR=maxLon-minLon||.01;
    const tyOf=lat=>(1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2;
    const txOf=lon=>(lon+180)/360;
    const zoom=Math.max(10,Math.min(16,Math.round(Math.log2(1080/Math.max(lonR,.005)))));
    const n=Math.pow(2,zoom);
    const txMin=Math.floor(txOf(minLon)*n)-1,txMax=Math.floor(txOf(maxLon)*n)+1;
    const tyMin=Math.floor(tyOf(maxLat)*n)-1,tyMax=Math.floor(tyOf(minLat)*n)+1;
    const tW=txMax-txMin+1,tH=tyMax-tyMin+1;if(tW<=0||tH<=0)return null;
    const sc=Math.min(W/(tW*256),H/(tH*256));const ox=(W-tW*256*sc)/2,oy=(H-tH*256*sc)/2;
    const toSX=lon=>(txOf(lon)*n-txMin)*256*sc+ox;const toSY=lat=>(tyOf(lat)*n-tyMin)*256*sc+oy;
    const tiles=[];
    for(let ty=tyMin;ty<=tyMax;ty++)for(let tx=txMin;tx<=txMax;tx++)tiles.push({k:ty+","+tx,url:"https://tile.openstreetmap.org/"+zoom+"/"+tx+"/"+ty+".png",x:(tx-txMin)*256*sc+ox,y:(ty-tyMin)*256*sc+oy,sz:256*sc});
    const MAX=600;
    const sIdx=clean.length<=MAX?Array.from({length:clean.length},(_,i)=>i):Array.from({length:MAX},(_,i)=>Math.min(Math.round(i*(clean.length-1)/(MAX-1)),clean.length-1));
    if(clean.length>MAX&&sIdx[sIdx.length-1]!==clean.length-1)sIdx.push(clean.length-1);
    const spts=sIdx.map(i=>({sx:toSX(clean[i].lon),sy:toSY(clean[i].lat),ri:i}));
    if(spts.some(p=>!isFinite(p.sx)||!isFinite(p.sy)))return null;
    const d=spts.map((p,i)=>(i===0?"M":"L")+p.sx.toFixed(1)+","+p.sy.toFixed(1)).join(" ");
    const pLen=spts.reduce((t,p,i)=>i===0?0:t+Math.hypot(p.sx-spts[i-1].sx,p.sy-spts[i-1].sy),0);
    const col=act&&act.avgPaceSecKm<270?"#22c55e":"#f97316";
    const secCount=clean.filter(p=>typeof p.sec==='number'&&p.sec>=0).length;
    const hasSec=secCount>=Math.min(10,Math.ceil(clean.length*0.5));
    return{tiles,spts,d,pLen,col,s0:spts[0],sE:spts[spts.length-1],W,H,hasSec,clean};
  },[route,act]);
  useEffect(()=>{
    if(!map||!canvasRef.current)return;const canvas=canvasRef.current;const ctx=canvas.getContext("2d");
    ctx.fillStyle="#e8e4dc";ctx.fillRect(0,0,map.W,map.H);let active=true;
    map.tiles.forEach(t=>{const img=new Image();img.crossOrigin="anonymous";img.onload=()=>{if(active)ctx.drawImage(img,t.x,t.y,t.sz,t.sz);};img.src=t.url;});
    return()=>{active=false;};
  },[map]);
  useEffect(()=>{const t=setTimeout(()=>setDrawn(true),150);return()=>clearTimeout(t);},[]);
  if(!map)return<div style={{height:180,borderRadius:12,background:"var(--s2)",border:"1px solid var(--bd)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--tx3)",fontSize:".8rem"}}>No GPS route</div>;
  const{tiles,spts,d,pLen,col,s0,sE,W,H,hasSec,clean}=map;
  const avgMps=act&&act.distanceKm>0&&act.movingTimeSec>0?(act.distanceKm*1000)/act.movingTimeSec:null;
  const segColor=mps=>{if(!avgMps||!mps)return col;const r=mps/avgMps;return r>=1.08?'#22c55e':r>=0.92?'#f97316':'#ef4444';};
  const onMove=e=>{
    if(!svgRef.current)return;const rc=svgRef.current.getBoundingClientRect();
    const mx=(e.clientX-rc.left)*W/rc.width,my=(e.clientY-rc.top)*H/rc.height;
    let minD=Infinity,best=null;for(const p of spts){const d2=Math.hypot(p.sx-mx,p.sy-my);if(d2<minD){minD=d2;best=p;}}
    if(best&&minD<22){const km=((cumDist[best.ri]||0)/1000).toFixed(2);const ttx=Math.max(35,Math.min(W-35,best.sx));const tty=best.sy>46?best.sy-14:best.sy+26;setHov({x:best.sx,y:best.sy,ttx,tty,km});}else setHov(null);
  };
  return(
    <div>
    <div style={{position:"relative",borderRadius:hasSec?'12px 12px 0 0':12,overflow:"hidden",border:"1px solid #b8b0a4",boxShadow:"0 2px 14px rgba(0,0,0,.2)"}}>
      <canvas ref={canvasRef} width={W} height={H} style={{display:"block",width:"100%"}}/>
      <svg ref={svgRef} viewBox={"0 0 "+W+" "+H} style={{position:"absolute",inset:0,width:"100%",height:"100%",cursor:"crosshair"}} onMouseMove={onMove} onMouseLeave={()=>setHov(null)}>
        {hasSec?(
          spts.map((p,i)=>{
            if(i===0)return null;
            const ri0=spts[i-1].ri,ri1=p.ri;
            const distM=cumDist[ri1]-cumDist[ri0];
            const timeSec=(clean[ri1].sec??-1)-(clean[ri0].sec??-1);
            const mps=timeSec>0?distM/timeSec:avgMps;
            const clr=segColor(mps);
            return<g key={i}>
              <line x1={spts[i-1].sx} y1={spts[i-1].sy} x2={p.sx} y2={p.sy} stroke={clr} strokeWidth={7} strokeOpacity={0.22} strokeLinecap="round"/>
              <line x1={spts[i-1].sx} y1={spts[i-1].sy} x2={p.sx} y2={p.sy} stroke={clr} strokeWidth={3} strokeLinecap="round"/>
            </g>;
          })
        ):(
          <>
            <path d={d} fill="none" stroke={col} strokeWidth={9} strokeOpacity={0.25} strokeLinecap="round" strokeLinejoin="round"/>
            <path d={d} fill="none" stroke={col} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={pLen.toFixed(0)} strokeDashoffset={drawn?"0":pLen.toFixed(0)}
              style={{transition:"stroke-dashoffset 1.6s cubic-bezier(.4,0,.2,1)"}}/>
          </>
        )}
        <circle cx={s0.sx} cy={s0.sy} r={8} fill="#22c55e" stroke="#fff" strokeWidth={2.5}/>
        <text x={s0.sx} y={s0.sy+4} textAnchor="middle" fontSize={7} fill="#fff" fontWeight="800">S</text>
        <circle cx={sE.sx} cy={sE.sy} r={8} fill="#ef4444" stroke="#fff" strokeWidth={2.5}/>
        <text x={sE.sx} y={sE.sy+4} textAnchor="middle" fontSize={7} fill="#fff" fontWeight="800">F</text>
        {hov&&<g>
          <circle cx={hov.x} cy={hov.y} r={5} fill="#fff" stroke={col} strokeWidth={2.5}/>
          <rect x={hov.ttx-33} y={hov.tty-12} width={66} height={16} rx={8} fill="rgba(0,0,0,.84)" stroke={col+"70"} strokeWidth={1}/>
          <text x={hov.ttx} y={hov.tty} textAnchor="middle" fontSize={8.5} fill={col} fontWeight="700">{hov.km+" km"}</text>
        </g>}
        {act&&<g>
          <rect x={W/2-56} y={H-24} width={112} height={18} rx={9} fill="rgba(0,0,0,.72)"/>
          <text x={W/2} y={H-12} textAnchor="middle" fontSize={10} fill="#fff" fontWeight="700">{fmtKm(act.distanceKm)+" km · "+fmtPace(act.avgPaceSecKm)+"/km"}</text>
        </g>}
        <text x={W-5} y={H-3} textAnchor="end" fontSize={6} fill="rgba(0,0,0,.5)">© OpenStreetMap</text>
      </svg>
    </div>
    {hasSec&&<div style={{display:'flex',gap:14,justifyContent:'center',padding:'6px 0',fontSize:'.64rem',color:'var(--tx3)',borderRadius:'0 0 12px 12px',border:'1px solid #b8b0a4',borderTop:'none',background:'var(--s2)'}}>
      {[['#22c55e','Faster'],['#f97316','Average'],['#ef4444','Slower']].map(([c,l])=>(
        <span key={l} style={{display:'flex',alignItems:'center',gap:4}}><span style={{color:c,fontSize:'.8rem'}}>●</span>{l}</span>
      ))}
    </div>}
    </div>
  );
}

