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

**Claude Code** loads skills from four scopes:

| Path                        | Scope                        |
| --------------------------- | ---------------------------- |
| `.claude/skills/`           | Project, shared via git      |
| `~/.claude/skills/`         | Personal, all projects       |
| `<plugin>/skills/`          | Wherever the plugin is on    |
| Managed settings            | Enterprise-wide              |

Claude Code also reads nested `.claude/skills/` directories below the working directory, and project skills load from every parent directory up to the repository root.

**Frontmatter.** `name` and `description` are required.

**The folder name must match `name`.** This is not a Cursor quirk — Cursor and Anthropic both document it independently, so treat it as a universal rule. Use lowercase letters, numbers, and hyphens. A mismatch breaks discovery *silently*, which is the single most common reason a hand-authored skill never appears.

Optional fields worth knowing:

- `disable-model-invocation: true` makes a skill explicit-invoke-only, so it runs when a user types `/name` and never on the agent's own judgement. Cursor and Anthropic document this identically.
- `paths` scopes a skill to files matching a glob (Cursor; the older `globs` still works but is deprecated).

One field to avoid: the flag for hiding a skill from the `/` menu is spelled `user-invocable` in Anthropic's documentation and `user-invokable` in VS Code's. No asset here uses it, and until that resolves it is not worth depending on.

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

## Open questions

Everything above is drawn from vendor documentation or direct observation. These three are not settled, and are listed here rather than stated as fact anywhere else in this repository.

They are deliberately few. A long list of hedges reads as an excuse; a short list of specific, testable questions is a to-do list. Anything that turned out not to affect how this repository is used was resolved or dropped rather than left hanging.

They are tracked as issues, so results land in one place: [#2 covers the Cursor side](https://github.com/ZacheryKuykendall/skillbox/issues/2) and [#3 the Copilot side](https://github.com/ZacheryKuykendall/skillbox/issues/3).

| # | Question | Why it matters | How to settle it |
| --- | --- | --- | --- |
| 1 | Does one `.agent.md` load cleanly as **both** a Copilot custom agent and a Cursor subagent? | Design-critical. If not, every agent needs two files and the flat layout stops working. | Copy `agents/debugger.agent.md` into `.cursor/agents/`, reload, and type `/debugger`. Then do the same into `.github/agents/` in a Copilot workspace. |
| 2 | Does the `"commands": "prompts"` path override in the plugin manifest actually work? | If not, a Cursor plugin install silently delivers skills and agents but no prompts. | Install as a local plugin, reload, and check whether `/fix-until-green` appears. |
| 3 | Must a Cursor setting be enabled before third-party skills appear in the `/` menu? | Reported by users, absent from documentation. If real and defaulting to off, every install instruction here is incomplete. | Install on a profile that has never had third-party skills and see whether they appear without touching settings. |

One local plugin install and a window reload settles questions 2 and 3 outright, plus the Cursor half of question 1. The Copilot half needs `agents/debugger.agent.md` dropped into `.github/agents/` in any VS Code workspace, which is a separate half-minute.

Install Skillbox into Cursor as a local plugin — the repository is already a valid plugin, so this is just placing it where Cursor looks:

```powershell
Copy-Item -Recurse <path-to-clone> "$HOME\.cursor\plugins\local\skillbox"
```

```bash
ln -s <path-to-clone> ~/.cursor/plugins/local/skillbox
```

Reload the window, type `/`, and read the result:

| You see | It tells you |
| --- | --- |
| `/commit-message`, `/technical-documentation` | Skills load with no settings change — question 3 answered no |
| `/fix-until-green`, `/code-review`, `/plan-implement-review` | The `commands` path override works — question 2 answered yes |
| `/debugger`, `/implementation-planner` | A Copilot `.agent.md` is readable as a Cursor subagent — the Cursor half of question 1 |
| Nothing at all | Either the plugin was not picked up, or question 3 is answered yes and a setting gates it |

If you run this, a pull request correcting this table is the single most useful contribution you can make.

### Resolved

Kept briefly so the same questions are not reopened.

- **Windows path for user-level Cursor paths.** Confirmed by observation: `%USERPROFILE%\.cursor\agents\` and `%USERPROFILE%\.cursor\plugins\local\` both exist on a real Windows install, so `~/.cursor/` expands as expected.
- **Claude Code's `.claude/skills/` path.** Confirmed in Anthropic's own documentation, along with the personal, plugin, and enterprise scopes above.
- **Whether the folder name must match `name`.** Confirmed independently by both Cursor and Anthropic. It is a universal rule, not a Cursor quirk.
- **Plugin manifest schema.** Validated against two working plugins installed locally. Both rely on auto-discovery of `skills/` rather than declaring paths, which is what makes question 2 worth asking.

### Dropped

- **Cursor's Remote Rule (GitHub) import.** Cursor's pages disagree on whether it handles `SKILL.md`, but this repository does not document that install route and has no plans to, so the ambiguity costs nothing.
- **`~/.cursor/commands/` for user-level commands.** Forum-sourced only, and not an install route documented here. The plugin install covers the same need.

## Sources

- [Custom agents in VS Code](https://code.visualstudio.com/docs/agent-customization/custom-agents)
- [GitHub Copilot custom agents configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
- [VS Code Copilot Chat changelog](https://github.com/microsoft/vscode-copilot-chat/blob/main/CHANGELOG.md)
- [Cursor: Agent Skills](https://cursor.com/docs/skills)
- [Cursor: Subagents](https://cursor.com/docs/subagents)
- [Cursor: Plugins reference](https://cursor.com/docs/reference/plugins)
- [Cursor 1.6 changelog](https://cursor.com/changelog/1-6)
