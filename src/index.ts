import { Command } from 'commander';
import { registerCommands } from './commands.js';

const program = new Command();

program
  .name('octo')
  .description(
    'Octopus Observability CLI — logs, alerts, traces, metrics and more'
  )
  .version('0.1.0');

registerCommands(program);

program.parse();
