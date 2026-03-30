/**
 * Octopus MCP Server (stdio transport)
 *
 * Usage:
 *   octo mcp
 *
 * Environment variables:
 *   OCTOPUS_APP_ID     — required
 *   OCTOPUS_APP_SECRET — required
 *   OCTOPUS_BASE_URL   — optional
 *   OCTOPUS_ENV        — optional, default "online"
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { OctoClient } from './client.js';
import { getAppId, getAppSecret, getBaseUrl, getDefaultEnv } from './config.js';

function getClient(): OctoClient {
  const appId = getAppId();
  const appSecret = getAppSecret();
  if (!appId || !appSecret) {
    throw new Error(
      'Credentials not set. Run `octo login` or set OCTOPUS_APP_ID / OCTOPUS_APP_SECRET.'
    );
  }
  return new OctoClient(getBaseUrl(), appId, appSecret);
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function fail(err: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      },
    ],
    isError: true,
  };
}

const envProp = {
  type: 'string',
  description:
    'Environment (e.g. online, test). Defaults to OCTOPUS_ENV or "online".',
};
const fromProp = {
  type: 'number',
  description: 'Start time in epoch ms',
};
const toProp = {
  type: 'number',
  description: 'End time in epoch ms',
};
const queryProp = {
  type: 'string',
  description: 'Query string (Octopus query syntax)',
};

function timeDefaults(args: Record<string, unknown>): {
  env: string;
  from: number;
  to: number;
} {
  const now = Date.now();
  return {
    env: String(args.env ?? getDefaultEnv()),
    from: Number(args.from ?? now - 15 * 60_000),
    to: Number(args.to ?? now),
  };
}

export async function startMcpServer(): Promise<void> {
  const server = new Server(
    { name: 'octo-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'octo_logs_search',
        description:
          'Search Octopus logs. Returns log entries with message, level, attributes, traceId.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            env: envProp,
            from: fromProp,
            to: toProp,
            query: queryProp,
            limit: {
              type: 'number',
              description: 'Max results (default 50, max 500)',
            },
            order: {
              type: 'string',
              description: 'asc or desc',
              enum: ['asc', 'desc'],
            },
          },
        },
      },
      {
        name: 'octo_logs_aggregate',
        description:
          'Aggregate Octopus logs — count, avg, max, min, sum, percentile, grouped by fields.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            env: envProp,
            from: fromProp,
            to: toProp,
            query: queryProp,
            aggregation_field: {
              type: 'string',
              description: 'Field to aggregate (use "*" for count)',
            },
            aggregation_op: {
              type: 'string',
              description:
                'Operation: count, sum, avg, max, min, p50, p95, p99',
            },
            group_by: {
              type: 'string',
              description: 'Field to group by (e.g. "service", "level")',
            },
            group_limit: {
              type: 'number',
              description: 'Max groups (default 10)',
            },
          },
        },
      },
      {
        name: 'octo_alerts_search',
        description:
          'Search Octopus alerts. Filter by status (firing/resolved), priority (P0/P1/P2), services.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            env: envProp,
            from: fromProp,
            to: toProp,
            query: queryProp,
            status: {
              type: 'string',
              description: 'all, firing, or resolved',
              enum: ['all', 'firing', 'resolved'],
            },
            priorities: {
              type: 'array',
              items: { type: 'string' },
              description: 'Priority filter, e.g. ["P0","P1"]',
            },
            services: {
              type: 'array',
              items: { type: 'string' },
              description: 'Service name filter',
            },
            limit: { type: 'number', description: 'Max results' },
          },
        },
      },
      {
        name: 'octo_issues_search',
        description:
          'Search Octopus error tracking issues. Returns error type, count, service, status.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            env: envProp,
            from: fromProp,
            to: toProp,
            query: queryProp,
            status: {
              type: 'string',
              description: 'unresolved, resolved, ignored, or all',
              enum: ['unresolved', 'resolved', 'ignored', 'all'],
            },
            sort_type: {
              type: 'string',
              description: 'logCount or firstSeen',
              enum: ['logCount', 'firstSeen'],
            },
          },
        },
      },
      {
        name: 'octo_trace_search',
        description:
          'Search Octopus trace spans. Returns span name, service, duration, status, traceId.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            env: envProp,
            from: fromProp,
            to: toProp,
            query: queryProp,
            limit: { type: 'number', description: 'Max results (max 500)' },
            order: {
              type: 'string',
              enum: ['asc', 'desc'],
            },
          },
        },
      },
      {
        name: 'octo_metrics_query',
        description:
          'Query Octopus metrics timeseries. Use metric query syntax like "sum(metric_name{tag=value}.as_count)".',
        inputSchema: {
          type: 'object' as const,
          properties: {
            env: envProp,
            from: fromProp,
            to: toProp,
            queries: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Metric query strings, e.g. ["sum(http_requests{service=myapp}.as_count)"]',
            },
            point_count: {
              type: 'number',
              description: 'Number of data points (default 150)',
            },
          },
          required: ['queries'],
        },
      },
      {
        name: 'octo_services_list',
        description: 'List Octopus APM services.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            env: envProp,
            from: fromProp,
            to: toProp,
          },
        },
      },
      {
        name: 'octo_services_topology',
        description:
          'Get service call topology graph — upstream/downstream services and edges.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            env: envProp,
            from: fromProp,
            to: toProp,
            service: {
              type: 'string',
              description: 'Service name',
            },
          },
          required: ['service'],
        },
      },
      {
        name: 'octo_llm_list',
        description:
          'Query Octopus LLM observability spans — model, tokens, cost, duration.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            env: envProp,
            from: fromProp,
            to: toProp,
            query: queryProp,
            limit: { type: 'number', description: 'Page size' },
          },
        },
      },
      {
        name: 'octo_rum_list',
        description:
          'Query Octopus RUM (Real User Monitoring) events — sessions, views, actions, errors.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            env: envProp,
            from: fromProp,
            to: toProp,
            query: queryProp,
            limit: { type: 'number', description: 'Page size' },
          },
        },
      },
      {
        name: 'octo_events_list',
        description:
          'Query Octopus events — deployments, config changes, incidents.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            env: envProp,
            from: fromProp,
            to: toProp,
            query: queryProp,
            limit: { type: 'number', description: 'Page size' },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    try {
      const client = getClient();

      switch (request.params.name) {
        case 'octo_logs_search': {
          const { env, from, to } = timeDefaults(args);
          const data = await client.logsSearch({
            env,
            from,
            to,
            query: args.query as string | undefined,
            limit: args.limit as number | undefined,
            order: args.order as string | undefined,
          });
          return ok(JSON.stringify(data, null, 2));
        }

        case 'octo_logs_aggregate': {
          const { env, from, to } = timeDefaults(args);
          const aggField = String(args.aggregation_field ?? '*');
          const aggOp = String(args.aggregation_op ?? 'count');
          const groupBy = args.group_by as string | undefined;
          const groupLimit = Number(args.group_limit ?? 10);

          const data = await client.logsAggregate({
            env,
            from,
            to,
            query: args.query as string | undefined,
            aggregationFields: [{ field: aggField, operation: aggOp }],
            groupFields: groupBy
              ? [
                  {
                    field: groupBy,
                    limit: groupLimit,
                    sort: { field: aggField, operation: aggOp, order: 'desc' },
                  },
                ]
              : undefined,
          });
          return ok(JSON.stringify(data, null, 2));
        }

        case 'octo_alerts_search': {
          const { env, from, to } = timeDefaults(args);
          const data = await client.alertsSearch({
            from,
            to,
            env,
            status: (args.status as string) ?? 'all',
            priorities: args.priorities as string[] | undefined,
            services: args.services as string[] | undefined,
            limit: args.limit as number | undefined,
          });
          return ok(JSON.stringify(data, null, 2));
        }

        case 'octo_issues_search': {
          const { env, from, to } = timeDefaults(args);
          const data = await client.issuesSearch({
            env,
            from,
            to,
            query: args.query as string | undefined,
            status: (args.status as string) ?? 'unresolved',
            sortType: (args.sort_type as string) ?? 'logCount',
          });
          return ok(JSON.stringify(data, null, 2));
        }

        case 'octo_trace_search': {
          const { env, from, to } = timeDefaults(args);
          const data = await client.traceSpanList({
            env,
            from,
            to,
            query: args.query as string | undefined,
            limit: args.limit as number | undefined,
            order: args.order as string | undefined,
          });
          return ok(JSON.stringify(data, null, 2));
        }

        case 'octo_metrics_query': {
          const { env, from, to } = timeDefaults(args);
          const queryStrs = args.queries as string[];
          const queries = queryStrs.map((q, i) => ({
            id: String.fromCharCode(65 + i),
            query: q,
            dataSource: 'metric',
          }));
          const data = await client.metricsTimeseries({
            env,
            from,
            to,
            pointCount: (args.point_count as number) ?? 150,
            queries,
          });
          return ok(JSON.stringify(data, null, 2));
        }

        case 'octo_services_list': {
          const { env, from, to } = timeDefaults(args);
          const data = await client.servicesList({ env, from, to });
          return ok(JSON.stringify(data, null, 2));
        }

        case 'octo_services_topology': {
          const { env, from, to } = timeDefaults(args);
          const data = await client.servicesTopology({
            env,
            from,
            to,
            service: String(args.service),
          });
          return ok(JSON.stringify(data, null, 2));
        }

        case 'octo_llm_list': {
          const { env, from, to } = timeDefaults(args);
          const data = await client.llmList({
            env,
            from,
            to,
            query: args.query as string | undefined,
            pageSize: args.limit as number | undefined,
          });
          return ok(JSON.stringify(data, null, 2));
        }

        case 'octo_rum_list': {
          const { env, from, to } = timeDefaults(args);
          const data = await client.rumList({
            env,
            from,
            to,
            query: args.query as string | undefined,
            pageSize: args.limit as number | undefined,
          });
          return ok(JSON.stringify(data, null, 2));
        }

        case 'octo_events_list': {
          const { env, from, to } = timeDefaults(args);
          const data = await client.eventList({
            env,
            from,
            to,
            query: args.query as string | undefined,
            pageSize: args.limit as number | undefined,
          });
          return ok(JSON.stringify(data, null, 2));
        }

        default:
          return fail(`Unknown tool: ${request.params.name}`);
      }
    } catch (err) {
      return fail(err);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
