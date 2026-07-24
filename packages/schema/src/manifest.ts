import { z } from 'zod';

import {
  API_VERSION,
  DEFAULT_INSTALL_TARGETS,
  RESOURCE_KINDS,
  SUPPORTED_API_VERSIONS,
  type ResourceKind,
} from './constants.js';
import { formatIdentifier } from './identifier.js';
import {
  agentSpecSchema,
  apiSpecSchema,
  componentSpecSchema,
  promptSpecSchema,
  scriptSpecSchema,
  skillSpecSchema,
  workflowSpecSchema,
} from './kinds.js';
import { metadataSchema } from './metadata.js';

/**
 * The resource manifest: a discriminated union on `kind`.
 *
 * See docs/architecture/resource-model.md, which is normative.
 */

/**
 * `apiVersion` gate.
 *
 * Checked before anything else so an unsupported version produces one clear
 * error naming the supported version, rather than a cascade of failures from
 * fields that moved between versions (FR-1.3).
 */
export const apiVersionSchema = z.literal(API_VERSION, {
  message: `unsupported apiVersion. This release understands only "${API_VERSION}"`,
});

const envelope = {
  apiVersion: apiVersionSchema,
  metadata: metadataSchema,
} as const;

export const promptManifestSchema = z
  .object({ ...envelope, kind: z.literal('prompt'), spec: promptSpecSchema })
  .strict();

export const skillManifestSchema = z
  .object({ ...envelope, kind: z.literal('skill'), spec: skillSpecSchema })
  .strict();

export const agentManifestSchema = z
  .object({ ...envelope, kind: z.literal('agent'), spec: agentSpecSchema })
  .strict();

export const scriptManifestSchema = z
  .object({ ...envelope, kind: z.literal('script'), spec: scriptSpecSchema })
  .strict();

export const apiManifestSchema = z
  .object({ ...envelope, kind: z.literal('api'), spec: apiSpecSchema })
  .strict();

export const workflowManifestSchema = z
  .object({ ...envelope, kind: z.literal('workflow'), spec: workflowSpecSchema })
  .strict();

export const componentManifestSchema = z
  .object({ ...envelope, kind: z.literal('component'), spec: componentSpecSchema })
  .strict();

/** Per-kind manifest schemas, for validating when the kind is already known. */
export const MANIFEST_SCHEMAS = {
  prompt: promptManifestSchema,
  skill: skillManifestSchema,
  agent: agentManifestSchema,
  script: scriptManifestSchema,
  api: apiManifestSchema,
  workflow: workflowManifestSchema,
  component: componentManifestSchema,
} as const;

/**
 * The resource manifest schema.
 *
 * A discriminated union on `kind` so an invalid manifest reports errors from the
 * matching kind's schema only. A plain union would report every kind's failures
 * at once, which is unreadable.
 */
export const resourceManifestSchema = z.discriminatedUnion('kind', [
  promptManifestSchema,
  skillManifestSchema,
  agentManifestSchema,
  scriptManifestSchema,
  apiManifestSchema,
  workflowManifestSchema,
  componentManifestSchema,
]);

export type ResourceManifest = z.infer<typeof resourceManifestSchema>;
export type PromptManifest = z.infer<typeof promptManifestSchema>;
export type SkillManifest = z.infer<typeof skillManifestSchema>;
export type AgentManifest = z.infer<typeof agentManifestSchema>;
export type ScriptManifest = z.infer<typeof scriptManifestSchema>;
export type ApiManifest = z.infer<typeof apiManifestSchema>;
export type WorkflowManifest = z.infer<typeof workflowManifestSchema>;
export type ComponentManifest = z.infer<typeof componentManifestSchema>;

/** The kinds of failure that can occur before the manifest body is validated. */
export type EnvelopeProblem =
  | { readonly kind: 'not-an-object' }
  | { readonly kind: 'missing-api-version' }
  | { readonly kind: 'unsupported-api-version'; readonly found: string }
  | { readonly kind: 'missing-kind' }
  | { readonly kind: 'unknown-kind'; readonly found: string };

/**
 * Check the manifest envelope before the body.
 *
 * Validating `apiVersion` and `kind` first means an unsupported version or an
 * unknown kind yields one actionable message instead of dozens of downstream
 * field errors (see the validation order in the resource model).
 */
export function checkEnvelope(value: unknown): EnvelopeProblem | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { kind: 'not-an-object' };
  }

  const record = value as Record<string, unknown>;

  const apiVersion = record.apiVersion;
  if (apiVersion === undefined) return { kind: 'missing-api-version' };
  if (
    typeof apiVersion !== 'string' ||
    !(SUPPORTED_API_VERSIONS as readonly string[]).includes(apiVersion)
  ) {
    return { kind: 'unsupported-api-version', found: renderUnexpected(apiVersion) };
  }

  const kind = record.kind;
  if (kind === undefined) return { kind: 'missing-kind' };
  if (
    typeof kind !== 'string' ||
    !(RESOURCE_KINDS as readonly string[]).includes(kind)
  ) {
    return { kind: 'unknown-kind', found: renderUnexpected(kind) };
  }

  return undefined;
}

/**
 * Render an unexpected value for an error message.
 *
 * A bare `String()` would turn a mapping into `[object Object]`, which tells the
 * reader nothing about what they actually wrote.
 */
function renderUnexpected(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'a mapping';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return typeof value;
}

/** A human-readable message for an envelope problem. */
export function describeEnvelopeProblem(problem: EnvelopeProblem): string {
  switch (problem.kind) {
    case 'not-an-object':
      return 'A manifest must be a YAML mapping with apiVersion, kind, metadata, and spec.';
    case 'missing-api-version':
      return `A manifest must declare an apiVersion. This release understands only "${API_VERSION}".`;
    case 'unsupported-api-version':
      return `Unsupported apiVersion "${problem.found}". This release understands only ${SUPPORTED_API_VERSIONS.join(', ')}.`;
    case 'missing-kind':
      return `A manifest must declare a kind. Valid kinds are: ${RESOURCE_KINDS.join(', ')}.`;
    case 'unknown-kind':
      return `Unknown kind "${problem.found}". Valid kinds are: ${RESOURCE_KINDS.join(', ')}.`;
  }
}

/** Is this a supported resource kind? */
export function isResourceKind(value: unknown): value is ResourceKind {
  return (
    typeof value === 'string' && (RESOURCE_KINDS as readonly string[]).includes(value)
  );
}

/** The canonical `namespace/name@version` identifier for a manifest. */
export function manifestIdentifier(manifest: ResourceManifest): string {
  return formatIdentifier(manifest.metadata);
}

/** The `namespace/name` portion of a manifest's identifier. */
export function manifestQualifiedName(manifest: ResourceManifest): string {
  return `${manifest.metadata.namespace}/${manifest.metadata.name}`;
}

/**
 * The install target for a manifest.
 *
 * Uses `spec.install.target` when declared, otherwise the kind default with the
 * resource name appended.
 */
export function resolveInstallTarget(manifest: ResourceManifest): string {
  const declared = manifest.spec.install?.target;
  if (declared !== undefined) return declared;

  return `${DEFAULT_INSTALL_TARGETS[manifest.kind]}/${manifest.metadata.name}`;
}

/** Is this resource marked deprecated? */
export function isDeprecated(manifest: ResourceManifest): boolean {
  return manifest.metadata.deprecated !== undefined;
}
