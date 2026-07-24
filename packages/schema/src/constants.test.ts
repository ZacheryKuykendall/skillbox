import { describe, expect, it } from 'vitest';

import {
  API_VERSION,
  DEFAULT_INSTALL_TARGETS,
  ENV_NAME_PATTERN,
  IDENTIFIER_PATTERN,
  KIND_DIRECTORIES,
  PERMISSIONS,
  RESOURCE_KINDS,
  SUPPORTED_API_VERSIONS,
} from './constants.js';

describe('API_VERSION', () => {
  it('is the documented v1alpha1 identifier', () => {
    expect(API_VERSION).toBe('skillbox.dev/v1alpha1');
  });

  it('is included in the supported versions list', () => {
    expect(SUPPORTED_API_VERSIONS).toContain(API_VERSION);
  });
});

describe('RESOURCE_KINDS', () => {
  it('contains exactly the seven documented kinds', () => {
    expect([...RESOURCE_KINDS]).toEqual([
      'prompt',
      'skill',
      'agent',
      'script',
      'api',
      'workflow',
      'component',
    ]);
  });

  it('has a registry directory for every kind', () => {
    for (const kind of RESOURCE_KINDS) {
      expect(KIND_DIRECTORIES[kind]).toBeTruthy();
    }
  });

  it('has a default install target for every kind', () => {
    for (const kind of RESOURCE_KINDS) {
      expect(DEFAULT_INSTALL_TARGETS[kind]).toBeTruthy();
    }
  });

  it('uses unique registry directories so kinds cannot collide', () => {
    const directories = RESOURCE_KINDS.map((kind) => KIND_DIRECTORIES[kind]);
    expect(new Set(directories).size).toBe(RESOURCE_KINDS.length);
  });

  it('installs components into project source rather than .skillbox', () => {
    // Components are application source meant to live alongside a project's own
    // code; every other kind is Skillbox-managed metadata.
    expect(DEFAULT_INSTALL_TARGETS.component).toBe('src/components');
    expect(DEFAULT_INSTALL_TARGETS.prompt.startsWith('.skillbox/')).toBe(true);
  });
});

describe('PERMISSIONS', () => {
  it('is a closed vocabulary with no duplicates', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it('namespaces every permission with a colon', () => {
    for (const permission of PERMISSIONS) {
      expect(permission).toMatch(/^[a-z]+:[a-z]+$/);
    }
  });
});

describe('IDENTIFIER_PATTERN', () => {
  it.each(['ab', 'code-review', 'a1', 'x-y-z', 'abc123', 'skillbox'])(
    'accepts %s',
    (value) => {
      expect(IDENTIFIER_PATTERN.test(value)).toBe(true);
    },
  );

  it.each([
    ['-leading', 'a leading hyphen'],
    ['trailing-', 'a trailing hyphen'],
    ['Upper', 'uppercase letters'],
    ['has_underscore', 'underscores'],
    ['has.dot', 'dots'],
    ['has space', 'spaces'],
    ['', 'an empty string'],
    ['a/b', 'a slash'],
    ['a@b', 'an at sign'],
  ])('rejects %s because it contains %s', (value) => {
    expect(IDENTIFIER_PATTERN.test(value)).toBe(false);
  });
});

describe('ENV_NAME_PATTERN', () => {
  it.each(['PATH', 'SKILLBOX_TOKEN', 'A1_B2'])('accepts %s', (value) => {
    expect(ENV_NAME_PATTERN.test(value)).toBe(true);
  });

  it.each([
    ['lowercase', 'lowercase letters'],
    ['_LEADING', 'a leading underscore'],
    ['1LEADING', 'a leading digit'],
    ['HAS-HYPHEN', 'a hyphen'],
    ['', 'an empty string'],
  ])('rejects %s because it has %s', (value) => {
    expect(ENV_NAME_PATTERN.test(value)).toBe(false);
  });
});
