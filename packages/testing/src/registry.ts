import { API_VERSION, MANIFEST_FILENAME, type ResourceKind } from '@skillbox/schema';
import { stringify as stringifyYaml } from 'yaml';

import { KIND_DIRECTORY, type TempDir } from './temp.js';

/**
 * Helpers for building a registry on disk in a temporary directory.
 *
 * Catalog discovery walks real directories, so its tests need real ones. Mocking
 * `node:fs` would encode assumptions the actual filesystem violates, especially
 * across platforms.
 */

/** A resource to write into a temporary registry. */
export interface ResourceSpec {
  readonly namespace?: string;
  readonly name: string;
  readonly version?: string;
  readonly kind?: ResourceKind;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly entrypoint?: string;
  readonly files?: readonly string[];
  readonly target?: string;
  readonly dependencies?: readonly {
    resource: string;
    version: string;
    optional?: boolean;
  }[];
  readonly permissions?: readonly string[];
  readonly env?: readonly Record<string, unknown>[];
  /** Extra spec fields, for kind-specific requirements. */
  readonly spec?: Record<string, unknown>;
  /** File contents keyed by relative path. Defaults are generated. */
  readonly contents?: Readonly<Record<string, string>>;
  /** Written verbatim instead of a generated manifest, for malformed cases. */
  readonly rawManifest?: string;
  readonly deprecated?: { reason: string; replacement?: string };
}

/** Spec fields each kind requires, so a fixture is valid without restating them. */
const REQUIRED_BY_KIND: Readonly<Record<ResourceKind, Record<string, unknown>>> = {
  prompt: {},
  skill: {},
  agent: { role: 'Performs a well-defined role in a development workflow.' },
  script: { interpreter: 'node' },
  api: { protocol: 'rest' },
  workflow: {
    steps: [
      {
        name: 'only-step',
        uses: 'skillbox/placeholder-target',
        description: 'A single placeholder step.',
      },
    ],
  },
  component: { language: 'typescript' },
};

/** Build a manifest object for a resource spec. */
export function buildManifest(spec: ResourceSpec): Record<string, unknown> {
  const kind = spec.kind ?? 'prompt';
  const entrypoint = spec.entrypoint ?? 'entry.md';
  const files = spec.files ?? [entrypoint, 'README.md'];

  return {
    apiVersion: API_VERSION,
    kind,
    metadata: {
      namespace: spec.namespace ?? 'skillbox',
      name: spec.name,
      version: spec.version ?? '0.1.0',
      description:
        spec.description ?? `A test fixture resource named ${spec.name} for the suite.`,
      ...(spec.tags === undefined ? {} : { tags: [...spec.tags] }),
      ...(spec.deprecated === undefined ? {} : { deprecated: spec.deprecated }),
    },
    spec: {
      entrypoint,
      files: [...files],
      ...(spec.target === undefined ? {} : { install: { target: spec.target } }),
      ...REQUIRED_BY_KIND[kind],
      ...(spec.dependencies === undefined
        ? {}
        : { dependencies: spec.dependencies.map((d) => ({ ...d })) }),
      ...(spec.permissions === undefined ? {} : { permissions: [...spec.permissions] }),
      ...(spec.env === undefined ? {} : { env: spec.env.map((e) => ({ ...e })) }),
      ...spec.spec,
    },
  };
}

/**
 * Write a resource into a registry directory inside a temp dir.
 *
 * Returns the resource directory path relative to the temp dir root.
 */
export async function writeResource(
  dir: TempDir,
  registryPath: string,
  spec: ResourceSpec,
): Promise<string> {
  const kind = spec.kind ?? 'prompt';
  const directory = `${registryPath}/${KIND_DIRECTORY[kind]}/${spec.name}`;

  const manifest =
    spec.rawManifest ?? stringifyYaml(buildManifest(spec), { lineWidth: 0 });

  await dir.write(`${directory}/${MANIFEST_FILENAME}`, manifest);

  const entrypoint = spec.entrypoint ?? 'entry.md';
  const files = spec.files ?? [entrypoint, 'README.md'];

  for (const file of files) {
    const contents =
      spec.contents?.[file] ?? `# ${spec.name}\n\nContents of ${file}.\n`;
    await dir.write(`${directory}/${file}`, contents);
  }

  // Extra files not in the declared list, for undeclared-file cases.
  for (const [file, contents] of Object.entries(spec.contents ?? {})) {
    if (!files.includes(file)) {
      await dir.write(`${directory}/${file}`, contents);
    }
  }

  return directory;
}

/** Write a whole registry and return its absolute path. */
export async function writeRegistry(
  dir: TempDir,
  resources: readonly ResourceSpec[],
  registryPath = 'registry',
): Promise<string> {
  for (const spec of resources) {
    await writeResource(dir, registryPath, spec);
  }

  return dir.resolve(registryPath);
}
