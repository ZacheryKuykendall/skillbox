# Compatibility

Which Skillbox asset types work in which tool, where the files go, and what has not been verified.

This document exists because the three asset types are not equally portable. Skills work everywhere. Loop prompts and agent modes are host-specific, and one of them has no equivalent in Cursor at all.

## At a glance

| Asset type      | GitHub Copilot                  | Cursor                                     | Claude Code                |
| --------------- | ------------------------------- | ------------------------------------------ | -------------------------- |
| **Skills**      | Yes — `.github/skills/`         | Yes — `.cursor/skills/`                    | Yes — `.claude/skills/`    |
| **Loop prompts**| Yes — `.github/prompts/`        | As a command — `.cursor/commands/`         | No direct equivalent       |
| **Agent modes** | Yes — `.github/agents/`         | As a subagent — `.cursor/agents/`          | No direct equivalent       |

## Skills

The most portable type by a wide margin, and the only one that works unchanged in all three tools. When in doubt, author a skill.

A skill is a folder containing a file named exactly `SKILL.md`.

**GitHub Copilot** auto-detects skills from `.github/skills/` and also reads `.claude/skills/`. Skills load on demand rather than at session start, and are invokable as `/name`. Skill locations are configurable.

**Cursor** auto-loads four locations, and additionally reads the Claude and Codex equivalents for cross-tool compatibility:

| Path                | Scope                   |
| ------------------- | ----------------------- |
| `.cursor/skills/`   | Project, repo-committed |
| `.agents/skills/`   | Project, repo-committed |
| `~/.cursor/skills/` | User, all projects      |
| `~/.agents/skills/` | User, all projects      |

Cursor walks the skills root recursively, so grouping skills into subfolders is safe. Identity comes from the folder directly containing `SKILL.md`, not from the path above it.

**Frontmatter.** `name` and `description` are required. Cursor requires `name` to exactly match the containing folder name, using lowercase letters, numbers, and hyphens only — a mismatch breaks discovery silently, which is the single most common way a hand-authored skill fails to appear. Optional fields: `paths` to scope a skill to matching files (Cursor; the older `globs` is still accepted but deprecated), and `disable-model-invocation: true` to make a skill explicit-invoke-only.

## Loop prompts

A single file, `<name>.prompt.md`, invoked as `/name`.

**GitHub Copilot** reads these natively. Prompt files describe a complete standalone chat request including the prompt text, the mode, and the tools. They live in the workspace or your user data folder; the `chat.promptFilesLocations` setting controls where Copilot looks, and it accepts glob patterns.

**Cursor** has no prompt-file concept. The closest equivalent is a command. Installing Skillbox as a plugin maps `prompts/` onto commands for you via [.cursor-plugin/plugin.json](../.cursor-plugin/plugin.json). Copying files by hand means putting them in `.cursor/commands/`.

Two caveats worth knowing before relying on the Cursor route:

- Cursor's dedicated commands reference page has been withdrawn. The `.cursor/commands/<name>.md` path is documented only in the Cursor 1.6 changelog and the official agent best-practices blog post, not in current reference documentation.
- Cursor is actively migrating commands into skills, and ships a built-in `/migrate-to-skills` skill that converts a command into a skill with `disable-model-invocation: true` — which preserves explicit `/name` invocation. If you want the most durable form for Cursor specifically, convert the prompt into a skill.

**Claude Code** has no prompt-file equivalent. Convert to a skill with `disable-model-invocation: true`.

## Agent modes

A single file, `<name>.agent.md`. This is where the two hosts genuinely diverge.

**GitHub Copilot** loads these from `.github/agents/` and shows them in the mode picker, so you select one and your session runs in it. The `chat.agentFilesLocations` setting controls the directories.

Frontmatter: `description` is required; `name`, `argument-hint`, `tools`, `model`, `target`, `agents`, and `handoffs` are optional.

> **Migration note.** These were called *custom chat modes* and lived in `.github/chatmodes/*.chatmode.md`. The terminology and the file extension both changed. Existing `.chatmode.md` files need renaming to `.agent.md` and placing in the agents location; the functionality is otherwise the same.

**Cursor cannot do this.** There is no custom-modes page in Cursor's documentation, the previous URLs return 404, and the list of extension components covers plugins, rules, skills, subagents, hooks, and commands with modes absent. No repository can deliver a Cursor mode, and nothing that appears in Cursor's mode picker is file-based.

The shareable substitute is a **subagent**, in `.cursor/agents/` for a project or `~/.cursor/agents/` for every project. Cursor also reads `.claude/agents/` and `.codex/agents/`; project files win name conflicts, and `.cursor/` takes precedence over the others. Cursor's documentation explicitly recommends committing `.cursor/agents/` to version control.

Subagent frontmatter: `name` (defaults to the filename), `description`, `model` (defaults to `inherit`), `readonly` (defaults to `false`), and `is_background` (defaults to `false`).

The behavioural difference matters more than the file difference. A Copilot custom agent is a mode you *switch into*. A Cursor subagent is one you *delegate to* — invoked as `/name`, or handed work by the main agent. The ingredients are the same; the interaction is not.

### Why Skillbox agent files omit `model`

So that one file works in both hosts. Copilot expects a qualified display name such as `Claude Sonnet 4.5 (copilot)`, while Cursor expects an ID such as `claude-opus-5[effort=high]`. No single value is valid in both.

Omitting it degrades correctly: Copilot falls back to whatever is selected in the model picker, and Cursor defaults to `inherit`. That is also the right default for a shared catalogue, since the person installing an asset is better placed than its author to choose the model.

For the same reason, every agent file sets `name` explicitly. Cursor derives the name from the filename when frontmatter omits it, which would produce `debugger.agent` from `debugger.agent.md`.

## Not verified

Everything above is drawn from vendor documentation. The following is not, and is recorded here rather than stated as fact anywhere else in this repository.

| Item | Status |
| --- | --- |
| Whether one `.agent.md` loads cleanly as both a Copilot custom agent and a Cursor subagent | Untested. The shared keys are `name` and `description`; each host sees the other's extras. Expected to be ignored, not documented as such. |
| Windows path for user-level Cursor skills | Only the `~/` form is documented. `%USERPROFILE%\.cursor\skills\` is inferred from Cursor's CLI configuration table, which documents `$env:USERPROFILE\.cursor\` for a different file. |
| Cursor's Customize to Rules to Remote Rule (GitHub) import | Cursor's own pages disagree: one describes it as scanning for `.mdc` files, another as installing skills. Behaviour for a skills-only repository is unknown, which is why this repository does not document that install route. |
| Whether a Cursor setting must be enabled for third-party skills to appear in the `/` menu | Reported by users; not present in documentation. If it exists and defaults to off, install instructions everywhere are incomplete. |
| `~/.cursor/commands/` for user-level commands | Stated by Cursor staff on the community forum; not in documentation. |
| Claude Code's `.claude/skills/` path | Confirmed indirectly — both VS Code and Cursor document reading it for cross-tool compatibility. Not verified against Anthropic's own documentation in this pass. |

If you test one of these, a pull request correcting this table is the single most useful contribution you can make.

## Sources

- [Custom agents in VS Code](https://code.visualstudio.com/docs/agent-customization/custom-agents)
- [GitHub Copilot custom agents configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
- [VS Code Copilot Chat changelog](https://github.com/microsoft/vscode-copilot-chat/blob/main/CHANGELOG.md)
- [Cursor: Agent Skills](https://cursor.com/docs/skills)
- [Cursor: Subagents](https://cursor.com/docs/subagents)
- [Cursor: Plugins reference](https://cursor.com/docs/reference/plugins)
- [Cursor 1.6 changelog](https://cursor.com/changelog/1-6)
