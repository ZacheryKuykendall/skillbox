import { z } from 'zod';

import {
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  MAX_TAGS,
} from './constants.js';
import { identifierSchema, resourceNameSchema, versionSchema } from './identifier.js';

/**
 * The shared `metadata` block, identical for every resource kind.
 *
 * See docs/architecture/resource-model.md, which is normative.
 */

/** Deprecation notice for a resource that should no longer be adopted. */
export const deprecationSchema = z
  .object({
    reason: z
      .string()
      .min(1, { message: 'a deprecation reason is required' })
      .max(DESCRIPTION_MAX_LENGTH),
    replacement: resourceNameSchema.optional(),
  })
  .strict();

export type Deprecation = z.infer<typeof deprecationSchema>;

/**
 * Tags: lowercase identifiers, deduplicated.
 *
 * Normalization happens in the schema so downstream code never has to wonder
 * whether a tag has been lowercased yet. `transform` runs after the element
 * checks, so an invalid tag is still reported against its original value.
 */
export const tagsSchema = z
  .array(identifierSchema)
  .max(MAX_TAGS, { message: `at most ${String(MAX_TAGS)} tags are allowed` })
  .transform((tags) => [...new Set(tags)]);

/**
 * The `metadata` block.
 *
 * Strict: an unknown key is an error rather than being silently ignored, so a
 * typo fails loudly (FR-1.11).
 */
export const metadataSchema = z
  .object({
    namespace: identifierSchema,
    name: identifierSchema,
    version: versionSchema,
    description: z
      .string()
      .min(DESCRIPTION_MIN_LENGTH, {
        message: `must be at least ${String(DESCRIPTION_MIN_LENGTH)} characters so it is useful in search results`,
      })
      .max(DESCRIPTION_MAX_LENGTH, {
        message: `must be at most ${String(DESCRIPTION_MAX_LENGTH)} characters`,
      })
      .refine((value) => !value.includes('\n'), {
        message: 'must be a single line',
      }),
    tags: tagsSchema.optional(),
    license: z.string().min(1).max(128).optional(),
    homepage: z
      .string()
      .refine(
        (value) => {
          try {
            const url = new URL(value);
            return url.protocol === 'http:' || url.protocol === 'https:';
          } catch {
            return false;
          }
        },
        { message: 'must be an http or https URL' },
      )
      .optional(),
    deprecated: deprecationSchema.optional(),
  })
  .strict();

export type ResourceMetadata = z.infer<typeof metadataSchema>;
