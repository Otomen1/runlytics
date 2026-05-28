export const ACT_ICN={"Run":"🏃","Walk":"🚶","Hike":"⛰️","TrailRun":"🌳","VirtualRun":"💻"};
export const ACT_CLR={"Run":"var(--or)","Walk":"var(--gn)","Hike":"#8b5cf6","TrailRun":"#14b8a6","VirtualRun":"var(--bl)"};
export const IC_BD={"rest":"rgba(34,197,94,.18)","easy":"rgba(249,115,22,.15)","workout":"rgba(239,68,68,.18)","long":"rgba(59,130,246,.18)"};
export 
export 
export // FIX #6: Accept optional fileName as fallback name when GPX has no <name> element
export function classifyRun(distKm,paceSecKm){if(distKm>=15)return"long";if(paceSecKm&&paceSecKm<320)return"workout";return"easy";}
