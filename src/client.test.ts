import { describe, expect, it, vi } from 'vitest';
import { OctoClient } from './client.js';

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
    mode: 'appKey',
    appId: 'testId',
    appSecret: 'testSecret',
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

  it('every request carries an octo-cli User-Agent', async () => {
    const calls = captureFetch();
    await client.alertRulesDelete(1);

    expect(calls).toHaveLength(1);
    expect(calls[0].headers['User-Agent']).toMatch(
      /^octo-cli\/[^ ]+ \(node v\d+\.\d+\.\d+; [a-z0-9]+\)$/
    );
    vi.restoreAllMocks();
  });

  it('merges OCTOPUS_EXTRA_HEADERS into requests without overriding built-ins', async () => {
    vi.stubEnv(
      'OCTOPUS_EXTRA_HEADERS',
      JSON.stringify({
        'X-Octopus-Tenant': 'tenant-a',
        'X-Numeric': 123,
        Authorization: 'Bearer should-not-win',
      })
    );
    const calls = captureFetch();
    await client.alertRulesDelete(1);

    expect(calls).toHaveLength(1);
    expect(calls[0].headers['X-Octopus-Tenant']).toBe('tenant-a');
    expect(calls[0].headers['X-Numeric']).toBe('123');
    expect(calls[0].headers.Authorization).not.toBe('Bearer should-not-win');
    expect(calls[0].headers['Content-Type']).toBe('application/json');
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
    expect(calls[0].url).toBe(
      'https://example.com/infra-octopus-openapi/v1/alerts/42/timeseries?from=1000&to=2000&conditionId=3'
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
      scope: 'ALL',
      silentlyNotify: false,
    });

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body);
    expect(body.ruleId).toBe(100);
    expect(body.alertId).toBe(200);
    expect(body.scope).toBe('ALL');
    vi.restoreAllMocks();
  });
});
