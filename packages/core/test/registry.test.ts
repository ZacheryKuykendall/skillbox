import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RESOURCE_KINDS } from '@skillbox/schema';
import { describe, expect, it } from 'vitest';

import { kindsInCatalog, loadCatalog } from '../src/catalog.js';
import { buildGraph } from '../src/graph.js';
import { resolve } from '../src/resolve.js';
import { validateDirectory } from '../src/validate.js';

/**
 * Tests against the real catalog in this repository.
 *
 * These are the guard on the MVP's promise of one working example of every
 * supported kind (SBX-077). Unlike the unit tests, which use temporary fixtures,
 * these read `registry/` so a broken contributed resource fails the build.
 */

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);
const registryRoot = path.join(repositoryRoot, 'registry');

describe('the shipped catalog', () => {
  it('loads with no failures', async () => {
    const catalog = await loadCatalog(registryRoot);

    expect(catalog.failures).toEqual([]);
    expect(catalog.resources.length).toBeGreaterThan(0);
  });

  it('contains an example of every supported kind', async () => {
    // The MVP promises one working example per kind; without this the promise
    // could lapse silently as the catalog changes.
    const catalog = await loadCatalog(registryRoot);

    expect(kindsInCatalog(catalog)).toEqual([...RESOURCE_KINDS].sort());
  });

  it('validates with no errors', async () => {
    const catalog = await loadCatalog(registryRoot);
    const report = await validateDirectory({ directory: registryRoot, catalog });

    if (!report.ok) {
      const detail = report.targets
        .filter((target) => target.diagnostics.length > 0)
        .map(
          (target) =>
            `${target.location}\n${target.diagnostics
              .map((d) => `  ${d.severity} ${d.path}: ${d.message}`)
              .join('\n')}`,
        )
        .join('\n\n');

      throw new Error(`The catalog has validation errors:\n\n${detail}`);
    }

    expect(report.errors).toBe(0);
  });

  it('validates with no warnings, so no file is left undeclared', async () => {
    const catalog = await loadCatalog(registryRoot);
    const report = await validateDirectory({ directory: registryRoot, catalog });

    expect(report.warnings).toBe(0);
  });

  it('uses the skillbox namespace throughout', async () => {
    const catalog = await loadCatalog(registryRoot);

    for (const resource of catalog.resources) {
      expect(resource.manifest.metadata.namespace).toBe('skillbox');
    }
  });

  it('gives every resource a README', async () => {
    const catalog = await loadCatalog(registryRoot);

    for (const resource of catalog.resources) {
      expect(
        resource.manifest.spec.files,
        `${resource.identifier} must declare README.md`,
      ).toContain('README.md');
    }
  });

  it('documents permissions for every resource that declares them', async () => {
    // A permission list is only useful if the README explains why each is needed.
    const catalog = await loadCatalog(registryRoot);
    const { readFile } = await import('node:fs/promises');

    for (const resource of catalog.resources) {
      const permissions = resource.manifest.spec.permissions ?? [];
      if (permissions.length === 0) continue;

      const readme = await readFile(path.join(resource.directory, 'README.md'), 'utf8');

      for (const permission of permissions) {
        expect(
          readme,
          `${resource.identifier} README must document the ${permission} permission`,
        ).toContain(permission);
      }
    }
  });

  it('states that permissions are not enforced wherever they are listed', async () => {
    // A permission list that reads like a sandbox guarantee is worse than none.
    const catalog = await loadCatalog(registryRoot);
    const { readFile } = await import('node:fs/promises');

    for (const resource of catalog.resources) {
      if ((resource.manifest.spec.permissions ?? []).length === 0) continue;

      const readme = await readFile(path.join(resource.directory, 'README.md'), 'utf8');

      expect(
        readme.includes('not enforced') || readme.includes('does not enforce'),
        `${resource.identifier} README must state that permissions are not enforced`,
      ).toBe(true);
    }
  });

  it('resolves every declared dependency', async () => {
    const catalog = await loadCatalog(registryRoot);

    for (const resource of catalog.resources) {
      for (const dependency of resource.manifest.spec.dependencies ?? []) {
        expect(
          catalog.has(dependency.resource),
          `${resource.identifier} depends on ${dependency.resource}, which is not in the catalog`,
        ).toBe(true);
      }
    }
  });

  it('builds a dependency graph for every resource without a cycle', async () => {
    const catalog = await loadCatalog(registryRoot);

    for (const name of catalog.names()) {
      expect(() => buildGraph(catalog, [{ reference: name }]), name).not.toThrow();
    }
  });

  it('installs the whole catalog as one acyclic graph', async () => {
    const catalog = await loadCatalog(registryRoot);

    const graph = buildGraph(
      catalog,
      catalog.names().map((name) => ({ reference: name })),
    );

    expect(graph.order).toHaveLength(catalog.names().length);
    expect(graph.missingOptional).toEqual([]);
  });

  it('resolves the workflow example transitively to four resources', async () => {
    // The workflow declares three dependencies, one of which has its own. Both
    // paths reach code-review, and it must appear exactly once.
    const catalog = await loadCatalog(registryRoot);

    const graph = buildGraph(catalog, [
      { reference: 'skillbox/plan-implement-review' },
    ]);
    const names = graph.order.map((node) => node.resource.qualifiedName);

    expect(names).toHaveLength(4);
    expect(names.filter((name) => name === 'skillbox/code-review')).toHaveLength(1);

    // Dependencies precede the resources that need them.
    expect(names.indexOf('skillbox/code-review')).toBeLessThan(
      names.indexOf('skillbox/implementation-planner'),
    );
    expect(names.indexOf('skillbox/implementation-planner')).toBeLessThan(
      names.indexOf('skillbox/plan-implement-review'),
    );
  });

  it('resolves each resource by its qualified name', async () => {
    const catalog = await loadCatalog(registryRoot);

    for (const name of catalog.names()) {
      expect(resolve(catalog, name).qualifiedName).toBe(name);
    }
  });

  it('declares no secret-looking value anywhere', async () => {
    // Contributed resources are the most likely place for a credential to slip in.
    const catalog = await loadCatalog(registryRoot);
    const { readFile } = await import('node:fs/promises');

    const patterns: readonly [string, RegExp][] = [
      ['a GitHub token', /gh[pousr]_[A-Za-z0-9]{16,}/],
      ['an AWS access key', /AKIA[0-9A-Z]{16}/],
      ['a private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
      ['a bearer token literal', /Bearer\s+[A-Za-z0-9_\-.]{24,}/],
    ];

    for (const resource of catalog.resources) {
      for (const file of resource.manifest.spec.files) {
        const contents = await readFile(path.join(resource.directory, file), 'utf8');

        for (const [label, pattern] of patterns) {
          expect(
            pattern.test(contents),
            `${resource.identifier}/${file} appears to contain ${label}`,
          ).toBe(false);
        }
      }
    }
  });

  it('declares environment variables by name with no value field', async () => {
    const catalog = await loadCatalog(registryRoot);

    for (const resource of catalog.resources) {
      for (const variable of resource.manifest.spec.env ?? []) {
        expect(variable.name).toMatch(/^[A-Z][A-Z0-9_]*$/);
        // The schema has no value field at all; this asserts the shape stays that way.
        expect(Object.keys(variable).sort()).not.toContain('value');
      }
    }
  });

  it('marks a token-bearing environment variable as secret', async () => {
    const catalog = await loadCatalog(registryRoot);

    for (const resource of catalog.resources) {
      for (const variable of resource.manifest.spec.env ?? []) {
        if (!/TOKEN|SECRET|PASSWORD|KEY$/.test(variable.name)) continue;

        expect(
          variable.secret,
          `${resource.identifier} declares ${variable.name}, which should be marked secret`,
        ).toBe(true);
      }
    }
  });

  it('keeps every install target relative and inside the project', async () => {
    const catalog = await loadCatalog(registryRoot);

    for (const resource of catalog.resources) {
      expect(resource.target).not.toMatch(/^([/\\]|[A-Za-z]:)/);
      expect(resource.target.split('/')).not.toContain('..');
    }
  });

  it('installs only component and api kinds into the project source tree', async () => {
    // Everything else is Skillbox-managed metadata and belongs under .skillbox/.
    const catalog = await loadCatalog(registryRoot);

    for (const resource of catalog.resources) {
      if (resource.target.startsWith('.skillbox/')) continue;

      expect(
        ['component', 'api'],
        `${resource.identifier} installs to ${resource.target}, outside .skillbox/`,
      ).toContain(resource.manifest.kind);
    }
  });
});
