import { weekOf, fmtPace, fmtDur, fmtKm } from './formatters.js';

const MOODS_ORDER = ['strong','great','good','normal','tough'];

export function computeWrapped(acts, yearMonth) {
  const filtered = acts.filter(a => a.date && a.date.startsWith(yearMonth));
  if (!filtered.length) return null;

  const totalDistance = filtered.reduce((s, a) => s + (a.distanceKm || 0), 0);
  const totalRuns = filtered.length;

  const longestRun = [...filtered].sort((a, b) => b.distanceKm - a.distanceKm)[0] || null;
  const fastestRun = filtered.filter(a => a.avgPaceSecKm > 0)
    .sort((a, b) => a.avgPaceSecKm - b.avgPaceSecKm)[0] || null;

  // Best performing run: fastest pace among runs ≥ 3 km (excludes short sprints)
  const bestPerformingRun = filtered
    .filter(a => a.avgPaceSecKm > 0 && a.distanceKm >= 3)
    .sort((a, b) => a.avgPaceSecKm - b.avgPaceSecKm)[0] || null;

  const moodCounts = {};
  filtered.forEach(a => { if (a.mood) moodCounts[a.mood] = (moodCounts[a.mood] || 0) + 1; });
  const topMood = MOODS_ORDER.find(m => moodCounts[m]) || null;

  const memories = filtered.filter(a => a.mood || a.notes || a.photoCount > 0);
  const memoryCount = memories.length;

  const withPhoto = memories.filter(a => a.photoCount > 0);
  const pool = withPhoto.length ? withPhoto : memories;
  const favoriteMemory = pool.sort((a, b) => (b.notes?.length || 0) - (a.notes?.length || 0))[0] || null;

  // Streak within month
  const runDays = new Set(filtered.map(a => a.date));
  let maxStreak = 0, cur = 0;
  const days = Array.from(runDays).sort();
  for (let i = 0; i < days.length; i++) {
    if (i === 0) { cur = 1; }
    else {
      const prev = new Date(days[i-1]+'T00:00:00'), curr = new Date(days[i]+'T00:00:00');
      cur = Math.round((curr - prev) / 86400000) === 1 ? cur + 1 : 1;
    }
    maxStreak = Math.max(maxStreak, cur);
  }

  const totalTimeSec   = filtered.reduce((s, a) => s + (a.movingTimeSec || 0), 0);
  const avgDistanceKm  = totalRuns > 0 ? totalDistance / totalRuns : 0;
  const totalElevGainM = Math.round(filtered.reduce((s, a) => s + (a.elevGainM || 0), 0));

  const paceRuns = filtered.filter(a => a.avgPaceSecKm > 0);
  const avgPaceSec = paceRuns.length
    ? paceRuns.reduce((s, a) => s + a.avgPaceSecKm, 0) / paceRuns.length
    : 0;

  const notesCount  = filtered.filter(a => a.notes?.trim()).length;
  const photosCount = filtered.reduce((s, a) => s + (a.photoCount || 0), 0);

  const weekMap = {};
  filtered.forEach(a => {
    const w = weekOf(a.dateTs);
    if (!weekMap[w]) weekMap[w] = { week: w, km: 0, runs: 0 };
    weekMap[w].km += a.distanceKm || 0;
    weekMap[w].runs++;
  });
  const weeklyBreakdown = Object.values(weekMap).sort((a, b) => a.week.localeCompare(b.week));
  const mostActiveWeek  = weeklyBreakdown.length
    ? [...weeklyBreakdown].sort((a, b) => b.km - a.km)[0]
    : null;

  const biggestClimb = filtered
    .filter(a => (a.elevGainM || 0) > 50)
    .sort((a, b) => b.elevGainM - a.elevGainM)[0] || null;

  return {
    totalDistance, totalRuns, totalTimeSec, avgDistanceKm, totalElevGainM, avgPaceSec,
    longestRun, fastestRun, biggestClimb, bestPerformingRun,
    topMood, moodCounts, favoriteMemory, memoryCount, streakDays: maxStreak,
    weeklyBreakdown, notesCount, photosCount, mostActiveWeek,
  };
}

export function computeWrappedCoach(plan, analytics, yearMonth) {
  if (!plan?.weeks || !analytics?.weeklyKm?.length) return null;
  const planWeeks = plan.weeks.filter(w => w.week.startsWith(yearMonth));
  if (!planWeeks.length) return null;

  const actualByWeek = {};
  analytics.weeklyKm.forEach(w => { actualByWeek[w.week] = w.km; });

  const totalTarget = planWeeks.reduce((s, w) => s + (w.targetKm || 0), 0);
  const totalActual = planWeeks.reduce((s, w) => s + (actualByWeek[w.week] || 0), 0);
  const monthAdherence = totalTarget > 0 ? Math.round(totalActual / totalTarget * 100) : null;

  const phases = [...new Set(planWeeks.map(w => w.phase).filter(Boolean))];

  // Estimate peak long run target this month (30% of weekly target for weeks with a long run scheduled)
  const peakLongKm = Math.max(0, ...planWeeks.map(w =>
    (w.long > 0) ? Math.min(35, Math.max(10, Math.round(w.targetKm * 0.30))) : 0
  ));

  // Trend: first-half vs second-half adherence
  let trend = null;
  if (planWeeks.length >= 3) {
    const half = Math.floor(planWeeks.length / 2);
    const fa = planWeeks.slice(0, half).reduce((s, w) => s + (actualByWeek[w.week] || 0), 0);
    const ft = planWeeks.slice(0, half).reduce((s, w) => s + (w.targetKm || 0), 0);
    const sa = planWeeks.slice(half).reduce((s, w) => s + (actualByWeek[w.week] || 0), 0);
    const st = planWeeks.slice(half).reduce((s, w) => s + (w.targetKm || 0), 0);
    const f1 = ft > 0 ? fa / ft : 0;
    const f2 = st > 0 ? sa / st : 0;
    trend = f2 > f1 * 1.05 ? 'improving' : f2 < f1 * 0.95 ? 'declining' : 'steady';
  }

  return {
    monthAdherence,
    totalTarget: Math.round(totalTarget),
    totalActual: Math.round(totalActual),
    phases,
    peakLongKm: peakLongKm > 0 ? peakLongKm : null,
    trend,
  };
}

// Canvas-based share image (1080×1080 JPEG)
export async function generateWrappedImage(data, yearMonth) {
  const [y, m] = yearMonth.split('-');
  const label = new Date(+y, +m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  const W = 1080, H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#070c18');
  bg.addColorStop(1, '#0f1623');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 108) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let yy = 0; yy < H; yy += 108) { ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke(); }

  // Orange top strip
  ctx.fillStyle = '#f97316'; ctx.fillRect(0, 0, W, 8);

  // Month label
  ctx.fillStyle = '#f97316';
  ctx.font = 'bold 44px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label.toUpperCase(), W / 2, 92);

  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.font = '500 26px system-ui, -apple-system, sans-serif';
  ctx.fillText('MONTHLY WRAPPED', W / 2, 140);

  ctx.strokeStyle = 'rgba(249,115,22,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(80, 170); ctx.lineTo(W - 80, 170); ctx.stroke();

  // Hero distance
  const distStr = fmtKm(data.totalDistance);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 190px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(distStr, W / 2, 400);

  ctx.fillStyle = '#f97316';
  ctx.font = 'bold 58px system-ui, -apple-system, sans-serif';
  ctx.fillText('KM', W / 2, 472);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(80, 510); ctx.lineTo(W - 80, 510); ctx.stroke();

  // Stats 2×2 grid
  const stats = [
    { v: String(data.totalRuns), l: 'RUNS' },
    { v: fmtDur(data.totalTimeSec), l: 'TIME ON FEET' },
    data.totalElevGainM > 0 ? { v: data.totalElevGainM + 'm', l: 'ELEVATION' } : null,
    data.avgPaceSec > 0 ? { v: fmtPace(data.avgPaceSec) + '/km', l: 'AVG PACE' } : null,
  ].filter(Boolean).slice(0, 4);

  const colW = (W - 160) / 2;
  stats.forEach((s, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const cx = 80 + col * colW + colW / 2;
    const cy = 590 + row * 118;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.v, cx, cy);
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.font = '500 24px system-ui, -apple-system, sans-serif';
    ctx.fillText(s.l, cx, cy + 36);
  });

  // Mood line
  if (data.topMood) {
    const LABEL = { great: 'GREAT', good: 'GOOD', normal: 'NORMAL', tough: 'TOUGH', strong: 'STRONG' };
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '500 28px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`MONTHLY VIBE: ${LABEL[data.topMood] || data.topMood.toUpperCase()}`, W / 2, 860);
  }

  // Bottom branding
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(80, 904); ctx.lineTo(W - 80, 904); ctx.stroke();

  ctx.fillStyle = '#f97316';
  ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('RUNLYTICS', W / 2, 960);

  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.font = '400 22px system-ui, -apple-system, sans-serif';
  ctx.fillText('runlytics.app', W / 2, 996);

  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
}

export function getMonthsWithActivity(acts) {
  const seen = new Set();
  acts.forEach(a => { if (a.date && a.date.length >= 7) seen.add(a.date.slice(0, 7)); });
  return Array.from(seen).sort((a, b) => b.localeCompare(a));
}

export function getMemories(acts) {
  return acts
    .filter(a => a.mood || a.notes || (a.photoCount > 0))
    .slice(0, 20);
}

export function getHighlights(acts) {
  if (!acts.length) return [];
  const highlights = [];

  const strongest = acts.filter(a => a.mood === 'strong').sort((a, b) => (b.trainingLoad || 0) - (a.trainingLoad || 0))[0]
    || [...acts].sort((a, b) => (b.trainingLoad || 0) - (a.trainingLoad || 0))[0];
  if (strongest) highlights.push({ icon: '🔥', label: 'Strongest Run', act: strongest });

  const withPhoto = acts.filter(a => a.photoCount > 0);
  const favPool = withPhoto.length ? withPhoto : acts.filter(a => a.notes);
  const favorite = favPool.sort((a, b) => (b.notes?.length || 0) - (a.notes?.length || 0))[0];
  if (favorite) highlights.push({ icon: '📸', label: 'Favorite Memory', act: favorite });

  const longest = [...acts].sort((a, b) => b.distanceKm - a.distanceKm)[0];
  if (longest) highlights.push({ icon: '🏃', label: 'Longest Run', act: longest });

  const fastest = acts.filter(a => a.avgPaceSecKm > 0).sort((a, b) => a.avgPaceSecKm - b.avgPaceSecKm)[0];
  if (fastest) highlights.push({ icon: '⚡', label: 'Fastest Run', act: fastest });

  const biggestClimb = acts.filter(a => a.elevGainM > 0).sort((a, b) => b.elevGainM - a.elevGainM)[0];
  if (biggestClimb) highlights.push({ icon: '🏔', label: 'Biggest Climb', act: biggestClimb });

  return highlights;
}
