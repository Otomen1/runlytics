import { describe, it, expect } from 'vitest';
import {
  getMafHR,
  getMafZones,
  computeZones,
  computeRacePRs,
  computeYearWrapped,
  computeTierProgress,
  computeEarnedBadges,
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
