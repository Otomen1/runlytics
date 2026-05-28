const TIER_TRACKS=[
  {id:"distance",label:"Distance",thresholds:[10,25,50,100,200,350,500,750,1000,1500,2000,2500,3000,4000,5000,7500],unit:"km"},
  {id:"runs",label:"Runs",thresholds:[5,10,20,30,50,75,100,150,200,300,400,500,600,750,1000,1500],unit:"runs"},
  {id:"streak",label:"Streak",thresholds:[3,5,7,10,14,21,28,40,60,90,120,180,240,300,365,500],unit:"days"},
  {id:"elevation",label:"Elevation",thresholds:[500,1000,2500,5000,8000,12000,20000,30000,42000,60000,80000,100000,130000,160000,200000,250000],unit:"m"},
];
const TIER_NAMES=["Bronze I","Bronze II","Bronze III","Bronze IV","Silver I","Silver II","Silver III","Silver IV","Gold I","Gold II","Gold III","Gold IV","Platinum I","Platinum II","Platinum III","Elite"];
const TIER_COLS=["#cd7f32","#cd7f32","#cd7f32","#cd7f32","#94a3b8","#94a3b8","#94a3b8","#94a3b8","#f59e0b","#f59e0b","#f59e0b","#f59e0b","#e2e8f0","#e2e8f0","#e2e8f0","#f97316"];
const TRACK_META={distance:{icon:"🗺️"},runs:{icon:"👟"},streak:{icon:"🔥"},elevation:{icon:"⛰️"}};

export function getTierIcon(i){if(i<4)return"🥉";if(i<8)return"🥈";if(i<12)return"🥇";if(i<15)return"💎";return"👑";}

function BD(id,cat,icon,color,name,desc,check){return{id,cat,icon,color,name,desc,check};}
function BD(id,cat,icon,color,name,desc,check){return{id,cat,icon,color,name,desc,check};}
const BADGE_DEFS=[
