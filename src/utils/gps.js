import { normalizeRoute, migrateActivity, classifyRun } from './activity.js';
import { MAX_GPX_BYTES, MAX_GPX_POINTS, GPX_FALLBACK_SEC } from '../constants/limits.js';

export function readFileText(file){
  if(typeof file.text==='function')return file.text();
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=e=>resolve(e.target.result);
    reader.onerror=()=>reject(new Error('File read failed'));
    reader.readAsText(file,'UTF-8');
  });
}

export function parseGPX(xmlStr,fileName){
  const pfx=`[GPX:${fileName||'?'}]`;
  if(!xmlStr||typeof xmlStr!=="string"||xmlStr.length<30){console.warn(pfx,'empty/short input');return null;}
  if(xmlStr.length>MAX_GPX_BYTES){console.warn(pfx,'file >10MB');return null;}
  try{
    // Security model: DOMParser with "application/xml" parses the file as an XML
    // document, NOT as HTML. Scripts never execute; event attributes are inert XML
    // attributes. We then extract ONLY whitelisted elements (trkpt, rtept, wpt, name,
    // ele, time, hr, heartrate) via .textContent / .getAttribute() — never innerHTML.
    // The activity name is capped to 128 chars and treated as a plain string everywhere.
    const parser=new DOMParser();
    const doc=parser.parseFromString(xmlStr,"application/xml");
    const parseErr=doc.querySelector("parsererror");
    if(parseErr){console.error(pfx,'XML parse error:',parseErr.textContent?.slice(0,200));return null;}
    const nameFallback=fileName?fileName.replace(/\.gpx$/i,"").slice(0,128):"Activity";
    const name=(doc.querySelector("name")?.textContent?.trim()||nameFallback).slice(0,128);
    // iOS Safari DOMParser (application/xml) won't match namespaced elements via
    // querySelectorAll("trkpt") when the file has xmlns="…" — use getElementsByTagName
    // as a universal fallback (ignores namespace prefix, works on all platforms).
    let trkpts=Array.from(doc.querySelectorAll("trkpt,rtept,wpt"));
    const usedFallback=!trkpts.length;
    if(usedFallback){
      trkpts=[
        ...Array.from(doc.getElementsByTagName("trkpt")),
        ...Array.from(doc.getElementsByTagName("rtept")),
        ...Array.from(doc.getElementsByTagName("wpt")),
      ];
    }
    console.log(pfx,`${trkpts.length} trackpoints via ${usedFallback?'getElementsByTagName(fallback)':'querySelectorAll'}`);
    if(trkpts.length<2){console.warn(pfx,'<2 trackpoints — not a valid track');return null;}
    if(trkpts.length>MAX_GPX_POINTS){
      // Evenly downsample to avoid O(n) memory/CPU exhaustion on huge files
      const step=Math.ceil(trkpts.length/MAX_GPX_POINTS);
      trkpts=trkpts.filter((_,i)=>i%step===0||i===trkpts.length-1);
      console.warn(pfx,`Downsampled to ${trkpts.length} pts`);
    }
    // Namespace-safe child-element getter: querySelector first, then getElementsByTagName
    const gEl=(parent,tag)=>parent.querySelector(tag)||parent.getElementsByTagName(tag)[0]||null;
    const pts=[];let skipped=0;
    trkpts.forEach((pt,ptIdx)=>{
      const lat=parseFloat(pt.getAttribute("lat")||"");const lon=parseFloat(pt.getAttribute("lon")||"");
      if(!isFinite(lat)||!isFinite(lon)||lat<-90||lat>90||lon<-180||lon>180){skipped++;return;}
      const ele=parseFloat(gEl(pt,"ele")?.textContent||"0")||0;
      const timeEl=gEl(pt,"time");
      const timeMs=timeEl?new Date(timeEl.textContent?.trim()||"").getTime()||0:0;
      // HR: try multiple selectors individually — querySelector with namespaced colons
      // is unreliable on Android DOMParser; fall back to textContent scan
      let hr=null;
      const extEl=gEl(pt,"extensions");
      if(extEl){
        const hrTry=gEl(extEl,"hr")||gEl(extEl,"heartrate")||
          Array.from(extEl.querySelectorAll("*")).find(el=>el.localName==="hr"||el.localName==="heartrate");
        if(hrTry){const v=parseInt(hrTry.textContent);if(v>30&&v<250)hr=v;}
      }
      pts.push({lat,lon,ele,time:timeMs,hr,ptIdx});
    });
    if(skipped)console.warn(pfx,`${skipped} points skipped (invalid coords)`);
    if(pts.length<2){console.warn(pfx,`only ${pts.length} valid pts after coord filter`);return null;}
    // Build sec offsets: prefer timestamps; fall back to even spacing across 1 hour
    const validTimes=pts.filter(p=>p.time>0);
    const hasTimestamps=validTimes.length>=2;
    const t0=hasTimestamps?validTimes[0].time:0;
    pts.forEach((p,i)=>{
      p.sec=hasTimestamps&&p.time>0?Math.max(0,Math.round((p.time-t0)/1000)):Math.round(i/(pts.length-1)*GPX_FALLBACK_SEC);
    });
    const R=6371000;let distM=0,elevGain=0,elevLoss=0;
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i];
      const dLa=(b.lat-a.lat)*Math.PI/180,dLo=(b.lon-a.lon)*Math.PI/180;
      const q=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLo/2)*Math.sin(dLo/2);
      distM+=2*R*Math.asin(Math.sqrt(Math.max(0,q)));
      const de=b.ele-a.ele;if(de>0)elevGain+=de;else elevLoss+=Math.abs(de);
    }
    const distKm=distM/1000;
    const timeSec=hasTimestamps?Math.max(1,(pts[pts.length-1].sec||0)):GPX_FALLBACK_SEC;
    const paceSecKm=distKm>0?timeSec/distKm:0;
    const hrPts=pts.filter(p=>p.hr&&p.hr>40&&p.hr<220);
    const avgHR=hrPts.length?Math.round(hrPts.reduce((s,p)=>s+p.hr,0)/hrPts.length):null;
    const maxHR=hrPts.length?hrPts.reduce((m,p)=>p.hr>m?p.hr:m,0):null;
    const firstValidTime=validTimes.length?validTimes[0].time:0;
    const d=firstValidTime?new Date(firstValidTime):new Date();
    const dateStr=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const trainingLoad=timeSec&&avgHR?Math.round((timeSec/60)*(avgHR/100)*1.5):Math.round(distKm*8);
    const step=Math.max(1,Math.floor(pts.length/400));
    const route=pts.filter((_,i)=>i%step===0||i===pts.length-1).map(p=>({lat:p.lat,lon:p.lon,sec:p.sec,ele:p.ele}));
    const hrSamples=hrPts.filter((_,i)=>i%Math.max(1,Math.floor(hrPts.length/200))===0).map(p=>({sec:p.sec,hr:p.hr}));
    console.log(pfx,`✓ "${name}" | route:${route.length}pts | hr:${hrSamples.length}pts | ${distKm.toFixed(2)}km`);
    return migrateActivity({id:"g"+Date.now(),name,type:"Run",date:dateStr,dateTs:d.getTime(),
      distanceKm:parseFloat(distKm.toFixed(3)),movingTimeSec:Math.round(timeSec),
      avgPaceSecKm:parseFloat(paceSecKm.toFixed(1)),avgHR,maxHR,
      elevGainM:Math.round(elevGain),elevLossM:Math.round(elevLoss),
      runClass:classifyRun(distKm,paceSecKm),hrSamples,route,source:"gpx",trainingLoad});
  }catch(e){console.error('[GPX] exception:',e?.message||e);return null;}
}
