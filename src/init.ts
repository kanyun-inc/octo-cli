import fs from 'node:fs';
import path from 'node:path';

const TEMPLATE = `# Octopus Observability Context

> This file helps AI agents understand the observability setup of this project.
> When investigating errors, performance issues, or debugging, agents should
> use \`npx octo-cli\` with the context below.
>
> Install the octo skill: \`npx reskill install github:kanyun-inc/octo-cli/skills -a claude-code cursor -y\`

## Services

<!-- List all services this project deploys. One service per row. -->

| Service Name | Description | Environments | Language |
|-------------|-------------|--------------|----------|
| \`example-service\` | Main API server | online, test | Java |
<!-- | \`example-worker\` | Background job processor | online, test | Node.js | -->

## Data Collection

<!-- What observability data does this project report? -->

| Type | SDK / Method | Notes |
|------|-------------|-------|
| Logs | <!-- e.g. octopus-otel-collector, HTTP upload, Kafka --> | |
| Traces | <!-- e.g. javaagent, OpenTelemetry SDK, Skywalking --> | |
| Metrics | <!-- e.g. custom metrics via SDK, trace metrics (auto) --> | |
| RUM | <!-- e.g. @octopus-sdk/browser-rum --> | |
| LLM | <!-- e.g. opentelemetry-kanyun-api --> | |
| Events | <!-- e.g. deployment events via CI/CD --> | |

## Key Queries

<!-- Pre-built queries agents can use directly. Customize for your service. -->

\`\`\`bash
# Search errors for this service
npx octo-cli logs search -q "service = <SERVICE> AND level = ERROR" -l 15m

# Error count by service
npx octo-cli logs aggregate -q "level = ERROR" -g service -l 1h

# Firing alerts
npx octo-cli alerts search -s firing -l 1h

# Unresolved issues
npx octo-cli issues search -q "service = <SERVICE>" --status unresolved -l 1d

# Trace errors
npx octo-cli trace search -q "service = <SERVICE> AND status = error" -l 15m

# Service topology
npx octo-cli services topo <SERVICE> -l 1h
\`\`\`

## Dependencies

<!-- Upstream and downstream services. Helps agents trace cross-service issues. -->

### Upstream (calls into this service)
<!-- - \`api-gateway\` -->

### Downstream (this service calls)
<!-- - \`user-service\` -->
<!-- - \`mysql (RDS)\` -->
<!-- - \`redis\` -->
<!-- - \`kafka\` -->

## Alert Rules

<!-- Important alert rules to be aware of. -->

| Rule Name | Priority | Type | Description |
|-----------|----------|------|-------------|
<!-- | \`error-rate-high\` | P1 | log | ERROR count > 100/min | -->

## Dashboards

<!-- Links to relevant Octopus dashboards. -->

<!-- - [Service Overview](https://octopus.zhenguanyu.com/#/dashboard?id=XXX) -->

## Notes

<!-- Any other observability context agents should know about. -->
<!-- e.g. "Canary deployments use env=online with canary=true tag" -->
<!-- e.g. "Log level is set to WARN in production, use test env for DEBUG logs" -->
`;

/**
 * Find the best location for the observability rule file.
 * Prefers .claude/rules/, falls back to .cursor/rules/, then project root.
 */
function findRuleDir(cwd: string): { dir: string; filePath: string } {
  // Try .claude/rules/ first
  const claudeRules = path.join(cwd, '.claude', 'rules');
  if (fs.existsSync(path.join(cwd, '.claude'))) {
    return {
      dir: claudeRules,
      filePath: path.join(claudeRules, 'octopus-observability.md'),
    };
  }

  // Try .cursor/rules/
  const cursorRules = path.join(cwd, '.cursor', 'rules');
  if (fs.existsSync(path.join(cwd, '.cursor'))) {
    return {
      dir: cursorRules,
      filePath: path.join(cursorRules, 'octopus-observability.md'),
    };
  }

  // Default to .claude/rules/
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
    console.log('Edit it to update your observability context.');
    return;
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, TEMPLATE);

  console.log(`Created: ${filePath}`);
  console.log('');
  console.log('Next steps:');
  console.log(
    '  1. Fill in your service names, environments, and data collection setup'
  );
  console.log('  2. Customize the key queries with your actual service names');
  console.log('  3. List upstream/downstream dependencies');
  console.log('');
  console.log(
    'Once filled in, AI agents will automatically use this context when investigating issues.'
  );
}
