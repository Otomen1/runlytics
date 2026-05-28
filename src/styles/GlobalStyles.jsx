import React from 'react';
export const Styles=()=><style>{`
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#06080f;color:#d8e6f7;-webkit-font-smoothing:antialiased;line-height:1.5;}
:root{
  --bg:#06080f;--s1:#0b0f1a;--s2:#101622;--s3:#141c2a;--bd:#1c2538;--bd2:#232f48;
  --or:#f97316;--or2:rgba(249,115,22,.14);--or3:rgba(249,115,22,.07);
  --gn:#22c55e;--gn2:rgba(34,197,94,.13);--rd:#ef4444;--rd2:rgba(239,68,68,.12);
  --bl:#3b82f6;--yw:#eab308;--tx:#d8e6f7;--tx2:#6e8aab;--tx3:#4a6580;
  --r-sm:10px;--r-md:12px;--r-lg:14px;--r-xl:18px;
  /* Typography scale */
  --fs-xs:.72rem;--fs-sm:.8rem;--fs-base:.88rem;
  --fs-lg:1.05rem;--fs-xl:1.25rem;--fs-2xl:1.5rem;
  /* Spacing rhythm */
  --gap-card:14px;--pad-card:16px;
}
::-webkit-scrollbar{width:0;}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes tabIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes pop{0%{transform:scale(.5);opacity:0}70%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.a0{animation:fadeUp .24s ease both}.a1{animation:fadeUp .24s .05s ease both}.a2{animation:fadeUp .24s .1s ease both}.a3{animation:fadeUp .24s .15s ease both}
.tab-in{animation:tabIn .18s cubic-bezier(.4,0,.2,1) both}
.card{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r-lg);transition:border-color .18s;}
.card2{background:var(--s2);border:1px solid var(--bd);border-radius:var(--r-lg);transition:border-color .18s;}
@media(hover:hover){.card:hover{border-color:var(--bd2);}.card2:hover{border-color:var(--bd2);}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:none;border-radius:var(--r-lg);font-family:inherit;font-weight:600;cursor:pointer;transition:opacity .15s,transform .12s,box-shadow .15s;white-space:nowrap;font-size:.84rem;}
.btn:active{opacity:.78;transform:scale(.965);}
.btn:disabled,.btn[disabled]{opacity:.38;cursor:not-allowed;pointer-events:none;transform:none;}
.b-or{background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;box-shadow:0 2px 12px rgba(249,115,22,.25);}
@media(hover:hover){.b-or:hover{box-shadow:0 4px 20px rgba(249,115,22,.42);transform:translateY(-1px);}}
.b-gh{background:var(--s2);color:var(--tx2);border:1px solid var(--bd2);transition:opacity .15s,transform .12s,background .15s,border-color .15s,color .15s;}
@media(hover:hover){.b-gh:hover{background:var(--s3);border-color:rgba(255,255,255,.14);color:var(--tx);}}
.b-rd{background:var(--rd2);color:var(--rd);border:1px solid rgba(239,68,68,.2);transition:opacity .15s,transform .12s,background .15s;}
@media(hover:hover){.b-rd:hover{background:rgba(239,68,68,.18);border-color:rgba(239,68,68,.3);}}
.share-close{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.7);width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-family:inherit;font-size:.82rem;transition:background .15s,transform .12s;}
.share-close:active{background:rgba(255,255,255,.2);transform:scale(.92);}
@media(hover:hover){.share-close:hover{background:rgba(255,255,255,.16);}}
.inp{width:100%;background:var(--s2);border:1.5px solid var(--bd);border-radius:var(--r-md);color:var(--tx);font-family:inherit;font-size:.88rem;padding:12px 14px;outline:none;transition:border-color .15s;}
.inp:focus{border-color:var(--or);box-shadow:0 0 0 3px rgba(249,115,22,.1);}
.tab-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:9px 2px 10px;border:none;background:transparent;color:var(--tx3);cursor:pointer;font-size:.62rem;font-weight:600;font-family:inherit;letter-spacing:.04em;text-transform:uppercase;position:relative;transition:color .18s;-webkit-tap-highlight-color:transparent;}
.tab-btn.on{color:var(--or);}
.tab-btn::after{content:'';position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:2px;border-radius:1px;background:var(--or);transition:width .22s cubic-bezier(.4,0,.2,1);}
.tab-btn.on::after{width:22px;}
.sl{font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--tx3);}
.pb{height:6px;background:var(--bd);border-radius:3px;overflow:hidden;}
.pf{height:100%;border-radius:3px;transition:width .85s cubic-bezier(.4,0,.2,1);}
.chart-tip{background:var(--s1);border:1px solid var(--bd2);border-radius:var(--r-sm);padding:8px 12px;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.4);}
.chart-tip-val{font-weight:700;font-size:.88rem;color:var(--or);}
.chart-tip-sub{font-size:.66rem;color:var(--tx3);margin-top:2px;}
.glass{background:rgba(6,8,14,.92);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.05);}
.tap{cursor:pointer;transition:opacity .15s,transform .12s;-webkit-tap-highlight-color:transparent;}.tap:active{opacity:.72;transform:scale(.98);}
@media(hover:hover){.tap:hover{opacity:.88;}}
.dz{border:2px dashed var(--bd2);border-radius:var(--r-lg);transition:all .2s;}
.dz.ov{border-color:var(--or);background:var(--or3);}
.scroll-x{overflow-x:auto;scrollbar-width:none;}.scroll-x::-webkit-scrollbar{display:none;}
.pill{display:inline-flex;align-items:center;padding:4px 10px;border-radius:20px;border:1px solid var(--bd);background:transparent;cursor:pointer;font-size:.7rem;font-family:inherit;font-weight:500;transition:all .15s;-webkit-tap-highlight-color:transparent;}
.pill.on{background:var(--or3);border-color:var(--or);color:var(--or);font-weight:700;}
@media(hover:hover){.pill:hover:not(.on){border-color:var(--bd2);background:var(--s2);}}
@keyframes cardEntrance{from{opacity:0;transform:translateY(18px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes floatCard{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes successPop{0%{transform:scale(.97)}35%{transform:scale(1.05)}100%{transform:scale(1)}}
@keyframes bounceIn{0%{transform:scale(.35);opacity:0}60%{transform:scale(1.14)}100%{transform:scale(1);opacity:1}}
@keyframes slideDown{from{opacity:0;transform:translateY(-7px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideUp2{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.card-entrance{animation:cardEntrance .38s cubic-bezier(.34,1.56,.64,1) both}
.float-card{animation:floatCard 4s ease-in-out infinite}
.slide-down{animation:slideDown .22s ease both}
.slide-up2{animation:slideUp2 .24s ease both}
.success-pop{animation:successPop .4s ease}
.bounce-in{animation:bounceIn .45s cubic-bezier(.34,1.56,.64,1)}
@keyframes slideUpSheet{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes fadeOverlay{from{opacity:0}to{opacity:1}}
.sheet{animation:slideUpSheet .28s cubic-bezier(.32,.72,0,1) both}
.fade-overlay{animation:fadeOverlay .2s ease both}
.spinner{width:16px;height:16px;border-radius:50%;border:2px solid var(--bd2);border-top-color:var(--or);animation:spin .75s linear infinite;flex-shrink:0;display:inline-block}
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:0.01ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important;}
  .pf{transition:none!important;}
}
.coach-body{overflow:hidden;max-height:0;opacity:0;transition:max-height .24s ease,opacity .2s ease;}
.coach-body.open{max-height:120px;opacity:1;}
.icon-wrap{display:flex;align-items:center;justify-content:center;flex-shrink:0;border-radius:var(--r-md);}
.screen-title{font-weight:700;font-size:var(--fs-lg);}
.run-card{display:flex;align-items:center;background:var(--s2);border:1px solid var(--bd);border-radius:var(--r-lg);padding:13px 13px;margin-bottom:9px;cursor:pointer;transition:border-color .18s,background .18s;-webkit-tap-highlight-color:transparent;}
.run-card:active{background:var(--s3);transform:scale(.99);}
@media(hover:hover){.run-card:hover{border-color:var(--bd2);background:var(--s3);}}
`}</style>;
