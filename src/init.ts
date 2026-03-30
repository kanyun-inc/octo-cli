import fs from 'node:fs';
import path from 'node:path';

const TEMPLATE = `---
description: Octopus observability context for this project. Auto-loaded when tasks involve debugging, errors, alerts, performance, logs, traces, or monitoring.
globs:
---

# Octopus Observability Context

<!--
  This file should be filled in by an AI agent, not manually.

  Run this command to have the agent analyze the codebase and fill it in:

    "Analyze this project's codebase and fill in .claude/rules/octopus-observability.md
     with the actual observability setup. Look at package.json, docker configs,
     agent configs, SDK imports, environment variables, and service names."

  The agent should:
  1. Search for Octopus SDK imports (@octopus-sdk/*, opentelemetry-kanyun-*)
  2. Find service names from configs, env vars, docker-compose, k8s manifests
  3. Identify data collection methods (javaagent, HTTP upload, Kafka, SDK)
  4. Map upstream/downstream from code (HTTP clients, MQ producers/consumers, DB connections)
  5. Find alert rule references or monitoring configs
-->

## How to Query

\`\`\`bash
# Install CLI credentials (one-time)
npx octo-cli login --app-id <APP_ID> --app-secret <APP_SECRET>

# Or install the agent skill for deeper guidance
npx reskill install github:kanyun-inc/octo-cli/skills -a claude-code cursor -y
\`\`\`

## Services

<!-- AGENT: Replace this section. Scan for service names in:
     - package.json (name field)
     - docker-compose.yml / Dockerfile (service names, env vars)
     - k8s manifests (metadata.name, OCTOPUS_SERVICE, SERVICE_NAME)
     - application.yml / application.properties (spring.application.name)
     - Octopus SDK init configs (serviceName, service)
     - Environment variable files (.env, .env.production)
-->

| Service | Env | Language | Description |
|---------|-----|----------|-------------|

## Data Collection

<!-- AGENT: Replace this section. Search for:
     - Imports: @octopus-sdk/browser-rum, @octopus-sdk/browser-logs, opentelemetry-kanyun-*
     - Java: octopus javaagent in JVM args, pom.xml dependencies
     - Collector: octopus-otel-collector configs
     - Custom metrics: StatsD, Prometheus client usage
     - Trace: Skywalking, OpenTelemetry SDK init
     - RUM: browser SDK init with applicationId
     - LLM: traceLLM, traceAgent calls
-->

| Type | How | Details |
|------|-----|---------|

## Key Queries

<!-- AGENT: Replace <SERVICE> with actual service names found above -->

\`\`\`bash
# Error logs
npx octo-cli logs search -q "service = <SERVICE> AND level = ERROR" -l 15m

# Error rate by service
npx octo-cli logs aggregate -q "level = ERROR" -g service -l 1h

# Firing alerts
npx octo-cli alerts search -s firing -l 1h

# Unresolved issues
npx octo-cli issues search -q "service = <SERVICE>" --status unresolved

# Slow traces
npx octo-cli trace search -q "service = <SERVICE> AND duration > 1000" -l 15m

# Service topology
npx octo-cli services topo <SERVICE> -l 1h
\`\`\`

## Dependencies

<!-- AGENT: Replace this section. Scan for:
     - HTTP clients (fetch, axios, got) → downstream services
     - Database connections (mysql, pg, redis, mongo) → downstream
     - Message queues (kafka producer/consumer, rabbitmq) → upstream/downstream
     - gRPC/RPC client stubs → downstream services
     - API gateway / ingress configs → upstream
-->

### Upstream (calls into this service)

### Downstream (this service calls)

## Notes

<!-- AGENT: Add anything relevant:
     - Canary deployment tagging (canary=true)
     - Log level differences between environments
     - Known noisy alerts to ignore
     - Dashboard links if found in code/configs
-->
`;

/**
 * Find the best location for the observability rule file.
 */
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
    '  "Analyze this project and fill in .claude/rules/octopus-observability.md'
  );
  console.log(
    '   with the actual services, data collection, dependencies, and queries."'
  );
}
