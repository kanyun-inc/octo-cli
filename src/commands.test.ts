import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCommands } from './commands.js';

describe('commands', () => {
  afterEach(() => {
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
});
