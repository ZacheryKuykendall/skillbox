# skillbox/technical-documentation

A skill for writing and reviewing technical documentation that readers can act on.

## What it does

Bundles a process with two reference files. The process establishes who the reader is and what they will do differently, gathers verified facts from the source rather than guessing, drafts against a structure chosen for the document type, and reviews the result as someone who has not seen the code.

The reference files carry the detail: `document-types.md` defines what a guide, reference, explanation, or README must contain, and `style-guide.md` covers sentence-level conventions.

The split matters. Documentation advice usually fails by being generic; separating "what this type of document needs" from "how to write a sentence" lets each be specific.

## Inputs

| Name            | Type                                                | Required            | Description                |
| --------------- | --------------------------------------------------- | ------------------- | -------------------------- |
| `subject`       | string                                              | yes                 | What the document is about |
| `audience`      | enum: `user`, `contributor`, `operator`             | no, default `user`  | Who it is written for      |
| `document-type` | enum: `guide`, `reference`, `explanation`, `readme` | no, default `guide` | Which kind to produce      |

## Outputs

| Name       | Type   | Description                    |
| ---------- | ------ | ------------------------------ |
| `document` | string | The finished Markdown document |

## Installation

```powershell
skillbox add skillbox/technical-documentation
```

```bash
skillbox add skillbox/technical-documentation
```

Installs to `.skillbox/skills/technical-documentation/`:

```text
.skillbox/skills/technical-documentation/
├── SKILL.md
├── README.md
└── reference/
    ├── style-guide.md
    └── document-types.md
```

`SKILL.md` is the entrypoint. The `reference/` files are read as needed rather than up front, which keeps the working instruction set small.

## Required permissions

| Permission        | Why                                                                                |
| ----------------- | ---------------------------------------------------------------------------------- |
| `filesystem:read` | The process requires reading actual source to verify facts before documenting them |
| `model:invoke`    | Drafting and review are performed by a language model                              |

It writes nothing and makes no network requests. Permissions are declared by the author and are not enforced by Skillbox in v0.1.0 — see the security model (docs/architecture/security-model.md in the Skillbox repository).

## Configuration

None. Adjust behavior through the inputs.

To adapt the conventions to your own house style, edit `reference/style-guide.md` after installing. Skillbox records a digest of every installed file, so your edits are detected: `skillbox doctor` reports the file as modified, and `skillbox remove` refuses to delete it without `--force`.

## Usage

In an AI-assisted editor, point at the skill and state the three inputs:

```text
Follow .skillbox/skills/technical-documentation/SKILL.md.

subject: the retry behavior of our HTTP client
audience: contributor
document-type: explanation
```

For a README:

```text
Follow .skillbox/skills/technical-documentation/SKILL.md to write a README for
this package. audience: user, document-type: readme.
```

### Worked example

Asked for a `reference` document about a `--timeout` flag, it produces the reference structure — purpose, syntax, a parameter table with types and defaults, errors, and two examples — rather than the narrative a guide would use:

```markdown
# --timeout

Sets the maximum time to wait for a response before failing.

## Syntax

    command --timeout <milliseconds>

## Parameters

| Name           | Type    | Required | Default | Description                           |
| -------------- | ------- | -------- | ------- | ------------------------------------- |
| `milliseconds` | integer | yes      | 30000   | Whole milliseconds. Must be positive. |

## Errors

| Condition              | Message                                     |
| ---------------------- | ------------------------------------------- |
| Not a positive integer | `--timeout must be a positive whole number` |
```

If it cannot verify the default, it emits a marked TODO rather than inventing one.

## Notes

The process depends on reading real source. Asked to document something it cannot see, the skill is instructed to say so and ask, rather than produce plausible-looking prose. That is the intended behavior: a wrong fact stated confidently is worse than an acknowledged gap, because a reader can act on a gap and cannot detect a wrong fact.
