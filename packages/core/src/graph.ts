import { satisfiesRange } from '@skillbox/schema';

import type { Catalog } from './catalog.js';
import { SkillboxError } from './errors.js';
import type { LoadedResource } from './manifest-loader.js';
import { resolve } from './resolve.js';

/**
 * Dependency graph construction, cycle detection, and install ordering.
 */

/** One node in the resolved graph. */
export interface GraphNode {
  readonly resource: LoadedResource;
  /** `direct` when the project requested it, otherwise the requesting resource. */
  readonly requestedBy: string;
  /** Qualified names this resource depends on. */
  readonly dependencies: readonly string[];
  /** True when the project requested this resource explicitly. */
  readonly direct: boolean;
}

export interface DependencyGraph {
  /** Nodes in topological order: dependencies before the resources needing them. */
  readonly order: readonly GraphNode[];
  /** Nodes keyed by qualified name. */
  readonly nodes: ReadonlyMap<string, GraphNode>;
  /** Optional dependencies that were absent, reported as warnings. */
  readonly missingOptional: readonly string[];
}

interface Requirement {
  readonly qualifiedName: string;
  readonly range: string | undefined;
  readonly requestedBy: string;
  readonly optional: boolean;
}

/**
 * Build the transitive dependency graph for a set of requested references.
 *
 * Resolution is breadth-first over requirements, so an error names the shallowest
 * cause rather than something deep in the tree.
 *
 * @throws {SkillboxError} `MISSING_DEPENDENCY`, `VERSION_CONFLICT`, or
 * `CIRCULAR_DEPENDENCY`.
 */
export function buildGraph(
  catalog: Catalog,
  requested: readonly { readonly reference: string; readonly range?: string }[],
): DependencyGraph {
  const resolved = new Map<string, GraphNode>();
  const missingOptional: string[] = [];

  const queue: Requirement[] = requested.map((entry) => ({
    qualifiedName: entry.reference,
    range: entry.range,
    requestedBy: 'direct',
    optional: false,
  }));

  while (queue.length > 0) {
    const requirement = queue.shift()!;

    const reference =
      requirement.range === undefined
        ? requirement.qualifiedName
        : `${stripVersion(requirement.qualifiedName)}@${requirement.range}`;

    let resource: LoadedResource;
    try {
      resource = resolve(catalog, reference);
    } catch (error) {
      if (requirement.optional && SkillboxError.is(error)) {
        missingOptional.push(requirement.qualifiedName);
        continue;
      }
      throw asDependencyError(error, requirement);
    }

    const existing = resolved.get(resource.qualifiedName);

    if (existing !== undefined) {
      // Reached by a second path. Confirm the already-chosen version also
      // satisfies this requirement, otherwise the two cannot both be met.
      assertCompatible(existing, requirement);
      continue;
    }

    const dependencies = resource.manifest.spec.dependencies ?? [];

    resolved.set(resource.qualifiedName, {
      resource,
      requestedBy: requirement.requestedBy,
      dependencies: dependencies.map((dependency) => dependency.resource),
      direct: requirement.requestedBy === 'direct',
    });

    for (const dependency of dependencies) {
      if (dependency.resource === resource.qualifiedName) {
        throw new SkillboxError({
          code: 'CIRCULAR_DEPENDENCY',
          message: `Resource "${resource.identifier}" depends on itself.`,
          location: resource.manifestPath,
          hint: 'Remove the self-reference from spec.dependencies.',
        });
      }

      queue.push({
        qualifiedName: dependency.resource,
        range: dependency.version,
        requestedBy: resource.qualifiedName,
        optional: dependency.optional === true,
      });
    }
  }

  return {
    order: topologicalOrder(resolved),
    nodes: resolved,
    missingOptional,
  };
}

/**
 * Order nodes so every dependency precedes the resources needing it.
 *
 * Depth-first with an explicit in-progress set, so a cycle is detected with the
 * full path rather than as a stack overflow (FR-5.4).
 */
function topologicalOrder(nodes: ReadonlyMap<string, GraphNode>): GraphNode[] {
  const order: GraphNode[] = [];
  const finished = new Set<string>();
  const inProgress = new Set<string>();

  // Sorted so the resulting order is deterministic for a given graph.
  const roots = [...nodes.keys()].sort();

  function visit(name: string, trail: readonly string[]): void {
    if (finished.has(name)) return;

    if (inProgress.has(name)) {
      const cycleStart = trail.indexOf(name);
      const cycle = [...trail.slice(cycleStart === -1 ? 0 : cycleStart), name];

      throw new SkillboxError({
        code: 'CIRCULAR_DEPENDENCY',
        message: `Circular dependency detected: ${cycle.join(' -> ')}`,
        // The full path is what makes a cycle actionable; naming one resource
        // leaves the reader to reconstruct the loop themselves.
        details: [`Cycle: ${cycle.join(' -> ')}`],
        hint: 'Break the cycle by removing one of these dependencies.',
      });
    }

    const node = nodes.get(name);
    if (node === undefined) return;

    inProgress.add(name);

    for (const dependency of [...node.dependencies].sort()) {
      visit(dependency, [...trail, name]);
    }

    inProgress.delete(name);
    finished.add(name);
    order.push(node);
  }

  for (const name of roots) {
    visit(name, []);
  }

  return order;
}

function assertCompatible(node: GraphNode, requirement: Requirement): void {
  if (requirement.range === undefined) return;

  const version = node.resource.manifest.metadata.version;

  if (!satisfiesRange(version, requirement.range)) {
    throw new SkillboxError({
      code: 'VERSION_CONFLICT',
      message: `Cannot satisfy both requirements for "${node.resource.qualifiedName}".`,
      details: [
        `${node.requestedBy} requires a version already resolved to ${version}`,
        `${requirement.requestedBy} requires ${requirement.range}`,
      ],
      hint: 'Update one of the dependency ranges so a single version satisfies both.',
    });
  }
}

function asDependencyError(error: unknown, requirement: Requirement): unknown {
  if (!SkillboxError.is(error)) return error;

  if (requirement.requestedBy === 'direct') return error;

  // Naming the requester turns "something is missing" into "this resource asked
  // for something missing" (FR-5.3).
  if (error.code === 'RESOURCE_NOT_FOUND' || error.code === 'VERSION_NOT_FOUND') {
    return new SkillboxError({
      code: 'MISSING_DEPENDENCY',
      message: `"${requirement.requestedBy}" depends on "${requirement.qualifiedName}"${
        requirement.range === undefined ? '' : `@${requirement.range}`
      }, which could not be resolved.`,
      details: [error.message, ...error.details],
      hint: 'Add the missing resource to the catalog, or remove the dependency.',
      cause: error,
    });
  }

  return error;
}

/** Strip a version or range from a reference, leaving `namespace/name`. */
function stripVersion(reference: string): string {
  const atIndex = reference.indexOf('@');
  return atIndex === -1 ? reference : reference.slice(0, atIndex);
}

/** The direct dependents of a resource within a graph. */
export function dependentsOf(
  graph: DependencyGraph,
  qualifiedName: string,
): readonly string[] {
  const dependents: string[] = [];

  for (const [name, node] of graph.nodes) {
    if (node.dependencies.includes(qualifiedName)) {
      dependents.push(name);
    }
  }

  return dependents.sort();
}
