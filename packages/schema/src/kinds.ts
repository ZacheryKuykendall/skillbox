import { z } from 'zod';

import { identifierSchema, resourceNameSchema } from './identifier.js';
import { manifestPathSchema } from './paths.js';
import { baseSpecShape, inputSchema, refineBaseSpec } from './spec.js';

/**
 * Kind-specific spec schemas.
 *
 * Each kind adds only the fields meaningful to it (FR-1.12): a prompt does not
 * describe an interpreter, and a component does not describe a model. All shared
 * fields from {@link baseSpecShape} remain available to every kind.
 *
 * Each schema is written out rather than produced by a generic helper. A
 * generic `defineSpec<T>` loses Zod's inference through the shape merge, which
 * degrades the `superRefine` callback's argument to `Record<string, unknown>`
 * and would require a cast to recover.
 *
 * See docs/architecture/resource-model.md, which is normative.
 */

const envNameSchema = z
  .string()
  .max(128)
  .regex(/^[A-Z][A-Z0-9_]*$/, {
    message: 'must be an uppercase environment variable name',
  });

// --- prompt -----------------------------------------------------------------

export const promptSpecSchema = z
  .object({
    ...baseSpecShape,
    format: z.enum(['markdown', 'text']).optional(),
    model: z
      .object({
        providers: z.array(identifierSchema).min(1).optional(),
        minContextTokens: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine(refineBaseSpec);

// --- skill ------------------------------------------------------------------

export const skillSpecSchema = z
  .object({
    ...baseSpecShape,
    instructions: manifestPathSchema.optional(),
    resources: z.array(manifestPathSchema).optional(),
  })
  .strict()
  .superRefine(refineBaseSpec);

// --- agent ------------------------------------------------------------------

export const agentSpecSchema = z
  .object({
    ...baseSpecShape,
    role: z
      .string()
      .min(10, { message: 'a role statement is required and should be descriptive' })
      .max(200),
    tools: z.array(identifierSchema).optional(),
    prompts: z.array(resourceNameSchema).optional(),
  })
  .strict()
  .superRefine(refineBaseSpec);

// --- script -----------------------------------------------------------------

export const scriptSpecSchema = z
  .object({
    ...baseSpecShape,
    /**
     * How a user would run this script. Skillbox never acts on it: installing a
     * script and running one are separate actions (SR-5).
     */
    interpreter: z.enum(['node', 'python', 'bash', 'powershell']),
    args: z.array(inputSchema).optional(),
    executable: z.boolean().optional(),
  })
  .strict()
  .superRefine(refineBaseSpec);

// --- api --------------------------------------------------------------------

export const apiSpecSchema = z
  .object({
    ...baseSpecShape,
    protocol: z.enum(['rest', 'graphql', 'grpc']),
    /** The **name** of the environment variable holding the base URL. */
    baseUrlEnv: envNameSchema.optional(),
    auth: z
      .object({
        type: z.enum(['none', 'bearer', 'basic', 'apiKey']),
        /** The **name** of the environment variable holding the token. */
        tokenEnv: envNameSchema.optional(),
      })
      .strict()
      .optional(),
    operations: z
      .array(
        z
          .object({
            name: identifierSchema,
            method: z
              .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
              .optional(),
            path: z.string().min(1).max(256).optional(),
            description: z.string().min(1).max(200),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .superRefine(refineBaseSpec);

// --- workflow ---------------------------------------------------------------

export const workflowStepSchema = z
  .object({
    name: identifierSchema,
    uses: resourceNameSchema,
    description: z.string().min(1).max(200),
    with: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const workflowSpecSchema = z
  .object({
    ...baseSpecShape,
    steps: z
      .array(workflowStepSchema)
      .min(1, { message: 'a workflow must declare at least one step' }),
  })
  .strict()
  .superRefine((spec, ctx) => {
    refineBaseSpec(spec, ctx);

    const seen = new Set<string>();
    for (const [index, step] of spec.steps.entries()) {
      if (seen.has(step.name)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate step name "${step.name}"`,
          path: ['steps', index, 'name'],
        });
      }
      seen.add(step.name);
    }
  });

// --- component --------------------------------------------------------------

export const componentSpecSchema = z
  .object({
    ...baseSpecShape,
    language: z.enum(['typescript', 'javascript', 'python']),
    exports: z.array(z.string().min(1).max(128)).optional(),
    /**
     * Host-package requirements. Informational: Skillbox does not install
     * language packages, it reports the requirement so you can add it yourself.
     */
    peerDependencies: z.record(z.string().min(1), z.string().min(1)).optional(),
  })
  .strict()
  .superRefine(refineBaseSpec);

export type PromptSpec = z.infer<typeof promptSpecSchema>;
export type SkillSpec = z.infer<typeof skillSpecSchema>;
export type AgentSpec = z.infer<typeof agentSpecSchema>;
export type ScriptSpec = z.infer<typeof scriptSpecSchema>;
export type ApiSpec = z.infer<typeof apiSpecSchema>;
export type WorkflowSpec = z.infer<typeof workflowSpecSchema>;
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type ComponentSpec = z.infer<typeof componentSpecSchema>;
