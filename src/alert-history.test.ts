import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OctoClient } from './client.js';
import { registerCommands } from './commands.js';
import { getMcpTools, handleMcpTool } from './mcp.js';

const history = [
  {
    id: 3101,
    alertRuleId: 20278,
    datetime: 1791960000000,
    userVO: {
      userId: 240,
      ldap: 'alice',
      name: 'Alice',
      email: 'alice@example.com',
    },
    operationType: 'update',
    version: 7,
    snapshot: {
      id: 20278,
      name: 'Disk space below 11.5%',
      priority: 'P2',
      checkInterval: 60000,
      conditions: [{ id: 21023, threshold: 0.115, comparison: '<' }],
      notice: {
        receivers: [{ channelType: 'mail', target: [{ id: 5 }, { id: 6 }] }],
      },
      extInfo: { arbitrary: [false, 0, null, 'preserve me'] },
    },
  },
  {
    id: 3102,
    alertRuleId: 20278,
    datetime: 1791960001000,
    userVO: null,
    operationType: 'disable',
    version: null,
    snapshot: null,
  },
];

function client() {
  return new OctoClient('https://example.com', { token: 'test-token' });
}

const entrypoints = [
  {
    name: 'client',
    invoke: (ruleId: number) => client().alertRuleHistory(ruleId),
  },
  {
    name: 'CLI',
    invoke: async (ruleId: number) => {
      vi.stubEnv('OCTOPUS_TOKEN', 'test-token');
      vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');
      const program = new Command();
      program.exitOverride();
      registerCommands(program);
      const output = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined);
      await program.parseAsync(['alerts', 'history', String(ruleId)], {
        from: 'user',
      });
      return JSON.parse(String(output.mock.calls[0][0]));
    },
  },
  {
    name: 'MCP',
    invoke: async (ruleId: number) => {
      const result = await handleMcpTool(
        'octo_alerts_rules_history',
        { ruleId },
        client()
      );
      if ('isError' in result && result.isError) {
        throw new Error(result.content[0].text);
      }
      return JSON.parse(result.content[0].text);
    },
  },
];

describe('alert rule history', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe.each(entrypoints)('$name', ({ invoke }) => {
    it.each([{ data: history }, { data: [] }])(
      'preserves the original history array $data',
      async ({ data }) => {
        const fetch = vi.fn(
          async (_url: string, _init: RequestInit) =>
            new Response(JSON.stringify({ code: 0, data, message: 'ok' }))
        );
        vi.stubGlobal('fetch', fetch);
        expect(await invoke(20278)).toEqual(data);
        expect(fetch).toHaveBeenCalledOnce();
        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe(
          'https://example.com/infra-octopus-openapi/v1/alert/rules/20278/history'
        );
        expect(init.method).toBe('GET');
        expect(init.body).toBeUndefined();
        expect(init.headers).toMatchObject({
          Authorization: 'Bearer test-token',
        });
      }
    );

    it('rejects an invalid rule ID before fetching', async () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      await expect(invoke(0)).rejects.toThrow(
        'ruleId must be a positive integer'
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it.each([
      { status: 404, body: 'rule not found', error: '404' },
      {
        status: 200,
        body: JSON.stringify({
          code: -210,
          message: 'history unavailable',
          data: null,
        }),
        error: 'API error (code=-210): history unavailable',
      },
    ])(
      'preserves upstream errors ($status)',
      async ({ status, body, error }) => {
        const fetch = vi.fn(async () => new Response(body, { status }));
        vi.stubGlobal('fetch', fetch);
        await expect(invoke(20278)).rejects.toThrow(error);
        expect(fetch).toHaveBeenCalledOnce();
      }
    );
  });

  it('publishes a read-only schema with ruleId as its only input', () => {
    const tool = getMcpTools().find(
      (tool) => tool.name === 'octo_alerts_rules_history'
    );
    expect(tool?.annotations).toEqual({ readOnlyHint: true });
    expect(tool?.inputSchema.required).toEqual(['ruleId']);
    expect(tool?.inputSchema.properties).toEqual({
      ruleId: { type: 'integer', minimum: 1, description: 'Alert rule ID' },
    });
  });
});
