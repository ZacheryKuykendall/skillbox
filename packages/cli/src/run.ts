import { Command } from 'commander';

import { EXIT_CODES } from './exit-codes.js';
import { CLI_VERSION } from './version.js';

/**
 * Build the Commander program.
 *
 * Exported separately from {@link run} so tests can exercise parsing without
 * touching `process.exit`.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('skillbox')
    .description('An organized toolbox for reusable software capabilities.')
    .version(CLI_VERSION, '-V, --version', 'Show the Skillbox version.')
    .option('--registry <path>', 'Path to the resource catalog.')
    .option(
      '--project <path>',
      'Project root. Defaults to the nearest .skillbox ancestor.',
    )
    .option('--json', 'Emit machine-readable JSON.')
    .option('--no-color', 'Disable colored output.')
    .showHelpAfterError('(add --help for usage)')
    .configureOutput({
      // Commander writes usage errors to stdout by default; diagnostics belong
      // on stderr so `--json` output stays pipeable.
      writeErr: (str) => process.stderr.write(str),
    });

  // Commander's default behavior is to call process.exit itself. Throwing
  // instead keeps exit-code decisions in one place.
  program.exitOverride();

  return program;
}

/**
 * Run the CLI.
 *
 * Returns the process exit code rather than calling `process.exit`, so the
 * caller controls termination and tests can assert on the value.
 */
export async function run(argv: readonly string[]): Promise<number> {
  const program = createProgram();

  // Invoked with no arguments at all. Showing help beats exiting silently.
  if (argv.length <= 2) {
    program.outputHelp();
    return EXIT_CODES.SUCCESS;
  }

  try {
    await program.parseAsync([...argv]);
    return EXIT_CODES.SUCCESS;
  } catch (error) {
    // `--help` and `--version` are implemented as thrown "errors" by Commander's
    // exitOverride; both are successful outcomes.
    const code = (error as { code?: string } | null)?.code;
    if (code === 'commander.helpDisplayed' || code === 'commander.help') {
      return EXIT_CODES.SUCCESS;
    }
    if (code === 'commander.version') {
      return EXIT_CODES.SUCCESS;
    }
    if (code === 'commander.unknownCommand' || code === 'commander.unknownOption') {
      return EXIT_CODES.USAGE;
    }
    if (code === 'commander.excessArguments' || code === 'commander.missingArgument') {
      return EXIT_CODES.USAGE;
    }

    throw error;
  }
}
