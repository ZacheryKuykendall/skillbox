import {
  digestOfFile,
  fromPosix,
  requestedResources,
  type Project,
} from '@skillbox/core';
import { RESOURCE_KINDS, type ResourceKind } from '@skillbox/schema';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import type { CommandContext } from '../context.js';
import { EXIT_CODES, type ExitCode } from '../exit-codes.js';
import { pluralize, table } from '../output.js';

export interface ListCommandOptions {
  readonly kind?: string | undefined;
}

/** How healthy an installed resource is. */
type InstalledStatus = 'ok' | 'modified' | 'missing';

/** `skillbox list` — list installed resources with their versions and status. */
export async function listCommand(
  context: CommandContext,
  options: ListCommandOptions = {},
): Promise<ExitCode> {
  const { writer } = context;

  const project = await context.project();
  const requested = requestedResources(project.manifest);

  const rows: {
    resource: string;
    kind: string;
    requested: string;
    resolved: string;
    status: InstalledStatus;
    direct: boolean;
  }[] = [];

  for (const [qualifiedName, locked] of Object.entries(project.lockfile.resources).sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    if (
      options.kind !== undefined &&
      (RESOURCE_KINDS as readonly string[]).includes(options.kind) &&
      locked.kind !== (options.kind as ResourceKind)
    ) {
      continue;
    }

    rows.push({
      resource: qualifiedName,
      kind: locked.kind,
      requested: requested.get(qualifiedName)?.version ?? '(dependency)',
      resolved: locked.version,
      status: await statusOf(project, locked.files),
      direct: locked.requestedBy === 'direct',
    });
  }

  if (writer.isJson) {
    writer.json({
      ok: true,
      command: 'list',
      data: { count: rows.length, resources: rows },
    });
    return EXIT_CODES.SUCCESS;
  }

  writer.line();

  if (rows.length === 0) {
    writer.line('No resources are installed.');
    writer.line();
    writer.line(writer.style('dim', 'Run skillbox search to find resources to add.'));
    writer.line();
    return EXIT_CODES.SUCCESS;
  }

  writer.line(`${pluralize(rows.length, 'resource')} installed`);
  writer.line();

  const rendered = table(
    rows.map((row) => [
      row.resource,
      row.kind,
      `requested ${row.requested}`,
      `resolved ${row.resolved}`,
      row.status,
    ]),
  );

  for (const [index, line] of rendered.entries()) {
    const status = rows[index]?.status ?? 'ok';
    writer.line(`  ${status === 'ok' ? line : writer.style('yellow', line)}`);
  }

  writer.line();

  if (rows.some((row) => row.status !== 'ok')) {
    writer.line(
      writer.style('dim', 'Run skillbox doctor for detail on flagged resources.'),
    );
    writer.line();
  }

  return EXIT_CODES.SUCCESS;
}

/**
 * Determine a resource's status from its recorded digests.
 *
 * `missing` outranks `modified`: a gone file is the more serious problem, so it is
 * what gets reported.
 */
async function statusOf(
  project: Project,
  files: Readonly<Record<string, string>>,
): Promise<InstalledStatus> {
  let modified = false;

  for (const [installedPath, recordedDigest] of Object.entries(files)) {
    const absolute = path.join(project.root, fromPosix(installedPath));

    const stats = await stat(absolute).catch(() => undefined);
    if (stats === undefined) return 'missing';

    const currentDigest = await digestOfFile(absolute).catch(() => undefined);
    if (currentDigest !== recordedDigest) modified = true;
  }

  return modified ? 'modified' : 'ok';
}
