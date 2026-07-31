# Authoring

How to write a Skillbox asset. The format contract per type is below; the quality bar is at the end and matters more.

## Choosing a type

| Write a | When |
| --- | --- |
| **Skill** | Reusable knowledge the agent should reach for on its own, when relevant. The default choice — it is the only type that works in every tool. |
| **Loop prompt** | A task you run deliberately, that repeats a check until a condition is met. |
| **Agent mode** | A persona you want to stay in across a whole conversation, with its own instructions and tool access. |

If two of these fit, write the skill. Portability beats precision here.

## Skills

A folder in `skills/` containing `SKILL.md`. Optional `reference/` files hold detail the agent should read only when it needs it.

```
skills/
└── your-skill-name/
    ├── SKILL.md
    └── reference/
        └── deeper-detail.md
```

```markdown
---
name: your-skill-name
description: What it does, and when to use it.
---

# Your Skill Name

...
```

**`name` must exactly match the folder name.** Lowercase letters, numbers, and hyphens only. A mismatch means Cursor never loads the skill and never tells you why — this is the single most common authoring mistake.

**`description` is doing more work than it looks.** It is what the agent sees at session start, before the body is loaded, and it decides on that basis whether the skill is relevant. Write it for that job: say what the skill does *and* when to use it. "Formats things nicely" will never match anything. "Write or review documentation a reader can act on. Use when creating or revising a guide, reference, explanation, or README" will.

Optional frontmatter: `paths` scopes a skill to files matching a glob, and `disable-model-invocation: true` makes it explicit-invoke-only so it runs when a user types `/name` and never on the agent's own judgement.

Keep the body focused. Push detail into `reference/` and mention those files by relative path so the agent can find them, because that content loads on demand rather than up front.

## Loop prompts

A single file in `prompts/`, named `<name>.prompt.md`.

```markdown
---
name: your-prompt-name
description: What running this achieves.
mode: agent
---

# Your Prompt Name

...
```

Set `name` explicitly. Without it, Cursor derives the name from the whole filename and you get `your-prompt-name.prompt`.

Omit `model`. See [compatibility.md](compatibility.md#why-skillbox-agent-files-omit-model) — no single value is valid in both Copilot and Cursor, and the person installing the asset is better placed to choose than you are.

**A loop prompt must state its loop.** Four things, near the top where they cannot be missed:

- **Goal** — what "done" means, phrased so it can be checked rather than felt.
- **Check each pass** — the concrete command or observation that runs every iteration.
- **Stop when** — the success condition.
- **Give up after** — a bound. A count of passes, a wall-clock limit, or a no-new-information condition.

The bound is not optional and it is not a formality. A loop without an exit spends budget indefinitely, and worse, an agent that cannot satisfy the check honestly will eventually satisfy it dishonestly — weakening the test, widening the tolerance, silencing the error. State the bound, and state what to report when it is hit. [prompts/fix-until-green.prompt.md](../prompts/fix-until-green.prompt.md) is the reference implementation.

Include the rules that keep the loop honest. For anything test-driven, that means an explicit prohibition on editing the test to make it pass.

## Agent modes

A single file in `agents/`, named `<name>.agent.md`.

```markdown
---
name: your-agent-name
description: What this agent is for.
tools: ['codebase', 'search']
readonly: true
---

# Your Agent Name

...
```

`description` is required — it shows as placeholder text in the chat input, so write it as a prompt for the user rather than a label.

Set `name` explicitly, and omit `model`, for the same reasons as loop prompts.

**Use the frontmatter to enforce the constraint, not just describe it.** If an agent is supposed to analyse and not edit, `readonly: true` (Cursor) and a `tools` list without editing (Copilot) make that structural. An instruction saying "do not edit files" is a request; withholding the tool is a guarantee. [agents/implementation-planner.agent.md](../agents/implementation-planner.agent.md) does this.

Open with a **Role** section that says what the agent is for and, more usefully, what failure mode it exists to prevent. That framing does more to shape behaviour than a list of capabilities.

## The quality bar

This applies to all three types, and it is the part that decides whether an asset is worth installing.

**Write for the agent, not the user.** The reader is a model deciding what to do next. Second person, imperative, concrete.

**Say why, not only what.** An instruction with a reason survives situations its author did not anticipate; a bare rule gets misapplied at the first edge case. "Run the full suite, not just the changed test, because a fix that breaks two others is not a fix" holds up where "run the full suite" does not.

**Include the negative cases.** What *not* to do, and what to do when the obvious approach fails. Most of the value in a mature asset is in its guardrails.

**Never invent a flag, path, or API.** If you have not verified it, say so in the asset, or leave it out. A confidently wrong instruction is worse than a missing one, because the agent cannot detect it and the user will not check.

**Verify commands before shipping them.** Real flags, real paths, relative to a stated starting directory. PowerShell first, then bash, where they differ.

**No secrets, tokens, or internal hostnames.** Mark placeholders obviously.

**Test it in at least one host before opening a pull request.** Confirm it appears under `/`, then confirm it actually does the thing. Say in the pull request which tool you tested in, since coverage across hosts is exactly what this repository lacks.
