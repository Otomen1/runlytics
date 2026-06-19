// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Each test gets its own IDBFactory so there's no shared state between tests
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
globalThis.IDBKeyRange = FDBKeyRange;

let loadActivities, saveActivity, saveActivitiesBatch, deleteActivity,
    deletePhotosForActivity, addPhoto, getPhotos, deletePhoto;

function makeAct(overrides = {}) {
  return {
    id: 'act-' + Math.random().toString(36).slice(2),
    name: 'Morning Run', type: 'Run', date: '2025-06-01',
    dateTs: new Date('2025-06-01').getTime(),
    distanceKm: 10, movingTimeSec: 3600, avgPaceSecKm: 360,
    avgHR: 145, maxHR: 170, elevGainM: 50, elevLossM: 0,
    runClass: 'easy', hrSamples: [], route: [], source: 'gpx', trainingLoad: 60,
    notes: '', mood: null, photoCount: 0, shoeId: null, isRace: false,
    raceGoalSec: null, raceLocation: '',
    ...overrides,
  };
}

beforeEach(async () => {
  // Fresh IDB factory per test — no cross-test data bleed
  globalThis.indexedDB = new FDBFactory();
  vi.resetModules();
  const mod = await import('./indexedDB.js');
  loadActivities          = mod.loadActivities;
  saveActivity            = mod.saveActivity;
  saveActivitiesBatch     = mod.saveActivitiesBatch;
  deleteActivity          = mod.deleteActivity;
  deletePhotosForActivity = mod.deletePhotosForActivity;
  addPhoto                = mod.addPhoto;
  getPhotos               = mod.getPhotos;
  deletePhoto             = mod.deletePhoto;
});

describe('saveActivity + loadActivities', () => {
  it('saves and reloads a single activity', async () => {
    const act = makeAct({ name: 'Long Run', distanceKm: 21 });
    await saveActivity(act);
    const loaded = await loadActivities();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Long Run');
    expect(loaded[0].distanceKm).toBe(21);
  });

  it('rejects saveActivity with no id', async () => {
    await expect(saveActivity({ name: 'No ID' })).rejects.toThrow('missing id');
  });

  it('returns empty array when no activities stored', async () => {
    const loaded = await loadActivities();
    expect(loaded).toEqual([]);
  });

  it('sorts activities by dateTs descending', async () => {
    const older = makeAct({ id: 'a1', dateTs: 1000, date: '2024-01-01' });
    const newer = makeAct({ id: 'a2', dateTs: 2000, date: '2025-01-01' });
    await saveActivity(older);
    await saveActivity(newer);
    const loaded = await loadActivities();
    expect(loaded[0].id).toBe('a2');
    expect(loaded[1].id).toBe('a1');
  });
});

describe('saveActivitiesBatch', () => {
  it('saves multiple activities in one call', async () => {
    const acts = [makeAct({ id: 'b1' }), makeAct({ id: 'b2' }), makeAct({ id: 'b3' })];
    await saveActivitiesBatch(acts);
    const loaded = await loadActivities();
    expect(loaded).toHaveLength(3);
  });

  it('resolves immediately for empty batch', async () => {
    await expect(saveActivitiesBatch([])).resolves.toBeUndefined();
  });
});

describe('deleteActivity', () => {
  it('removes the activity from IDB', async () => {
    const act = makeAct({ id: 'del-1' });
    await saveActivity(act);
    await deleteActivity('del-1');
    const loaded = await loadActivities();
    expect(loaded).toHaveLength(0);
  });

  it('is a no-op for a non-existent id', async () => {
    await expect(deleteActivity('ghost-id')).resolves.toBeUndefined();
  });
});

describe('photos', () => {
  it('adds and retrieves a photo', async () => {
    const blob = new Blob(['fake-image'], { type: 'image/jpeg' });
    Object.defineProperty(blob, 'size', { value: 1024 });
    const id = await addPhoto('photo-act', blob, blob, 'image/jpeg');
    expect(typeof id).toBe('number');
    const photos = await getPhotos('photo-act');
    expect(photos).toHaveLength(1);
    expect(photos[0].activityId).toBe('photo-act');
    expect(photos[0].mimeType).toBe('image/jpeg');
  });

  it('rejects unsupported MIME types', async () => {
    const blob = new Blob(['x'], { type: 'image/gif' });
    Object.defineProperty(blob, 'size', { value: 1 });
    await expect(addPhoto('any', blob, blob, 'image/gif')).rejects.toThrow('Unsupported photo type');
  });

  it('rejects blobs over 10 MB', async () => {
    const bigBlob = new Blob(['x'], { type: 'image/jpeg' });
    Object.defineProperty(bigBlob, 'size', { value: 11 * 1024 * 1024 });
    await expect(addPhoto('any', bigBlob, bigBlob, 'image/jpeg')).rejects.toThrow('10 MB');
  });

  it('deletePhotosForActivity removes all photos for that activity', async () => {
    const blob = new Blob(['img'], { type: 'image/png' });
    Object.defineProperty(blob, 'size', { value: 512 });
    await addPhoto('act-x', blob, blob, 'image/png');
    await addPhoto('act-x', blob, blob, 'image/png');
    await addPhoto('act-y', blob, blob, 'image/png');
    await deletePhotosForActivity('act-x');
    expect(await getPhotos('act-x')).toHaveLength(0);
    expect(await getPhotos('act-y')).toHaveLength(1);
  });

  it('deletePhoto removes a single photo by id', async () => {
    const blob = new Blob(['img'], { type: 'image/webp' });
    Object.defineProperty(blob, 'size', { value: 256 });
    const id = await addPhoto('act-z', blob, blob, 'image/webp');
    await deletePhoto(id);
    expect(await getPhotos('act-z')).toHaveLength(0);
  });
});
