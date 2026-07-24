# ADR-0002: Resource manifest format

- **Status:** Accepted
- **Date:** 2026-07-24
- **Tasks:** SBX-014, SBX-031, SBX-032, SBX-033, SBX-034, SBX-036

## Context

Skillbox must describe seven different kinds of resource — `prompt`, `skill`, `agent`, `script`, `api`, `workflow`, `component` — with one consistent format. The kinds have genuinely different needs: a `script` has an interpreter, a `prompt` has a model preference, a `component` has a language and exports. Forcing every kind through one flat schema would either bloat every manifest with irrelevant fields or make almost everything optional, which destroys validation value.

Three questions needed answering: what serialization format, how to model the per-kind differences, and how to validate.

## Decision

### YAML, in a file named `skillbox.yaml`

Manifests are YAML.

### Kubernetes-style envelope with a discriminated spec

```yaml
apiVersion: skillbox.dev/v1alpha1
kind: prompt
metadata: { namespace, name, version, description, tags, ... }
spec: { entrypoint, files, install, ... plus kind-specific fields }
```

`kind` is the discriminant. `metadata` is identical for every kind; `spec` contains shared fields plus only the fields meaningful to that kind (FR-1.12).

`apiVersion` is `skillbox.dev/v1alpha1` — a format identifier, not a URL Skillbox contacts. `v1alpha1` signals the format may change before v1. An unsupported value is rejected with a dedicated error (FR-1.3).

### Zod as the single source of truth

Zod 4 schemas define validation, and TypeScript types are inferred from them with `z.infer`. Types are never hand-written alongside a schema.

JSON Schema is generated from the same Zod schemas using Zod 4's native `z.toJSONSchema()`, committed to `schemas/`, and drift-tested.

### Unknown keys are rejected

Every object in the manifest is strict. An unrecognized key is an error, not ignored.

### Paths are constrained at the schema layer

Every path field must be relative, POSIX-style, free of `..`, free of drive and UNC prefixes, and free of NUL bytes. These are schema constraints, so a malicious path is rejected as data before any code touches the filesystem.

## Alternatives considered

**JSON manifests.** No parser dependency and no ambiguity. Rejected: no comments, and comments matter for a hand-authored file that documents permissions and environment variables. JSON's noise for multi-line descriptions and nested lists also hurts a format humans write by hand.

**TOML.** Good for flat configuration. Rejected: deeply nested arrays of tables — which `inputs`, `dependencies`, and `steps` all need — become hard to read, and TOML is less familiar to the target audience than YAML.

**A TypeScript or JavaScript manifest file.** Maximum expressiveness and type checking for free. Rejected on security grounds: loading a manifest would mean executing untrusted code, which contradicts the entire premise of [ADR-0005](ADR-0005-security-model.md). This was the most tempting option and the most clearly wrong one.

**One flat schema for all kinds.** Simpler to implement. Rejected: it forces `interpreter` onto prompts and `model` onto components, and the resulting all-optional schema cannot catch a `script` that forgot its interpreter.

**Separate top-level schema per kind with no shared envelope.** Rejected: `namespace`, `name`, `version`, and `description` would be redeclared seven times, and search and catalog code would need a per-kind branch just to read a name.

**JSON Schema as the source of truth, with types generated from it.** Rejected: it inverts the ergonomics. Authoring validation in JSON Schema is verbose, composition is awkward, and the generated TypeScript is worse than Zod's inference. Generating JSON Schema _from_ Zod gets both artifacts from the better authoring experience.

**`zod-to-json-schema` package.** Unnecessary. Zod 4 ships `z.toJSONSchema()` natively (verified against the [Zod JSON Schema documentation](https://zod.dev/json-schema)), so this would have been a dependency for functionality already present (NFR-7).

**Ajv with hand-written JSON Schema.** Rejected: fast, but no type inference, and error messages need substantial work to reach the quality bar in FR-11.6.

**Allowing unknown keys.** Rejected. Silently ignoring `entrypoints:` when the field is `entrypoint:` produces a resource that validates and then behaves wrongly. Strict objects turn typos into immediate, locatable errors.

## Consequences

Positive:

- One familiar format for all seven kinds, with per-kind precision.
- Validation and types cannot drift, because types are inferred from the schemas.
- Editors get completion from generated JSON Schema without a build step.
- Path attacks are rejected as data, at the earliest possible layer.
- Strict objects turn typos into errors instead of silent misbehavior.

Negative:

- YAML has real footguns: the Norway problem (`no` parsing as `false`), significant whitespace, and version strings needing quotes. Mitigated by validating types explicitly rather than trusting the parse, and by quoting version ranges in every example and template.
- A YAML parser dependency (`yaml`) is required. Justified: correct YAML parsing is not something to hand-roll.
- Strict objects mean adding a field is a schema change. That is the intended trade.
- `v1alpha1` sets an expectation of change, which is honest but means early resources may need migration.

## Follow-up work

- Any breaking change to the format after v0.1.0 requires a new `apiVersion` and a new ADR, not a redefinition of `v1alpha1`.
- SBX-117: Compatibility scoring may extend `spec.compatibility`.

## References

- [Zod JSON Schema documentation](https://zod.dev/json-schema)
- [Kubernetes API conventions](https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md) — the source of the `apiVersion`/`kind`/`metadata`/`spec` envelope
- [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)
