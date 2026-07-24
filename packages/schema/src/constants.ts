/**
 * Core vocabulary for the Skillbox resource format.
 *
 * These values are normative: see docs/architecture/resource-model.md. Changing
 * any of them is a format change and requires updating that document first.
 */

/** The only manifest API version this release understands. */
export const API_VERSION = 'skillbox.dev/v1alpha1' as const;

/**
 * Every API version this release accepts. A single-element list today, but
 * declared as a list so adding a version does not change call sites.
 */
export const SUPPORTED_API_VERSIONS = [API_VERSION] as const;

/** The seven supported resource kinds, in documentation order. */
export const RESOURCE_KINDS = [
  'prompt',
  'skill',
  'agent',
  'script',
  'api',
  'workflow',
  'component',
] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/**
 * Registry subdirectory for each kind. The directory is organizational only:
 * `kind` always comes from the manifest, never from the path, so a misfiled
 * resource is a validation error rather than a silent reclassification.
 */
export const KIND_DIRECTORIES: Readonly<Record<ResourceKind, string>> = {
  prompt: 'prompts',
  skill: 'skills',
  agent: 'agents',
  script: 'scripts',
  api: 'apis',
  workflow: 'workflows',
  component: 'components',
};

/**
 * Install target used when a manifest omits `spec.install.target`.
 * `component` differs deliberately: components are application source meant to
 * live alongside a project's own code.
 */
export const DEFAULT_INSTALL_TARGETS: Readonly<Record<ResourceKind, string>> = {
  prompt: '.skillbox/prompts',
  skill: '.skillbox/skills',
  agent: '.skillbox/agents',
  script: '.skillbox/scripts',
  api: '.skillbox/apis',
  workflow: '.skillbox/workflows',
  component: 'src/components',
};

/**
 * Closed permission vocabulary.
 *
 * Permissions are declarative in v0.1.0: they are validated and shown to the
 * user before installation, but not enforced, because Skillbox provides no
 * runtime to enforce them in. See docs/architecture/security-model.md.
 */
export const PERMISSIONS = [
  'filesystem:read',
  'filesystem:write',
  'network:outbound',
  'process:spawn',
  'env:read',
  'secrets:read',
  'model:invoke',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Runtime types a resource may declare. */
export const RUNTIME_TYPES = ['node', 'python', 'shell', 'powershell', 'none'] as const;

export type RuntimeType = (typeof RUNTIME_TYPES)[number];

/** Platforms a resource may declare compatibility with. */
export const PLATFORMS = ['win32', 'linux', 'darwin'] as const;

export type Platform = (typeof PLATFORMS)[number];

/** Declared input and output value types. */
export const VALUE_TYPES = [
  'string',
  'number',
  'boolean',
  'enum',
  'array',
  'object',
  'path',
] as const;

export type ValueType = (typeof VALUE_TYPES)[number];

/** Manifest filename inside a resource directory. */
export const MANIFEST_FILENAME = 'skillbox.yaml';

/** Project configuration directory, relative to the project root. */
export const PROJECT_DIRECTORY = '.skillbox';

/** Project manifest filename inside {@link PROJECT_DIRECTORY}. */
export const PROJECT_MANIFEST_FILENAME = 'skillbox.yaml';

/** Lockfile filename inside {@link PROJECT_DIRECTORY}. */
export const LOCKFILE_FILENAME = 'skillbox.lock';

/** Lockfile format version. Bumped only by an ADR-recorded format change. */
export const LOCKFILE_VERSION = 1;

/**
 * Pattern for namespaces, resource names, and tags.
 *
 * Deliberately narrower than npm's: lowercase alphanumeric with internal
 * hyphens only. This keeps identifiers safe as directory names on
 * case-insensitive filesystems and unambiguous inside `namespace/name@version`.
 */
export const IDENTIFIER_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export const IDENTIFIER_MIN_LENGTH = 2;
export const IDENTIFIER_MAX_LENGTH = 64;

/** Pattern for environment variable names. */
export const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export const ENV_NAME_MAX_LENGTH = 128;

export const DESCRIPTION_MIN_LENGTH = 10;
export const DESCRIPTION_MAX_LENGTH = 200;

export const MAX_TAGS = 10;
