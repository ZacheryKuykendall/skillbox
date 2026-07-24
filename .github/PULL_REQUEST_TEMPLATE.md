## Summary

<!-- What changed and why. One or two sentences. Lead with the outcome. -->

## Task

<!-- The SBX-### task from docs/TASKS.md this completes or advances. -->

Implements SBX-___

## Type of change

- [ ] Feature
- [ ] Bug fix
- [ ] Documentation
- [ ] New catalog resource
- [ ] Refactor (no behavior change)
- [ ] Test or tooling
- [ ] Breaking change

## Validation

Paste actual output or state that you ran these. Do not check a box for a command you did not run.

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm test:coverage` — coverage at or above 90%
- [ ] `pnpm build`
- [ ] `pnpm format:check`
- [ ] `pnpm validate:registry` (if catalog resources changed)

<details>
<summary>Output</summary>

```text

```

</details>

## Tests added

<!-- What behavior is now covered. New behavior needs at least one happy path and one edge case. -->

- [ ] Happy path
- [ ] Edge case
- [ ] Security vector (if this touches paths, secrets, or filesystem mutation)
- [ ] Not applicable, because:

## Documentation

- [ ] Affected documentation updated in this PR
- [ ] `docs/architecture/resource-model.md` updated (if a manifest field changed)
- [ ] JSON Schema regenerated with `pnpm schema:generate` (if schemas changed)
- [ ] ADR added or updated (if an architectural decision was made)
- [ ] `docs/TASKS.md` updated with completion evidence
- [ ] `CHANGELOG.md` updated under Unreleased
- [ ] No documentation change needed, because:

## Security

- [ ] No secrets, credentials, tokens, or private keys added anywhere
- [ ] No new path handling, or new path handling uses `path.relative` containment (never `startsWith`)
- [ ] Nothing added that executes resource code
- [ ] No environment variable **values** are read, stored, or printed
- [ ] Declared permissions, if any, are minimal and accurate

## Definition of done

- [ ] Implementation matches documented requirements
- [ ] New behavior has automated tests
- [ ] Existing tests still pass
- [ ] Lint, typecheck, and build pass
- [ ] Coverage meets the gate
- [ ] Task ledger updated
- [ ] Relevant ADRs are current
- [ ] No untracked TODOs introduced (every `TODO` cites an `SBX-###`)
- [ ] No known failure is hidden

## Risks and rollback

<!-- What could break, and how to undo this if it does. -->

## Notes for reviewers

<!-- Anything worth flagging: a decision you were unsure about, a deliberate trade-off, an area needing close attention. -->
