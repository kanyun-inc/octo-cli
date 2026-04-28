import { execSync } from 'node:child_process';
import type { Command } from 'commander';
import { OctoClient } from './client.js';
import {
  getBaseUrl,
  getConfigPath,
  getCredentials,
  getDefaultEnv,
  getToken,
  saveConfig,
  saveToken,
} from './config.js';
import { printOutput } from './output.js';
import { resolveTimeRange } from './time.js';

function getClient(): OctoClient {
  const credentials = getCredentials();
  return new OctoClient(getBaseUrl(), credentials);
}

type OutputFormat = 'json' | 'table' | 'jsonl';

export function registerCommands(program: Command): void {
  // ─── login ───────────────────────────────────────────────
  program
    .command('login')
    .description('Configure Octopus API credentials')
    .option('--token <token>', 'Personal Access Token')
    .option('--app-id <id>', 'Application ID (legacy)')
    .option('--app-secret <secret>', 'Application Secret (legacy)')
    .option('--url <url>', 'Base URL')
    .option('--env <env>', 'Default environment')
    .option('--skip-skill', 'Skip global skill installation')
    .action(async (opts) => {
      if (opts.token) {
        saveToken(opts.token, opts.url, opts.env);
        console.log(`Token saved to ${getConfigPath()}`);
      } else if (opts.appId && opts.appSecret) {
        saveConfig(opts.appId, opts.appSecret, opts.url, opts.env);
        console.log(`Credentials saved to ${getConfigPath()}`);
      } else {
        console.error('Error: Provide --token <TOKEN> or both --app-id and --app-secret.');
        process.exit(1);
      }

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
    .option('-s, --status <status>', 'firing, resolved, or all', 'all')
    .option('-p, --priority <p>', 'Priority filter (comma-separated: P0,P1,P2)')
    .option('--service <svc>', 'Service filter (comma-separated)')
    .option('--group-id <id>', 'Alert rule group ID')
    .option('--rule-ids <ids>', 'Comma-separated alert rule IDs')
    .option('-n, --limit <n>', 'Max results', '20')
    .option('-o, --output <fmt>', 'Output format', 'json')
    .action(async (opts) => {
      const client = getClient();
      const { from, to } = resolveTimeRange(opts);
      const data = await client.alertsSearch({
        from,
        to,
        env: opts.env,
        status: opts.status,
        priorities: opts.priority?.split(','),
        query: opts.query,
        services: opts.service?.split(','),
        limit: Number.parseInt(opts.limit, 10),
        groupId: opts.groupId ? Number.parseInt(opts.groupId, 10) : undefined,
        ruleIds: opts.ruleIds
          ?.split(',')
          .map((id: string) => Number.parseInt(id, 10)),
      });
      printOutput(data, opts.output as OutputFormat);
    });

  alerts
    .command('rules')
    .description('Search alert rules')
    .option('--group-id <id>', 'Alert rule group ID', '-1')
    .option('-e, --env <env>', 'Environment')
    .option('-p, --priority <p>', 'Priority')
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
        env: opts.env,
        priority: opts.priority,
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
    .command('silence')
    .description('Create alert silence')
    .requiredOption('--rule-id <id>', 'Alert rule ID')
    .requiredOption('--alert-id <id>', 'Alert ID')
    .requiredOption('--duration <dur>', 'Silence duration (e.g. 2h)')
    .option('--scope <scope>', 'Silence scope: ALL or SPECIFY', 'ALL')
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
        scope: opts.scope,
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
    .command('unsilence')
    .description('Delete alert silence')
    .argument('<ruleId>', 'Alert rule ID')
    .action(async (ruleId) => {
      const client = getClient();
      await client.alertSilenceDelete(Number.parseInt(ruleId, 10));
      console.log('Silence deleted');
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
    .option('--source <src>', 'Data source: log or rum', 'log')
    .action(async (opts) => {
      const client = getClient();
      await client.issuesBatchUpdate({
        dataSource: opts.source,
        env: opts.env ?? getDefaultEnv(),
        issueIds: opts.ids.split(','),
        status: opts.status,
      });
      console.log('Issues updated');
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
