import type { Command } from 'commander';
import { parsePositiveInteger } from './aggregate.js';
import { validateEnvironment } from './config.js';
import { resolveTimeRange } from './time.js';

function validateChoice(
  value: string | undefined,
  flag: string,
  choices: string[],
  csv = false
): void {
  if (value === undefined) return;
  for (const item of csv ? value.split(',') : [value]) {
    if (!choices.includes(item))
      throw new Error(
        `${flag} must be one of: ${choices.join(', ')}; received "${item}"`
      );
  }
}

/** Reject known invalid values before authentication or any HTTP request. */
export function configureValidation(program: Command): void {
  program.hook('preAction', (_root, command) => {
    const opts = command.opts();
    const group = command.parent?.name();
    if (opts.cursorFile !== undefined && !opts.cursorFile.trim()) {
      throw new Error('--cursor-file must be a non-empty file path');
    }
    if (command.name() === 'mcp-install')
      validateChoice(opts.scope, '--scope', ['user', 'local', 'project']);
    if (opts.env !== undefined) {
      for (const env of group === 'alerts' && command.name() === 'rules'
        ? opts.env.split(',')
        : [opts.env])
        validateEnvironment(env);
    }
    validateChoice(opts.output, '--output', ['json', 'table', 'jsonl']);
    validateChoice(opts.order, '--order', ['asc', 'desc']);
    validateChoice(opts.scrollType, '--scroll-type', ['pre', 'next']);
    validateChoice(opts.sortOrder, '--sort-order', ['asc', 'desc']);
    if (opts.sortOrder && !opts.sort)
      throw new Error('--sort-order requires --sort');
    if (opts.sortOperation && !opts.sort)
      throw new Error('--sort-operation requires --sort');
    if (opts.serializedSortValues && !opts.scrollId)
      throw new Error('--serialized-sort-values requires --scroll-id');
    for (const key of ['limit', 'points', 'page', 'pageSize']) {
      if (opts[key] !== undefined)
        parsePositiveInteger(
          opts[key],
          `--${key === 'pageSize' ? 'page-size' : key}`
        );
    }
    const maxLimit =
      (group === 'logs' || group === 'trace') && command.name() === 'search'
        ? 500
        : group === 'inspection'
          ? 50
          : undefined;
    if (maxLimit !== undefined && Number(opts.limit) > maxLimit)
      throw new Error(`--limit must not exceed ${maxLimit}`);
    if (
      command.options.some((option) => option.long === '--last') &&
      (opts.from || opts.to || opts.last)
    )
      resolveTimeRange(opts);
    if (group === 'alerts') {
      if (command.name() === 'search')
        validateChoice(opts.status, '--status', ['firing', 'resolved', 'all']);
      validateChoice(
        opts.priority,
        '--priority',
        ['UNKNOWN', 'P0', 'P1', 'P2'],
        true
      );
      validateChoice(
        opts.statusList,
        '--status-list',
        ['enabled', 'disabled', 'paused', 'silenced'],
        true
      );
      validateChoice(
        opts.types,
        '--types',
        ['log', 'metric', 'issue', 'rum', 'llm'],
        true
      );
      validateChoice(opts.ruleType, '--rule-type', ['log', 'metric', 'issue']);
    }
    if (group === 'issues') {
      validateChoice(opts.source, '--source', ['log', 'rum']);
      validateChoice(opts.status, '--status', [
        'unresolved',
        'resolved',
        'ignored',
        ...(command.name() === 'search' ? ['all'] : []),
      ]);
      validateChoice(opts.sort, '--sort', ['logCount', 'firstSeen']);
    }
    if (group === 'cases') {
      validateChoice(opts.status, '--status', ['todo', 'doing', 'done']);
      validateChoice(opts.priority, '--priority', ['NONE', 'P0', 'P1', 'P2']);
      validateChoice(opts.type, '--type', ['alert', 'issue']);
    }
    if (group === 'inspection')
      validateChoice(opts.result, '--result', ['normal', 'abnormal']);
  });
}
