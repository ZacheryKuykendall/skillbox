import { API_VERSION, type ResourceKind } from '@skillbox/schema';

/**
 * Shared manifest fixtures.
 *
 * One definition of "a valid resource" and "an invalid resource" for the schema,
 * core, and CLI suites, so the three cannot drift apart.
 *
 * Fixtures are plain unknown-shaped objects rather than typed manifests: the
 * invalid ones must be constructible precisely because they violate the type.
 */

/** A minimal valid manifest for each kind. */
export const VALID_MANIFESTS: Readonly<Record<ResourceKind, Record<string, unknown>>> =
  {
    prompt: {
      apiVersion: API_VERSION,
      kind: 'prompt',
      metadata: {
        namespace: 'skillbox',
        name: 'code-review',
        version: '0.1.0',
        description: 'Reviews a code change and produces actionable findings.',
        tags: ['development', 'code-review'],
      },
      spec: {
        entrypoint: 'prompt.md',
        files: ['prompt.md', 'README.md'],
        install: { target: '.skillbox/prompts/code-review' },
        inputs: [
          {
            name: 'diff',
            type: 'string',
            required: true,
            description: 'The unified diff to review.',
          },
        ],
        outputs: [
          {
            name: 'findings',
            type: 'array',
            description: 'Actionable review findings.',
          },
        ],
        permissions: ['model:invoke'],
      },
    },

    skill: {
      apiVersion: API_VERSION,
      kind: 'skill',
      metadata: {
        namespace: 'skillbox',
        name: 'technical-documentation',
        version: '0.1.0',
        description: 'Writes and reviews technical documentation for a codebase.',
        tags: ['documentation'],
      },
      spec: {
        entrypoint: 'SKILL.md',
        files: ['SKILL.md', 'README.md', 'reference/style-guide.md'],
        resources: ['reference/style-guide.md'],
        permissions: ['filesystem:read', 'model:invoke'],
      },
    },

    agent: {
      apiVersion: API_VERSION,
      kind: 'agent',
      metadata: {
        namespace: 'skillbox',
        name: 'implementation-planner',
        version: '0.1.0',
        description: 'Turns a requirement into an ordered implementation plan.',
        tags: ['planning'],
      },
      spec: {
        entrypoint: 'agent.md',
        files: ['agent.md', 'README.md'],
        role: 'Plans implementation work as ordered, verifiable steps.',
        tools: ['read-file', 'search'],
        permissions: ['filesystem:read', 'model:invoke'],
      },
    },

    script: {
      apiVersion: API_VERSION,
      kind: 'script',
      metadata: {
        namespace: 'skillbox',
        name: 'project-summary',
        version: '0.1.0',
        description: 'Summarizes a project structure as a Markdown report.',
        tags: ['automation'],
      },
      spec: {
        entrypoint: 'summarize.mjs',
        files: ['summarize.mjs', 'README.md'],
        interpreter: 'node',
        runtime: { type: 'node', version: '>=20.19.0' },
        permissions: ['filesystem:read'],
      },
    },

    api: {
      apiVersion: API_VERSION,
      kind: 'api',
      metadata: {
        namespace: 'skillbox',
        name: 'generic-rest-client',
        version: '0.1.0',
        description: 'A typed REST client wrapper with retries and error handling.',
        tags: ['api', 'http'],
      },
      spec: {
        entrypoint: 'src/client.ts',
        files: ['src/client.ts', 'README.md'],
        protocol: 'rest',
        baseUrlEnv: 'SKILLBOX_EXAMPLE_API_BASE_URL',
        auth: { type: 'bearer', tokenEnv: 'SKILLBOX_EXAMPLE_API_TOKEN' },
        env: [
          {
            name: 'SKILLBOX_EXAMPLE_API_BASE_URL',
            description: 'Base URL of the target REST service.',
            required: true,
          },
          {
            name: 'SKILLBOX_EXAMPLE_API_TOKEN',
            description: 'Bearer token for the target service.',
            required: true,
            secret: true,
          },
        ],
        permissions: ['network:outbound', 'env:read'],
      },
    },

    workflow: {
      apiVersion: API_VERSION,
      kind: 'workflow',
      metadata: {
        namespace: 'skillbox',
        name: 'plan-implement-review',
        version: '0.1.0',
        description: 'Plans, implements, and reviews a change as an ordered workflow.',
        tags: ['workflow'],
      },
      spec: {
        entrypoint: 'workflow.md',
        files: ['workflow.md', 'README.md'],
        steps: [
          {
            name: 'plan',
            uses: 'skillbox/implementation-planner',
            description: 'Produce an implementation plan.',
          },
          {
            name: 'review',
            uses: 'skillbox/code-review',
            description: 'Review the resulting change.',
          },
        ],
        dependencies: [
          { resource: 'skillbox/implementation-planner', version: '^0.1.0' },
          { resource: 'skillbox/code-review', version: '^0.1.0' },
        ],
      },
    },

    component: {
      apiVersion: API_VERSION,
      kind: 'component',
      metadata: {
        namespace: 'skillbox',
        name: 'structured-logger',
        version: '0.1.0',
        description: 'A dependency-free structured JSON logger for Node services.',
        tags: ['logging'],
      },
      spec: {
        entrypoint: 'logger.ts',
        files: ['logger.ts', 'README.md'],
        install: { target: 'src/components/structured-logger' },
        language: 'typescript',
        exports: ['createLogger'],
      },
    },
  };

/** Documented failure modes, each with the reason it must be rejected. */
export interface InvalidManifestFixture {
  readonly label: string;
  readonly reason: string;
  readonly manifest: unknown;
}

/** Deep-clone the valid prompt fixture so a mutation cannot leak between tests. */
export function validPromptManifest(): Record<string, unknown> {
  return structuredClone(VALID_MANIFESTS.prompt);
}

/** Deep-clone the valid manifest for a kind. */
export function validManifest(kind: ResourceKind): Record<string, unknown> {
  return structuredClone(VALID_MANIFESTS[kind]);
}

/** A valid manifest with one field replaced at the top level. */
export function manifestWith(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return { ...validPromptManifest(), ...overrides };
}

/** A valid prompt manifest with its spec fields merged over. */
export function manifestWithSpec(
  specOverrides: Record<string, unknown>,
): Record<string, unknown> {
  const base = validPromptManifest();
  return {
    ...base,
    spec: { ...(base.spec as Record<string, unknown>), ...specOverrides },
  };
}

/** A valid prompt manifest with its metadata fields merged over. */
export function manifestWithMetadata(
  metadataOverrides: Record<string, unknown>,
): Record<string, unknown> {
  const base = validPromptManifest();
  return {
    ...base,
    metadata: {
      ...(base.metadata as Record<string, unknown>),
      ...metadataOverrides,
    },
  };
}

export const INVALID_MANIFESTS: readonly InvalidManifestFixture[] = [
  {
    label: 'not an object',
    reason: 'a manifest must be a mapping',
    manifest: 'just a string',
  },
  {
    label: 'null',
    reason: 'a manifest must be a mapping',
    manifest: null,
  },
  {
    label: 'an array',
    reason: 'a manifest must be a mapping, not a sequence',
    manifest: [],
  },
  {
    label: 'missing apiVersion',
    reason: 'apiVersion is required',
    manifest: (() => {
      const manifest = validPromptManifest();
      delete manifest.apiVersion;
      return manifest;
    })(),
  },
  {
    label: 'an unsupported apiVersion',
    reason: 'only skillbox.dev/v1alpha1 is understood',
    manifest: manifestWith({ apiVersion: 'skillbox.dev/v2' }),
  },
  {
    label: 'missing kind',
    reason: 'kind is required',
    manifest: (() => {
      const manifest = validPromptManifest();
      delete manifest.kind;
      return manifest;
    })(),
  },
  {
    label: 'an unknown kind',
    reason: 'only the seven documented kinds are supported',
    manifest: manifestWith({ kind: 'plugin' }),
  },
  {
    label: 'an unknown top-level field',
    reason: 'unknown fields are rejected so a typo fails loudly',
    manifest: manifestWith({ unexpectedField: true }),
  },
  {
    label: 'an uppercase name',
    reason: 'names must match the identifier pattern',
    manifest: manifestWithMetadata({ name: 'Code-Review' }),
  },
  {
    label: 'a name with an underscore',
    reason: 'names must match the identifier pattern',
    manifest: manifestWithMetadata({ name: 'code_review' }),
  },
  {
    label: 'a version range as the resource version',
    reason: 'a resource declares one exact version',
    manifest: manifestWithMetadata({ version: '^0.1.0' }),
  },
  {
    label: 'a non-semver version',
    reason: 'the version must be strict semver',
    manifest: manifestWithMetadata({ version: '1.0' }),
  },
  {
    label: 'a description that is too short',
    reason: 'a description must be useful in search results',
    manifest: manifestWithMetadata({ description: 'short' }),
  },
  {
    label: 'a multi-line description',
    reason: 'a description must be a single line',
    manifest: manifestWithMetadata({ description: 'A description\nspanning lines.' }),
  },
  {
    label: 'more than ten tags',
    reason: 'tags are capped',
    manifest: manifestWithMetadata({
      tags: Array.from({ length: 11 }, (_, index) => `tag-${String(index)}`),
    }),
  },
  {
    label: 'a missing entrypoint',
    reason: 'every resource needs a primary file',
    manifest: manifestWithSpec({ entrypoint: undefined, files: ['prompt.md'] }),
  },
  {
    label: 'an entrypoint not listed in files',
    reason: 'the entrypoint must be a declared file',
    manifest: manifestWithSpec({ entrypoint: 'other.md', files: ['prompt.md'] }),
  },
  {
    label: 'an empty files list',
    reason: 'a resource must own at least one file',
    manifest: manifestWithSpec({ files: [] }),
  },
  {
    label: 'a traversal path in files',
    reason: 'paths must not escape the resource directory',
    manifest: manifestWithSpec({ files: ['prompt.md', '../../etc/passwd'] }),
  },
  {
    label: 'an absolute install target',
    reason: 'install targets must be relative to the project',
    manifest: manifestWithSpec({ install: { target: '/etc/skillbox' } }),
  },
  {
    label: 'a traversal install target',
    reason: 'install targets must stay inside the project',
    manifest: manifestWithSpec({ install: { target: '../../outside' } }),
  },
  {
    label: 'a Windows absolute install target',
    reason: 'install targets must be relative on every platform',
    manifest: manifestWithSpec({ install: { target: 'C:\\Windows\\Temp' } }),
  },
  {
    label: 'an unknown permission',
    reason: 'permissions come from a closed vocabulary',
    manifest: manifestWithSpec({ permissions: ['filesystem:destroy'] }),
  },
  {
    label: 'a lowercase environment variable name',
    reason: 'environment variable names are uppercase',
    manifest: manifestWithSpec({
      env: [{ name: 'lowercase_name', description: 'Nope.' }],
    }),
  },
  {
    label: 'a dependency with no version',
    reason: 'a dependency must declare a range',
    manifest: manifestWithSpec({
      dependencies: [{ resource: 'skillbox/other' }],
    }),
  },
  {
    label: 'a dependency with a version in the resource field',
    reason: 'the version belongs in its own field',
    manifest: manifestWithSpec({
      dependencies: [{ resource: 'skillbox/other@1.0.0', version: '^1.0.0' }],
    }),
  },
  {
    label: 'an enum input with no values',
    reason: 'an enum must declare its allowed values',
    manifest: manifestWithSpec({
      inputs: [{ name: 'mode', type: 'enum', description: 'The mode to use.' }],
    }),
  },
  {
    label: 'an enum default outside its values',
    reason: 'a default must be one of the declared values',
    manifest: manifestWithSpec({
      inputs: [
        {
          name: 'mode',
          type: 'enum',
          values: ['a', 'b'],
          default: 'c',
          description: 'The mode to use.',
        },
      ],
    }),
  },
  {
    label: 'duplicate input names',
    reason: 'input names must be unique',
    manifest: manifestWithSpec({
      inputs: [
        { name: 'diff', type: 'string', description: 'First.' },
        { name: 'diff', type: 'string', description: 'Second.' },
      ],
    }),
  },
  {
    label: 'duplicate files',
    reason: 'a file must be declared once',
    manifest: manifestWithSpec({ files: ['prompt.md', 'prompt.md'] }),
  },
  {
    label: 'a script kind field on a prompt',
    reason: 'kind-specific fields belong only to their kind',
    manifest: manifestWithSpec({ interpreter: 'node' }),
  },
];
