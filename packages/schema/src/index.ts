/**
 * @skillbox/schema — the vocabulary layer.
 *
 * Owns resource kinds, manifest types, runtime validation, and JSON Schema
 * generation. Deliberately has no filesystem access: it validates values, not
 * directories (ADR-0001).
 */

// --- vocabulary -------------------------------------------------------------

export {
  API_VERSION,
  DEFAULT_INSTALL_TARGETS,
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  ENV_NAME_MAX_LENGTH,
  ENV_NAME_PATTERN,
  IDENTIFIER_MAX_LENGTH,
  IDENTIFIER_MIN_LENGTH,
  IDENTIFIER_PATTERN,
  KIND_DIRECTORIES,
  LOCKFILE_FILENAME,
  LOCKFILE_VERSION,
  MANIFEST_FILENAME,
  MAX_TAGS,
  PERMISSIONS,
  PLATFORMS,
  PROJECT_DIRECTORY,
  PROJECT_MANIFEST_FILENAME,
  RESOURCE_KINDS,
  RUNTIME_TYPES,
  SUPPORTED_API_VERSIONS,
  VALUE_TYPES,
} from './constants.js';

export type {
  Permission,
  Platform,
  ResourceKind,
  RuntimeType,
  ValueType,
} from './constants.js';

// --- identifiers ------------------------------------------------------------

export {
  compareVersions,
  formatIdentifier,
  formatQualifiedName,
  identifierSchema,
  isPrerelease,
  parseReference,
  ReferenceParseError,
  resourceNameSchema,
  satisfiesRange,
  tryParseReference,
  versionRangeSchema,
  versionSchema,
} from './identifier.js';

export type { ResourceIdentifier, ResourceReference } from './identifier.js';

// --- paths ------------------------------------------------------------------

export {
  checkManifestPath,
  describePathRejection,
  manifestPathListSchema,
  manifestPathSchema,
} from './paths.js';

export type { PathRejection } from './paths.js';

// --- metadata and spec ------------------------------------------------------

export { deprecationSchema, metadataSchema, tagsSchema } from './metadata.js';
export type { Deprecation, ResourceMetadata } from './metadata.js';

export {
  compatibilitySchema,
  dependencySchema,
  envVarSchema,
  inputSchema,
  installSchema,
  outputSchema,
  permissionSchema,
  runtimeSchema,
  valueTypeSchema,
} from './spec.js';

export type {
  ResourceCompatibility,
  ResourceDependency,
  ResourceEnvVar,
  ResourceInput,
  ResourceInstall,
  ResourceOutput,
  ResourceRuntime,
} from './spec.js';

// --- kinds ------------------------------------------------------------------

export {
  agentSpecSchema,
  apiSpecSchema,
  componentSpecSchema,
  promptSpecSchema,
  scriptSpecSchema,
  skillSpecSchema,
  workflowSpecSchema,
  workflowStepSchema,
} from './kinds.js';

export type {
  AgentSpec,
  ApiSpec,
  ComponentSpec,
  PromptSpec,
  ScriptSpec,
  SkillSpec,
  WorkflowSpec,
  WorkflowStep,
} from './kinds.js';

// --- manifest ---------------------------------------------------------------

export {
  agentManifestSchema,
  apiManifestSchema,
  apiVersionSchema,
  checkEnvelope,
  componentManifestSchema,
  describeEnvelopeProblem,
  isDeprecated,
  isResourceKind,
  MANIFEST_SCHEMAS,
  manifestIdentifier,
  manifestQualifiedName,
  promptManifestSchema,
  resolveInstallTarget,
  resourceManifestSchema,
  scriptManifestSchema,
  skillManifestSchema,
  workflowManifestSchema,
} from './manifest.js';

export type {
  AgentManifest,
  ApiManifest,
  ComponentManifest,
  EnvelopeProblem,
  PromptManifest,
  ResourceManifest,
  ScriptManifest,
  SkillManifest,
  WorkflowManifest,
} from './manifest.js';

export { parseManifest, validateManifest } from './validate-manifest.js';

// --- project configuration --------------------------------------------------

export {
  emptyLockfile,
  emptyProjectManifest,
  integritySchema,
  lockedResourceSchema,
  lockfileSchema,
  lockSourceSchema,
  projectManifestSchema,
  projectResourceSchema,
  projectVariablesSchema,
  requestedBySchema,
} from './project.js';

export type {
  Lockfile,
  LockedResource,
  ProjectManifest,
  ProjectResource,
} from './project.js';

// --- JSON Schema ------------------------------------------------------------

export { generateJsonSchemas, serializeJsonSchema } from './json-schema.js';
export type { GeneratedSchema } from './json-schema.js';

// --- diagnostics ------------------------------------------------------------

export {
  formatDiagnostics,
  formatPath,
  isRedactedPath,
  issueToDiagnostic,
  REDACTED_PLACEHOLDER,
  toDiagnostics,
  validate,
} from './errors.js';

export type { Diagnostic, DiagnosticSeverity, ValidationResult } from './errors.js';
