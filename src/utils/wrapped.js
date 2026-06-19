import { monthOf, weekOf } from './formatters.js';

const MOODS_ORDER = ['strong','great','good','normal','tough'];

export function computeWrapped(acts, yearMonth) {
  // yearMonth: "2026-05"
  const filtered = acts.filter(a => a.date && a.date.startsWith(yearMonth));
  if (!filtered.length) return null;

  const totalDistance = filtered.reduce((s, a) => s + (a.distanceKm || 0), 0);
  const totalRuns = filtered.length;

  const longestRun = [...filtered].sort((a, b) => b.distanceKm - a.distanceKm)[0] || null;
  const fastestRun = filtered.filter(a => a.avgPaceSecKm > 0)
    .sort((a, b) => a.avgPaceSecKm - b.avgPaceSecKm)[0] || null;

  const moodCounts = {};
  filtered.forEach(a => { if (a.mood) moodCounts[a.mood] = (moodCounts[a.mood] || 0) + 1; });
  const topMood = MOODS_ORDER.find(m => moodCounts[m]) || null;

  const memories = filtered.filter(a => a.mood || a.notes || a.photoCount > 0);
  const memoryCount = memories.length;

  // Favorite memory: has photo first, then longest notes
  const withPhoto = memories.filter(a => a.photoCount > 0);
  const pool = withPhoto.length ? withPhoto : memories;
  const favoriteMemory = pool.sort((a, b) => (b.notes?.length || 0) - (a.notes?.length || 0))[0] || null;

  // Streak within month
  const runDays = new Set(filtered.map(a => a.date));
  let streakDays = 0, maxStreak = 0, cur = 0;
  const days = Array.from(runDays).sort();
  for (let i = 0; i < days.length; i++) {
    if (i === 0) { cur = 1; }
    else {
      const prev = new Date(days[i - 1] + 'T00:00:00'), curr = new Date(days[i] + 'T00:00:00');
      cur = Math.round((curr - prev) / 86400000) === 1 ? cur + 1 : 1;
    }
    maxStreak = Math.max(maxStreak, cur);
  }
  streakDays = maxStreak;

  const totalTimeSec = filtered.reduce((s,a)=>s+(a.movingTimeSec||0),0);
  const avgDistanceKm = totalRuns>0 ? totalDistance/totalRuns : 0;

  const weekMap={};
  filtered.forEach(a=>{
    const w=weekOf(a.dateTs);
    if(!weekMap[w])weekMap[w]={week:w,km:0,runs:0};
    weekMap[w].km+=a.distanceKm||0;weekMap[w].runs++;
  });
  const weeklyBreakdown=Object.values(weekMap).sort((a,b)=>a.week.localeCompare(b.week));

  const biggestClimb=filtered.filter(a=>(a.elevGainM||0)>50).sort((a,b)=>b.elevGainM-a.elevGainM)[0]||null;

  return { totalDistance, totalRuns, totalTimeSec, avgDistanceKm, longestRun, fastestRun, biggestClimb, topMood, moodCounts, favoriteMemory, memoryCount, streakDays, weeklyBreakdown };
}

export function getMonthsWithActivity(acts) {
  const seen = new Set();
  acts.forEach(a => { if (a.date && a.date.length >= 7) seen.add(a.date.slice(0, 7)); });
  return Array.from(seen).sort((a, b) => b.localeCompare(a)); // newest first
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
