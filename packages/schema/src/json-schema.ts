import { z } from 'zod';

import { API_VERSION } from './constants.js';
import { resourceManifestSchema } from './manifest.js';
import { lockfileSchema, projectManifestSchema } from './project.js';

/**
 * JSON Schema generation.
 *
 * Zod stays the source of truth; these artifacts are derived and committed to
 * `schemas/` so editors get completion without a build step. A drift test fails
 * if the committed files no longer match, so the two cannot disagree (ADR-0002).
 */

/** A generated JSON Schema artifact and its destination filename. */
export interface GeneratedSchema {
  readonly filename: string;
  readonly title: string;
  readonly schema: Record<string, unknown>;
}

function generate(
  schema: z.ZodType,
  options: { filename: string; title: string; description: string; id: string },
): GeneratedSchema {
  const jsonSchema = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    // Manifests carry `z.unknown()` in a few places (input defaults, workflow
    // step arguments). Representing those as `{}` is accurate for JSON Schema;
    // throwing would block generation over a field that is genuinely untyped.
    unrepresentable: 'any',
    io: 'input',
    // The shared spec fields appear in all seven kind schemas. Extracting them
    // into $defs keeps the artifact an order of magnitude smaller and readable
    // by a human reviewing a diff.
    reused: 'ref',
  }) as Record<string, unknown>;

  return {
    filename: options.filename,
    title: options.title,
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: options.id,
      title: options.title,
      description: options.description,
      ...jsonSchema,
    },
  };
}

/** Every JSON Schema artifact, in a stable order. */
export function generateJsonSchemas(): GeneratedSchema[] {
  return [
    generate(resourceManifestSchema, {
      filename: 'resource-manifest.schema.json',
      id: `${API_VERSION}/resource-manifest`,
      title: 'Skillbox resource manifest',
      description:
        'A Skillbox resource manifest (skillbox.yaml). Generated from the Zod schemas; do not edit by hand.',
    }),
    generate(projectManifestSchema, {
      filename: 'project-manifest.schema.json',
      id: `${API_VERSION}/project-manifest`,
      title: 'Skillbox project manifest',
      description:
        'A Skillbox project manifest (.skillbox/skillbox.yaml). Generated from the Zod schemas; do not edit by hand.',
    }),
    generate(lockfileSchema, {
      filename: 'lockfile.schema.json',
      id: `${API_VERSION}/lockfile`,
      title: 'Skillbox lockfile',
      description:
        'A Skillbox lockfile (.skillbox/skillbox.lock). Generated from the Zod schemas; do not edit by hand.',
    }),
  ];
}

/**
 * Serialize a schema artifact deterministically.
 *
 * Two-space indentation and a trailing newline, matching what the generator
 * writes, so the drift test compares stable bytes.
 */
export function serializeJsonSchema(generated: GeneratedSchema): string {
  return `${JSON.stringify(generated.schema, null, 2)}\n`;
}
