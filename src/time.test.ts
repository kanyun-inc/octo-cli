import { describe, expect, it } from 'vitest';
import { parseDuration, parseTimestamp, resolveTimeRange } from './time.js';

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
  it('rejects an orphan end time and reversed or empty ranges', () => {
    expect(() => resolveTimeRange({ to: '1700000000000' })).toThrow(
      '--to requires --from'
    );
    expect(() =>
      resolveTimeRange({ from: '1700000000000', to: '1700000000000' })
    ).toThrow('earlier');
    expect(() =>
      resolveTimeRange({ from: '1700000000001', to: '1700000000000' })
    ).toThrow('earlier');
  });
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

  it('--from/--to takes precedence over --last', () => {
    const { from, to } = resolveTimeRange({
      last: '1h',
      from: '2024-06-01T00:00:00Z',
      to: '2024-06-01T23:59:59Z',
    });
    expect(from).toBe(new Date('2024-06-01T00:00:00Z').getTime());
    expect(to).toBe(new Date('2024-06-01T23:59:59Z').getTime());
  });
});

describe('point-in-time parsing', () => {
  it.each(['1790596560000', '1790596560', '2026-09-28T19:56:00+08:00'])(
    'parses %s consistently',
    (input) => {
      expect(parseTimestamp(input)).toBe(1790596560000);
    }
  );
  it('rejects invalid timestamps and nonpositive durations', () => {
    expect(() => parseTimestamp('invalid')).toThrow('Invalid time');
    expect(() => parseDuration('0s')).toThrow('positive');
    expect(() => parseDuration('999999999999999999w')).toThrow('finite');
  });
});
