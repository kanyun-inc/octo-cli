import { type Command, CommanderError } from 'commander';

/** Transport and API failures retain their machine-readable status and code. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: number,
    public hints?: string[]
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Keep command failures on stderr and leave stdout available for data pipes. */
export async function runCli(
  program: Command,
  args = process.argv
): Promise<void> {
  const jsonErrors = args.includes('--json-errors');
  function captureExits(command: Command): void {
    command.exitOverride();
    for (const child of command.commands) captureExits(child);
  }
  captureExits(program);
  program.configureOutput({
    writeErr: (text) => {
      if (!jsonErrors) process.stderr.write(text);
    },
  });
  try {
    await program.parseAsync(args);
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return;
    const message = (
      error instanceof Error ? error.message : String(error)
    ).replace(/[\r\n]+/g, ' ');
    const details = {
      message,
      ...(error instanceof ApiError
        ? { status: error.status, code: error.code }
        : {}),
      ...(error instanceof ApiError && error.hints?.length
        ? { hints: error.hints }
        : {}),
    };
    if (jsonErrors) console.error(JSON.stringify({ error: details }));
    else if (!(error instanceof CommanderError)) {
      const prefix =
        error instanceof ApiError
          ? `HTTP ${error.status}${error.code === undefined ? '' : `, code=${error.code}`}: `
          : '';
      const hints =
        error instanceof ApiError
          ? error.hints?.map((hint) => `Hint: ${hint}`).join('\n')
          : undefined;
      console.error(`Error: ${prefix}${message}${hints ? `\n${hints}` : ''}`);
    }
    process.exitCode = 1;
  }
}
