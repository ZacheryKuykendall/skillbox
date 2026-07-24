import { describe, expect, it } from 'vitest';

import { API_VERSION, LOCKFILE_VERSION } from './constants.js';
import {
  emptyLockfile,
  emptyProjectManifest,
  integritySchema,
  lockedResourceSchema,
  lockfileSchema,
  projectManifestSchema,
  projectResourceSchema,
} from './project.js';

const DIGEST = 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=';

describe('integritySchema', () => {
  it('accepts an SRI-style sha256 digest', () => {
    expect(integritySchema.safeParse(DIGEST).success).toBe(true);
  });

  it.each([
    ['47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=', 'the algorithm prefix is missing'],
    ['sha256-tooshort', 'the digest is the wrong length'],
    ['md5-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=', 'the algorithm is not sha256'],
    ['sha256-', 'the digest is empty'],
    ['', 'the value is empty'],
  ])('rejects %s because %s', (value) => {
    expect(integritySchema.safeParse(value).success).toBe(false);
  });
});

describe('projectResourceSchema', () => {
  it('accepts a reference with a range', () => {
    expect(
      projectResourceSchema.safeParse({
        resource: 'skillbox/code-review',
        version: '^0.1.0',
      }).success,
    ).toBe(true);
  });

  it('accepts a target override', () => {
    expect(
      projectResourceSchema.safeParse({
        resource: 'skillbox/code-review',
        version: '^0.1.0',
        target: 'custom/place',
      }).success,
    ).toBe(true);
  });

  it('rejects a version embedded in the resource field', () => {
    expect(
      projectResourceSchema.safeParse({
        resource: 'skillbox/code-review@0.1.0',
        version: '^0.1.0',
      }).success,
    ).toBe(false);
  });

  it('rejects an absolute target', () => {
    expect(
      projectResourceSchema.safeParse({
        resource: 'skillbox/code-review',
        version: '^0.1.0',
        target: '/etc/skillbox',
      }).success,
    ).toBe(false);
  });

  it('rejects a traversal target', () => {
    expect(
      projectResourceSchema.safeParse({
        resource: 'skillbox/code-review',
        version: '^0.1.0',
        target: '../outside',
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown field', () => {
    expect(
      projectResourceSchema.safeParse({
        resource: 'skillbox/code-review',
        version: '^0.1.0',
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe('projectManifestSchema', () => {
  const valid = {
    apiVersion: API_VERSION,
    kind: 'Project',
    metadata: { name: 'my-project' },
    spec: {
      resources: [{ resource: 'skillbox/code-review', version: '^0.1.0' }],
      variables: { 'service-name': 'billing' },
    },
  };

  it('accepts a well-formed project manifest', () => {
    expect(projectManifestSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a project with no resources yet', () => {
    expect(
      projectManifestSchema.safeParse({
        apiVersion: API_VERSION,
        kind: 'Project',
        metadata: { name: 'fresh' },
        spec: { resources: [] },
      }).success,
    ).toBe(true);
  });

  it('rejects an unsupported apiVersion', () => {
    expect(
      projectManifestSchema.safeParse({ ...valid, apiVersion: 'skillbox.dev/v2' })
        .success,
    ).toBe(false);
  });

  it('rejects a kind other than Project', () => {
    expect(projectManifestSchema.safeParse({ ...valid, kind: 'prompt' }).success).toBe(
      false,
    );
  });

  it('rejects duplicate resource entries', () => {
    const result = projectManifestSchema.safeParse({
      ...valid,
      spec: {
        resources: [
          { resource: 'skillbox/code-review', version: '^0.1.0' },
          { resource: 'skillbox/code-review', version: '^0.2.0' },
        ],
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('duplicate'))).toBe(
        true,
      );
    }
  });

  it('rejects an unknown top-level field', () => {
    expect(projectManifestSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
  });

  it('rejects an unknown spec field', () => {
    expect(
      projectManifestSchema.safeParse({ ...valid, spec: { unknown: true } }).success,
    ).toBe(false);
  });

  it('rejects a variable name that is not an identifier', () => {
    expect(
      projectManifestSchema.safeParse({
        ...valid,
        spec: { variables: { 'Not Valid': 'x' } },
      }).success,
    ).toBe(false);
  });
});

describe('lockedResourceSchema', () => {
  const valid = {
    version: '0.1.0',
    kind: 'prompt',
    source: { type: 'local', path: 'prompts/code-review' },
    integrity: DIGEST,
    target: '.skillbox/prompts/code-review',
    files: { '.skillbox/prompts/code-review/prompt.md': DIGEST },
    requestedBy: 'direct',
  };

  it('accepts a well-formed entry', () => {
    expect(lockedResourceSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a dependency-installed entry', () => {
    expect(
      lockedResourceSchema.safeParse({
        ...valid,
        requestedBy: 'skillbox/plan-implement-review',
        dependencies: ['skillbox/other-resource'],
      }).success,
    ).toBe(true);
  });

  it('requires an exact version, not a range', () => {
    expect(
      lockedResourceSchema.safeParse({ ...valid, version: '^0.1.0' }).success,
    ).toBe(false);
  });

  it('rejects an absolute source path', () => {
    // ADR-0004: no absolute paths, so the lockfile is portable across machines.
    expect(
      lockedResourceSchema.safeParse({
        ...valid,
        source: { type: 'local', path: '/home/user/registry/prompts/code-review' },
      }).success,
    ).toBe(false);
  });

  it('rejects a traversal path in the installed files map', () => {
    // A tampered lockfile must not be able to direct a write outside the project.
    expect(
      lockedResourceSchema.safeParse({
        ...valid,
        files: { '../../etc/passwd': DIGEST },
      }).success,
    ).toBe(false);
  });

  it('rejects a traversal target', () => {
    expect(
      lockedResourceSchema.safeParse({ ...valid, target: '../escape' }).success,
    ).toBe(false);
  });

  it('rejects a malformed integrity digest', () => {
    expect(
      lockedResourceSchema.safeParse({ ...valid, integrity: 'not-a-digest' }).success,
    ).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(lockedResourceSchema.safeParse({ ...valid, kind: 'plugin' }).success).toBe(
      false,
    );
  });

  it('rejects a remote source type, since only local exists in v0.1.0', () => {
    expect(
      lockedResourceSchema.safeParse({
        ...valid,
        source: { type: 'remote', path: 'prompts/code-review' },
      }).success,
    ).toBe(false);
  });
});

describe('lockfileSchema', () => {
  it('accepts an empty lockfile', () => {
    expect(lockfileSchema.safeParse(emptyLockfile()).success).toBe(true);
  });

  it('rejects an unsupported lockfileVersion', () => {
    expect(
      lockfileSchema.safeParse({ lockfileVersion: 99, resources: {} }).success,
    ).toBe(false);
  });

  it('rejects a missing lockfileVersion', () => {
    expect(lockfileSchema.safeParse({ resources: {} }).success).toBe(false);
  });

  it('rejects an unknown top-level field, such as a timestamp', () => {
    // ADR-0004 deliberately excludes timestamps so reinstalling produces no diff.
    expect(
      lockfileSchema.safeParse({
        lockfileVersion: LOCKFILE_VERSION,
        resources: {},
        installedAt: '2026-07-24T00:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('keys resources by qualified name', () => {
    const result = lockfileSchema.safeParse({
      lockfileVersion: LOCKFILE_VERSION,
      resources: {
        'skillbox/code-review': {
          version: '0.1.0',
          kind: 'prompt',
          source: { type: 'local', path: 'prompts/code-review' },
          integrity: DIGEST,
          target: '.skillbox/prompts/code-review',
          files: { '.skillbox/prompts/code-review/prompt.md': DIGEST },
          requestedBy: 'direct',
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects a resource key that is not a qualified name', () => {
    expect(
      lockfileSchema.safeParse({
        lockfileVersion: LOCKFILE_VERSION,
        resources: { 'code-review': {} },
      }).success,
    ).toBe(false);
  });
});

describe('emptyLockfile', () => {
  it('declares the current lockfile version and no resources', () => {
    expect(emptyLockfile()).toEqual({
      lockfileVersion: LOCKFILE_VERSION,
      resources: {},
    });
  });

  it('returns a fresh object each call so callers cannot share state', () => {
    expect(emptyLockfile()).not.toBe(emptyLockfile());
  });
});

describe('emptyProjectManifest', () => {
  it('produces a manifest that validates', () => {
    expect(
      projectManifestSchema.safeParse(emptyProjectManifest('my-project')).success,
    ).toBe(true);
  });

  it('uses the supplied name', () => {
    expect(emptyProjectManifest('my-project').metadata.name).toBe('my-project');
  });
});
