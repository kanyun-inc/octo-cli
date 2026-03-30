---
name: octo
description: Query Octopus observability platform — logs, alerts, traces, metrics, issues, services, LLM, RUM, events. Triggers on "logs", "alerts", "traces", "metrics", "octopus", "observability", "error tracking", "RUM", "LLM observability"
version: 0.2.0
author: kris
tags:
  - octopus
  - observability
  - logs
  - alerts
  - traces
  - metrics
user-invocable: true
argument-hint: "logs search -q 'level = ERROR' | alerts search -s firing | trace search"
allowed-tools: Bash(*)
---

# Octopus CLI — Query Observability Data

CLI tool `octo-cli` for querying the Octopus observability platform (octopus.zhenguanyu.com). Covers logs, alerts, error tracking, traces, metrics, services, LLM, RUM, and events.

## Project Context Discovery

Before querying, check if this project has observability context:

```bash
cat .claude/rules/octopus-observability.md 2>/dev/null || cat .cursor/rules/octopus-observability.md 2>/dev/null || echo "NO_CONTEXT"
```

- **Has content with actual service names**: use those service names in queries
- **Has template placeholders (<!-- AGENT: -->)**: bootstrap it now (see Bootstrap workflow below)
- **NO_CONTEXT**: run `npx octo-cli init` first, then bootstrap

### Bootstrap Workflow (filling in observability context)

When the context file has placeholders, follow this sequence:

```bash
# 1. Identify project type and find service names from code
#    Scan: package.json, pom.xml, docker-compose, k8s manifests,
#    application.yml (spring.application.name), env vars,
#    @octopus-sdk/browser-rum init (applicationName)

# 2. Verify services exist in Octopus
npx octo-cli services list -e online -l 1d
npx octo-cli services list -e test -l 1d

# 3. For each confirmed service, query the LIVE topology — this is the
#    most reliable way to discover dependencies (what actually runs in prod)
npx octo-cli services topo <SERVICE> -e online -l 1d

# 4. Query entry points to understand how traffic flows in
npx octo-cli services entries <SERVICE> -e online -l 1d

# 5. Sample traces to see downstream calls, DB systems, caches, MQ
npx octo-cli trace search -q "service = <SERVICE>" -e online -l 1h -n 10

# 6. Check if RUM data exists (for frontend services)
npx octo-cli rum list -q "application.name = <SERVICE>" -e online -l 1d -n 1

# 7. Check error tracking issues for each service
npx octo-cli issues search -q "service = <SERVICE>" --status unresolved -l 7d
```

Write all findings into the context file, replacing `<!-- AGENT: -->` sections.
The topology and entry points are especially valuable — they enable precise
cross-service debugging in future conversations.

## Auth Check

Before first use:

```bash
cat ~/.octo-cli/config.json 2>/dev/null || echo "NOT CONFIGURED"
```

- **Has app_id/app_secret**: proceed
- **NOT CONFIGURED**: tell the user to get an ApplicationKey from the Octopus platform, then run:

```bash
npx octo-cli login --app-id <APP_ID> --app-secret <APP_SECRET>
```

Or set environment variables: `OCTOPUS_APP_ID`, `OCTOPUS_APP_SECRET`.

## Query Syntax

All `-q/--query` options use Octopus search syntax:

### Field Search

```
field = value           # equals (case-sensitive)
field != value          # not equals
field > 100             # greater than (analysis fields only)
field >= 100            # greater or equal
field < 100             # less than
field <= 100            # less or equal
field in (a, b, c)     # in list
field not in (a, b)    # not in list
field = web*            # wildcard match (case-sensitive)
```

### Full-text Search

```
keyword                 # contains keyword (case-sensitive)
"exact phrase"          # exact phrase match
```

### Logical Operators

```
service = myapp AND level = ERROR       # AND (default in basic mode)
level = ERROR OR level = WARN           # OR
NOT "timeout"                           # NOT
(level = ERROR OR level = WARN) AND service = myapp   # parentheses
```

Priority: NOT > AND > OR. Operators are case-insensitive.

### Reserved Fields

| Field | Description |
|-------|-------------|
| `env` | Environment: online, test |
| `service` | Service name |
| `host` | Server hostname |
| `level` | Log level: FATAL, ERROR, WARN, INFO, DEBUG, TRACE |
| `trace_id` | Trace ID for correlation |
| `issue_id` | Error tracking issue ID |
| `k8s.pod.name` | Kubernetes pod name |
| `source` | Log source (nginx, docker, python, etc.) |

## Commands

### Time Range Options (all query commands)

```
-l, --last <duration>    # Relative: 15m, 1h, 2d, 1w
--from <time>            # Absolute: epoch ms or ISO string
--to <time>              # Absolute: epoch ms or ISO string
-e, --env <env>          # Environment: online (default), test
-o, --output <fmt>       # Output: json (default), table, jsonl
```

### Logs

```bash
# Search logs
npx octo-cli logs search -q "level = ERROR" -l 15m
npx octo-cli logs search -q "service = myapp AND level = ERROR" -l 1h -n 100
npx octo-cli logs search -q "service = myapp" -e test --last 30m

# Aggregate logs (count, group by)
npx octo-cli logs aggregate -q "level = ERROR" -g service -l 1h
npx octo-cli logs aggregate -q "level = ERROR" -g service:10 -a "*:count"
npx octo-cli logs aggregate -g level -l 30m
```

### Alerts

```bash
# Search alerts
npx octo-cli alerts search -s firing -l 1h                    # firing alerts
npx octo-cli alerts search -s firing -p P0,P1 -l 6h           # P0/P1 only
npx octo-cli alerts search --service myapp -s all -l 1d        # by service

# Alert rules
npx octo-cli alerts rules --group-id -1                        # all rules
npx octo-cli alerts rules --search "error" --page 1 --page-size 10

# Silence
npx octo-cli alerts silence --rule-id 123 --alert-id 456 --duration 2h
```

### Error Tracking (Issues)

```bash
# Search issues
npx octo-cli issues search --status unresolved -l 1h
npx octo-cli issues search --status all --sort logCount -l 1d
npx octo-cli issues search -q "service = myapp" --status unresolved

# Detail
npx octo-cli issues detail <issueId>

# Manage
npx octo-cli issues assign --user 123 --ids id1,id2
npx octo-cli issues update --ids id1,id2 -s resolved
```

### Traces

```bash
# Search spans
npx octo-cli trace search -q "service = myapp" -l 15m
npx octo-cli trace search -q "status = error" -l 1h -n 100

# Aggregate spans
npx octo-cli trace aggregate -a "duration:p95" -g service -l 1h
npx octo-cli trace aggregate -a "*:count" -g "name" -l 30m
```

### Metrics

```bash
# Timeseries query
npx octo-cli metrics query "sum(http_requests{service=myapp}.as_count)" -l 1h
npx octo-cli metrics query "avg(cpu_usage{service=myapp})" --points 50 -l 2h

# Single point value
npx octo-cli metrics point "sum(error_count{service=myapp}.as_count)"
```

### Services / APM

```bash
npx octo-cli services list -l 1h                       # active services
npx octo-cli services entries myapp -l 1h               # entry points
npx octo-cli services topo myapp -l 1h                  # topology graph
```

### LLM Observability

```bash
npx octo-cli llm -l 1h                                        # all LLM spans
npx octo-cli llm -q "model.name = gpt-4" -l 1d                # by model
npx octo-cli llm -q "application.name = myapp" -l 1h -n 50    # by app
```

### RUM (Real User Monitoring)

```bash
npx octo-cli rum list -e test -q "application.name = rush-app AND type = session" -l 1d
npx octo-cli rum list -q "type = error" -l 1h
npx octo-cli rum detail <id>
```

### Events

```bash
npx octo-cli events -l 1d                              # recent events
npx octo-cli events -q "type = deployment" -l 7d       # deployments
```

### Users

```bash
npx octo-cli users alice bob                            # search by name
```

## Typical Workflows

### Investigate an Error

```bash
# 1. Find firing alerts
npx octo-cli alerts search -s firing -p P0,P1

# 2. Search ERROR logs for the affected service
npx octo-cli logs search -q "service = affected-service AND level = ERROR" -l 30m

# 3. Check error tracking issues
npx octo-cli issues search -q "service = affected-service" --status unresolved

# 4. Find error traces — these show the FULL call chain across services
npx octo-cli trace search -q "service = affected-service AND status = error" -l 30m

# 5. If a trace has a trace_id, search logs across ALL services in that trace
npx octo-cli logs search -q "trace_id = <TRACE_ID>" -l 1h

# 6. Check service topology to understand blast radius
npx octo-cli services topo affected-service -l 1h
```

### Cross-Service Debugging (Trace-Driven)

```bash
# Start from a trace_id (from logs, alerts, or user reports)
# 1. Find all spans in this trace across all services
npx octo-cli trace search -q "trace_id = <TRACE_ID>" -l 1d -n 100

# 2. Search logs from ALL services involved in this trace
npx octo-cli logs search -q "trace_id = <TRACE_ID>" -l 1d

# 3. If the root cause is in a downstream service, check its topology
npx octo-cli services topo downstream-service -l 1h

# 4. Check if the downstream has its own error patterns
npx octo-cli issues search -q "service = downstream-service" --status unresolved
```

### Map Service Dependencies

```bash
# 1. Get the full topology graph
npx octo-cli services topo myapp -e online -l 1d

# 2. List entry points (HTTP routes, RPC methods, MQ consumers)
npx octo-cli services entries myapp -e online -l 1d

# 3. Sample recent traces to see call patterns and latency
npx octo-cli trace search -q "service = myapp" -l 1h -n 20

# 4. Check P95 latency per entry point
npx octo-cli trace aggregate -a "duration:p95" -g name -q "service = myapp" -l 1h
```

### Understand Service Health

```bash
# 1. Error rate by service
npx octo-cli logs aggregate -q "level = ERROR" -g service:10 -l 1h

# 2. P95 latency by service
npx octo-cli trace aggregate -a "duration:p95" -g service -l 1h

# 3. Service topology
npx octo-cli services topo myapp -l 1h

# 4. Recent deployments (may correlate with issues)
npx octo-cli events -q "service = myapp" -l 1d
```

### Monitor LLM Usage

```bash
# 1. List recent LLM calls
npx octo-cli llm -l 1h -n 20

# 2. Filter by model
npx octo-cli llm -q "model.name = claude*" -l 1d
```

## Tips

- Default environment is `online`. Use `-e test` for test environment.
- Default time range is 15 minutes. Always specify `-l` for broader searches.
- Use `-o jsonl` for piping to `jq` or `wc -l`.
- Logs search max 500 per request; use `--scroll-id` from response for pagination.
- Query syntax is case-sensitive for field names and values, case-insensitive for operators.
- Wildcards (`*`) only work in field search, not full-text search.
- Use double quotes for exact phrase matching or special characters in queries.

## Deep-Dive Skills

This repo bundles specialized Octopus skills for deeper domain knowledge. Install individually as needed:

```bash
# Install all at once
npx reskill@latest install github:kanyun-inc/octo-cli/skills/octopus-log-query -a claude-code cursor -y
npx reskill@latest install github:kanyun-inc/octo-cli/skills/octopus-metrics -a claude-code cursor -y
npx reskill@latest install github:kanyun-inc/octo-cli/skills/octopus-rum -a claude-code cursor -y
npx reskill@latest install github:kanyun-inc/octo-cli/skills/octopus-llm-trace -a claude-code cursor -y
npx reskill@latest install github:kanyun-inc/octo-cli/skills/octopus-data-collection -a claude-code cursor -y
npx reskill@latest install github:kanyun-inc/octo-cli/skills/octopus-openapi -a claude-code cursor -y
npx reskill@latest install github:kanyun-inc/octo-cli/skills/octopus-web-sdk-helper -a claude-code cursor -y
```

| Skill | Focus |
|-------|-------|
| `octopus-log-query` | Log search syntax, charting, log-to-metric, tokenization |
| `octopus-metrics` | Metric types (Count/Gauge/Histogram), QL syntax, as_count/as_rate, expressions |
| `octopus-rum` | RUM concepts (Session/View/Action/Error), Web SDK, Core Web Vitals |
| `octopus-llm-trace` | LLM Trace SDK (Java/TS/Python), span kinds, cost tracking |
| `octopus-data-collection` | Log/Trace/Metric collection (HTTP, Kafka, javaagent, Node.js, Python) |
| `octopus-openapi` | OpenAPI signing (V1/V2), SDK integration, all HTTP endpoints |
| `octopus-web-sdk-helper` | Web SDK troubleshooting, config guidance, sourcemap upload |
