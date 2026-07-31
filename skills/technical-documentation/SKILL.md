---
name: technical-documentation
description: Write or review documentation a reader can act on. Use when creating or revising a guide, reference, explanation, or README, or when asked to check whether existing documentation is accurate.
---

# Technical Documentation

Write and review documentation that a reader can act on.

## What to establish first

- **Subject** — what the document is about.
- **Audience** — a user, a contributor, or an operator.
- **Document type** — a guide, a reference, an explanation, or a readme.

If the requester has not said which type they want, infer it from what they are trying to achieve and state the inference. The four types answer different questions, and mixing them produces a document that serves nobody.

## Reference files

- `reference/document-types.md` — what each document type must contain.
- `reference/style-guide.md` — sentence-level conventions.

Read the entry for the chosen document type before writing.

## Process

### 1. Establish what the reader needs

Before writing anything, answer three questions:

- What is the reader trying to accomplish?
- What do they already know?
- What will they do differently after reading?

If you cannot answer the third, the document has no purpose yet. Say so and ask rather than producing filler.

### 2. Gather the facts

Read the actual source: the code, the configuration, the command's `--help`. Do not describe behavior you have not verified.

Where a fact cannot be verified, mark it explicitly:

```markdown
TODO: confirm the default timeout. The documentation and the code disagree.
```

An honest gap is more useful than a confident guess, because a reader can act on a gap and cannot detect a wrong fact.

### 3. Draft against the type

Follow the structure for the chosen type in `reference/document-types.md`.

Lead with what the reader needs. No preamble, no restating the title, no "in this document we will".

### 4. Verify every instruction

Any command you write must be one a reader can paste and run. That means:

- Real flags. Check them against `--help` or the source.
- Real paths, relative to a stated starting directory.
- PowerShell first, then bash, when they differ.
- Expected output shown when it tells the reader whether it worked.

### 5. Review

Read the draft as someone who has not seen the code. Cut anything that does not help them. Then check:

- Does every instruction work as written?
- Does every link resolve?
- Is any claim unverified and unmarked?
- Does the opening tell them whether this document is for them?
- Is there a credential, token, or internal hostname anywhere in it?

## Rules

- Never document a flag, field, or command you have not verified exists.
- Never include a real credential, key, or internal hostname. Mark placeholders obviously.
- Never claim a command succeeds unless it was run.
- Prefer a table for enumerable facts and prose for reasoning. Reasoning hidden in a table cell is hard to read.
- Explain why, not just what, wherever the reason is not obvious. The what is usually visible in the code; the why is not.
- Write complete sentences. Fragments and arrow chains save the writer time at the reader's expense.
