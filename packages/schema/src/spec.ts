import { z } from 'zod';

import {
  DESCRIPTION_MAX_LENGTH,
  ENV_NAME_MAX_LENGTH,
  ENV_NAME_PATTERN,
  PERMISSIONS,
  PLATFORMS,
  RUNTIME_TYPES,
  VALUE_TYPES,
} from './constants.js';
import {
  identifierSchema,
  resourceNameSchema,
  versionRangeSchema,
} from './identifier.js';
import { manifestPathListSchema, manifestPathSchema } from './paths.js';

/**
 * Spec fields shared by every resource kind.
 *
 * Kind-specific fields live in ./kinds/. See
 * docs/architecture/resource-model.md, which is normative.
 */

const shortDescriptionSchema = z
  .string()
  .min(1, { message: 'a description is required' })
  .max(DESCRIPTION_MAX_LENGTH);

/** A declared value type. */
export const valueTypeSchema = z.enum(VALUE_TYPES);

/**
 * A declared input.
 *
 * Inputs are declarations for humans and tooling, not a validated call
 * interface: Skillbox never invokes a resource.
 */
export const inputSchema = z
  .object({
    name: identifierSchema,
    type: valueTypeSchema,
    description: shortDescriptionSchema,
    required: z.boolean().optional(),
    default: z.unknown().optional(),
    values: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.type === 'enum' && input.values === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'an enum input must declare its allowed "values"',
        path: ['values'],
      });
    }
    if (input.type !== 'enum' && input.values !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: '"values" is only meaningful when type is "enum"',
        path: ['values'],
      });
    }
    if (
      input.type === 'enum' &&
      input.values !== undefined &&
      typeof input.default === 'string' &&
      !input.values.includes(input.default)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `the default "${input.default}" is not one of the declared values`,
        path: ['default'],
      });
    }
  });

export type ResourceInput = z.infer<typeof inputSchema>;

/** A declared output. */
export const outputSchema = z
  .object({
    name: identifierSchema,
    type: valueTypeSchema,
    description: shortDescriptionSchema,
  })
  .strict();

export type ResourceOutput = z.infer<typeof outputSchema>;

/**
 * A dependency on another resource.
 *
 * The version is a separate field rather than appended to `resource` so a range
 * containing "@" or a space never needs escaping.
 */
export const dependencySchema = z
  .object({
    resource: resourceNameSchema,
    version: versionRangeSchema,
    optional: z.boolean().optional(),
  })
  .strict();

export type ResourceDependency = z.infer<typeof dependencySchema>;

/**
 * A required environment variable, declared by **name only**.
 *
 * There is deliberately no field for a value, and the strict object means one
 * cannot be added by a resource author. Skillbox never reads, stores, or prints
 * the value of a declared variable (SR-7, SR-8).
 */
export const envVarSchema = z
  .object({
    name: z.string().max(ENV_NAME_MAX_LENGTH).regex(ENV_NAME_PATTERN, {
      message:
        'must be an uppercase environment variable name such as SKILLBOX_API_TOKEN',
    }),
    description: shortDescriptionSchema,
    required: z.boolean().optional(),
    secret: z.boolean().optional(),
  })
  .strict();

export type ResourceEnvVar = z.infer<typeof envVarSchema>;

/**
 * A declared permission, from a closed vocabulary.
 *
 * Permissions are validated and shown to the user before installation, but
 * **not enforced** in v0.1.0: Skillbox provides no runtime to enforce them in.
 * See docs/architecture/security-model.md.
 */
export const permissionSchema = z.enum(PERMISSIONS);

/** Runtime requirements. Meaningful for script, api, and component resources. */
export const runtimeSchema = z
  .object({
    type: z.enum(RUNTIME_TYPES),
    version: versionRangeSchema.optional(),
  })
  .strict();

export type ResourceRuntime = z.infer<typeof runtimeSchema>;

/** Compatibility constraints. */
export const compatibilitySchema = z
  .object({
    skillbox: versionRangeSchema.optional(),
    platforms: z.array(z.enum(PLATFORMS)).min(1).optional(),
  })
  .strict();

export type ResourceCompatibility = z.infer<typeof compatibilitySchema>;

/** How a resource's files are placed in a project. */
export const installSchema = z
  .object({
    target: manifestPathSchema.optional(),
    strategy: z.enum(['directory', 'flat']).optional(),
  })
  .strict();

export type ResourceInstall = z.infer<typeof installSchema>;

/**
 * The spec fields every kind shares.
 *
 * Exported as a raw shape rather than a schema so kind modules can extend it.
 * Composing with `.extend()` on a strict object works, but building each kind
 * from the shape keeps every kind's strictness declared in one place.
 */
export const baseSpecShape = {
  entrypoint: manifestPathSchema,
  files: manifestPathListSchema,
  install: installSchema.optional(),
  inputs: z.array(inputSchema).optional(),
  outputs: z.array(outputSchema).optional(),
  dependencies: z.array(dependencySchema).optional(),
  env: z.array(envVarSchema).optional(),
  permissions: z.array(permissionSchema).optional(),
  runtime: runtimeSchema.optional(),
  compatibility: compatibilitySchema.optional(),
} as const;

/**
 * Cross-field checks that apply to every kind.
 *
 * Kept separate from the shape so each kind schema can apply them after adding
 * its own fields.
 */
export function refineBaseSpec(
  spec: {
    entrypoint: string;
    files: readonly string[];
    inputs?: readonly { name: string }[] | undefined;
    outputs?: readonly { name: string }[] | undefined;
    dependencies?: readonly { resource: string }[] | undefined;
    env?: readonly { name: string }[] | undefined;
    permissions?: readonly string[] | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  // The entrypoint must be a declared file, or installation would place a
  // resource whose primary file is missing.
  if (!spec.files.includes(spec.entrypoint)) {
    ctx.addIssue({
      code: 'custom',
      message: `the entrypoint "${spec.entrypoint}" must also be listed in spec.files`,
      path: ['entrypoint'],
    });
  }

  reportDuplicates(
    spec.inputs?.map((i) => i.name),
    'inputs',
    'input',
    ctx,
  );
  reportDuplicates(
    spec.outputs?.map((o) => o.name),
    'outputs',
    'output',
    ctx,
  );
  reportDuplicates(
    spec.env?.map((e) => e.name),
    'env',
    'environment variable',
    ctx,
  );
  reportDuplicates(
    spec.dependencies?.map((d) => d.resource),
    'dependencies',
    'dependency',
    ctx,
  );
  reportDuplicates(spec.permissions, 'permissions', 'permission', ctx);
}

function reportDuplicates(
  names: readonly string[] | undefined,
  field: string,
  label: string,
  ctx: z.RefinementCtx,
): void {
  if (names === undefined) return;

  const seen = new Set<string>();
  for (const [index, name] of names.entries()) {
    if (seen.has(name)) {
      ctx.addIssue({
        code: 'custom',
        message: `duplicate ${label} "${name}"`,
        path: [field, index],
      });
    }
    seen.add(name);
  }
}
