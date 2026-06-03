import { describe, it, expect } from 'vitest';
import {
  getMafHR,
  getMafZones,
  computeZones,
  computeRacePRs,
  computeYearWrapped,
  computeTierProgress,
  computeEarnedBadges,
  computeAtlCtl,
  predictRaceTimes,
  estimateVO2max,
} from './analytics.js';

// Minimal activity factory
function makeAct(overrides = {}) {
  return {
    id: String(Math.random()),
    distanceKm: 5,
    movingTimeSec: 1800,
    avgPaceSecKm: 360,
    avgHR: null,
    hrSamples: [],
    elevGainM: 0,
    date: '2024-01-10',
    dateTs: new Date('2024-01-10T12:00:00Z').getTime(),
    trainingLoad: 50,
    mood: null,
    ...overrides,
  };
}

describe('getMafHR', () => {
  it('returns 150 for null profile', () => { expect(getMafHR(null)).toBe(150); });
  it('returns 150 for empty profile (defaults age to 30)', () => { expect(getMafHR({})).toBe(150); });
  it('calculates from age: 180 - 30 = 150', () => { expect(getMafHR({ age: 30 })).toBe(150); });
  it('calculates from age: 180 - 40 = 140', () => { expect(getMafHR({ age: 40 })).toBe(140); });
  it('applies positive modifier', () => { expect(getMafHR({ age: 30, modifier: 5 })).toBe(155); });
  it('applies negative modifier', () => { expect(getMafHR({ age: 30, modifier: -5 })).toBe(145); });
  it('uses overrideMAF when set', () => { expect(getMafHR({ overrideMAF: 145 })).toBe(145); });
  it('floors at 100 for extreme age', () => { expect(getMafHR({ age: 100 })).toBe(100); });
});

describe('getMafZones', () => {
  it('returns 5 zones', () => { expect(getMafZones(150)).toHaveLength(5); });
  it('zones are numbered 1-5', () => {
    const zones = getMafZones(150);
    zones.forEach((z, i) => expect(z.zone).toBe(i + 1));
  });
  it('zone 3 (MAF) lo = mafHR - 10, hi = mafHR', () => {
    const zones = getMafZones(150);
    expect(zones[2].lo).toBe(140);
    expect(zones[2].hi).toBe(150);
  });
  it('zone 1 (Recovery) lo = mafHR - 30', () => {
    const zones = getMafZones(160);
    expect(zones[0].lo).toBe(130);
  });
  it('defaults to mafHR=150 when 0 passed', () => {
    const zones = getMafZones(0);
    expect(zones[2].hi).toBe(150);
  });
});

describe('computeZones', () => {
  it('returns default zones for empty samples', () => {
    const zones = computeZones([], 150);
    expect(zones).toHaveLength(5);
    zones.forEach(z => expect(z.pct).toBe(0));
  });
  it('returns default zones for null samples', () => {
    expect(computeZones(null, 150)).toHaveLength(5);
  });
  it('computes pct from samples', () => {
    // 100 seconds all in zone 3 (140-150 bpm)
    const samples = Array.from({ length: 101 }, (_, i) => ({ sec: i, hr: 145 }));
    const zones = computeZones(samples, 150);
    const mafZone = zones.find(z => z.zone === 3);
    expect(mafZone.pct).toBeGreaterThan(0);
  });
  it('all pct values sum to ~100 for samples in one zone', () => {
    const samples = Array.from({ length: 101 }, (_, i) => ({ sec: i, hr: 145 }));
    const zones = computeZones(samples, 150);
    const total = zones.reduce((s, z) => s + z.pct, 0);
    expect(total).toBeGreaterThanOrEqual(99);
    expect(total).toBeLessThanOrEqual(101);
  });
  it('handles single HR sample (no intervals to compute — all pct 0)', () => {
    const zones = computeZones([{ sec: 0, hr: 145 }], 150);
    expect(zones).toHaveLength(5);
    zones.forEach(z => expect(z.pct).toBe(0));
  });
});

describe('computeRacePRs', () => {
  it('returns empty array for no activities', () => {
    expect(computeRacePRs([])).toEqual([]);
  });
  it('returns a 5K PR for a matching activity', () => {
    const acts = [makeAct({ distanceKm: 5.0, movingTimeSec: 1500, avgPaceSecKm: 300 })];
    const prs = computeRacePRs(acts);
    expect(prs).toHaveLength(1);
    expect(prs[0].cat).toBe('5K');
    expect(prs[0].best).toBeDefined();
  });
  it('returns multiple categories for matching activities', () => {
    const acts = [
      makeAct({ distanceKm: 5.0, movingTimeSec: 1500, avgPaceSecKm: 300 }),
      makeAct({ distanceKm: 10.0, movingTimeSec: 3200, avgPaceSecKm: 320 }),
    ];
    const prs = computeRacePRs(acts);
    expect(prs).toHaveLength(2);
  });
  it('picks the fastest as best', () => {
    const acts = [
      makeAct({ distanceKm: 5.0, movingTimeSec: 1800, avgPaceSecKm: 360, date: '2024-01-01' }),
      makeAct({ distanceKm: 5.0, movingTimeSec: 1500, avgPaceSecKm: 300, date: '2024-02-01' }),
    ];
    const prs = computeRacePRs(acts);
    expect(prs[0].best.avgPaceSecKm).toBe(300);
  });
});

describe('computeYearWrapped', () => {
  it('returns null when no activities in the year', () => {
    expect(computeYearWrapped([], 2024)).toBeNull();
    expect(computeYearWrapped([makeAct({ date: '2023-06-01' })], 2024)).toBeNull();
  });
  it('aggregates stats for activities in the year', () => {
    const acts = [
      makeAct({ date: '2024-01-10', distanceKm: 10, movingTimeSec: 3600, elevGainM: 100 }),
      makeAct({ date: '2024-03-15', distanceKm: 15, movingTimeSec: 5400, elevGainM: 200 }),
    ];
    const result = computeYearWrapped(acts, 2024);
    expect(result).not.toBeNull();
    expect(result.totalKm).toBe(25);
    expect(result.runCount).toBe(2);
    expect(result.totalElev).toBe(300);
    expect(result.months).toHaveLength(12);
  });
  it('identifies longest and best pace run', () => {
    const acts = [
      makeAct({ date: '2024-01-10', distanceKm: 10, avgPaceSecKm: 360 }),
      makeAct({ date: '2024-02-10', distanceKm: 21, avgPaceSecKm: 400 }),
    ];
    const result = computeYearWrapped(acts, 2024);
    expect(result.longest.distanceKm).toBe(21);
    expect(result.bestPace.avgPaceSecKm).toBe(360);
  });
  it('calculates everests from total elevation', () => {
    const acts = [makeAct({ date: '2024-01-10', elevGainM: 8849 })];
    const result = computeYearWrapped(acts, 2024);
    expect(result.everests).toBeCloseTo(1, 2);
  });
});

describe('computeTierProgress', () => {
  it('returns 4 tracks for empty activity list', () => {
    const result = computeTierProgress([]);
    expect(result).toHaveLength(4);
  });
  it('has correct track IDs', () => {
    const ids = computeTierProgress([]).map(t => t.id);
    expect(ids).toContain('distance');
    expect(ids).toContain('runs');
    expect(ids).toContain('streak');
    expect(ids).toContain('elevation');
  });
  it('returns progress=0 and pct=0 with no activities', () => {
    computeTierProgress([]).forEach(track => {
      expect(track.progress).toBe(0);
      expect(track.pct).toBe(0);
    });
  });
  it('tracks distance progress correctly', () => {
    const acts = Array.from({ length: 5 }, () => makeAct({ distanceKm: 10 }));
    const distTrack = computeTierProgress(acts).find(t => t.id === 'distance');
    expect(distTrack.progress).toBe(50);
    expect(distTrack.current).not.toBeNull();
  });
  it('each track has badge metadata', () => {
    computeTierProgress([]).forEach(track => {
      expect(track.badge).toBeDefined();
      expect(track.badge.tiers).toHaveLength(16);
    });
  });
});

describe('computeEarnedBadges', () => {
  it('returns empty array for no activities', () => {
    expect(computeEarnedBadges([])).toEqual([]);
  });
  it('earns first_run badge on first activity', () => {
    expect(computeEarnedBadges([makeAct()])).toContain('first_run');
  });
  it('earns distance badges when thresholds met', () => {
    const acts = [makeAct({ distanceKm: 10.5 })];
    const badges = computeEarnedBadges(acts);
    expect(badges).toContain('km_10');
    expect(badges).toContain('long_10');
    expect(badges).not.toContain('km_50');
  });
  it('earns km_50 badge when total >= 50km', () => {
    const acts = Array.from({ length: 10 }, () => makeAct({ distanceKm: 5.5 }));
    expect(computeEarnedBadges(acts)).toContain('km_50');
  });
  it('earns runs_10 badge at 10 runs', () => {
    const acts = Array.from({ length: 10 }, () => makeAct());
    expect(computeEarnedBadges(acts)).toContain('runs_10');
  });
  it('earns half marathon badge for single 21km run', () => {
    expect(computeEarnedBadges([makeAct({ distanceKm: 21.1 })])).toContain('long_21');
  });
});

describe('computeAtlCtl', () => {
  it('returns empty array for no activities', () => {
    expect(computeAtlCtl([])).toEqual([]);
  });
  it('returns array of objects with date, atl, ctl, form', () => {
    const acts = [makeAct({ date: '2024-01-10', trainingLoad: 80 })];
    const result = computeAtlCtl(acts, 30);
    expect(result.length).toBeGreaterThan(0);
    const last = result[result.length - 1];
    expect(last).toHaveProperty('date');
    expect(last).toHaveProperty('atl');
    expect(last).toHaveProperty('ctl');
    expect(last).toHaveProperty('form');
  });
  it('ATL rises faster than CTL after high-load days', () => {
    // 10 consecutive high-load days ending today — both values are current
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const acts = Array.from({ length: 10 }, (_, i) => {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - (9 - i));
      return makeAct({ date: d.toISOString().slice(0, 10), trainingLoad: 100 });
    });
    const result = computeAtlCtl(acts, 90);
    const last = result[result.length - 1];
    // ATL (7-day window) responds faster than CTL (42-day window)
    expect(last.atl).toBeGreaterThan(last.ctl);
    expect(last.form).toBeLessThan(0);
  });
  it('respects displayDays limit', () => {
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const acts = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - (4 - i));
      return makeAct({ date: d.toISOString().slice(0, 10), trainingLoad: 50 });
    });
    const result = computeAtlCtl(acts, 30);
    expect(result.length).toBeLessThanOrEqual(30);
  });
  it('form equals ctl minus atl', () => {
    const acts = [makeAct({ date: '2024-01-10', trainingLoad: 60 })];
    const result = computeAtlCtl(acts, 30);
    result.forEach(r => {
      expect(r.form).toBeCloseTo(r.ctl - r.atl, 0);
    });
  });
  it('returns all-zero atl/ctl/form when trainingLoad is 0 for all activities', () => {
    const acts = [makeAct({ date: '2024-01-10', trainingLoad: 0 })];
    const result = computeAtlCtl(acts, 30);
    expect(result.length).toBeGreaterThan(0);
    result.forEach(r => {
      expect(r.atl).toBe(0);
      expect(r.ctl).toBe(0);
      expect(r.form).toBe(0);
    });
  });
});

describe('estimateVO2max', () => {
  const pr5k  = { cat:'5K',  best:{ distanceKm:5.0,  movingTimeSec:1200, avgPaceSecKm:240 }, top3:[], history:[] };
  const pr10k = { cat:'10K', best:{ distanceKm:10.0, movingTimeSec:2520, avgPaceSecKm:252 }, top3:[], history:[] };

  it('returns null for empty array', () => { expect(estimateVO2max([])).toBeNull(); });
  it('returns null for null input', () => { expect(estimateVO2max(null)).toBeNull(); });
  it('returns null when no PR has a best', () => {
    expect(estimateVO2max([{cat:'5K',best:null}])).toBeNull();
  });
  it('returns object with required fields', () => {
    const r = estimateVO2max([pr5k]);
    expect(r).toHaveProperty('vo2max');
    expect(r).toHaveProperty('label');
    expect(r).toHaveProperty('color');
    expect(r).toHaveProperty('basedOn');
    expect(r).toHaveProperty('estimates');
  });
  it('computes correct VO2max for 20-min 5K (Jack Daniels VDOT ≈ 49.8)', () => {
    const r = estimateVO2max([pr5k]);
    expect(r.vo2max).toBeCloseTo(49.8, 0);
  });
  it('uses the PR that yields the highest VO2max as basedOn', () => {
    // pr5k gives ~49.8, pr10k (42-min 10K) gives ~49.1 — 5K wins
    const r = estimateVO2max([pr5k, pr10k]);
    expect(r.basedOn).toBe('5K');
  });
  it('includes an estimate entry for each PR', () => {
    const r = estimateVO2max([pr5k, pr10k]);
    expect(r.estimates).toHaveLength(2);
    expect(r.estimates.map(e=>e.cat)).toContain('5K');
    expect(r.estimates.map(e=>e.cat)).toContain('10K');
  });
  it('assigns Good category for VO2max ~49.8', () => {
    const r = estimateVO2max([pr5k]);
    expect(r.label).toBe('Good');
  });
  it('assigns Elite category for fast runner', () => {
    const elitePR = { cat:'5K', best:{ distanceKm:5.0, movingTimeSec:780, avgPaceSecKm:156 }, top3:[], history:[] };
    const r = estimateVO2max([elitePR]);
    expect(r.label).toBe('Elite');
    expect(r.vo2max).toBeGreaterThanOrEqual(60);
  });
  it('vo2max is a positive finite number', () => {
    const r = estimateVO2max([pr5k]);
    expect(r.vo2max).toBeGreaterThan(0);
    expect(isFinite(r.vo2max)).toBe(true);
  });
});

describe('predictRaceTimes', () => {
  const pr5k  = { cat:'5K',  best:{ distanceKm:5.0,  movingTimeSec:1200, avgPaceSecKm:240 }, top3:[], history:[] };
  const pr10k = { cat:'10K', best:{ distanceKm:10.0, movingTimeSec:2600, avgPaceSecKm:260 }, top3:[], history:[] };

  it('returns empty array for empty prs', () => {
    expect(predictRaceTimes([], [], 0)).toEqual([]);
  });
  it('returns 4 predictions when base PR exists', () => {
    expect(predictRaceTimes([pr5k], [], 0)).toHaveLength(4);
  });
  it('marks the base PR as isBase with correct time', () => {
    const base = predictRaceTimes([pr5k], [], 0).find(r => r.isBase);
    expect(base.cat).toBe('5K');
    expect(base.predictedSec).toBe(1200);
  });
  it('applies Riegel formula for 10K from 5K', () => {
    const tenK = predictRaceTimes([pr5k], [], 0).find(r => r.cat === '10K');
    expect(tenK.predictedSec).toBe(Math.round(1200 * Math.pow(10 / 5, 1.06)));
  });
  it('sets actualSec when that distance has a real PR', () => {
    expect(predictRaceTimes([pr5k, pr10k], [], 0).find(r => r.cat === '10K').actualSec).toBe(2600);
  });
  it('uses fastest pace PR as base', () => {
    const prs = [
      { cat:'5K',  best:{ distanceKm:5.0,  movingTimeSec:1500, avgPaceSecKm:300 }, top3:[], history:[] },
      { cat:'10K', best:{ distanceKm:10.0, movingTimeSec:2500, avgPaceSecKm:250 }, top3:[], history:[] },
    ];
    expect(predictRaceTimes(prs, [], 0).find(r => r.isBase).cat).toBe('10K');
  });
  it('prefers recent PRs over all-time when available', () => {
    const recent = [{ cat:'10K', best:{ distanceKm:10.0, movingTimeSec:2400, avgPaceSecKm:240 }, top3:[], history:[] }];
    const results = predictRaceTimes([pr5k], recent, 0);
    expect(results[0].usingRecent).toBe(true);
    expect(results.find(r => r.isBase).cat).toBe('10K');
  });
  it('falls back to all-time when no recent PRs', () => {
    expect(predictRaceTimes([pr5k], [], 0)[0].usingRecent).toBe(false);
  });
  it('boosts predictions when form > 8 (Energetic)', () => {
    const normal  = predictRaceTimes([pr5k], [], 0).find(r => r.cat === 'HM');
    const boosted = predictRaceTimes([pr5k], [], 10).find(r => r.cat === 'HM');
    expect(boosted.predictedSec).toBeLessThan(normal.predictedSec);
    expect(boosted.formFactor).toBe(0.97);
  });
  it('adds time when form < -8 (Fatigued)', () => {
    const normal   = predictRaceTimes([pr5k], [], 0).find(r => r.cat === 'HM');
    const fatigued = predictRaceTimes([pr5k], [], -10).find(r => r.cat === 'HM');
    expect(fatigued.predictedSec).toBeGreaterThan(normal.predictedSec);
    expect(fatigued.formFactor).toBe(1.05);
  });
  it('no form adjustment at form = 0', () => {
    const results = predictRaceTimes([pr5k], [], 0);
    expect(results[0].formFactor).toBe(1.0);
    results.forEach(r => expect(r.predictedSec).toBe(r.rawSec));
  });
});
