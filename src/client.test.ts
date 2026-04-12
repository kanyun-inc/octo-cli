import { describe, expect, it, vi } from 'vitest';
import { OctoClient } from './client.js';

// Intercept fetch to capture request details
function captureFetch() {
  const calls: { url: string; method: string; body: string }[] = [];
  const mockFetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      body: (init.body as string) ?? '',
    });
    return new Response(JSON.stringify({ code: 0, data: null, message: 'ok' }));
  });
  vi.stubGlobal('fetch', mockFetch);
  return calls;
}

describe('OctoClient alert methods', () => {
  const client = new OctoClient('https://example.com', 'testId', 'testSecret');

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
