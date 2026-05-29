export const TIER_TRACKS=[
  {id:"distance",label:"Distance",thresholds:[10,25,50,100,200,350,500,750,1000,1500,2000,2500,3000,4000,5000,7500],unit:"km"},
  {id:"runs",label:"Runs",thresholds:[5,10,20,30,50,75,100,150,200,300,400,500,600,750,1000,1500],unit:"runs"},
  {id:"streak",label:"Streak",thresholds:[3,5,7,10,14,21,28,40,60,90,120,180,240,300,365,500],unit:"days"},
  {id:"elevation",label:"Elevation",thresholds:[500,1000,2500,5000,8000,12000,20000,30000,42000,60000,80000,100000,130000,160000,200000,250000],unit:"m"},
];

export const TIER_NAMES=["Bronze I","Bronze II","Bronze III","Bronze IV","Silver I","Silver II","Silver III","Silver IV","Gold I","Gold II","Gold III","Gold IV","Platinum I","Platinum II","Platinum III","Elite"];
export const TIER_COLS=["#cd7f32","#cd7f32","#cd7f32","#cd7f32","#94a3b8","#94a3b8","#94a3b8","#94a3b8","#f59e0b","#f59e0b","#f59e0b","#f59e0b","#e2e8f0","#e2e8f0","#e2e8f0","#f97316"];
export const TRACK_META={distance:{icon:"🗺️"},runs:{icon:"👟"},streak:{icon:"🔥"},elevation:{icon:"⛰️"}};

export function getTierIcon(i){if(i<4)return"🥉";if(i<8)return"🥈";if(i<12)return"🥇";if(i<15)return"💎";return"👑";}

// BD is an internal helper only used to build BADGE_DEFS below
function BD(id,cat,icon,color,name,desc,check){return{id,cat,icon,color,name,desc,check};}

export const BADGE_DEFS=[
  BD("first_run","milestone","🏃","#f97316","First Steps","Complete your first run.",a=>a.length>=1),
  BD("km_10","distance","📍","#3b82f6","10 Kilometres","Run 10km total.",a=>a.reduce((s,r)=>s+r.distanceKm,0)>=10),
  BD("km_50","distance","🛣️","#3b82f6","50 Kilometres","Run 50km total.",a=>a.reduce((s,r)=>s+r.distanceKm,0)>=50),
  BD("km_100","distance","🌍","#3b82f6","Century Club","Run 100km total.",a=>a.reduce((s,r)=>s+r.distanceKm,0)>=100),
  BD("km_500","distance","🌎","#3b82f6","500km Warrior","Run 500km total.",a=>a.reduce((s,r)=>s+r.distanceKm,0)>=500),
  BD("runs_10","milestone","⭐","#eab308","10 Runs","Complete 10 runs.",a=>a.length>=10),
  BD("runs_50","milestone","🌟","#eab308","50 Runs","Complete 50 runs.",a=>a.length>=50),
  BD("runs_100","milestone","🏆","#eab308","100 Runs","Complete 100 runs.",a=>a.length>=100),
  BD("streak_3","streak","🔥","#ef4444","On Fire","Run 3+ days in a row.",
    a=>{const s=new Set(a.map(r=>new Date(r.dateTs).toDateString()));let c=0;const t=new Date();t.setHours(0,0,0,0);for(let i=0;i<100;i++){const d=new Date(t);d.setDate(d.getDate()-i);if(s.has(d.toDateString()))c++;else if(i>0)break;}return c>=3;}),
  BD("streak_7","streak","🧨","#ef4444","Week Warrior","Run 7+ days in a row.",
    a=>{const s=new Set(a.map(r=>new Date(r.dateTs).toDateString()));let c=0;const t=new Date();t.setHours(0,0,0,0);for(let i=0;i<200;i++){const d=new Date(t);d.setDate(d.getDate()-i);if(s.has(d.toDateString()))c++;else if(i>0)break;}return c>=7;}),
  BD("long_10","distance","🚗","#8b5cf6","10K Finisher","Run 10km in one go.",a=>a.some(r=>r.distanceKm>=10)),
  BD("long_21","distance","🏅","#8b5cf6","Half Marathon","Run 21km+ in one go.",a=>a.some(r=>r.distanceKm>=21)),
  BD("long_42","distance","🥇","#8b5cf6","Marathoner","Run 42km in one go.",a=>a.some(r=>r.distanceKm>=42)),
  BD("early_bird","habit","🌇","#f59e0b","Early Bird","Run before 7 AM.",a=>a.some(r=>{const h=new Date(r.dateTs).getHours();return h<7;})),
  BD("night_owl","habit","🌙","#a855f7","Night Owl","Run after 9 PM.",a=>a.some(r=>{const h=new Date(r.dateTs).getHours();return h>=21;})),
  BD("consistent_4","consistency","📅","#3b82f6","Consistent","Run in 4+ different weeks.",a=>new Set(a.map(r=>{const d=new Date(r.dateTs);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.toDateString();})).size>=4),
  BD("elevation_1000","elevation","⛰️","#22c55e","Mountain Climber","Climb 1000m total.",a=>a.reduce((s,r)=>s+(r.elevGainM||0),0)>=1000),
  BD("maf_master","training","🧠","#f97316","MAF Master","Run 10 times with HR data.",a=>a.filter(r=>r.avgHR&&r.hrSamples&&r.hrSamples.length>0).length>=10),
];

export function computeEarnedBadges(acts){return BADGE_DEFS.filter(b=>{try{return b.check(acts);}catch(e){return false;}}).map(b=>b.id);}
