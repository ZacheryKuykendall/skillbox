import {
  applyPlan,
  assertNoConflicts,
  describeConflict,
  parseResourceReference,
  planUpdate,
  requestedResources,
  writeLockfile,
  writeProjectManifest,
} from '@skillbox/core';

import type { CommandContext } from '../context.js';
import { EXIT_CODES, type ExitCode } from '../exit-codes.js';
import { pluralize, table } from '../output.js';

export interface UpdateCommandOptions {
  readonly dryRun?: boolean | undefined;
  readonly force?: boolean | undefined;
}

/**
 * `skillbox update [resource]` — update to newer compatible versions.
 *
 * Respects the range recorded in the project manifest, so update never crosses a
 * range boundary (FR-10.1).
 */
export async function updateCommand(
  context: CommandContext,
  reference: string | undefined,
  options: UpdateCommandOptions = {},
): Promise<ExitCode> {
  const { writer } = context;

  const catalog = await context.catalog();
  const project = await context.project();

  const only =
    reference === undefined
      ? undefined
      : parseResourceReference(reference).qualifiedName;

  const report = await planUpdate({ project, catalog, only });

  if (writer.isJson) {
    writer.json({
      ok: true,
      command: 'update',
      data: {
        dryRun: options.dryRun === true,
        candidates: report.candidates,
        updatable: report.updatable.map((candidate) => candidate.qualifiedName),
      },
    });

    if (report.plan === undefined || options.dryRun === true) return EXIT_CODES.SUCCESS;

    assertNoConflicts(report.plan, options.force === true);
    await applyUpdate(context, report.plan, project, catalog.root);

    return EXIT_CODES.SUCCESS;
  }

  writer.line();

  if (report.candidates.length === 0) {
    writer.line('No resources are installed.');
    writer.line();
    return EXIT_CODES.SUCCESS;
  }

  const blocked = report.candidates.filter(
    (candidate) => candidate.blockedByRange !== undefined,
  );

  if (report.updatable.length === 0) {
    writer.line(writer.style('green', 'Everything is up to date.'));

    if (blocked.length > 0) {
      writer.line();
      writer.line(
        `${pluralize(blocked.length, 'resource')} ${blocked.length === 1 ? 'has' : 'have'} a newer version outside the requested range:`,
      );
      writer.line();
      for (const row of table(
        blocked.map((candidate) => [
          candidate.qualifiedName,
          `at ${candidate.currentVersion}`,
          `available ${candidate.blockedByRange ?? ''}`,
          `range ${candidate.requestedRange}`,
        ]),
      )) {
        writer.line(`  ${row}`);
      }
      writer.line();
      writer.line(
        writer.style(
          'dim',
          'Widen the range in .skillbox/skillbox.yaml to move across a major version.',
        ),
      );
    }

    writer.line();
    return EXIT_CODES.SUCCESS;
  }

  writer.line(writer.style('bold', 'Update plan'));
  writer.line();

  for (const row of table(
    report.updatable.map((candidate) => [
      candidate.qualifiedName,
      candidate.currentVersion,
      '->',
      candidate.targetVersion,
    ]),
  )) {
    writer.line(`  ${row}`);
  }

  writer.line();

  if (report.plan !== undefined && report.plan.conflicts.length > 0) {
    writer.line(writer.style('red', 'Conflicts'));
    for (const conflict of report.plan.conflicts) {
      writer.line(
        `  ${conflict.path}  ${writer.style('dim', describeConflict(conflict))}`,
      );
    }
    writer.line();
  }

  if (options.dryRun === true) {
    writer.line(writer.style('dim', 'Dry run: no changes were made.'));
    writer.line();
    return EXIT_CODES.SUCCESS;
  }

  if (report.plan === undefined) return EXIT_CODES.SUCCESS;

  assertNoConflicts(report.plan, options.force === true);
  await applyUpdate(context, report.plan, project, catalog.root);

  writer.line(
    writer.style('green', `Updated ${pluralize(report.updatable.length, 'resource')}.`),
  );
  writer.line();

  return EXIT_CODES.SUCCESS;
}

async function applyUpdate(
  context: CommandContext,
  plan: Parameters<typeof applyPlan>[0]['plan'],
  project: Awaited<ReturnType<CommandContext['project']>>,
  registryRoot: string,
): Promise<void> {
  const requested = requestedResources(project.manifest);

  const result = await applyPlan({
    plan,
    manifest: project.manifest,
    lockfile: project.lockfile,
    requestedRanges: new Map(
      [...requested].map(([name, entry]) => [name, entry.version] as const),
    ),
    registryRoot,
  });

  // Written only after every file operation succeeded (FR-10.4).
  await writeProjectManifest(project.root, result.manifest);
  await writeLockfile(project.root, result.lockfile);
}
