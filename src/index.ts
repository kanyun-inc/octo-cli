import { Command } from 'commander';
import { registerCommands } from './commands.js';

declare const __PKG_VERSION__: string;

const program = new Command();

program
  .name('octo')
  .description(
    'Octopus Observability CLI — logs, alerts, traces, metrics and more'
  )
  .version(__PKG_VERSION__);

registerCommands(program);

program
  .command('init')
  .description(
    'Generate .claude/rules/octopus-observability.md for this project'
  )
  .argument('[dir]', 'Target project directory (default: cwd)')
  .action(async (dir) => {
    const { runInit } = await import('./init.js');
    runInit(dir);
  });

program
  .command('mcp')
  .description('Start MCP stdio server for AI agent integration')
  .action(async () => {
    const { startMcpServer } = await import('./mcp.js');
    await startMcpServer();
  });

program
  .command('mcp-install')
  .description('Register octo-mcp in Claude Code with one command')
  .option('-s, --scope <scope>', 'user, local, or project', 'user')
  .action(async (opts) => {
    const { execSync } = await import('node:child_process');
    const { getToken, getAppId, getAppSecret } = await import('./config.js');
    const token = getToken();
    const appId = getAppId();
    const appSecret = getAppSecret();

    let envFlags: string;
    if (token) {
      envFlags = `-e OCTOPUS_TOKEN=${token}`;
    } else if (appId && appSecret) {
      envFlags = `-e OCTOPUS_APP_ID=${appId} -e OCTOPUS_APP_SECRET=${appSecret}`;
    } else {
      console.error('Not logged in. Run `npx octo-cli login` first.');
      process.exit(1);
    }
    try {
      execSync(
        `claude mcp add octo-mcp -s ${opts.scope} ${envFlags} -- npx -y octo-cli mcp`,
        { stdio: 'inherit' }
      );
      console.log('octo-mcp registered in Claude Code.');
    } catch {
      console.error(
        'Failed. Make sure `claude` CLI is installed (npm i -g @anthropic-ai/claude-code).'
      );
      process.exit(1);
    }
  });

program.parse();
