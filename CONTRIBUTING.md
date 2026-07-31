# Contributing

Thanks for considering it. This repository holds no code, so contributing means adding or improving a Markdown file — there is nothing to build, install, or run.

## What is most useful

In rough order of value:

1. **Testing an existing asset in a tool it has not been tried in**, and reporting what happened. Per-host coverage is what this catalogue most lacks, and [docs/compatibility.md](docs/compatibility.md#not-verified) lists specific unverified claims. Confirming or correcting one of those is worth more than a new asset.
2. **Improving an existing asset.** Adding the edge case it mishandles, the guardrail it is missing, or the reason behind a rule that is currently bare.
3. **A new asset** that solves a real problem you have actually hit.
4. **Fixing documentation** that is wrong, stale, or unclear.

## Before you open a pull request

**Check for an existing asset that covers it.** An improvement to one good asset beats a second asset that overlaps it.

**Pick the right type.** [docs/authoring.md](docs/authoring.md#choosing-a-type) has the decision table. When in doubt, write a skill — it is the only type that works in every tool.

**Read the format contract.** [docs/authoring.md](docs/authoring.md) covers frontmatter and layout per type. The mistakes that come up most:

- A skill's `name` not exactly matching its folder name. This fails silently in Cursor.
- A missing explicit `name`, which leaves Cursor deriving `thing.prompt` from `thing.prompt.md`.
- A `model` in frontmatter. Leave it out — no single value is valid in both Copilot and Cursor.
- A loop prompt with no give-up bound.

**Test it in at least one tool.** Confirm it appears under `/`, then confirm it actually does the thing. Untested assets are how a catalogue becomes a liability.

## Standards

Everything in [docs/authoring.md](docs/authoring.md#the-quality-bar) applies. The three that get pull requests sent back:

**No invented flags, paths, or APIs.** If you have not verified it, leave it out or mark it unverified in the asset. A confidently wrong instruction is worse than a missing one, because the agent cannot detect it and the user will not check.

**Say why, not only what.** A rule with a reason survives situations its author did not anticipate. A bare rule gets misapplied at the first edge case.

**No secrets, tokens, or internal hostnames.** Mark placeholders obviously.

Commands must be pasteable: real flags, real paths, relative to a stated starting directory, PowerShell first then bash where they differ.

## Process

Branch names follow `<type>/<short-description>`, using `feat/`, `fix/`, `docs/`, or `chore/`.

```powershell
git checkout -b feat/add-terraform-review-skill
```

```bash
git checkout -b feat/add-terraform-review-skill
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). If that is unfamiliar, the [commit-message](skills/commit-message/) skill in this repository writes them for you.

Then open a pull request. The template asks which tool you tested in — please fill that in, since it is the part reviewers cannot check for themselves.

One asset per pull request, unless several are genuinely a set.

## Adding your asset to the README

Add a row to the right table in the [Browse the catalogue](README.md#browse-the-catalogue) section. Match the existing style: a link, a category, and a description that says what the asset does rather than what it is.

Reuse a category if one fits. New categories are fine when nothing does, but a category with one member is usually a sign the asset belongs in an existing one.

## Licensing

Contributions are accepted under the [MIT License](LICENSE). By opening a pull request you confirm you wrote the content, or that its original license permits redistribution under MIT, and you say which in the pull request.

Do not paste in someone else's skill without attribution and a compatible license.

## Reporting a problem

Open an issue. The templates cover a broken asset, a compatibility finding, and a new-asset suggestion.

If an asset in this repository looks unsafe — instructions that could exfiltrate data, destroy work, or do something other than what its description claims — please open an issue and say so directly. That is not an overreaction; it is the main risk this repository carries.
