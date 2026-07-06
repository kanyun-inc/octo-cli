import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCommands } from './commands.js';

describe('commands', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
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
        type: 'TIME',
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
});
