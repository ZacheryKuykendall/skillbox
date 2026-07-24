import { Command, CommanderError } from 'commander';

import { addCommand } from './commands/add.js';
import { doctorCommand } from './commands/doctor.js';
import { initCommand } from './commands/init.js';
import { inspectCommand } from './commands/inspect.js';
import { listCommand } from './commands/list.js';
import { removeCommand } from './commands/remove.js';
import { searchCommand } from './commands/search.js';
import { updateCommand } from './commands/update.js';
import { validateCommand } from './commands/validate.js';
import {
  createContext,
  type CreateContextOptions,
  type GlobalOptions,
} from './context.js';
import { renderError } from './errors.js';
import { EXIT_CODES, type ExitCode } from './exit-codes.js';
import { createWriter } from './output.js';
import { CLI_VERSION } from './version.js';

/**
 * Program wiring.
 *
 * Each command is a thin adapter: parse options, build a context, call one
 * handler, return an exit code. Business logic belongs in `@skillbox/core`
 * (ADR-0001).
 */

/** Environment the CLI runs in. Injectable so tests need no globals. */
export interface RunEnvironment {
  readonly cwd?: string | undefined;
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  readonly stdout?: ((text: string) => void) | undefined;
  readonly stderr?: ((text: string) => void) | undefined;
  readonly isTty?: boolean | undefined;
}

type Handler = (
  global: GlobalOptions,
  environment: RunEnvironment,
) => Promise<ExitCode>;

/**
 * Build the Commander program.
 *
 * `register` receives each command's handler. `io` routes Commander's own help
 * and usage output through the same streams as everything else, so tests can
 * capture it and `--json` output stays pipeable.
 */
export function createProgram(
  register: (name: string, handler: Handler) => void,
  io: {
    readonly stdout?: (text: string) => void;
    readonly stderr?: (text: string) => void;
  } = {},
): Command {
  const program = new Command();

  const writeOut = io.stdout ?? ((text: string) => void process.stdout.write(text));
  const writeErr = io.stderr ?? ((text: string) => void process.stderr.write(text));

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
      writeOut,
      // Commander writes usage errors to stdout by default; diagnostics belong on
      // stderr so a caller parsing stdout is not handed an error message.
      writeErr,
    });

  program.exitOverride();

  program
    .command('init')
    .description('Create .skillbox/ with a project manifest and lockfile.')
    .option('--name <name>', 'Project name. Defaults to the directory name.')
    .option('--force', 'Overwrite an existing configuration.')
    .action((options: { name?: string; force?: boolean }) => {
      register('init', (global, environment) =>
        initCommand(context(global, environment), options),
      );
    });

  program
    .command('search')
    .description('Search the catalog by name, description, kind, and tags.')
    .argument('[query]', 'Text to search for. Omit to list everything.')
    .option('--kind <kind>', 'Filter by resource kind.')
    .option('--tag <tag>', 'Filter by tag. Repeatable.', collect, [])
    .option('--limit <n>', 'Maximum results.', '20')
    .action(
      (
        query: string | undefined,
        options: { kind?: string; tag: string[]; limit: string },
      ) => {
        register('search', (global, environment) =>
          searchCommand(context(global, environment), query, {
            kind: options.kind,
            tag: options.tag.length > 0 ? options.tag : undefined,
            limit: options.limit,
          }),
        );
      },
    );

  program
    .command('list')
    .description('List resources installed in the current project.')
    .option('--kind <kind>', 'Filter by resource kind.')
    .action((options: { kind?: string }) => {
      register('list', (global, environment) =>
        listCommand(context(global, environment), options),
      );
    });

  program
    .command('inspect')
    .description('Show a resource manifest, permissions, and install target.')
    .argument('<resource>', 'Resource reference, for example skillbox/code-review.')
    .action((resource: string) => {
      register('inspect', (global, environment) =>
        inspectCommand(context(global, environment), resource),
      );
    });

  program
    .command('add')
    .description('Install a resource and its dependencies.')
    .argument(
      '<resource>',
      'Resource reference, for example skillbox/code-review@^0.1.0.',
    )
    .option('--target <path>', 'Override the install destination.')
    .option('--dry-run', 'Show the plan and exit without changing anything.')
    .option('--force', 'Overwrite conflicting files.')
    .option('-y, --yes', 'Skip confirmation.')
    .action(
      (
        resource: string,
        options: { target?: string; dryRun?: boolean; force?: boolean; yes?: boolean },
      ) => {
        register('add', (global, environment) =>
          addCommand(context(global, environment), resource, options),
        );
      },
    );

  program
    .command('remove')
    .description('Remove an installed resource.')
    .argument('<resource>', 'Resource reference, for example skillbox/code-review.')
    .option('--force', 'Remove modified files, and remove despite dependents.')
    .option('--dry-run', 'Show what would be removed without changing anything.')
    .action((resource: string, options: { force?: boolean; dryRun?: boolean }) => {
      register('remove', (global, environment) =>
        removeCommand(context(global, environment), resource, options),
      );
    });

  program
    .command('validate')
    .description('Validate resource manifests and their references.')
    .argument('[path]', 'Resource directory, or a directory of resources.')
    .option('--strict', 'Treat warnings as errors.')
    .action((target: string | undefined, options: { strict?: boolean }) => {
      register('validate', (global, environment) =>
        validateCommand(context(global, environment), target, options),
      );
    });

  program
    .command('update')
    .description('Update installed resources to newer compatible versions.')
    .argument('[resource]', 'Limit to one resource. Omit to consider all.')
    .option('--dry-run', 'Show the plan and exit without changing anything.')
    .option('--force', 'Overwrite conflicting files.')
    .action(
      (
        resource: string | undefined,
        options: { dryRun?: boolean; force?: boolean },
      ) => {
        register('update', (global, environment) =>
          updateCommand(context(global, environment), resource, options),
        );
      },
    );

  program
    .command('doctor')
    .description('Diagnose the current project.')
    .option('--strict', 'Treat warnings as errors.')
    .action((options: { strict?: boolean }) => {
      register('doctor', (global, environment) =>
        doctorCommand(context(global, environment), options),
      );
    });

  return program;
}

function context(global: GlobalOptions, environment: RunEnvironment) {
  const options: CreateContextOptions = {
    registry: global.registry,
    project: global.project,
    json: global.json,
    color: normalizeColor(global.color),
    ...environment,
  };

  return createContext(options);
}

/**
 * Translate Commander's `--no-color` into a tri-state.
 *
 * Commander gives `color: true` by default for a negated boolean option, so a
 * plain `true` means "the user said nothing" rather than "force color on". Only
 * `false` is an explicit instruction; anything else defers to TTY detection.
 */
function normalizeColor(color: boolean | undefined): boolean | undefined {
  return color === false ? false : undefined;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/**
 * Run the CLI.
 *
 * Returns the exit code rather than calling `process.exit`, so the caller controls
 * termination and tests can assert on the value.
 */
export async function run(
  argv: readonly string[],
  environment: RunEnvironment = {},
): Promise<number> {
  let handler: Handler | undefined;
  let commandName = 'skillbox';

  const program = createProgram(
    (name, registered) => {
      commandName = name;
      handler = registered;
    },
    { stdout: environment.stdout, stderr: environment.stderr },
  );

  // Invoked with no arguments at all. Showing help beats exiting silently.
  if (argv.length <= 2) {
    program.outputHelp();
    return EXIT_CODES.SUCCESS;
  }

  try {
    await program.parseAsync([...argv]);
  } catch (error) {
    return exitCodeForCommanderError(error);
  }

  if (handler === undefined) return EXIT_CODES.SUCCESS;

  const global = program.opts<GlobalOptions>();

  try {
    return await handler(global, environment);
  } catch (error) {
    const writer = createWriter({
      json: global.json,
      color: normalizeColor(global.color),
      ...environment,
    });

    return renderError(writer, error, commandName);
  }
}

/**
 * Map a Commander outcome to an exit code.
 *
 * `--help` and `--version` are implemented as thrown errors by `exitOverride`;
 * both are successful outcomes.
 */
function exitCodeForCommanderError(error: unknown): ExitCode {
  if (!(error instanceof CommanderError)) throw error;

  switch (error.code) {
    case 'commander.helpDisplayed':
    case 'commander.help':
    case 'commander.version':
      return EXIT_CODES.SUCCESS;
    default:
      return EXIT_CODES.USAGE;
  }
}
