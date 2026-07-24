import type { ResourceKind } from '@skillbox/schema';

import type { Catalog } from './catalog.js';
import type { LoadedResource } from './manifest-loader.js';

/**
 * Catalog search.
 *
 * Matches across name, namespace, description, kind, and tags, case-insensitively
 * (FR-3.1, FR-3.2). Ranking is deterministic so the same query always produces
 * the same order (FR-3.3).
 */

export interface SearchOptions {
  readonly query?: string | undefined;
  readonly kind?: ResourceKind | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly limit?: number | undefined;
  /** Include every version, not just the newest of each name. Default `false`. */
  readonly allVersions?: boolean | undefined;
}

export interface SearchHit {
  readonly resource: LoadedResource;
  /** Higher is a better match. Used for ordering, not for display. */
  readonly score: number;
  /** Which fields matched, for explaining a result. */
  readonly matchedFields: readonly string[];
}

/**
 * Scores by match quality.
 *
 * An exact name match ranks above a prefix, which ranks above a substring, which
 * ranks above a description hit. Someone searching "code-review" wants the
 * resource called that, not everything mentioning review (FR-3.3).
 */
const SCORES = {
  exactName: 100,
  prefixName: 60,
  substringName: 40,
  exactTag: 30,
  namespace: 20,
  kind: 15,
  substringTag: 10,
  description: 5,
} as const;

function scoreResource(
  resource: LoadedResource,
  query: string,
): { score: number; matchedFields: string[] } {
  const { metadata, kind } = {
    metadata: resource.manifest.metadata,
    kind: resource.manifest.kind,
  };
  const name = metadata.name.toLowerCase();
  const namespace = metadata.namespace.toLowerCase();
  const description = metadata.description.toLowerCase();
  const tags = (metadata.tags ?? []).map((tag) => tag.toLowerCase());

  let score = 0;
  const matchedFields: string[] = [];

  if (name === query) {
    score += SCORES.exactName;
    matchedFields.push('name');
  } else if (name.startsWith(query)) {
    score += SCORES.prefixName;
    matchedFields.push('name');
  } else if (name.includes(query)) {
    score += SCORES.substringName;
    matchedFields.push('name');
  }

  if (tags.includes(query)) {
    score += SCORES.exactTag;
    matchedFields.push('tags');
  } else if (tags.some((tag) => tag.includes(query))) {
    score += SCORES.substringTag;
    matchedFields.push('tags');
  }

  if (namespace.includes(query)) {
    score += SCORES.namespace;
    matchedFields.push('namespace');
  }

  if (kind === query) {
    score += SCORES.kind;
    matchedFields.push('kind');
  }

  if (description.includes(query)) {
    score += SCORES.description;
    matchedFields.push('description');
  }

  return { score, matchedFields };
}

/**
 * Search the catalog.
 *
 * An empty query lists everything (FR-3.4). Filters are applied before scoring,
 * so `--kind` narrows the set rather than merely reordering it.
 */
export function search(catalog: Catalog, options: SearchOptions = {}): SearchHit[] {
  const query = options.query?.trim().toLowerCase() ?? '';
  const wantedTags = options.tags?.map((tag) => tag.toLowerCase()) ?? [];

  const candidates =
    options.allVersions === true ? catalog.resources : newestOfEach(catalog);

  const hits: SearchHit[] = [];

  for (const resource of candidates) {
    if (options.kind !== undefined && resource.manifest.kind !== options.kind) {
      continue;
    }

    if (wantedTags.length > 0) {
      const tags = (resource.manifest.metadata.tags ?? []).map((tag) =>
        tag.toLowerCase(),
      );
      if (!wantedTags.every((wanted) => tags.includes(wanted))) continue;
    }

    if (query.length === 0) {
      hits.push({ resource, score: 0, matchedFields: [] });
      continue;
    }

    const { score, matchedFields } = scoreResource(resource, query);
    if (score > 0) {
      hits.push({ resource, score, matchedFields });
    }
  }

  // Identifier is the tiebreaker so equal scores never order arbitrarily.
  hits.sort(
    (a, b) =>
      b.score - a.score || a.resource.identifier.localeCompare(b.resource.identifier),
  );

  return options.limit === undefined ? hits : hits.slice(0, Math.max(0, options.limit));
}

/** The newest version of each distinct `namespace/name`. */
function newestOfEach(catalog: Catalog): LoadedResource[] {
  return catalog
    .names()
    .map((name) => catalog.versionsOf(name)[0])
    .filter((resource): resource is LoadedResource => resource !== undefined);
}
