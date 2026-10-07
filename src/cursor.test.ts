import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { open, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OctoClient } from './client.js';
import { registerCommands } from './commands.js';
import { runCli } from './errors.js';
import { getMcpTools, handleMcpTool } from './mcp.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  return { ...fs, open: vi.fn(fs.open), rename: vi.fn(fs.rename) };
});

const queries = [
  { args: ['logs', 'search'], key: 'logs' },
  { args: ['trace', 'search'], key: 'spanItems' },
  { args: ['llm'], key: 'spanItems' },
  { args: ['rum', 'list'], key: 'rumItems' },
  { args: ['events', 'list'], key: 'eventItems' },
  { args: ['events'], key: 'eventItems' },
];
const rows = [
  { id: 'first', serializedSortValues: '{"sortValues":[ "1", "first" ]}' },
  { id: 'last', serializedSortValues: '{"sortValues":[ "2", "last" ]}' },
];

describe('explicit cursor-file continuation', () => {
  let directory: string;
  let cursorFile: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'octo-cursor-test-'));
    cursorFile = join(directory, 'page.cursor');
    vi.stubEnv('OCTOPUS_TOKEN', 'test-token');
    vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');
    vi.stubEnv('OCTOPUS_ENV', 'test');
    vi.stubEnv('OCTOPUS_EXTRA_HEADERS', '{}');
  });

  afterEach(() => {
    process.exitCode = 0;
    rmSync(directory, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function setup(data: unknown, status = 200, code = 0) {
    const fetch = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ code, data, message: 'test failure' }), {
          status,
        })
    );
    vi.stubGlobal('fetch', fetch);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const program = new Command().name('octo').option('--json-errors');
    program.exitOverride().configureOutput({ writeErr: () => undefined });
    registerCommands(program);
    return { program, fetch, log, error };
  }

  function readCursor() {
    return JSON.parse(readFileSync(cursorFile, 'utf8'));
  }

  it.each(
    queries.flatMap((query) =>
      (['json', 'jsonl', 'table'] as const).map((format) => ({
        ...query,
        format,
      }))
    )
  )(
    'writes the same metadata for $args with $format',
    async ({ args, key, format }) => {
      const page = { [key]: rows, hasMore: true };
      const { program, fetch, log, error } = setup(page);
      await program.parseAsync(
        [...args, '-o', format, '--cursor-file', cursorFile],
        { from: 'user' }
      );
      expect(readCursor()).toEqual({
        hasMore: true,
        count: 2,
        scrollId: rows[1].id,
        serializedSortValues: rows[1].serializedSortValues,
      });
      expect(readFileSync(cursorFile, 'utf8').split('\n')).toHaveLength(2);
      expect(readdirSync(directory)).toEqual(['page.cursor']);
      expect(fetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
      expect(body).not.toHaveProperty('cursorFile');
      if (format === 'json') {
        expect(JSON.parse(log.mock.calls[0][0])).toEqual(page);
        expect(error).not.toHaveBeenCalled();
      } else {
        expect(error).toHaveBeenCalledWith(
          expect.stringContaining('--cursor-file')
        );
        if (format === 'jsonl')
          expect(log.mock.calls.map(([line]) => JSON.parse(line))).toEqual(
            rows
          );
        else expect(log.mock.calls[0][0]).toContain('id');
      }
    }
  );

  it.each([['llm'], ['rum', 'list'], ['events', 'list']])(
    'uses the first boundary when %j queries pre',
    async (...args) => {
      const key =
        args[0] === 'llm'
          ? 'spanItems'
          : args[0] === 'rum'
            ? 'rumItems'
            : 'eventItems';
      const { program } = setup({ [key]: rows, hasMore: true });
      await program.parseAsync(
        [...args, '--scroll-type', 'pre', '--cursor-file', cursorFile],
        { from: 'user' }
      );
      expect(readCursor()).toEqual({
        hasMore: true,
        count: 2,
        scrollId: rows[0].id,
        serializedSortValues: rows[0].serializedSortValues,
      });
    }
  );

  it.each(['asc', 'desc'])(
    'logs/Trace take the last record with order %s',
    async (order) => {
      for (const query of queries.slice(0, 2)) {
        const { program } = setup({ [query.key]: rows, hasMore: true });
        await program.parseAsync(
          [...query.args, '--order', order, '--cursor-file', cursorFile],
          { from: 'user' }
        );
        expect(readCursor().scrollId).toBe('last');
      }
    }
  );

  it.each([0, 2])(
    'overwrites a stale cursor with a terminal page of %s records',
    async (count) => {
      writeFileSync(
        cursorFile,
        JSON.stringify({ hasMore: true, scrollId: 'stale' })
      );
      const { program } = setup({ logs: rows.slice(0, count), hasMore: false });
      await program.parseAsync(
        ['logs', 'search', '--cursor-file', cursorFile],
        {
          from: 'user',
        }
      );
      expect(readCursor()).toEqual({ hasMore: false, count });
    }
  );

  it.each([true, false])(
    'normalizes lastPage=%s when supplied by an endpoint',
    async (lastPage) => {
      const { program } = setup({ eventItems: rows, lastPage });
      await program.parseAsync(['events', '--cursor-file', cursorFile], {
        from: 'user',
      });
      expect(readCursor().hasMore).toBe(!lastPage);
      expect(readCursor().scrollId).toBe(lastPage ? undefined : 'last');
    }
  );

  it.each([0, 1, 2])(
    'keeps unknown RUM completeness with %s records, including a full page',
    async (count) => {
      writeFileSync(cursorFile, '{"hasMore":true,"scrollId":"stale"}');
      const { program } = setup({ rumItems: rows.slice(0, count) });
      await program.parseAsync(
        ['rum', 'list', '-n', '2', '--cursor-file', cursorFile],
        { from: 'user' }
      );
      expect(readCursor()).toEqual({
        hasMore: null,
        count,
        ...(count
          ? {
              scrollId: rows[count - 1].id,
              serializedSortValues: rows[count - 1].serializedSortValues,
            }
          : {}),
      });
    }
  );

  it.each([undefined, null, ''])(
    'omits absent or empty sort values (%s)',
    async (sortValues) => {
      const { program } = setup({
        logs: [{ id: 'boundary', serializedSortValues: sortValues }],
        hasMore: true,
      });
      await program.parseAsync(
        ['logs', 'search', '--cursor-file', cursorFile],
        {
          from: 'user',
        }
      );
      expect(readCursor()).toEqual({
        hasMore: true,
        count: 1,
        scrollId: 'boundary',
      });
    }
  );

  it.each([
    [400, -201],
    [500, -1],
    [200, -17],
  ])(
    'keeps old cursor and exits nonzero on HTTP %s/API %s',
    async (status, code) => {
      const previous = '{"hasMore":true,"scrollId":"retry-here"}\n';
      writeFileSync(cursorFile, previous);
      const { program, log } = setup(null, status, code);
      await runCli(program, [
        'node',
        'octo',
        'logs',
        'search',
        '--cursor-file',
        cursorFile,
      ]);
      expect(process.exitCode).toBe(1);
      expect(readFileSync(cursorFile, 'utf8')).toBe(previous);
      expect(readdirSync(directory)).toEqual(['page.cursor']);
      expect(log).not.toHaveBeenCalled();
    }
  );

  it.each(['open', 'write', 'rename'])(
    'keeps old cursor and exits nonzero on %s failure',
    async (operation) => {
      const previous = '{"hasMore":true,"scrollId":"retry-here"}\n';
      writeFileSync(cursorFile, previous);
      if (operation === 'open')
        vi.mocked(open).mockRejectedValueOnce(new Error('disk failure'));
      else if (operation === 'write')
        vi.mocked(open).mockImplementationOnce(async (...args) => {
          const fs =
            await vi.importActual<typeof import('node:fs/promises')>(
              'node:fs/promises'
            );
          const handle = await fs.open(...args);
          await handle.writeFile('partial temporary data');
          vi.spyOn(handle, 'writeFile').mockRejectedValueOnce(
            new Error('disk failure')
          );
          return handle;
        });
      else vi.mocked(rename).mockRejectedValueOnce(new Error('disk failure'));
      const { program, log, error } = setup({ logs: rows, hasMore: true });
      await runCli(program, [
        'node',
        'octo',
        '--json-errors',
        'logs',
        'search',
        '--cursor-file',
        cursorFile,
      ]);
      expect(process.exitCode).toBe(1);
      expect(JSON.parse(error.mock.calls[0][0]).error.message).toBe(
        'disk failure'
      );
      expect(readFileSync(cursorFile, 'utf8')).toBe(previous);
      expect(readdirSync(directory)).toEqual(['page.cursor']);
      expect(log).not.toHaveBeenCalled();
    }
  );

  it.each([
    { logs: [], hasMore: true },
    { logs: [{ traceId: 'not-a-record-id' }], hasMore: true },
    { logs: [{ id: 'id', serializedSortValues: [1, 2] }], hasMore: true },
    { hasMore: true },
  ])(
    'does not replace the cursor with unusable page metadata: %j',
    async (page) => {
      writeFileSync(cursorFile, 'previous');
      const { program, log } = setup(page);
      await expect(
        program.parseAsync(['logs', 'search', '--cursor-file', cursorFile], {
          from: 'user',
        })
      ).rejects.toThrow('Cannot write cursor file');
      expect(readFileSync(cursorFile, 'utf8')).toBe('previous');
      expect(log).not.toHaveBeenCalled();
    }
  );

  it('reports a missing directory without creating a cursor or printing data', async () => {
    const { program, log } = setup({ logs: rows, hasMore: true });
    await expect(
      program.parseAsync(
        [
          'logs',
          'search',
          '--cursor-file',
          join(directory, 'missing', 'cursor'),
        ],
        { from: 'user' }
      )
    ).rejects.toThrow('ENOENT');
    expect(readdirSync(directory)).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it('never reads an existing cursor implicitly', async () => {
    writeFileSync(cursorFile, 'this is deliberately not JSON');
    const { program, fetch } = setup({ logs: rows, hasMore: false });
    await program.parseAsync(['logs', 'search', '--cursor-file', cursorFile], {
      from: 'user',
    });
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(body).not.toHaveProperty('scrollId');
    expect(body).not.toHaveProperty('serializedSortValues');
  });

  it('does not expose cursor-file on Issues and rejects an empty path before HTTP', async () => {
    const { program, fetch } = setup({ logs: [], hasMore: false });
    await expect(
      program.parseAsync(['issues', 'search', '--cursor-file', cursorFile], {
        from: 'user',
      })
    ).rejects.toThrow('unknown option');
    await expect(
      program.parseAsync(['logs', 'search', '--cursor-file', ''], {
        from: 'user',
      })
    ).rejects.toThrow('non-empty file path');
    expect(fetch).not.toHaveBeenCalled();
    expect(readdirSync(directory)).toEqual([]);
  });

  it('documents the success, terminal, unknown and failure contracts in help', () => {
    const { program, fetch } = setup(null);
    const logs = program.commands.find((command) => command.name() === 'logs');
    let help = '';
    logs?.commands[0]
      .configureOutput({
        writeOut: (text) => {
          help += text;
        },
      })
      .outputHelp();
    expect(help).toContain('--cursor-file');
    expect(help).toContain('hasMore:null');
    expect(help).toContain('"hasMore":false');
    expect(help).toContain('Read only after exit 0');
    expect(help).toContain('No automatic file reading');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('passes the paired Trace sort cursor through CLI and MCP without rewriting it', async () => {
    const sortValues = rows[1].serializedSortValues;
    const { program, fetch } = setup({ spanItems: rows, hasMore: true });
    await program.parseAsync(
      [
        'trace',
        'search',
        '--scroll-id',
        'last',
        '--serialized-sort-values',
        sortValues,
        '--cursor-file',
        cursorFile,
      ],
      { from: 'user' }
    );
    const tool = getMcpTools().find(
      (tool) => tool.name === 'octo_trace_search'
    );
    expect(tool?.inputSchema.properties).toHaveProperty('serializedSortValues');
    const client = new OctoClient('https://example.com', { token: 'test' });
    await handleMcpTool(
      'octo_trace_search',
      { scrollId: 'last', serializedSortValues: sortValues },
      client
    );
    for (const [, init] of fetch.mock.calls) {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        scrollId: 'last',
        serializedSortValues: sortValues,
      });
    }
  });
});
