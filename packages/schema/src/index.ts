/**
 * @skillbox/schema — the vocabulary layer.
 *
 * Owns resource kinds, manifest types, runtime validation, and JSON Schema
 * generation. Deliberately has no filesystem access: it validates values, not
 * directories (ADR-0001).
 */

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
