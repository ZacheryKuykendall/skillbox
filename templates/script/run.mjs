#!/usr/bin/env node
/**
 * TODO describe what this script does.
 *
 * State its effects plainly here. A reader deciding whether to run it should not
 * have to infer them from the code.
 *
 * Usage:
 *   node run.mjs [--todo <value>]
 */
import { parseArgs } from 'node:util';

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      todo: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: false,
  });

  if (values.help === true) {
    process.stdout.write(
      [
        'TODO describe the script.',
        '',
        'Usage: node run.mjs [--todo <value>]',
        '',
      ].join('\n'),
    );
    process.exit(0);
  }

  return values;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));

  // TODO implement.
  // Validate inputs before doing any work, and exit non-zero with a message on
  // stderr when they are wrong. A script that fails silently is worse than one
  // that refuses to start.
  process.stdout.write(`TODO output. todo=${options.todo ?? '(unset)'}\n`);
}

await main();
