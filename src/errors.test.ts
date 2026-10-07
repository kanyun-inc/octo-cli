import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OctoClient } from './client.js';
import { ApiError, runCli } from './errors.js';

describe('API and CLI errors', () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    [400, { code: -201, message: 'bad query' }, -201, 'bad query'],
    [429, { code: -17, message: 'rate limited' }, -17, 'rate limited'],
    [500, 'index_closed_exception', undefined, 'index_closed_exception'],
    [
      200,
      { code: -17, message: 'rate limited', data: null },
      -17,
      'rate limited',
    ],
  ])(
    'rejects HTTP %s or nonzero API codes instead of returning empty data',
    async (status, body, code, message) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              typeof body === 'string' ? body : JSON.stringify(body),
              { status }
            )
        )
      );
      const client = new OctoClient('https://example.com', { token: 'test' });
      await expect(
        client.logsSearch({ env: 'online', from: 1, to: 2 })
      ).rejects.toMatchObject({ status, code, message });
    }
  );

  it.each([false, true])(
    'prints clean stderr and nonzero exit (JSON errors: %s)',
    async (jsonErrors) => {
      const error = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const program = new Command().option('--json-errors');
      program.command('fail').action(async () => {
        throw new ApiError('bad\nquery', 400, -201);
      });
      await runCli(program, [
        'node',
        'octo',
        ...(jsonErrors ? ['--json-errors'] : []),
        'fail',
      ]);
      expect(process.exitCode).toBe(1);
      expect(log).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledTimes(1);
      if (jsonErrors)
        expect(JSON.parse(error.mock.calls[0][0])).toEqual({
          error: { status: 400, code: -201, message: 'bad query' },
        });
      else
        expect(error).toHaveBeenCalledWith(
          'Error: HTTP 400, code=-201: bad query'
        );
    }
  );

  it('formats parser errors as JSON and allows successful help to exit normally', async () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const program = new Command().option('--json-errors');
    await runCli(program, ['node', 'octo', '--json-errors', '--unknown']);
    expect(JSON.parse(error.mock.calls[0][0]).error.message).toContain(
      'unknown option'
    );
    process.exitCode = 0;
    error.mockClear();
    const helpProgram = new Command();
    helpProgram.configureOutput({ writeOut: () => undefined });
    await runCli(helpProgram, ['node', 'octo', '--help']);
    expect(process.exitCode).toBe(0);
    expect(error).not.toHaveBeenCalled();
  });

  it('captures nested parser errors for commands registered before the runner', async () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const program = new Command().option('--json-errors');
    program
      .command('logs')
      .command('search')
      .action(() => undefined);
    await runCli(program, [
      'node',
      'octo',
      '--json-errors',
      'logs',
      'search',
      '--unknown',
    ]);
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.parse(error.mock.calls[0][0]).error.message).toContain(
      'unknown option'
    );
  });
});
