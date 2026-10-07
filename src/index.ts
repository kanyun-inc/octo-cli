import { Command } from 'commander';
import { registerCommands } from './commands.js';
import { runCli } from './errors.js';
import { configureCommandHelp } from './help.js';

declare const __PKG_VERSION__: string;

const program = new Command();

program
  .name('octo')
  .description(
    'Octopus Observability CLI — logs, alerts, traces, metrics and more'
  )
  .version(__PKG_VERSION__)
  .option(
    '--json-errors',
    'Print failures as {error:{message,status?,code?,hints?}} JSON on stderr'
  );

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
    const { execFileSync } = await import('node:child_process');
    const { getCredentials } = await import('./config.js');
    const { token } = getCredentials();
    try {
      execFileSync(
        'claude',
        [
          'mcp',
          'add',
          'octo-mcp',
          '-s',
          opts.scope,
          '-e',
          `OCTOPUS_TOKEN=${token}`,
          '--',
          'npx',
          '-y',
          'octo-cli',
          'mcp',
        ],
        { stdio: 'inherit' }
      );
      console.log('octo-mcp registered in Claude Code.');
    } catch {
      throw new Error(
        'Failed. Make sure `claude` CLI is installed (npm i -g @anthropic-ai/claude-code).'
      );
    }
  });

configureCommandHelp(program);
await runCli(program);
