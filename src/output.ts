/**
 * Print data in requested format.
 */
export function printOutput(
  data: unknown,
  format: 'json' | 'table' | 'jsonl' = 'json'
): void {
  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (format === 'jsonl') {
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      console.log(JSON.stringify(item));
    }
    return;
  }

  // table format
  if (Array.isArray(data) && data.length > 0) {
    printTable(data);
  } else if (data && typeof data === 'object') {
    printKV(data as Record<string, unknown>);
  } else {
    console.log(data);
  }
}

function printTable(rows: Record<string, unknown>[]): void {
  const keys = Object.keys(rows[0]);
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length))
  );

  const header = keys.map((k, i) => k.padEnd(widths[i])).join('  ');
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');

  console.log(header);
  console.log(sep);
  for (const row of rows) {
    const line = keys
      .map((k, i) => String(row[k] ?? '').padEnd(widths[i]))
      .join('  ');
    console.log(line);
  }
}

function printKV(obj: Record<string, unknown>): void {
  const maxKey = Math.max(...Object.keys(obj).map((k) => k.length));
  for (const [k, v] of Object.entries(obj)) {
    const val = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
    console.log(`${k.padEnd(maxKey)}  ${val}`);
  }
}

/**
 * Format epoch ms to human-readable local time.
 */
export function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

/**
 * Format duration in ms to human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}
