import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OctoClient } from './client.js';
import { registerCommands } from './commands.js';
import { getMcpTools, handleMcpTool } from './mcp.js';

const dashboard = {
  id: 401,
  title: 'Service overview',
  parent: 22,
  time: 'last_1_hour',
  variableList: [{ name: 'service', value: null, selectableValues: [] }],
  widgetList: [
    {
      id: 901,
      title: 'Request count',
      type: 'timeseries',
      requestList: [
        {
          displayType: 'line',
          queryList: [
            {
              id: 'A',
              dataSource: 'metric',
              qlActive: true,
              humanQuery: 'sum(service.requests{service = $service})',
            },
          ],
          style: { color: null, thresholds: [] },
        },
      ],
      info: {
        description: null,
        futureOption: { values: [false, 0, null, []] },
      },
      layout: { x: 0, y: 0, w: 6, h: 4 },
    },
  ],
  info: null,
};

const dashboardDetail = {
  ...dashboard,
  version: 7,
  isSystem: false,
  futureField: { values: [false, 0, null, []], nested: { enabled: true } },
};
const updateResult = {
  id: 401,
  title: dashboard.title,
  parent: dashboard.parent,
};

const temporaryDirectories: string[] = [];

function writeFixture(content: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'octo-dashboard-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'dashboard.json');
  writeFileSync(path, content);
  return path;
}

function client() {
  return new OctoClient('https://example.com', { token: 'test-token' });
}

async function invokeCli(args: string[]) {
  vi.stubEnv('OCTOPUS_TOKEN', 'test-token');
  vi.stubEnv('OCTOPUS_BASE_URL', 'https://example.com');
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeErr: () => undefined });
  registerCommands(program);
  const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  await program.parseAsync(['dashboards', ...args], { from: 'user' });
  return JSON.parse(String(output.mock.calls[0][0]));
}

async function invokeMcp(name: string, args: Record<string, unknown>) {
  const result = await handleMcpTool(name, args, client());
  if ('isError' in result && result.isError) {
    throw new Error(result.content[0].text);
  }
  return JSON.parse(result.content[0].text);
}

const entrypoints = [
  {
    name: 'client',
    detail: (id: number) => client().dashboardDetail(id),
    update: (id: number, data: unknown) => client().dashboardUpdate(id, data),
  },
  {
    name: 'CLI',
    detail: (id: number) => invokeCli(['detail', String(id)]),
    update: (id: number, data: unknown) =>
      invokeCli([
        'update',
        String(id),
        '--file',
        writeFixture(JSON.stringify(data)),
      ]),
  },
  {
    name: 'MCP',
    detail: (id: number) =>
      invokeMcp('octo_dashboards_detail', { dashboardId: id }),
    update: (id: number, data: unknown) =>
      invokeMcp('octo_dashboards_update', { dashboardId: id, dashboard: data }),
  },
];

describe('dashboard configuration', () => {
  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe.each(entrypoints)('$name', ({ detail, update }) => {
    it('returns the complete configuration without dropping unknown or null fields', async () => {
      const fetch = vi.fn(
        async (_url: string, _init: RequestInit) =>
          new Response(
            JSON.stringify({ code: 0, data: dashboardDetail, message: 'ok' })
          )
      );
      vi.stubGlobal('fetch', fetch);
      expect(await detail(401)).toEqual(dashboardDetail);
      expect(fetch).toHaveBeenCalledOnce();
      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe(
        'https://example.com/infra-octopus-openapi/v1/dashboards/401'
      );
      expect(init.method).toBe('GET');
      expect(init.body).toBeUndefined();
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer test-token',
      });
    });

    it('sends the complete update JSON unchanged and returns the API result', async () => {
      const fetch = vi.fn(
        async (_url: string, _init: RequestInit) =>
          new Response(
            JSON.stringify({ code: 0, data: updateResult, message: 'ok' })
          )
      );
      vi.stubGlobal('fetch', fetch);
      expect(await update(401, dashboard)).toEqual(updateResult);
      expect(fetch).toHaveBeenCalledOnce();
      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe(
        'https://example.com/infra-octopus-openapi/v1/dashboards/401'
      );
      expect(init.method).toBe('PUT');
      expect(JSON.parse(String(init.body))).toEqual(dashboard);
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer test-token',
      });
    });

    it.each([0, 1.5, Number.MAX_SAFE_INTEGER + 1])(
      'rejects invalid dashboard ID %s before any request',
      async (id) => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        await expect(detail(id)).rejects.toThrow(
          'dashboardId must be a positive integer'
        );
        await expect(update(id, dashboard)).rejects.toThrow(
          'dashboardId must be a positive integer'
        );
        expect(fetch).not.toHaveBeenCalled();
      }
    );

    it.each([{ data: {} }, { data: null }, { data: [] }, { data: 'config' }])(
      'rejects an empty or non-object configuration $data before fetching',
      async ({ data }) => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        await expect(update(401, data)).rejects.toThrow(
          /dashboard|JSON object/
        );
        expect(fetch).not.toHaveBeenCalled();
      }
    );

    it.each([
      { operation: 'detail', invoke: detail },
      { operation: 'update', invoke: (id: number) => update(id, dashboard) },
    ])(
      'propagates HTTP, business and network errors without retrying $operation',
      async ({ invoke }) => {
        const failures = [
          {
            response: new Response('dashboard not found', { status: 404 }),
            error: '404',
          },
          {
            response: new Response(
              JSON.stringify({
                code: -210,
                data: null,
                message: 'dashboard access denied',
              })
            ),
            error: 'API error (code=-210): dashboard access denied',
          },
        ];
        for (const { response, error } of failures) {
          const fetch = vi.fn(async () => response);
          vi.stubGlobal('fetch', fetch);
          await expect(invoke(401)).rejects.toThrow(error);
          expect(fetch).toHaveBeenCalledOnce();
        }
        const fetch = vi.fn(async () => {
          throw new Error('network unavailable');
        });
        vi.stubGlobal('fetch', fetch);
        await expect(invoke(401)).rejects.toThrow('network unavailable');
        expect(fetch).toHaveBeenCalledOnce();
      }
    );
  });

  it.each(['{broken', 'null', '[]', 'true', '42', '"dashboard"'])(
    'CLI rejects invalid JSON or non-object file %s',
    async (content) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      await expect(
        invokeCli(['update', '401', '--file', writeFixture(content)])
      ).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('CLI requires --file for an update before fetching', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(invokeCli(['update', '401'])).rejects.toThrow(
      "required option '--file <path>' not specified"
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('CLI reports a missing configuration file without fetching', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const missing = `${writeFixture('{}')}.missing`;
    await expect(
      invokeCli(['update', '401', '--file', missing])
    ).rejects.toThrow('ENOENT');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['detail', 'update'])(
    'CLI honors --output jsonl for %s',
    async (operation) => {
      const data = operation === 'detail' ? dashboardDetail : updateResult;
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(JSON.stringify({ code: 0, data, message: 'ok' }))
        )
      );
      const args = [operation, '401', '--output', 'jsonl'];
      if (operation === 'update')
        args.push('--file', writeFixture(JSON.stringify(dashboard)));
      expect(await invokeCli(args)).toEqual(data);
      expect(console.log).toHaveBeenCalledWith(JSON.stringify(data));
    }
  );

  it('MCP publishes read and write schemas with required dashboard inputs', () => {
    const tools = getMcpTools();
    const detail = tools.find((tool) => tool.name === 'octo_dashboards_detail');
    const update = tools.find((tool) => tool.name === 'octo_dashboards_update');
    expect(detail?.annotations).toEqual({ readOnlyHint: true });
    expect(update?.annotations).toEqual({ readOnlyHint: false });
    expect(detail?.inputSchema.required).toEqual(['dashboardId']);
    expect(update?.inputSchema.required).toEqual(['dashboardId', 'dashboard']);
    expect(Object.keys(detail?.inputSchema.properties ?? {})).toEqual([
      'dashboardId',
    ]);
    expect(Object.keys(update?.inputSchema.properties ?? {})).toEqual([
      'dashboardId',
      'dashboard',
    ]);
    expect(detail?.inputSchema.properties?.dashboardId).toMatchObject({
      type: 'integer',
      minimum: 1,
    });
    expect(update?.inputSchema.properties?.dashboardId).toMatchObject({
      type: 'integer',
      minimum: 1,
    });
    expect(update?.inputSchema.properties?.dashboard).toMatchObject({
      type: 'object',
      minProperties: 1,
    });
  });

  it.each([
    { tool: 'octo_dashboards_detail', args: {} },
    { tool: 'octo_dashboards_update', args: { dashboardId: 401 } },
    { tool: 'octo_dashboards_update', args: { dashboard } },
  ])(
    'MCP rejects missing required arguments for $tool without fetching',
    async ({ tool, args }) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const result = await handleMcpTool(tool, args, client());
      expect(result).toMatchObject({ isError: true });
      expect(fetch).not.toHaveBeenCalled();
    }
  );
});
