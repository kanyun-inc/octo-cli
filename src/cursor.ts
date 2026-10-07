import { randomUUID } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { printOutput } from './output.js';

type RecordKey = 'logs' | 'spanItems' | 'rumItems' | 'eventItems';

export interface CursorMetadata {
  hasMore: boolean | null;
  count: number;
  scrollId?: string;
  serializedSortValues?: string;
}

/** Preserve the API's completeness signal and the boundary's opaque cursor. */
function cursorMetadata(
  data: unknown,
  recordKey: RecordKey,
  direction?: string
): CursorMetadata {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Cannot write cursor file: expected a page response');
  }
  const page = data as Record<string, unknown>;
  const records = page[recordKey];
  if (!Array.isArray(records)) {
    throw new Error(`Cannot write cursor file: expected ${recordKey} records`);
  }
  const hasMore =
    typeof page.hasMore === 'boolean'
      ? page.hasMore
      : typeof page.lastPage === 'boolean'
        ? !page.lastPage
        : null;
  const metadata: CursorMetadata = { hasMore, count: records.length };
  if (hasMore === false || (hasMore === null && !records.length)) {
    return metadata;
  }
  const boundary = direction === 'pre' ? records[0] : records.at(-1);
  if (!boundary || typeof boundary.id !== 'string' || !boundary.id.trim()) {
    throw new Error('Cannot write cursor file: missing boundary record id');
  }
  metadata.scrollId = boundary.id;
  const sortValues = boundary.serializedSortValues;
  if (sortValues !== undefined && sortValues !== null) {
    if (typeof sortValues !== 'string') {
      throw new Error('Cannot write cursor file: expected opaque sort string');
    }
    if (sortValues.length) metadata.serializedSortValues = sortValues;
  }
  return metadata;
}

/** Replace only after the complete file has been written in the same directory. */
export async function writeCursorFile(
  path: string,
  metadata: CursorMetadata
): Promise<void> {
  const destination = resolve(path);
  const temporary = join(
    dirname(destination),
    `.${basename(destination)}.${randomUUID()}.tmp`
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let created = false;
  try {
    handle = await open(temporary, 'wx', 0o600);
    created = true;
    await handle.writeFile(`${JSON.stringify(metadata)}\n`, 'utf8');
    await handle.close();
    handle = undefined;
    await rename(temporary, destination);
  } finally {
    // Cleanup must not replace the original write/rename error.
    await handle?.close().catch(() => undefined);
    if (created) await rm(temporary, { force: true }).catch(() => undefined);
  }
}

/** A cursor-file failure must propagate before emitting a successful data page. */
export async function printPageOutput(
  data: unknown,
  opts: {
    output: 'json' | 'jsonl' | 'table';
    cursorFile?: string;
    scrollType?: string;
  },
  recordKey: RecordKey
): Promise<void> {
  if (opts.cursorFile !== undefined) {
    await writeCursorFile(
      opts.cursorFile,
      cursorMetadata(data, recordKey, opts.scrollType)
    );
  }
  printOutput(data, opts.output, opts.cursorFile !== undefined);
}
