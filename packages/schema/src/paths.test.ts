import { describe, expect, it } from 'vitest';

import {
  checkManifestPath,
  describePathRejection,
  manifestPathListSchema,
  manifestPathSchema,
} from './paths.js';

describe('checkManifestPath', () => {
  describe('accepts safe relative paths', () => {
    it.each([
      'prompt.md',
      'README.md',
      'src/client.ts',
      'a/b/c/d.txt',
      '.skillbox/prompts/code-review',
      'src/components/structured-logger',
      'file-with-hyphens.md',
      'file_with_underscore.md',
      'UPPERCASE.MD',
      '.hidden',
      'dir.with.dots/file.txt',
    ])('accepts %s', (value) => {
      expect(checkManifestPath(value)).toBeUndefined();
    });
  });

  // Each vector is asserted individually rather than in a loop so a regression
  // names the specific form that stopped being rejected.
  describe('rejects traversal', () => {
    it('rejects a leading parent segment', () => {
      expect(checkManifestPath('../etc/passwd')).toBe('parent-segment');
    });

    it('rejects a parent segment in the middle of a path', () => {
      expect(checkManifestPath('a/../../etc/passwd')).toBe('parent-segment');
    });

    it('rejects a trailing parent segment', () => {
      expect(checkManifestPath('a/b/..')).toBe('parent-segment');
    });

    it('rejects a bare parent segment', () => {
      expect(checkManifestPath('..')).toBe('parent-segment');
    });

    it('rejects deeply nested traversal', () => {
      expect(checkManifestPath('../../../../../../etc/passwd')).toBe('parent-segment');
    });

    it('accepts a filename that merely starts with two dots', () => {
      // "..config" is a legitimate filename; only a whole ".." segment escapes.
      expect(checkManifestPath('..config')).toBeUndefined();
    });
  });

  describe('rejects absolute paths', () => {
    it('rejects a POSIX absolute path', () => {
      expect(checkManifestPath('/etc/passwd')).toBe('absolute-posix');
    });

    it('rejects a POSIX absolute path to a single file', () => {
      expect(checkManifestPath('/evil.txt')).toBe('absolute-posix');
    });

    it('rejects a Windows absolute path with a backslash', () => {
      expect(checkManifestPath('C:\\Windows\\System32\\drivers\\etc\\hosts')).toBe(
        'absolute-windows',
      );
    });

    it('rejects a Windows absolute path with a forward slash', () => {
      expect(checkManifestPath('C:/Windows/System32')).toBe('absolute-windows');
    });

    it('rejects a lowercase drive letter', () => {
      expect(checkManifestPath('c:/windows')).toBe('absolute-windows');
    });
  });

  describe('rejects Windows-specific forms on every platform', () => {
    it('rejects a drive-relative path', () => {
      // "C:evil.txt" resolves against the current directory *on drive C*, which
      // is not necessarily the project directory.
      expect(checkManifestPath('C:evil.txt')).toBe('drive-relative');
    });

    it('rejects a UNC path with backslashes', () => {
      expect(checkManifestPath('\\\\server\\share\\evil.txt')).toBe('unc');
    });

    it('rejects a UNC-style path with forward slashes', () => {
      expect(checkManifestPath('//server/share/evil.txt')).toBe('unc');
    });

    it('rejects a leading backslash', () => {
      expect(checkManifestPath('\\evil.txt')).toBe('backslash');
    });

    it('rejects an embedded backslash', () => {
      expect(checkManifestPath('src\\client.ts')).toBe('backslash');
    });
  });

  describe('rejects malformed paths', () => {
    it('rejects an empty string', () => {
      expect(checkManifestPath('')).toBe('empty');
    });

    it('rejects a NUL byte', () => {
      // A NUL can truncate a path in a native call, so a value that looks safe
      // to a later check could still resolve somewhere else.
      expect(checkManifestPath('safe.txt\u0000../../evil')).toBe('nul-byte');
    });

    it('checks for a NUL byte before anything else', () => {
      expect(checkManifestPath('/etc\u0000passwd')).toBe('nul-byte');
    });

    it('rejects a current-directory segment', () => {
      expect(checkManifestPath('./prompt.md')).toBe('current-segment');
    });

    it('rejects a current-directory segment in the middle', () => {
      expect(checkManifestPath('a/./b')).toBe('current-segment');
    });

    it('rejects a trailing slash', () => {
      expect(checkManifestPath('src/')).toBe('trailing-slash');
    });

    it('rejects an empty path segment', () => {
      expect(checkManifestPath('a//b')).toBe('double-slash');
    });
  });
});

describe('describePathRejection', () => {
  it('gives a message for every rejection reason', () => {
    const reasons = [
      'empty',
      'nul-byte',
      'absolute-posix',
      'absolute-windows',
      'drive-relative',
      'unc',
      'backslash',
      'parent-segment',
      'current-segment',
      'trailing-slash',
      'double-slash',
    ] as const;

    for (const reason of reasons) {
      expect(describePathRejection(reason)).toBeTruthy();
      expect(describePathRejection(reason).length).toBeGreaterThan(10);
    }
  });

  it('describes traversal in terms a resource author can act on', () => {
    expect(describePathRejection('parent-segment')).toContain('".."');
  });
});

describe('manifestPathSchema', () => {
  it('accepts a safe path', () => {
    expect(manifestPathSchema.safeParse('src/client.ts').success).toBe(true);
  });

  it('rejects traversal and explains why', () => {
    const result = manifestPathSchema.safeParse('../evil');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('".."');
    }
  });

  it('attaches the machine-readable rejection reason to the issue', () => {
    const result = manifestPathSchema.safeParse('/etc/passwd');

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0] as { params?: { rejection?: string } };
      expect(issue.params?.rejection).toBe('absolute-posix');
    }
  });

  it('rejects a non-string value', () => {
    expect(manifestPathSchema.safeParse(42).success).toBe(false);
  });
});

describe('manifestPathListSchema', () => {
  it('accepts a list of safe paths', () => {
    expect(manifestPathListSchema.safeParse(['a.md', 'b/c.ts']).success).toBe(true);
  });

  it('requires at least one entry', () => {
    const result = manifestPathListSchema.safeParse([]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('at least one');
    }
  });

  it('rejects duplicates', () => {
    const result = manifestPathListSchema.safeParse(['a.md', 'a.md']);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('duplicate'))).toBe(
        true,
      );
    }
  });

  it('rejects the whole list when one entry is unsafe', () => {
    const result = manifestPathListSchema.safeParse(['safe.md', '../evil']);

    expect(result.success).toBe(false);
  });

  it('reports the index of the offending entry', () => {
    const result = manifestPathListSchema.safeParse(['safe.md', '../evil']);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual([1]);
    }
  });
});
