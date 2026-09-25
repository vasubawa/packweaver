import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Instance } from '../../types';

const checkPackUpdates = vi.fn();
vi.mock('../packUpdates', () => ({ checkPackUpdates: (i: Instance) => checkPackUpdates(i) }));
vi.mock('../appLog', () => ({ appLog: () => {} }));

const { instancesNeedingScan, applyScanCache, scanForUpdates, SCAN_INTERVAL_MS } =
  await import('../updateScan');

const pack = (id: string, over: Partial<Instance> = {}) => ({ id, ...over }) as Instance;

beforeEach(() => checkPackUpdates.mockReset());

describe('instancesNeedingScan', () => {
  const now = 1_000_000_000;

  it('includes packs never scanned', () => {
    expect(instancesNeedingScan([pack('a')], {}, now).map(i => i.id)).toEqual(['a']);
  });

  it('skips a pack scanned inside the interval', () => {
    const cache = { a: { checkedAt: now - 60_000, hasUpdate: false } };
    expect(instancesNeedingScan([pack('a')], cache, now)).toEqual([]);
  });

  it('includes a pack whose scan has aged out', () => {
    const cache = { a: { checkedAt: now - SCAN_INTERVAL_MS - 1, hasUpdate: false } };
    expect(instancesNeedingScan([pack('a')], cache, now).map(i => i.id)).toEqual(['a']);
  });
});

describe('applyScanCache', () => {
  it('sets hasUpdate from the cache', () => {
    const out = applyScanCache([pack('a')], { a: { checkedAt: 1, hasUpdate: true } });
    expect(out[0].hasUpdate).toBe(true);
  });

  it('leaves the object identity alone when nothing changes', () => {
    const input = [pack('a', { hasUpdate: true })];
    const out = applyScanCache(input, { a: { checkedAt: 1, hasUpdate: true } });
    expect(out[0]).toBe(input[0]);
  });
});

describe('scanForUpdates', () => {
  it('reports an update when the base pack or any custom has one', async () => {
    checkPackUpdates.mockResolvedValue({ base: { available: false }, customs: [{}] });
    const seen: Record<string, boolean> = {};
    await scanForUpdates([pack('a')], (id, e) => (seen[id] = e.hasUpdate));
    expect(seen).toEqual({ a: true });
  });

  it('reports no update for a current pack', async () => {
    checkPackUpdates.mockResolvedValue({ base: { available: false }, customs: [] });
    const seen: Record<string, boolean> = {};
    await scanForUpdates([pack('a')], (id, e) => (seen[id] = e.hasUpdate));
    expect(seen).toEqual({ a: false });
  });

  // One unreachable provider must not stop the badge for every other pack.
  it('continues past a pack that fails', async () => {
    checkPackUpdates
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ base: { available: true }, customs: [] });
    const seen: Record<string, boolean> = {};
    await scanForUpdates([pack('a'), pack('b')], (id, e) => (seen[id] = e.hasUpdate));
    expect(seen).toEqual({ b: true });
  });

  it('stops early when cancelled', async () => {
    checkPackUpdates.mockResolvedValue({ base: { available: false }, customs: [] });
    await scanForUpdates(
      [pack('a'), pack('b')],
      () => {},
      () => true
    );
    expect(checkPackUpdates).not.toHaveBeenCalled();
  });
});
