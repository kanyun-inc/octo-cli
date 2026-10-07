import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OctoClient } from './client.js';
import { registerCommands } from './commands.js';
import { getDefaultEnv } from './config.js';
import { configureCommandHelp } from './help.js';
import { getMcpTools, handleMcpTool } from './mcp.js';

function setup(data: unknown = []) {
  vi.stubEnv('OCTOPUS_TOKEN', 'test-token');
  vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');
  vi.stubEnv('OCTOPUS_ENV', 'test');
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : {} });
    return new Response(JSON.stringify({ code: 0, data, message: 'ok' }));
  });
  vi.stubGlobal('fetch', fetch);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const program = new Command().name('octo');
  program.exitOverride().configureOutput({ writeErr: () => undefined });
  registerCommands(program);
  return { program, calls, fetch };
}

describe('reported CLI regressions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(['1790596560000', '1790596560', '2026-09-28T19:56:00+08:00'])(
    'metrics point accepts %s',
    async (at) => {
      const { program, calls } = setup();
      await program.parseAsync(
        ['metrics', 'point', 'sum(test{})', '--at', at],
        { from: 'user' }
      );
      expect(calls[0].body.to).toBe(1790596560000);
    }
  );

  it('RUM detail sends explicit or configured env and safely encodes record IDs', async () => {
    const first = setup();
    await first.program.parseAsync(
      ['rum', 'detail', 'id/a', '-e', 'online', '--timestamp', '1790596560000'],
      { from: 'user' }
    );
    expect(first.calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/rum/id%2Fa?env=online&timestamp=1790596560000'
    );
    const second = setup();
    await second.program.parseAsync(
      ['rum', 'detail', 'id', '--timestamp', '1790596560000'],
      { from: 'user' }
    );
    expect(second.calls[0].url).toContain('?env=test');
  });

  it.each([
    [['logs', 'search', '-e', 'bad'], 'must be one of'],
    [['alerts', 'rules', '-e', 'online,bad'], 'must be one of'],
    [['logs', 'search', '--to', '1790596560000'], '--to requires --from'],
    [['metrics', 'point', 'sum(test{})', '--at', 'invalid'], 'Invalid time'],
    [
      ['issues', 'assign', '--user', '1', '--ids', 'a', '--source', 'xyz'],
      '--source must be one of',
    ],
    [['alerts', 'search', '-s', 'typo'], '--status must be one of'],
    [['logs', 'search', '-o', 'typo'], '--output must be one of'],
    [['logs', 'search', '-n', '12x'], 'positive integer'],
    [['trace', 'search', '-n', '501'], 'must not exceed 500'],
    [['rum', 'list', '--scroll-type', 'bad'], '--scroll-type must be one of'],
    [['llm', '--sort-order', 'asc'], '--sort-order requires --sort'],
    [
      ['logs', 'aggregate', '-g', 'service:100', '-g', 'level:20'],
      'product no greater than 1000',
    ],
  ])('rejects %j without HTTP', async (args, error) => {
    const { program, fetch } = setup();
    await expect(program.parseAsync(args, { from: 'user' })).rejects.toThrow(
      error
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an invalid configured env instead of reporting no data', async () => {
    const { program, fetch } = setup();
    vi.stubEnv('OCTOPUS_ENV', 'bad');
    expect(() => getDefaultEnv()).toThrow('must be one of');
    await expect(
      program.parseAsync(['logs', 'search'], { from: 'user' })
    ).rejects.toThrow('must be one of');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('documents and maps alerts status all to an omitted API filter', async () => {
    const { program, calls } = setup();
    await program.parseAsync(['alerts', 'search', '-s', 'all'], {
      from: 'user',
    });
    expect(calls[0].body).not.toHaveProperty('status');
    expect(calls[0].body).not.toHaveProperty('env');
  });

  it.each([
    ['logs', 'search'],
    ['trace', 'search'],
  ])(
    'forwards the %s cursor while keeping the query/window',
    async (...command) => {
      const { program, calls } = setup();
      const sortArgs =
        command[0] === 'logs' ? ['--serialized-sort-values', '[123,"a"]'] : [];
      await program.parseAsync(
        [
          ...command,
          '-q',
          'service = myapp',
          '--from',
          '1790596500000',
          '--to',
          '1790596800000',
          '--order',
          'asc',
          '--scroll-id',
          'record-123',
          ...sortArgs,
        ],
        { from: 'user' }
      );
      expect(calls[0].body).toMatchObject({
        env: 'test',
        query: 'service = myapp',
        from: 1790596500000,
        to: 1790596800000,
        order: 'asc',
        scrollId: 'record-123',
      });
      if (command[0] === 'logs')
        expect(calls[0].body.serializedSortValues).toBe('[123,"a"]');
    }
  );

  it.each([['llm'], ['rum', 'list'], ['events', 'list'], ['events']])(
    'forwards cursor, direction, sort values and sort for %j',
    async (...command) => {
      const { program, calls } = setup();
      await program.parseAsync(
        [
          ...command,
          '-n',
          '5',
          '--scroll-id',
          'record-123',
          '--scroll-type',
          'next',
          '--serialized-sort-values',
          '[123,"a"]',
          '--sort',
          'duration',
          '--sort-order',
          'asc',
          '--sort-operation',
          'p95',
        ],
        { from: 'user' }
      );
      expect(calls[0].body).toMatchObject({
        pageSize: 5,
        scrollId: 'record-123',
        scrollType: 'next',
        serializedSortValues: '[123,"a"]',
        sort: {
          field: 'duration',
          order: 'asc',
          operation: { operationEnum: 'p95' },
        },
      });
    }
  );

  it('does not force a custom sort when no sort flags are supplied', async () => {
    const { program, calls } = setup();
    await program.parseAsync(['llm'], { from: 'user' });
    expect(calls[0].body).not.toHaveProperty('sort');
  });

  it('exposes topology entry filters and service-list filtering', async () => {
    const first = setup();
    await first.program.parseAsync(
      [
        'services',
        'topo',
        'myapp',
        '--entry-span-name',
        '/checkout',
        '--entry-span-operation',
        'http.server',
      ],
      { from: 'user' }
    );
    expect(first.calls[0].body).toMatchObject({
      service: 'myapp',
      entrySpanName: '/checkout',
      entrySpanOperation: 'http.server',
    });
    const second = setup();
    await second.program.parseAsync(
      ['services', 'list', '--service', 'myapp'],
      { from: 'user' }
    );
    expect(second.calls[0].body.service).toBe('myapp');
  });

  it('warns when the API ignores group-by without contaminating JSON data', async () => {
    const rows = [{ fields: {}, values: { 'count(*)': 42 } }];
    const { program } = setup(rows);
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await program.parseAsync(['logs', 'aggregate', '-g', 'errorInfo'], {
      from: 'user',
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('no groups returned for errorInfo')
    );
    expect(console.log).toHaveBeenCalledWith(JSON.stringify(rows, null, 2));
  });

  it('MCP RUM detail accepts env and keeps a working configured default', async () => {
    const { calls } = setup();
    const client = new OctoClient('https://example.com', { token: 'test' });
    expect(
      getMcpTools().find((tool) => tool.name === 'octo_rum_detail')?.inputSchema
        .properties
    ).toHaveProperty('env');
    await handleMcpTool(
      'octo_rum_detail',
      { id: 'id', env: 'online', timestamp: 1790596560000 },
      client
    );
    await handleMcpTool(
      'octo_rum_detail',
      { id: 'id', timestamp: 1790596560000 },
      client
    );
    expect(calls.map((call) => call.url)).toEqual([
      'https://example.com/infra-octopus-openapi/v1/rum/id?env=online&timestamp=1790596560000',
      'https://example.com/infra-octopus-openapi/v1/rum/id?env=test&timestamp=1790596560000',
    ]);
  });

  it('keeps HTTP status and API codes visible to MCP callers', async () => {
    setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: -201, message: 'bad query' }), {
            status: 400,
          })
      )
    );
    const client = new OctoClient('https://example.com', { token: 'test' });
    const result = await handleMcpTool(
      'octo_rum_detail',
      { id: 'id', timestamp: 1790596560000 },
      client
    );
    expect(result).toMatchObject({
      isError: true,
      content: [{ text: 'Error: HTTP 400, code=-201: bad query' }],
    });
  });

  it.each(['1790596560000', '1790596560', '2026-09-28T19:56:00+08:00'])(
    'RUM detail locates an event using timestamp %s',
    async (timestamp) => {
      const { program, calls } = setup();
      await program.parseAsync(
        ['rum', 'detail', 'id', '--timestamp', timestamp],
        {
          from: 'user',
        }
      );
      expect(new URL(calls[0].url).searchParams.get('timestamp')).toBe(
        '1790596560000'
      );
    }
  );

  it('requires a valid RUM event timestamp in CLI and MCP before HTTP', async () => {
    const { program, fetch } = setup();
    await expect(
      program.parseAsync(['rum', 'detail', 'id'], { from: 'user' })
    ).rejects.toThrow('timestamp');
    await expect(
      program.parseAsync(['rum', 'detail', 'id', '--timestamp', 'invalid'], {
        from: 'user',
      })
    ).rejects.toThrow('Invalid time');
    const tool = getMcpTools().find((tool) => tool.name === 'octo_rum_detail');
    expect(tool?.inputSchema.required).toEqual(['id', 'timestamp']);
    const client = new OctoClient('https://example.com', { token: 'test' });
    for (const timestamp of [undefined, '1790596560000', -1, 1.5, NaN]) {
      const result = await handleMcpTool(
        'octo_rum_detail',
        { id: 'id', timestamp },
        client
      );
      expect(result).toMatchObject({ isError: true });
      expect(result.content[0].text).toContain('event timestamp');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([undefined, 'log', 'rum'])(
    'queries Issue search/detail using source %s without changing the omitted-source default',
    async (source) => {
      const search = setup();
      const sourceArgs = source === undefined ? [] : ['--source', source];
      await search.program.parseAsync(
        ['issues', 'search', '--service', 'myapp', ...sourceArgs],
        { from: 'user' }
      );
      expect(search.calls[0].body.service).toBe('myapp');
      if (source === undefined)
        expect(search.calls[0].body).not.toHaveProperty('dataSource');
      else expect(search.calls[0].body.dataSource).toBe(source);
      const detail = setup();
      await detail.program.parseAsync(
        ['issues', 'detail', 'id/a', ...sourceArgs],
        { from: 'user' }
      );
      expect(detail.calls[0].url).toBe(
        `https://example.com/infra-octopus-openapi/v1/log-error-tracking/issues/id%2Fa${source === undefined ? '' : `?dataSource=${source}`}`
      );
    }
  );

  it('MCP exposes and forwards Issue sources for search and detail', async () => {
    const { calls } = setup();
    const client = new OctoClient('https://example.com', { token: 'test' });
    for (const name of ['octo_issues_search', 'octo_issues_detail']) {
      expect(
        getMcpTools().find((tool) => tool.name === name)?.inputSchema.properties
      ).toHaveProperty('dataSource');
    }
    await handleMcpTool(
      'octo_issues_search',
      { dataSource: 'rum', service: 'myapp' },
      client
    );
    await handleMcpTool(
      'octo_issues_detail',
      { issueId: 'a', dataSource: 'rum' },
      client
    );
    expect(calls[0].body).toMatchObject({
      dataSource: 'rum',
      service: 'myapp',
    });
    expect(calls[1].url).toContain('/issues/a?dataSource=rum');
  });

  it('rejects invalid Issue sources and detached sort cursors before HTTP', async () => {
    const { program, fetch } = setup();
    await expect(
      program.parseAsync(
        ['logs', 'search', '--serialized-sort-values', 'opaque'],
        { from: 'user' }
      )
    ).rejects.toThrow('--serialized-sort-values requires --scroll-id');
    const client = new OctoClient('https://example.com', { token: 'test' });
    await expect(
      client.issuesSearch({
        env: 'online',
        from: 1,
        to: 2,
        status: 'all',
        sortType: 'logCount',
        dataSource: 'xyz',
      })
    ).rejects.toThrow('log, rum');
    await expect(client.issueDetail('a', 'xyz')).rejects.toThrow('log, rum');
    await expect(client.issueDetail(' ')).rejects.toThrow('must not be blank');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects invalid Issue sources at the shared client boundary', async () => {
    const { fetch } = setup();
    const client = new OctoClient('https://example.com', { token: 'test' });
    await expect(
      client.issuesBatchAssign({
        assigneeId: 1,
        issueIds: ['a'],
        dataSource: 'xyz',
      })
    ).rejects.toThrow('log, rum');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('provides examples and manual discovery for every leaf command, including late registrations', () => {
    const { program, fetch } = setup();
    program.command('init').argument('[dir]');
    program.command('mcp');
    program.command('mcp-install');
    configureCommandHelp(program);
    const visit = (command: Command) => {
      let help = '';
      command.configureOutput({
        writeOut: (text) => {
          help += text;
        },
      });
      command.outputHelp();
      expect(help).toContain('Full manual:');
      expect(help).toContain('OpenAPI: https://octopus-docs.zhenguanyu.com/');
      if (command.parent && !command.commands.length) {
        expect(help).toMatch(/Examples:\n\s+octo \S/);
        if (command.options.some((option) => option.long === '--env'))
          expect(help).toMatch(/online[\s\S]*test|test[\s\S]*online/);
      }
      for (const child of command.commands) visit(child);
    };
    visit(program);
    expect(fetch).not.toHaveBeenCalled();
  });
});
