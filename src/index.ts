import { Command } from 'commander';
import { registerCommands } from './commands.js';

const program = new Command();

program
  .name('octo')
  .description(
    'Octopus Observability CLI — logs, alerts, traces, metrics and more'
  )
  .version('0.2.0');

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

program.parse();
