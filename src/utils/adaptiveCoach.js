import { weekOf } from './formatters.js';
import { getPlanAdherence, getPlanWeek } from './trainingPlan.js';

// Returns longest run distance within the current plan period (or last 180 days)
function getLongestRunInCycle(acts, plan) {
  const startTs = plan?.startDate
    ? new Date(plan.startDate + 'T00:00:00').getTime()
    : Date.now() - 180 * 86400000;
  const cycleActs = acts.filter(a => a.dateTs >= startTs);
  return cycleActs.length ? Math.max(...cycleActs.map(a => a.distanceKm)) : 0;
}

// Longest streak of near-zero training (pct < 30%) to detect consecutive missed weeks
function getMaxConsecutiveMissed(detail) {
  let max = 0, cur = 0;
  for (const w of detail) {
    if (w.pct < 30) { cur++; max = Math.max(max, cur); }
    else cur = 0;
  }
  return max;
}

// Longest streak of high-compliance weeks (pct >= 90%) — detects accumulated fatigue risk
function getConsecutiveHighWeeks(detail) {
  let max = 0, cur = 0;
  for (const w of detail) {
    if (w.pct >= 90) { cur++; max = Math.max(max, cur); }
    else cur = 0;
  }
  return max;
}

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

  const raw = Math.round(adhScore * 0.4 + consistPct * 0.3 + recentScore * 0.2 + progressScore * 0.1);

  // Maturity factor: prevents false-high scores in the first 8 weeks before meaningful
  // training history exists. Score scales from 65% to 100% capacity over the first 8 weeks.
  const maturity = adh.weeksCompleted < 8
    ? 0.65 + (adh.weeksCompleted / 8) * 0.35
    : 1.0;

  return Math.round(raw * maturity);
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
  const currentPhase = planWeek?.phase || null;
  const thisWeekActual = analytics.weeklyKm.find(w => w.week === today)?.km || 0;
  const thisWeekPct = planWeek ? Math.round(thisWeekActual / planWeek.targetKm * 100) : null;
  const daysSinceRun = acts.length
    ? Math.floor((Date.now() - Math.max(...acts.map(a => a.dateTs))) / 86400000)
    : 999;
  const maxConsecMissed = getMaxConsecutiveMissed(adh.detail);
  const consecHighWeeks = getConsecutiveHighWeeks(adh.detail);
  const longestInCycle = getLongestRunInCycle(acts, plan);

  // Strong recent consistency
  if (recent3Avg >= 90)
    insights.push({ type: 'success', icon: '🔥', title: 'Strong Consistency',
      body: `You completed ${Math.round(recent3Avg)}% of planned volume over the last ${recent3.length} weeks. Keep it up.` });

  // Falling behind this week — phase-aware: suppress during taper and race
  if (thisWeekPct !== null && thisWeekPct < 70 && currentPhase !== 'taper' && currentPhase !== 'race')
    insights.push({ type: 'warning', icon: '⚠️', title: 'Falling Behind This Week',
      body: `You've logged ${Math.round(thisWeekPct)}% of this week's target. ${
        currentPhase === 'build' && planWeek?.long
          ? "Prioritise the long run first — it's the most important session this week."
          : 'Complete your remaining runs before Sunday.'
      }` });

  // Overreaching — correct message: return to plan, don't add more
  if (adh.adherencePct > 110)
    insights.push({ type: 'caution', icon: '🚨', title: 'Overreaching Risk',
      body: 'Your volume is significantly above plan. Return to prescribed targets — the plan already provides all necessary adaptation stimulus. Adding more raises injury risk without proportional benefit.' });

  // Accumulated fatigue — 6+ consecutive high-compliance weeks without a dip
  if (consecHighWeeks >= 6)
    insights.push({ type: 'caution', icon: '😮‍💨', title: 'Accumulated Fatigue Risk',
      body: `You've run at or above 90% of target for ${consecHighWeeks} consecutive weeks. Your body may need a deeper recovery week soon even if the plan doesn't prescribe one.` });

  // Slightly behind overall
  if (adh.adherencePct >= 70 && adh.adherencePct < 90)
    insights.push({ type: 'info', icon: '📈', title: 'Slightly Behind Plan',
      body: 'Prioritise your long run and quality session this week. Missing easy runs is recoverable — missing long runs accumulates into a race-readiness gap.' });

  // Consecutive missed weeks — explicit count, not just rolling average
  if (maxConsecMissed >= 2)
    insights.push({ type: 'warning', icon: '📅', title: `${maxConsecMissed} Consecutive Weeks Missed`,
      body: `Your history includes ${maxConsecMissed} near-zero weeks in a row. Re-engage with this week's scheduled plan — do not try to back-fill missed volume.` });

  // No recent activity
  if (daysSinceRun >= 7)
    insights.push({ type: 'warning', icon: '😴', title: 'No Recent Activity',
      body: `It's been ${daysSinceRun} days since your last run. Getting back on track now will protect your fitness base.` });

  // Long run behind schedule — specific to marathon and HM plans
  const LONG_RUN_TARGETS = { 'Marathon': 28, 'HM': 16 };
  const lrTarget = LONG_RUN_TARGETS[plan.raceType];
  if (lrTarget && longestInCycle < lrTarget && currentPhase !== 'taper' && currentPhase !== 'race') {
    const weeksLeft = plan.weeks.filter(w => w.week >= today).length;
    if (weeksLeft <= 3) {
      insights.push({ type: 'caution', icon: '🚨', title: 'Key Long Run Not Completed',
        body: `Your longest run this cycle is ${longestInCycle.toFixed(1)} km. A ${plan.raceType} plan needs at least ${lrTarget} km before taper begins. With only ${weeksLeft} weeks remaining, this is a race-readiness concern.` });
    } else {
      insights.push({ type: 'warning', icon: '📏', title: 'Long Run Behind Schedule',
        body: `Your longest run this training cycle is ${longestInCycle.toFixed(1)} km. Aim to reach ${lrTarget} km before taper starts. You have ${weeksLeft} weeks to build this progressively.` });
    }
  }

  if (!insights.length)
    insights.push({ type: 'info', icon: '📊', title: 'On Track',
      body: `Overall adherence at ${adh.adherencePct}%. Continue with your plan as scheduled.` });

  return insights;
}

export function computeAdaptiveReco(plan, analytics) {
  if (!plan || !analytics.weeklyKm) return null;
  const adh = getPlanAdherence(plan, analytics.weeklyKm);
  if (!adh) return null;

  const today = weekOf(Date.now());
  const planWeek = getPlanWeek(plan, today);
  const phase = planWeek?.phase || 'build';

  // Taper phase: volume reduction is intentional — give specific taper guidance
  if (phase === 'taper')
    return { status: 'Taper Phase', color: '#8b5cf6',
      reco: 'Reduce volume as prescribed. Resist the urge to add extra runs — fitness is locked in. Focus on sleep, nutrition, and staying healthy.' };

  const pct = adh.adherencePct;

  if (pct >= 90 && pct <= 110)
    return { status: 'On Track', color: '#22c55e',
      reco: phase === 'base'
        ? 'Continue current plan — keep all runs easy and aerobic in this base phase.'
        : 'Continue current plan — complete all key sessions, especially your long run and quality session.' };

  // Ahead of plan: return to prescribed volume, NOT increase further
  if (pct > 110)
    return { status: 'Ahead of Plan', color: '#3b82f6',
      reco: 'Return to prescribed volume. The plan already provides all necessary stimulus — exceeding it increases injury risk without proportional benefit.' };

  if (pct >= 70)
    return { status: 'Slightly Behind', color: 'var(--or)',
      reco: 'Prioritise your long run and quality session this week. Missing easy runs is recoverable; missing long runs creates a lasting race-readiness gap.' };

  // Behind plan: re-engage, not reduce — reducing is only for injury/illness
  return { status: 'Behind Plan', color: '#ef4444',
    reco: "Re-engage with this week's scheduled runs. Don't try to back-fill missed volume — just resume the plan from where you are. Only reduce targets if dealing with injury or illness." };
}

const MILESTONE_DEFS = [
  { id: 'w20',     icon: '✅', label: 'First 20 km week',              check: (wkm)                => wkm.some(w => w.km >= 20) },
  { id: 'w30',     icon: '✅', label: 'First 30 km week',              check: (wkm)                => wkm.some(w => w.km >= 30) },
  { id: 'w40',     icon: '✅', label: 'First 40 km week',              check: (wkm)                => wkm.some(w => w.km >= 40) },
  { id: 'w50',     icon: '✅', label: 'First 50 km week',              check: (wkm)                => wkm.some(w => w.km >= 50) },
  { id: 'r13',     icon: '🏃', label: 'Long run 13 km+',               check: (_, acts)            => acts.some(a => a.distanceKm >= 13) },
  { id: 'r21',     icon: '🏃', label: 'Long run 21 km+',               check: (_, acts)            => acts.some(a => a.distanceKm >= 21) },
  { id: 'r32',     icon: '🏃', label: 'Long run 32 km+',               check: (_, acts)            => acts.some(a => a.distanceKm >= 32) },
  { id: 'lrready', icon: '🎯', label: 'Long run ≥ 80% of race dist',  check: (_, acts, plan)       => {
    if (!plan) return false;
    const DIST = { '5K': 5, '10K': 10, 'HM': 21.0975, 'Marathon': 42.195 };
    const threshold = (DIST[plan.raceType] || 21) * 0.8;
    const startTs = plan.startDate ? new Date(plan.startDate + 'T00:00:00').getTime() : 0;
    return acts.some(a => a.distanceKm >= threshold && a.dateTs >= startTs);
  }},
  { id: 'taper',   icon: '🏁', label: 'Taper started',                 check: (_, __, plan, today) => plan?.weeks.some(w => w.week <= today && w.phase === 'taper') },
  { id: 'peak',    icon: '⛰️', label: 'Peak week completed',           check: (_, __, plan, today) => {
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
