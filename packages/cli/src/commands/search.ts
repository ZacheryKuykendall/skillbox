import { SkillboxError, search } from '@skillbox/core';
import { RESOURCE_KINDS, type ResourceKind } from '@skillbox/schema';

import type { CommandContext } from '../context.js';
import { EXIT_CODES, type ExitCode } from '../exit-codes.js';
import { pluralize } from '../output.js';

export interface SearchCommandOptions {
  readonly kind?: string | undefined;
  readonly tag?: readonly string[] | undefined;
  readonly limit?: string | undefined;
}

/** `skillbox search [query]` — search the local catalog. */
export async function searchCommand(
  context: CommandContext,
  query: string | undefined,
  options: SearchCommandOptions = {},
): Promise<ExitCode> {
  const { writer } = context;

  const kind = parseKind(options.kind);
  const limit = parseLimit(options.limit);

  const catalog = await context.catalog();

  const hits = search(catalog, {
    query,
    kind,
    tags: options.tag,
    limit,
  });

  if (writer.isJson) {
    writer.json({
      ok: true,
      command: 'search',
      data: {
        query: query ?? '',
        count: hits.length,
        results: hits.map((hit) => ({
          resource: hit.resource.qualifiedName,
          version: hit.resource.manifest.metadata.version,
          kind: hit.resource.manifest.kind,
          description: hit.resource.manifest.metadata.description,
          tags: hit.resource.manifest.metadata.tags ?? [],
          matchedFields: hit.matchedFields,
        })),
      },
    });
    return EXIT_CODES.SUCCESS;
  }

  writer.line();

  if (hits.length === 0) {
    // Finding nothing is a valid outcome, not a failure.
    writer.line(
      query === undefined || query.length === 0
        ? 'The catalog is empty.'
        : `No resources matched "${query}".`,
    );
    writer.line();
    writer.line(
      writer.style('dim', 'Run skillbox search with no query to list everything.'),
    );
    writer.line();
    return EXIT_CODES.SUCCESS;
  }

  const heading =
    query === undefined || query.length === 0
      ? `${pluralize(hits.length, 'resource')} in the catalog`
      : `${pluralize(hits.length, 'resource')} matched "${query}"`;

  writer.line(heading);
  writer.line();

  for (const hit of hits) {
    const { metadata, kind: resourceKind } = hit.resource.manifest;

    writer.line(
      `  ${writer.style('bold', hit.resource.qualifiedName)}@${metadata.version}  ${writer.style('dim', resourceKind)}`,
    );
    writer.line(`    ${metadata.description}`);

    if ((metadata.tags ?? []).length > 0) {
      writer.line(
        `    ${writer.style('dim', `tags: ${(metadata.tags ?? []).join(', ')}`)}`,
      );
    }

    writer.line();
  }

  writer.line(
    writer.style('dim', 'Run skillbox inspect <resource> to see what it declares.'),
  );
  writer.line();

  return EXIT_CODES.SUCCESS;
}

function parseKind(value: string | undefined): ResourceKind | undefined {
  if (value === undefined) return undefined;

  if (!(RESOURCE_KINDS as readonly string[]).includes(value)) {
    throw new SkillboxError({
      code: 'USAGE_ERROR',
      message: `"${value}" is not a resource kind.`,
      hint: `Valid kinds are: ${RESOURCE_KINDS.join(', ')}.`,
    });
  }

  return value as ResourceKind;
}

function parseLimit(value: string | undefined): number {
  if (value === undefined) return 20;

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < 0) {
    throw new SkillboxError({
      code: 'USAGE_ERROR',
      message: `"${value}" is not a valid limit.`,
      hint: 'Pass a non-negative whole number, for example --limit 50.',
    });
  }

  return parsed;
}
