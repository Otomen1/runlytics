import { normalizeRoute } from './activity.js';
import { fmtKm, fmtDur, fmtPace } from './formatters.js';

export const CANVAS_TYPE = {
  hero:    { ratio: 0.11,  weight: 'bold', family: 'system-ui' }, // big distance number
  unit:    { ratio: 0.026, weight: 600,    family: 'system-ui' }, // "KM" unit label
  title:   { ratio: 0.022, weight: 600,    family: 'system-ui' }, // activity name
  brand:   { ratio: 0.016, weight: 'bold', family: 'system-ui' }, // RUNLYTICS wordmark
  caption: { ratio: 0.016, weight: 400,    family: 'system-ui' }, // date · pace line
};

export const CANVAS_LAYOUT = {
  padX:     0.07,   // horizontal padding (fraction of W)
  brandY:   0.068,  // RUNLYTICS baseline (fraction of H)
  heroY:    0.45,   // distance number baseline
  unitY:    0.48,   // "KM" baseline
  divX:     0.20,   // divider left edge (fraction of W)
  divY:     0.52,   // divider Y
  divW:     0.60,   // divider width (fraction of W)
  nameY:    0.58,   // activity name baseline
  captionY: 0.62,   // date/pace baseline
  routeH:   0.55,   // route occupies top fraction of H
};

export const EXPORT_CONFIG = { W: 1080, H: 1920, quality: 0.92 };

export function hexToRgba(hex, alpha) {
  const h = (hex||'#000000').replace('#','');
  const r = parseInt(h.slice(0,2),16)||0;
  const g = parseInt(h.slice(2,4),16)||0;
  const b = parseInt(h.slice(4,6),16)||0;
  return `rgba(${r},${g},${b},${+alpha||0})`;
}

export function drawRouteCanvas(ctx,route,ox,oy,W,H){
  if(!route||route.length<2)return;
  try{
    const pts=normalizeRoute(route);if(pts.length<2)return;
    let x0=pts[0].lon,x1=pts[0].lon,y0=pts[0].lat,y1=pts[0].lat;
    for(const p of pts){if(p.lon<x0)x0=p.lon;if(p.lon>x1)x1=p.lon;if(p.lat<y0)y0=p.lat;if(p.lat>y1)y1=p.lat;}
    const pad=16,dx=x1-x0||.001,dy=y1-y0||.001;
    const tx=lon=>ox+pad+(lon-x0)/dx*(W-pad*2);const ty=lat=>oy+pad+(y1-lat)/dy*(H-pad*2);
    const step=Math.max(1,Math.floor(pts.length/150));
    const sp=pts.filter((_,i)=>i%step===0||i===pts.length-1);
    ctx.beginPath();sp.forEach((p,i)=>i===0?ctx.moveTo(tx(p.lon),ty(p.lat)):ctx.lineTo(tx(p.lon),ty(p.lat)));
    ctx.strokeStyle="rgba(249,115,22,0.7)";ctx.lineWidth=2;ctx.lineCap="round";ctx.stroke();
  }catch(e){}
}

export function cFont(H, key) {
  const t = CANVAS_TYPE[key];
  return `${t.weight} ${Math.round(H * t.ratio)}px ${t.family}`;
}

export function cDrawBg(ctx, W, H, color) {
  ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
}

export function cDrawBranding(ctx, W, H, color) {
  ctx.save();
  ctx.fillStyle = color; ctx.textAlign = 'left';
  ctx.font = cFont(H, 'brand');
  ctx.fillText('RUNLYTICS', W * CANVAS_LAYOUT.padX, H * CANVAS_LAYOUT.brandY);
  ctx.restore();
}

export function cDrawHero(ctx, W, H, dist, fg, accent) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = accent; ctx.font = cFont(H, 'hero');
  ctx.fillText(dist, W / 2, H * CANVAS_LAYOUT.heroY);
  ctx.fillStyle = fg; ctx.font = cFont(H, 'unit');
  ctx.fillText('KM', W / 2, H * CANVAS_LAYOUT.unitY);
  ctx.restore();
}

export function cDrawDivider(ctx, W, H, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(W * CANVAS_LAYOUT.divX, H * CANVAS_LAYOUT.divY, W * CANVAS_LAYOUT.divW, 2);
  ctx.restore();
}

export function cDrawTitle(ctx, W, H, name, color) {
  ctx.save();
  ctx.fillStyle = color; ctx.textAlign = 'center';
  ctx.font = cFont(H, 'title');
  ctx.fillText(name.substring(0, 28), W / 2, H * CANVAS_LAYOUT.nameY);
  ctx.restore();
}

export function cDrawCaption(ctx, W, H, text, color) {
  ctx.save();
  ctx.fillStyle = color; ctx.textAlign = 'center';
  ctx.font = cFont(H, 'caption');
  ctx.fillText(text, W / 2, H * CANVAS_LAYOUT.captionY);
  ctx.restore();
}

export function cDrawVignette(ctx,W,H,intensity=0.55){
  const vg=ctx.createRadialGradient(W/2,H/2,H*0.2,W/2,H/2,H*0.85);
  vg.addColorStop(0,'transparent'); vg.addColorStop(1,`rgba(0,0,0,${intensity})`);
  ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);
}

export function cDrawRadialGlow(ctx,cx,cy,r,color){
  const gl=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
  gl.addColorStop(0,color); gl.addColorStop(1,'transparent');
  ctx.fillStyle=gl; ctx.fillRect(Math.max(0,cx-r),Math.max(0,cy-r),r*2,r*2);
}

export function cDrawLinGrad(ctx,W,H,x0,y0,x1,y1,stops){
  const gr=ctx.createLinearGradient(x0,y0,x1,y1);
  stops.forEach(([p,c])=>gr.addColorStop(p,c));
  ctx.fillStyle=gr; ctx.fillRect(0,0,W,H);
}

export function cRenderVelocity(ctx,act,W,H){
  cDrawBg(ctx,W,H,'#faf8f4');
  cDrawLinGrad(ctx,W,H, 0,H*0.55,0,H, [[0,'transparent'],[1,'rgba(249,115,22,.07)']]);
  cDrawBranding(ctx,W,H,'rgba(0,0,0,.2)');
  // Distance hero
  ctx.save(); ctx.textAlign='center';
  ctx.fillStyle='#0a0a0a'; ctx.font=cFont(H,'hero');
  ctx.fillText(fmtKm(act.distanceKm),W/2,H*CANVAS_LAYOUT.heroY);
  ctx.fillStyle='rgba(0,0,0,.28)'; ctx.font=`600 ${Math.round(H*.018)}px system-ui`;
  ctx.fillText('KILOMETRES',W/2,H*(CANVAS_LAYOUT.unitY+.008));
  ctx.restore();
  // Asymmetric accent rule
  const px=W*CANVAS_LAYOUT.padX;
  ctx.fillStyle='#f97316'; ctx.fillRect(px,H*CANVAS_LAYOUT.divY,W*0.09,3);
  ctx.fillStyle='rgba(0,0,0,.08)'; ctx.fillRect(px+W*0.104,H*CANVAS_LAYOUT.divY,W*0.563,1);
  // Run name — left-aligned
  ctx.save(); ctx.textAlign='left'; ctx.fillStyle='rgba(0,0,0,.62)'; ctx.font=cFont(H,'title');
  ctx.fillText((act.name||'Run').substring(0,26),px,H*CANVAS_LAYOUT.nameY);
  ctx.restore();
  // Stats row — DURATION and PACE (mirrors React StatRow)
  const rX=W*(1-CANVAS_LAYOUT.padX);
  const vF=`700 ${Math.round(H*.025)}px monospace`;
  const lF=`600 ${Math.round(H*.013)}px system-ui`;
  [[H*0.638,'DURATION',fmtDur(act.movingTimeSec)],[H*0.682,'PACE',fmtPace(act.avgPaceSecKm)+'/km']].forEach(([y,lbl,val])=>{
    ctx.save();
    ctx.textAlign='left'; ctx.fillStyle='rgba(0,0,0,.22)'; ctx.font=lF; ctx.fillText(lbl,px,y);
    ctx.textAlign='right'; ctx.fillStyle='#1a1a1a'; ctx.font=vF; ctx.fillText(val,rX,y);
    ctx.restore();
  });
  // Date caption
  ctx.save(); ctx.textAlign='center'; ctx.fillStyle='rgba(0,0,0,.18)'; ctx.font=cFont(H,'caption');
  ctx.fillText(act.date||'',W/2,H*0.752); ctx.restore();
}

export function cRenderRaceDay(ctx,act,W,H){
  cDrawBg(ctx,W,H,'#060810');
  if(act.route&&act.route.length>1){
    drawRouteCanvas(ctx,act.route,0,0,W,H*0.63);
    cDrawLinGrad(ctx,W,H, 0,H*0.28,0,H*0.65, [[0,'transparent'],[1,'#060810']]);
  }
  cDrawRadialGlow(ctx,W/2,H*0.67,W*0.55,'rgba(249,115,22,.2)');
  cDrawVignette(ctx,W,H,0.58);
  ctx.save(); ctx.textAlign='center';
  ctx.fillStyle='#fff'; ctx.font=cFont(H,'hero');
  ctx.fillText(fmtKm(act.distanceKm),W/2,H*0.70);
  ctx.fillStyle='#f97316'; ctx.font=`700 ${Math.round(H*.013)}px system-ui`;
  ctx.fillText('KILOMETRES',W/2,H*0.752);
  ctx.restore();
  cDrawBranding(ctx,W,H,'rgba(255,255,255,.22)');
  cDrawCaption(ctx,W,H,(act.name||'Run').substring(0,26)+' · '+fmtPace(act.avgPaceSecKm)+'/km','rgba(255,255,255,.32)');
}

export function cRenderEndurance(ctx,act,W,H){
  cDrawBg(ctx,W,H,'#0a0c14');
  cDrawRadialGlow(ctx,W/2,0,W*0.8,'rgba(249,115,22,.06)');
  cDrawVignette(ctx,W,H,0.42);
  const px=W*CANVAS_LAYOUT.padX;
  ctx.save(); ctx.textAlign='left';
  ctx.fillStyle='rgba(255,255,255,.18)'; ctx.font=cFont(H,'brand');
  ctx.fillText('RUNLYTICS',px,H*CANVAS_LAYOUT.brandY);
  ctx.fillStyle='#fff'; ctx.font=cFont(H,'hero'); ctx.fillText(fmtKm(act.distanceKm),px,H*0.42);
  ctx.fillStyle='rgba(255,255,255,.32)'; ctx.font=cFont(H,'unit'); ctx.fillText('KM',px,H*0.468);
  ctx.fillStyle='#f97316'; ctx.fillRect(px,H*0.492,W*0.11,3);
  ctx.fillStyle='rgba(255,255,255,.06)'; ctx.fillRect(px,H*0.548,W*0.86,1);
  const mF=`700 ${Math.round(H*.026)}px monospace`;
  const lF=`600 ${Math.round(H*.014)}px system-ui`;
  const rX=W*(1-CANVAS_LAYOUT.padX);
  [[H*0.615,'DURATION',fmtDur(act.movingTimeSec)],[H*0.675,'PACE',fmtPace(act.avgPaceSecKm)+'/km']].forEach(([y,lbl,val])=>{
    ctx.textAlign='left'; ctx.fillStyle='rgba(255,255,255,.28)'; ctx.font=lF; ctx.fillText(lbl,px,y);
    ctx.textAlign='right'; ctx.fillStyle='#fff'; ctx.font=mF; ctx.fillText(val,rX,y);
  });
  ctx.restore();
  if(act.route&&act.route.length>1){
    ctx.globalAlpha=0.32; drawRouteCanvas(ctx,act.route,W*0.44,H*0.73,W*0.5,H*0.21); ctx.globalAlpha=1;
  }
}

export function cRenderCinematic(ctx,act,W,H){
  cDrawBg(ctx,W,H,'#0d0520');
  cDrawLinGrad(ctx,W,H, 0,0,W,H, [[0,'rgba(100,40,180,.2)'],[0.5,'transparent'],[1,'rgba(249,115,22,.1)']]);
  if(act.route&&act.route.length>1){
    ctx.globalAlpha=0.28; drawRouteCanvas(ctx,act.route,-W*0.05,0,W*1.1,H*0.66); ctx.globalAlpha=1;
    cDrawLinGrad(ctx,W,H, 0,H*0.26,0,H*0.68, [[0,'transparent'],[1,'rgba(13,5,32,.97)']]);
  }
  cDrawVignette(ctx,W,H,0.65);
  cDrawRadialGlow(ctx,W/2,H*0.67,W*0.5,'rgba(140,70,230,.18)');
  ctx.save(); ctx.textAlign='center';
  ctx.fillStyle='#fff'; ctx.font=cFont(H,'hero'); ctx.fillText(fmtKm(act.distanceKm),W/2,H*0.71);
  ctx.fillStyle='rgba(160,90,255,.85)'; ctx.font=`700 ${Math.round(H*.013)}px system-ui`;
  ctx.fillText('KILOMETRES',W/2,H*0.758);
  ctx.restore();
  cDrawBranding(ctx,W,H,'rgba(255,255,255,.18)');
  cDrawCaption(ctx,W,H,(act.name||'Run').substring(0,28),'rgba(255,255,255,.3)');
}

export function cRenderGlass(ctx,act,W,H){
  cDrawBg(ctx,W,H,'#0c1120');
  cDrawRadialGlow(ctx,W/2,H*0.12,W*0.75,'rgba(249,115,22,.06)');
  cDrawVignette(ctx,W,H,0.38);
  const gx=W*0.06,gy=H*0.1,gw=W*0.88,gh=H*0.76;
  const rad=W*0.04;
  ctx.save();
  ctx.fillStyle='rgba(255,255,255,.04)';
  ctx.strokeStyle='rgba(255,255,255,.1)'; ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(gx+rad,gy); ctx.lineTo(gx+gw-rad,gy);
  ctx.quadraticCurveTo(gx+gw,gy,gx+gw,gy+rad);
  ctx.lineTo(gx+gw,gy+gh-rad); ctx.quadraticCurveTo(gx+gw,gy+gh,gx+gw-rad,gy+gh);
  ctx.lineTo(gx+rad,gy+gh); ctx.quadraticCurveTo(gx,gy+gh,gx,gy+gh-rad);
  ctx.lineTo(gx,gy+rad); ctx.quadraticCurveTo(gx,gy,gx+rad,gy);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.09)'; ctx.fillRect(gx,gy,gw,1);
  ctx.restore();
  if(act.route&&act.route.length>1){
    ctx.globalAlpha=0.5; drawRouteCanvas(ctx,act.route,gx+gw*0.04,gy+gh*0.54,gw*0.92,gh*0.41); ctx.globalAlpha=1;
  }
  ctx.save(); ctx.textAlign='center';
  ctx.fillStyle='#fff'; ctx.font=cFont(H,'hero'); ctx.fillText(fmtKm(act.distanceKm),W/2,gy+gh*0.38);
  ctx.fillStyle='rgba(255,255,255,.28)'; ctx.font=cFont(H,'unit'); ctx.fillText('KILOMETRES',W/2,gy+gh*0.44);
  ctx.restore();
  cDrawDivider(ctx,W,H,'rgba(255,255,255,.06)');
  cDrawBranding(ctx,W,H,'rgba(255,255,255,.18)');
  cDrawCaption(ctx,W,H,(act.name||'Run').substring(0,28),'rgba(255,255,255,.28)');
}

export const CANVAS_RENDERERS={velocity:cRenderVelocity,raceday:cRenderRaceDay,endurance:cRenderEndurance,cinematic:cRenderCinematic,glass:cRenderGlass};

export function renderToCanvas(ctx,act,templateId,W,H){
  const render=CANVAS_RENDERERS[templateId]||CANVAS_RENDERERS.raceday;
  try{render(ctx,act,W,H);}catch(e){}
}

export function cClipRounded(ctx,W,H,r){
  ctx.beginPath();
  ctx.moveTo(r,0); ctx.lineTo(W-r,0); ctx.quadraticCurveTo(W,0,W,r);
  ctx.lineTo(W,H-r); ctx.quadraticCurveTo(W,H,W-r,H);
  ctx.lineTo(r,H); ctx.quadraticCurveTo(0,H,0,H-r);
  ctx.lineTo(0,r); ctx.quadraticCurveTo(0,0,r,0);
  ctx.closePath(); ctx.clip();
}

export function canvasToBlob(canvas, format) {
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  return new Promise(resolve => canvas.toBlob(resolve, mime, EXPORT_CONFIG.quality));
}


export async function downloadExport(act, templateId, format) {
  const { W, H } = EXPORT_CONFIG;
  // Yield to the UI thread so the exporting spinner renders before we block
  await new Promise(r => setTimeout(r, 0));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  // Clip to rounded rect so exported image matches the preview card corners
  cClipRounded(ctx, W, H, 48);
  renderToCanvas(ctx, act, templateId, W, H);
  const blob = await canvasToBlob(canvas, format);
  // Free the large canvas buffer promptly — 1080×1920×4 bytes ≈ 8 MB
  canvas.width = 0; canvas.height = 0;
  if (!blob) throw new Error('Canvas export produced an empty blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `runlytics-share.${format === 'jpg' ? 'jpg' : 'png'}`;
  // Must be in the DOM for Firefox to trigger the download
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportCustomCard(act, state, format) {
  const { W, H } = EXPORT_CONFIG;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  // Clip to rounded rect — matches the React card preview corner radius
  cClipRounded(ctx, W, H, 48);
  const { bg, fx, elements: el, style: st } = state;

  // 1. Background
  if (bg.type === 'gradient') {
    // Convert CSS gradient angle (0°=north, clockwise) to canvas vector.
    // CSS formula: gradient direction = (sin θ, -cos θ) in canvas coords (y-down).
    const rad = bg.gradAngle * Math.PI / 180;
    const len = Math.sqrt(W * W + H * H) * 0.6;
    const dx = Math.sin(rad) * len, dy = -Math.cos(rad) * len;
    const gr = ctx.createLinearGradient(W/2 - dx, H/2 - dy, W/2 + dx, H/2 + dy);
    gr.addColorStop(0, bg.gradStop1); gr.addColorStop(1, bg.gradStop2);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  } else if (bg.type === 'image' && bg.imageData) {
    await new Promise(res => {
      const img = new Image();
      img.onload = () => {
        // Apply brightness AND blur in one compound filter string — must match CSS preview
        const filters = [];
        if (bg.brightness !== 100) filters.push(`brightness(${bg.brightness / 100})`);
        if (bg.blur > 0) filters.push(`blur(${bg.blur}px)`);
        if (filters.length) ctx.filter = filters.join(' ');
        const zoom = Math.max(10, bg.imageZoom || 100); // clamp: zoom=0 would produce scale=0
        const sc = Math.max(W / img.width, H / img.height) * (zoom / 100);
        const dw = img.width * sc, dh = img.height * sc;
        ctx.drawImage(img, (W - dw) * bg.imageX / 100, (H - dh) * bg.imageY / 100, dw, dh);
        ctx.filter = 'none';
        res();
      };
      img.onerror = () => { cDrawBg(ctx, W, H, '#060810'); res(); };
      img.src = bg.imageData;
    });
  } else {
    cDrawBg(ctx, W, H, bg.color || '#060810');
  }
  if (bg.overlayOpacity > 0) {
    ctx.globalAlpha = bg.overlayOpacity;
    ctx.fillStyle = bg.overlayColor || '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // 2. Route
  if (el.route.visible && act.route?.length > 1) {
    const rW = Math.round(W * 0.82 * el.route.scale);
    const rH = Math.round(rW * 0.55);
    drawRouteCanvas(ctx, act.route, Math.round(el.route.x / 100 * W - rW / 2), Math.round(el.route.y / 100 * H - rH / 2), rW, rH);
  }

  // 3. FX
  if (fx.vignette > 0) cDrawVignette(ctx, W, H, fx.vignette);
  if (fx.glowActive) cDrawRadialGlow(ctx, fx.glowX / 100 * W, fx.glowY / 100 * H, fx.glowRadius / 100 * W, hexToRgba(fx.glowColor, fx.glowOpacity));

  // 4. Elements
  if (el.distance.visible) {
    const sc = el.distance.scale, dX = el.distance.x / 100 * W, dY = el.distance.y / 100 * H;
    ctx.save(); ctx.textAlign = 'center';
    ctx.fillStyle = st.textColor; ctx.font = `900 ${Math.round(H * 0.11 * sc)}px system-ui`;
    ctx.fillText(fmtKm(act.distanceKm), dX, dY);
    ctx.fillStyle = st.accentColor; ctx.font = `700 ${Math.round(H * 0.013 * sc)}px system-ui`;
    ctx.fillText('KILOMETRES', dX, dY + Math.round(H * 0.048 * sc));
    ctx.restore();
  }
  if (el.stats.visible) {
    const sc = el.stats.scale, sX = el.stats.x / 100 * W, sY = el.stats.y / 100 * H, hw = W * 0.36 * sc;
    const vF = `700 ${Math.round(H * 0.022 * sc)}px monospace`;
    const lF = `600 ${Math.round(H * 0.012 * sc)}px system-ui`;
    ctx.save();
    [[sY, 'DURATION', fmtDur(act.movingTimeSec)], [sY + Math.round(H * 0.042 * sc), 'PACE', fmtPace(act.avgPaceSecKm) + '/km']].forEach(([y, lbl, val], i) => {
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.font = lF;
      ctx.fillText(lbl, sX - hw, y - (i === 0 ? Math.round(H * 0.006) : 0));
      ctx.textAlign = 'right'; ctx.fillStyle = st.textColor; ctx.font = vF;
      ctx.fillText(val, sX + hw, y);
    });
    ctx.restore();
  }
  if (el.name.visible) {
    ctx.save(); ctx.textAlign = 'center'; ctx.globalAlpha = 0.42; ctx.fillStyle = st.textColor;
    ctx.font = `500 ${Math.round(H * 0.016 * el.name.scale)}px system-ui`;
    ctx.fillText((act.name || 'Activity').substring(0, 32), el.name.x / 100 * W, el.name.y / 100 * H);
    ctx.restore();
  }
  if (el.branding.visible) {
    ctx.save(); ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.font = `700 ${Math.round(H * 0.016 * el.branding.scale)}px system-ui`;
    ctx.fillText('RUNLYTICS', el.branding.x / 100 * W, el.branding.y / 100 * H);
    ctx.restore();
  }

  // 5. Grain — crypto.getRandomValues on a typed buffer is ~20× faster than
  //    per-pixel Math.random() which would take 500–2000ms on a 1080×1920 canvas.
  if (fx.grain > 0) {
    const id = ctx.getImageData(0, 0, W, H);
    const d = id.data;
    const str = fx.grain * 55;
    const noise = new Uint8Array(W * H); // one value per pixel
    crypto.getRandomValues(noise);
    for (let i = 0; i < d.length; i += 4) {
      const n = (noise[i >> 2] - 127.5) / 127.5 * str;
      d[i]   = Math.max(0, Math.min(255, d[i]   + n));
      d[i+1] = Math.max(0, Math.min(255, d[i+1] + n));
      d[i+2] = Math.max(0, Math.min(255, d[i+2] + n));
    }
    ctx.putImageData(id, 0, 0);
  }

  const blob = await canvasToBlob(canvas, format);
  // Free the ~8 MB canvas buffer before awaiting the download
  canvas.width = 0; canvas.height = 0;
  if (!blob) throw new Error('Canvas export produced an empty blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `runlytics-custom.${format === 'jpg' ? 'jpg' : 'png'}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
