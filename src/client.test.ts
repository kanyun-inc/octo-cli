import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeAlertScope, OctoClient } from './client.js';

// Intercept fetch to capture request details
function captureFetch() {
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
    return new Response(JSON.stringify({ code: 0, data: null, message: 'ok' }));
  });
  vi.stubGlobal('fetch', mockFetch);
  return calls;
}

describe('OctoClient alert methods', () => {
  const client = new OctoClient('https://example.com', {
    token: 'test-token',
  });

  it('alertRulesDelete sends plain number as body (not object)', async () => {
    const calls = captureFetch();
    await client.alertRulesDelete(123456);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/alert/rules'
    );
    // Body must be a plain number, not {"ruleId":123456}
    expect(calls[0].body).toBe('123456');
    vi.restoreAllMocks();
  });

  it('alertSilenceDelete uses path parameter', async () => {
    const calls = captureFetch();
    await client.alertSilenceDelete(789);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/alerts/silences/789'
    );
    vi.restoreAllMocks();
  });

  it('alertsSearch includes groupId and ruleIds when provided', async () => {
    const calls = captureFetch();
    await client.alertsSearch({
      from: 1000,
      to: 2000,
      groupId: 42,
      ruleIds: [1, 2, 3],
    });

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body);
    expect(body.groupId).toBe(42);
    expect(body.ruleIds).toEqual([1, 2, 3]);
    vi.restoreAllMocks();
  });

  it('alertRulesCreate sends array body', async () => {
    const calls = captureFetch();
    const rules = [{ name: 'test-rule', ruleType: 'log' }];
    await client.alertRulesCreate(rules);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    const body = JSON.parse(calls[0].body);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].name).toBe('test-rule');
    vi.restoreAllMocks();
  });

  it('alertGroupsList gets all alert groups without a body', async () => {
    const calls = captureFetch();
    await client.alertGroupsList();

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/alert/rules/groups'
    );
    expect(calls[0].body).toBe('');
    vi.restoreAllMocks();
  });

  it('alertRuleDetailsSearch preserves requested IDs in the POST body', async () => {
    const calls = captureFetch();
    await client.alertRuleDetailsSearch([2, 1, 2]);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/alert/rules/details/search'
    );
    expect(JSON.parse(calls[0].body)).toEqual({ ruleIds: [2, 1, 2] });
    vi.restoreAllMocks();
  });

  it('alertRuleDetailsSearch rejects invalid batches before the request', async () => {
    const calls = captureFetch();

    await expect(client.alertRuleDetailsSearch([])).rejects.toThrow(
      'At least one alert rule ID is required'
    );
    await expect(
      client.alertRuleDetailsSearch(Array.from({ length: 101 }, () => 1))
    ).rejects.toThrow('At most 100 alert rule IDs can be queried at once');
    await expect(client.alertRuleDetailsSearch([1, 0])).rejects.toThrow(
      'Alert rule IDs must be positive integers'
    );

    expect(calls).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it('every request carries an octo-cli User-Agent', async () => {
    const calls = captureFetch();
    await client.alertRulesDelete(1);

    expect(calls).toHaveLength(1);
    expect(calls[0].headers['User-Agent']).toMatch(
      /^octo-cli\/[^ ]+ \(node v\d+\.\d+\.\d+; [a-z0-9]+\)$/
    );
    vi.restoreAllMocks();
  });

  it('uses the PAT as a Bearer authorization header', async () => {
    const calls = captureFetch();
    await client.alertRulesDelete(1);

    expect(calls).toHaveLength(1);
    expect(calls[0].headers.Authorization).toBe('Bearer test-token');
    vi.restoreAllMocks();
  });

  it('adds headers from OCTOPUS_EXTRA_HEADERS', async () => {
    vi.stubEnv(
      'OCTOPUS_EXTRA_HEADERS',
      JSON.stringify({
        'X-Octopus-Tenant': 'tenant-a',
        'X-Request-Source': 'codex',
      })
    );
    const calls = captureFetch();
    await client.alertRulesDelete(1);

    expect(calls).toHaveLength(1);
    expect(calls[0].headers['X-Octopus-Tenant']).toBe('tenant-a');
    expect(calls[0].headers['X-Request-Source']).toBe('codex');
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('keeps built-in headers when extra headers use different casing', async () => {
    vi.stubEnv(
      'OCTOPUS_EXTRA_HEADERS',
      JSON.stringify({
        authorization: 'Bearer invalid',
        'content-type': 'text/plain',
        'USER-AGENT': 'custom-agent',
      })
    );
    const calls = captureFetch();
    await client.alertRulesDelete(1);

    expect(calls).toHaveLength(1);
    expect(calls[0].headers.Authorization).toBe('Bearer test-token');
    expect(calls[0].headers['Content-Type']).toBe('application/json');
    expect(calls[0].headers['User-Agent']).toMatch(/^octo-cli\//);
    expect(calls[0].headers.authorization).toBeUndefined();
    expect(calls[0].headers['content-type']).toBeUndefined();
    expect(calls[0].headers['USER-AGENT']).toBeUndefined();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('ignores empty OCTOPUS_EXTRA_HEADERS', async () => {
    vi.stubEnv('OCTOPUS_EXTRA_HEADERS', '');
    const calls = captureFetch();
    await client.alertRulesDelete(1);

    expect(calls).toHaveLength(1);
    expect(calls[0].headers.Authorization).toBe('Bearer test-token');
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('rejects invalid OCTOPUS_EXTRA_HEADERS', async () => {
    vi.stubEnv('OCTOPUS_EXTRA_HEADERS', 'not-json');
    captureFetch();

    await expect(client.alertRulesDelete(1)).rejects.toThrow(
      'OCTOPUS_EXTRA_HEADERS must be a valid JSON object'
    );
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('alertDetail uses GET with path parameter', async () => {
    const calls = captureFetch();
    await client.alertDetail(99);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/alerts/99'
    );
    vi.restoreAllMocks();
  });

  it('alertTimeseries uses GET with query parameters', async () => {
    const calls = captureFetch();
    await client.alertTimeseries({
      alertId: 42,
      from: 1000,
      to: 2000,
      conditionId: 3,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    // Query parameters are emitted in a deterministic canonical order.
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/alerts/42/timeseries?conditionId=3&from=1000&to=2000'
    );
    vi.restoreAllMocks();
  });

  it('alertTimeseries omits conditionId when not provided', async () => {
    const calls = captureFetch();
    await client.alertTimeseries({
      alertId: 42,
      from: 1000,
      to: 2000,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/alerts/42/timeseries?from=1000&to=2000'
    );
    vi.restoreAllMocks();
  });

  it('usersSearch sends names (plural) as field key', async () => {
    const calls = captureFetch();
    await client.usersSearch(['alice', 'bob']);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/users/search'
    );
    const body = JSON.parse(calls[0].body);
    expect(body.names).toEqual(['alice', 'bob']);
    expect(body.name).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('alertSilenceCreate sends correct structure', async () => {
    const calls = captureFetch();
    await client.alertSilenceCreate({
      ruleId: 100,
      alertId: 200,
      startTime: 1000,
      endTime: 2000,
      scope: 'all',
      silentlyNotify: false,
    });

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body);
    expect(body.ruleId).toBe(100);
    expect(body.alertId).toBe(200);
    // The backend rejects uppercase "ALL" with 400 "静默范围不能为空".
    expect(body.scope).toBe('all');
    vi.restoreAllMocks();
  });

  it('alertRulesSearch sends plural envs/priorities, never the singular form', async () => {
    const calls = captureFetch();
    await client.alertRulesSearch({
      groupId: -1,
      envs: ['online'],
      priorities: ['P0', 'P1'],
      pageParam: { pageNo: 1, pageSize: 20 },
    });

    const body = JSON.parse(calls[0].body);
    expect(body.envs).toEqual(['online']);
    expect(body.priorities).toEqual(['P0', 'P1']);
    // Singular keys are silently ignored by the backend, returning unfiltered
    // results — they must never be sent.
    expect(body.env).toBeUndefined();
    expect(body.priority).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('alertsSearch forwards alertRuleType and pageNo', async () => {
    const calls = captureFetch();
    await client.alertsSearch({
      from: 1,
      to: 2,
      alertRuleType: 'metric',
      pageNo: 3,
    });

    const body = JSON.parse(calls[0].body);
    expect(body.alertRuleType).toBe('metric');
    expect(body.pageNo).toBe(3);
    vi.restoreAllMocks();
  });

  it('alertRuleDisableCreate posts to the disables endpoint', async () => {
    const calls = captureFetch();
    await client.alertRuleDisableCreate({
      ruleId: 12345,
      startTime: 1000,
      endTime: 2000,
      scope: 'specify',
      specifyGroups: { service: ['a', 'b'] },
      disableNotifyContent: 'maintenance',
    });

    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/alert/rules/disables/create'
    );
    const body = JSON.parse(calls[0].body);
    expect(body.ruleId).toBe(12345);
    expect(body.scope).toBe('specify');
    expect(body.specifyGroups).toEqual({ service: ['a', 'b'] });
    expect(body.disableNotifyContent).toBe('maintenance');
    // A disable targets the rule itself, so it carries no alertId.
    expect(body.alertId).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('alertRuleDisableList reads by rule id', async () => {
    const calls = captureFetch();
    await client.alertRuleDisableList(12345);

    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/alert/rules/disables/12345'
    );
    vi.restoreAllMocks();
  });

  it('alertRuleDisableDelete deletes by disable id', async () => {
    const calls = captureFetch();
    await client.alertRuleDisableDelete(1001);

    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/alert/rules/disables/1001'
    );
    vi.restoreAllMocks();
  });
});

describe('OctoClient issue merge methods', () => {
  const client = new OctoClient('https://example.com', {
    token: 'test-token',
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls merge, unmerge, and merge-children OpenAPI endpoints', async () => {
    const calls = captureFetch();

    await client.issuesMerge({
      issueIds: [' child-1 ', 'child-1', 'child-2'],
    });
    await client.issuesUnmerge({
      mergeIssueId: 'merge-1',
      childIssueIds: ['child-1', 'child-1'],
      dataSource: 'rum',
    });
    await client.issueMergeChildren('child-1', 'rum');

    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/log-error-tracking/issues/merge'
    );
    expect(JSON.parse(calls[0].body)).toEqual({
      issueIds: ['child-1', 'child-2'],
      dataSource: 'log',
    });
    expect(calls[1].method).toBe('POST');
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
      'https://example.com/infra-octopus-openapi/v1/log-error-tracking/issues/child-1/merge-children?dataSource=rum'
    );
  });

  it('rejects invalid merge inputs before sending a request', async () => {
    const calls = captureFetch();

    await expect(
      client.issuesMerge({ issueIds: ['child-1', ' child-1 '] })
    ).rejects.toThrow('At least two distinct Issue IDs are required');
    await expect(
      client.issuesUnmerge({ mergeIssueId: ' ', childIssueIds: ['child-1'] })
    ).rejects.toThrow('mergeIssueId must not be blank');
    await expect(
      client.issuesUnmerge({ mergeIssueId: 'merge-1', childIssueIds: [] })
    ).rejects.toThrow('At least one child Issue ID is required');
    await expect(
      client.issueMergeChildren('child-1', 'metric')
    ).rejects.toThrow('Issue data source must be one of: log, rum');

    expect(calls).toHaveLength(0);
  });
});

describe('OctoClient issue AI analysis', () => {
  const client = new OctoClient('https://example.com', {
    token: 'test-token',
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts analysis with optional context and encodes the Issue ID', async () => {
    const calls = captureFetch();

    await client.issueAiAnalysis(' issue/1 ', '发布后开始报错');

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/log-error-tracking/issues/issue%2F1/ai-analysis'
    );
    expect(JSON.parse(calls[0].body)).toEqual({ context: '发布后开始报错' });
  });

  it('omits the request body when no context is provided', async () => {
    const calls = captureFetch();

    await client.issueAiAnalysis('issue-1');

    expect(calls[0].body).toBe('');
  });

  it('rejects a blank Issue ID before sending a request', async () => {
    const calls = captureFetch();

    await expect(client.issueAiAnalysis(' ')).rejects.toThrow(
      'issueId must not be blank'
    );
    expect(calls).toHaveLength(0);
  });
});

describe('normalizeAlertScope', () => {
  it('accepts the canonical lowercase values', () => {
    expect(normalizeAlertScope('all')).toBe('all');
    expect(normalizeAlertScope('specify')).toBe('specify');
  });

  it('downcases the legacy uppercase spelling older CLI versions sent', () => {
    expect(normalizeAlertScope('ALL')).toBe('all');
    expect(normalizeAlertScope('SPECIFY')).toBe('specify');
    expect(normalizeAlertScope(' Specify ')).toBe('specify');
  });

  it('defaults to all when omitted', () => {
    expect(normalizeAlertScope(undefined)).toBe('all');
  });

  it('rejects unknown scopes instead of forwarding them to the API', () => {
    expect(() => normalizeAlertScope('everything')).toThrow(/Invalid scope/);
  });
});

describe('OctoClient request handling', () => {
  const client = new OctoClient('https://example.com', {
    token: 'test-token',
  });

  it('sorts query parameters in the request URL', async () => {
    const calls = captureFetch();
    await client.alertTimeseries({
      alertId: 999,
      from: 1716799000000,
      to: 1716800000000,
      conditionId: 0,
    });

    // The query is emitted in sorted order: conditionId, from, to.
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/alerts/999/timeseries' +
        '?conditionId=0&from=1716799000000&to=1716800000000'
    );
    vi.restoreAllMocks();
  });

  it('normalizes equivalent query orders to the same request URL', async () => {
    const calls = captureFetch();
    await client.get(
      '/infra-octopus-openapi/v1/alerts/1/timeseries?to=2&from=1'
    );
    await client.get(
      '/infra-octopus-openapi/v1/alerts/1/timeseries?from=1&to=2'
    );

    expect(calls[0].url).toBe(calls[1].url);
    expect(calls[0].url).toContain('?from=1&to=2');
    vi.restoreAllMocks();
  });

  it('sorts query by key, not by the raw key=value pair', async () => {
    const calls = captureFetch();
    // Sorting raw pairs would yield `a1=1&a=2` because "1" < "=" in ASCII.
    await client.get('/x?a=2&a1=1');

    expect(calls[0].url).toBe('https://example.com/x?a=2&a1=1');
    vi.restoreAllMocks();
  });

  it('keeps repeated keys in their original relative order', async () => {
    const calls = captureFetch();
    await client.get('/x?b=1&a=2&a=1');

    expect(calls[0].url).toBe('https://example.com/x?a=2&a=1&b=1');
    vi.restoreAllMocks();
  });

  it('keeps a zero body instead of dropping it as falsy', async () => {
    const calls = captureFetch();
    await client.del('/infra-octopus-openapi/v1/alert/rules', 0);

    expect(calls[0].body).toBe('0');
    vi.restoreAllMocks();
  });

  it('sends no body when there is none', async () => {
    const calls = captureFetch();
    await client.get('/infra-octopus-openapi/v1/alerts/1');

    expect(calls[0].body).toBe('');
    vi.restoreAllMocks();
  });
});

describe('OctoClient case methods', () => {
  const client = new OctoClient('https://example.com', {
    token: 'test-token',
  });

  it('casesList posts filter and pagination fields', async () => {
    const calls = captureFetch();
    await client.casesList({
      pageNo: 2,
      pageSize: 10,
      groupId: 3,
      status: 'todo',
      priority: 'P1',
      assignerId: 5,
      input: 'payment',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/cases/list'
    );
    expect(JSON.parse(calls[0].body)).toEqual({
      pageNo: 2,
      pageSize: 10,
      groupId: 3,
      status: 'todo',
      priority: 'P1',
      assignerId: 5,
      input: 'payment',
    });
    vi.restoreAllMocks();
  });

  it('caseCreate posts a case payload', async () => {
    const calls = captureFetch();
    await client.caseCreate({
      name: 'checkout incident',
      groupId: 1,
      priority: 'P0',
      status: 'doing',
      assignerId: 2,
      description: 'investigate checkout failures',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/cases'
    );
    expect(JSON.parse(calls[0].body)).toEqual({
      name: 'checkout incident',
      groupId: 1,
      priority: 'P0',
      status: 'doing',
      assignerId: 2,
      description: 'investigate checkout failures',
    });
    vi.restoreAllMocks();
  });

  it('caseDetail uses POST with path parameter', async () => {
    const calls = captureFetch();
    await client.caseDetail(99);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/cases/99'
    );
    expect(calls[0].body).toBe('');
    vi.restoreAllMocks();
  });

  it('caseDetailByKey uses POST with case key path parameter', async () => {
    const calls = captureFetch();
    await client.caseDetailByKey('CASE-10001');

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/cases/key/CASE-10001'
    );
    expect(calls[0].body).toBe('');
    vi.restoreAllMocks();
  });

  it('caseUpdate uses PUT with editable fields', async () => {
    const calls = captureFetch();
    await client.caseUpdate(8, {
      groupId: 1,
      priority: 'P2',
      status: 'done',
      assignerId: 2,
      description: 'fixed',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/cases/8'
    );
    expect(JSON.parse(calls[0].body)).toEqual({
      groupId: 1,
      priority: 'P2',
      status: 'done',
      assignerId: 2,
      description: 'fixed',
    });
    vi.restoreAllMocks();
  });

  it('caseDelete uses DELETE with path parameter', async () => {
    const calls = captureFetch();
    await client.caseDelete(8);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/cases/8'
    );
    expect(calls[0].body).toBe('');
    vi.restoreAllMocks();
  });

  it('caseAddRelation posts relation type and target id', async () => {
    const calls = captureFetch();
    await client.caseAddRelation(8, {
      type: 'alert',
      targetId: '12345',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/cases/8/relation'
    );
    expect(JSON.parse(calls[0].body)).toEqual({
      type: 'alert',
      targetId: '12345',
    });
    vi.restoreAllMocks();
  });

  it('caseDeleteRelation uses DELETE with relation path parameter', async () => {
    const calls = captureFetch();
    await client.caseDeleteRelation(8, 9);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/cases/8/relation/9'
    );
    vi.restoreAllMocks();
  });

  it('caseAddNote serializes note text as a JSON string', async () => {
    const calls = captureFetch();
    await client.caseAddNote(8, 'first note');

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/cases/8/note'
    );
    expect(calls[0].body).toBe('"first note"');
    vi.restoreAllMocks();
  });

  it('caseUpdateNote serializes note text as a JSON string', async () => {
    const calls = captureFetch();
    await client.caseUpdateNote(8, 10, 'updated note');

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/cases/8/note/10'
    );
    expect(calls[0].body).toBe('"updated note"');
    vi.restoreAllMocks();
  });

  it('caseGroupsAll uses GET', async () => {
    const calls = captureFetch();
    await client.caseGroupsAll();

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/cases/groups/all'
    );
    expect(calls[0].body).toBe('');
    vi.restoreAllMocks();
  });

  it('caseGroupCreate posts group name', async () => {
    const calls = captureFetch();
    await client.caseGroupCreate({ name: 'incident cases' });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/cases/groups'
    );
    expect(JSON.parse(calls[0].body)).toEqual({ name: 'incident cases' });
    vi.restoreAllMocks();
  });

  it('RUM and event aggregation use their OpenAPI request fields', async () => {
    const calls = captureFetch();
    const params = {
      env: 'test',
      from: 1000,
      to: 2000,
      aggregationField: [{ field: '*', operation: 'count' }],
      groupFieldList: [
        {
          field: 'type',
          limit: 5,
          sort: { field: '*', operation: 'count', order: 'desc' },
        },
      ],
    };

    await client.rumAggregate(params);
    await client.eventAggregate(params);

    expect(calls.map((call) => call.url)).toEqual([
      'https://example.com/infra-octopus-openapi/v1/rum/aggregate',
      'https://example.com/infra-octopus-openapi/v1/event/aggregate',
    ]);
    expect(JSON.parse(calls[0].body)).toEqual(params);
    expect(JSON.parse(calls[1].body)).toEqual(params);
    vi.restoreAllMocks();
  });
});
