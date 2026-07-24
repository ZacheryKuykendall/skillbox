import { SkillboxError } from './errors.js';

/**
 * Project variable substitution.
 *
 * Substitutes declared project variables into installed text files. Project
 * variables are configuration, never secrets: environment variable values are
 * never read or substituted (SR-7).
 */

/**
 * `{{skillbox.name}}` — namespaced so a template cannot accidentally collide with
 * a handlebars or Jinja expression the resource genuinely intends to ship.
 */
const PLACEHOLDER = /\{\{\s*skillbox\.([a-z0-9][a-z0-9-]*)\s*\}\}/g;

/** File extensions treated as text and therefore eligible for substitution. */
const TEXT_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.yaml',
  '.yml',
  '.json',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.sh',
  '.ps1',
  '.toml',
  '.ini',
  '.env',
  '.html',
  '.css',
  '.xml',
  '.csv',
  '.sql',
  '.graphql',
]);

/** Is this path treated as text for substitution purposes? */
export function isTextPath(filePath: string): boolean {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return false;

  return TEXT_EXTENSIONS.has(filePath.slice(lastDot).toLowerCase());
}

/** Every variable name referenced by a template, in order of first appearance. */
export function referencedVariables(contents: string): readonly string[] {
  const names: string[] = [];

  for (const match of contents.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (name !== undefined && !names.includes(name)) names.push(name);
  }

  return names;
}

/**
 * Substitute project variables into text.
 *
 * An undeclared reference is an error, not an empty string: silently producing a
 * file with a missing value would surface as a confusing failure much later
 * (FR-8.7).
 *
 * @throws {SkillboxError} `UNDECLARED_VARIABLE`.
 */
export function substituteVariables(
  contents: string,
  variables: Readonly<Record<string, string>>,
  context: { readonly location: string },
): string {
  const missing: string[] = [];

  const result = contents.replace(PLACEHOLDER, (_match, name: string) => {
    const value = variables[name];

    if (value === undefined) {
      if (!missing.includes(name)) missing.push(name);
      return _match;
    }

    return value;
  });

  if (missing.length > 0) {
    throw new SkillboxError({
      code: 'UNDECLARED_VARIABLE',
      message: `The file references ${
        missing.length === 1 ? 'a project variable' : 'project variables'
      } that ${missing.length === 1 ? 'is' : 'are'} not declared: ${missing.join(', ')}.`,
      location: context.location,
      details: missing.map((name) => `{{skillbox.${name}}}`),
      hint: 'Declare the variable under spec.variables in .skillbox/skillbox.yaml.',
    });
  }

  return result;
}

/**
 * Apply substitution to a file's contents when it is text.
 *
 * A binary file is returned untouched: rewriting bytes that happen to match the
 * placeholder pattern would corrupt it.
 */
export function substituteInFile(
  filePath: string,
  contents: Buffer,
  variables: Readonly<Record<string, string>>,
): Buffer {
  if (Object.keys(variables).length === 0) return contents;
  if (!isTextPath(filePath)) return contents;

  const text = contents.toString('utf8');
  const substituted = substituteVariables(text, variables, { location: filePath });

  return substituted === text ? contents : Buffer.from(substituted, 'utf8');
}
