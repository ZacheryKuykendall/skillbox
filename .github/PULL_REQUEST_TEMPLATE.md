## What this changes

<!-- One or two sentences. If you are adding an asset, say what problem it solves. -->

## Type

<!-- Delete the ones that do not apply. -->

- New skill
- New loop prompt
- New agent mode
- Improvement to an existing asset
- Compatibility finding or correction
- Documentation

## Where it was tested

<!-- This is the part reviewers cannot check for themselves, so please be specific.
     Which tool, and did the asset both appear and actually work? -->

- [ ] GitHub Copilot / VS Code
- [ ] Cursor
- [ ] Claude Code
- [ ] Not tested — explain why below

**What happened:**

## Checklist

- [ ] Frontmatter matches the contract in [docs/authoring.md](../docs/authoring.md)
- [ ] For a skill: `name` exactly matches the folder name
- [ ] `name` is set explicitly, and `model` is omitted
- [ ] For a loop prompt: it states a goal, a per-pass check, a stop condition, and a give-up bound
- [ ] Every command was actually run, with real flags and real paths
- [ ] No invented flags, paths, or APIs; anything unverified is marked as such
- [ ] No secrets, tokens, or internal hostnames
- [ ] Added to the catalogue table in [README.md](../README.md#browse-the-catalogue)

## Licensing

- [ ] I wrote this content, or its original license permits redistribution under MIT

<!-- If it is not your own work, say where it came from and under what license. -->
