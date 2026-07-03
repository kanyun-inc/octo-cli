import { afterEach, describe, expect, it, vi } from 'vitest';
import { OctoClient } from './client.js';
import { getMcpTools, handleMcpTool } from './mcp.js';

function captureFetch(data: unknown = null) {
  const calls: {
    url: string;
    method: string;
    body: string;
    headers: Record<string, string>;
  }[] = [];
  const mockFetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      body: (init.body as string) ?? '',
      headers: (init.headers as Record<string, string>) ?? {},
    });
    return new Response(JSON.stringify({ code: 0, data, message: 'ok' }));
  });
  vi.stubGlobal('fetch', mockFetch);
  return calls;
}

function testClient() {
  return new OctoClient('https://example.com', {
    mode: 'appKey',
    appId: 'testId',
    appSecret: 'testSecret',
  });
}

describe('MCP tools', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('lists CLI-backed tools that were missing from MCP', () => {
    const tools = getMcpTools();
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).toEqual(
      expect.arrayContaining([
        'octo_issues_detail',
        'octo_issues_assign',
        'octo_issues_update',
        'octo_trace_aggregate',
        'octo_metrics_point',
        'octo_services_entries',
        'octo_rum_detail',
        'octo_users_search',
        'octo_cases_create',
        'octo_cases_link',
      ])
    );
    const metricsPoint = tools.find(
      (tool) => tool.name === 'octo_metrics_point'
    );
    const atProp = metricsPoint?.inputSchema.properties.at;
    expect(atProp).toBeDefined();
    expect((atProp as { type: string[] }).type).toEqual(['number', 'string']);
  });

  it('dispatches issue detail, assign, and update tools', async () => {
    vi.stubEnv('OCTOPUS_ENV', 'default-env');
    const client = testClient();
    const calls = captureFetch();

    await handleMcpTool('octo_issues_detail', { issueId: 'ISSUE-1' }, client);
    await handleMcpTool(
      'octo_issues_assign',
      { userId: 123, issueIds: ['ISSUE-1', 'ISSUE-2'] },
      client
    );
    await handleMcpTool(
      'octo_issues_update',
      { issueIds: ['ISSUE-1'], status: 'resolved' },
      client
    );

    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/log-error-tracking/issues/ISSUE-1'
    );
    expect(calls[1].method).toBe('POST');
    expect(calls[1].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/log-error-tracking/issues/batch-assign'
    );
    expect(JSON.parse(calls[1].body)).toEqual({
      assigneeId: 123,
      dataSource: 'log',
      issueIds: ['ISSUE-1', 'ISSUE-2'],
    });
    expect(calls[2].method).toBe('PUT');
    expect(calls[2].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/log-error-tracking/issues/batch-update'
    );
    expect(JSON.parse(calls[2].body)).toEqual({
      dataSource: 'log',
      env: 'default-env',
      issueIds: ['ISSUE-1'],
      status: 'resolved',
    });
  });

  it('dispatches trace aggregate and metrics point tools', async () => {
    const client = testClient();
    const calls = captureFetch();

    await handleMcpTool(
      'octo_trace_aggregate',
      {
        env: 'test',
        from: 1000,
        to: 2000,
        aggregation_field: 'duration',
        aggregation_op: 'avg',
        group_by: 'service',
        group_limit: 5,
      },
      client
    );
    await handleMcpTool(
      'octo_metrics_point',
      { env: 'test', at: '3000', queries: ['sum(cpu.usage{service=api})'] },
      client
    );

    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/trace/aggregate'
    );
    expect(JSON.parse(calls[0].body)).toEqual({
      env: 'test',
      from: 1000,
      to: 2000,
      aggregationFields: [{ field: 'duration', operation: 'avg' }],
      groupFields: [
        {
          field: 'service',
          limit: 5,
          sort: { field: 'duration', operation: 'avg', order: 'desc' },
        },
      ],
    });
    expect(calls[1].method).toBe('POST');
    expect(calls[1].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/metrics/query/queryMetric'
    );
    expect(JSON.parse(calls[1].body)).toEqual({
      env: 'test',
      to: 3000,
      queries: [
        {
          id: 'A',
          query: 'sum(cpu.usage{service=api})',
          dataSource: 'metric',
        },
      ],
    });
  });

  it('dispatches service entries, RUM detail, and user search tools', async () => {
    const client = testClient();
    const calls = captureFetch();

    await handleMcpTool(
      'octo_services_entries',
      { env: 'test', from: 1000, to: 2000, service: 'checkout' },
      client
    );
    await handleMcpTool('octo_rum_detail', { id: 'rum-event-1' }, client);
    await handleMcpTool(
      'octo_users_search',
      { names: ['alice', 'bob'] },
      client
    );

    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/apm/query/entries'
    );
    expect(JSON.parse(calls[0].body)).toEqual({
      env: 'test',
      from: 1000,
      to: 2000,
      service: 'checkout',
    });
    expect(calls[1].method).toBe('GET');
    expect(calls[1].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/rum/rum-event-1'
    );
    expect(calls[2].method).toBe('POST');
    expect(calls[2].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/users/search'
    );
    expect(JSON.parse(calls[2].body)).toEqual({
      names: ['alice', 'bob'],
    });
  });

  it('defaults service entries to the CLI 1h time window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-03T12:00:00.000Z'));
    vi.stubEnv('OCTOPUS_ENV', 'default-env');
    const client = testClient();
    const calls = captureFetch();

    await handleMcpTool(
      'octo_services_entries',
      { service: 'checkout' },
      client
    );

    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/apm/query/entries'
    );
    expect(JSON.parse(calls[0].body)).toEqual({
      env: 'default-env',
      from: 1_783_076_400_000,
      to: 1_783_080_000_000,
      service: 'checkout',
    });
  });

  it('dispatches representative case create and link tools', async () => {
    const client = testClient();
    const calls = captureFetch();

    await handleMcpTool(
      'octo_cases_create',
      {
        name: 'checkout incident',
        groupId: 7,
        priority: 'P1',
        status: 'doing',
        assignerId: 42,
        description: 'investigate checkout failures',
      },
      client
    );
    await handleMcpTool(
      'octo_cases_link',
      { id: 99, type: 'alert', targetId: '12345' },
      client
    );

    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/cases'
    );
    expect(JSON.parse(calls[0].body)).toEqual({
      name: 'checkout incident',
      groupId: 7,
      priority: 'P1',
      status: 'doing',
      assignerId: 42,
      description: 'investigate checkout failures',
    });
    expect(calls[1].method).toBe('POST');
    expect(calls[1].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/cases/99/relation'
    );
    expect(JSON.parse(calls[1].body)).toEqual({
      type: 'alert',
      targetId: '12345',
    });
  });
});
