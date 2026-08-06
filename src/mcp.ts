/**
 * Octopus MCP Server (stdio transport)
 *
 * Usage:
 *   octo mcp
 *
 * Environment variables:
 *   OCTOPUS_TOKEN      — Personal Access Token
 *   OCTOPUS_BASE_URL   — optional
 *   OCTOPUS_ENV        — optional, default "online"
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { normalizeAlertScope, OctoClient } from './client.js';
import { getBaseUrl, getCredentials, getDefaultEnv } from './config.js';

function getClient(): OctoClient {
  const credentials = getCredentials();
  return new OctoClient(getBaseUrl(), credentials);
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

/**
 * Merge a plural array argument with its deprecated singular counterpart.
 * Returns undefined when neither is set, so the field is omitted entirely.
 */
function toStringArray(
  plural: unknown,
  singular: unknown
): string[] | undefined {
  const values = [
    ...(Array.isArray(plural) ? (plural as string[]) : []),
    ...(typeof singular === 'string' && singular ? [singular] : []),
  ];
  return values.length > 0 ? [...new Set(values)] : undefined;
}

const envProp = {
  type: 'string',
  description:
    'Environment (e.g. online, test). Defaults to OCTOPUS_ENV or "online".',
};
const fromProp = {
  type: 'number',
  description:
    'Start time in epoch milliseconds. If omitted, the tool defaults to the last 15 minutes; for "last 1h", pass now-3600000.',
};
const serviceFromProp = {
  type: 'number',
  description:
    'Start time in epoch milliseconds. If omitted, defaults to the last 1 hour to match the CLI services commands.',
};
const toProp = {
  type: 'number',
  description: 'End time in epoch milliseconds. If omitted, defaults to now.',
};
const queryProp = {
  type: 'string',
  description:
    'Octopus search syntax, not Lucene/Elasticsearch. Field filters use `field = value`, `!=`, `>`, `>=`, `<`, `<=`, `in (...)`, `not in (...)`; do not use `field:value`. Values and field names are case-sensitive, operators AND/OR/NOT are case-insensitive. Use parentheses for grouping and double quotes for exact phrases. Wildcards only work in field search, e.g. `service = web*`. Common fields: service, level (FATAL/ERROR/WARN/INFO/DEBUG/TRACE), host, trace_id, issue_id, k8s.pod.name, source. Examples: `level = ERROR`, `service = octopus-query-proxy`, `service = myapp AND level = ERROR`, `(level = ERROR OR level = WARN) AND service = myapp`.',
};
const caseStatusProp = {
  type: 'string',
  description: 'Case status: todo, doing, or done',
  enum: ['todo', 'doing', 'done'],
};
const casePriorityProp = {
  type: 'string',
  description: 'Case priority: NONE, P0, P1, or P2',
  enum: ['NONE', 'P0', 'P1', 'P2'],
};
const caseRelationTypeProp = {
  type: 'string',
  description: 'Case relation type: alert or issue',
  enum: ['alert', 'issue'],
};

function timeDefaults(args: Record<string, unknown>): {
  env: string;
  from: number;
  to: number;
};
function timeDefaults(
  args: Record<string, unknown>,
  defaultWindowMs: number
): {
  env: string;
  from: number;
  to: number;
};
function timeDefaults(
  args: Record<string, unknown>,
  defaultWindowMs = 15 * 60_000
): {
  env: string;
  from: number;
  to: number;
} {
  const now = Date.now();
  return {
    env: String(args.env ?? getDefaultEnv()),
    from: Number(args.from ?? now - defaultWindowMs),
    to: Number(args.to ?? now),
  };
}

function parsePointInTime(value: unknown): number {
  if (value == null) return Date.now();
  if (typeof value === 'number') return value;

  const text = String(value);
  if (/^\d+$/.test(text)) return Number(text);

  return new Date(text).getTime();
}

function validateRuleAbsence(
  rule: Record<string, unknown>,
  field: 'timeRule' | 'appearRule' | 'userRule',
  type: string
): void {
  if (rule[field] !== undefined) {
    throw new Error(`ignoreRule.${field} is not allowed for ${type}`);
  }
}

function validateIssueIgnoreRuleArgs(
  args: Record<string, unknown>
): unknown | undefined {
  const status = String(args.status);
  const dataSource = String(args.dataSource ?? 'log');
  const ignoreRule = args.ignoreRule;

  if (status !== 'ignored') {
    if (ignoreRule !== undefined) {
      throw new Error('ignoreRule is only allowed when status is ignored');
    }
    return undefined;
  }

  if (ignoreRule === undefined) {
    return undefined;
  }

  if (
    !ignoreRule ||
    typeof ignoreRule !== 'object' ||
    Array.isArray(ignoreRule)
  ) {
    throw new Error('ignoreRule must be an object');
  }

  const rule = ignoreRule as {
    type?: 'time' | 'appearCount' | 'userCount';
    timeRule?: { endTime?: number };
    appearRule?: {
      appearCount?: number;
      timestamp?: number;
      timeWindow?: number;
    };
    userRule?: {
      userCount?: number;
      timestamp?: number;
      timeWindow?: number;
      userField?: string;
    };
  };

  if (!rule.type) {
    throw new Error('ignoreRule.type is required');
  }

  if (rule.type === 'time') {
    validateRuleAbsence(rule as Record<string, unknown>, 'appearRule', 'TIME');
    validateRuleAbsence(rule as Record<string, unknown>, 'userRule', 'TIME');
    if (typeof rule.timeRule?.endTime !== 'number') {
      throw new Error('ignoreRule.timeRule.endTime is required for TIME');
    }
    return ignoreRule;
  }

  if (rule.type === 'appearCount') {
    validateRuleAbsence(
      rule as Record<string, unknown>,
      'timeRule',
      'APPEAR_COUNT'
    );
    validateRuleAbsence(
      rule as Record<string, unknown>,
      'userRule',
      'APPEAR_COUNT'
    );
    if (!rule.appearRule?.appearCount) {
      throw new Error(
        'ignoreRule.appearRule.appearCount is required for APPEAR_COUNT'
      );
    }
    return ignoreRule;
  }

  if (rule.type === 'userCount') {
    validateRuleAbsence(
      rule as Record<string, unknown>,
      'timeRule',
      'USER_COUNT'
    );
    validateRuleAbsence(
      rule as Record<string, unknown>,
      'appearRule',
      'USER_COUNT'
    );
    if (!rule.userRule?.userCount) {
      throw new Error(
        'ignoreRule.userRule.userCount is required for USER_COUNT'
      );
    }
    if (dataSource === 'log' && !rule.userRule.userField) {
      throw new Error(
        'ignoreRule.userRule.userField is required for USER_COUNT when dataSource is log'
      );
    }
    return ignoreRule;
  }

  throw new Error(`unsupported ignoreRule.type: ${rule.type}`);
}

export function getMcpTools() {
  return [
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
            description: 'Operation: count, sum, avg, max, min, p50, p95, p99',
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
            description:
              'Omit for all statuses. "all" is deprecated and treated as omitted.',
            enum: ['firing', 'resolved', 'all'],
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
          pageNo: { type: 'number', description: 'Page number (default 1)' },
          groupId: {
            type: 'number',
            description: 'Alert rule group ID',
          },
          ruleIds: {
            type: 'array',
            items: { type: 'number' },
            description: 'Filter by specific alert rule IDs',
          },
          alertRuleType: {
            type: 'string',
            description: 'Alert rule type filter: log, metric, issue',
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
          envs: {
            type: 'array',
            items: { type: 'string' },
            description: 'Environment filter, e.g. ["online"]',
          },
          priorities: {
            type: 'array',
            items: { type: 'string' },
            description: 'Priority filter, e.g. ["P0","P1"]',
          },
          env: {
            ...envProp,
            description: `${envProp.description} (deprecated: use envs)`,
          },
          priority: {
            type: 'string',
            description: 'Priority filter (deprecated: use priorities)',
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
      name: 'octo_alerts_groups_list',
      description:
        'List all Octopus alert groups for the current tenant. Returns groupId, groupName, and author in service order.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    },
    {
      name: 'octo_alerts_rules_details_search',
      description:
        'Get full details for up to 100 Octopus alert rules by ID. ' +
        'Duplicate IDs are de-duplicated by first occurrence; missing, deleted, or inaccessible rules are omitted.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          ruleIds: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: { type: 'integer', minimum: 1 },
            description:
              'Alert rule IDs. Response order follows the first occurrence of each requested ID.',
          },
        },
        required: ['ruleIds'],
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
      name: 'octo_alerts_detail',
      description:
        'Get Octopus alert detail including rule conditions, trigger dimensions, and status.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          alertId: {
            type: 'number',
            description: 'Alert ID',
          },
        },
        required: ['alertId'],
      },
    },
    {
      name: 'octo_alerts_timeseries',
      description:
        'Get Octopus alert detection timeseries data (time points, values, labels, condition status).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          alertId: {
            type: 'number',
            description: 'Alert ID',
          },
          from: fromProp,
          to: toProp,
          conditionId: {
            type: 'number',
            description: 'Condition ID (default 0 for first condition)',
          },
        },
        required: ['alertId'],
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
            description:
              'Silence scope (default: all). Uppercase values are deprecated but accepted.',
            enum: ['all', 'specify', 'ALL', 'SPECIFY'],
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
      name: 'octo_alerts_rule_disable_create',
      description:
        'Stop an Octopus alert rule from evaluating during a time window. ' +
        'Unlike a silence (which only mutes notifications for one firing alert), ' +
        'a disable suspends the rule itself and needs no alertId.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          ruleId: { type: 'number', description: 'Alert rule ID to disable' },
          durationMinutes: {
            type: 'number',
            description: 'Disable duration in minutes. Alternative to endTime.',
          },
          startTime: {
            type: 'number',
            description: 'Start time in epoch ms (default: now)',
          },
          endTime: {
            type: 'number',
            description:
              'End time in epoch ms. Required if durationMinutes is not set.',
          },
          scope: {
            type: 'string',
            description: 'Disable scope (default: all)',
            enum: ['all', 'specify'],
          },
          specifyGroups: {
            type: 'object',
            description:
              'When scope=specify, map of group field to values array',
          },
          disableNotifyContent: {
            type: 'string',
            description: 'Reason shown in the disable notification',
          },
        },
        required: ['ruleId'],
      },
    },
    {
      name: 'octo_alerts_rule_disable_list',
      description:
        'List the disable records on an Octopus alert rule, including their time windows and scopes.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          ruleId: { type: 'number', description: 'Alert rule ID' },
        },
        required: ['ruleId'],
      },
    },
    {
      name: 'octo_alerts_rule_disable_delete',
      description:
        'Delete a disable record, re-enabling the alert rule. Once no scope=all ' +
        'record remains, the rule returns to ENABLED.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          disableId: {
            type: 'number',
            description:
              "The disable record's own ID (from octo_alerts_rule_disable_list), not the alert rule ID",
          },
        },
        required: ['disableId'],
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
      name: 'octo_issues_detail',
      description: 'Get Octopus error tracking issue detail by issue ID.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          issueId: { type: 'string', description: 'Issue ID' },
        },
        required: ['issueId'],
      },
    },
    {
      name: 'octo_issues_assign',
      description: 'Batch assign Octopus error tracking issues to a user.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          userId: { type: 'number', description: 'Assignee user ID' },
          issueIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Issue IDs to assign',
          },
          dataSource: {
            type: 'string',
            description: 'Data source: log or rum (default log)',
          },
        },
        required: ['userId', 'issueIds'],
      },
    },
    {
      name: 'octo_issues_update',
      description: 'Batch update Octopus error tracking issue status.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          issueIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Issue IDs to update',
          },
          status: {
            type: 'string',
            description: 'unresolved, resolved, or ignored',
            enum: ['unresolved', 'resolved', 'ignored'],
          },
          env: envProp,
          dataSource: {
            type: 'string',
            description: 'Data source: log or rum (default log)',
          },
          ignoreRule: {
            type: 'object',
            description: 'Optional ignore rule when status is ignored',
            properties: {
              type: {
                type: 'string',
                enum: ['time', 'appearCount', 'userCount'],
              },
              timeRule: {
                type: 'object',
                properties: {
                  endTime: { type: 'number' },
                },
              },
              appearRule: {
                type: 'object',
                properties: {
                  appearCount: { type: 'number' },
                  timestamp: { type: 'number' },
                  timeWindow: { type: 'number' },
                },
              },
              userRule: {
                type: 'object',
                properties: {
                  userCount: { type: 'number' },
                  timestamp: { type: 'number' },
                  timeWindow: { type: 'number' },
                  userField: { type: 'string' },
                },
              },
            },
          },
        },
        required: ['issueIds', 'status'],
      },
    },
    {
      name: 'octo_issues_merge',
      description:
        'Merge at least two distinct Octopus Issues. Returns the authoritative mergeIssueId; do not infer the parent from input order.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          issueIds: {
            type: 'array',
            minItems: 2,
            items: { type: 'string', minLength: 1 },
            description:
              'Issue IDs to merge. Duplicates are removed in first-occurrence order.',
          },
          dataSource: {
            type: 'string',
            enum: ['log', 'rum'],
            description: 'Data source: log or rum (default log)',
          },
        },
        required: ['issueIds'],
      },
    },
    {
      name: 'octo_issues_unmerge',
      description:
        'Remove child Issues from a merge Issue. mergeIssueExists=false means the parent was automatically dissolved.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          mergeIssueId: {
            type: 'string',
            minLength: 1,
            description: 'Merge Issue ID',
          },
          childIssueIds: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', minLength: 1 },
            description: 'Child Issue IDs to remove',
          },
          dataSource: {
            type: 'string',
            enum: ['log', 'rum'],
            description: 'Data source: log or rum (default log)',
          },
        },
        required: ['mergeIssueId', 'childIssueIds'],
      },
    },
    {
      name: 'octo_issues_merge_children',
      description:
        'Get children of an active merge Issue, or canonicalIssueId when the queried Issue is a frozen child.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          issueId: { type: 'string', minLength: 1, description: 'Issue ID' },
          dataSource: {
            type: 'string',
            enum: ['log', 'rum'],
            description: 'Data source: log or rum (default log)',
          },
        },
        required: ['issueId'],
      },
    },
    {
      name: 'octo_cases_list',
      description:
        'List Octopus cases. Filter by group, status, priority, assignee, or case name input.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          groupId: { type: 'number', description: 'Case group ID' },
          status: caseStatusProp,
          priority: casePriorityProp,
          assignerId: { type: 'number', description: 'Assignee user ID' },
          input: { type: 'string', description: 'Search by case name' },
          pageNo: { type: 'number', description: 'Page number (default 1)' },
          pageSize: {
            type: 'number',
            description: 'Page size (default 20, max 1000)',
          },
        },
      },
    },
    {
      name: 'octo_cases_create',
      description: 'Create an Octopus case.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'Case name' },
          groupId: { type: 'number', description: 'Case group ID' },
          priority: casePriorityProp,
          status: caseStatusProp,
          assignerId: { type: 'number', description: 'Assignee user ID' },
          description: { type: 'string', description: 'Case description' },
        },
        required: ['name', 'groupId'],
      },
    },
    {
      name: 'octo_cases_detail',
      description:
        'Get Octopus case detail by numeric ID, including relations and timeline.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'number', description: 'Case ID' },
        },
        required: ['id'],
      },
    },
    {
      name: 'octo_cases_detail_by_key',
      description:
        'Get Octopus case detail by CaseKey, including relations and timeline.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          caseKey: { type: 'string', description: 'Case key' },
        },
        required: ['caseKey'],
      },
    },
    {
      name: 'octo_cases_update',
      description: 'Update editable fields on an Octopus case.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'number', description: 'Case ID' },
          groupId: { type: 'number', description: 'Case group ID' },
          priority: casePriorityProp,
          status: caseStatusProp,
          assignerId: { type: 'number', description: 'Assignee user ID' },
          description: { type: 'string', description: 'Case description' },
        },
        required: ['id'],
      },
    },
    {
      name: 'octo_cases_delete',
      description: 'Delete an Octopus case by ID.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'number', description: 'Case ID' },
        },
        required: ['id'],
      },
    },
    {
      name: 'octo_cases_link',
      description: 'Link an alert or issue to an Octopus case.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'number', description: 'Case ID' },
          type: caseRelationTypeProp,
          targetId: {
            type: 'string',
            description:
              'Alert ID when type=alert, or Issue ID when type=issue',
          },
        },
        required: ['id', 'type', 'targetId'],
      },
    },
    {
      name: 'octo_cases_unlink',
      description: 'Remove a relation from an Octopus case.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'number', description: 'Case ID' },
          relationId: { type: 'number', description: 'Relation ID' },
        },
        required: ['id', 'relationId'],
      },
    },
    {
      name: 'octo_cases_note_add',
      description: 'Add a note to an Octopus case.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'number', description: 'Case ID' },
          text: { type: 'string', description: 'Note text' },
        },
        required: ['id', 'text'],
      },
    },
    {
      name: 'octo_cases_note_update',
      description: 'Update a note on an Octopus case.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'number', description: 'Case ID' },
          noteId: { type: 'number', description: 'Note ID' },
          text: { type: 'string', description: 'Note text' },
        },
        required: ['id', 'noteId', 'text'],
      },
    },
    {
      name: 'octo_cases_groups_all',
      description: 'List all Octopus case groups.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    },
    {
      name: 'octo_cases_group_create',
      description: 'Create an Octopus case group.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'Case group name' },
        },
        required: ['name'],
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
      name: 'octo_trace_aggregate',
      description:
        'Aggregate Octopus trace spans — count, avg, max, min, sum, percentile, grouped by fields.',
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
            description: 'Operation: count, sum, avg, max, min, p50, p95, p99',
          },
          group_by: {
            type: 'string',
            description: 'Field to group by (e.g. "service", "operation")',
          },
          group_limit: {
            type: 'number',
            description: 'Max groups (default 10)',
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
      name: 'octo_metrics_point',
      description:
        'Query Octopus metrics at one point in time. Use metric query syntax like "sum(metric_name{tag=value}.as_count)".',
      inputSchema: {
        type: 'object' as const,
        properties: {
          env: envProp,
          at: {
            type: ['number', 'string'],
            description:
              'Point-in-time as epoch milliseconds or ISO string. Defaults to now.',
          },
          queries: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Metric query strings, e.g. ["sum(http_requests{service=myapp}.as_count)"]',
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
          from: serviceFromProp,
          to: toProp,
        },
      },
    },
    {
      name: 'octo_services_entries',
      description: 'List Octopus APM service entries for a service.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          env: envProp,
          from: serviceFromProp,
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
      name: 'octo_rum_detail',
      description: 'Get Octopus RUM event detail by event ID.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'RUM event ID' },
        },
        required: ['id'],
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
    {
      name: 'octo_users_search',
      description: 'Search Octopus users by names.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          names: {
            type: 'array',
            items: { type: 'string' },
            description: 'User names to search',
          },
        },
        required: ['names'],
      },
    },
  ];
}

export async function handleMcpTool(
  name: string,
  args: Record<string, unknown>,
  client: OctoClient = getClient()
) {
  try {
    switch (name) {
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
          // Omitting status means all statuses; "all" is not a valid enum value.
          status:
            args.status && args.status !== 'all'
              ? (args.status as string)
              : undefined,
          priorities: args.priorities as string[] | undefined,
          services: args.services as string[] | undefined,
          limit: args.limit as number | undefined,
          pageNo: args.pageNo as number | undefined,
          groupId: args.groupId as number | undefined,
          ruleIds: args.ruleIds as number[] | undefined,
          alertRuleType: args.alertRuleType as string | undefined,
        });
        return ok(JSON.stringify(data, null, 2));
      }

      case 'octo_alerts_rules_search': {
        const data = await client.alertRulesSearch({
          groupId: (args.groupId as number) ?? -1,
          // `env`/`priority` are the deprecated singular spellings; fold them
          // into the plural fields the backend actually reads.
          envs: toStringArray(args.envs, args.env),
          priorities: toStringArray(args.priorities, args.priority),
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

      case 'octo_alerts_groups_list': {
        const data = await client.alertGroupsList();
        return ok(JSON.stringify(data, null, 2));
      }

      case 'octo_alerts_rules_details_search': {
        const data = await client.alertRuleDetailsSearch(
          args.ruleIds as number[]
        );
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

      case 'octo_alerts_detail': {
        const data = await client.alertDetail(args.alertId as number);
        return ok(JSON.stringify(data, null, 2));
      }

      case 'octo_alerts_timeseries': {
        const { from, to } = timeDefaults(args);
        const data = await client.alertTimeseries({
          alertId: args.alertId as number,
          from,
          to,
          conditionId: args.conditionId as number | undefined,
        });
        return ok(JSON.stringify(data, null, 2));
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
          scope: normalizeAlertScope(args.scope as string | undefined),
          specifyGroups: args.specifyGroups as
            | Record<string, string[]>
            | undefined,
          silentlyNotify: (args.silentlyNotify as boolean) ?? false,
        });
        return ok(JSON.stringify(data, null, 2));
      }

      case 'octo_alerts_rule_disable_create': {
        const now = Date.now();
        const startTime = (args.startTime as number) ?? now;
        let endTime = args.endTime as number | undefined;
        if (!endTime && args.durationMinutes) {
          endTime = startTime + (args.durationMinutes as number) * 60_000;
        }
        if (!endTime) {
          return fail('Either endTime or durationMinutes is required');
        }
        const data = await client.alertRuleDisableCreate({
          ruleId: args.ruleId as number,
          startTime,
          endTime,
          scope: normalizeAlertScope(args.scope as string | undefined),
          specifyGroups: args.specifyGroups as
            | Record<string, string[]>
            | undefined,
          disableNotifyContent: args.disableNotifyContent as string | undefined,
        });
        return ok(JSON.stringify(data, null, 2));
      }

      case 'octo_alerts_rule_disable_list': {
        const data = await client.alertRuleDisableList(args.ruleId as number);
        return ok(JSON.stringify(data, null, 2));
      }

      case 'octo_alerts_rule_disable_delete': {
        const disableId = args.disableId as number;
        await client.alertRuleDisableDelete(disableId);
        return ok(`Disable record ${disableId} deleted`);
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

      case 'octo_issues_detail': {
        const data = await client.issueDetail(String(args.issueId));
        return ok(JSON.stringify(data, null, 2));
      }

      case 'octo_issues_assign': {
        await client.issuesBatchAssign({
          assigneeId: args.userId as number,
          dataSource: (args.dataSource as string) ?? 'log',
          issueIds: args.issueIds as string[],
        });
        return ok('Issues assigned');
      }

      case 'octo_issues_update': {
        await client.issuesBatchUpdate({
          dataSource: (args.dataSource as string) ?? 'log',
          env: String(args.env ?? getDefaultEnv()),
          issueIds: args.issueIds as string[],
          status: String(args.status),
          ignoreRule: validateIssueIgnoreRuleArgs(args),
        });
        return ok('Issues updated');
      }

      case 'octo_issues_merge': {
        const data = await client.issuesMerge({
          issueIds: args.issueIds as string[],
          dataSource: args.dataSource as string | undefined,
        });
        return ok(JSON.stringify(data, null, 2));
      }

      case 'octo_issues_unmerge': {
        const data = await client.issuesUnmerge({
          mergeIssueId: String(args.mergeIssueId ?? ''),
          childIssueIds: args.childIssueIds as string[],
          dataSource: args.dataSource as string | undefined,
        });
        return ok(JSON.stringify(data, null, 2));
      }

      case 'octo_issues_merge_children': {
        const data = await client.issueMergeChildren(
          String(args.issueId ?? ''),
          args.dataSource as string | undefined
        );
        return ok(JSON.stringify(data, null, 2));
      }

      case 'octo_cases_list': {
        const data = await client.casesList({
          pageNo: (args.pageNo as number) ?? 1,
          pageSize: (args.pageSize as number) ?? 20,
          groupId: args.groupId as number | undefined,
          status: args.status as string | undefined,
          priority: args.priority as string | undefined,
          assignerId: args.assignerId as number | undefined,
          input: args.input as string | undefined,
        });
        return ok(JSON.stringify(data, null, 2));
      }

      case 'octo_cases_create': {
        const data = await client.caseCreate({
          name: String(args.name),
          groupId: args.groupId as number,
          priority: args.priority as string | undefined,
          status: args.status as string | undefined,
          assignerId: args.assignerId as number | undefined,
          description: args.description as string | undefined,
        });
        return ok(JSON.stringify(data, null, 2));
      }

      case 'octo_cases_detail': {
        const data = await client.caseDetail(args.id as number);
        return ok(JSON.stringify(data, null, 2));
      }

      case 'octo_cases_detail_by_key': {
        const data = await client.caseDetailByKey(String(args.caseKey));
        return ok(JSON.stringify(data, null, 2));
      }

      case 'octo_cases_update': {
        const id = args.id as number;
        await client.caseUpdate(id, {
          groupId: args.groupId as number | undefined,
          priority: args.priority as string | undefined,
          status: args.status as string | undefined,
          assignerId: args.assignerId as number | undefined,
          description: args.description as string | undefined,
        });
        return ok(`Case ${id} updated`);
      }

      case 'octo_cases_delete': {
        const id = args.id as number;
        await client.caseDelete(id);
        return ok(`Case ${id} deleted`);
      }

      case 'octo_cases_link': {
        const id = args.id as number;
        await client.caseAddRelation(id, {
          type: String(args.type),
          targetId: String(args.targetId),
        });
        return ok(`Relation added to case ${id}`);
      }

      case 'octo_cases_unlink': {
        const id = args.id as number;
        const relationId = args.relationId as number;
        await client.caseDeleteRelation(id, relationId);
        return ok(`Relation ${relationId} removed from case ${id}`);
      }

      case 'octo_cases_note_add': {
        const id = args.id as number;
        await client.caseAddNote(id, String(args.text));
        return ok(`Note added to case ${id}`);
      }

      case 'octo_cases_note_update': {
        const id = args.id as number;
        const noteId = args.noteId as number;
        await client.caseUpdateNote(id, noteId, String(args.text));
        return ok(`Note ${noteId} updated on case ${id}`);
      }

      case 'octo_cases_groups_all': {
        const data = await client.caseGroupsAll();
        return ok(JSON.stringify(data, null, 2));
      }

      case 'octo_cases_group_create': {
        await client.caseGroupCreate({ name: String(args.name) });
        return ok(`Case group "${String(args.name)}" created`);
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

      case 'octo_trace_aggregate': {
        const { env, from, to } = timeDefaults(args);
        const aggField = String(args.aggregation_field ?? '*');
        const aggOp = String(args.aggregation_op ?? 'count');
        const groupBy = args.group_by as string | undefined;
        const groupLimit = Number(args.group_limit ?? 10);

        const data = await client.traceAggregate({
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

      case 'octo_metrics_point': {
        const queryStrs = args.queries as string[];
        const queries = queryStrs.map((q, i) => ({
          id: String.fromCharCode(65 + i),
          query: q,
          dataSource: 'metric',
        }));
        const at = parsePointInTime(args.at);
        const data = await client.metricsQuery({
          env: String(args.env ?? getDefaultEnv()),
          to: at,
          queries,
        });
        return ok(JSON.stringify(data, null, 2));
      }

      case 'octo_services_list': {
        const { env, from, to } = timeDefaults(args, 60 * 60_000);
        const data = await client.servicesList({ env, from, to });
        return ok(JSON.stringify(data, null, 2));
      }

      case 'octo_services_entries': {
        const { env, from, to } = timeDefaults(args, 60 * 60_000);
        const data = await client.servicesEntries({
          env,
          from,
          to,
          service: String(args.service),
        });
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

      case 'octo_rum_detail': {
        const data = await client.rumDetail(String(args.id));
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

      case 'octo_users_search': {
        const data = await client.usersSearch(args.names as string[]);
        return ok(JSON.stringify(data, null, 2));
      }

      default:
        return fail(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return fail(err);
  }
}

export async function startMcpServer(): Promise<void> {
  const server = new Server(
    { name: 'octo-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getMcpTools(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    return handleMcpTool(request.params.name, args);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
