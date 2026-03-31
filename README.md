<div align="center">

# octo-cli

**Observability for AI Agents — not just tools, but context**

[![npm version](https://img.shields.io/npm/v/octo-cli.svg)](https://www.npmjs.com/package/octo-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## Why

Giving an AI agent a handful of observability tools (search logs, query metrics) and expecting it to debug production issues is like handing someone a telescope and asking them to navigate a city. **The tools work, but the agent has no idea where to point them.**

Observability data is vast and varied — logs, traces, metrics, alerts, RUM, LLM spans, error tracking, service topologies — spread across multiple services, environments, and naming conventions. Without knowing *what services this project runs*, *which environment to query*, *what the upstream/downstream dependencies are*, an agent will either ask you repeatedly or guess wrong.

**octo-cli solves this with a three-layer approach:**

1. **Context first** — `octo init` generates a `.claude/rules/octopus-observability.md` file that the agent fills in by analyzing your codebase and querying live trace data. This becomes the agent's "map" — it knows your services, environments, dependencies, and which queries to run. Every future agent session loads this automatically.

2. **Skills for know-how** — The [octo skill](skills/SKILL.md) teaches agents the Octopus query syntax, investigation workflows (alert → logs → traces → topology), and onboarding procedures. It's the "how to navigate" guide.

3. **CLI + MCP for execution** — `octo-cli` commands and MCP tools are the actual instruments. Flexible, composable, pipe-friendly. The agent picks the right tool because it already has the context and know-how.

**Context + Know-how + Tools.** That's the difference between an agent that can grep logs and one that can actually debug your system.

## Quick Start

```bash
# One command to set up everything:
npx octo-cli login --app-id <YOUR_APP_ID> --app-secret <YOUR_APP_SECRET>
# → saves credentials
# → installs skill globally (all projects, all agents)

# Then in any project, tell your AI agent:
#   "帮我接入 Octopus 可观测"
#   or "set up Octopus observability"
#
# The agent will:
#   1. Run `npx octo-cli init` (generate context template + install project skill)
#   2. Scan the codebase (services, SDKs, configs, env vars)
#   3. Query live Octopus data (traces, topology, RUM, issues)
#   4. Write the observability context into .claude/rules/
#
# From now on, any agent in this project understands your observability setup.
```

## How It Works

```
┌──────────────────────────────────────────────────────────────┐
│  .claude/rules/octopus-observability.md                      │
│  "This project runs service X on env test, Y on env online,  │
│   X calls Redis + PostgreSQL + service Z, query with -e test" │
│                                                              │
│  → Agent auto-loads this when debugging / monitoring         │
├──────────────────────────────────────────────────────────────┤
│  Skill: query syntax, investigation workflows, onboarding    │
│  → Agent knows HOW to query, not just that tools exist       │
├──────────────────────────────────────────────────────────────┤
│  CLI: npx octo-cli logs search / trace search / metrics ...  │
│  MCP: octo_logs_search / octo_trace_search / ...             │
│  → Agent executes with precision because it has context      │
└──────────────────────────────────────────────────────────────┘
```

The context file is not hand-written — the agent generates it by combining **code analysis** (finding SDK imports, service configs) with **live trace data** (actual topology, entry points, dependencies). Traces show what *actually* runs in production, not what code *might* do.

## Features

- **Agent-native onboarding** — `login` installs the skill globally, `init` bootstraps project context, agent fills it in
- **Full Octopus OpenAPI coverage** — logs, alerts, issues, traces, metrics, services, LLM, RUM, events, dashboards
- **Human-friendly time ranges** — `--last 15m`, `--last 2h`, `--last 7d`
- **Multiple output formats** — `--output json`, `--output table`, `--output jsonl`
- **MCP Server** — built-in stdio MCP server for AI agent integration
- **Secure auth** — OC-HMAC-SHA256-2 request signing, credentials stored locally
- **Bundled skills** — 8 deep-dive skills covering query syntax, metrics QL, RUM, LLM tracing, data collection

## Installation

**Requirements:** Node.js >= 22.0.0

```bash
npx octo-cli <command>          # Use directly via npx
npm install -g octo-cli         # Or global install, then use `octo` shorthand
```

## Authentication

1. Create an ApplicationKey on the Octopus platform
2. You will get: `appId`, `appSecret`

```bash
# Login + auto-install skill globally
octo-cli login --app-id <APP_ID> --app-secret <APP_SECRET>

# Or via environment variables (CI/CD, containers)
export OCTOPUS_APP_ID=<APP_ID>
export OCTOPUS_APP_SECRET=<APP_SECRET>
```

## Project Setup

```bash
# In your project directory:
octo-cli init
# → Creates .claude/rules/octopus-observability.md (template with AGENT directives)
# → Installs octo skill into project
# → Agent reads the template, scans code, queries Octopus, fills it in
```

The generated context file tells agents:
- What services this project deploys and in which environments
- What data collection is in place (logs, traces, metrics, RUM, LLM)
- Ready-to-use queries with actual service names
- Service topology and dependencies (from live trace data)
- Known issues and monitoring queries

## Commands

### Logs

```bash
octo-cli logs search -q "level = ERROR" -l 15m          # Search logs
octo-cli logs search -q "service = myapp" --last 1h -n 100
octo-cli logs search --from 2024-01-01T00:00:00Z --to 2024-01-01T01:00:00Z

octo-cli logs aggregate -q "level = ERROR" -g service    # Aggregate by service
octo-cli logs aggregate -a "*:count" -g level:5 -l 30m   # Top 5 levels by count
```

### Alerts

```bash
octo-cli alerts search -s firing -p P0,P1 -l 1h         # Firing P0/P1 alerts
octo-cli alerts search --service myapp -s all             # All alerts for a service
octo-cli alerts rules --group-id 123                      # Search alert rules
octo-cli alerts silence --rule-id 1 --alert-id 2 --duration 2h  # Silence an alert
```

### Error Tracking (Issues)

```bash
octo-cli issues search --status unresolved -l 1h         # Unresolved issues
octo-cli issues detail <issueId>                          # Issue detail
octo-cli issues assign --user 123 --ids id1,id2          # Assign issues
octo-cli issues update --ids id1,id2 -s resolved          # Resolve issues
```

### Traces

```bash
octo-cli trace search -q "service = myapp" -l 15m        # Search spans
octo-cli trace aggregate -a "duration:p95" -g service     # P95 latency by service
```

### Metrics

```bash
octo-cli metrics query "sum(http_requests{}.as_count)" -l 1h       # Timeseries
octo-cli metrics query "avg(cpu_usage{service=myapp})" --points 50  # With point count
octo-cli metrics point "sum(error_count{}.as_count)"                 # Single point value
```

### Services / APM

```bash
octo-cli services list -l 1h                              # List active services
octo-cli services entries myapp -l 1h                     # Service entry points
octo-cli services topo myapp                              # Service topology graph
```

### LLM / RUM / Events

```bash
octo-cli llm -l 1h -q "model.name = gpt-4"              # LLM observability
octo-cli rum list -e test -q "application.name = myapp" -l 1d   # RUM sessions
octo-cli rum detail <id>                                  # RUM event detail
octo-cli events -l 1d                                     # Deployment events
```

### Users

```bash
octo-cli users alice bob                                  # Search users by name
```

## Command Reference

| Command | Description |
|---------|-------------|
| `login` | Configure credentials + install skill globally |
| `init` | Set up project: generate context template + install skill |
| `logs search` | Search logs |
| `logs aggregate` | Aggregate logs with grouping |
| `alerts search` | Search alerts |
| `alerts rules` | Search alert rules |
| `alerts silence` | Create alert silence |
| `issues search` | Search error tracking issues |
| `issues detail` | Get issue detail |
| `issues assign` | Batch assign issues |
| `issues update` | Batch update issue status |
| `trace search` | Search trace spans |
| `trace aggregate` | Aggregate trace spans |
| `metrics query` | Query metrics timeseries |
| `metrics point` | Query single metric point |
| `services list` | List services |
| `services entries` | List service entry points |
| `services topo` | Service topology graph |
| `llm` | Query LLM spans |
| `rum list` | List RUM events |
| `rum detail` | Get RUM event detail |
| `events` | Query events |
| `users` | Search users |
| `mcp` | Start MCP stdio server |

## Common Options

All query commands support:

| Option | Description | Example |
|--------|-------------|---------|
| `-l, --last <duration>` | Relative time range | `15m`, `1h`, `2d`, `1w` |
| `--from <time>` | Absolute start time | epoch ms or ISO string |
| `--to <time>` | Absolute end time | epoch ms or ISO string |
| `-e, --env <env>` | Environment | `online`, `test` |
| `-q, --query <query>` | Query string | `level = ERROR` |
| `-o, --output <fmt>` | Output format | `json`, `table`, `jsonl` |
| `-n, --limit <n>` | Max results | `50` |

## Pipes

Output is stdout-friendly. Combine with `jq`, `grep`, or any Unix tool:

```bash
# Count errors per service
octo-cli logs aggregate -q "level = ERROR" -g service -o json | jq '.[].fields.service'

# Firing alerts as one-liner
octo-cli alerts search -s firing -o jsonl | jq -r '.title'

# Feed into other tools
octo-cli trace search -q "status = error" -o jsonl | wc -l
```

## MCP Server

Built-in MCP server for AI agent integration (Claude Code, Cursor, etc.).

### Configuration

Add to your MCP settings (e.g. `~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "octo-mcp": {
      "command": "npx",
      "args": ["-y", "octo-cli", "mcp"],
      "env": {
        "OCTOPUS_APP_ID": "<your-app-id>",
        "OCTOPUS_APP_SECRET": "<your-app-secret>"
      }
    }
  }
}
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `octo_logs_search` | Search logs with query, time range, limit |
| `octo_logs_aggregate` | Aggregate logs with grouping |
| `octo_alerts_search` | Search alerts by status, priority, service |
| `octo_issues_search` | Search error tracking issues |
| `octo_trace_search` | Search trace spans |
| `octo_metrics_query` | Query metrics timeseries |
| `octo_services_list` | List APM services |
| `octo_services_topology` | Service call topology graph |
| `octo_llm_list` | Query LLM observability spans |
| `octo_rum_list` | Query RUM events |
| `octo_events_list` | Query events |

## Bundled Skills

Deep-dive knowledge for specific Octopus domains. Installed automatically with `login` and `init`, or individually:

```bash
npx reskill install github:kanyun-inc/octo-cli/skills/octopus-log-query -a claude-code cursor -y
```

| Skill | Focus |
|-------|-------|
| `octo` | CLI commands, query syntax, onboarding, investigation workflows |
| `octopus-log-query` | Log search syntax, charting, log-to-metric, tokenization |
| `octopus-metrics` | Metric types (Count/Gauge/Histogram), QL syntax, as_count/as_rate |
| `octopus-rum` | RUM concepts (Session/View/Action/Error), Web SDK, Core Web Vitals |
| `octopus-llm-trace` | LLM Trace SDK (Java/TS/Python), span kinds, cost tracking |
| `octopus-data-collection` | Log/Trace/Metric collection (HTTP, Kafka, javaagent, Node.js, Python) |
| `octopus-openapi` | OpenAPI signing (V1/V2), SDK integration, all HTTP endpoints |
| `octopus-web-sdk-helper` | Web SDK troubleshooting, config guidance, sourcemap upload |

## API Reference

octo-cli wraps the [Octopus OpenAPI](https://www.notion.so/OpenAPI-1b42090d16b681749335c62b3ed505be):

| Domain | Endpoints |
|--------|-----------|
| Logs | `/v1/logs/search`, `/v1/logs/aggregate` |
| Alerts | `/v1/alerts/search`, `/v1/alert/rules/search`, `/v1/alert/rules`, `/v1/alerts/silences/*` |
| Issues | `/v1/log-error-tracking/issues/*` |
| Traces | `/v1/trace/span/list`, `/v1/trace/aggregate` |
| Metrics | `/v1/metrics/query/timeseries`, `/v1/metrics/query/queryMetric` |
| Services | `/v1/apm/query/*`, `/v1/apm/topology/*` |
| LLM | `/v1/llm/span/list` |
| RUM | `/v1/rum/list`, `/v1/rum/{id}`, `/v1/rum/aggregate` |
| Events | `/v1/event/list` |
| Dashboard | `/v1/dashboards` (CRUD) |
| Users | `/v1/users/search` |

Auth: OC-HMAC-SHA256-2 request signing. Base URL: `https://octopus-app.zhenguanyu.com`.

## License

MIT
