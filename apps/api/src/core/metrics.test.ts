import { describe, expect, it } from 'vitest';
import { metricsDue } from './metrics';

const H = 3600_000;
const now = Date.parse('2026-11-17T12:00:00Z');
const ago = (ms: number) => new Date(now - ms);

describe('metricsDue', () => {
  it('hiç çekilmemişse her zaman', () => {
    expect(metricsDue(ago(40 * 24 * H), null, now)).toBe(true);
  });

  it('ilk hafta 6 saatte bir', () => {
    expect(metricsDue(ago(2 * 24 * H), ago(5 * H), now)).toBe(false);
    expect(metricsDue(ago(2 * 24 * H), ago(7 * H), now)).toBe(true);
  });

  it('bir haftadan eskiyse günde bir', () => {
    expect(metricsDue(ago(10 * 24 * H), ago(7 * H), now)).toBe(false);
    expect(metricsDue(ago(10 * 24 * H), ago(25 * H), now)).toBe(true);
  });

  it('elle yenilemede son 10 dakikada çekilmemiş her şey', () => {
    expect(metricsDue(ago(10 * 24 * H), ago(5 * 60_000), now, true)).toBe(false);
    expect(metricsDue(ago(10 * 24 * H), ago(15 * 60_000), now, true)).toBe(true);
  });
});
