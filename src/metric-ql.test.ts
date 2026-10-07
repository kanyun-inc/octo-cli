import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OctoClient } from './client.js';
import { registerCommands } from './commands.js';
import { ApiError, runCli } from './errors.js';
import { getMetricGroupingHint, getMetricRegexHint } from './metric-ql.js';

describe('metric QL guidance', () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    ['as_rate(sum(m{})) by (service)', 'as_rate(sum(m{}) by (label))'],
    [
      'as_count(sum(rollup(m{}, default, 1m))) by (span.name)',
      'as_count(sum(rollup(m{}, default, 1m)) by (label))',
    ],
    [
      'top(sum(m{}), 10, max) by (service)',
      'top(sum(m{}) by (label), 10, max)',
    ],
    [
      'moving_rollup(sum(m{}), sum, 5m) by (service)',
      'moving_rollup(sum(m{}) by (label), sum, 5m)',
    ],
    ['default(sum(m{}), 0) by (service)', 'default(sum(m{}) by (label), 0)'],
    [
      'sum(rollup(m{}, default, 1m) by (service))',
      'sum(rollup(m{}, default, 1m)) by (label)',
    ],
    [
      'top((as_rate(sum(m{})) by (service)) * 1000, 5, max)',
      'as_rate(sum(m{}) by (label))',
    ],
    ['AS_RATE(SUM(m{}))\n by (service)', 'as_rate(sum(m{}) by (label))'],
  ])('explains wrapper-owned by in %s', (query, example) => {
    const hint = getMetricGroupingHint(query);
    expect(hint).toContain('SPACE AGGREGATE');
    expect(hint).toContain(example);
    expect(hint).toContain('metrics query --help');
  });

  it.each([
    ['as_rate(sum(m{} by (service)))', "space aggregate's argument"],
    ['as_rate(sum(m{tag = value by (service)}))', 'inside a metric tag filter'],
    ['sum(m by (service))', "space aggregate's argument"],
  ])('explains grouping inside an argument/filter in %s', (query, reason) => {
    expect(getMetricGroupingHint(query)).toContain(reason);
    expect(getMetricGroupingHint(query)).toContain('as_rate(sum(m{');
  });

  it.each([
    'as_rate(sum(m{}) by (service))',
    'as_count(sum(rollup(m{}, default, 1m)) by (span.name))',
    'top((p99(h{}) by (service) * 1000), 5, max)',
    'moving_rollup(sum(m{}) by (service), sum, 5m)',
    'rollup(sum(m{}) by (service), sum, 1m)',
    'default(sum(m{}) by (service), 0)',
    'as_rate(count_values(h{}) by (destKey))',
    'sum(avg(m{}) by (service, pod)) by (service)',
    'p99.9(h{}) by (service)',
    'as_rate(sum(m{})) / max(n{}) by (pod)',
    'as_rate(sum(m{tag = "as_count(sum(m{})) by (fake)"}) by (service))',
    "sum(m{tag = 'by (fake)'}) by (service)",
    'sum(m{tag = "escaped \\" ) by (fake)"}) by (service)',
    'sum(m{tag = foo\\(bar\\)}) by (service)',
    'as_rate(sum(m{}))',
    'as_rate(sum(m{})) by (service',
    'as_rate(sum(m{tag = "unterminated})) by (service)',
    'as_rate(sum(m{}]) by (service)',
  ])('does not guess or flag legitimate nesting/quoted text in %s', (query) => {
    expect(getMetricGroupingHint(query)).toBeUndefined();
  });

  const badQuery = 'as_count(sum(rollup(m{}, default, 1m))) by (span.name)';
  const original = "line 1:60 mismatched input 'by' expecting {')', 'by'}";

  function reject(code = -201, message = original, status = 400) {
    const fetch = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ code, message }), { status })
    );
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }

  it.each([
    'sum(trace.service.requests{service =~ "leo.*"})',
    "sum(m{service =~ 'leo.*'}) by (service)",
    'as_rate(sum(m{service\n=~ \n"leo.*"}) by (service))',
    'sum(m{env = online, service =~ "leo.*"})',
  ])('explains the unsupported PromQL operator in %s', (query) => {
    const hint = getMetricRegexHint(query);
    expect(hint).toContain('PromQL =~ is not supported');
    expect(hint).toContain('= for exact matches');
    expect(hint).toContain('IN (...)');
    expect(hint).toContain('service = leo*');
    expect(hint).toContain('different semantics');
  });

  it.each([
    'sum(m{service = "literal =~ text"})',
    "sum(m{service = 'literal =~ text'})",
    String.raw`sum(m{service = "escaped \" =~ text"})`,
    'sum(m{service = leo*})',
    'sum(m{service IN (leo-exam,leo-app)})',
    'sum(m{service regexp "leo.*"})',
    'sum(m{service=~prefix})',
    'sum(m{service = "~prefix"})',
    'sum(m{service = ~ "leo.*"})',
    String.raw`sum(m{service \=~ "leo.*"})`,
    'sum(m{service =~ "unterminated})',
    'sum(m{}) =~ "leo.*"',
  ])(
    'does not flag quoted, literal, escaped, or non-filter =~ in %s',
    (query) => {
      expect(getMetricRegexHint(query)).toBeUndefined();
    }
  );

  it.each(['timeseries', 'point'])(
    'adds regex guidance to %s errors without requiring by in the backend message',
    async (kind) => {
      const message = `extraneous input '"leo.*"' expecting '}'`;
      const fetch = reject(-201, message);
      const queries = [
        { id: 'A', query: 'sum(m{service =~ "leo.*"})', dataSource: 'metric' },
        {
          id: 'B',
          query: 'sum(m{service = "literal =~ text"})',
          dataSource: 'metric',
        },
      ];
      const client = new OctoClient('https://example.com', { token: 'test' });
      const request =
        kind === 'timeseries'
          ? client.metricsTimeseries({ env: 'online', from: 1, to: 2, queries })
          : client.metricsQuery({ env: 'online', to: 2, queries });
      const error = await request.catch((error) => error);
      if (!(error instanceof ApiError)) throw error;
      expect(error).toMatchObject({ message, code: -201, status: 400 });
      expect(error.hints).toHaveLength(1);
      expect(error.hints?.[0]).toContain('Query "A": PromQL =~');
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(fetch.mock.calls[0][1].body)).queries).toEqual(
        queries
      );
    }
  );

  it.each([-17, -211])(
    'does not diagnose regex on non-syntax API code %s',
    async (code) => {
      reject(code, 'request failed');
      const client = new OctoClient('https://example.com', { token: 'test' });
      await expect(
        client.metricsQuery({
          env: 'online',
          to: 2,
          queries: [
            {
              id: 'A',
              query: 'sum(m{service =~ "leo.*"})',
              dataSource: 'metric',
            },
          ],
        })
      ).rejects.toMatchObject({ code, hints: undefined });
    }
  );

  it.each([false, true])(
    'CLI formats regex guidance and preserves failures (JSON: %s)',
    async (json) => {
      const message = `extraneous input '"leo.*"' expecting '}'`;
      reject(-201, message);
      vi.stubEnv('OCTOPUS_TOKEN', 'test');
      vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');
      const stderr = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const stdout = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined);
      const program = new Command().option('--json-errors');
      registerCommands(program);
      await runCli(program, [
        'node',
        'octo',
        ...(json ? ['--json-errors'] : []),
        'metrics',
        'query',
        'sum(m{service =~ "leo.*"})',
        '-e',
        'online',
      ]);
      expect(process.exitCode).toBe(1);
      expect(stdout).not.toHaveBeenCalled();
      expect(stderr).toHaveBeenCalledTimes(1);
      const rendered = stderr.mock.calls[0][0];
      if (json) {
        const error = JSON.parse(rendered).error;
        expect(error).toMatchObject({ message, status: 400, code: -201 });
        expect(error.hints).toHaveLength(1);
        expect(error.hints[0]).toContain('PromQL =~');
      } else {
        expect(rendered).toContain(message);
        expect(rendered).toContain('\nHint: Query "A": PromQL =~');
      }
    }
  );

  it.each(['timeseries', 'point'])(
    'preserves %s failures and identifies both bad queries without rewriting/retrying',
    async (kind) => {
      const fetch = reject();
      const queries = [
        { id: 'A', query: badQuery, dataSource: 'metric' },
        { id: 'B', query: badQuery, dataSource: 'metric' },
        { id: 'C', query: 'sum(m{}) by (service)', dataSource: 'metric' },
      ];
      const client = new OctoClient('https://example.com', { token: 'test' });
      const request =
        kind === 'timeseries'
          ? client.metricsTimeseries({ env: 'online', from: 1, to: 2, queries })
          : client.metricsQuery({ env: 'online', to: 2, queries });
      const error = await request.catch((error) => error);
      expect(error).toBeInstanceOf(ApiError);
      if (!(error instanceof ApiError)) throw error;
      expect(error).toMatchObject({
        message: original,
        status: 400,
        code: -201,
      });
      expect(error.hints).toHaveLength(2);
      expect(error.hints?.[0]).toContain('Query "A"');
      expect(error.hints?.[1]).toContain('Query "B"');
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(fetch.mock.calls[0][1].body)).queries).toEqual(
        queries
      );
    }
  );

  it.each([
    [-17, 'rate limited'],
    [-211, 'by cannot change metric type'],
    [-201, 'metric name not found'],
  ])('does not decorate code %s / unrelated errors', async (code, message) => {
    reject(code, message);
    const client = new OctoClient('https://example.com', { token: 'test' });
    await expect(
      client.metricsTimeseries({
        env: 'online',
        from: 1,
        to: 2,
        queries: [{ id: 'A', query: badQuery, dataSource: 'metric' }],
      })
    ).rejects.toMatchObject({ code, message, hints: undefined });
  });

  it('does not diagnose a valid query when the backend reports another by error', async () => {
    reject();
    const client = new OctoClient('https://example.com', { token: 'test' });
    await expect(
      client.metricsQuery({
        env: 'online',
        to: 2,
        queries: [
          {
            id: 'A',
            query: 'as_rate(sum(m{}) by (service))',
            dataSource: 'metric',
          },
        ],
      })
    ).rejects.toMatchObject({ message: original, hints: undefined });
  });

  it('does not add metric guidance to log query errors', async () => {
    reject();
    const client = new OctoClient('https://example.com', { token: 'test' });
    await expect(
      client.logsSearch({ env: 'online', from: 1, to: 2, query: badQuery })
    ).rejects.toMatchObject({ message: original, hints: undefined });
  });

  it('passes successful queries through even if they resemble a known mistake', async () => {
    const data = [{ id: 'A', values: [[1]], times: [2], labelList: [] }];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ code: 0, data })))
    );
    const client = new OctoClient('https://example.com', { token: 'test' });
    await expect(
      client.metricsQuery({
        env: 'online',
        to: 2,
        queries: [{ id: 'A', query: badQuery, dataSource: 'metric' }],
      })
    ).resolves.toEqual(data);
  });

  it.each([false, true])(
    'CLI retains exit 1 and empty stdout (JSON: %s)',
    async (json) => {
      const fetch = reject(-201, original, 200);
      vi.stubEnv('OCTOPUS_TOKEN', 'test');
      vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');
      const stderr = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const stdout = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined);
      const program = new Command().option('--json-errors');
      registerCommands(program);
      await runCli(program, [
        'node',
        'octo',
        ...(json ? ['--json-errors'] : []),
        'metrics',
        'query',
        badQuery,
        '-e',
        'online',
      ]);
      expect(process.exitCode).toBe(1);
      expect(stdout).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(stderr).toHaveBeenCalledTimes(1);
      const rendered = stderr.mock.calls[0][0];
      if (json) {
        const error = JSON.parse(rendered).error;
        expect(error).toMatchObject({
          status: 200,
          code: -201,
          message: original,
        });
        expect(error.hints).toHaveLength(1);
        expect(error.hints[0]).toContain('Query "A"');
      } else {
        expect(rendered).toContain(original);
        expect(rendered).toContain('\nHint: Query "A"');
        expect(rendered).toContain(
          'as_count(sum(rollup(m{}, default, 1m)) by (label))'
        );
      }
    }
  );
});
