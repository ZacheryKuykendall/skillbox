import { z } from 'zod';

import { API_VERSION, LOCKFILE_VERSION, RESOURCE_KINDS } from './constants.js';
import {
  identifierSchema,
  resourceNameSchema,
  versionRangeSchema,
  versionSchema,
} from './identifier.js';
import { manifestPathSchema } from './paths.js';

/**
 * Project configuration schemas.
 *
 * Two files with different jobs: the project manifest records what was
 * *requested*, the lockfile records what was *resolved and installed*. See
 * ADR-0004 and docs/architecture/overview.md.
 */

/** An SRI-style integrity digest, for example `sha256-<base64>`. */
export const integritySchema = z.string().regex(/^sha256-[A-Za-z0-9+/]{43}=$/, {
  message: 'must be an SRI-style digest such as sha256-<44-character base64>',
});

// --- project manifest -------------------------------------------------------

/** One requested resource in the project manifest. */
export const projectResourceSchema = z
  .object({
    resource: resourceNameSchema,
    version: versionRangeSchema,
    /** Overrides the resource's declared install target. */
    target: manifestPathSchema.optional(),
  })
  .strict();

export type ProjectResource = z.infer<typeof projectResourceSchema>;

/**
 * Project variables substituted into installed text files.
 *
 * Configuration only, never secrets. Secrets are supplied through environment
 * variables and never enter a Skillbox artifact (SR-7).
 */
export const projectVariablesSchema = z.record(identifierSchema, z.string());

export const projectManifestSchema = z
  .object({
    apiVersion: z.literal(API_VERSION, {
      message: `unsupported apiVersion. This release understands only "${API_VERSION}"`,
    }),
    kind: z.literal('Project', {
      message: 'a project manifest must declare kind: Project',
    }),
    metadata: z
      .object({
        name: identifierSchema,
        description: z.string().max(200).optional(),
      })
      .strict(),
    spec: z
      .object({
        resources: z.array(projectResourceSchema).optional(),
        variables: projectVariablesSchema.optional(),
      })
      .strict()
      .superRefine((spec, ctx) => {
        if (spec.resources === undefined) return;

        const seen = new Set<string>();
        for (const [index, entry] of spec.resources.entries()) {
          if (seen.has(entry.resource)) {
            ctx.addIssue({
              code: 'custom',
              message: `duplicate resource "${entry.resource}"`,
              path: ['resources', index, 'resource'],
            });
          }
          seen.add(entry.resource);
        }
      }),
  })
  .strict();

export type ProjectManifest = z.infer<typeof projectManifestSchema>;

// --- lockfile ---------------------------------------------------------------

/** Where a locked resource came from. Only local sources exist in v0.1.0. */
export const lockSourceSchema = z
  .object({
    type: z.literal('local'),
    /** Path relative to the registry root. Never absolute (ADR-0004). */
    path: manifestPathSchema,
  })
  .strict();

/**
 * Why a resource is installed.
 *
 * `direct` means the project asked for it; otherwise it is the qualified name of
 * the resource that depends on it.
 */
export const requestedBySchema = z.union([z.literal('direct'), resourceNameSchema]);

export const lockedResourceSchema = z
  .object({
    version: versionSchema,
    kind: z.enum(RESOURCE_KINDS),
    source: lockSourceSchema,
    /** Aggregate digest over the resource's sorted file digests. */
    integrity: integritySchema,
    target: manifestPathSchema,
    /** Installed path relative to the project root, mapped to its digest. */
    files: z.record(manifestPathSchema, integritySchema),
    dependencies: z.array(resourceNameSchema).optional(),
    requestedBy: requestedBySchema,
  })
  .strict();

export type LockedResource = z.infer<typeof lockedResourceSchema>;

/**
 * The lockfile.
 *
 * Deliberately contains no timestamp, no absolute path, and no machine data, so
 * reinstalling produces no diff. A lockfile that churns stops being reviewed,
 * and the integrity information it carries stops being read (ADR-0004).
 */
export const lockfileSchema = z
  .object({
    lockfileVersion: z.literal(LOCKFILE_VERSION, {
      message: `unsupported lockfileVersion. This release understands only ${String(LOCKFILE_VERSION)}`,
    }),
    resources: z.record(resourceNameSchema, lockedResourceSchema),
  })
  .strict();

export type Lockfile = z.infer<typeof lockfileSchema>;

/** An empty lockfile, as written by `skillbox init`. */
export function emptyLockfile(): Lockfile {
  return { lockfileVersion: LOCKFILE_VERSION, resources: {} };
}

/** An empty project manifest for a newly initialized project. */
export function emptyProjectManifest(name: string): ProjectManifest {
  return {
    apiVersion: API_VERSION,
    kind: 'Project',
    metadata: { name },
    spec: { resources: [] },
  };
}
