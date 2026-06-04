import React, { useMemo } from 'react';

const CELL=11,GAP=2,STEP=CELL+GAP;
const DAY_LABELS=['M','','W','','F','','S'];
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function kmToColor(km){
  if(!km)return'rgba(255,255,255,0.06)';
  if(km<3) return'rgba(249,115,22,0.28)';
  if(km<7) return'rgba(249,115,22,0.55)';
  if(km<12)return'rgba(249,115,22,0.82)';
  return'#f97316';
}

export function CalendarHeatmap({acts}){
  const{weeks,monthLabels}=useMemo(()=>{
    const dayMap={};
    acts.forEach(a=>{if(a.date)dayMap[a.date]=(dayMap[a.date]||0)+a.distanceKm;});
    // Start from Mon 52 weeks ago
    const today=new Date();today.setHours(0,0,0,0);
    const start=new Date(today);
    start.setDate(start.getDate()-364);
    const dow=(start.getDay()+6)%7;
    start.setDate(start.getDate()-dow);
    const allDays=[];
    for(let d=new Date(start);d<=today;d.setDate(d.getDate()+1)){
      const key=d.toISOString().slice(0,10);
      allDays.push({key,km:dayMap[key]||0});
    }
    const weeks=[];
    for(let i=0;i<allDays.length;i+=7)weeks.push(allDays.slice(i,i+7));
    const monthLabels=[];
    weeks.forEach((week,wi)=>{
      if(!week[0])return;
      const mo=parseInt(week[0].key.slice(5,7))-1;
      const prevMo=weeks[wi-1]?.[0]?parseInt(weeks[wi-1][0].key.slice(5,7))-1:-1;
      if(mo!==prevMo)monthLabels.push({wi,label:MONTHS[mo]});
    });
    return{weeks,monthLabels};
  },[acts]);

  const svgW=weeks.length*STEP+18;
  const svgH=7*STEP+18;

  return(
    <div style={{overflowX:'auto',overflowY:'hidden',paddingBottom:4}}>
      <svg width={svgW} height={svgH} style={{display:'block'}}>
        {monthLabels.map(({wi,label})=>(
          <text key={wi} x={18+wi*STEP} y={9} fontSize={8} fill="var(--tx3)" fontWeight={500}>{label}</text>
        ))}
        {DAY_LABELS.map((l,i)=>(
          <text key={i} x={0} y={18+i*STEP+CELL*0.8} fontSize={7} fill="var(--tx3)">{l}</text>
        ))}
        {weeks.map((week,wi)=>week.map((day,di)=>(
          <rect key={day.key} x={18+wi*STEP} y={18+di*STEP} width={CELL} height={CELL} rx={2} fill={kmToColor(day.km)}>
            {day.km>0&&<title>{day.key} · {day.km.toFixed(1)} km</title>}
          </rect>
        )))}
      </svg>
      <div style={{display:'flex',alignItems:'center',gap:4,marginTop:5,paddingLeft:18}}>
        <span style={{fontSize:'.6rem',color:'var(--tx3)'}}>Less</span>
        {[0,1.5,5,9,15].map((km,i)=>(
          <div key={i} style={{width:10,height:10,borderRadius:2,background:kmToColor(km)}}/>
        ))}
        <span style={{fontSize:'.6rem',color:'var(--tx3)'}}>More</span>
      </div>
    </div>
  );
}
