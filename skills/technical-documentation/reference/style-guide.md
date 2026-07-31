# Style Guide

Sentence-level conventions. The goal throughout is that a reader gets what they need on the first pass.

## Voice

Address the reader as "you". Write in the present tense and the active voice.

| Instead of                             | Write                     |
| -------------------------------------- | ------------------------- |
| The file should be created by the user | Create the file           |
| It is recommended that you run tests   | Run the tests             |
| The command will be executed           | The command runs          |
| Errors are handled by the caller       | The caller handles errors |

## Being clear beats being brief

Readable and concise are different things, and readable matters more. If a reader has to reread a sentence, any words saved are gone.

Keep documents short by cutting whole sections that do not help, not by compressing sentences into fragments.

| Instead of                | Write                                 |
| ------------------------- | ------------------------------------- |
| Config → validate → apply | The config is validated, then applied |
| Auth req'd for POST/PUT   | POST and PUT require authentication   |
| See sec. 3 for deets      | See [Configuration](#configuration)   |

Spell out technical terms. Write "environment variable", not "env var", in prose. Abbreviations in a table cell are fine where the column header supplies the meaning.

## Openings

Lead with what the reader needs. Cut every preamble.

Delete these on sight:

- "In this document, we will explore..."
- "As you may know..."
- "It is important to note that..."
- "Simply" and "just". If it were simple, the reader would not be reading.

Bad:

> In this guide, we will walk through the process of setting up authentication.

Good:

> Set up authentication in about ten minutes. You will need an API token and Node 20 or newer.

## Tables and prose

Tables for enumerable facts: parameters, flags, exit codes, permissions.

Prose for reasoning. A trade-off explained inside a table cell is hard to read, and reasoning is usually the part the reader most needs.

## Code

Always specify the language:

````markdown
```powershell
$env:LOG_LEVEL = 'debug'; .\build.ps1
```

```bash
LOG_LEVEL=debug ./build.sh
```
````

PowerShell first, then bash. Note real differences: `;` versus `&&`, `$env:NAME` versus `export NAME=`, path separators.

Show expected output where it tells the reader whether it worked:

```text
Build succeeded in 4.2s
  3 targets, 0 warnings
```

Use backticks for files, directories, commands, functions, and field names.

## Formatting

- Sentence case for headings: "Getting started", not "Getting Started".
- One `#` per document.
- Do not skip heading levels.
- Relative links between documents in the same repository. Verify they resolve.
- Meaningful link text. Never "click here" or a bare URL in prose.
- No emoji.

## Warnings

State the consequence, not just the severity.

Bad:

> Warning: be careful with this command.

Good:

> This deletes the directory and everything in it. There is no undo.

## Secrets

Never include a real credential, token, key, connection string, or internal hostname — not even an expired one, and not even one that looks fake. Someone will copy it.

Reference an environment variable by name and let the reader supply the value. Where a placeholder is unavoidable, write it in angle brackets so it cannot be mistaken for a value, as in `<your-token>`, and never in a form a reader could paste and accidentally run.

## Accuracy

- Do not document a flag, field, or command without verifying it exists.
- Do not claim a command succeeds unless it was run.
- Mark an unverified fact as a TODO rather than guessing. A reader can act on a gap; they cannot detect a wrong fact.
- When citing an external API, link the official documentation.
