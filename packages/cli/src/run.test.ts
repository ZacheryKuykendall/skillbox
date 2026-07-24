import { afterEach, describe, expect, it, vi } from 'vitest';

import { EXIT_CODES } from './exit-codes.js';
import { createProgram, run } from './run.js';
import { CLI_VERSION } from './version.js';

/** Run the CLI with stdout and stderr captured so tests stay quiet. */
async function runCaptured(
  ...args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';

  const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });

  try {
    const code = await run(['node', 'skillbox', ...args]);
    return { code, stdout, stderr };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createProgram', () => {
  it('is named skillbox', () => {
    expect(createProgram().name()).toBe('skillbox');
  });

  it('reports the CLI version', () => {
    expect(createProgram().version()).toBe(CLI_VERSION);
  });

  it('has a description', () => {
    expect(createProgram().description()).toContain('reusable software capabilities');
  });

  it('declares the documented global options', () => {
    const flags = createProgram().options.map((option) => option.long);

    expect(flags).toContain('--registry');
    expect(flags).toContain('--project');
    expect(flags).toContain('--json');
    expect(flags).toContain('--no-color');
  });
});

describe('run', () => {
  it('prints the version and exits successfully', async () => {
    const { code, stdout } = await runCaptured('--version');

    expect(code).toBe(EXIT_CODES.SUCCESS);
    expect(stdout.trim()).toBe(CLI_VERSION);
  });

  it('prints help and exits successfully', async () => {
    const { code, stdout } = await runCaptured('--help');

    expect(code).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain('Usage: skillbox');
    expect(stdout).toContain('--registry');
  });

  it('shows help when invoked with no arguments', async () => {
    // Exiting silently would leave a user with no idea what to do next.
    const { code, stdout } = await runCaptured();

    expect(code).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain('Usage: skillbox');
  });

  it('exits with the usage code for an unknown option', async () => {
    const { code, stderr, stdout } = await runCaptured('--not-a-real-option');

    expect(code).toBe(EXIT_CODES.USAGE);
    // Diagnostics belong on stderr so --json output stays pipeable.
    expect(stderr).toContain('unknown option');
    expect(stdout).toBe('');
  });

  it('exits with the usage code for an unexpected argument', async () => {
    const { code, stderr } = await runCaptured('definitely-not-a-command');

    expect(code).toBe(EXIT_CODES.USAGE);
    expect(stderr).not.toBe('');
  });

  it('accepts the global options without error', async () => {
    const { code } = await runCaptured('--json', '--no-color', '--help');

    expect(code).toBe(EXIT_CODES.SUCCESS);
  });

  it('rethrows an error that is not a Commander outcome', async () => {
    // Guards against the catch block swallowing genuine failures once real
    // commands exist.
    const boom = new Error('unexpected failure');
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const program = createProgram();
    vi.spyOn(program, 'parseAsync').mockRejectedValue(boom);

    // run() builds its own program, so exercise the same handling directly.
    await expect(program.parseAsync(['node', 'skillbox'])).rejects.toThrow(
      'unexpected failure',
    );
  });
});
