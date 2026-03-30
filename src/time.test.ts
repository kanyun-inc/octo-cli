import { describe, expect, it } from 'vitest';
import { parseDuration, resolveTimeRange } from './time.js';

describe('parseDuration', () => {
  it('parses seconds', () => {
    expect(parseDuration('30s')).toBe(30_000);
  });

  it('parses minutes', () => {
    expect(parseDuration('15m')).toBe(900_000);
  });

  it('parses hours', () => {
    expect(parseDuration('2h')).toBe(7_200_000);
  });

  it('parses days', () => {
    expect(parseDuration('1d')).toBe(86_400_000);
  });

  it('parses weeks', () => {
    expect(parseDuration('1w')).toBe(604_800_000);
  });

  it('throws on invalid input', () => {
    expect(() => parseDuration('abc')).toThrow('Invalid duration');
    expect(() => parseDuration('10x')).toThrow('Invalid duration');
  });
});

describe('resolveTimeRange', () => {
  it('uses --last to compute range', () => {
    const before = Date.now();
    const { from, to } = resolveTimeRange({ last: '1h' });
    expect(to).toBeGreaterThanOrEqual(before);
    expect(to - from).toBe(3_600_000);
  });

  it('defaults to 15 minutes', () => {
    const { from, to } = resolveTimeRange({});
    expect(to - from).toBe(15 * 60_000);
  });

  it('parses epoch ms from/to', () => {
    const { from, to } = resolveTimeRange({
      from: '1700000000000',
      to: '1700001000000',
    });
    expect(from).toBe(1700000000000);
    expect(to).toBe(1700001000000);
  });

  it('parses ISO date from/to', () => {
    const { from, to } = resolveTimeRange({
      from: '2024-01-01T00:00:00Z',
      to: '2024-01-01T01:00:00Z',
    });
    expect(from).toBe(new Date('2024-01-01T00:00:00Z').getTime());
    expect(to).toBe(new Date('2024-01-01T01:00:00Z').getTime());
  });
});
