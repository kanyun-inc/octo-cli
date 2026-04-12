import { Command } from 'commander';
import { registerCommands } from './commands.js';

const program = new Command();

program
  .name('octo')
  .description(
    'Octopus Observability CLI — logs, alerts, traces, metrics and more'
  )
  .version('0.5.0');

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
    const { getAppId, getAppSecret } = await import('./config.js');
    const appId = getAppId();
    const appSecret = getAppSecret();
    if (!appId || !appSecret) {
      console.error('Not logged in. Run `npx octo-cli login` first.');
      process.exit(1);
    }
    try {
      execSync(
        `claude mcp add octo-mcp -s ${opts.scope} -e OCTOPUS_APP_ID=${appId} -e OCTOPUS_APP_SECRET=${appSecret} -- npx -y octo-cli mcp`,
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
