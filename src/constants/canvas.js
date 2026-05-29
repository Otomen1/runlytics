export const PRESET_BGS=[
  {id:"night",css:"linear-gradient(155deg,#0f0c29,#302b63,#24243e)"},
  {id:"sunrise",css:"linear-gradient(155deg,#1a0533,#8b1a4a 45%,#fc4a1a 80%,#f7971e)"},
  {id:"forest",css:"linear-gradient(155deg,#0f2027,#203a43,#2c5364)"},
  {id:"storm",css:"linear-gradient(155deg,#141e30,#243b55)"},
  {id:"ember",css:"linear-gradient(155deg,#0d0d0d,#3d1200)"},
  {id:"dusk",css:"linear-gradient(155deg,#2d1b69,#11998e)"},
];

export const SHARE_UI={
  shell:      {position:"fixed",inset:0,zIndex:420,background:"#060810",display:"flex",flexDirection:"column",overscrollBehavior:"contain"},
  carousel:   {flex:1,display:"flex",overflowX:"auto",scrollSnapType:"x mandatory",
    scrollbarWidth:"none",WebkitOverflowScrolling:"touch",alignItems:"center",paddingTop:8},
  slide:      {minWidth:"100%",scrollSnapAlign:"center",display:"flex",
    alignItems:"center",justifyContent:"center",padding:"0 20px",boxSizing:"border-box"},
  footer:     {padding:"18px 20px 30px",flexShrink:0},
  skeleton:   {width:270,height:480,borderRadius:20,background:"rgba(255,255,255,.04)",
    border:"1px solid rgba(255,255,255,.06)"},
  dot:        (active)=>({width:active?22:6,height:6,borderRadius:3,
    background:active?"#f97316":"rgba(255,255,255,.18)",
    transition:"all .3s cubic-bezier(.4,0,.2,1)"}),
};

export const SHARE_TEMPLATES=[
  {id:"velocity",  label:"Velocity",   sub:"Clean editorial"},
  {id:"raceday",   label:"Race Day",   sub:"Route art"},
  {id:"endurance", label:"Endurance",  sub:"Cinematic poster"},
  {id:"cinematic", label:"Cinematic",  sub:"Atmospheric"},
  {id:"glass",     label:"Glass",      sub:"Frosted luxury"},
];

export const EDITOR_PRESETS_KEY = 'runlytics_share_presets_v1';

export const ACCENT_PRESETS = ['#f97316','#22c55e','#3b82f6','#a855f7','#ef4444','#eab308','#06b6d4','#ec4899','#ffffff'];
export const BG_PRESETS     = ['#060810','#0a0c14','#111827','#0d0520','#050505','#1a0a30','#0a1628','#faf8f4'];
export const EDITOR_DEFAULTS = {
  bg: {
    type: 'color', color: '#060810',
    gradAngle: 155, gradStop1: '#0d0520', gradStop2: '#1a0835',
    imageData: null, imageX: 50, imageY: 50, imageZoom: 100,
    blur: 0, brightness: 100, overlayColor: '#000000', overlayOpacity: 0,
  },
  fx: {
    vignette: 0.35, grain: 0,
    glowActive: false, glowColor: '#f97316',
    glowX: 50, glowY: 65, glowRadius: 45, glowOpacity: 0.2,
  },
  elements: {
    route:    { x: 50, y: 26, scale: 1,    visible: true  },
    distance: { x: 50, y: 61, scale: 1,    visible: true  },
    stats:    { x: 50, y: 75, scale: 1,    visible: true  },
    name:     { x: 50, y: 84, scale: 0.9,  visible: true  },
    branding: { x: 8,  y: 6,  scale: 1,    visible: true  },
  },
  style: { accentColor: '#f97316', textColor: '#ffffff' },
};

export const ELEMENT_META = {
  route:    { label:'Route Map', icon:'🗺️' },
  distance: { label:'Distance',  icon:'📍' },
  stats:    { label:'Stats',     icon:'📊' },
  name:     { label:'Run Name',  icon:'✏️' },
  branding: { label:'Branding',  icon:'⚡' },
};
