export function fmtKm(km){if(km==null||!isFinite(+km)||+km<0)return"0";return parseFloat((+km).toFixed(2)).toString();}
export function fmtPace(secPerKm){if(!secPerKm||!isFinite(secPerKm)||secPerKm<=0||secPerKm>3600)return"--:--";const m=Math.floor(secPerKm/60),s=Math.round(secPerKm%60);return m+":"+(s<10?"0":"")+s;}
export function fmtDur(sec){if(!sec||!isFinite(sec)||sec<0)return"0:00";const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=Math.floor(sec%60);if(h>0)return h+":"+(m<10?"0":"")+m+":"+(s<10?"0":"")+s;return m+":"+(s<10?"0":"")+s;}
export function fmtDate(str){if(!str)return"";try{const d=new Date(str);if(!isFinite(d.getTime()))return str;return d.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});}catch(e){return str;}}
export function fmtDateS(str){if(!str)return"";try{const d=new Date(str);if(!isFinite(d.getTime()))return str;return d.toLocaleDateString("en-US",{month:"short",day:"numeric"});}catch(e){return str;}}
export function fmtRaceTime(sec){return fmtDur(sec);}
function localDateStr(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
export function weekOf(ts){const d=new Date(ts);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return localDateStr(d);}
export function monthOf(ts){const d=new Date(ts);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
export function greet(){const h=new Date().getHours();if(h<12)return"Good morning";if(h<18)return"Good afternoon";return"Good evening";}
export function todayKey(){return localDateStr(new Date());}
export function parseDurSec(str){const p=String(str).trim().split(':').map(Number);if(p.some(isNaN))return 0;if(p.length===3)return p[0]*3600+p[1]*60+p[2];if(p.length===2)return p[0]*60+p[1];return p[0]||0;}
