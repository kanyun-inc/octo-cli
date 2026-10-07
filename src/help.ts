import type { Command } from 'commander';

const manual = 'https://github.com/kanyun-inc/octo-cli#readme';
const openApi =
  'https://octopus-docs.zhenguanyu.com/1b42090d16b681749335c62b3ed505be';
const apiPages: Record<string, string> = {
  logs: '1b42090d16b6815aa654e13c4de66ba4',
  issues: '1b42090d16b681a4b2b5f600cd9a7ba7',
  alerts: '1b42090d16b68152ae92d28056308156',
  services: '1b42090d16b681e786c6ce18ac45b1f3',
  metrics: '1b42090d16b68113bc99ebbbfcef6f1d',
  trace: '1b42090d16b6812ba97cea1d2cbbd63e',
  llm: '26f2090d16b680b39592ee187ea8e105',
  rum: '26f2090d16b680209b69d9ac21d1a906',
  events: '2af2090d16b6809c827bc15fa208e7bb',
  users: '2232090d16b68048b441d1456a7ac374',
};
const installed = new WeakSet<Command>();

const examples: Record<string, string[]> = {
  login: ['octo login --token <PAT> --env online --skip-skill'],
  init: ['octo init .'],
  mcp: ['octo mcp'],
  'mcp-install': ['octo mcp-install --scope user'],
  'logs search': [
    'octo logs search -e online -q "service = myapp AND level = ERROR" -l 15m -n 50',
    'octo logs search -q "trace_id = <TRACE_ID>" --from 1790596500000 --to 1790596800000 --order asc --scroll-id <LAST_LOG_ID>',
    'octo logs search -q "service = myapp" -e online --from 1790596500000 --to 1790596800000 --order asc -o jsonl --cursor-file /tmp/logs.cursor > /tmp/logs.jsonl',
  ],
  'logs aggregate': [
    'octo logs aggregate -q "service = myapp AND level = ERROR" -l 30m -g k8s.pod.name:20 -a "*:count"',
    'octo logs aggregate -e online -q "service = leo-exam AND log_type = http AND sc = 500" -l 30m -g "_jakarta.servlet.error.request_uri:10" -a "*:count" -o json',
    'octo logs aggregate -e online -q "service = leo-exam AND log_type = http AND sc >= 500 AND sc <= 599" -l 30m -g "_jakarta.servlet.error.request_uri:10" -a "*:count" -o json',
  ],
  'trace search': [
    'octo trace search -q "trace_id = <TRACE_ID>" -l 1h -n 100',
    'octo trace search -q "service = myapp" --from 1790596500000 --to 1790596800000 --scroll-id <LAST_RECORD_ID>',
  ],
  'trace aggregate': [
    'octo trace aggregate -q "service = myapp" -a duration:p95 -g service:10 -l 15m',
  ],
  'alerts search': [
    'octo alerts search -s firing -p P0,P1 --service myapp -l 1h',
    'octo alerts search -s all -e test -l 1d',
  ],
  'alerts rules': [
    'octo alerts rules --group-id -1 -e online,test --status-list enabled --types log,metric --page 1 --page-size 20',
  ],
  'alerts groups': ['octo alerts groups'],
  'alerts rule-details': ['octo alerts rule-details --ids 101,102'],
  'alerts detail': ['octo alerts detail 12345'],
  'alerts timeseries': ['octo alerts timeseries 12345 --condition-id 0 -l 1h'],
  'alerts silence': [
    'octo alerts silence --rule-id 101 --alert-id 12345 --duration 2h',
  ],
  'alerts unsilence': ['octo alerts unsilence 101'],
  'alerts disable': [
    'octo alerts disable --rule-id 101 --duration 2h --reason "maintenance"',
  ],
  'alerts disables': ['octo alerts disables 101'],
  'alerts enable': ['octo alerts enable <DISABLE_RECORD_ID>'],
  'alerts create': ['octo alerts create --file rules.json'],
  'alerts delete': ['octo alerts delete 101'],
  'issues search': [
    'octo issues search -q "service = myapp" --status unresolved --sort logCount -l 1h',
    'octo issues search --source rum -e test --status all -l 1h',
  ],
  'issues detail': [
    'octo issues detail <ISSUE_ID>',
    'octo issues detail <RUM_ISSUE_ID> --source rum',
  ],
  'issues ai-analysis': [
    'octo issues ai-analysis <ISSUE_ID> --context "Errors started after deployment"',
  ],
  'issues assign': ['octo issues assign --user 123 --ids id1,id2 --source log'],
  'issues update': [
    'octo issues update --ids id1,id2 --status resolved -e online',
    'octo issues update --ids id1 --status ignored --ignore-type TIME --ignore-end-time "2026-10-05T00:00:00+08:00"',
  ],
  'issues merge': ['octo issues merge --ids id1,id2 --source log'],
  'issues unmerge': ['octo issues unmerge <MERGE_ISSUE_ID> --ids child1'],
  'issues merge-children': [
    'octo issues merge-children <ISSUE_ID> --source log',
  ],
  'cases list': [
    'octo cases list --status todo --priority P1 --page 1 --page-size 20',
  ],
  'cases create': [
    'octo cases create --name "Checkout incident" --group-id 1 --priority P0',
  ],
  'cases detail': ['octo cases detail 123'],
  'cases detail-key': ['octo cases detail-key <CASE_KEY>'],
  'cases update': ['octo cases update 123 --status doing --assigner-id 456'],
  'cases delete': ['octo cases delete 123'],
  'cases link': ['octo cases link 123 --type alert --target-id 12345'],
  'cases unlink': ['octo cases unlink 123 <RELATION_ID>'],
  'cases note': ['octo cases note 123 --text "Owner investigating"'],
  'cases note-update': [
    'octo cases note-update 123 <NOTE_ID> --text "Fix verified"',
  ],
  'cases groups': ['octo cases groups'],
  'cases group-create': [
    'octo cases group-create --name "Production incidents"',
  ],
  'inspection reports': [
    'octo inspection reports -q db --result abnormal -l 1d --page 1 -n 10',
  ],
  'metrics query': [
    'octo metrics query "as_count(sum(http_requests{}))" -l 1h --points 150',
    'octo metrics query "avg(cpu_usage{service=myapp})" -e test -l 2h',
    'octo metrics query "as_count(sum(trace.service.errors{service = leo-exam, entry_type = http, http.status_code = 500}) by (operation, span.name))" -e online -l 30m -o json',
    'octo metrics query "top(as_rate(sum(trace.service.errors{service = leo-exam, entry_type = http, http.status_code = 5*}) by (operation, span.name)), 10, max)" -e online -l 30m -o json',
  ],
  'metrics point': [
    'octo metrics point "as_count(sum(http_requests{}))" --at 1790596560000',
  ],
  'services list': ['octo services list -e online -l 1h'],
  'services entries': ['octo services entries myapp -l 1h'],
  'services topo': [
    'octo services topo myapp -l 1h --entry-span-name <ENTRY_NAME> --entry-span-operation <ENTRY_OPERATION>',
  ],
  llm: [
    'octo llm -q "application.name = myapp" -l 1h -n 20',
    'octo llm --from 1790596500000 --to 1790596800000 --scroll-id <LAST_ID> --scroll-type next --serialized-sort-values <LAST_SORT_VALUES>',
  ],
  'rum list': [
    'octo rum list -e test -q "application.name = myapp AND type = resource" -l 1h -n 20',
  ],
  'rum detail': [
    'octo rum detail <RUM_EVENT_ID> -e test --timestamp 1790596560000',
  ],
  'rum aggregate': [
    'octo rum aggregate -q "type = view" -a "*:count" -g view.name:10 -l 1h',
  ],
  'events list': [
    'octo events list -q "service = myapp AND type = deployment.scale" -l 1d',
  ],
  'events aggregate': ['octo events aggregate -a "*:count" -g type:10 -l 1d'],
  'event-subscriptions list': [
    'octo event-subscriptions list -e online --status ENABLED --page 1 --page-size 20',
  ],
  'event-subscriptions detail': ['octo event-subscriptions detail 123'],
  'event-subscriptions create': [
    'octo event-subscriptions create --file subscription.json',
  ],
  'event-subscriptions update': [
    'octo event-subscriptions update 123 --file subscription.json',
  ],
  'event-subscriptions enable': ['octo event-subscriptions enable 123'],
  'event-subscriptions disable': ['octo event-subscriptions disable 123'],
  'event-subscriptions delete': ['octo event-subscriptions delete 123'],
  'event-webhooks list': [
    'octo event-webhooks list --request-format DEFAULT --page 1 --page-size 20',
  ],
  'event-webhooks detail': ['octo event-webhooks detail 123'],
  'event-webhooks create': ['octo event-webhooks create --file webhook.json'],
  'event-webhooks update': [
    'octo event-webhooks update 123 --file webhook.json',
  ],
  'event-webhooks test': ['octo event-webhooks test --file webhook.json'],
  'event-webhooks delete': ['octo event-webhooks delete 123'],
  users: ['octo users alice bob'],
};

function commandKey(command: Command): string {
  const parts: string[] = [];
  for (let current = command; current.parent; current = current.parent)
    parts.unshift(current.name());
  return parts.join(' ');
}

const searchNotes = `Search syntax (not Lucene): field = value, !=, in (...), AND/OR/NOT.
  Analysis fields also support numeric comparisons: >, >=, <, <=.
  Fields/values are case-sensitive. Operators are case-insensitive.
  Wildcards work in field filters: service = web*. Full-text matching is
  tokenized, not substring/prefix matching; quoted text does not bypass
  tokenization. For zero hits, check a known matching query in the same window.
  attributes.* is a response path; use query field names such as status/path.
  Trace correlation uses trace_id in queries (traceId in returned records).`;

const aggregationNotes = `Aggregation:
  Repeat -a and -g for multiple operations/dimensions. Default: -a "*:count".
  Group limit defaults to 10; each limit and the product of all limits <= 1000.
  Groups sort descending by the FIRST -a operation. fields:{} is the total row.
  Only analysis fields support group-by. Field availability varies by source
  and index; a field catalog entry alone does not prove it is groupable.
  Probe -g <field>:2 on known matching data and inspect the returned fields.
  count works for all fields; count_distinct for dimensions; numeric fields
  support sum/avg/max/min/p50/p95/p99. A wrong type/operation can return -210;
  grouping a metric field can return -222. Missing groups produce a warning.`;

const logGroupableFields = `Groupable log fields:
  Reserved string dimensions support group-by: service, level, host, source,
  k8s.pod.name, trace_id, user.ip. Records must contain the field to form groups.
  Common dimensions (availability/type varies by source and index):
    Kubernetes: k8s.node.name, k8s.container.name, pod_name, node_hostname.
    Deployment/logging: deployment, canary, log_type.
    HTTP: status_code, sc, url, method, _jakarta.servlet.error.request_uri.
    Client/user: platform, version, user_id.
  These examples are a starting point, not a complete field catalog. Confirm
  on matching data with -g <field>:2; missing fields can produce empty groups.
  Metric fields (long/double, e.g. duration) cannot be grouped (-222); a numeric
  name such as status_code is groupable only when indexed as a string dimension.`;

const httpErrorLogNotes = `HTTP 500/5xx triage (services emitting servlet HTTP error logs, e.g. leo-exam):
  log_type = http selects HTTP log records; their log level can vary.
  sc = 500 selects HTTP 500; sc >= 500 AND sc <= 599 covers all 5xx.
  _jakarta.servlet.error.request_uri is the original failed request URI in these
  error logs. Preserve the leading underscore and dots in filters and -g.
  Use -g "_jakarta.servlet.error.request_uri:10" -a "*:count" to locate Top 10
  URIs by count over the query window, descending. fields:{} is the total row;
  Top 10 group counts need not sum to the total. The URI field must be emitted
  and groupable in that source/index; some HTTP errors may lack it.
  Inspect a selected URI with logs search using the same env/--from/--to and
  HTTP filter, plus _jakarta.servlet.error.request_uri = "/selected/path".
  Use bracket lookup in jq: .fields["_jakarta.servlet.error.request_uri"].`;

const metricGroupingNotes = `Grouping rule: by (labels) is a SUFFIX of a SPACE AGGREGATION.
  Put it immediately after that aggregate's closing parenthesis. Supported:
  sum/avg/min/max/count/count_values/p50/p95/p99/p999/p9999/p99.9.
  Each by belongs to its preceding aggregate, including nested aggregates.
  as_rate/as_count/top/moving_rollup/default and arithmetic wrap the WHOLE
  "aggregate + by" expression; these wrappers do not own a by suffix.
  Typical time rollup: sum(rollup(m{}, default, 1m)) by (service).
  rollup/advanced_rollup do not own by either; keep by on the space aggregate
  whether the time function is inside it or wraps an already grouped result.
  VALID:
    sum(m{}) by (service)
    as_rate(sum(m{}) by (service))
    as_count(sum(rollup(m{}, default, 1m)) by (service))
    as_rate(sum(advanced_rollup(m{}, default, 1m, auto)) by (service))
    as_rate(count_values(h{}) by (destKey))
    top(sum(m{}) by (span.name), 10, max)
    top((p99(h{}) by (service) * 1000), 5, max)
    moving_rollup(sum(m{}) by (service), sum, 5m)
    default(sum(m{}) by (service), 0)
    (p99(h{}) by (service)) * 1000
  INVALID:
    as_rate(sum(m{})) by (service)           -- by is outside as_rate
    as_rate(sum(m{} by (service)))           -- by is inside sum's argument
    as_rate(sum(m{tag = value by (service)})) -- by is inside the tag filter
    moving_rollup(sum(m{}), sum, 5m) by (service) -- by is on a time function
  If the backend reports a by syntax error (-201), the CLI adds a targeted hint
  for these recognized forms. The original error/status/code and nonzero exit
  remain; queries are never automatically rewritten. JSON errors carry hints.`;

const metricRecipeNotes = `Metric recipes (replace service/database/cluster/container labels for your deployment):
  Pass ONE complete QL as a quoted positional argument; for example:
    octo metrics query '<QL below>' -e online -l 30m -o json > metrics.json
  All recipes use METRIC storage, including trace.* metrics. Raw Span retention
  (often 7 days) does not apply to these series; confirm the metric/source's
  retention policy. Metric names and labels require the corresponding collection.

  1. Service QPS: explicit 1m buckets, or backend-selected resolution.
    as_rate(sum(rollup(trace.service.requests{service = "leo-exam"}, default, 1m)))
    as_rate(sum(trace.service.requests{service = "leo-exam"}))
    Timeseries resolution has a 10s minimum; automatic resolution may be coarser
    depending on the query window/--points. Short windows do not guarantee 10s.

  2. Service entry latency (Trace duration metrics: ms; / 1000 converts to seconds).
    p95(trace.service.duration{service = "leo-exam"})
    p99(trace.service.duration{service = "leo-exam"}) by (span.name)

  3. Downstream latency by dependency type/service (Trace duration: ms).
    p99(trace.exit.duration{service = "leo-exam"}) by (downstream.entry_type, downstream.service)
    p99(trace.exit.duration{service = "leo-exam", downstream.entry_type = cache}) by (downstream.service)

  4. Per-Pod CPU: CPU seconds/second = cores used, not utilization by itself.
    as_rate(sum(container.cpu.time{service = "leo-exam", k8s.container.name = http-server, state IN (user, system)}) by (k8s.pod.name))
    max(k8s.pod.container.cpu.limit{container = http-server, service = "leo-exam"}) by (k8s.pod.name)
    Utilization = cores used / CPU limit; multiply by 100 for percent. You can
    divide these TWO COMPLETE expressions in one QL, or fetch both queries and
    divide locally after matching Pod labels/timestamps. Check missing/zero limits.
    Panel aliases A/B are not available as CLI formula queries.

  5. Redis client latency (seconds) and per-minute errors.
    p99(infra_commons_kv_request_duration_seconds{service = "leo-exam"}) by (clusterName)
    as_count(sum(rollup(infra_commons_kv_request_errors_total{service = "leo-exam"}, default, 1m)) by (service.instance.id, clusterName))
    Multiply latency by 1000 for ms; clusterName is the client dbKey in this setup.

  6. RPC client QPS (Histogram observation count) and per-minute errors.
    as_rate(count_values(infra_rpc_client_request_duration_seconds{service = "leo-exam"}) by (destKey))
    as_count(sum(rollup(infra_rpc_client_request_errors_total{service = "leo-exam"}, default, 1m)) by (key))

  7. MySQL QPS and average latency (seconds; verify the actual database label).
    as_rate(count_values(infra_mysql_request_duration_seconds{database = "leo-exam"}) by (table, destKey, key))
    avg(infra_mysql_request_duration_seconds{database = "leo-exam"}) by (table)
    An empty result does not verify that the metric exists or the database label
    matches; inspect its alert/panel QL and collection before using this recipe.

  8. Pool load / active threads by pool and Pod (interpret each metric's units).
    sum(fenbi_actuator_object_pool_load_count{service = "leo-exam"}) by (name, k8s.pod.name)
    avg(fenbi_actuator_thread_pool_active_count{service = "leo-exam"}) by (name, k8s.pod.name)

  9. Redis server QPS, memory bytes, blocked clients, and slowlog increment.
    as_rate(sum(rollup(redis_commands_processed_total{cluster = "leo-exam-new-redis-online"}, default, 1m)) by (service.instance.id))
    sum(redis_memory_used_bytes{cluster = "leo-exam-new-redis-online"}) by (service.instance.id)
    sum(redis_blocked_clients{cluster = "leo-exam-new-redis-online"}) by (service.instance.id)
    max(increase(redis_slowlog_length{cluster = "leo-exam-new-redis-online"}, 1m, 1m)) by (service.instance.id)

Labels and naming pitfalls:
  In the leo-exam KV setup, clusterName is a dbKey such as
  leo-exam-store-2-redis-online; Redis exporter cluster uses a resource name such
  as leo-exam-new-redis-online. Confirm labels; these identifiers are not interchangeable.
  service.instance.id may name an exporter endpoint (:9121), not the Redis data
  endpoint (:6379). DBPaaS instance/cluster names and Trace Redis:<dbKey> names
  can differ; correlate through resource metadata, not a port/name substitution.
  N/A labels vary by collection. Do not use status=N/A on trace.service.requests
  to count errors; use trace.service.errors (HTTP: http.status_code) or source
  error counters/logs. Inspect actual labels before grouping by Pod/host/instance:
  some Trace metrics HAVE Pod labels; container/fenbi_actuator metrics also do.
  Empty series can mean a wrong name, labels, env, window, or missing collection.
  All-zero series (e.g. redis_instantaneous_ops_per_sec in some setups) alone
  prove neither collector completeness nor collection failure; cross-check its
  source and a companion counter such as redis_commands_processed_total.
  Tag filters support =, !=, IN (...), and * wildcards; =~ is unsupported.

Metric discovery (no metrics names command yet):
  Reuse QL from a metric alert or a dashboard panel; verify metric names, labels,
  units, and env rather than guessing. Inspect metricQl in alert detail/rule detail:
    octo alerts detail <ALERT_ID> -o json > alert.json
    jq -r '.. | objects | .metricQl? // empty' alert.json
    octo alerts rule-details --ids <RULE_ID> -o json
  Dashboard panel query/configuration is another source; substitute template
  variables with actual labels. Dashboard reading is not exposed by this CLI;
  use the Web UI or its separately authenticated dashboard/get API.
  These are discovery clues, not a complete/current metric catalog. Keep a fixed
  env/time window and confirm returned labels/data before trusting a copied QL.`;

const metricQlNotes = `Metric QL differs from search syntax: wrap metric{tags} in an aggregation.
  Multiple queries are labeled A/B/C. --points is a target count; the backend
  may adjust it. Day aggregations align to UTC+8; timestamps are not shifted.

Metric QL (common):
  Space aggregation: sum(m{tags}), avg(...), min(...), max(...), count(...).
  Histogram percentiles: p50/p95/p99/p999/p9999/p99.9(m{tags}).
  Group: sum(m{service = *}) by (service, clusterName).

${metricGroupingNotes}

  Tag filters: tag = value, tag != value, tag = * (wildcard), tag in (a,b).
  Commas between filters mean AND: m{service = api, env != test}.
  PromQL's =~ operator is not supported.
  On syntax failure, tag =~ "regex" gets a targeted hint: use =, IN (...), or
  = with * wildcards. Regex/glob semantics differ; no automatic conversion.
  Time functions (fn: sum/avg/min/max; rollup/advanced_rollup also accept default):
    rollup(m, fn, interval): e.g. sum(rollup(counter{}, sum, 1m)).
    advanced_rollup(m, fn, window, granularity): both time arguments required;
      e.g. sum(advanced_rollup(counter{}, sum, 5m, 1m)).
    moving_rollup(expr, fn, window): apply after space aggregation;
      e.g. moving_rollup(sum(counter{}), sum, 5m).
    increase(expr, window, granularity): e.g. max(increase(gauge{}, 5m, 1m)).
      Direct rate/increase on a RAW metric requires Gauge; Count returns -211.
      Applying increase after aggregation/rollup is a different operation and
      can accept a derived series; use as_rate/as_count for Count conversion.
    Time arguments accept 30s/1m/1h/1d/1w or auto (backend-selected interval).
  Count conversion: as_rate(sum(counter{})) (per second),
    as_count(sum(counter{})) (count per interval). Use for Count metrics;
    for Histograms, first count_values(histogram{}) to count observations.
    Grouped rate: as_rate(sum(counter{}) by (service)).
    Grouped minute count: as_count(sum(rollup(counter{}, default, 1m)) by (service)).
    Grouped Histogram QPS: as_rate(count_values(histogram{}) by (destKey)).
  default(expr, v) fills missing values; e.g. default(sum(m{}), 0).
  top(expr, N, agg) selects N series; agg is avg/max/min/last;
    e.g. top(sum(m{}) by (service), 10, max).
  Arithmetic within one expression: sum(a{}) / 2, p99(histogram{}) * 1000.
  Two complete metric expressions can also be combined when group labels are
  compatible. Panel query aliases A/B (e.g. A / B) are not exposed by this CLI;
  inline the complete expressions or fetch components and combine locally.

HTTP 500/5xx by endpoint (Trace/APM metrics):
  trace.service.errors is a Count metric; filter entry_type = http and
  http.status_code = 500 (exact) or http.status_code = 5* (all 5xx).
  Group by (operation, span.name); span.name is the instrumented endpoint name,
  often a route template, rather than the raw servlet error URI.
  as_count(...) gives errors per time bucket; as_rate(...) gives errors/second.
  top(expr, 10, max) ranks peak bucket counts/rates, not whole-window totals.
  These metrics require Trace/APM collection. log_type and the servlet URI field
  are log fields, not built-in metric tags. Counts can differ from logs because
  collection/error classification and metric bucket boundaries differ.
  For raw-URI counts over the log query window, use logs aggregate --help.

${metricRecipeNotes}

Grouped response (-o json): [{id, labelList, times, values}, ...].
  labelList is a TWO-LEVEL array: labelList[i] is [{key,value}, ...] for series i;
  values[i] is that series' samples, with values[i][j] at times[j] (epoch ms).
  Ungrouped series may have an empty labelList. Match series by index; do not
  flatten labelList/values together or assume the first label is the only one.
  Save to metrics.json, then emit one TSV row per series: query id, all labels,
  and maximum non-null sample (empty if there are no non-null samples):
    jq -r '.[] as $q | range(0; $q.values | length) as $i |
      [$q.id, (($q.labelList[$i] // []) | map(.key + "=" + .value) | join(",")),
       ($q.values[$i] | map(select(. != null)) | max)] | @tsv' metrics.json`;

function leafNotes(command: Command, key: string): string[] {
  const options = new Set(command.options.map((option) => option.long));
  const notes: string[] = [];
  if (options.has('--last')) {
    const last = command.options.find(
      (option) => option.long === '--last'
    )?.defaultValue;
    notes.push(`Time: ${key === 'inspection reports' ? 'no time filter unless specified' : `last ${last ?? '15m'} by default`}. Durations: 30s, 15m, 1h, 2d, 1w.
  --from/--to accept 13-digit epoch ms, 10-digit epoch seconds, or ISO dates.
  --from overrides --last; omitted --to means now. --to requires --from.
  Use an explicit timezone (Z or +08:00); dates without it use local time.`);
  }
  if (options.has('--output'))
    notes.push(`Output: json preserves the complete API response, including pagination metadata.
  jsonl emits one record per line; table shows record columns. Page envelopes
  (logs/spanItems/rumItems/eventItems/issues/list) are unpacked for jsonl/table.
  Pagination warnings go to stderr. Use -o json when you need hasMore/cursors.`);
  if (options.has('--query') && key !== 'inspection reports')
    notes.push(searchNotes);
  if (options.has('--agg')) notes.push(aggregationNotes);
  if (key === 'logs aggregate')
    notes.push(logGroupableFields, httpErrorLogNotes);
  if (options.has('--scroll-id'))
    notes.push(`Pagination: one page per invocation; hasMore=true means results are incomplete.
  Keep env, query, order/sort, and an absolute --from/--to window unchanged.
  --scroll-id is the boundary record's id, NOT serializedSortValues.
  ${key === 'logs search' || key === 'trace search' ? 'Use the last record id to continue forward; traceId/spanId are not cursors.' : 'For next use the last record; for pre use the first record. Pass its\n  serializedSortValues separately when continuing a sorted query.'}`);
  if (key === 'logs search' || key === 'trace search')
    notes.push(
      'The API documents serializedSortValues alongside scrollId. Preserve the returned\n  opaque value and pass it as --serialized-sort-values when continuing; never\n  substitute it for the record id. --serialized-sort-values requires --scroll-id.'
    );
  if (options.has('--cursor-file'))
    notes.push(`Cursor file: --cursor-file <path> atomically replaces a single-line JSON file
  after a successful page, for json/jsonl/table; stdout keeps its normal format.
  {"hasMore":true,"count":N,"scrollId":"...","serializedSortValues":"..."}
  Terminal pages write {"hasMore":false,"count":N}, clearing the previous cursor.
  Missing hasMore/lastPage means hasMore:null (e.g. RUM); never infer from size.
  Unknown nonempty pages include a boundary; unknown empty pages have no cursor.
  Sort values are optional and remain opaque, from the same record as scrollId.
  For next use the last record; for pre use the first (logs/Trace use the last).
  HTTP/API/file-write failures exit nonzero and leave the previous file untouched.
  Read only after exit 0. Parent directory must exist. No automatic file reading.
  Continue with identical env/query/from/to/order/sort/scroll-type, using an
  absolute time window. Pass optional cursor values only when present/nonempty:
  jq -r '.scrollId // empty' /tmp/logs.cursor
  jq -r '.serializedSortValues // empty' /tmp/logs.cursor
  Use one file per query stream and per concurrent worker; sharing a file
  between concurrent writers is unsafe — the atomic replace prevents torn
  reads, not lost updates. A stale file only means retry material; always
  gate on exit 0.`);
  if (key === 'trace search')
    notes.push('--order sorts by span END time (asc/desc), not start time.');
  if (options.has('--sort-operation'))
    notes.push(
      'Documented sort operationEnum values: none, count, sum, max, min, avg,\n  count_distinct, p10, p25, p50, p75, p80, p90, p95, p99, p999, p9999, heatmap,\n  percentile. Custom percentile also requires percentile/percentileValue API\n  fields, which this CLI does not expose; use a named percentile such as p95.'
    );
  if (key === 'issues search' || key === 'issues detail')
    notes.push(
      'Issue source: --source log (backend default) or rum. Use rum for RUM Issues;\n  this source is independent of the environment.'
    );
  if (key === 'issues search')
    notes.push(
      'API limitation: Issue search returns at most 99 Issues and has no page/limit/scroll\n  parameters. hasMore=true indicates truncation, not an available next-page cursor.\n  Narrow the service/query/time window; this CLI cannot guarantee an exhaustive\n  Issue list. Use --status all to include all states.'
    );
  if (key === 'rum detail')
    notes.push(
      'Required: --timestamp must be the event timestamp returned by rum list.\n  Accepts 13-digit epoch ms, 10-digit epoch seconds, or ISO time. The backend\n  searches within one hour on either side of it; using now can miss old events.\n  Use the same environment as rum list. The record id alone is insufficient.'
    );
  if (
    key === 'alerts search' ||
    key === 'alerts rules' ||
    key === 'event-subscriptions list'
  )
    notes.push(
      'Environment: omitting --env queries all environments; no configured default is applied.'
    );
  if (key.startsWith('events '))
    notes.push(
      'Change-event types include deployment.start, deployment.success, deployment.failure,\n  deployment.scale, config.change, k8s.pod.change, k8s.node.change.\n  type = deployment does not include deployment.scale; use an explicit type or deployment*.'
    );
  if (key === 'metrics query') notes.push(metricQlNotes);
  if (key === 'metrics point')
    notes.push(
      `--at accepts epoch milliseconds, epoch seconds, or ISO timestamps; default: now.
  Metric QL functions/recipes/discovery: octo metrics query --help.

${metricGroupingNotes}`
    );
  if (['alerts silence', 'alerts unsilence'].includes(key))
    notes.push(
      'Silence suppresses notifications for a firing alert; it does not stop rule evaluation.'
    );
  if (['alerts disable', 'alerts disables', 'alerts enable'].includes(key))
    notes.push(
      'Disable records stop rule evaluation during a scheduled time window.\n  alerts enable deletes a DISABLE RECORD by its id; it does not activate a rule.'
    );
  if (key === 'alerts create')
    notes.push(
      '--file contains a JSON array of rule objects; all rule fields pass through to the API.'
    );
  if (key === 'issues update')
    notes.push(
      'Ignore-rule arguments require --status ignored. TIME requires --ignore-end-time;\n  APPEAR_COUNT requires --appear-count; USER_COUNT requires --user-count and,\n  for source=log, --user-field. Windows use --start-timestamp and --time-window-ms.'
    );
  if (key === 'issues merge')
    notes.push(
      'Requires at least two distinct Issue IDs; returns the canonical merge Issue ID.'
    );
  if (key === 'issues unmerge')
    notes.push(
      'The backend may dissolve a merge Issue when fewer than two children remain.'
    );
  if (key === 'login')
    notes.push(
      'PAT is saved in ~/.octo-cli/config.json. --skip-skill configures the standalone\n  CLI without installing agent skills. Otherwise login installs the skill globally.'
    );
  if (key === 'init')
    notes.push(
      'Creates a project context template and installs the agent skill for the project.\n  CLI queries do not require init.'
    );
  if (key === 'event-subscriptions create')
    notes.push(
      'JSON object: name, environment (online/test), filter, webhookId; optional description.\n  New subscriptions are DISABLED; enable explicitly after checking the configuration.'
    );
  if (key === 'event-subscriptions update')
    notes.push(
      'JSON object: name, filter, webhookId; optional description. Environment is immutable.'
    );
  if (key.startsWith('event-webhooks ') && options.has('--file'))
    notes.push(
      'JSON object: name, url, requestFormat (DEFAULT/CUSTOM); optional headers/bodyTemplate.\n  CUSTOM requires a bodyTemplate. The test command sends a real HTTP request to url.'
    );
  return notes;
}

/** Help lives with the CLI and never needs authentication or a skill install. */
export function configureCommandHelp(program: Command): void {
  function visit(command: Command): void {
    const key = commandKey(command);
    if (key === 'metrics query' || key === 'metrics point')
      command.registeredArguments[0].description =
        'Metric QL expressions (e.g. "as_count(sum(http_requests{}))")';
    const apiReference = apiPages[key.split(' ')[0]]
      ? `https://octopus-docs.zhenguanyu.com/${apiPages[key.split(' ')[0]]}`
      : openApi;
    if (!installed.has(command)) {
      installed.add(command);
      for (const option of command.options) {
        if (option.long === '--env') {
          option.description =
            key === 'login'
              ? 'Default environment: online or test (omit to preserve saved value)'
              : key === 'alerts rules'
                ? 'Environments: online,test (comma-separated; omit for all)'
                : ['alerts search', 'event-subscriptions list'].includes(key)
                  ? 'Environment: online or test (omit for all)'
                  : 'Environment: online or test (default: OCTOPUS_ENV, config.env, then online)';
        }
        if (option.long === '--priority' && key.startsWith('alerts '))
          option.description =
            'Priorities: UNKNOWN,P0,P1,P2 (comma-separated; omit for all)';
        if (option.long === '--url' && key === 'login')
          option.description =
            'OpenAPI base URL (omit to preserve saved value)';
        if (option.long === '--output')
          option.description =
            'Output: json (complete response), jsonl (records), table (record columns)';
        if (option.long === '--from')
          option.description =
            'Start time: epoch ms, epoch seconds, or ISO; overrides --last';
        if (option.long === '--to')
          option.description =
            'End time: epoch ms, epoch seconds, or ISO; requires --from (default: now)';
        if (option.long === '--at')
          option.description =
            'Point time: epoch ms, epoch seconds, or ISO (default: now)';
        if (option.long === '--scroll-id' && key === 'logs search')
          option.description =
            'Last log id from previous page, not serializedSortValues';
        if (
          option.long === '--limit' &&
          ['logs search', 'trace search'].includes(key)
        )
          option.description = 'Records per page (1-500)';
      }
      command.addHelpText('after', () => {
        if (!command.parent)
          return `\nQuick start (standalone CLI):
  octo login --token <PAT> --skip-skill
  octo logs search -q "service = myapp AND level = ERROR" -l 15m
  octo logs search --help

Use octo <group> --help to discover tasks and <group> <command> --help for
options, defaults, examples, query semantics, and pagination instructions.
No skill installation or project init is required for CLI queries.
Auth: OCTOPUS_TOKEN overrides ~/.octo-cli/config.json token.
Config: OCTOPUS_BASE_URL overrides config.base_url; default:
  https://octopus-app.zhenguanyu.com
OCTOPUS_ENV overrides config.env (online/test); fallback: online.
OCTOPUS_EXTRA_HEADERS accepts a JSON object of additional HTTP headers.
Failures: exit code 1, concise stderr, no stack trace. --json-errors emits
{error:{message,status?,code?,hints?}} to stderr; stdout remains available for data.
HTTP failures and nonzero API codes are errors. No automatic retries;
rate limits (HTTP 429/code -17) require caller backoff. Successful empty
responses cannot reveal backend failures masked by the server.
Full manual: ${manual}
OpenAPI: ${openApi}`;
        if (command.commands.length) {
          const details = command.commands.map((child) => {
            const relevant = child.options.filter((option) =>
              [
                '--last',
                '--limit',
                '--page',
                '--page-size',
                '--points',
                '--status',
                '--env',
              ].includes(option.long ?? '')
            );
            return `  octo ${commandKey(child)}: ${child.description()}\n    ${relevant.map((option) => `${option.flags}${option.defaultValue === undefined ? '' : ` (default: ${option.defaultValue})`}`).join('; ') || 'See command help for arguments/options.'}`;
          });
          const groupExamples = command.commands
            .flatMap((child) => examples[commandKey(child)]?.slice(0, 1) ?? [])
            .slice(0, 3);
          return `\nTasks and common options (pass options AFTER the subcommand):\n${details.join('\n')}\n\nExamples:\n${groupExamples.map((example) => `  ${example}`).join('\n')}\n\nUse octo ${key} <command> --help for value domains and query/pagination semantics.${key === 'events' ? '\nBare octo events defaults to events list; octo events list --help shows all query flags.' : ''}\nFull manual: ${manual}\nOpenAPI: ${apiReference}`;
        }
        return `\n${leafNotes(command, key).join('\n\n')}\n\nExamples:\n${(examples[key] ?? []).map((example) => `  ${example}`).join('\n')}\n\nFailures: exit code 1; use octo --json-errors ${key} ... for JSON errors on stderr.\nFull manual: ${manual}\nOpenAPI: ${apiReference}`;
      });
    }
    for (const child of command.commands) visit(child);
  }
  visit(program);
}
