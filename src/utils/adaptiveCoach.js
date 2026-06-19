import { weekOf } from './formatters.js';
import { getPlanAdherence, getPlanWeek } from './trainingPlan.js';

export function computeGoalHealthScore(plan, analytics, acts) {
  if (!plan || !analytics.weeklyKm) return null;
  const adh = getPlanAdherence(plan, analytics.weeklyKm);
  if (!adh) return null;

  const adhScore = Math.min(100, adh.adherencePct);
  const consistPct = adh.weeksCompleted > 0
    ? adh.detail.filter(w => w.pct >= 70).length / adh.weeksCompleted * 100
    : 100;
  const recentActs = acts.filter(a => a.dateTs > Date.now() - 14 * 86400000).length;
  const recentScore = Math.min(100, recentActs * 20);
  const today = weekOf(Date.now());
  const completedWeeks = plan.weeks.filter(w => w.week < today).length;
  const progressScore = plan.weeks.length
    ? Math.min(100, completedWeeks / plan.weeks.length * 100)
    : 50;

  return Math.round(adhScore * 0.4 + consistPct * 0.3 + recentScore * 0.2 + progressScore * 0.1);
}

export function computeCoachInsights(plan, analytics, acts) {
  const insights = [];
  if (!plan || !analytics.weeklyKm?.length) return insights;
  const adh = getPlanAdherence(plan, analytics.weeklyKm);
  if (!adh || !adh.detail.length) return insights;

  const recent3 = adh.detail.slice(-3);
  const recent3Avg = recent3.reduce((s, w) => s + w.pct, 0) / recent3.length;
  const today = weekOf(Date.now());
  const planWeek = getPlanWeek(plan, today);
  const thisWeekActual = analytics.weeklyKm.find(w => w.week === today)?.km || 0;
  const thisWeekPct = planWeek ? Math.round(thisWeekActual / planWeek.targetKm * 100) : null;
  const daysSinceRun = acts.length
    ? Math.floor((Date.now() - Math.max(...acts.map(a => a.dateTs))) / 86400000)
    : 999;

  if (recent3Avg >= 90)
    insights.push({ type: 'success', icon: '🔥', title: 'Strong Consistency',
      body: `You completed ${Math.round(recent3Avg)}% of planned volume over the last ${recent3.length} weeks. Keep it up.` });

  if (thisWeekPct !== null && thisWeekPct < 70 && planWeek?.phase !== 'taper')
    insights.push({ type: 'warning', icon: '⚠️', title: 'Falling Behind This Week',
      body: `You've logged ${Math.round(thisWeekPct)}% of this week's target. Consider completing your ${planWeek?.long ? 'long run' : 'remaining runs'} before Sunday.` });

  if (adh.adherencePct > 110)
    insights.push({ type: 'caution', icon: '🚨', title: 'Overreaching Risk',
      body: 'Your volume is significantly above plan. Consider staying closer to prescribed targets to avoid injury.' });

  if (adh.adherencePct >= 70 && adh.adherencePct < 90)
    insights.push({ type: 'info', icon: '📈', title: 'Slightly Behind Plan',
      body: 'Focus on completing your key sessions this week. Consistency over the next 2 weeks will get you back on track.' });

  if (daysSinceRun >= 7)
    insights.push({ type: 'warning', icon: '😴', title: 'No Recent Activity',
      body: `It's been ${daysSinceRun} days since your last run. Getting back on track now will protect your fitness.` });

  if (!insights.length)
    insights.push({ type: 'info', icon: '📊', title: 'On Track',
      body: `Overall adherence at ${adh.adherencePct}%. Continue with your plan as scheduled.` });

  return insights;
}

export function computeAdaptiveReco(plan, analytics) {
  if (!plan || !analytics.weeklyKm) return null;
  const adh = getPlanAdherence(plan, analytics.weeklyKm);
  if (!adh) return null;
  const pct = adh.adherencePct;
  if (pct >= 90 && pct <= 110) return { status: 'On Track',        color: '#22c55e', reco: 'Continue current plan' };
  if (pct > 110)                return { status: 'Ahead of Plan',   color: '#3b82f6', reco: "Increase next week's volume carefully (+5–10%)" };
  if (pct >= 70)                return { status: 'Slightly Behind', color: 'var(--or)', reco: 'Focus on completing all planned runs' };
  return                               { status: 'Behind Plan',     color: '#ef4444', reco: "Consider reducing next week's target by 10% to recover" };
}

const MILESTONE_DEFS = [
  { id: 'w20',   icon: '✅', label: 'First 20 km week',    check: (wkm)         => wkm.some(w => w.km >= 20) },
  { id: 'w30',   icon: '✅', label: 'First 30 km week',    check: (wkm)         => wkm.some(w => w.km >= 30) },
  { id: 'w40',   icon: '✅', label: 'First 40 km week',    check: (wkm)         => wkm.some(w => w.km >= 40) },
  { id: 'w50',   icon: '✅', label: 'First 50 km week',    check: (wkm)         => wkm.some(w => w.km >= 50) },
  { id: 'r13',   icon: '🏃', label: 'Long run 13 km+',     check: (_, acts)     => acts.some(a => a.distanceKm >= 13) },
  { id: 'r21',   icon: '🏃', label: 'Long run 21 km+',     check: (_, acts)     => acts.some(a => a.distanceKm >= 21) },
  { id: 'r32',   icon: '🏃', label: 'Long run 32 km+',     check: (_, acts)     => acts.some(a => a.distanceKm >= 32) },
  { id: 'taper', icon: '🏁', label: 'Taper started',       check: (_, __, plan, today) => plan?.weeks.some(w => w.week <= today && w.phase === 'taper') },
  { id: 'peak',  icon: '⛰️', label: 'Peak week completed', check: (_, __, plan, today) => {
    const builds = plan?.weeks.filter(w => w.phase === 'build' && w.week < today);
    return builds?.length > 0 && Math.max(...builds.map(w => w.targetKm)) === builds[builds.length - 1]?.targetKm;
  }},
];

export function computeCoachMilestones(plan, acts, analytics) {
  const today = weekOf(Date.now());
  const wkm = analytics.weeklyKm || [];
  return MILESTONE_DEFS.map(m => ({
    ...m,
    earned: !!m.check(wkm, acts, plan, today),
  }));
}
