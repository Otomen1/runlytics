import { describe, it, expect } from 'vitest';
import { normalizeRoute, classifyRun, decodePolyline, migrateActivity, storageSizeKB } from './activity.js';

describe('storageSizeKB', () => {
  it('calculates size from string length', () => {
    // 1024 chars * 2 bytes / 1024 = 2 KB
    expect(storageSizeKB('a'.repeat(1024))).toBe(2);
  });
  it('returns 0 for empty string', () => { expect(storageSizeKB('')).toBe(0); });
  it('returns 0 for null', () => { expect(storageSizeKB(null)).toBe(0); });
  it('returns 0 for undefined', () => { expect(storageSizeKB(undefined)).toBe(0); });
});

describe('normalizeRoute', () => {
  it('returns empty array for empty input', () => { expect(normalizeRoute([])).toEqual([]); });
  it('returns empty array for null', () => { expect(normalizeRoute(null)).toEqual([]); });
  it('normalizes lon from lon field', () => {
    expect(normalizeRoute([{ lat: 51.5, lon: -0.1 }])).toEqual([{ lat: 51.5, lon: -0.1 }]);
  });
  it('normalizes lon from lng field', () => {
    expect(normalizeRoute([{ lat: 51.5, lng: -0.1 }])).toEqual([{ lat: 51.5, lon: -0.1 }]);
  });
  it('filters out invalid coordinates', () => {
    expect(normalizeRoute([{ lat: 200, lon: 0 }])).toEqual([]);
    expect(normalizeRoute([{ lat: 0, lon: 200 }])).toEqual([]);
    expect(normalizeRoute([{ lat: 'x', lon: 0 }])).toEqual([]);
  });
  it('keeps valid and discards invalid in mixed input', () => {
    const result = normalizeRoute([{ lat: 51.5, lon: -0.1 }, { lat: 200, lon: 0 }]);
    expect(result).toEqual([{ lat: 51.5, lon: -0.1 }]);
  });
  it('skips null entries in array', () => {
    const result = normalizeRoute([null, { lat: 51.5, lon: -0.1 }, null]);
    expect(result).toEqual([{ lat: 51.5, lon: -0.1 }]);
  });
});

describe('classifyRun', () => {
  it('classifies runs >= 15km as long', () => { expect(classifyRun(15, 360)).toBe('long'); });
  it('classifies runs < 320 sec/km pace as workout', () => { expect(classifyRun(8, 300)).toBe('workout'); });
  it('classifies everything else as easy', () => { expect(classifyRun(5, 400)).toBe('easy'); });
  it('long distance takes priority over fast pace', () => { expect(classifyRun(20, 280)).toBe('long'); });
  it('returns easy when pace is null', () => { expect(classifyRun(5, null)).toBe('easy'); });
  it('returns easy when pace is 0', () => { expect(classifyRun(5, 0)).toBe('easy'); });
});

describe('decodePolyline', () => {
  it('returns empty array for empty string', () => { expect(decodePolyline('')).toEqual([]); });
  it('returns empty array for null', () => { expect(decodePolyline(null)).toEqual([]); });
  it('does not throw for truncated polyline input', () => {
    expect(() => decodePolyline('_p~iF~ps')).not.toThrow();
  });
  it('decodes a known polyline string', () => {
    // "_p~iF~ps|U_ulLnnqC_mqNvxq`@" is Google's canonical example
    // encodes [(38.5, -120.2), (40.7, -120.95), (43.252, -126.453)]
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(pts).toHaveLength(3);
    expect(pts[0].lat).toBeCloseTo(38.5, 1);
    expect(pts[0].lon).toBeCloseTo(-120.2, 1);
  });
});

describe('migrateActivity', () => {
  it('returns null for null input', () => { expect(migrateActivity(null)).toBeNull(); });
  it('returns null for non-object input', () => { expect(migrateActivity('string')).toBeNull(); });
  it('fills required fields with defaults for empty object', () => {
    const result = migrateActivity({});
    expect(result).not.toBeNull();
    expect(result.name).toBe('Activity');
    expect(result.type).toBe('Run');
    expect(result.distanceKm).toBe(0);
    expect(result.movingTimeSec).toBe(0);
    expect(result.hrSamples).toEqual([]);
    expect(result.route).toEqual([]);
    expect(result.source).toBe('gpx');
    expect(result.isRace).toBe(false);
  });
  it('preserves provided values', () => {
    const result = migrateActivity({
      name: 'Morning Run',
      distanceKm: 10.5,
      movingTimeSec: 3600,
      avgPaceSecKm: 343,
      avgHR: 145,
      elevGainM: 200,
      mood: 'great',
    });
    expect(result.name).toBe('Morning Run');
    expect(result.distanceKm).toBe(10.5);
    expect(result.avgHR).toBe(145);
    expect(result.mood).toBe('great');
    expect(result.elevGainM).toBe(200);
  });
  it('classifies runClass from distance and pace', () => {
    const longRun = migrateActivity({ distanceKm: 21, avgPaceSecKm: 360 });
    expect(longRun.runClass).toBe('long');
    const workout = migrateActivity({ distanceKm: 8, avgPaceSecKm: 300 });
    expect(workout.runClass).toBe('workout');
  });
  it('rejects invalid HR values', () => {
    const result = migrateActivity({ avgHR: -5, maxHR: 0 });
    expect(result.avgHR).toBeNull();
    expect(result.maxHR).toBeNull();
  });
  it('clamps negative avgPaceSecKm to 0', () => {
    expect(migrateActivity({ avgPaceSecKm: -50 }).avgPaceSecKm).toBe(0);
  });
  it('filters invalid hrSamples', () => {
    const result = migrateActivity({
      hrSamples: [{ sec: 0, hr: 140 }, { sec: 1, hr: 20 }, { sec: 2, hr: 300 }],
    });
    // hr must be > 30 and < 250
    expect(result.hrSamples).toHaveLength(1);
    expect(result.hrSamples[0].hr).toBe(140);
  });
});
