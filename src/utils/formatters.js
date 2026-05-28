export function fmtKm(km){return km==null?"0":parseFloat((+km).toFixed(2)).toString();}
export function fmtPace(secPerKm){if(!secPerKm||!isFinite(secPerKm)||secPerKm<=0)return"--:--";const m=Math.floor(secPerKm/60),s=Math.round(secPerKm%60);return m+":"+(s<10?"0":"")+s;}
export function fmtDur(sec){if(!sec||!isFinite(sec))return"0:00";const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=Math.floor(sec%60);if(h>0)return h+":"+(m<10?"0":"")+m+":"+(s<10?"0":"")+s;return m+":"+(s<10?"0":"")+s;}
export function fmtDate(str){if(!str)return"";try{const d=new Date(str);if(!isFinite(d.getTime()))return str;return d.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});}catch(e){return str;}}
export function fmtDateS(str){if(!str)return"";try{const d=new Date(str);if(!isFinite(d.getTime()))return str;return d.toLocaleDateString("en-US",{month:"short",day:"numeric"});}catch(e){return str;}}
export function fmtRaceTime(sec){return fmtDur(sec);}
export function weekOf(ts){const d=new Date(ts);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.toISOString().slice(0,10);}
export function monthOf(ts){return new Date(ts).toISOString().slice(0,7);}
export function greet(){const h=new Date().getHours();if(h<12)return"Good morning";if(h<18)return"Good afternoon";return"Good evening";}

const ACT_ICN={"Run":"🏃","Walk":"🚶","Hike":"⛰️","TrailRun":"🌳","VirtualRun":"💻"};
const ACT_CLR={"Run":"var(--or)","Walk":"var(--gn)","Hike":"#8b5cf6","TrailRun":"#14b8a6","VirtualRun":"var(--bl)"};
const IC={"rest":"var(--gn)","easy":"var(--or)","workout":"var(--rd)","long":"var(--bl)"};
const IC_BG={"rest":"rgba(34,197,94,.08)","easy":"rgba(249,115,22,.06)","workout":"rgba(239,68,68,.08)","long":"rgba(59,130,246,.08)"};
const IC_BD={"rest":"rgba(34,197,94,.18)","easy":"rgba(249,115,22,.15)","workout":"rgba(239,68,68,.18)","long":"rgba(59,130,246,.18)"};
export function classifyRun(distKm,paceSecKm){if(distKm>=15)return"long";if(paceSecKm&&paceSecKm<320)return"workout";return"easy";}

// FIX #6: Accept optional fileName as fallback name when GPX has no <name> element
