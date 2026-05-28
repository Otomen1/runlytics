import React from 'react';
export function Ring({pct=0,size=64,color="var(--or)",children,sw=7}){
  const r=(size-sw)/2,c=2*Math.PI*r,off=c*(1-Math.min(1,Math.max(0,pct)));const done=pct>=1;
  return(
    <div style={{position:"relative",width:size,height:size,flexShrink:0,transition:"transform .3s cubic-bezier(.34,1.56,.64,1)",transform:done?"scale(1.06)":"scale(1)"}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bd)" strokeWidth={sw}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={pct>0?color:"var(--bd)"} strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          style={{transition:"stroke-dashoffset 1s cubic-bezier(.4,0,.2,1),stroke .3s ease"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>{children}</div>
    </div>
  );
}

