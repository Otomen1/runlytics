import { weekOf } from './formatters.js';
import { classifyRun } from './activity.js';

const RACE_PEAK = { '5K': 55, '10K': 70, 'HM': 85, 'Marathon': 110 };

// Minimum recommended base (km/week) per race type
const BASE_MIN = { '5K': 15, '10K': 20, 'HM': 30, 'Marathon': 40 };

// Race-type-specific taper: science-backed durations
// 5K=1wk, 10K/HM=2wks, Marathon=3wks
const TAPER_WEEKS = { '5K': 1, '10K': 2, 'HM': 2, 'Marathon': 3 };
const TAPER_FACTORS = {
  '5K':      [0.6],
  '10K':     [0.75, 0.5],
  'HM':      [0.75, 0.5],
  'Marathon':[0.8, 0.6, 0.4],
};

// Minimum long run per race type (km) — prevents arithmetic mismatch at low volume
const LONG_RUN_MIN = { '5K': 6, '10K': 8, 'HM': 10, 'Marathon': 14 };

function nextMonday(from = new Date()) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7;
  if (dow !== 0) d.setDate(d.getDate() + (7 - dow));
  return d;
}

function addWeeks(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n * 7);
  return d;
}

function runTypesForKm(km) {
  if (km < 30) return { easy: 3, long: 1, workout: 0 };
  if (km < 50) return { easy: 2, long: 1, workout: 1 };
  if (km < 70) return { easy: 3, long: 1, workout: 1 };
  return { easy: 3, long: 1, workout: 2 };
}

export function generatePlan(raceType, raceDate, baseWeeklyKm) {
  const start = nextMonday();
  const race = new Date(raceDate + 'T12:00:00');
  const totalMs = race - start;
  const totalWeeks = Math.max(8, Math.min(52, Math.round(totalMs / (7 * 86400000))));

  const peak = Math.min(baseWeeklyKm * 1.5, RACE_PEAK[raceType] || 85);

  // taperStart formula: totalWeeks - taperWeeks - 1 (reserve last index for race week)
  // This fixes the off-by-one that previously produced one fewer taper week than intended
  const taperWeeks = TAPER_WEEKS[raceType] || 3;
  const taperStart = totalWeeks - taperWeeks - 1;

  const weeks = [];
  let prev = baseWeeklyKm;

  for (let i = 0; i < totalWeeks; i++) {
    const weekDate = addWeeks(start, i);
    const key = weekOf(weekDate.getTime());
    let targetKm, phase;

    if (i >= totalWeeks - 1) {
      targetKm = parseFloat((peak * 0.25).toFixed(1));
      phase = 'race';
    } else if (i >= taperStart) {
      const taperFactors = TAPER_FACTORS[raceType] || [0.8, 0.6, 0.4];
      const taperIdx = i - taperStart;
      targetKm = parseFloat((peak * taperFactors[taperIdx]).toFixed(1));
      phase = 'taper';
    } else {
      const isRecovery = (i + 1) % 4 === 0;
      if (isRecovery) {
        // 72% depth (was 85%) — proper recovery requires ≥25% volume reduction
        targetKm = parseFloat((prev * 0.72).toFixed(1));
        phase = i < 3 ? 'base' : 'build';
      } else {
        const next = Math.min(prev * 1.08, peak);
        targetKm = parseFloat(next.toFixed(1));
        phase = i < 3 ? 'base' : 'build';
      }
      prev = targetKm;
    }

    // Phase-gate workouts: no quality sessions in base phase
    // Redistribute freed workout slot as an extra easy run
    const runTypes = runTypesForKm(targetKm);
    if (phase === 'base') {
      runTypes.easy = Math.min(4, runTypes.easy + runTypes.workout);
      runTypes.workout = 0;
    }

    // raceType stored on week so getWeekDays can derive long run floor and workout label
    weeks.push({ week: key, targetKm, phase, raceType, ...runTypes });
  }

  const baseWarning = baseWeeklyKm < (BASE_MIN[raceType] || 30)
    ? `Your current base (${Math.round(baseWeeklyKm)} km/week) is below the recommended minimum for a ${raceType} plan (${BASE_MIN[raceType]} km/week). Consider building your base further before starting this plan.`
    : null;

  return {
    raceType,
    raceDate,
    startDate: weekOf(start.getTime()),
    baseWeeklyKm: parseFloat(baseWeeklyKm.toFixed(1)),
    weeks,
    baseWarning,
  };
}

export function detectBaseKm(weeklyKm) {
  if (!weeklyKm || !weeklyKm.length) return 25;
  const today = weekOf(Date.now());
  const complete = weeklyKm.filter(w => w.week < today).slice(-4);
  if (!complete.length) return 25;
  return parseFloat((complete.reduce((s, w) => s + w.km, 0) / complete.length).toFixed(1));
}

export function detectPeakBaseKm(weeklyKm) {
  if (!weeklyKm || !weeklyKm.length) return 25;
  const today = weekOf(Date.now());
  const complete = weeklyKm.filter(w => w.week < today);
  if (!complete.length) return 25;
  if (complete.length < 4) {
    return parseFloat((complete.reduce((s, w) => s + w.km, 0) / complete.length).toFixed(1));
  }
  let peak = 0;
  for (let i = 3; i < complete.length; i++) {
    const avg = (complete[i].km + complete[i-1].km + complete[i-2].km + complete[i-3].km) / 4;
    if (avg > peak) peak = avg;
  }
  return parseFloat(peak.toFixed(1));
}

export function getPlanWeek(plan, weekKey) {
  if (!plan || !plan.weeks) return null;
  return plan.weeks.find(w => w.week === weekKey) || null;
}

export function getPlanAdherence(plan, weeklyKm) {
  if (!plan || !plan.weeks || !weeklyKm) return null;
  const today = weekOf(Date.now());
  const completed = plan.weeks.filter(w => w.week < today && w.phase !== 'race');
  if (!completed.length) return { adherencePct: 100, weeksCompleted: 0, totalPlanned: 0, totalActual: 0, detail: [] };

  const detail = completed.map(pw => {
    const actual = weeklyKm.find(w => w.week === pw.week);
    const actualKm = actual ? actual.km : 0;
    const pct = pw.targetKm > 0 ? Math.min(120, Math.round(actualKm / pw.targetKm * 100)) : 100;
    return { week: pw.week, target: pw.targetKm, actual: actualKm, pct, phase: pw.phase };
  });

  const totalPlanned = detail.reduce((s, w) => s + w.target, 0);
  const totalActual = detail.reduce((s, w) => s + w.actual, 0);
  const adherencePct = totalPlanned > 0 ? Math.min(120, Math.round(totalActual / totalPlanned * 100)) : 100;

  return { adherencePct, weeksCompleted: completed.length, totalPlanned, totalActual, detail };
}

export function getPlanWeekNumber(plan, weekKey) {
  if (!plan || !plan.weeks) return null;
  const idx = plan.weeks.findIndex(w => w.week === weekKey);
  return idx >= 0 ? idx + 1 : null;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DAY_TYPE_INFO = {
  rest:    { label: 'Rest',           icon: '—',  color: 'var(--tx3)' },
  easy:    { label: 'Easy Run',       icon: '🦶', color: '#3b82f6'    },
  long:    { label: 'Long Run',       icon: '📏', color: '#8b5cf6'    },
  workout: { label: 'Tempo Run',      icon: '⚡', color: '#f97316'    },
  mp:      { label: 'Marathon Pace',  icon: '🎯', color: '#22c55e'    },
};

export function getWeekDays(planWeek) {
  if (!planWeek) return [];
  const { week, targetKm, easy, long, workout, raceType = 'HM', phase } = planWeek;

  // Marathon build weeks use MP runs instead of generic tempo
  const wType = (raceType === 'Marathon' && phase === 'build') ? 'mp' : 'workout';

  // Slot template Mon–Sun (0=Mon, 6=Sun)
  const slots = ['rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest'];
  if (long > 0)     slots[5] = 'long';
  if (workout >= 1) slots[1] = wType;
  if (workout >= 2) slots[3] = wType;

  // Fill easy slots: Wed→Fri→Sun→Mon priority
  let easyLeft = easy;
  for (const idx of [2, 4, 6, 0]) {
    if (!easyLeft) break;
    if (slots[idx] === 'rest') { slots[idx] = 'easy'; easyLeft--; }
  }

  // Race-type-specific long run floor prevents under-30km arithmetic mismatch
  const longMin   = LONG_RUN_MIN[raceType] || 10;
  const longKm    = long    > 0 ? parseFloat(Math.max(longMin, Math.min(35, targetKm * 0.30)).toFixed(1)) : 0;
  const workoutKm = workout > 0 ? parseFloat(Math.max(6, Math.min(16, targetKm * 0.18)).toFixed(1)) : 0;
  const usedKm    = longKm * long + workoutKm * workout;
  const easyKm    = easy   > 0 ? parseFloat(Math.max(5, Math.min(18, (targetKm - usedKm) / easy)).toFixed(1)) : 0;

  const [y, m, d] = week.split('-').map(Number);
  return slots.map((type, i) => {
    const dd = new Date(y, m - 1, d + i);
    const date = `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`;
    const km = type === 'long' ? longKm : (type === 'workout' || type === 'mp') ? workoutKm : type === 'easy' ? easyKm : 0;
    return { date, dayOfWeek: i, day: DAY_NAMES[i], type, ...DAY_TYPE_INFO[type], targetKm: km };
  });
}

const TYPE_META = {
  easy:    { label: 'Easy Run',      icon: '🦶' },
  long:    { label: 'Long Run',      icon: '📏' },
  workout: { label: 'Tempo Run',     icon: '⚡' },
  mp:      { label: 'Marathon Pace', icon: '🎯' },
};

const TIPS = [
  { minForm:  8,        tip: "You're energetic — great day for a hard effort." },
  { minForm:  3,        tip: "Feeling fresh — push the pace a little." },
  { minForm: -3,        tip: "Well balanced — steady effort today." },
  { minForm: -8,        tip: "Legs are a bit heavy — keep it easy." },
  { minForm: -Infinity, tip: "Fatigue is high — light jog or rest." },
];

export function getTodayWorkout(planWeek, weekActs, avgPaceSecKm, mafHR, form = 0, todayDayIdx = null) {
  if (!planWeek) return null;

  // Check what today's slot is in the schedule — if it's a rest day, return null
  const days = getWeekDays(planWeek);
  const idx = todayDayIdx !== null ? todayDayIdx : (new Date().getDay() + 6) % 7;
  const todayDay = days[idx];
  if (!todayDay || todayDay.type === 'rest') return null;

  const done = { easy: 0, long: 0, workout: 0 };
  weekActs.forEach(a => {
    const rc = (a.runClass in done) ? a.runClass : classifyRun(a.distanceKm || 0, a.avgPaceSecKm || 0);
    if (rc in done) done[rc]++;
  });
  const remaining = {
    easy:    Math.max(0, planWeek.easy    - done.easy),
    long:    Math.max(0, planWeek.long    - done.long),
    workout: Math.max(0, planWeek.workout - done.workout),
  };
  const totalRemaining = remaining.easy + remaining.long + remaining.workout;
  if (!totalRemaining) return { done: true };

  // Use today's assigned type; resolve to 'mp' for marathon build quality sessions,
  // and fall back to 'easy' when fatigued
  const isMarathonBuild = planWeek.raceType === 'Marathon' && planWeek.phase === 'build';
  const rawType = todayDay.type; // 'easy' | 'long' | 'workout'
  const type = (form < -8 && rawType !== 'long')
    ? 'easy'
    : rawType === 'workout'
      ? (isMarathonBuild ? 'mp' : 'workout')
      : rawType;

  // Use today's specific distance from the schedule
  const distanceKm = todayDay.targetKm;

  let paceMin = null, paceMax = null, paceNote = null;
  if (avgPaceSecKm) {
    if (type === 'easy') {
      const adj = form >= 3 ? 45 : form >= -3 ? 60 : 75;
      paceMin = Math.round(avgPaceSecKm + adj);
      paceMax = Math.round(avgPaceSecKm + adj + 20);
    } else if (type === 'long') {
      // Long runs: 60–90s/km slower than average (was incorrectly 20–30s)
      const adj = form >= 3 ? 60 : form >= -3 ? 75 : 90;
      paceMin = Math.round(avgPaceSecKm + adj);
      paceMax = Math.round(avgPaceSecKm + adj + 20);
    } else if (type === 'workout') {
      // Tempo at true threshold: ~30–40s/km faster than average training pace
      const adj = form >= 3 ? -40 : form >= -3 ? -30 : -20;
      paceMin = Math.max(180, Math.round(avgPaceSecKm + adj));
      paceMax = Math.round(avgPaceSecKm + adj + 15);
    } else if (type === 'mp') {
      // Marathon Pace: ~15–25s/km faster than average training pace
      const adj = form >= 3 ? -25 : form >= -3 ? -15 : -5;
      paceMin = Math.max(210, Math.round(avgPaceSecKm + adj));
      paceMax = Math.round(avgPaceSecKm + adj + 15);
    }
  } else {
    paceNote = type === 'mp'
      ? 'Comfortably controlled — goal race effort'
      : type === 'workout'
        ? 'Comfortably hard — threshold effort'
        : mafHR ? `≤${mafHR} bpm / Zone 2` : 'Zone 2 effort';
  }

  const tip = TIPS.find(t => form >= t.minForm)?.tip || TIPS[TIPS.length - 1].tip;

  return {
    done: false,
    type,
    ...TYPE_META[type],
    distanceKm,
    paceMin,
    paceMax,
    paceNote,
    tip,
    phase: planWeek.phase,
  };
}

export function classifyEffort(act, refPaceSec, mafHR) {
  if (act.avgHR > 0 && mafHR > 0) {
    if (act.avgHR <= mafHR)       return 'easy';
    if (act.avgHR <= mafHR + 15)  return 'moderate';
    return 'hard';
  }
  if (!refPaceSec || !act.avgPaceSecKm) return 'unknown';
  const delta = act.avgPaceSecKm - refPaceSec; // positive = slower = easier
  if (delta >= 45)  return 'easy';
  if (delta >= -10) return 'moderate';
  return 'hard';
}

export function checkSessionCompliance(day, act, refPaceSec, mafHR) {
  if (day.type === 'rest' || !act) return null;
  const effort = classifyEffort(act, refPaceSec, mafHR);

  if (day.type === 'easy') {
    if (effort === 'hard') return { status: 'too_hard', label: 'Too hard for an easy day' };
    return { status: effort === 'unknown' ? 'done' : 'compliant', label: null };
  }
  if (day.type === 'long') {
    if (effort === 'hard') return { status: 'too_hard', label: 'Too hard — long runs should be easy' };
    if (day.targetKm > 0 && act.distanceKm < day.targetKm * 0.80)
      return { status: 'short', label: `Short — ${act.distanceKm.toFixed(1)} of ${day.targetKm} km` };
    return { status: effort === 'unknown' ? 'done' : 'compliant', label: null };
  }
  if (day.type === 'workout' || day.type === 'mp') {
    if (effort === 'easy') return { status: 'too_easy', label: 'Too easy — missed quality stimulus' };
    return { status: effort === 'unknown' ? 'done' : 'compliant', label: null };
  }
  return { status: 'done', label: null };
}
