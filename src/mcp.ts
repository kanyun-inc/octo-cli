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
            groupId: {
              type: 'number',
              description: 'Alert rule group ID',
            },
            ruleIds: {
              type: 'array',
              items: { type: 'number' },
              description: 'Filter by specific alert rule IDs',
            },
          },
        },
      },
      {
        name: 'octo_alerts_rules_search',
        description:
          'Search Octopus alert rules. Filter by group, env, priority, status, type, tags, creator.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            groupId: {
              type: 'number',
              description: 'Alert rule group ID (-1 for all groups)',
            },
            env: envProp,
            priority: {
              type: 'string',
              description: 'Priority filter: P0, P1, P2',
            },
            statusList: {
              type: 'array',
              items: { type: 'string' },
              description: 'Status filter: enabled, disabled, paused, silenced',
            },
            searchInput: {
              type: 'string',
              description: 'Search keyword for rule name',
            },
            types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Rule type filter: log, metric, issue, rum, llm',
            },
            service: { type: 'string', description: 'Service name filter' },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tag filter',
            },
            creator: { type: 'string', description: 'Creator name filter' },
            pageNo: { type: 'number', description: 'Page number (default 1)' },
            pageSize: {
              type: 'number',
              description: 'Page size (default 20)',
            },
          },
        },
      },
      {
        name: 'octo_alerts_rules_create',
        description:
          'Create Octopus alert rules. Accepts an array of rule objects. ' +
          'Each rule needs: name, env, groupId, ruleType (log/metric/issue/rum/llm), ' +
          'priority (P0/P1/P2/UNKNOWN), conditionEvaluationType (single/and/or), ' +
          'conditions (array with period, comparison, threshold, alertQueryInfo), ' +
          'notice (receivers, repeatNoticeInterval, effectiveWeeks, etc.), tags, active. ' +
          'Tip: use octo_alerts_rules_search to find existing rules as payload templates.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            rules: {
              type: 'array',
              items: { type: 'object' },
              description:
                'Array of alert rule objects (AlertRuleCreateVO). See tool description for required fields.',
            },
          },
          required: ['rules'],
        },
      },
      {
        name: 'octo_alerts_rules_delete',
        description: 'Delete an Octopus alert rule by ID.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            ruleId: {
              type: 'number',
              description: 'Alert rule ID to delete',
            },
          },
          required: ['ruleId'],
        },
      },
      {
        name: 'octo_alerts_silence_create',
        description:
          'Create an alert silence (mute) in Octopus. Suppresses notifications for a rule during a time window.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            ruleId: {
              type: 'number',
              description: 'Alert rule ID to silence',
            },
            alertId: {
              type: 'number',
              description: 'Specific alert ID to silence',
            },
            durationMinutes: {
              type: 'number',
              description:
                'Silence duration in minutes (e.g. 120 for 2 hours). Alternative to endTime.',
            },
            startTime: {
              type: 'number',
              description: 'Silence start time in epoch ms (default: now)',
            },
            endTime: {
              type: 'number',
              description:
                'Silence end time in epoch ms. Required if durationMinutes is not set.',
            },
            scope: {
              type: 'string',
              description: 'Silence scope',
              enum: ['ALL', 'SPECIFY'],
            },
            specifyGroups: {
              type: 'object',
              description:
                'When scope=specify, map of group field to values array',
            },
            silentlyNotify: {
              type: 'boolean',
              description: 'Whether to send notification about the silence',
            },
          },
          required: ['ruleId', 'alertId'],
        },
      },
      {
        name: 'octo_alerts_silence_delete',
        description: 'Delete (cancel) an alert silence in Octopus.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            ruleId: {
              type: 'number',
              description: 'Alert rule ID whose silence to remove',
            },
          },
          required: ['ruleId'],
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
            groupId: args.groupId as number | undefined,
            ruleIds: args.ruleIds as number[] | undefined,
          });
          return ok(JSON.stringify(data, null, 2));
        }

        case 'octo_alerts_rules_search': {
          const data = await client.alertRulesSearch({
            groupId: (args.groupId as number) ?? -1,
            env: args.env as string | undefined,
            priority: args.priority as string | undefined,
            statusList: args.statusList as string[] | undefined,
            searchInput: args.searchInput as string | undefined,
            types: args.types as string[] | undefined,
            service: args.service as string | undefined,
            tags: args.tags as string[] | undefined,
            creator: args.creator as string | undefined,
            pageParam: {
              pageNo: (args.pageNo as number) ?? 1,
              pageSize: (args.pageSize as number) ?? 20,
            },
          });
          return ok(JSON.stringify(data, null, 2));
        }

        case 'octo_alerts_rules_create': {
          const rules = args.rules as unknown[];
          if (!Array.isArray(rules) || rules.length === 0) {
            return fail('rules must be a non-empty array');
          }
          const data = await client.alertRulesCreate(rules);
          return ok(JSON.stringify(data, null, 2));
        }

        case 'octo_alerts_rules_delete': {
          const ruleId = args.ruleId as number;
          await client.alertRulesDelete(ruleId);
          return ok(`Alert rule ${ruleId} deleted`);
        }

        case 'octo_alerts_silence_create': {
          const now = Date.now();
          const startTime = (args.startTime as number) ?? now;
          let endTime = args.endTime as number | undefined;
          if (!endTime && args.durationMinutes) {
            endTime = startTime + (args.durationMinutes as number) * 60_000;
          }
          if (!endTime) {
            return fail('Either endTime or durationMinutes is required');
          }
          const data = await client.alertSilenceCreate({
            ruleId: args.ruleId as number,
            alertId: args.alertId as number,
            startTime,
            endTime,
            scope: (args.scope as string) ?? 'ALL',
            specifyGroups: args.specifyGroups as
              | Record<string, string[]>
              | undefined,
            silentlyNotify: (args.silentlyNotify as boolean) ?? false,
          });
          return ok(JSON.stringify(data, null, 2));
        }

        case 'octo_alerts_silence_delete': {
          const ruleId = args.ruleId as number;
          await client.alertSilenceDelete(ruleId);
          return ok(`Silence for rule ${ruleId} deleted`);
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
