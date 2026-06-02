export function fmtKm(km){if(km==null||!isFinite(+km))return"0";return parseFloat((+km).toFixed(2)).toString();}
export function fmtPace(secPerKm){if(!secPerKm||!isFinite(secPerKm)||secPerKm<=0||secPerKm>3600)return"--:--";const m=Math.floor(secPerKm/60),s=Math.round(secPerKm%60);return m+":"+(s<10?"0":"")+s;}
export function fmtDur(sec){if(!sec||!isFinite(sec))return"0:00";const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=Math.floor(sec%60);if(h>0)return h+":"+(m<10?"0":"")+m+":"+(s<10?"0":"")+s;return m+":"+(s<10?"0":"")+s;}
export function fmtDate(str){if(!str)return"";try{const d=new Date(str);if(!isFinite(d.getTime()))return str;return d.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});}catch(e){return str;}}
export function fmtDateS(str){if(!str)return"";try{const d=new Date(str);if(!isFinite(d.getTime()))return str;return d.toLocaleDateString("en-US",{month:"short",day:"numeric"});}catch(e){return str;}}
export function fmtRaceTime(sec){return fmtDur(sec);}
export function weekOf(ts){const d=new Date(ts);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.toISOString().slice(0,10);}
export function monthOf(ts){return new Date(ts).toISOString().slice(0,7);}
export function greet(){const h=new Date().getHours();if(h<12)return"Good morning";if(h<18)return"Good afternoon";return"Good evening";}
export function todayKey(){return new Date().toISOString().slice(0,10);}
