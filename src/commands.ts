import { execSync } from 'node:child_process';
import type { Command } from 'commander';
import { normalizeAlertScope, OctoClient } from './client.js';
import {
  getBaseUrl,
  getConfigPath,
  getCredentials,
  getDefaultEnv,
  saveToken,
} from './config.js';
import { printOutput } from './output.js';
import { resolveTimeRange } from './time.js';

type IssueIgnoreRulePayload =
  | { type: 'time'; timeRule: { endTime: number } }
  | {
      type: 'appearCount';
      appearRule: {
        appearCount: number;
        timestamp?: number;
        timeWindow?: number;
      };
    }
  | {
      type: 'userCount';
      userRule: {
        userCount: number;
        timestamp?: number;
        timeWindow?: number;
        userField?: string;
      };
    };

type IssueUpdateOptions = {
  ids: string;
  status: string;
  env?: string;
  source: 'log' | 'rum';
  ignoreType?: 'TIME' | 'APPEAR_COUNT' | 'USER_COUNT';
  ignoreEndTime?: string;
  appearCount?: string;
  userCount?: string;
  userField?: string;
  startTimestamp?: string;
  timeWindowMs?: string;
};

function parseEpochMsOrIso(value: string, flagName: string): number {
  if (/^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(
      `${flagName} must be epoch milliseconds or an ISO timestamp`
    );
  }
  return parsed;
}

function parseNumericFlag(value: string, flagName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${flagName} must be a valid number`);
  }
  return parsed;
}

function parseIssueSource(value: string): 'log' | 'rum' {
  if (value === 'log' || value === 'rum') {
    return value;
  }
  throw new Error('--source must be one of: log, rum');
}

function parseIgnoreType(
  value: string
): 'TIME' | 'APPEAR_COUNT' | 'USER_COUNT' {
  if (value === 'TIME' || value === 'APPEAR_COUNT' || value === 'USER_COUNT') {
    return value;
  }
  throw new Error(
    '--ignore-type must be one of: TIME, APPEAR_COUNT, USER_COUNT'
  );
}

function assertNoIgnoreRuleArgs(opts: IssueUpdateOptions): void {
  if (
    opts.ignoreType ||
    opts.ignoreEndTime ||
    opts.appearCount ||
    opts.userCount ||
    opts.userField ||
    opts.startTimestamp ||
    opts.timeWindowMs
  ) {
    throw new Error(
      'ignore rule arguments are only allowed when --status ignored'
    );
  }
}

function buildIssueIgnoreRuleFromOpts(
  opts: IssueUpdateOptions
): IssueIgnoreRulePayload | undefined {
  const hasRuleArg = Boolean(
    opts.ignoreType ||
      opts.ignoreEndTime ||
      opts.appearCount ||
      opts.userCount ||
      opts.userField ||
      opts.startTimestamp ||
      opts.timeWindowMs
  );

  if (opts.status !== 'ignored') {
    assertNoIgnoreRuleArgs(opts);
    return undefined;
  }

  if (!hasRuleArg) {
    return undefined;
  }

  if (!opts.ignoreType) {
    throw new Error(
      '--ignore-type is required when passing ignore rule arguments'
    );
  }

  if (opts.ignoreType === 'TIME') {
    if (!opts.ignoreEndTime) {
      throw new Error('--ignore-end-time is required when --ignore-type TIME');
    }
    if (
      opts.appearCount ||
      opts.userCount ||
      opts.userField ||
      opts.startTimestamp ||
      opts.timeWindowMs
    ) {
      throw new Error(
        'TIME ignore rule does not allow appear/user count arguments'
      );
    }
    return {
      type: 'time',
      timeRule: {
        endTime: parseEpochMsOrIso(opts.ignoreEndTime, '--ignore-end-time'),
      },
    };
  }

  if (opts.ignoreType === 'APPEAR_COUNT') {
    if (!opts.appearCount) {
      throw new Error(
        '--appear-count is required when --ignore-type APPEAR_COUNT'
      );
    }
    if (opts.ignoreEndTime || opts.userCount || opts.userField) {
      throw new Error(
        'APPEAR_COUNT ignore rule only accepts appear-count and window arguments'
      );
    }
    return {
      type: 'appearCount',
      appearRule: {
        appearCount: parseNumericFlag(opts.appearCount, '--appear-count'),
        timestamp: opts.startTimestamp
          ? parseEpochMsOrIso(opts.startTimestamp, '--start-timestamp')
          : undefined,
        timeWindow: opts.timeWindowMs
          ? parseNumericFlag(opts.timeWindowMs, '--time-window-ms')
          : undefined,
      },
    };
  }

  if (!opts.userCount) {
    throw new Error('--user-count is required when --ignore-type USER_COUNT');
  }
  if (opts.ignoreEndTime || opts.appearCount) {
    throw new Error(
      'USER_COUNT ignore rule does not allow TIME or APPEAR_COUNT arguments'
    );
  }
  if (opts.source === 'log' && !opts.userField) {
    throw new Error(
      '--user-field is required when --ignore-type USER_COUNT and --source log'
    );
  }

  return {
    type: 'userCount',
    userRule: {
      userCount: parseNumericFlag(opts.userCount, '--user-count'),
      timestamp: opts.startTimestamp
        ? parseEpochMsOrIso(opts.startTimestamp, '--start-timestamp')
        : undefined,
      timeWindow: opts.timeWindowMs
        ? parseNumericFlag(opts.timeWindowMs, '--time-window-ms')
        : undefined,
      userField: opts.userField,
    },
  };
}

function getClient(): OctoClient {
  const credentials = getCredentials();
  return new OctoClient(getBaseUrl(), credentials);
}

type OutputFormat = 'json' | 'table' | 'jsonl';

export function registerCommands(program: Command): void {
  // ─── login ───────────────────────────────────────────────
  program
    .command('login')
    .description('Configure an Octopus Personal Access Token')
    .requiredOption('--token <token>', 'Personal Access Token')
    .option('--url <url>', 'Base URL')
    .option('--env <env>', 'Default environment')
    .option('--skip-skill', 'Skip global skill installation')
    .action(async (opts) => {
      saveToken(opts.token, opts.url, opts.env);
      console.log(`Token saved to ${getConfigPath()}`);

      if (!opts.skipSkill) {
        console.log('');
        console.log('Installing octo skill globally for AI agents...');
        try {
          execSync(
            'npx reskill@latest install github:kanyun-inc/octo-cli/skills -g -y -a claude-code cursor codex',
            { stdio: 'inherit' }
          );
        } catch {
          console.warn(
            'Skill install failed. Run manually: npx reskill install github:kanyun-inc/octo-cli/skills -g -y -a claude-code cursor'
          );
        }
      }

      console.log('');
      console.log('Done! In any project, tell your AI agent:');
      console.log(
        '  "帮我接入 Octopus 可观测" or "set up Octopus observability"'
      );
      console.log('');
      console.log('Optional: register MCP server for Claude Code:');
      console.log('  npx octo-cli mcp-install');
    });

  // ─── logs search ─────────────────────────────────────────
  const logs = program.command('logs').description('Log operations');

  logs
    .command('search')
    .description('Search logs')
    .option('-q, --query <query>', 'Query string')
    .option('-e, --env <env>', 'Environment')
    .option('-l, --last <duration>', 'Time range, e.g. 15m, 1h, 2d')
    .option('--from <time>', 'Start time (epoch ms or ISO)')
    .option('--to <time>', 'End time (epoch ms or ISO)')
    .option('-n, --limit <n>', 'Max results', '50')
    .option('--order <order>', 'asc or desc', 'desc')
    .option('-o, --output <fmt>', 'Output: json, table, jsonl', 'json')
    .option('--scroll-id <id>', 'Pagination scroll ID')
    .action(async (opts) => {
      const client = getClient();
      const { from, to } = resolveTimeRange(opts);
      const data = await client.logsSearch({
        env: opts.env ?? getDefaultEnv(),
        from,
        to,
        query: opts.query,
        limit: Number.parseInt(opts.limit, 10),
        order: opts.order,
        scrollId: opts.scrollId,
      });
      printOutput(data, opts.output as OutputFormat);
    });

  logs
    .command('aggregate')
    .description('Aggregate logs')
    .option('-q, --query <query>', 'Query string')
    .option('-e, --env <env>', 'Environment')
    .option('-l, --last <duration>', 'Time range')
    .option('--from <time>', 'Start time')
    .option('--to <time>', 'End time')
    .option(
      '-a, --agg <field:op>',
      'Aggregation (e.g. *:count)',
      (v: string, arr: string[]) => [...arr, v],
      [] as string[]
    )
    .option(
      '-g, --group <field[:limit]>',
      'Group by field',
      (v: string, arr: string[]) => [...arr, v],
      [] as string[]
    )
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (opts) => {
      const client = getClient();
      const { from, to } = resolveTimeRange(opts);

      const aggregationFields = opts.agg.length
        ? opts.agg.map((a: string) => {
            const [field, operation = 'count'] = a.split(':');
            return { field, operation };
          })
        : [{ field: '*', operation: 'count' }];

      const groupFields = opts.group.map((g: string) => {
        const [field, limitStr] = g.split(':');
        return {
          field,
          limit: limitStr ? Number.parseInt(limitStr, 10) : 10,
          sort: { field: '*', operation: 'count', order: 'desc' },
        };
      });

      const data = await client.logsAggregate({
        env: opts.env ?? getDefaultEnv(),
        from,
        to,
        query: opts.query,
        aggregationFields,
        groupFields: groupFields.length ? groupFields : undefined,
      });
      printOutput(data, opts.output as OutputFormat);
    });

  // ─── alerts ──────────────────────────────────────────────
  const alerts = program.command('alerts').description('Alert operations');

  alerts
    .command('search')
    .description('Search alerts')
    .option('-q, --query <query>', 'Query string')
    .option('-e, --env <env>', 'Environment')
    .option('-l, --last <duration>', 'Time range', '1h')
    .option('--from <time>', 'Start time')
    .option('--to <time>', 'End time')
    .option(
      '-s, --status <status>',
      'firing or resolved (omit for all statuses)'
    )
    .option('-p, --priority <p>', 'Priority filter (comma-separated: P0,P1,P2)')
    .option('--service <svc>', 'Service filter (comma-separated)')
    .option('--group-id <id>', 'Alert rule group ID')
    .option('--rule-ids <ids>', 'Comma-separated alert rule IDs')
    .option('--rule-type <type>', 'Alert rule type: log, metric, issue')
    .option('--page <n>', 'Page number')
    .option('-n, --limit <n>', 'Max results', '20')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (opts) => {
      const client = getClient();
      const { from, to } = resolveTimeRange(opts);
      const data = await client.alertsSearch({
        from,
        to,
        env: opts.env,
        // The API expects `firing`/`resolved`; omitting it means all statuses.
        // Sending the literal "all" only works by falling through the backend's
        // enum-parse failure, so drop it instead.
        status: opts.status && opts.status !== 'all' ? opts.status : undefined,
        priorities: opts.priority?.split(','),
        query: opts.query,
        services: opts.service?.split(','),
        limit: Number.parseInt(opts.limit, 10),
        pageNo: opts.page ? Number.parseInt(opts.page, 10) : undefined,
        groupId: opts.groupId ? Number.parseInt(opts.groupId, 10) : undefined,
        ruleIds: opts.ruleIds
          ?.split(',')
          .map((id: string) => Number.parseInt(id, 10)),
        alertRuleType: opts.ruleType,
      });
      printOutput(data, opts.output as OutputFormat);
    });

  alerts
    .command('rules')
    .description('Search alert rules')
    .option('--group-id <id>', 'Alert rule group ID', '-1')
    .option('-e, --env <env>', 'Environment (comma-separated)')
    .option('-p, --priority <p>', 'Priority (comma-separated: P0,P1,P2)')
    .option('-s, --search <input>', 'Search keyword')
    .option('--service <svc>', 'Service')
    .option(
      '--status-list <statuses>',
      'Status filter (comma-separated: enabled,disabled,paused,silenced)'
    )
    .option(
      '--types <types>',
      'Rule type filter (comma-separated: log,metric,issue,rum,llm)'
    )
    .option('--tags <tags>', 'Tag filter (comma-separated)')
    .option('--creator <creator>', 'Creator name')
    .option('--page <n>', 'Page number', '1')
    .option('--page-size <n>', 'Page size', '20')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (opts) => {
      const client = getClient();
      const data = await client.alertRulesSearch({
        groupId: Number.parseInt(opts.groupId, 10),
        envs: opts.env?.split(','),
        priorities: opts.priority?.split(','),
        searchInput: opts.search,
        service: opts.service,
        statusList: opts.statusList?.split(','),
        types: opts.types?.split(','),
        tags: opts.tags?.split(','),
        creator: opts.creator,
        pageParam: {
          pageNo: Number.parseInt(opts.page, 10),
          pageSize: Number.parseInt(opts.pageSize, 10),
        },
      });
      printOutput(data, opts.output as OutputFormat);
    });

  alerts
    .command('groups')
    .description('List all alert groups')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (opts) => {
      const client = getClient();
      const data = await client.alertGroupsList();
      printOutput(data, opts.output as OutputFormat);
    });

  alerts
    .command('rule-details')
    .description('Get alert rule details by IDs')
    .requiredOption(
      '--ids <ids>',
      'Comma-separated alert rule IDs (1-100 positive integers)'
    )
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (opts) => {
      const ruleIds = opts.ids
        .split(',')
        .map((id: string) => Number(id.trim()));
      const client = getClient();
      const data = await client.alertRuleDetailsSearch(ruleIds);
      printOutput(data, opts.output as OutputFormat);
    });

  alerts
    .command('silence')
    .description('Create alert silence')
    .requiredOption('--rule-id <id>', 'Alert rule ID')
    .requiredOption('--alert-id <id>', 'Alert ID')
    .requiredOption('--duration <dur>', 'Silence duration (e.g. 2h)')
    .option('--scope <scope>', 'Silence scope: all or specify', 'all')
    .option(
      '--specify-groups <json>',
      'JSON map of dimension to values, e.g. \'{"service":["a","b"]}\' (scope=specify)'
    )
    .option('--notify', 'Notify users about silence')
    .action(async (opts) => {
      const client = getClient();
      const now = Date.now();
      const { parseDuration } = await import('./time.js');
      const ms = parseDuration(opts.duration);
      const data = await client.alertSilenceCreate({
        ruleId: Number.parseInt(opts.ruleId, 10),
        alertId: Number.parseInt(opts.alertId, 10),
        startTime: now,
        endTime: now + ms,
        scope: normalizeAlertScope(opts.scope),
        specifyGroups: opts.specifyGroups
          ? JSON.parse(opts.specifyGroups)
          : undefined,
        silentlyNotify: !!opts.notify,
      });
      console.log('Silence created');
      if (data) printOutput(data);
    });

  alerts
    .command('create')
    .description('Create alert rules from JSON file')
    .requiredOption(
      '--file <path>',
      'Path to JSON file containing alert rules array'
    )
    .action(async (opts) => {
      const { readFileSync } = await import('node:fs');
      const content = readFileSync(opts.file, 'utf-8');
      const rules = JSON.parse(content);
      const arr = Array.isArray(rules) ? rules : [rules];
      const client = getClient();
      const data = await client.alertRulesCreate(arr);
      console.log('Alert rules created');
      if (data) printOutput(data);
    });

  alerts
    .command('delete')
    .description('Delete an alert rule')
    .argument('<ruleId>', 'Alert rule ID')
    .action(async (ruleId) => {
      const client = getClient();
      await client.alertRulesDelete(Number.parseInt(ruleId, 10));
      console.log('Alert rule deleted');
    });

  alerts
    .command('detail')
    .description('Get alert detail')
    .argument('<alertId>', 'Alert ID')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (alertId, opts) => {
      const client = getClient();
      const data = await client.alertDetail(Number.parseInt(alertId, 10));
      printOutput(data, opts.output as OutputFormat);
    });

  alerts
    .command('timeseries')
    .description('Get alert detection timeseries data')
    .argument('<alertId>', 'Alert ID')
    .option('--condition-id <id>', 'Condition ID (default 0)')
    .option('-l, --last <duration>', 'Time range', '1h')
    .option('--from <time>', 'Start time')
    .option('--to <time>', 'End time')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (alertId, opts) => {
      const client = getClient();
      const { from, to } = resolveTimeRange(opts);
      const data = await client.alertTimeseries({
        alertId: Number.parseInt(alertId, 10),
        from,
        to,
        conditionId: opts.conditionId
          ? Number.parseInt(opts.conditionId, 10)
          : undefined,
      });
      printOutput(data, opts.output as OutputFormat);
    });

  alerts
    .command('unsilence')
    .description('Delete alert silence')
    .argument('<ruleId>', 'Alert rule ID')
    .action(async (ruleId) => {
      const client = getClient();
      await client.alertSilenceDelete(Number.parseInt(ruleId, 10));
      console.log('Silence deleted');
    });

  alerts
    .command('disable')
    .description('Stop an alert rule from evaluating for a time window')
    .requiredOption('--rule-id <id>', 'Alert rule ID')
    .requiredOption('--duration <dur>', 'Disable duration (e.g. 2h)')
    .option('--start <time>', 'Start time (default: now)')
    .option('--scope <scope>', 'Disable scope: all or specify', 'all')
    .option(
      '--specify-groups <json>',
      'JSON map of dimension to values, e.g. \'{"service":["a","b"]}\' (scope=specify)'
    )
    .option('--reason <text>', 'Disable notification content')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (opts) => {
      const client = getClient();
      const { parseDuration } = await import('./time.js');
      const startTime = opts.start
        ? resolveTimeRange({ from: opts.start, to: opts.start }).from
        : Date.now();
      const data = await client.alertRuleDisableCreate({
        ruleId: Number.parseInt(opts.ruleId, 10),
        startTime,
        endTime: startTime + parseDuration(opts.duration),
        scope: normalizeAlertScope(opts.scope),
        specifyGroups: opts.specifyGroups
          ? JSON.parse(opts.specifyGroups)
          : undefined,
        disableNotifyContent: opts.reason,
      });
      // The status line goes to stderr so stdout stays a single parseable
      // document for `jq` and other consumers.
      console.error('Disable rule created');
      printOutput(data, opts.output as OutputFormat);
    });

  alerts
    .command('disables')
    .description('List disable rules for an alert rule')
    .argument('<ruleId>', 'Alert rule ID')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (ruleId, opts) => {
      const client = getClient();
      const data = await client.alertRuleDisableList(
        Number.parseInt(ruleId, 10)
      );
      printOutput(data, opts.output as OutputFormat);
    });

  alerts
    .command('enable')
    .description('Delete a disable rule (use the disable id, not the rule id)')
    .argument('<disableId>', 'Disable rule ID — from `alerts disables`')
    .action(async (disableId) => {
      const client = getClient();
      await client.alertRuleDisableDelete(Number.parseInt(disableId, 10));
      console.log('Disable rule deleted');
    });

  // ─── issues ──────────────────────────────────────────────
  const issues = program.command('issues').description('Error tracking issues');

  issues
    .command('search')
    .description('Search issues')
    .option('-q, --query <query>', 'Query string')
    .option('-e, --env <env>', 'Environment')
    .option('-l, --last <duration>', 'Time range', '1h')
    .option('--from <time>', 'Start time')
    .option('--to <time>', 'End time')
    .option(
      '-s, --status <status>',
      'unresolved, resolved, ignored, all',
      'unresolved'
    )
    .option('--sort <type>', 'logCount or firstSeen', 'logCount')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (opts) => {
      const client = getClient();
      const { from, to } = resolveTimeRange(opts);
      const data = await client.issuesSearch({
        env: opts.env ?? getDefaultEnv(),
        from,
        to,
        query: opts.query,
        sortType: opts.sort,
        status: opts.status,
      });
      printOutput(data, opts.output as OutputFormat);
    });

  issues
    .command('detail')
    .description('Get issue detail')
    .argument('<issueId>', 'Issue ID')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (issueId, opts) => {
      const client = getClient();
      const data = await client.issueDetail(issueId);
      printOutput(data, opts.output as OutputFormat);
    });

  issues
    .command('assign')
    .description('Batch assign issues to a user')
    .requiredOption('--user <userId>', 'Assignee user ID')
    .requiredOption('--ids <ids>', 'Comma-separated issue IDs')
    .option('--source <src>', 'Data source: log or rum', 'log')
    .action(async (opts) => {
      const client = getClient();
      await client.issuesBatchAssign({
        assigneeId: Number.parseInt(opts.user, 10),
        dataSource: opts.source,
        issueIds: opts.ids.split(','),
      });
      console.log('Issues assigned');
    });

  issues
    .command('update')
    .description('Batch update issue status')
    .requiredOption('--ids <ids>', 'Comma-separated issue IDs')
    .requiredOption('-s, --status <status>', 'unresolved, resolved, or ignored')
    .option('-e, --env <env>', 'Environment')
    .option(
      '--source <src>',
      'Data source: log or rum',
      parseIssueSource,
      'log'
    )
    .option(
      '--ignore-type <type>',
      'TIME, APPEAR_COUNT, or USER_COUNT',
      parseIgnoreType
    )
    .option(
      '--ignore-end-time <time>',
      'Epoch ms or ISO timestamp for TIME ignore rule'
    )
    .option(
      '--appear-count <n>',
      'Threshold count for APPEAR_COUNT ignore rule'
    )
    .option('--user-count <n>', 'Threshold count for USER_COUNT ignore rule')
    .option(
      '--user-field <field>',
      'User field name for USER_COUNT ignore rule'
    )
    .option(
      '--start-timestamp <time>',
      'Epoch ms or ISO timestamp for threshold rules'
    )
    .option(
      '--time-window-ms <ms>',
      'Window size in milliseconds for threshold rules'
    )
    .action(async (opts: IssueUpdateOptions) => {
      const client = getClient();
      await client.issuesBatchUpdate({
        dataSource: opts.source,
        env: opts.env ?? getDefaultEnv(),
        issueIds: opts.ids.split(','),
        status: opts.status,
        ignoreRule: buildIssueIgnoreRuleFromOpts(opts),
      });
      console.log('Issues updated');
    });

  issues
    .command('merge')
    .description('Merge issues and return the canonical merge Issue ID')
    .requiredOption('--ids <ids>', 'Comma-separated issue IDs')
    .option(
      '--source <src>',
      'Data source: log or rum',
      parseIssueSource,
      'log'
    )
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (opts) => {
      const client = getClient();
      const data = await client.issuesMerge({
        issueIds: opts.ids.split(','),
        dataSource: opts.source,
      });
      printOutput(data, opts.output as OutputFormat);
    });

  issues
    .command('unmerge')
    .description('Remove child issues from a merge Issue')
    .argument('<mergeIssueId>', 'Merge Issue ID')
    .requiredOption('--ids <ids>', 'Comma-separated child Issue IDs')
    .option(
      '--source <src>',
      'Data source: log or rum',
      parseIssueSource,
      'log'
    )
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (mergeIssueId, opts) => {
      const client = getClient();
      const data = await client.issuesUnmerge({
        mergeIssueId,
        childIssueIds: opts.ids.split(','),
        dataSource: opts.source,
      });
      if (!data.mergeIssueExists) {
        console.error(
          'The merge Issue was automatically dissolved because fewer than two children remain'
        );
      }
      printOutput(data, opts.output as OutputFormat);
    });

  issues
    .command('merge-children')
    .description('Get merge children or the canonical parent of a frozen child')
    .argument('<issueId>', 'Issue ID')
    .option(
      '--source <src>',
      'Data source: log or rum',
      parseIssueSource,
      'log'
    )
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (issueId, opts) => {
      const client = getClient();
      const data = await client.issueMergeChildren(issueId, opts.source);
      printOutput(data, opts.output as OutputFormat);
    });

  // ─── cases ───────────────────────────────────────────────
  const cases = program.command('cases').description('Case operations');

  cases
    .command('list')
    .description('List cases')
    .option('--group-id <id>', 'Case group ID')
    .option('-s, --status <status>', 'todo, doing, or done')
    .option('-p, --priority <priority>', 'NONE, P0, P1, or P2')
    .option('--assigner-id <id>', 'Assignee user ID')
    .option('--input <text>', 'Search by case name')
    .option('--page <n>', 'Page number', '1')
    .option('--page-size <n>', 'Page size', '20')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (opts) => {
      const client = getClient();
      const data = await client.casesList({
        pageNo: Number.parseInt(opts.page, 10),
        pageSize: Number.parseInt(opts.pageSize, 10),
        groupId: opts.groupId ? Number.parseInt(opts.groupId, 10) : undefined,
        status: opts.status,
        priority: opts.priority,
        assignerId: opts.assignerId
          ? Number.parseInt(opts.assignerId, 10)
          : undefined,
        input: opts.input,
      });
      printOutput(data, opts.output as OutputFormat);
    });

  cases
    .command('create')
    .description('Create a case')
    .requiredOption('--name <name>', 'Case name')
    .requiredOption('--group-id <id>', 'Case group ID')
    .option('-p, --priority <priority>', 'NONE, P0, P1, or P2')
    .option('-s, --status <status>', 'todo, doing, or done')
    .option('--assigner-id <id>', 'Assignee user ID')
    .option('--description <text>', 'Case description')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (opts) => {
      const client = getClient();
      const data = await client.caseCreate({
        name: opts.name,
        groupId: Number.parseInt(opts.groupId, 10),
        priority: opts.priority,
        status: opts.status,
        assignerId: opts.assignerId
          ? Number.parseInt(opts.assignerId, 10)
          : undefined,
        description: opts.description,
      });
      if (data) printOutput(data, opts.output as OutputFormat);
    });

  cases
    .command('detail')
    .description('Get case detail by ID')
    .argument('<id>', 'Case ID')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (id, opts) => {
      const client = getClient();
      const data = await client.caseDetail(Number.parseInt(id, 10));
      printOutput(data, opts.output as OutputFormat);
    });

  cases
    .command('detail-key')
    .description('Get case detail by CaseKey')
    .argument('<caseKey>', 'Case key')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (caseKey, opts) => {
      const client = getClient();
      const data = await client.caseDetailByKey(caseKey);
      printOutput(data, opts.output as OutputFormat);
    });

  cases
    .command('update')
    .description('Update a case')
    .argument('<id>', 'Case ID')
    .option('--group-id <id>', 'Case group ID')
    .option('-p, --priority <priority>', 'NONE, P0, P1, or P2')
    .option('-s, --status <status>', 'todo, doing, or done')
    .option('--assigner-id <id>', 'Assignee user ID')
    .option('--description <text>', 'Case description')
    .action(async (id, opts) => {
      const client = getClient();
      await client.caseUpdate(Number.parseInt(id, 10), {
        groupId: opts.groupId ? Number.parseInt(opts.groupId, 10) : undefined,
        priority: opts.priority,
        status: opts.status,
        assignerId: opts.assignerId
          ? Number.parseInt(opts.assignerId, 10)
          : undefined,
        description: opts.description,
      });
      console.log('Case updated');
    });

  cases
    .command('delete')
    .description('Delete a case')
    .argument('<id>', 'Case ID')
    .action(async (id) => {
      const client = getClient();
      await client.caseDelete(Number.parseInt(id, 10));
      console.log('Case deleted');
    });

  cases
    .command('link')
    .description('Link an alert or issue to a case')
    .argument('<id>', 'Case ID')
    .requiredOption('--type <type>', 'Relation type: alert or issue')
    .requiredOption('--target-id <id>', 'Alert ID or Issue ID')
    .action(async (id, opts) => {
      const client = getClient();
      await client.caseAddRelation(Number.parseInt(id, 10), {
        type: opts.type,
        targetId: opts.targetId,
      });
      console.log('Case relation added');
    });

  cases
    .command('unlink')
    .description('Remove a case relation')
    .argument('<id>', 'Case ID')
    .argument('<relationId>', 'Relation ID')
    .action(async (id, relationId) => {
      const client = getClient();
      await client.caseDeleteRelation(
        Number.parseInt(id, 10),
        Number.parseInt(relationId, 10)
      );
      console.log('Case relation removed');
    });

  cases
    .command('note')
    .description('Add a case note')
    .argument('<id>', 'Case ID')
    .requiredOption('--text <text>', 'Note text')
    .action(async (id, opts) => {
      const client = getClient();
      await client.caseAddNote(Number.parseInt(id, 10), opts.text);
      console.log('Case note added');
    });

  cases
    .command('note-update')
    .description('Update a case note')
    .argument('<id>', 'Case ID')
    .argument('<noteId>', 'Note ID')
    .requiredOption('--text <text>', 'Note text')
    .action(async (id, noteId, opts) => {
      const client = getClient();
      await client.caseUpdateNote(
        Number.parseInt(id, 10),
        Number.parseInt(noteId, 10),
        opts.text
      );
      console.log('Case note updated');
    });

  cases
    .command('groups')
    .description('List case groups')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (opts) => {
      const client = getClient();
      const data = await client.caseGroupsAll();
      printOutput(data, opts.output as OutputFormat);
    });

  cases
    .command('group-create')
    .description('Create a case group')
    .requiredOption('--name <name>', 'Case group name')
    .action(async (opts) => {
      const client = getClient();
      await client.caseGroupCreate({ name: opts.name });
      console.log('Case group created');
    });

  // ─── trace ───────────────────────────────────────────────
  const trace = program.command('trace').description('Trace operations');

  trace
    .command('search')
    .description('Search trace spans')
    .option('-q, --query <query>', 'Query string')
    .option('-e, --env <env>', 'Environment')
    .option('-l, --last <duration>', 'Time range', '15m')
    .option('--from <time>', 'Start time')
    .option('--to <time>', 'End time')
    .option('-n, --limit <n>', 'Max results', '50')
    .option('--order <order>', 'asc or desc', 'desc')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (opts) => {
      const client = getClient();
      const { from, to } = resolveTimeRange(opts);
      const data = await client.traceSpanList({
        env: opts.env ?? getDefaultEnv(),
        from,
        to,
        query: opts.query,
        limit: Number.parseInt(opts.limit, 10),
        order: opts.order,
      });
      printOutput(data, opts.output as OutputFormat);
    });

  trace
    .command('aggregate')
    .description('Aggregate trace spans')
    .option('-q, --query <query>', 'Query string')
    .option('-e, --env <env>', 'Environment')
    .option('-l, --last <duration>', 'Time range', '15m')
    .option('--from <time>', 'Start time')
    .option('--to <time>', 'End time')
    .option(
      '-a, --agg <field:op>',
      'Aggregation',
      (v: string, arr: string[]) => [...arr, v],
      [] as string[]
    )
    .option(
      '-g, --group <field[:limit]>',
      'Group by',
      (v: string, arr: string[]) => [...arr, v],
      [] as string[]
    )
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (opts) => {
      const client = getClient();
      const { from, to } = resolveTimeRange(opts);

      const aggregationFields = opts.agg.length
        ? opts.agg.map((a: string) => {
            const [field, operation = 'count'] = a.split(':');
            return { field, operation };
          })
        : [{ field: '*', operation: 'count' }];

      const groupFields = opts.group.map((g: string) => {
        const [field, limitStr] = g.split(':');
        return {
          field,
          limit: limitStr ? Number.parseInt(limitStr, 10) : 10,
          sort: { field: '*', operation: 'count', order: 'desc' },
        };
      });

      const data = await client.traceAggregate({
        env: opts.env ?? getDefaultEnv(),
        from,
        to,
        query: opts.query,
        aggregationFields,
        groupFields: groupFields.length ? groupFields : undefined,
      });
      printOutput(data, opts.output as OutputFormat);
    });

  // ─── metrics ─────────────────────────────────────────────
  const metrics = program.command('metrics').description('Metric operations');

  metrics
    .command('query')
    .description('Query metrics timeseries')
    .argument('<queries...>', 'Metric queries (e.g. "sum(test{}.as_count)")')
    .option('-e, --env <env>', 'Environment')
    .option('-l, --last <duration>', 'Time range', '1h')
    .option('--from <time>', 'Start time')
    .option('--to <time>', 'End time')
    .option('--points <n>', 'Number of data points', '150')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (queryArgs: string[], opts) => {
      const client = getClient();
      const { from, to } = resolveTimeRange(opts);

      const queries = queryArgs.map((q, i) => ({
        id: String.fromCharCode(65 + i), // A, B, C...
        query: q,
        dataSource: 'metric',
      }));

      const data = await client.metricsTimeseries({
        env: opts.env ?? getDefaultEnv(),
        from,
        to,
        pointCount: Number.parseInt(opts.points, 10),
        queries,
      });
      printOutput(data, opts.output as OutputFormat);
    });

  metrics
    .command('point')
    .description('Query single metric point')
    .argument('<queries...>', 'Metric queries')
    .option('-e, --env <env>', 'Environment')
    .option('--at <time>', 'Point-in-time (default: now)')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (queryArgs: string[], opts) => {
      const client = getClient();
      const to = opts.at ? new Date(opts.at).getTime() : Date.now();

      const queries = queryArgs.map((q, i) => ({
        id: String.fromCharCode(65 + i),
        query: q,
        dataSource: 'metric',
      }));

      const data = await client.metricsQuery({
        env: opts.env ?? getDefaultEnv(),
        to,
        queries,
      });
      printOutput(data, opts.output as OutputFormat);
    });

  // ─── services ────────────────────────────────────────────
  const services = program
    .command('services')
    .description('Service/APM operations');

  services
    .command('list')
    .description('List services')
    .option('-e, --env <env>', 'Environment')
    .option('-l, --last <duration>', 'Time range', '1h')
    .option('--from <time>', 'Start time')
    .option('--to <time>', 'End time')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (opts) => {
      const client = getClient();
      const { from, to } = resolveTimeRange(opts);
      const data = await client.servicesList({
        env: opts.env ?? getDefaultEnv(),
        from,
        to,
      });
      printOutput(data, opts.output as OutputFormat);
    });

  services
    .command('entries')
    .description('List service entries')
    .argument('<service>', 'Service name')
    .option('-e, --env <env>', 'Environment')
    .option('-l, --last <duration>', 'Time range', '1h')
    .option('--from <time>', 'Start time')
    .option('--to <time>', 'End time')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (service, opts) => {
      const client = getClient();
      const { from, to } = resolveTimeRange(opts);
      const data = await client.servicesEntries({
        env: opts.env ?? getDefaultEnv(),
        from,
        to,
        service,
      });
      printOutput(data, opts.output as OutputFormat);
    });

  services
    .command('topo')
    .description('Service topology graph')
    .argument('<service>', 'Service name')
    .option('-e, --env <env>', 'Environment')
    .option('-l, --last <duration>', 'Time range', '1h')
    .option('--from <time>', 'Start time')
    .option('--to <time>', 'End time')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (service, opts) => {
      const client = getClient();
      const { from, to } = resolveTimeRange(opts);
      const data = await client.servicesTopology({
        env: opts.env ?? getDefaultEnv(),
        from,
        to,
        service,
      });
      printOutput(data, opts.output as OutputFormat);
    });

  // ─── llm ─────────────────────────────────────────────────
  program
    .command('llm')
    .description('Query LLM spans')
    .option('-q, --query <query>', 'Query string')
    .option('-e, --env <env>', 'Environment')
    .option('-l, --last <duration>', 'Time range', '1h')
    .option('--from <time>', 'Start time')
    .option('--to <time>', 'End time')
    .option('-n, --limit <n>', 'Page size', '20')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (opts) => {
      const client = getClient();
      const { from, to } = resolveTimeRange(opts);
      const data = await client.llmList({
        env: opts.env ?? getDefaultEnv(),
        from,
        to,
        query: opts.query,
        pageSize: Number.parseInt(opts.limit, 10),
      });
      printOutput(data, opts.output as OutputFormat);
    });

  // ─── rum ─────────────────────────────────────────────────
  const rum = program.command('rum').description('RUM operations');

  rum
    .command('list')
    .description('List RUM events')
    .option('-q, --query <query>', 'Query string')
    .option('-e, --env <env>', 'Environment')
    .option('-l, --last <duration>', 'Time range', '1h')
    .option('--from <time>', 'Start time')
    .option('--to <time>', 'End time')
    .option('-n, --limit <n>', 'Page size', '20')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (opts) => {
      const client = getClient();
      const { from, to } = resolveTimeRange(opts);
      const data = await client.rumList({
        env: opts.env ?? getDefaultEnv(),
        from,
        to,
        query: opts.query,
        pageSize: Number.parseInt(opts.limit, 10),
      });
      printOutput(data, opts.output as OutputFormat);
    });

  rum
    .command('detail')
    .description('Get RUM event detail')
    .argument('<id>', 'RUM event ID')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (id, opts) => {
      const client = getClient();
      const data = await client.rumDetail(id);
      printOutput(data, opts.output as OutputFormat);
    });

  // ─── events ──────────────────────────────────────────────
  program
    .command('events')
    .description('Query events')
    .option('-q, --query <query>', 'Query string')
    .option('-e, --env <env>', 'Environment')
    .option('-l, --last <duration>', 'Time range', '1h')
    .option('--from <time>', 'Start time')
    .option('--to <time>', 'End time')
    .option('-n, --limit <n>', 'Page size', '20')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (opts) => {
      const client = getClient();
      const { from, to } = resolveTimeRange(opts);
      const data = await client.eventList({
        env: opts.env ?? getDefaultEnv(),
        from,
        to,
        query: opts.query,
        pageSize: Number.parseInt(opts.limit, 10),
      });
      printOutput(data, opts.output as OutputFormat);
    });

  // ─── users ───────────────────────────────────────────────
  program
    .command('users')
    .description('Search users')
    .argument('<names...>', 'User names to search')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (names: string[], opts) => {
      const client = getClient();
      const data = await client.usersSearch(names);
      printOutput(data, opts.output as OutputFormat);
    });
}
