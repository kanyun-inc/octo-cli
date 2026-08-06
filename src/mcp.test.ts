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
    token: 'test-token',
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
        'octo_issues_merge',
        'octo_issues_unmerge',
        'octo_issues_merge_children',
        'octo_trace_aggregate',
        'octo_metrics_point',
        'octo_services_entries',
        'octo_rum_detail',
        'octo_rum_aggregate',
        'octo_events_aggregate',
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

  it('dispatches the issue merge lifecycle tools', async () => {
    const client = testClient();
    const calls = captureFetch({ mergeIssueId: 'merge-1' });

    const mergeResult = await handleMcpTool(
      'octo_issues_merge',
      { issueIds: ['child-1', 'child-2'] },
      client
    );
    await handleMcpTool(
      'octo_issues_unmerge',
      {
        mergeIssueId: 'merge-1',
        childIssueIds: ['child-1'],
        dataSource: 'rum',
      },
      client
    );
    await handleMcpTool(
      'octo_issues_merge_children',
      { issueId: 'child-1' },
      client
    );

    expect(mergeResult.content[0].text).toContain('"mergeIssueId": "merge-1"');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/log-error-tracking/issues/merge'
    );
    expect(JSON.parse(calls[0].body)).toEqual({
      issueIds: ['child-1', 'child-2'],
      dataSource: 'log',
    });
    expect(calls[1].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/log-error-tracking/issues/unmerge'
    );
    expect(JSON.parse(calls[1].body)).toEqual({
      mergeIssueId: 'merge-1',
      childIssueIds: ['child-1'],
      dataSource: 'rum',
    });
    expect(calls[2].method).toBe('GET');
    expect(calls[2].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/log-error-tracking/issues/child-1/merge-children?dataSource=log'
    );
  });

  it('rejects invalid issue merge tool inputs before HTTP', async () => {
    const client = testClient();
    const calls = captureFetch();

    const mergeResult = await handleMcpTool(
      'octo_issues_merge',
      { issueIds: ['child-1', 'child-1'] },
      client
    );
    const unmergeResult = await handleMcpTool(
      'octo_issues_unmerge',
      { mergeIssueId: 'merge-1', childIssueIds: [] },
      client
    );

    expect(mergeResult.content[0]?.text).toContain('At least two');
    expect(unmergeResult.content[0]?.text).toContain('At least one');
    expect(calls).toHaveLength(0);
  });

  it('dispatches issue update with USER_COUNT ignoreRule', async () => {
    vi.stubEnv('OCTOPUS_ENV', 'default-env');
    const client = testClient();
    const calls = captureFetch();

    await handleMcpTool(
      'octo_issues_update',
      {
        issueIds: ['ISSUE-1'],
        status: 'ignored',
        dataSource: 'log',
        ignoreRule: {
          type: 'userCount',
          userRule: {
            userCount: 50,
            timestamp: 1751760000000,
            timeWindow: 3600000,
            userField: 'uid',
          },
        },
      },
      client
    );

    expect(JSON.parse(calls[0].body)).toEqual({
      dataSource: 'log',
      env: 'default-env',
      issueIds: ['ISSUE-1'],
      status: 'ignored',
      ignoreRule: {
        type: 'userCount',
        userRule: {
          userCount: 50,
          timestamp: 1751760000000,
          timeWindow: 3600000,
          userField: 'uid',
        },
      },
    });
  });

  it('rejects ignoreRule when status is resolved', async () => {
    const client = testClient();

    await expect(
      handleMcpTool(
        'octo_issues_update',
        {
          issueIds: ['ISSUE-1'],
          status: 'resolved',
          ignoreRule: { type: 'time', timeRule: { endTime: 1785542399000 } },
        },
        client
      )
    ).resolves.toEqual({
      content: [
        {
          type: 'text',
          text: 'Error: ignoreRule is only allowed when status is ignored',
        },
      ],
      isError: true,
    });
  });

  it('rejects TIME ignoreRule without endTime', async () => {
    const client = testClient();

    await expect(
      handleMcpTool(
        'octo_issues_update',
        {
          issueIds: ['ISSUE-1'],
          status: 'ignored',
          ignoreRule: { type: 'time', timeRule: {} },
        },
        client
      )
    ).resolves.toEqual({
      content: [
        {
          type: 'text',
          text: 'Error: ignoreRule.timeRule.endTime is required for TIME',
        },
      ],
      isError: true,
    });
  });

  it('rejects ignoreRule payloads that mix type-specific sub rules', async () => {
    const client = testClient();

    await expect(
      handleMcpTool(
        'octo_issues_update',
        {
          issueIds: ['ISSUE-1'],
          status: 'ignored',
          ignoreRule: {
            type: 'time',
            timeRule: { endTime: 1785542399000 },
            appearRule: { appearCount: 3 },
          },
        },
        client
      )
    ).resolves.toEqual({
      content: [
        {
          type: 'text',
          text: 'Error: ignoreRule.appearRule is not allowed for TIME',
        },
      ],
      isError: true,
    });

    await expect(
      handleMcpTool(
        'octo_issues_update',
        {
          issueIds: ['ISSUE-1'],
          status: 'ignored',
          ignoreRule: {
            type: 'appearCount',
            appearRule: { appearCount: 3 },
            userRule: { userCount: 2, userField: 'uid' },
          },
        },
        client
      )
    ).resolves.toEqual({
      content: [
        {
          type: 'text',
          text: 'Error: ignoreRule.userRule is not allowed for APPEAR_COUNT',
        },
      ],
      isError: true,
    });

    await expect(
      handleMcpTool(
        'octo_issues_update',
        {
          issueIds: ['ISSUE-1'],
          status: 'ignored',
          ignoreRule: {
            type: 'userCount',
            userRule: { userCount: 2, userField: 'uid' },
            timeRule: { endTime: 1785542399000 },
          },
        },
        client
      )
    ).resolves.toEqual({
      content: [
        {
          type: 'text',
          text: 'Error: ignoreRule.timeRule is not allowed for USER_COUNT',
        },
      ],
      isError: true,
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

  it('dispatches RUM and event aggregate tools', async () => {
    const client = testClient();
    const calls = captureFetch();

    await handleMcpTool(
      'octo_rum_aggregate',
      {
        env: 'test',
        from: 1000,
        to: 2000,
        aggregation_field: 'view.loading_time',
        aggregation_op: 'p95',
        group_by: 'view.name',
        group_limit: 5,
      },
      client
    );
    await handleMcpTool(
      'octo_events_aggregate',
      { env: 'online', from: 3000, to: 4000 },
      client
    );

    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/rum/aggregate'
    );
    expect(JSON.parse(calls[0].body)).toEqual({
      env: 'test',
      from: 1000,
      to: 2000,
      aggregationField: [{ field: 'view.loading_time', operation: 'p95' }],
      groupFieldList: [
        {
          field: 'view.name',
          limit: 5,
          sort: {
            field: 'view.loading_time',
            operation: 'p95',
            order: 'desc',
          },
        },
      ],
    });
    expect(calls[1].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/event/aggregate'
    );
    expect(JSON.parse(calls[1].body)).toEqual({
      env: 'online',
      from: 3000,
      to: 4000,
      aggregationField: [{ field: '*', operation: 'count' }],
    });
  });

  it.each([
    'octo_logs_aggregate',
    'octo_trace_aggregate',
    'octo_rum_aggregate',
    'octo_events_aggregate',
  ])(
    '%s rejects a non-numeric group limit before sending a request',
    async (tool) => {
      const client = testClient();
      const calls = captureFetch();

      const result = await handleMcpTool(
        tool,
        { group_by: 'type', group_limit: 'abc' },
        client
      );

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Error: group_limit must be a positive integer, received "abc"',
          },
        ],
        isError: true,
      });
      expect(calls).toHaveLength(0);
    }
  );

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5, '', '1.5'])(
    'rejects malformed MCP group limit %s',
    async (groupLimit) => {
      const client = testClient();
      const calls = captureFetch();

      const result = await handleMcpTool(
        'octo_events_aggregate',
        { group_by: 'type', group_limit: groupLimit },
        client
      );

      expect(result).toHaveProperty('isError', true);
      expect(calls).toHaveLength(0);
    }
  );

  it('accepts a numeric string MCP group limit', async () => {
    const client = testClient();
    const calls = captureFetch();

    const result = await handleMcpTool(
      'octo_events_aggregate',
      { group_by: 'type', group_limit: '5' },
      client
    );

    expect(result).not.toHaveProperty('isError');
    expect(JSON.parse(calls[0].body).groupFieldList[0].limit).toBe(5);
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

  describe('alert rule query tools', () => {
    it('exposes group list and batch detail schemas', () => {
      const tools = getMcpTools();
      const toolNames = tools.map((tool) => tool.name);

      expect(toolNames).toEqual(
        expect.arrayContaining([
          'octo_alerts_groups_list',
          'octo_alerts_rules_details_search',
        ])
      );

      const detailsTool = tools.find(
        (tool) => tool.name === 'octo_alerts_rules_details_search'
      );
      const ruleIds = detailsTool?.inputSchema.properties.ruleIds as {
        minItems: number;
        maxItems: number;
        items: { type: string; minimum: number };
      };
      expect(detailsTool?.inputSchema.required).toEqual(['ruleIds']);
      expect(ruleIds).toMatchObject({
        minItems: 1,
        maxItems: 100,
        items: { type: 'integer', minimum: 1 },
      });
    });

    it('lists groups and searches rule details through the matching endpoints', async () => {
      const calls = captureFetch([]);
      const client = testClient();

      await handleMcpTool('octo_alerts_groups_list', {}, client);
      await handleMcpTool(
        'octo_alerts_rules_details_search',
        { ruleIds: [2, 1, 2] },
        client
      );

      expect(calls[0].method).toBe('GET');
      expect(calls[0].url).toBe(
        'https://example.com/infra-octopus-openapi/v1/alert/rules/groups'
      );
      expect(calls[1].method).toBe('POST');
      expect(calls[1].url).toBe(
        'https://example.com/infra-octopus-openapi/v1/alert/rules/details/search'
      );
      expect(JSON.parse(calls[1].body)).toEqual({ ruleIds: [2, 1, 2] });
    });

    it('rejects an empty detail batch before calling the API', async () => {
      const calls = captureFetch();

      const result = await handleMcpTool(
        'octo_alerts_rules_details_search',
        { ruleIds: [] },
        testClient()
      );

      expect('isError' in result && result.isError).toBe(true);
      expect(calls).toHaveLength(0);
    });
  });

  describe('alert rule disables', () => {
    it('exposes the three disable tools', () => {
      const toolNames = getMcpTools().map((tool) => tool.name);

      expect(toolNames).toEqual(
        expect.arrayContaining([
          'octo_alerts_rule_disable_create',
          'octo_alerts_rule_disable_list',
          'octo_alerts_rule_disable_delete',
        ])
      );
    });

    it('creates a disable from durationMinutes', async () => {
      const calls = captureFetch(1001);
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-22T00:00:00Z'));

      await handleMcpTool(
        'octo_alerts_rule_disable_create',
        { ruleId: 42, durationMinutes: 120, disableNotifyContent: 'holiday' },
        testClient()
      );

      expect(calls[0].url).toBe(
        'https://example.com/infra-octopus-openapi/v1/alert/rules/disables/create'
      );
      const body = JSON.parse(calls[0].body);
      expect(body.ruleId).toBe(42);
      expect(body.endTime - body.startTime).toBe(120 * 60_000);
      expect(body.scope).toBe('all');
      expect(body.disableNotifyContent).toBe('holiday');
    });

    it('fails when neither endTime nor durationMinutes is given', async () => {
      const calls = captureFetch();

      const result = await handleMcpTool(
        'octo_alerts_rule_disable_create',
        { ruleId: 42 },
        testClient()
      );

      expect('isError' in result && result.isError).toBe(true);
      expect(calls).toHaveLength(0);
    });

    it('lists and deletes disables by the right id', async () => {
      const calls = captureFetch([]);
      const client = testClient();

      await handleMcpTool(
        'octo_alerts_rule_disable_list',
        { ruleId: 42 },
        client
      );
      await handleMcpTool(
        'octo_alerts_rule_disable_delete',
        { disableId: 1001 },
        client
      );

      expect(calls[0].method).toBe('GET');
      expect(calls[0].url).toBe(
        'https://example.com/infra-octopus-openapi/v1/alert/rules/disables/42'
      );
      expect(calls[1].method).toBe('DELETE');
      // Deletes take the disable record's id, not the rule id.
      expect(calls[1].url).toBe(
        'https://example.com/infra-octopus-openapi/v1/alert/rules/disables/1001'
      );
    });
  });

  describe('alert schema back-compat', () => {
    it('still accepts the deprecated singular env/priority and sends them as arrays', async () => {
      const calls = captureFetch({ count: 0, list: [] });

      await handleMcpTool(
        'octo_alerts_rules_search',
        { env: 'online', priority: 'P0' },
        testClient()
      );

      const body = JSON.parse(calls[0].body);
      expect(body.envs).toEqual(['online']);
      expect(body.priorities).toEqual(['P0']);
      expect(body.env).toBeUndefined();
      expect(body.priority).toBeUndefined();
    });

    it('merges plural and singular without duplicating values', async () => {
      const calls = captureFetch({ count: 0, list: [] });

      await handleMcpTool(
        'octo_alerts_rules_search',
        { envs: ['online'], env: 'online', priorities: ['P0'], priority: 'P1' },
        testClient()
      );

      const body = JSON.parse(calls[0].body);
      expect(body.envs).toEqual(['online']);
      expect(body.priorities).toEqual(['P0', 'P1']);
    });

    it('omits the filters entirely when neither form is given', async () => {
      const calls = captureFetch({ count: 0, list: [] });

      await handleMcpTool('octo_alerts_rules_search', {}, testClient());

      const body = JSON.parse(calls[0].body);
      expect(body.envs).toBeUndefined();
      expect(body.priorities).toBeUndefined();
    });

    it('keeps the deprecated params and enum values in the published schema', () => {
      const tools = getMcpTools();
      const rulesSearch = tools.find(
        (tool) => tool.name === 'octo_alerts_rules_search'
      );
      const alertsSearch = tools.find(
        (tool) => tool.name === 'octo_alerts_search'
      );
      const silenceCreate = tools.find(
        (tool) => tool.name === 'octo_alerts_silence_create'
      );

      // Removing these would break MCP clients that validate against the schema.
      const ruleProps = rulesSearch?.inputSchema.properties as Record<
        string,
        unknown
      >;
      expect(ruleProps.env).toBeDefined();
      expect(ruleProps.priority).toBeDefined();
      expect(ruleProps.envs).toBeDefined();
      expect(ruleProps.priorities).toBeDefined();

      const statusProp = (
        alertsSearch?.inputSchema.properties as Record<
          string,
          { enum?: string[] }
        >
      ).status;
      expect(statusProp.enum).toEqual(
        expect.arrayContaining(['firing', 'resolved', 'all'])
      );

      const scopeProp = (
        silenceCreate?.inputSchema.properties as Record<
          string,
          { enum?: string[] }
        >
      ).scope;
      expect(scopeProp.enum).toEqual(
        expect.arrayContaining(['all', 'specify', 'ALL', 'SPECIFY'])
      );
    });

    it('normalizes an uppercase scope before sending it', async () => {
      const calls = captureFetch();

      await handleMcpTool(
        'octo_alerts_silence_create',
        { ruleId: 1, alertId: 2, durationMinutes: 30, scope: 'ALL' },
        testClient()
      );

      expect(JSON.parse(calls[0].body).scope).toBe('all');
    });

    it('drops a literal "all" status instead of forwarding it', async () => {
      const calls = captureFetch([]);

      await handleMcpTool(
        'octo_alerts_search',
        { status: 'all', from: 1, to: 2 },
        testClient()
      );

      expect(JSON.parse(calls[0].body).status).toBeUndefined();
    });

    it('forwards alertRuleType and pageNo', async () => {
      const calls = captureFetch([]);

      await handleMcpTool(
        'octo_alerts_search',
        { from: 1, to: 2, alertRuleType: 'metric', pageNo: 3 },
        testClient()
      );

      const body = JSON.parse(calls[0].body);
      expect(body.alertRuleType).toBe('metric');
      expect(body.pageNo).toBe(3);
    });
  });
});
