import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEMPLATE = `---
description: Octopus observability context for this project. Auto-loaded when tasks involve debugging, errors, alerts, performance, logs, traces, or monitoring.
globs:
---

# Octopus Observability Context

<!--
  DO NOT fill this file manually. Let your AI agent analyze the codebase and write it.

  After creating this file, tell the agent:

    "Read .claude/rules/octopus-observability.md and follow the AGENT instructions
     to analyze this codebase and fill in the observability context."

  The agent should first identify the project type, then scan accordingly.
-->

## Project Type

<!-- AGENT: Identify the project type first. This determines what to scan.

  Detection rules (check in order):
  1. Java Backend — pom.xml or build.gradle at root, *-web/*-admin/*-rpc/*-job modules
     → Multi-service Maven project: projectname-web, projectname-admin, projectname-rpc,
       projectname-job, projectname-consumer are all separate services
     → Traces: javaagent (check JVM args, Dockerfile, k8s manifests for -javaagent)
     → Logs: logback/log4j config, octopus-otel-collector
     → Service names: spring.application.name in application.yml, or module names
     → Env: typically "online" and "test", check application-{env}.yml

  2. Frontend (React/Vue) — package.json with react/vue/vite/webpack, no server
     → May not have observability at all
     → If @octopus-sdk/browser-rum is imported: this is a RUM-monitored app
     → If @octopus-sdk/browser-logs is imported: has log collection
     → Service name = RUM applicationName in SDK init config
     → Env: check SDK init for env parameter, or build env vars

  3. Node.js Server — package.json with express/koa/fastify/hapi, no next/nuxt
     → Logs: check for octopus log upload (HTTP or SDK)
     → Traces: check for opentelemetry SDK init
     → Service name: from env vars (SERVICE_NAME, OCTOPUS_SERVICE) or package.json name

  4. Next.js / Nuxt — package.json with next/nuxt
     → Hybrid: has both SSR (server traces/logs) and client (RUM potential)
     → Check for @octopus-sdk/browser-rum in client code
     → Check for OpenTelemetry in server instrumentation
     → May have two service names: one for server, one for RUM

  5. Monorepo — pnpm-workspace.yaml, lerna.json, turborepo, nx.json, or packages/apps dirs
     → IMPORTANT: each package/app may be a different service
     → Scan each workspace member independently
     → Some may be RUM web apps, others may be Node.js servers
     → List ALL services, noting which workspace they come from

  Write the detected type here, e.g.:
  "Java Backend (Maven multi-module)" or "Monorepo (pnpm + turborepo, 3 apps)"
-->

Type: <!-- AGENT: write detected type -->

## Services

<!-- AGENT: List every service this project deploys. Scan based on project type:

  Java:
  - Each Maven module with a Main class is a service
  - Service name = spring.application.name or module directory name
  - Check application.yml, application-online.yml, application-test.yml for env-specific configs
  - Pattern: projectname-web → service "projectname-web"

  Frontend (RUM):
  - Search for: @octopus-sdk/browser-rum init, applicationName or applicationId
  - grep -r "applicationName\\|applicationId\\|browser-rum\\|browserRum" src/
  - Service name = the applicationName in RUM SDK init
  - Env usually from build-time env var or SDK config

  Node.js:
  - Search: process.env.SERVICE_NAME, process.env.OCTOPUS_SERVICE
  - Check Dockerfile ENV, docker-compose.yml environment
  - Check k8s manifests for env vars
  - Fallback: package.json "name" field

  Next.js:
  - Server side: check next.config.js for instrumentation, OpenTelemetry setup
  - Client side: check _app.tsx or layout.tsx for RUM SDK init
  - May have 2 services: "myapp-server" + "myapp" (RUM)

  Monorepo:
  - Scan EACH workspace member: apps/*, packages/*
  - For each, apply the rules above based on its own package.json
  - Clearly note which workspace member each service comes from
-->

| Service | Env | Type | Source | Description |
|---------|-----|------|--------|-------------|
<!-- AGENT: fill rows. Type = backend/rum/ssr/worker. Source = module or workspace path -->

## Data Collection

<!-- AGENT: For each service found above, determine what data it reports.

  Scan checklist:
  - [ ] Logs: logback.xml, log4j2.xml, @octopus-sdk/browser-logs, console.log with structured format
  - [ ] Traces: -javaagent flag, opentelemetry-kanyun-*, @opentelemetry/sdk-trace-*, Skywalking agent
  - [ ] Metrics: custom StatsD/Prometheus client, trace.service.* (auto from javaagent)
  - [ ] RUM: @octopus-sdk/browser-rum import and init call
  - [ ] LLM: opentelemetry-kanyun-api traceLLM/traceAgent, opentelemetry-kanyun-extension
  - [ ] Events: deployment event hooks in CI/CD configs

  For each found, note the specific SDK version and config location.
-->

| Service | Logs | Traces | Metrics | RUM | LLM |
|---------|------|--------|---------|-----|-----|
<!-- AGENT: fill rows. Use Yes/No with brief detail like "Yes (javaagent)" -->

## Key Queries

<!-- AGENT: Replace ALL <SERVICE> placeholders with actual service names found above.
     Generate one block per service. Remove irrelevant queries (e.g. no trace query for pure RUM).
-->

\`\`\`bash
# === <SERVICE> ===

# Error logs
npx octo-cli logs search -q "service = <SERVICE> AND level = ERROR" -l 15m

# Error rate trend
npx octo-cli logs aggregate -q "service = <SERVICE> AND level = ERROR" -l 1h

# Unresolved issues
npx octo-cli issues search -q "service = <SERVICE>" --status unresolved

# Slow traces (if traced)
npx octo-cli trace search -q "service = <SERVICE> AND duration > 1000" -l 15m

# Service topology (if traced)
npx octo-cli services topo <SERVICE> -l 1h

# RUM sessions (if RUM enabled)
npx octo-cli rum list -q "application.name = <SERVICE>" -l 1d

# RUM errors (if RUM enabled)
npx octo-cli rum list -q "application.name = <SERVICE> AND type = error" -l 1d
\`\`\`

## Dependencies (from Trace)

<!-- AGENT: Use LIVE trace data to map the real dependency graph. This is the most
  reliable source — it shows what ACTUALLY happened in production, not what code
  might do.

  Step 1: Query the service topology for each service found above.
  Run these commands and record the output:

    npx octo-cli services topo <SERVICE> -e online -l 1d

  This returns upstream/downstream services and edges. Record them below.

  Step 2: Check service entry points to understand how traffic flows in:

    npx octo-cli services entries <SERVICE> -e online -l 1d

  This shows HTTP endpoints, RPC methods, MQ consumers — the "doors" into the service.

  Step 3: For richer detail, query trace spans to see specific call patterns:

    # What downstream services does this service call?
    npx octo-cli trace search -q "service = <SERVICE>" -l 1h -n 20

    # Look at span attributes: peer.service, db.system, messaging.system
    # These reveal databases, caches, message queues, and external services

  Step 4: Supplement with code analysis for things traces don't capture:
  - Database names/tables (traces show db.system but not always db.name)
  - Kafka topic names (traces show messaging.system, sometimes destination)
  - External HTTP API endpoints

  Write the results below. This section is CRITICAL for cross-service debugging.
-->

### Topology

<!-- AGENT: paste the simplified topology from "services topo" output:
  e.g.
  api-gateway → this-service → user-service
                             → mysql
                             → redis
                             → kafka
-->

### Entry Points

<!-- AGENT: list the service entries from "services entries" output:
  e.g.
  - HTTP POST /api/v1/orders (entry)
  - RPC OrderService.createOrder (entry)
  - MQ consumer: order-events (entry)
-->

### Upstream (calls into this service)
<!-- AGENT: from topo output, list upstreamServices -->

### Downstream (this service calls)
<!-- AGENT: from topo output, list downstreamServices. Include:
  - Other services (from edges)
  - Databases (from trace spans with db.system attribute)
  - Caches (redis, memcached)
  - Message queues (kafka, rabbitmq)
  - External APIs
-->

## Notes

<!-- AGENT: Add anything else relevant:
  - Canary deployment tagging (canary=true in Octopus)
  - Log level differences between environments (e.g. WARN in online, DEBUG in test)
  - Known noisy alerts or error patterns to ignore
  - Dashboard links found in code/configs/README
  - Special env var overrides for observability
  - Multi-region or multi-cluster deployment info
-->
`;

function findRuleDir(cwd: string): { dir: string; filePath: string } {
  const claudeRules = path.join(cwd, '.claude', 'rules');
  if (fs.existsSync(path.join(cwd, '.claude'))) {
    return {
      dir: claudeRules,
      filePath: path.join(claudeRules, 'octopus-observability.md'),
    };
  }

  const cursorRules = path.join(cwd, '.cursor', 'rules');
  if (fs.existsSync(path.join(cwd, '.cursor'))) {
    return {
      dir: cursorRules,
      filePath: path.join(cursorRules, 'octopus-observability.md'),
    };
  }

  return {
    dir: claudeRules,
    filePath: path.join(claudeRules, 'octopus-observability.md'),
  };
}

export function runInit(targetDir?: string): void {
  // Check login first — init needs live Octopus data for trace-driven discovery
  const configPath = path.join(os.homedir(), '.octo-cli', 'config.json');
  let hasCredentials = false;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    hasCredentials = !!(config.app_id && config.app_secret);
  } catch {
    // no config file
  }
  hasCredentials =
    hasCredentials ||
    !!(process.env.OCTOPUS_APP_ID && process.env.OCTOPUS_APP_SECRET);

  if (!hasCredentials) {
    console.error('Error: Not logged in. Run this first:');
    console.error('');
    console.error(
      '  npx octo-cli login --app-id <APP_ID> --app-secret <APP_SECRET>'
    );
    console.error('');
    console.error(
      'The init command needs Octopus API access so the agent can query'
    );
    console.error(
      'live trace data to discover service topology and dependencies.'
    );
    process.exit(1);
  }

  const cwd = targetDir ? path.resolve(targetDir) : process.cwd();
  const { dir, filePath } = findRuleDir(cwd);

  if (fs.existsSync(filePath)) {
    console.log(`Already exists: ${filePath}`);
    console.log(
      'Ask your AI agent to update it based on the current codebase.'
    );
    return;
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, TEMPLATE);

  console.log(`Created: ${filePath}`);
  console.log('');
  console.log('Now ask your AI agent to analyze the codebase and fill it in:');
  console.log('');
  console.log(
    '  "Read .claude/rules/octopus-observability.md and follow the AGENT'
  );
  console.log(
    '   instructions to analyze this codebase and fill in the observability context."'
  );
}
