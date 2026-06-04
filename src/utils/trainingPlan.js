import { weekOf } from './formatters.js';

const RACE_PEAK = { '5K': 55, '10K': 70, 'HM': 85, 'Marathon': 110 };

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
  const taperStart = totalWeeks - 3;

  const weeks = [];
  let prev = baseWeeklyKm;

  for (let i = 0; i < totalWeeks; i++) {
    const weekDate = addWeeks(start, i);
    const key = weekDate.toISOString().slice(0, 10);
    let targetKm, phase;

    if (i >= totalWeeks - 1) {
      targetKm = parseFloat((peak * 0.25).toFixed(1));
      phase = 'race';
    } else if (i >= taperStart) {
      const taperIdx = i - taperStart;
      const taperFactors = [0.8, 0.6, 0.4];
      targetKm = parseFloat((peak * taperFactors[taperIdx]).toFixed(1));
      phase = 'taper';
    } else {
      const isRecovery = (i + 1) % 4 === 0;
      if (isRecovery) {
        targetKm = parseFloat((prev * 0.85).toFixed(1));
        phase = i < 3 ? 'base' : 'build';
      } else {
        const next = Math.min(prev * 1.08, peak);
        targetKm = parseFloat(next.toFixed(1));
        phase = i < 3 ? 'base' : 'build';
      }
      prev = targetKm;
    }

    weeks.push({ week: key, targetKm, phase, ...runTypesForKm(targetKm) });
  }

  return {
    raceType,
    raceDate,
    startDate: start.toISOString().slice(0, 10),
    baseWeeklyKm: parseFloat(baseWeeklyKm.toFixed(1)),
    weeks,
  };
}

export function detectBaseKm(weeklyKm) {
  if (!weeklyKm || !weeklyKm.length) return 25;
  const today = weekOf(Date.now());
  const complete = weeklyKm.filter(w => w.week < today).slice(-4);
  if (!complete.length) return 25;
  return parseFloat((complete.reduce((s, w) => s + w.km, 0) / complete.length).toFixed(1));
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
  rest:    { label: 'Rest',      icon: '—',  color: 'var(--tx3)' },
  easy:    { label: 'Easy Run',  icon: '🦶', color: '#3b82f6'    },
  long:    { label: 'Long Run',  icon: '📏', color: '#8b5cf6'    },
  workout: { label: 'Tempo Run', icon: '⚡', color: '#f97316'    },
};

export function getWeekDays(planWeek) {
  if (!planWeek) return [];
  const { week, targetKm, easy, long, workout } = planWeek;

  // Slot template Mon–Sun (0=Mon, 6=Sun)
  const slots = ['rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest'];
  if (long > 0)    slots[5] = 'long';
  if (workout >= 1) slots[1] = 'workout';
  if (workout >= 2) slots[3] = 'workout';

  // Fill easy slots: Wed→Fri→Sun→Mon priority
  let easyLeft = easy;
  for (const idx of [2, 4, 6, 0]) {
    if (!easyLeft) break;
    if (slots[idx] === 'rest') { slots[idx] = 'easy'; easyLeft--; }
  }

  const longKm    = long    > 0 ? parseFloat(Math.max(10, Math.min(35, targetKm * 0.30)).toFixed(1)) : 0;
  const workoutKm = workout > 0 ? parseFloat(Math.max(6,  Math.min(16, targetKm * 0.18)).toFixed(1)) : 0;
  const usedKm    = longKm * long + workoutKm * workout;
  const easyKm    = easy   > 0 ? parseFloat(Math.max(5,  Math.min(18, (targetKm - usedKm) / easy)).toFixed(1)) : 0;

  const [y, m, d] = week.split('-').map(Number);
  return slots.map((type, i) => {
    const dd = new Date(y, m - 1, d + i);
    const date = `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`;
    const km = type === 'long' ? longKm : type === 'workout' ? workoutKm : type === 'easy' ? easyKm : 0;
    return { date, dayOfWeek: i, day: DAY_NAMES[i], type, ...DAY_TYPE_INFO[type], targetKm: km };
  });
}

const TYPE_META = {
  easy:    { label: 'Easy Run',  icon: '🦶' },
  long:    { label: 'Long Run',  icon: '📏' },
  workout: { label: 'Tempo Run', icon: '⚡' },
};

const TIPS = [
  { minForm:  8,        tip: "You're energetic — great day for a hard effort." },
  { minForm:  3,        tip: "Feeling fresh — push the pace a little." },
  { minForm: -3,        tip: "Well balanced — steady effort today." },
  { minForm: -8,        tip: "Legs are a bit heavy — keep it easy." },
  { minForm: -Infinity, tip: "Fatigue is high — light jog or rest." },
];

export function getTodayWorkout(planWeek, weekActs, avgPaceSecKm, mafHR, form = 0) {
  if (!planWeek) return null;

  const done = { easy: 0, long: 0, workout: 0 };
  weekActs.forEach(a => { if (a.runClass in done) done[a.runClass]++; });
  const remaining = {
    easy:    Math.max(0, planWeek.easy    - done.easy),
    long:    Math.max(0, planWeek.long    - done.long),
    workout: Math.max(0, planWeek.workout - done.workout),
  };
  const totalRemaining = remaining.easy + remaining.long + remaining.workout;
  if (!totalRemaining) return { done: true };

  const type = (form < -8 || !remaining.workout && !remaining.long)
    ? 'easy'
    : remaining.workout > 0 ? 'workout'
    : remaining.long > 0    ? 'long'
    : 'easy';

  const weekKm = weekActs.reduce((s, a) => s + a.distanceKm, 0);
  const kmLeft = Math.max(0, planWeek.targetKm - weekKm);
  let distanceKm;
  if (type === 'long') {
    distanceKm = parseFloat(Math.max(10, Math.min(35, planWeek.targetKm * 0.30)).toFixed(1));
  } else if (type === 'workout') {
    distanceKm = parseFloat(Math.max(6, Math.min(16, planWeek.targetKm * 0.18)).toFixed(1));
  } else {
    distanceKm = parseFloat(Math.max(5, Math.min(18, kmLeft / Math.max(1, totalRemaining))).toFixed(1));
  }

  let paceMin = null, paceMax = null, paceNote = null;
  if (avgPaceSecKm) {
    if (type === 'easy') {
      const adj = form >= 3 ? 45 : form >= -3 ? 60 : 75;
      paceMin = Math.round(avgPaceSecKm + adj);
      paceMax = Math.round(avgPaceSecKm + adj + 20);
    } else if (type === 'long') {
      const adj = form >= 3 ? 20 : 30;
      paceMin = Math.round(avgPaceSecKm + adj);
      paceMax = Math.round(avgPaceSecKm + adj + 20);
    } else {
      const adj = form >= 3 ? -5 : 5;
      paceMin = Math.max(180, Math.round(avgPaceSecKm + adj));
      paceMax = Math.round(avgPaceSecKm + adj + 15);
    }
  } else {
    paceNote = type === 'workout' ? 'Comfortably hard' : mafHR ? `≤${mafHR} bpm / Zone 2` : 'Zone 2 effort';
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
