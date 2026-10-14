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
        'octo_issues_ai_analysis',
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
        'octo_inspection_report_search',
      ])
    );
    const metricsPoint = tools.find(
      (tool) => tool.name === 'octo_metrics_point'
    );
    const atProp = metricsPoint?.inputSchema.properties.at;
    expect(atProp).toBeDefined();
    expect((atProp as { type: string[] }).type).toEqual(['number', 'string']);

    const issueAiAnalysis = tools.find(
      (tool) => tool.name === 'octo_issues_ai_analysis'
    );
    expect(issueAiAnalysis?.description).toContain(
      'OpenAPI has no status or result query endpoint'
    );
    expect(issueAiAnalysis?.description).toContain(
      'REST session lookup requires SSO'
    );
    expect(issueAiAnalysis?.description).toContain(
      'correlation identifier only'
    );
    expect(issueAiAnalysis?.description).toContain('Safe to retry');
  });

  describe('OpenAPI management tools', () => {
    const step = {
      pipelineType: 'pipeline',
      issuePipeline: { name: 'checkout errors', filter: 'service = checkout' },
    };
    const rule = {
      pipelineType: 'process',
      issuePipelineProcess: {
        name: 'fingerprint',
        type: 0,
        rule: 'error.type:RuntimeException -> runtime-error',
      },
    };
    const alertRule = {
      id: 12,
      version: 3,
      name: 'latency updated',
      env: 'online',
      groupId: 3,
      ruleType: 'metric',
      priority: 'P1',
      conditionEvaluationType: 'single',
      conditions: [{ id: 101, threshold: 200 }],
      notice: { receivers: ['alice'], repeatNoticeInterval: 600000 },
      closeAlert: true,
      extInfo: { dashboard: 'checkout' },
      wechatworkMentionIds: { '9': [8] },
    };
    const pipelinePath = '/error-tracking/process/pipelines';
    const issuePath = '/log-error-tracking/issues';
    type Scenario = {
      name: string;
      args: Record<string, unknown>;
      method: string;
      path: string;
      body?: unknown;
      data?: unknown;
      message?: string;
    };
    const scenarios: Scenario[] = [
      {
        name: 'octo_alerts_rules_update',
        args: { ruleId: 12, rule: alertRule },
        method: 'PUT',
        path: '/alert/rules/12',
        body: alertRule,
        data: { id: 12, version: 4, name: 'latency updated' },
      },
      {
        name: 'octo_alerts_close',
        args: { alertId: 34 },
        method: 'PUT',
        path: '/alerts/34/close',
        message: 'Alert 34 closed',
      },
      {
        name: 'octo_alerts_assign',
        args: { alertId: 34, assigneeUserId: 8, assigneeLdap: ' alice ' },
        method: 'PUT',
        path: '/alerts/34/assign',
        body: { assigneeUserId: 8, assigneeLdap: 'alice' },
        message: 'Alert 34 assigned',
      },
      {
        name: 'octo_alerts_assign',
        args: { alertId: 34, assigneeLdap: ' alice ' },
        method: 'PUT',
        path: '/alerts/34/assign',
        body: { assigneeLdap: 'alice' },
        message: 'Alert 34 assigned',
      },
      {
        name: 'octo_alerts_assign_cancel',
        args: { alertId: 34 },
        method: 'PUT',
        path: '/alerts/34/assign/cancel',
        message: 'Assignment cancelled for alert 34',
      },
      {
        name: 'octo_alerts_claim',
        args: { alertId: 34 },
        method: 'POST',
        path: '/alerts/34/claim',
        message: 'Alert 34 claimed',
      },
      {
        name: 'octo_issues_assign',
        args: {
          userId: 8,
          assigneeLdap: 'ignored',
          issueIds: [' a ', 'b', 'a'],
        },
        method: 'POST',
        path: `${issuePath}/batch-assign`,
        body: { assigneeId: 8, issueIds: ['a', 'b'], dataSource: 'log' },
        message: 'Issues assigned',
      },
      {
        name: 'octo_issues_assign',
        args: {
          assigneeLdap: ' alice ',
          issueIds: ['rum-issue'],
          dataSource: 'rum',
        },
        method: 'POST',
        path: `${issuePath}/batch-assign`,
        body: {
          assigneeLdap: 'alice',
          issueIds: ['rum-issue'],
          dataSource: 'rum',
        },
        message: 'Issues assigned',
      },
      {
        name: 'octo_issues_assign_cancel',
        args: { issueId: ' issue id/1 ', dataSource: 'rum' },
        method: 'DELETE',
        path: `${issuePath}/issue%20id%2F1/assign?dataSource=rum`,
        message: 'Assignment cancelled for Issue issue id/1',
      },
      {
        name: 'octo_issues_assign_cancel',
        args: { issueId: 'a' },
        method: 'DELETE',
        path: `${issuePath}/a/assign?dataSource=log`,
        message: 'Assignment cancelled for Issue a',
      },
      {
        name: 'octo_issues_aggregation_rules_list',
        args: { dataSource: 'log' },
        method: 'GET',
        path: `${pipelinePath}?dataSource=log`,
        data: {
          pipelineElementVOS: [
            {
              id: 10,
              status: 1,
              ...step,
              children: [{ id: 12, status: 2, ...rule }],
            },
          ],
        },
      },
      {
        name: 'octo_issues_aggregation_rules_create',
        args: { dataSource: 'log', issuePipelineElement: step },
        method: 'POST',
        path: `${pipelinePath}?dataSource=log`,
        body: {
          issuePipelineElement: step,
          parentElementId: null,
          previousElementId: null,
        },
        data: { id: 10, status: 1, ...step },
      },
      {
        name: 'octo_issues_aggregation_rules_create',
        args: {
          dataSource: 'rum',
          issuePipelineElement: rule,
          parentElementId: 10,
          previousElementId: 11,
        },
        method: 'POST',
        path: `${pipelinePath}?dataSource=rum`,
        body: {
          issuePipelineElement: rule,
          parentElementId: 10,
          previousElementId: 11,
        },
        data: { id: 12, status: 1, ...rule },
      },
      {
        name: 'octo_issues_aggregation_rules_update',
        args: { dataSource: 'rum', id: 12, issuePipelineElement: rule },
        method: 'PUT',
        path: `${pipelinePath}/12?dataSource=rum`,
        body: { issuePipelineElement: rule },
        message: 'Aggregation node 12 updated',
      },
      {
        name: 'octo_issues_aggregation_rules_delete',
        args: { dataSource: 'log', id: 12 },
        method: 'DELETE',
        path: `${pipelinePath}/12?dataSource=log`,
        message: 'Aggregation node 12 deleted',
      },
      {
        name: 'octo_issues_aggregation_rules_status',
        args: { dataSource: 'log', id: 12, enable: false },
        method: 'PUT',
        path: `${pipelinePath}/12/status?dataSource=log&enable=false`,
        message: 'Aggregation node 12 disabled',
      },
      {
        name: 'octo_issues_aggregation_rules_duplicate',
        args: { dataSource: 'rum', sourceId: 10 },
        method: 'POST',
        path: `${pipelinePath}/duplicate?dataSource=rum`,
        body: { sourceId: 10 },
        message: 'Aggregation step 10 copied',
      },
      {
        name: 'octo_issues_aggregation_rules_move',
        args: {
          dataSource: 'log',
          id: 12,
          parentElementId: 10,
          previousElementId: 11,
        },
        method: 'POST',
        path: `${pipelinePath}/move?dataSource=log`,
        body: { id: 12, parentElementId: 10, previousElementId: 11 },
        message: 'Aggregation node 12 moved',
      },
      {
        name: 'octo_issues_aggregation_rules_move',
        args: { dataSource: 'rum', id: 10, parentElementId: 0 },
        method: 'POST',
        path: `${pipelinePath}/move?dataSource=rum`,
        body: { id: 10, parentElementId: 0, previousElementId: null },
        message: 'Aggregation node 10 moved',
      },
    ];

    it('publishes all thirteen management tools without duplicate or ambiguous aggregation names', () => {
      const names = getMcpTools().map((tool) => tool.name);
      expect(new Set(names).size).toBe(names.length);
      const expected = [
        'octo_alerts_rules_update',
        'octo_alerts_close',
        'octo_alerts_assign',
        'octo_alerts_assign_cancel',
        'octo_alerts_claim',
        'octo_issues_assign_cancel',
        ...[
          'list',
          'create',
          'update',
          'delete',
          'status',
          'duplicate',
          'move',
        ].map((action) => `octo_issues_aggregation_rules_${action}`),
      ];
      expect(expected).toHaveLength(13);
      expect(names).toEqual(expect.arrayContaining(expected));
      expect(
        names
          .filter((name) => name.startsWith('octo_issues_aggregation_'))
          .sort()
      ).toEqual(
        expected
          .filter((name) => name.startsWith('octo_issues_aggregation_rules_'))
          .sort()
      );
      expect(new Set(scenarios.map((scenario) => scenario.name))).toEqual(
        new Set([...expected, 'octo_issues_assign'])
      );
    });

    it('publishes optional assignee alternatives and complete typed aggregation inputs', () => {
      const tools = getMcpTools();
      const issueAssign = tools.find(
        (tool) => tool.name === 'octo_issues_assign'
      );
      expect(issueAssign?.inputSchema).toMatchObject({
        properties: {
          userId: { type: 'integer', minimum: 1 },
          assigneeLdap: { type: 'string' },
        },
        required: ['issueIds'],
        anyOf: [{ required: ['userId'] }, { required: ['assigneeLdap'] }],
      });
      expect(
        tools.find((tool) => tool.name === 'octo_alerts_assign')?.inputSchema
      ).toMatchObject({
        required: ['alertId'],
        anyOf: [
          { required: ['assigneeUserId'] },
          { required: ['assigneeLdap'] },
        ],
      });
      expect(
        tools.find((tool) => tool.name === 'octo_alerts_rules_update')
          ?.inputSchema
      ).toMatchObject({
        properties: {
          ruleId: { type: 'integer', minimum: 1 },
          rule: { type: 'object', minProperties: 1 },
        },
        required: ['ruleId', 'rule'],
      });
      for (const tool of tools.filter((tool) =>
        tool.name.startsWith('octo_issues_aggregation_rules_')
      )) {
        expect(tool.inputSchema.required).toContain('dataSource');
        expect(tool.inputSchema.properties.dataSource).toMatchObject({
          type: 'string',
          enum: ['log', 'rum'],
        });
      }
      for (const action of ['create', 'update']) {
        const schema = tools.find(
          (tool) => tool.name === `octo_issues_aggregation_rules_${action}`
        )?.inputSchema;
        expect(schema?.required).toContain('issuePipelineElement');
        expect(schema?.properties.issuePipelineElement).toMatchObject({
          type: 'object',
          required: ['pipelineType'],
          properties: {
            pipelineType: { type: 'string', enum: ['pipeline', 'process'] },
            issuePipeline: {
              properties: {
                name: { type: 'string' },
                filter: { type: ['string', 'null'] },
              },
              required: ['name'],
            },
            issuePipelineProcess: {
              properties: {
                name: { type: 'string' },
                type: { type: 'integer', enum: [0, 1, 2] },
                rule: { type: 'string' },
              },
              required: ['name', 'type', 'rule'],
            },
          },
          oneOf: [
            {
              properties: { pipelineType: { const: 'pipeline' } },
              required: ['issuePipeline'],
              not: { required: ['issuePipelineProcess'] },
            },
            {
              properties: { pipelineType: { const: 'process' } },
              required: ['issuePipelineProcess'],
              not: { required: ['issuePipeline'] },
            },
          ],
        });
      }
      expect(
        tools.find(
          (tool) => tool.name === 'octo_issues_aggregation_rules_status'
        )?.inputSchema
      ).toMatchObject({
        properties: { enable: { type: 'boolean' } },
        required: ['dataSource', 'id', 'enable'],
      });
    });

    it.each(scenarios)(
      'dispatches $name with its OpenAPI wire contract',
      async (scenario) => {
        const calls = captureFetch(scenario.data ?? null);
        const result = await handleMcpTool(
          scenario.name,
          scenario.args,
          testClient()
        );
        expect(result).not.toHaveProperty('isError', true);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(
          `https://example.com/infra-octopus-openapi/v1${scenario.path}`
        );
        expect(calls[0].method).toBe(scenario.method);
        expect(calls[0].headers.Authorization).toBe('Bearer test-token');
        if (scenario.body === undefined) expect(calls[0].body).toBe('');
        else expect(JSON.parse(calls[0].body)).toEqual(scenario.body);
        if (scenario.message)
          expect(result.content[0].text).toBe(scenario.message);
        else expect(JSON.parse(result.content[0].text)).toEqual(scenario.data);
      }
    );

    it.each([
      { name: 'octo_alerts_rules_update', args: { ruleId: 12, rule: {} } },
      { name: 'octo_alerts_close', args: { alertId: 0 } },
      { name: 'octo_alerts_assign', args: { alertId: 34, assigneeLdap: ' ' } },
      { name: 'octo_alerts_assign_cancel', args: { alertId: -1 } },
      { name: 'octo_alerts_claim', args: { alertId: 0 } },
      { name: 'octo_issues_assign', args: { issueIds: ['a'] } },
      { name: 'octo_issues_assign_cancel', args: { issueId: ' ' } },
      { name: 'octo_issues_aggregation_rules_list', args: {} },
      {
        name: 'octo_issues_aggregation_rules_list',
        args: { dataSource: 'trace' },
      },
      {
        name: 'octo_issues_aggregation_rules_create',
        args: { dataSource: 'log', issuePipelineElement: rule },
      },
      {
        name: 'octo_issues_aggregation_rules_update',
        args: {
          dataSource: 'rum',
          id: 12,
          issuePipelineElement: {
            ...rule,
            issuePipelineProcess: { ...rule.issuePipelineProcess, type: 2 },
          },
        },
      },
      {
        name: 'octo_issues_aggregation_rules_update',
        args: {
          dataSource: 'log',
          id: 12,
          issuePipelineElement: {
            ...step,
            issuePipelineProcess: rule.issuePipelineProcess,
          },
        },
      },
      {
        name: 'octo_issues_aggregation_rules_delete',
        args: { dataSource: 'log', id: 0 },
      },
      {
        name: 'octo_issues_aggregation_rules_status',
        args: { dataSource: 'log', id: 12 },
      },
      {
        name: 'octo_issues_aggregation_rules_status',
        args: { dataSource: 'log', id: 12, enable: 'false' },
      },
      {
        name: 'octo_issues_aggregation_rules_duplicate',
        args: { dataSource: 'log', sourceId: -1 },
      },
      {
        name: 'octo_issues_aggregation_rules_move',
        args: { dataSource: 'log', id: 12, parentElementId: 12 },
      },
    ])('rejects invalid $name input before HTTP', async ({ name, args }) => {
      const calls = captureFetch();
      const result = await handleMcpTool(name, args, testClient());
      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toMatch(/^Error: /);
      expect(calls).toHaveLength(0);
    });

    it.each(
      scenarios.filter(
        (scenario, index) =>
          scenarios.findIndex(
            (candidate) => candidate.name === scenario.name
          ) === index
      )
    )(
      'reports the backend rejection for $name without retrying',
      async (scenario) => {
        const fetch = vi.fn(
          async () =>
            new Response(
              JSON.stringify({ code: -210, message: 'operation denied' })
            )
        );
        vi.stubGlobal('fetch', fetch);
        const result = await handleMcpTool(
          scenario.name,
          scenario.args,
          testClient()
        );
        expect(result).toHaveProperty('isError', true);
        expect(result.content[0].text).toContain(
          'API error (code=-210): operation denied'
        );
        expect(fetch).toHaveBeenCalledTimes(1);
      }
    );
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

  it('dispatches Issue AI analysis and returns the session ID', async () => {
    const client = testClient();
    const calls = captureFetch({ sessionId: 'session-1' });

    const result = await handleMcpTool(
      'octo_issues_ai_analysis',
      { issueId: 'ISSUE-1', context: '发布后开始报错' },
      client
    );

    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/log-error-tracking/issues/ISSUE-1/ai-analysis'
    );
    expect(JSON.parse(calls[0].body)).toEqual({ context: '发布后开始报错' });
    expect(result.content[0].text).toContain('"sessionId": "session-1"');
  });

  it('rejects Issue AI analysis with a blank Issue ID before HTTP', async () => {
    const client = testClient();
    const calls = captureFetch();

    const result = await handleMcpTool(
      'octo_issues_ai_analysis',
      { issueId: ' ' },
      client
    );

    expect(result.content[0].text).toContain('issueId must not be blank');
    expect(calls).toHaveLength(0);
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

  it('metrics query uses UTC+8 without shifting the requested range', async () => {
    const calls = captureFetch([]);
    const query = 'as_count(sum(rollup(test.requests{}, sum, 1d)))';

    const result = await handleMcpTool(
      'octo_metrics_query',
      {
        env: 'online',
        from: 1789747200000,
        to: 1789833600000,
        queries: [query],
      },
      testClient()
    );

    expect(result).toEqual({ content: [{ type: 'text', text: '[]' }] });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/metrics/query/timeseries'
    );
    expect(JSON.parse(calls[0].body)).toEqual({
      env: 'online',
      from: 1789747200000,
      to: 1789833600000,
      pointCount: 150,
      queries: [{ id: 'A', query, dataSource: 'metric' }],
      userUtcHour: 8,
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

  describe('inspection report search tool', () => {
    it('forwards filters and pagination', async () => {
      const calls = captureFetch([]);

      await handleMcpTool(
        'octo_inspection_report_search',
        {
          keyword: 'db',
          taskId: 7,
          taskGroupName: 'infra-db',
          result: 'abnormal',
          startCreateTime: 1000,
          endCreateTime: 2000,
          limit: 20,
          pageNo: 2,
        },
        testClient()
      );

      expect(calls[0].method).toBe('POST');
      expect(calls[0].url).toBe(
        'https://example.com/infra-octopus-openapi/v1/inspection/reports/search'
      );
      expect(JSON.parse(calls[0].body)).toEqual({
        keyword: 'db',
        taskId: 7,
        taskGroupName: 'infra-db',
        result: 'abnormal',
        startCreateTime: 1000,
        endCreateTime: 2000,
        pageSize: 20,
        pageNo: 2,
      });
    });

    it('defaults pagination and caps page size at 50', async () => {
      const calls = captureFetch([]);

      await handleMcpTool(
        'octo_inspection_report_search',
        { limit: 200 },
        testClient()
      );

      const body = JSON.parse(calls[0].body);
      expect(body.pageNo).toBe(1);
      expect(body.pageSize).toBe(50);
    });
  });
});
