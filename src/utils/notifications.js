const NOTIF_LAST_KEY='rl_notif_last';
const NOTIF_ENABLED_KEY='rl_notif_enabled';

export const notifSupported=()=>'Notification' in window;
export const notifPermission=()=>notifSupported()?Notification.permission:'denied';
export const notifEnabled=()=>localStorage.getItem(NOTIF_ENABLED_KEY)==='1';
export const setNotifEnabled=v=>localStorage.setItem(NOTIF_ENABLED_KEY,v?'1':'0');

export async function requestNotifPermission(){
  if(!notifSupported())return'denied';
  const p=await Notification.requestPermission();
  if(p==='granted')setNotifEnabled(true);
  return p;
}

function showNotif(title,body){
  if(!notifSupported()||Notification.permission!=='granted')return;
  const opts={body,icon:'/icon-192.png',badge:'/icon-192.png',tag:'runlytics'};
  navigator.serviceWorker?.ready
    .then(sw=>sw.showNotification(title,opts))
    .catch(()=>{try{new Notification(title,opts);}catch{}});
}

export function checkAndNotify(acts,goals){
  if(!notifSupported()||Notification.permission!=='granted'||!notifEnabled())return;
  const _n=new Date();
  const today=_n.getFullYear()+'-'+String(_n.getMonth()+1).padStart(2,'0')+'-'+String(_n.getDate()).padStart(2,'0');
  if(localStorage.getItem(NOTIF_LAST_KEY)===today)return;
  localStorage.setItem(NOTIF_LAST_KEY,today);
  if(!acts.length)return;

  // Streak risk: has run recently but not today or yesterday
  const runDays=new Set(acts.map(a=>a.date).filter(Boolean));
  const d1=new Date();d1.setDate(d1.getDate()-1);
  const yesterday=d1.getFullYear()+'-'+String(d1.getMonth()+1).padStart(2,'0')+'-'+String(d1.getDate()).padStart(2,'0');
  const hasRecentRun=acts.some(a=>a.dateTs&&(Date.now()-a.dateTs)<7*86400000);
  if(hasRecentRun&&!runDays.has(today)&&!runDays.has(yesterday)){
    showNotif("Don't break the chain! 🔥","You haven't run in 2+ days. Let's go!");
    return;
  }

  // Weekly goal: nudge on Fri/Sat/Sun when close
  const dow=new Date().getDay();
  if(dow===5||dow===6||dow===0){
    const weekStart=new Date();
    weekStart.setHours(0,0,0,0);
    weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));
    const weekKm=acts.filter(a=>a.dateTs&&new Date(a.dateTs)>=weekStart).reduce((s,a)=>s+a.distanceKm,0);
    const target=goals?.weekly||40;
    const left=parseFloat((target-weekKm).toFixed(1));
    if(left>0&&left<=target*0.4){
      showNotif('Almost at your weekly goal! 🎯',`${left} km to go — finish strong!`);
    }
  }
}
