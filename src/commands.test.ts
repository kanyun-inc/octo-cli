import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCommands } from './commands.js';

describe('commands', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
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
