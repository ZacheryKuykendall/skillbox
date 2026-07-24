import {
  parseResourceReference,
  planRemove,
  removeResource,
  writeLockfile,
  writeProjectManifest,
} from '@skillbox/core';

import type { CommandContext } from '../context.js';
import { EXIT_CODES, type ExitCode } from '../exit-codes.js';
import { pluralize } from '../output.js';

export interface RemoveCommandOptions {
  readonly force?: boolean | undefined;
  readonly dryRun?: boolean | undefined;
}

/**
 * `skillbox remove <resource>` — remove an installed resource.
 *
 * Deletes only files the lockfile records as owned by the resource, and refuses to
 * delete a file edited since installation unless forced (FR-9.2).
 */
export async function removeCommand(
  context: CommandContext,
  reference: string,
  options: RemoveCommandOptions = {},
): Promise<ExitCode> {
  const { writer } = context;

  const parsed = parseResourceReference(reference);
  const project = await context.project();

  const plan = await planRemove(project, parsed.qualifiedName);

  if (options.dryRun === true) {
    if (writer.isJson) {
      writer.json({ ok: true, command: 'remove', data: { dryRun: true, plan } });
      return EXIT_CODES.SUCCESS;
    }

    writer.line();
    writer.line(writer.style('bold', `Removal plan for ${plan.qualifiedName}`));
    writer.line();

    for (const file of plan.files) writer.line(`  ${writer.style('red', '-')} ${file}`);
    for (const file of plan.modified) {
      writer.line(
        `  ${writer.style('yellow', '!')} ${file}  ${writer.style('dim', 'modified, would be kept')}`,
      );
    }
    for (const file of plan.missing) {
      writer.line(`  ${writer.style('dim', `? ${file}  already gone`)}`);
    }

    writer.line();
    writer.line(writer.style('dim', 'Dry run: no changes were made.'));
    writer.line();
    return EXIT_CODES.SUCCESS;
  }

  const result = await removeResource({
    project,
    qualifiedName: parsed.qualifiedName,
    force: options.force,
  });

  await writeProjectManifest(project.root, result.manifest);
  await writeLockfile(project.root, result.lockfile);

  if (writer.isJson) {
    writer.json({
      ok: true,
      command: 'remove',
      data: {
        resource: parsed.qualifiedName,
        removed: result.removed,
        preserved: result.preserved,
        removedDirectories: result.removedDirectories.length,
      },
    });
    return EXIT_CODES.SUCCESS;
  }

  writer.line();
  writer.line(
    writer.style(
      'green',
      `Removed ${parsed.qualifiedName} and ${pluralize(result.removed.length, 'file')}.`,
    ),
  );

  if (result.preserved.length > 0) {
    writer.line();
    writer.line(
      `${writer.style('yellow', 'kept')}  ${pluralize(result.preserved.length, 'modified file')}:`,
    );
    for (const file of result.preserved) writer.line(`      ${file}`);
  }

  writer.line();

  return EXIT_CODES.SUCCESS;
}
