/**
 * Print data in requested format.
 */
export function printOutput(
  data: unknown,
  format: 'json' | 'table' | 'jsonl' = 'json',
  cursorFileWritten = false
): void {
  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (format !== 'jsonl' && format !== 'table') {
    throw new Error('Output format must be one of: json, table, jsonl');
  }
  const recordKeys = [
    'logs',
    'spanItems',
    'rumItems',
    'eventItems',
    'issues',
    'list',
  ];
  let records = data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const page = data as Record<string, unknown>;
    const key = recordKeys.find((key) => Array.isArray(page[key]));
    if (key) {
      records = page[key];
      if (page.hasMore === true || page.lastPage === false) {
        console.error(
          key === 'issues'
            ? 'More records match this Issue search. The API returns at most 99 Issues and has no pagination controls; narrow the service/query/time window. This result is incomplete.'
            : cursorFileWritten
              ? 'More records are available. Pagination metadata is in --cursor-file; keep the same filters/time range when continuing.'
              : 'More records are available. Use -o json for pagination metadata and keep the same filters/time range when continuing.'
        );
      }
    }
  }

  if (format === 'jsonl') {
    const items = Array.isArray(records) ? records : [records];
    for (const item of items) {
      console.log(JSON.stringify(item));
    }
    return;
  }

  // table format
  if (Array.isArray(records)) {
    if (records.length === 0) return;
    if (
      records.every(
        (row) => row !== null && typeof row === 'object' && !Array.isArray(row)
      )
    ) {
      printTable(records);
    } else {
      for (const row of records) console.log(formatValue(row));
    }
  } else if (records && typeof records === 'object') {
    printKV(records as Record<string, unknown>);
  } else {
    console.log(records);
  }
}

function printTable(rows: Record<string, unknown>[]): void {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => formatValue(r[k]).length))
  );

  const header = keys.map((k, i) => k.padEnd(widths[i])).join('  ');
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');

  console.log(header);
  console.log(sep);
  for (const row of rows) {
    const line = keys
      .map((k, i) => formatValue(row[k]).padEnd(widths[i]))
      .join('  ');
    console.log(line);
  }
}

function formatValue(value: unknown): string {
  return (
    value != null && typeof value === 'object'
      ? JSON.stringify(value)
      : String(value ?? '')
  ).replace(/[\r\n]/g, '\\n');
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
