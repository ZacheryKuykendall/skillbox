# ADR-0004: Lockfile design and determinism

- **Status:** Accepted
- **Date:** 2026-07-24
- **Tasks:** SBX-014, SBX-051, SBX-052

## Context

A project needs to record what Skillbox actually installed: exact versions, where files went, and enough information to detect drift. The specification asks for resolved versions, source location, integrity information, installed files, dependency relationships, and "installation timestamp when appropriate" — while also requiring that lockfiles be deterministic and avoid unstable data.

Those two requirements are in tension. A timestamp is by definition unstable.

The requirement that decides the design is reviewability. A lockfile is committed to version control and appears in pull request diffs. If reinstalling produces a diff when nothing changed, reviewers learn to skip the file, and the integrity information it carries — the thing that makes tampering visible — stops being read. A lockfile nobody reads provides no security value.

## Decision

`.skillbox/skillbox.lock` is **byte-deterministic YAML**. Identical inputs produce identical bytes on every machine and platform.

### Structure

```yaml
lockfileVersion: 1
resources:
  skillbox/code-review:
    version: 0.1.0
    kind: prompt
    source:
      type: local
      path: registry/prompts/code-review
    integrity: sha256-<base64>
    target: .skillbox/prompts/code-review
    files:
      .skillbox/prompts/code-review/README.md: sha256-<base64>
      .skillbox/prompts/code-review/prompt.md: sha256-<base64>
    dependencies:
      - skillbox/other-resource
    requestedBy: direct
```

### Determinism rules

1. **Sorted keys.** Every mapping is serialized in lexicographic order, at every level.
2. **No timestamps.** Not at the top level, not per resource. This deliberately declines the specification's optional timestamp.
3. **No absolute paths.** Every path is relative to the project root, POSIX-style, on all platforms.
4. **No environment or machine data.** No hostname, user, Node version, or OS.
5. **Explicit `lockfileVersion`**, so a future format change is detectable rather than ambiguous.
6. **Fixed YAML emission options** — consistent indentation, no line wrapping, no aliases — so the serializer cannot introduce variation.

Enforced by a test that serializes the same state twice and compares bytes, plus a test that reinstalls and asserts the file is unchanged.

### Integrity

Digests are SRI-style `sha256-<base64>`, matching the [Subresource Integrity](https://www.w3.org/TR/SRI/) format that npm and Yarn also use. Each installed file gets a digest, and each resource gets an aggregate digest computed over its sorted file list, so any change to any file changes the resource digest.

Path separators are normalized to `/` before hashing so digests match across Windows and POSIX. Git is configured with `core.autocrlf false` so line endings do not change content between platforms.

## Alternatives considered

**Include an installation timestamp.** The specification permits it. Rejected: it guarantees a diff on every reinstall, which trains reviewers to ignore the file. If someone needs to know when a resource was installed, `git log` on the lockfile answers it more accurately than a self-reported field. This is the one place the design deliberately declines an optional specification field, and the determinism requirement in the same specification is the justification.

**JSON instead of YAML.** A strong candidate: `JSON.stringify` with sorted keys is trivially deterministic, and machine-generated files gain nothing from comments. Rejected for consistency — the project manifest is YAML, and two formats inside one `.skillbox/` directory is a papercut for anyone reading both. Determinism is achievable in YAML with fixed emission options, and it is tested.

**TOML.** Rejected: nested tables for per-file digests are verbose, and the ecosystem's serializers offer weaker ordering guarantees.

**A flat list of resources instead of a keyed map.** Rejected: a map keyed by `namespace/name` makes lookup direct and gives sorting a single obvious definition. A list requires deciding and enforcing a sort order separately.

**Store only a resource-level digest, not per-file digests.** Smaller file. Rejected: per-file digests are what let `remove` identify *which* file you edited and preserve exactly that one (FR-9.2), and what let `doctor` name the drifted file. A single aggregate digest can only say "something changed."

**No lockfile; derive state by scanning the project.** Rejected. Scanning cannot distinguish a file Skillbox installed from an identical file you wrote, cannot know the resolved version, and cannot detect modification without a recorded baseline.

**Store the full transitive graph rather than direct edges.** Rejected as redundant. Direct edges plus `requestedBy` are enough to reconstruct the graph, and storing the closure would amplify every change into a large diff.

## Consequences

Positive:

- Reinstalling produces no diff, so a diff always means something real changed.
- Small, readable diffs keep the integrity information under actual review.
- Per-file digests make modification detection precise enough to preserve a user's edits.
- Cross-platform stability means Windows and Linux developers do not fight over the file.
- `lockfileVersion` makes a future migration detectable.

Negative:

- No record of when a resource was installed. Recoverable from git history; accepted.
- Sorted-key serialization requires a deliberate serializer rather than a default dump.
- YAML determinism is a property of the emission options, so it must be tested rather than assumed. It is.
- Digests of text files are sensitive to line endings, which is why `core.autocrlf false` is required and documented.

## Follow-up work

- SBX-111: Signed packages will add signature fields, requiring a `lockfileVersion` bump and a new ADR.
- SBX-102: Remote sources will extend `source.type` beyond `local`.

## References

- [Subresource Integrity](https://www.w3.org/TR/SRI/) — the `sha256-<base64>` format
- [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)
