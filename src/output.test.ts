import { afterEach, describe, expect, it, vi } from 'vitest';
import { printOutput } from './output.js';

describe('record output', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['logs', 'spanItems', 'rumItems', 'eventItems', 'issues', 'list'])(
    'prints one JSONL record per line from %s while keeping metadata on stderr',
    (key) => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const error = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const rows = [{ id: '1', attributes: { status: 500 } }, { id: '2' }];
      printOutput({ [key]: rows, hasMore: true }, 'jsonl');
      expect(log.mock.calls.map(([text]) => JSON.parse(text))).toEqual(rows);
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('More records')
      );
    }
  );

  it('preserves the complete JSON envelope and emits no pagination warning', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const page = { logs: [{ id: '1' }], hasMore: true };
    printOutput(page);
    expect(JSON.parse(log.mock.calls[0][0])).toEqual(page);
    expect(error).not.toHaveBeenCalled();
  });

  it.each(['jsonl', 'table'] as const)(
    'explains truncated Issues without suggesting a nonexistent next page for %s',
    (format) => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const error = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const page = { issues: [{ id: 'issue-1' }], hasMore: true };
      printOutput(page, format);
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining(
          'at most 99 Issues and has no pagination controls'
        )
      );
      expect(error.mock.calls[0][0]).toContain(
        'narrow the service/query/time window'
      );
      if (format === 'jsonl')
        expect(JSON.parse(log.mock.calls[0][0])).toEqual(page.issues[0]);
      error.mockClear();
      printOutput({ ...page, hasMore: false }, format);
      expect(error).not.toHaveBeenCalled();
    }
  );

  it.each(['jsonl', 'table'] as const)(
    'prints no data for an empty %s page',
    (format) => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      printOutput({ logs: [], hasMore: false }, format);
      expect(log).not.toHaveBeenCalled();
    }
  );

  it('renders record columns, nested values, and fields present only in later rows', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    printOutput(
      {
        logs: [
          { id: '1', attributes: { status: 500 } },
          { id: '2', message: 'hello\nworld' },
        ],
      },
      'table'
    );
    const output = log.mock.calls.map(([text]) => text).join('\n');
    expect(output).toContain('id');
    expect(output).toContain('message');
    expect(output).toContain('{"status":500}');
    expect(output).toContain('hello\\nworld');
    expect(output).not.toContain('[object Object]');
  });

  it('keeps singleton details as one JSONL record and handles scalar table arrays', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    printOutput({ id: '1', message: 'detail' }, 'jsonl');
    expect(log).toHaveBeenCalledWith('{"id":"1","message":"detail"}');
    log.mockClear();
    printOutput(['a', null], 'table');
    expect(log.mock.calls).toEqual([['a'], ['']]);
  });
});
