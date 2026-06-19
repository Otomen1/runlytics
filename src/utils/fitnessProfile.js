import { weekOf } from './formatters.js';
import { getPlanAdherence } from './trainingPlan.js';

function riegelTime(refTimeSec, refDistKm, targetKm) {
  return Math.round(refTimeSec * Math.pow(targetKm / refDistKm, 1.06));
}

function bestRecentRun(acts, minKm, days = 90) {
  const cutoff = Date.now() - days * 86400000;
  return acts
    .filter(a => a.avgPaceSecKm > 0 && a.distanceKm >= minKm && a.dateTs > cutoff)
    .sort((a, b) => a.avgPaceSecKm - b.avgPaceSecKm)[0] || null;
}

export function estimateVO2Max(paceSecPerKm) {
  if (!paceSecPerKm) return null;
  const v = 1000 / (paceSecPerKm / 60);
  return Math.round(-4.6 + 0.182258 * v + 0.000104 * v * v);
}

export function computeFitnessProfile(acts, plan, analytics) {
  const ref = bestRecentRun(acts, 5) || bestRecentRun(acts, 3);
  const raceTimes = ref ? {
    '5K':  riegelTime(ref.movingTimeSec, ref.distanceKm, 5),
    '10K': riegelTime(ref.movingTimeSec, ref.distanceKm, 10),
    'HM':  riegelTime(ref.movingTimeSec, ref.distanceKm, 21.0975),
    'FM':  riegelTime(ref.movingTimeSec, ref.distanceKm, 42.195),
  } : null;
  const vo2max = ref ? estimateVO2Max(ref.avgPaceSecKm) : null;
  // Filter to current plan period (or last 180 days) so stale long runs don't mislead
  const cycleStartTs = plan?.startDate
    ? new Date(plan.startDate + 'T00:00:00').getTime()
    : Date.now() - 180 * 86400000;
  const cycleActs = acts.filter(a => a.dateTs >= cycleStartTs);
  const longestRun = cycleActs.length ? Math.max(...cycleActs.map(a => a.distanceKm)) : 0;
  const currentWeekKm = analytics.weeklyKm?.find(w => w.week === weekOf(Date.now()))?.km || 0;

  let consistencyPct = null;
  if (plan) {
    const adh = getPlanAdherence(plan, analytics.weeklyKm);
    if (adh?.detail?.length) {
      const onTrack = adh.detail.filter(w => w.pct >= 70).length;
      consistencyPct = Math.round(onTrack / adh.detail.length * 100);
    }
  }

  return { raceTimes, vo2max, longestRun, currentWeekKm, consistencyPct };
}
