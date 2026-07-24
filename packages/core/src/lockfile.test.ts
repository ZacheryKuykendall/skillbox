import { LOCKFILE_VERSION, lockfileSchema, type Lockfile } from '@skillbox/schema';
import { describe, expect, it } from 'vitest';

import { digestOf } from './integrity.js';
import {
  emptyLockfile,
  fileOwnership,
  lockedDependents,
  lockedResourceFor,
  serializeLockfile,
  withLockedResource,
  withoutLockedResource,
} from './lockfile.js';

const entry = lockedResourceFor({
  version: '0.1.0',
  kind: 'prompt',
  sourcePath: 'prompts/code-review',
  target: '.skillbox/prompts/code-review',
  files: {
    '.skillbox/prompts/code-review/entry.md': digestOf('entry'),
    '.skillbox/prompts/code-review/README.md': digestOf('readme'),
  },
  requestedBy: 'direct',
});

const populated: Lockfile = withLockedResource(
  emptyLockfile(),
  'skillbox/code-review',
  entry,
);

describe('lockedResourceFor', () => {
  it('records version, kind, source, target, and files', () => {
    expect(entry.version).toBe('0.1.0');
    expect(entry.kind).toBe('prompt');
    expect(entry.source).toEqual({ type: 'local', path: 'prompts/code-review' });
    expect(entry.target).toBe('.skillbox/prompts/code-review');
    expect(Object.keys(entry.files)).toHaveLength(2);
  });

  it('derives the aggregate integrity digest from the file digests', () => {
    expect(entry.integrity).toMatch(/^sha256-/);
  });

  it('sorts dependencies so order cannot vary', () => {
    const withDependencies = lockedResourceFor({
      version: '0.1.0',
      kind: 'workflow',
      sourcePath: 'workflows/w',
      target: '.skillbox/workflows/w',
      files: {},
      dependencies: ['skillbox/zebra-resource', 'skillbox/alpha-resource'],
      requestedBy: 'direct',
    });

    expect(withDependencies.dependencies).toEqual([
      'skillbox/alpha-resource',
      'skillbox/zebra-resource',
    ]);
  });

  it('omits an empty dependency list rather than writing an empty array', () => {
    expect(entry.dependencies).toBeUndefined();
  });

  it('produces an entry that validates against the schema', () => {
    expect(lockfileSchema.safeParse(populated).success).toBe(true);
  });
});

describe('serializeLockfile', () => {
  it('is byte-identical across repeated calls', () => {
    expect(serializeLockfile(populated)).toBe(serializeLockfile(populated));
  });

  it('is byte-identical regardless of key insertion order', () => {
    // The central determinism guarantee: a reinstall must produce no diff, or the
    // integrity information the lockfile carries stops being reviewed (ADR-0004).
    const forward = withLockedResource(
      withLockedResource(emptyLockfile(), 'skillbox/alpha-resource', entry),
      'skillbox/zebra-resource',
      entry,
    );

    const reverse = withLockedResource(
      withLockedResource(emptyLockfile(), 'skillbox/zebra-resource', entry),
      'skillbox/alpha-resource',
      entry,
    );

    expect(serializeLockfile(forward)).toBe(serializeLockfile(reverse));
  });

  it('sorts resource keys', () => {
    const lockfile = withLockedResource(
      withLockedResource(emptyLockfile(), 'skillbox/zebra-resource', entry),
      'skillbox/alpha-resource',
      entry,
    );

    const output = serializeLockfile(lockfile);

    expect(output.indexOf('alpha-resource')).toBeLessThan(
      output.indexOf('zebra-resource'),
    );
  });

  it('sorts nested file keys', () => {
    const output = serializeLockfile(populated);

    expect(output.indexOf('README.md')).toBeLessThan(output.indexOf('entry.md'));
  });

  it('contains no timestamp', () => {
    // Deliberately declines the specification's optional timestamp: it would
    // guarantee a diff on every reinstall.
    const output = serializeLockfile(populated);

    expect(output).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(output.toLowerCase()).not.toContain('installedat');
    expect(output.toLowerCase()).not.toContain('timestamp');
  });

  it('contains no absolute path', () => {
    const output = serializeLockfile(populated);

    expect(output).not.toMatch(/[A-Za-z]:[\\/]/);
    expect(output).not.toMatch(/^\s*path:\s*\//m);
  });

  it('contains no backslashes, so output matches across platforms', () => {
    expect(serializeLockfile(populated)).not.toContain('\\');
  });

  it('declares the lockfile version', () => {
    expect(serializeLockfile(populated)).toContain(
      `lockfileVersion: ${String(LOCKFILE_VERSION)}`,
    );
  });

  it('does not emit YAML anchors, which would depend on object identity', () => {
    const shared = withLockedResource(
      withLockedResource(emptyLockfile(), 'skillbox/first-resource', entry),
      'skillbox/second-resource',
      entry,
    );

    const output = serializeLockfile(shared);

    expect(output).not.toContain('&');
    expect(output).not.toContain('*');
  });

  it('round-trips through the schema', async () => {
    const { parse } = await import('yaml');

    expect(lockfileSchema.safeParse(parse(serializeLockfile(populated))).success).toBe(
      true,
    );
  });

  it('serializes an empty lockfile', () => {
    const output = serializeLockfile(emptyLockfile());

    expect(output).toContain('lockfileVersion: 1');
    expect(output).toContain('resources: {}');
  });
});

describe('withLockedResource', () => {
  it('adds an entry', () => {
    expect(Object.keys(populated.resources)).toEqual(['skillbox/code-review']);
  });

  it('replaces an existing entry', () => {
    const replaced = withLockedResource(populated, 'skillbox/code-review', {
      ...entry,
      version: '0.2.0',
    });

    expect(replaced.resources['skillbox/code-review']?.version).toBe('0.2.0');
    expect(Object.keys(replaced.resources)).toHaveLength(1);
  });

  it('does not mutate the input', () => {
    const before = serializeLockfile(populated);
    withLockedResource(populated, 'skillbox/other-resource', entry);

    expect(serializeLockfile(populated)).toBe(before);
  });
});

describe('withoutLockedResource', () => {
  it('removes an entry', () => {
    expect(
      Object.keys(withoutLockedResource(populated, 'skillbox/code-review').resources),
    ).toEqual([]);
  });

  it('is a no-op for an absent entry', () => {
    expect(
      Object.keys(
        withoutLockedResource(populated, 'skillbox/absent-resource').resources,
      ),
    ).toEqual(['skillbox/code-review']);
  });

  it('does not mutate the input', () => {
    withoutLockedResource(populated, 'skillbox/code-review');

    expect(Object.keys(populated.resources)).toEqual(['skillbox/code-review']);
  });
});

describe('fileOwnership', () => {
  it('maps every installed path to its owning resource', () => {
    const ownership = fileOwnership(populated);

    expect(ownership.get('.skillbox/prompts/code-review/entry.md')).toBe(
      'skillbox/code-review',
    );
    expect(ownership.size).toBe(2);
  });

  it('is empty for an empty lockfile', () => {
    expect(fileOwnership(emptyLockfile()).size).toBe(0);
  });
});

describe('lockedDependents', () => {
  it('lists resources declaring a dependency on the given one', () => {
    const lockfile = withLockedResource(
      populated,
      'skillbox/workflow-resource',
      lockedResourceFor({
        version: '0.1.0',
        kind: 'workflow',
        sourcePath: 'workflows/w',
        target: '.skillbox/workflows/w',
        files: {},
        dependencies: ['skillbox/code-review'],
        requestedBy: 'direct',
      }),
    );

    expect(lockedDependents(lockfile, 'skillbox/code-review')).toEqual([
      'skillbox/workflow-resource',
    ]);
  });

  it('returns an empty list when nothing depends on it', () => {
    expect(lockedDependents(populated, 'skillbox/code-review')).toEqual([]);
  });
});
