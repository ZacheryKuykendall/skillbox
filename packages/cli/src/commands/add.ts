import {
  applyPlan,
  assertNoConflicts,
  describeConflict,
  parseResourceReference,
  planInstall,
  writeLockfile,
  writeProjectManifest,
  type InstallPlan,
} from '@skillbox/core';

import type { CommandContext } from '../context.js';
import { EXIT_CODES, type ExitCode } from '../exit-codes.js';
import { pluralize, type Writer } from '../output.js';

export interface AddCommandOptions {
  readonly target?: string | undefined;
  readonly dryRun?: boolean | undefined;
  readonly force?: boolean | undefined;
  readonly yes?: boolean | undefined;
}

/**
 * `skillbox add <resource>` — install a resource and its dependencies.
 *
 * Shows the plan, including declared permissions and required environment
 * variable names, before anything is written (SR-6). `--dry-run` uses the same
 * planning path and stops before applying, so it cannot drift from real behavior.
 */
export async function addCommand(
  context: CommandContext,
  reference: string,
  options: AddCommandOptions = {},
): Promise<ExitCode> {
  const { writer } = context;

  const parsed = parseResourceReference(reference);
  const catalog = await context.catalog();
  const project = await context.project();

  const plan = await planInstall({
    projectRoot: project.root,
    catalog,
    lockfile: project.lockfile,
    requested: [
      {
        reference: parsed.qualifiedName,
        ...(parsed.version === undefined ? {} : { range: parsed.version }),
        ...(options.target === undefined ? {} : { target: options.target }),
      },
    ],
  });

  if (writer.isJson) {
    return addJson(context, plan, parsed.version, options);
  }

  renderPlan(writer, plan);

  if (options.dryRun === true) {
    writer.line(writer.style('dim', 'Dry run: no changes were made.'));
    writer.line();
    return EXIT_CODES.SUCCESS;
  }

  // Conflicts abort before any write, so a refusal leaves the project untouched.
  assertNoConflicts(plan, options.force === true);

  if (plan.empty) {
    writer.line(
      writer.style('dim', 'Already installed at the resolved version. Nothing to do.'),
    );
    writer.line();
    return EXIT_CODES.SUCCESS;
  }

  const result = await applyPlan({
    plan,
    manifest: project.manifest,
    lockfile: project.lockfile,
    requestedRanges: rangesFor(plan, parsed.version),
    registryRoot: catalog.root,
  });

  await writeProjectManifest(project.root, result.manifest);
  await writeLockfile(project.root, result.lockfile);

  writer.line(
    writer.style(
      'green',
      `Installed ${pluralize(result.installed.length, 'resource')}.`,
    ),
  );

  for (const installed of result.installed) {
    writer.line(`  ${installed.qualifiedName}@${installed.version}`);
  }

  writer.line();
  writer.line(
    writer.style(
      'dim',
      'Recorded in .skillbox/skillbox.yaml and .skillbox/skillbox.lock.',
    ),
  );
  writer.line();

  return EXIT_CODES.SUCCESS;
}

async function addJson(
  context: CommandContext,
  plan: InstallPlan,
  requestedRange: string | undefined,
  options: AddCommandOptions,
): Promise<ExitCode> {
  const { writer } = context;

  const planPayload = {
    resources: plan.resources.map((resource) => ({
      resource: resource.qualifiedName,
      version: resource.version,
      kind: resource.kind,
      target: resource.target,
      direct: resource.direct,
      alreadyInstalled: resource.alreadyInstalled,
      files: resource.files.map((file) => file.destination),
    })),
    permissions: plan.permissions,
    environment: plan.env.map((variable) => variable.name),
    conflicts: plan.conflicts,
    missingOptional: plan.missingOptional,
  };

  if (options.dryRun === true) {
    writer.json({
      ok: true,
      command: 'add',
      data: { dryRun: true, plan: planPayload },
    });
    return EXIT_CODES.SUCCESS;
  }

  assertNoConflicts(plan, options.force === true);

  const project = await context.project();
  const catalog = await context.catalog();

  const result = await applyPlan({
    plan,
    manifest: project.manifest,
    lockfile: project.lockfile,
    requestedRanges: rangesFor(plan, requestedRange),
    registryRoot: catalog.root,
  });

  await writeProjectManifest(project.root, result.manifest);
  await writeLockfile(project.root, result.lockfile);

  writer.json({
    ok: true,
    command: 'add',
    data: {
      dryRun: false,
      plan: planPayload,
      installed: result.installed,
      skipped: result.skipped,
    },
  });

  return EXIT_CODES.SUCCESS;
}

/**
 * The version range to record for each directly requested resource.
 *
 * When no range was given, a caret on the resolved version is recorded, matching
 * what a user would most likely have written themselves.
 */
function rangesFor(
  plan: InstallPlan,
  requestedRange: string | undefined,
): Map<string, string> {
  const ranges = new Map<string, string>();

  for (const resource of plan.resources) {
    if (!resource.direct) continue;
    ranges.set(resource.qualifiedName, requestedRange ?? `^${resource.version}`);
  }

  return ranges;
}

function renderPlan(writer: Writer, plan: InstallPlan): void {
  writer.line();
  writer.line(writer.style('bold', 'Install plan'));
  writer.line();

  for (const resource of plan.resources) {
    const suffix = resource.direct ? '' : ` ${writer.style('dim', '(dependency)')}`;

    writer.line(
      `  ${writer.style('bold', `${resource.qualifiedName}@${resource.version}`)}  ${writer.style('dim', resource.kind)}${suffix}`,
    );

    for (const file of resource.files) {
      const marker = file.overwrites
        ? writer.style('yellow', '~')
        : writer.style('green', '+');
      writer.line(`    ${marker} ${file.destination}`);
    }

    if (resource.deprecated) {
      writer.line(`    ${writer.style('yellow', 'This resource is deprecated.')}`);
    }

    writer.line();
  }

  if (plan.permissions.length > 0) {
    writer.line(writer.style('bold', 'Permissions requested'));
    for (const permission of plan.permissions) writer.line(`  ${permission}`);
    writer.line();
    writer.line(
      writer.style(
        'dim',
        '  Declared by the resource author. Skillbox shows them but does not enforce them.',
      ),
    );
    writer.line();
  }

  if (plan.env.length > 0) {
    writer.line(writer.style('bold', 'Environment variables required'));
    for (const variable of plan.env) {
      writer.line(`  ${variable.name}  ${writer.style('dim', variable.description)}`);
    }
    writer.line();
    writer.line(
      writer.style('dim', '  Names only. Skillbox never reads or stores their values.'),
    );
    writer.line();
  }

  if (plan.missingOptional.length > 0) {
    writer.line(writer.style('yellow', 'Optional dependencies not found'));
    for (const missing of plan.missingOptional) writer.line(`  ${missing}`);
    writer.line();
  }

  if (plan.conflicts.length > 0) {
    writer.line(writer.style('red', 'Conflicts'));
    for (const conflict of plan.conflicts) {
      writer.line(
        `  ${conflict.path}  ${writer.style('dim', describeConflict(conflict))}`,
      );
    }
    writer.line();
  }
}
