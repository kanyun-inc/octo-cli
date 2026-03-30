/**
 * Parse human-friendly duration strings like "15m", "1h", "2d" into milliseconds.
 */
export function parseDuration(input: string): number {
  const match = input.match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d|w)$/);
  if (!match) throw new Error(`Invalid duration: "${input}"`);

  const value = Number.parseFloat(match[1]);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };

  return Math.floor(value * multipliers[unit]);
}

/**
 * Resolve --last / --from / --to into { from, to } timestamps (ms).
 */
export function resolveTimeRange(opts: {
  last?: string;
  from?: string;
  to?: string;
}): { from: number; to: number } {
  const now = Date.now();

  if (opts.last) {
    const ms = parseDuration(opts.last);
    return { from: now - ms, to: now };
  }

  if (opts.from) {
    const from = parseTimestamp(opts.from);
    const to = opts.to ? parseTimestamp(opts.to) : now;
    return { from, to };
  }

  // Default: last 15 minutes
  return { from: now - 15 * 60_000, to: now };
}

function parseTimestamp(input: string): number {
  // Pure numeric → treat as epoch ms
  if (/^\d{13}$/.test(input)) return Number.parseInt(input, 10);
  // Epoch seconds
  if (/^\d{10}$/.test(input)) return Number.parseInt(input, 10) * 1000;
  // ISO date string
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid time: "${input}"`);
  return d.getTime();
}
