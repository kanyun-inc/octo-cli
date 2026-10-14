import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCommands } from './commands.js';

const temporaryDirectories: string[] = [];

function writeJsonFixture(data: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), 'octo-cli-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'request.json');
  writeFileSync(path, JSON.stringify(data));
  return path;
}

describe('commands', () => {
  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('login only exposes PAT credentials', () => {
    const program = new Command();
    registerCommands(program);

    const login = program.commands.find(
      (command) => command.name() === 'login'
    );
    const options = login?.options.map((option) => option.long);

    expect(options).toContain('--token');
    expect(options).not.toContain('--app-id');
    expect(options).not.toContain('--app-secret');
  });

  it('login rejects a missing PAT', async () => {
    const program = new Command();
    program.exitOverride();
    program.configureOutput({ writeErr: () => undefined });
    registerCommands(program);

    await expect(
      program.parseAsync(['node', 'octo', 'login', '--skip-skill'], {
        from: 'node',
      })
    ).rejects.toThrow("required option '--token <token>' not specified");
  });

  it('metrics query uses UTC+8 without shifting the requested range', async () => {
    vi.stubEnv('OCTOPUS_TOKEN', 'test-token');
    vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');
    const calls: { url: string; method: string; body: string }[] = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url,
        method: init.method ?? 'GET',
        body: String(init.body ?? ''),
      });
      return new Response(JSON.stringify({ code: 0, data: [], message: 'ok' }));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const program = new Command();
    registerCommands(program);
    const query = 'as_count(sum(rollup(test.requests{}, sum, 1d)))';

    await program.parseAsync(
      [
        'metrics',
        'query',
        query,
        '--env',
        'online',
        '--from',
        '2026-09-19T00:00:00+08:00',
        '--to',
        '2026-09-20T00:00:00+08:00',
        '--points',
        '10',
      ],
      { from: 'user' }
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/metrics/query/timeseries'
    );
    expect(JSON.parse(calls[0].body)).toEqual({
      env: 'online',
      from: 1789747200000,
      to: 1789833600000,
      pointCount: 10,
      queries: [{ id: 'A', query, dataSource: 'metric' }],
      userUtcHour: 8,
    });
  });

  it('keeps Issue AI analysis list text concise and details its result flow', () => {
    const program = new Command();
    registerCommands(program);

    const issues = program.commands.find(
      (command) => command.name() === 'issues'
    );
    const aiAnalysis = issues?.commands.find(
      (command) => command.name() === 'ai-analysis'
    );
    const description = aiAnalysis?.description() ?? '';
    let help = '';
    aiAnalysis?.configureOutput({
      writeOut: (text) => {
        help += text;
      },
    });
    aiAnalysis?.outputHelp();

    expect(description).toBe(
      'Start AI analysis for a log Issue (RUM Issues are not supported)'
    );
    expect(help).toContain('delivered through WeCom');
    expect(help).toContain('correlation\nonly');
    expect(help).toContain('Safe to retry');
  });

  it('issues update maps TIME ignore rule into request payload', async () => {
    vi.stubEnv('OCTOPUS_TOKEN', 'test-token');
    vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');
    vi.stubEnv('OCTOPUS_ENV', 'default-env');
    const calls: { body: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push({ body: String(init.body ?? '') });
        return new Response(
          JSON.stringify({ code: 0, data: null, message: 'ok' })
        );
      })
    );

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
      logs.push(String(message));
    });

    const program = new Command();
    program.exitOverride();
    registerCommands(program);

    await program.parseAsync(
      [
        'node',
        'octo',
        'issues',
        'update',
        '--ids',
        'ISSUE-1',
        '--status',
        'ignored',
        '--ignore-type',
        'TIME',
        '--ignore-end-time',
        '2026-07-31T23:59:59Z',
      ],
      { from: 'node' }
    );

    expect(JSON.parse(calls[0].body)).toEqual({
      dataSource: 'log',
      env: 'default-env',
      issueIds: ['ISSUE-1'],
      status: 'ignored',
      ignoreRule: {
        type: 'time',
        timeRule: { endTime: 1785542399000 },
      },
    });
    expect(logs).toContain('Issues updated');
  });

  it('issues ai-analysis starts analysis with context and prints the session ID', async () => {
    vi.stubEnv('OCTOPUS_TOKEN', 'test-token');
    vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');
    const calls: { url: string; method: string; body: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({
          url,
          method: init.method ?? 'GET',
          body: String(init.body ?? ''),
        });
        return new Response(
          JSON.stringify({
            code: 0,
            data: { sessionId: 'session-1' },
            message: 'ok',
          })
        );
      })
    );
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
      logs.push(String(message));
    });

    const program = new Command();
    program.exitOverride();
    registerCommands(program);
    await program.parseAsync(
      [
        'node',
        'octo',
        'issues',
        'ai-analysis',
        'ISSUE-1',
        '--context',
        '发布后开始报错',
      ],
      { from: 'node' }
    );

    expect(calls[0]).toEqual({
      url: 'https://example.com/infra-octopus-openapi/v1/log-error-tracking/issues/ISSUE-1/ai-analysis',
      method: 'POST',
      body: JSON.stringify({ context: '发布后开始报错' }),
    });
    expect(JSON.parse(logs[0])).toEqual({ sessionId: 'session-1' });
  });

  it('issues merge lifecycle commands call OpenAPI and print JSON', async () => {
    vi.stubEnv('OCTOPUS_TOKEN', 'test-token');
    vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');
    const calls: { url: string; method: string; body: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({
          url,
          method: init.method ?? 'GET',
          body: String(init.body ?? ''),
        });
        const data = url.endsWith('/merge')
          ? { mergeIssueId: 'merge-1' }
          : url.endsWith('/unmerge')
            ? { mergeIssueExists: false }
            : { children: [], canonicalIssueId: 'merge-1' };
        return new Response(JSON.stringify({ code: 0, data, message: 'ok' }));
      })
    );
    const logs: string[] = [];
    const errors: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
      logs.push(String(message));
    });
    vi.spyOn(console, 'error').mockImplementation((message?: unknown) => {
      errors.push(String(message));
    });

    const run = async (args: string[]) => {
      const program = new Command();
      program.exitOverride();
      registerCommands(program);
      await program.parseAsync(['node', 'octo', ...args], { from: 'node' });
    };

    await run(['issues', 'merge', '--ids', 'child-1,child-2']);
    await run([
      'issues',
      'unmerge',
      'merge-1',
      '--ids',
      'child-1',
      '--source',
      'rum',
    ]);
    await run(['issues', 'merge-children', 'child-1']);

    expect(calls[0].method).toBe('POST');
    expect(JSON.parse(calls[0].body)).toEqual({
      issueIds: ['child-1', 'child-2'],
      dataSource: 'log',
    });
    expect(JSON.parse(calls[1].body)).toEqual({
      mergeIssueId: 'merge-1',
      childIssueIds: ['child-1'],
      dataSource: 'rum',
    });
    expect(calls[2].method).toBe('GET');
    expect(calls[2].url).toContain(
      '/issues/child-1/merge-children?dataSource=log'
    );
    expect(JSON.parse(logs[0])).toEqual({ mergeIssueId: 'merge-1' });
    expect(JSON.parse(logs[1])).toEqual({ mergeIssueExists: false });
    expect(errors).toContain(
      'The merge Issue was automatically dissolved because fewer than two children remain'
    );
  });

  it('issues unmerge does not print a dissolve warning when the parent remains', async () => {
    vi.stubEnv('OCTOPUS_TOKEN', 'test-token');
    vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            code: 0,
            data: { mergeIssueExists: true },
            message: 'ok',
          })
        );
      })
    );
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((message?: unknown) => {
      errors.push(String(message));
    });

    const program = new Command();
    program.exitOverride();
    registerCommands(program);

    await program.parseAsync(
      ['node', 'octo', 'issues', 'unmerge', 'merge-1', '--ids', 'child-1'],
      { from: 'node' }
    );

    expect(errors).toHaveLength(0);
  });

  it('issues update rejects USER_COUNT without userField for log source', async () => {
    vi.stubEnv('OCTOPUS_TOKEN', 'test-token');
    vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');

    const program = new Command();
    program.exitOverride();
    registerCommands(program);

    await expect(
      program.parseAsync(
        [
          'node',
          'octo',
          'issues',
          'update',
          '--ids',
          'ISSUE-1',
          '--status',
          'ignored',
          '--source',
          'log',
          '--ignore-type',
          'USER_COUNT',
          '--user-count',
          '50',
        ],
        { from: 'node' }
      )
    ).rejects.toThrow(
      '--user-field is required when --ignore-type USER_COUNT and --source log'
    );
  });

  it('issues update rejects invalid ignore type', async () => {
    vi.stubEnv('OCTOPUS_TOKEN', 'test-token');
    vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');

    const program = new Command();
    program.exitOverride();
    registerCommands(program);

    await expect(
      program.parseAsync(
        [
          'node',
          'octo',
          'issues',
          'update',
          '--ids',
          'ISSUE-1',
          '--status',
          'ignored',
          '--ignore-type',
          'COUNT',
        ],
        { from: 'node' }
      )
    ).rejects.toThrow(
      '--ignore-type must be one of: TIME, APPEAR_COUNT, USER_COUNT'
    );
  });

  it('issues update rejects invalid source', async () => {
    vi.stubEnv('OCTOPUS_TOKEN', 'test-token');
    vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');

    const program = new Command();
    program.exitOverride();
    registerCommands(program);

    await expect(
      program.parseAsync(
        [
          'node',
          'octo',
          'issues',
          'update',
          '--ids',
          'ISSUE-1',
          '--status',
          'ignored',
          '--source',
          'logs',
          '--ignore-type',
          'USER_COUNT',
          '--user-count',
          '50',
        ],
        { from: 'node' }
      )
    ).rejects.toThrow('--source must be one of: log, rum');
  });

  it('issues update rejects invalid numeric threshold flags', async () => {
    vi.stubEnv('OCTOPUS_TOKEN', 'test-token');
    vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');

    const program = new Command();
    program.exitOverride();
    registerCommands(program);

    await expect(
      program.parseAsync(
        [
          'node',
          'octo',
          'issues',
          'update',
          '--ids',
          'ISSUE-1',
          '--status',
          'ignored',
          '--ignore-type',
          'APPEAR_COUNT',
          '--appear-count',
          'abc',
        ],
        { from: 'node' }
      )
    ).rejects.toThrow('--appear-count must be a valid number');

    await expect(
      program.parseAsync(
        [
          'node',
          'octo',
          'issues',
          'update',
          '--ids',
          'ISSUE-1',
          '--status',
          'ignored',
          '--ignore-type',
          'USER_COUNT',
          '--user-count',
          'NaN',
          '--user-field',
          'uid',
        ],
        { from: 'node' }
      )
    ).rejects.toThrow('--user-count must be a valid number');

    await expect(
      program.parseAsync(
        [
          'node',
          'octo',
          'issues',
          'update',
          '--ids',
          'ISSUE-1',
          '--status',
          'ignored',
          '--ignore-type',
          'USER_COUNT',
          '--user-count',
          '50',
          '--user-field',
          'uid',
          '--time-window-ms',
          '1h',
        ],
        { from: 'node' }
      )
    ).rejects.toThrow('--time-window-ms must be a valid number');
  });

  it('cases create --output json writes only machine-readable JSON to stdout', async () => {
    vi.stubEnv('OCTOPUS_TOKEN', 'test-token');
    vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            code: 0,
            data: { id: 123, name: 'checkout incident' },
            message: 'ok',
          })
        );
      })
    );

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
      logs.push(String(message));
    });

    const program = new Command();
    program.exitOverride();
    registerCommands(program);

    await program.parseAsync(
      [
        'node',
        'octo',
        'cases',
        'create',
        '--name',
        'checkout incident',
        '--group-id',
        '1',
        '--output',
        'json',
      ],
      { from: 'node' }
    );

    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0])).toEqual({
      id: 123,
      name: 'checkout incident',
    });
  });

  describe('RUM and event aggregation', () => {
    function setupCli() {
      vi.stubEnv('OCTOPUS_TOKEN', 'test-token');
      vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');
      vi.stubEnv('OCTOPUS_ENV', 'default-env');
      const calls: { url: string; body: string }[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
          calls.push({ url, body: String(init.body ?? '') });
          return new Response(
            JSON.stringify({ code: 0, data: [], message: 'ok' })
          );
        })
      );
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const errors: string[] = [];
      const program = new Command();
      program.configureOutput({
        writeErr: (message) => errors.push(message),
      });
      program.exitOverride();
      registerCommands(program);
      return { calls, errors, program };
    }

    it('rum aggregate supports multiple aggregations and groups', async () => {
      const { calls, program } = setupCli();

      await program.parseAsync(
        [
          'node',
          'octo',
          'rum',
          'aggregate',
          '--from',
          '1700000000000',
          '--to',
          '1700003600000',
          '-a',
          'view.loading_time:p95',
          '-a',
          '*:count',
          '-g',
          'type:5',
          '-g',
          'view.name',
        ],
        { from: 'node' }
      );

      expect(calls[0].url).toBe(
        'https://example.com/infra-octopus-openapi/v1/rum/aggregate'
      );
      expect(JSON.parse(calls[0].body)).toEqual({
        env: 'default-env',
        from: 1_700_000_000_000,
        to: 1_700_003_600_000,
        aggregationField: [
          { field: 'view.loading_time', operation: 'p95' },
          { field: '*', operation: 'count' },
        ],
        groupFieldList: [
          {
            field: 'type',
            limit: 5,
            sort: {
              field: 'view.loading_time',
              operation: 'p95',
              order: 'desc',
            },
          },
          {
            field: 'view.name',
            limit: 10,
            sort: {
              field: 'view.loading_time',
              operation: 'p95',
              order: 'desc',
            },
          },
        ],
      });
    });

    it.each([
      ['logs', 'aggregate'],
      ['trace', 'aggregate'],
      ['rum', 'aggregate'],
      ['events', 'aggregate'],
    ])(
      '%s aggregate sorts groups by the first aggregation',
      async (...command) => {
        const { calls, program } = setupCli();

        await program.parseAsync(
          [
            'node',
            'octo',
            ...command,
            '--from',
            '1700000000000',
            '--to',
            '1700003600000',
            '-a',
            'duration:p95',
            '-a',
            '*:count',
            '-g',
            'service:5',
          ],
          { from: 'node' }
        );

        const body = JSON.parse(calls[0].body);
        const groups = body.groupFields ?? body.groupFieldList;
        expect(groups[0].sort).toEqual({
          field: 'duration',
          operation: 'p95',
          order: 'desc',
        });
      }
    );

    it('events aggregate defaults to count all', async () => {
      const { calls, program } = setupCli();

      await program.parseAsync(
        [
          'node',
          'octo',
          'events',
          'aggregate',
          '--from',
          '1700000000000',
          '--to',
          '1700003600000',
        ],
        { from: 'node' }
      );

      expect(calls[0].url).toBe(
        'https://example.com/infra-octopus-openapi/v1/event/aggregate'
      );
      expect(JSON.parse(calls[0].body)).toEqual({
        env: 'default-env',
        from: 1_700_000_000_000,
        to: 1_700_003_600_000,
        aggregationField: [{ field: '*', operation: 'count' }],
      });
    });

    it('events keeps list as its backward-compatible default command', async () => {
      const { calls, program } = setupCli();

      await program.parseAsync(
        [
          'node',
          'octo',
          'events',
          '--from',
          '1700000000000',
          '--to',
          '1700003600000',
        ],
        { from: 'node' }
      );

      expect(calls[0].url).toBe(
        'https://example.com/infra-octopus-openapi/v1/event/list'
      );
    });

    it.each([
      ['logs', 'aggregate'],
      ['trace', 'aggregate'],
      ['rum', 'aggregate'],
      ['events', 'aggregate'],
    ])('%s aggregate rejects a non-numeric group limit', async (...command) => {
      const { calls, errors, program } = setupCli();

      await expect(
        program.parseAsync(
          ['node', 'octo', ...command, '--group', 'type:abc'],
          { from: 'node' }
        )
      ).rejects.toThrow(
        '--group limit must be a positive integer, received "abc"'
      );
      expect(errors.join('')).toContain(
        "error: option '-g, --group <field[:limit]>' argument 'type:abc' is invalid."
      );
      expect(calls).toHaveLength(0);
    });

    it.each(['type:10abc', 'type:', 'type:10:abc', 'type:0', 'type:-1'])(
      'rejects malformed group value %s',
      async (group) => {
        const { calls, program } = setupCli();

        await expect(
          program.parseAsync(
            ['node', 'octo', 'events', 'aggregate', '--group', group],
            { from: 'node' }
          )
        ).rejects.toThrow('--group limit must be a positive integer');
        expect(calls).toHaveLength(0);
      }
    );

    it.each([
      ['logs', 'aggregate'],
      ['trace', 'aggregate'],
      ['rum', 'aggregate'],
      ['events', 'aggregate'],
    ])('%s aggregate rejects malformed aggregations', async (...command) => {
      for (const aggregation of ['type:', ':count', 'type:count:extra']) {
        const { calls, errors, program } = setupCli();

        await expect(
          program.parseAsync(
            ['node', 'octo', ...command, '--agg', aggregation],
            { from: 'node' }
          )
        ).rejects.toThrow();
        expect(errors.join('')).toContain(
          `error: option '-a, --agg <field[:op]>' argument '${aggregation}' is invalid.`
        );
        expect(calls).toHaveLength(0);
      }
    });

    it('defaults an aggregation without an operation to count', async () => {
      const { calls, program } = setupCli();

      await program.parseAsync(
        [
          'node',
          'octo',
          'events',
          'aggregate',
          '--from',
          '1700000000000',
          '--to',
          '1700003600000',
          '--agg',
          'type',
          '--group',
          'service',
        ],
        { from: 'node' }
      );

      const body = JSON.parse(calls[0].body);
      expect(body.aggregationField).toEqual([
        { field: 'type', operation: 'count' },
      ]);
      expect(body.groupFieldList[0].sort).toEqual({
        field: 'type',
        operation: 'count',
        order: 'desc',
      });
    });
  });

  describe('alerts', () => {
    function setupCli(data: unknown = null) {
      vi.stubEnv('OCTOPUS_TOKEN', 'test-token');
      vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');
      vi.stubEnv('OCTOPUS_ENV', 'default-env');
      const calls: { url: string; method: string; body: string }[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
          calls.push({
            url,
            method: init.method ?? 'GET',
            body: String(init.body ?? ''),
          });
          return new Response(JSON.stringify({ code: 0, data, message: 'ok' }));
        })
      );
      const stdout: string[] = [];
      const stderr: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
        stdout.push(String(message));
      });
      vi.spyOn(console, 'error').mockImplementation((message?: unknown) => {
        stderr.push(String(message));
      });
      const program = new Command();
      program.exitOverride();
      registerCommands(program);
      return { calls, stdout, stderr, program };
    }

    it('rules sends comma-separated env/priority as plural arrays', async () => {
      const { calls, program } = setupCli({ count: 0, list: [] });

      await program.parseAsync(
        ['node', 'octo', 'alerts', 'rules', '-e', 'online,test', '-p', 'P0,P1'],
        { from: 'node' }
      );

      const body = JSON.parse(calls[0].body);
      expect(body.envs).toEqual(['online', 'test']);
      expect(body.priorities).toEqual(['P0', 'P1']);
      // Singular keys are ignored by the backend and must not be sent.
      expect(body.env).toBeUndefined();
      expect(body.priority).toBeUndefined();
    });

    it('groups lists alert groups without reordering the response', async () => {
      const groups = [
        { groupId: 2, groupName: '综合组', author: 'user2' },
        { groupId: 1, groupName: '阿里组', author: 'user1' },
      ];
      const { calls, stdout, program } = setupCli(groups);

      await program.parseAsync(['node', 'octo', 'alerts', 'groups'], {
        from: 'node',
      });

      expect(calls[0].method).toBe('GET');
      expect(calls[0].url).toBe(
        'https://example.com/infra-octopus-openapi/v1/alert/rules/groups'
      );
      expect(JSON.parse(stdout[0])).toEqual(groups);
    });

    it('rule-details queries comma-separated IDs and keeps duplicates', async () => {
      const details = [
        { id: 2, name: 'rule-2' },
        { id: 1, name: 'rule-1' },
      ];
      const { calls, stdout, program } = setupCli(details);

      await program.parseAsync(
        ['node', 'octo', 'alerts', 'rule-details', '--ids', '2, 1,2'],
        { from: 'node' }
      );

      expect(calls[0].method).toBe('POST');
      expect(calls[0].url).toBe(
        'https://example.com/infra-octopus-openapi/v1/alert/rules/details/search'
      );
      expect(JSON.parse(calls[0].body)).toEqual({ ruleIds: [2, 1, 2] });
      expect(JSON.parse(stdout[0])).toEqual(details);
    });

    it('rule-details rejects invalid IDs before calling the API', async () => {
      const { calls, program } = setupCli([]);

      await expect(
        program.parseAsync(
          ['node', 'octo', 'alerts', 'rule-details', '--ids', '1,not-a-number'],
          { from: 'node' }
        )
      ).rejects.toThrow('Alert rule IDs must be positive integers');

      expect(calls).toHaveLength(0);
    });

    it('search omits status entirely when not given', async () => {
      const { calls, program } = setupCli([]);

      await program.parseAsync(['node', 'octo', 'alerts', 'search'], {
        from: 'node',
      });

      expect(JSON.parse(calls[0].body).status).toBeUndefined();
    });

    it('search drops a literal "all" status rather than forwarding it', async () => {
      const { calls, program } = setupCli([]);

      await program.parseAsync(
        ['node', 'octo', 'alerts', 'search', '-s', 'all'],
        { from: 'node' }
      );

      expect(JSON.parse(calls[0].body).status).toBeUndefined();
    });

    it('search forwards a real status and rule type', async () => {
      const { calls, program } = setupCli([]);

      await program.parseAsync(
        [
          'node',
          'octo',
          'alerts',
          'search',
          '-s',
          'firing',
          '--rule-type',
          'metric',
        ],
        { from: 'node' }
      );

      const body = JSON.parse(calls[0].body);
      expect(body.status).toBe('firing');
      expect(body.alertRuleType).toBe('metric');
    });

    it('silence lowercases the scope the backend rejects in uppercase', async () => {
      const { calls, program } = setupCli();

      await program.parseAsync(
        [
          'node',
          'octo',
          'alerts',
          'silence',
          '--rule-id',
          '1',
          '--alert-id',
          '2',
          '--duration',
          '2h',
          '--scope',
          'ALL',
        ],
        { from: 'node' }
      );

      expect(JSON.parse(calls[0].body).scope).toBe('all');
    });

    it('disable posts to the disables endpoint with a duration window', async () => {
      const { calls, program } = setupCli(1001);

      await program.parseAsync(
        [
          'node',
          'octo',
          'alerts',
          'disable',
          '--rule-id',
          '42',
          '--duration',
          '2h',
          '--reason',
          'maintenance',
        ],
        { from: 'node' }
      );

      expect(calls[0].url).toBe(
        'https://example.com/infra-octopus-openapi/v1/alert/rules/disables/create'
      );
      const body = JSON.parse(calls[0].body);
      expect(body.ruleId).toBe(42);
      expect(body.endTime - body.startTime).toBe(2 * 60 * 60 * 1000);
      expect(body.disableNotifyContent).toBe('maintenance');
      expect(body.scope).toBe('all');
    });

    it('disable keeps stdout parseable by writing its status line to stderr', async () => {
      const { stdout, stderr, program } = setupCli(1001);

      await program.parseAsync(
        [
          'node',
          'octo',
          'alerts',
          'disable',
          '--rule-id',
          '42',
          '--duration',
          '30m',
        ],
        { from: 'node' }
      );

      expect(stdout).toHaveLength(1);
      expect(JSON.parse(stdout[0])).toBe(1001);
      expect(stderr).toContain('Disable rule created');
    });

    it('disable parses --specify-groups into the request', async () => {
      const { calls, program } = setupCli(1001);

      await program.parseAsync(
        [
          'node',
          'octo',
          'alerts',
          'disable',
          '--rule-id',
          '42',
          '--duration',
          '1h',
          '--scope',
          'specify',
          '--specify-groups',
          '{"service":["a","b"]}',
        ],
        { from: 'node' }
      );

      const body = JSON.parse(calls[0].body);
      expect(body.scope).toBe('specify');
      expect(body.specifyGroups).toEqual({ service: ['a', 'b'] });
    });

    it('disables lists by rule id', async () => {
      const { calls, program } = setupCli([]);

      await program.parseAsync(['node', 'octo', 'alerts', 'disables', '42'], {
        from: 'node',
      });

      expect(calls[0].method).toBe('GET');
      expect(calls[0].url).toBe(
        'https://example.com/infra-octopus-openapi/v1/alert/rules/disables/42'
      );
    });

    it('enable deletes by disable id', async () => {
      const { calls, program } = setupCli();

      await program.parseAsync(['node', 'octo', 'alerts', 'enable', '1001'], {
        from: 'node',
      });

      expect(calls[0].method).toBe('DELETE');
      expect(calls[0].url).toBe(
        'https://example.com/infra-octopus-openapi/v1/alert/rules/disables/1001'
      );
    });

    it('rejects an unknown scope instead of sending it to the API', async () => {
      const { calls, program } = setupCli();

      await expect(
        program.parseAsync(
          [
            'node',
            'octo',
            'alerts',
            'disable',
            '--rule-id',
            '42',
            '--duration',
            '1h',
            '--scope',
            'everything',
          ],
          { from: 'node' }
        )
      ).rejects.toThrow(/Invalid scope/);
      expect(calls).toHaveLength(0);
    });
  });

  describe('event subscription and webhook commands', () => {
    function setupCli(data: unknown = null) {
      vi.stubEnv('OCTOPUS_TOKEN', 'test-token');
      vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');
      const calls: { url: string; method: string; body: string }[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
          calls.push({
            url,
            method: init.method ?? 'GET',
            body: String(init.body ?? ''),
          });
          return new Response(JSON.stringify({ code: 0, data, message: 'ok' }));
        })
      );
      const stdout: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
        stdout.push(String(message));
      });
      const program = new Command();
      program.exitOverride();
      registerCommands(program);
      return { calls, stdout, program };
    }

    it('keeps event query commands and registers both management groups', () => {
      const program = new Command();
      registerCommands(program);

      const events = program.commands.find(
        (command) => command.name() === 'events'
      );
      const subscriptionCommands = program.commands
        .find((command) => command.name() === 'event-subscriptions')
        ?.commands.map((command) => command.name());
      const webhookCommands = program.commands
        .find((command) => command.name() === 'event-webhooks')
        ?.commands.map((command) => command.name());

      expect(events?.commands.map((command) => command.name())).toEqual([
        'list',
        'aggregate',
      ]);
      expect(subscriptionCommands).toEqual([
        'list',
        'detail',
        'create',
        'update',
        'enable',
        'disable',
        'delete',
      ]);
      expect(webhookCommands).toEqual([
        'list',
        'detail',
        'create',
        'update',
        'test',
        'delete',
      ]);
    });

    it('event-subscriptions list maps CLI flags to the search contract', async () => {
      const response = { count: 0, list: [], lastPage: true };
      const { calls, stdout, program } = setupCli(response);

      await program.parseAsync(
        [
          'node',
          'octo',
          'event-subscriptions',
          'list',
          '--keyword',
          'payment',
          '--env',
          'online',
          '--status',
          'enabled',
          '--page',
          '2',
          '--page-size',
          '50',
        ],
        { from: 'node' }
      );

      expect(calls[0]).toEqual({
        url: 'https://example.com/infra-octopus-openapi/v1/event/subscriptions/search',
        method: 'POST',
        body: JSON.stringify({
          keyword: 'payment',
          environment: 'online',
          status: 'ENABLED',
          pageNo: 2,
          pageSize: 50,
        }),
      });
      expect(JSON.parse(stdout[0])).toEqual(response);
    });

    it('event-subscriptions create reads the request from a JSON file', async () => {
      const request = {
        name: 'payment failures',
        description: 'notify payment agent',
        environment: 'test',
        filter: 'type = payment.failed',
        webhookId: 8,
      };
      const response = { id: 11, status: 'DISABLED', ...request };
      const file = writeJsonFixture(request);
      const { calls, stdout, program } = setupCli(response);

      await program.parseAsync(
        ['node', 'octo', 'event-subscriptions', 'create', '--file', file],
        { from: 'node' }
      );

      expect(calls[0]).toEqual({
        url: 'https://example.com/infra-octopus-openapi/v1/event/subscriptions',
        method: 'POST',
        body: JSON.stringify(request),
      });
      expect(JSON.parse(stdout[0])).toEqual(response);
    });

    it('event-subscriptions enable and delete use the expected methods', async () => {
      const { calls, stdout, program } = setupCli({
        id: 11,
        status: 'ENABLED',
      });

      await program.parseAsync(
        ['node', 'octo', 'event-subscriptions', 'enable', '11'],
        { from: 'node' }
      );
      await program.parseAsync(
        ['node', 'octo', 'event-subscriptions', 'delete', '11'],
        { from: 'node' }
      );

      expect(calls[0]).toEqual({
        url: 'https://example.com/infra-octopus-openapi/v1/event/subscriptions/11/status',
        method: 'PUT',
        body: JSON.stringify({ status: 'ENABLED' }),
      });
      expect(calls[1]).toEqual({
        url: 'https://example.com/infra-octopus-openapi/v1/event/subscriptions/11',
        method: 'DELETE',
        body: '',
      });
      expect(JSON.parse(stdout[1])).toEqual({ id: 11, deleted: true });
    });

    it('event-webhooks test preserves header maps and custom templates', async () => {
      const request = {
        name: 'agent webhook',
        url: 'https://agent.example.com/events',
        headers: { Authorization: 'Bearer test' },
        requestFormat: 'CUSTOM',
        bodyTemplate: '{"eventId":"{{event.event_id}}"}',
      };
      const response = {
        success: true,
        httpStatus: 200,
        durationMs: 12,
        summary: 'OK',
      };
      const file = writeJsonFixture(request);
      const { calls, stdout, program } = setupCli(response);

      await program.parseAsync(
        ['node', 'octo', 'event-webhooks', 'test', '--file', file],
        { from: 'node' }
      );

      expect(calls[0]).toEqual({
        url: 'https://example.com/infra-octopus-openapi/v1/event/webhooks/test',
        method: 'POST',
        body: JSON.stringify(request),
      });
      expect(JSON.parse(stdout[0])).toEqual(response);
    });

    it('rejects invalid list limits and non-object request files locally', async () => {
      const { calls, program } = setupCli();

      await expect(
        program.parseAsync(
          ['node', 'octo', 'event-webhooks', 'list', '--page-size', '101'],
          { from: 'node' }
        )
      ).rejects.toThrow('--page-size must not exceed 100');

      const file = writeJsonFixture([]);
      await expect(
        program.parseAsync(
          ['node', 'octo', 'event-webhooks', 'create', '--file', file],
          { from: 'node' }
        )
      ).rejects.toThrow('--file must contain a JSON object');

      expect(calls).toHaveLength(0);
    });
  });

  describe('inspection reports', () => {
    function setupCli() {
      vi.stubEnv('OCTOPUS_TOKEN', 'test-token');
      vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');
      const calls: { url: string; method: string; body: string }[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
          calls.push({
            url,
            method: init.method ?? 'GET',
            body: String(init.body ?? ''),
          });
          return new Response(
            JSON.stringify({ code: 0, data: [], message: 'ok' })
          );
        })
      );
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const program = new Command();
      program.exitOverride();
      registerCommands(program);
      return { calls, program };
    }

    it('reports forwards filters and pagination', async () => {
      const { calls, program } = setupCli();

      await program.parseAsync(
        [
          'node',
          'octo',
          'inspection',
          'reports',
          '--query',
          'db',
          '--task-id',
          '7',
          '--task-group',
          'infra-db',
          '--result',
          'abnormal',
          '--page',
          '2',
          '--limit',
          '20',
        ],
        { from: 'node' }
      );

      expect(calls[0].method).toBe('POST');
      expect(calls[0].url).toBe(
        'https://example.com/infra-octopus-openapi/v1/inspection/reports/search'
      );
      expect(JSON.parse(calls[0].body)).toEqual({
        pageNo: 2,
        pageSize: 20,
        keyword: 'db',
        taskId: 7,
        taskGroupName: 'infra-db',
        result: 'abnormal',
      });
    });

    it('reports defaults pagination and omits unset filters', async () => {
      const { calls, program } = setupCli();

      await program.parseAsync(['node', 'octo', 'inspection', 'reports'], {
        from: 'node',
      });

      expect(calls[0].method).toBe('POST');
      expect(JSON.parse(calls[0].body)).toEqual({
        pageNo: 1,
        pageSize: 10,
      });
    });
  });

  describe('OpenAPI management commands', () => {
    function setup(data: unknown = null) {
      vi.stubEnv('OCTOPUS_TOKEN', 'test-token');
      vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');
      const calls: { url: string; method: string; body: string }[] = [];
      const fetch = vi.fn(async (url: string, init: RequestInit) => {
        calls.push({
          url,
          method: init.method ?? 'GET',
          body: String(init.body ?? ''),
        });
        return new Response(JSON.stringify({ code: 0, data, message: 'ok' }));
      });
      vi.stubGlobal('fetch', fetch);
      const stdout: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((value?: unknown) => {
        stdout.push(String(value));
      });
      const program = new Command();
      program.exitOverride();
      program.configureOutput({ writeErr: () => undefined });
      registerCommands(program);
      return { program, calls, fetch, stdout };
    }

    afterEach(() => vi.unstubAllGlobals());

    it('alerts update sends the full file object and prints updated rule details', async () => {
      const rule = {
        id: 42,
        name: 'CPU alert',
        env: 'online',
        priority: 'P1',
        groupId: 8,
        ruleType: 'metric',
        conditions: [
          {
            id: 9,
            threshold: 0,
            alertQueryInfo: { metricAlertQueryInfo: { queries: [] } },
          },
        ],
        notice: { receivers: [], enableReduceNoise: false },
        closeAlert: true,
        extInfo: {},
        alertAnalysisMetadata: { enabled: false },
        wechatworkMentionIds: { 7: [] },
      };
      const updated = { ...rule, version: 2 };
      const { program, calls, stdout } = setup(updated);
      await program.parseAsync(
        ['alerts', 'update', '42', '--file', writeJsonFixture(rule)],
        { from: 'user' }
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(
        'https://example.com/infra-octopus-openapi/v1/alert/rules/42'
      );
      expect(calls[0].method).toBe('PUT');
      expect(JSON.parse(calls[0].body)).toEqual(rule);
      expect(stdout).toEqual([JSON.stringify(updated, null, 2)]);
    });

    it.each([
      ['close', 'PUT', '/close'],
      ['unassign', 'PUT', '/assign/cancel'],
      ['claim', 'POST', '/claim'],
    ])(
      'alerts %s uses its exact route without a request body',
      async (action, method, suffix) => {
        const { program, calls, stdout } = setup();
        await program.parseAsync(['alerts', action, '42'], { from: 'user' });

        expect(calls).toEqual([
          {
            url: `https://example.com/infra-octopus-openapi/v1/alerts/42${suffix}`,
            method,
            body: '',
          },
        ]);
        expect(stdout).toEqual(['null']);
      }
    );

    it.each([
      { flags: ['--user-id', '8'], expected: { assigneeUserId: 8 } },
      { flags: ['--ldap', ' alice '], expected: { assigneeLdap: 'alice' } },
      {
        flags: ['--user-id', '8', '--ldap', ' alice '],
        expected: { assigneeUserId: 8, assigneeLdap: 'alice' },
      },
    ])('alerts assign supports $flags', async ({ flags, expected }) => {
      const { program, calls, stdout } = setup();
      await program.parseAsync(['alerts', 'assign', '42', ...flags], {
        from: 'user',
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(
        'https://example.com/infra-octopus-openapi/v1/alerts/42/assign'
      );
      expect(calls[0].method).toBe('PUT');
      expect(JSON.parse(calls[0].body)).toEqual(expected);
      expect(stdout).toEqual(['null']);
    });

    it.each([
      { flags: ['--user', '8'], expected: { assigneeId: 8 } },
      { flags: ['--user-id', '8'], expected: { assigneeId: 8 } },
      { flags: ['--ldap', ' alice '], expected: { assigneeLdap: 'alice' } },
      {
        flags: ['--user', '7', '--user-id', '8', '--ldap', 'ignored'],
        expected: { assigneeId: 8 },
      },
    ])(
      'issues assign keeps ID compatibility and supports $flags',
      async ({ flags, expected }) => {
        const { program, calls } = setup();
        await program.parseAsync(
          [
            'issues',
            'assign',
            '--ids',
            ' issue-1 ,issue-2,issue-1',
            '--source',
            'rum',
            ...flags,
          ],
          { from: 'user' }
        );

        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(
          'https://example.com/infra-octopus-openapi/v1/log-error-tracking/issues/batch-assign'
        );
        expect(calls[0].method).toBe('POST');
        expect(JSON.parse(calls[0].body)).toEqual({
          ...expected,
          dataSource: 'rum',
          issueIds: ['issue-1', 'issue-2'],
        });
      }
    );

    it.each([
      { flags: [] as string[], source: 'log' },
      { flags: ['--source', 'rum'], source: 'rum' },
    ])(
      'issues unassign encodes the ID and uses $source source',
      async ({ flags, source }) => {
        const { program, calls, stdout } = setup();
        await program.parseAsync(
          ['issues', 'unassign', ' issue id/1 ', ...flags],
          { from: 'user' }
        );

        expect(calls).toEqual([
          {
            url: `https://example.com/infra-octopus-openapi/v1/log-error-tracking/issues/issue%20id%2F1/assign?dataSource=${source}`,
            method: 'DELETE',
            body: '',
          },
        ]);
        expect(stdout).toEqual(['null']);
      }
    );

    const aggregationPath =
      'https://example.com/infra-octopus-openapi/v1/error-tracking/process/pipelines';

    it('aggregation-rules list prints the ordered tree unchanged', async () => {
      const tree = {
        pipelineElementVOS: [{ id: 20, children: [{ id: 21 }] }, { id: 10 }],
      };
      const { program, calls, stdout } = setup(tree);
      await program.parseAsync(
        ['issues', 'aggregation-rules', 'list', '--source', 'rum'],
        { from: 'user' }
      );

      expect(calls).toEqual([
        { url: `${aggregationPath}?dataSource=rum`, method: 'GET', body: '' },
      ]);
      expect(stdout).toEqual([JSON.stringify(tree, null, 2)]);
    });

    it.each([
      { flags: [] as string[], parentElementId: null, previousElementId: null },
      {
        flags: ['--parent-id', '0'],
        parentElementId: 0,
        previousElementId: null,
      },
      {
        flags: ['--parent-id', '10', '--previous-id', '11'],
        parentElementId: 10,
        previousElementId: 11,
      },
    ])(
      'aggregation-rules create maps positions $flags and wraps a node file',
      async ({ flags, parentElementId, previousElementId }) => {
        const element = {
          pipelineType: 'pipeline',
          issuePipeline: { name: 'payments', filter: 'service=payments' },
        };
        const { program, calls, stdout } = setup({ id: 12 });
        await program.parseAsync(
          [
            'issues',
            'aggregation-rules',
            'create',
            '--source',
            'log',
            '--file',
            writeJsonFixture(element),
            ...flags,
          ],
          { from: 'user' }
        );

        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(`${aggregationPath}?dataSource=log`);
        expect(calls[0].method).toBe('POST');
        expect(JSON.parse(calls[0].body)).toEqual({
          issuePipelineElement: element,
          parentElementId,
          previousElementId,
        });
        expect(stdout).toEqual([JSON.stringify({ id: 12 }, null, 2)]);
      }
    );

    it('aggregation-rules update preserves complete process DSL without position fields', async () => {
      const element = {
        pipelineType: 'process',
        issuePipelineProcess: {
          name: 'fingerprint',
          type: 0,
          rule: 'first line\n"quoted" second line',
        },
      };
      const { program, calls, stdout } = setup();
      await program.parseAsync(
        [
          'issues',
          'aggregation-rules',
          'update',
          '12',
          '--source',
          'rum',
          '--file',
          writeJsonFixture(element),
        ],
        { from: 'user' }
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(`${aggregationPath}/12?dataSource=rum`);
      expect(calls[0].method).toBe('PUT');
      expect(JSON.parse(calls[0].body)).toEqual({
        issuePipelineElement: element,
      });
      expect(stdout).toEqual(['null']);
    });

    it.each([
      {
        action: 'delete',
        method: 'DELETE',
        suffix: '/12?dataSource=log',
        body: '',
      },
      {
        action: 'enable',
        method: 'PUT',
        suffix: '/12/status?dataSource=log&enable=true',
        body: '',
      },
      {
        action: 'disable',
        method: 'PUT',
        suffix: '/12/status?dataSource=log&enable=false',
        body: '',
      },
      {
        action: 'duplicate',
        method: 'POST',
        suffix: '/duplicate?dataSource=log',
        body: JSON.stringify({ sourceId: 12 }),
      },
    ])(
      'aggregation-rules $action uses its management endpoint',
      async ({ action, method, suffix, body }) => {
        const { program, calls, stdout } = setup();
        await program.parseAsync(
          ['issues', 'aggregation-rules', action, '12', '--source', 'log'],
          { from: 'user' }
        );

        expect(calls).toEqual([
          { url: `${aggregationPath}${suffix}`, method, body },
        ]);
        expect(stdout).toEqual(['null']);
      }
    );

    it.each([
      { flags: [] as string[], parentElementId: null, previousElementId: null },
      {
        flags: ['--parent-id', '0'],
        parentElementId: 0,
        previousElementId: null,
      },
      {
        flags: ['--parent-id', '10', '--previous-id', '11'],
        parentElementId: 10,
        previousElementId: 11,
      },
    ])(
      'aggregation-rules move preserves selected positions $flags',
      async ({ flags, parentElementId, previousElementId }) => {
        const { program, calls } = setup();
        await program.parseAsync(
          [
            'issues',
            'aggregation-rules',
            'move',
            '12',
            '--source',
            'log',
            ...flags,
          ],
          { from: 'user' }
        );

        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(`${aggregationPath}/move?dataSource=log`);
        expect(calls[0].method).toBe('POST');
        expect(JSON.parse(calls[0].body)).toEqual({
          id: 12,
          parentElementId,
          previousElementId,
        });
      }
    );

    it.each([
      ['alerts', 'close', '0'],
      ['alerts', 'claim', '1junk'],
      ['alerts', 'unassign', '1.5'],
      ['alerts', 'assign', '1'],
      ['alerts', 'assign', '1', '--ldap', '  '],
      ['alerts', 'assign', '1', '--user-id', '0', '--ldap', 'alice'],
      ['issues', 'assign', '--ids', 'issue'],
      ['issues', 'assign', '--ids', 'issue', '--user', '1junk'],
      ['issues', 'assign', '--ids', 'issue', '--user-id', '0'],
      ['issues', 'assign', '--ids', 'issue', '--ldap', '  '],
      [
        'issues',
        'assign',
        '--ids',
        'issue',
        '--user-id',
        '1',
        '--source',
        'trace',
      ],
      ['issues', 'unassign', ' '],
      ['issues', 'unassign', 'issue', '--source', 'trace'],
      ['issues', 'aggregation-rules', 'list'],
      ['issues', 'aggregation-rules', 'list', '--source', 'trace'],
      ['issues', 'aggregation-rules', 'delete', '0', '--source', 'log'],
      ['issues', 'aggregation-rules', 'enable', '1.5', '--source', 'log'],
      ['issues', 'aggregation-rules', 'disable', '1junk', '--source', 'log'],
      ['issues', 'aggregation-rules', 'duplicate', '0', '--source', 'log'],
      [
        'issues',
        'aggregation-rules',
        'move',
        '1',
        '--source',
        'log',
        '--parent-id',
        '-1',
      ],
      [
        'issues',
        'aggregation-rules',
        'move',
        '1',
        '--source',
        'log',
        '--previous-id',
        '0',
      ],
      [
        'issues',
        'aggregation-rules',
        'move',
        '1',
        '--source',
        'log',
        '--parent-id',
        '1',
      ],
    ])('rejects invalid input before network: %j', async (...args) => {
      const { program, fetch } = setup();
      await expect(
        program.parseAsync(args, { from: 'user' })
      ).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    });

    it.each([
      null,
      [],
      {},
      {
        issuePipelineElement: {
          pipelineType: 'pipeline',
          issuePipeline: { name: 'wrapped' },
        },
      },
    ])(
      'rejects invalid aggregation node files before network: %j',
      async (element) => {
        const { program, fetch } = setup();
        await expect(
          program.parseAsync(
            [
              'issues',
              'aggregation-rules',
              'create',
              '--source',
              'log',
              '--file',
              writeJsonFixture(element),
            ],
            { from: 'user' }
          )
        ).rejects.toThrow();
        expect(fetch).not.toHaveBeenCalled();
      }
    );

    it('rejects RUM stack rules and root process creation before network', async () => {
      const { program, fetch } = setup();
      const file = writeJsonFixture({
        pipelineType: 'process',
        issuePipelineProcess: { name: 'stack', type: 2, rule: 'rule' },
      });
      await expect(
        program.parseAsync(
          [
            'issues',
            'aggregation-rules',
            'update',
            '12',
            '--source',
            'rum',
            '--file',
            file,
          ],
          { from: 'user' }
        )
      ).rejects.toThrow();
      const second = new Command();
      registerCommands(second);
      await expect(
        second.parseAsync(
          [
            'issues',
            'aggregation-rules',
            'create',
            '--source',
            'log',
            '--file',
            file,
          ],
          { from: 'user' }
        )
      ).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    });

    it.each([null, [], {}])(
      'rejects invalid full alert rule files before network: %j',
      async (rule) => {
        const { program, fetch } = setup();
        await expect(
          program.parseAsync(
            ['alerts', 'update', '42', '--file', writeJsonFixture(rule)],
            { from: 'user' }
          )
        ).rejects.toThrow();
        expect(fetch).not.toHaveBeenCalled();
      }
    );
  });
});
