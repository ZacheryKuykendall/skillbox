import path from 'node:path';

import { initProject } from '@skillbox/core';

import type { CommandContext } from '../context.js';
import { EXIT_CODES, type ExitCode } from '../exit-codes.js';

export interface InitCommandOptions {
  readonly name?: string | undefined;
  readonly force?: boolean | undefined;
}

/** `skillbox init` — create `.skillbox/` with a manifest and lockfile. */
export async function initCommand(
  context: CommandContext,
  options: InitCommandOptions = {},
): Promise<ExitCode> {
  const { writer } = context;

  const root = context.options.project ?? context.cwd;

  const result = await initProject({
    root: path.resolve(context.cwd, root),
    name: options.name,
    force: options.force,
  });

  if (writer.isJson) {
    writer.json({
      ok: true,
      command: 'init',
      data: { root: result.root, name: result.name, created: result.created },
    });
    return EXIT_CODES.SUCCESS;
  }

  writer.line();
  writer.line(writer.style('green', 'Initialized Skillbox project.'));
  writer.line();

  for (const created of result.created) {
    writer.line(`  Created ${writer.style('cyan', created)}`);
  }

  writer.line();
  writer.line(
    writer.style('dim', 'Next: skillbox search <query> to find resources to add.'),
  );
  writer.line();

  return EXIT_CODES.SUCCESS;
}
