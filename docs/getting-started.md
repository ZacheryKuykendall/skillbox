# Getting Started

Four ways to get Skillbox assets into your tooling. Nothing here installs a package, runs a script, or needs a CLI — every asset is a Markdown file, and getting it working means putting it somewhere your editor already looks.

Pick a route by how much you want:

| You want | Use |
| --- | --- |
| Everything, kept up to date with `git pull` | [Clone once and point your editor at it](#clone-once-and-point-your-editor-at-it) |
| Everything in Cursor, in one step | [Install as a local Cursor plugin](#install-as-a-local-cursor-plugin) |
| One or two assets, committed to a project | [Copy into your project](#copy-into-your-project) |
| Exactly one file, right now | [Download a single file](#download-a-single-file) |

If you are unsure which asset type you need, [compatibility.md](compatibility.md) says what works where. The short version: skills work everywhere, loop prompts and agent modes are host-specific.

## Clone once and point your editor at it

The best route for Copilot, because `git pull` becomes your update mechanism and no file is ever copied twice.

Clone anywhere you keep tools:

```powershell
git clone https://github.com/ZacheryKuykendall/skillbox.git $HOME\tools\skillbox
```

```bash
git clone https://github.com/ZacheryKuykendall/skillbox.git ~/tools/skillbox
```

Then add the paths to your VS Code user settings. Open the Command Palette, run **Preferences: Open User Settings (JSON)**, and merge in the following, replacing the paths with your clone location:

```json
{
  "chat.promptFilesLocations": {
    "C:\\Users\\you\\tools\\skillbox\\prompts": true
  },
  "chat.agentFilesLocations": {
    "C:\\Users\\you\\tools\\skillbox\\agents": true
  }
}
```

On macOS or Linux use forward slashes and no escaping:

```json
{
  "chat.promptFilesLocations": { "/home/you/tools/skillbox/prompts": true },
  "chat.agentFilesLocations": { "/home/you/tools/skillbox/agents": true }
}
```

Reload the window. Prompts appear when you type `/` in chat; agent modes appear in the mode picker.

Skills need a copy rather than a setting, since discovery is directory-based — see [Copy into your project](#copy-into-your-project).

## Install as a local Cursor plugin

The one-step route for Cursor. [.cursor-plugin/plugin.json](../.cursor-plugin/plugin.json) makes the repository a plugin, so a single install delivers the whole catalogue.

Cursor discovers `skills/` and `agents/` automatically. The manifest additionally maps `prompts/` onto Cursor's commands — that mapping is documented but not yet confirmed by testing, so if prompts do not appear after installing, copy them to `.cursor/commands/` by hand and please report it against [open question 2](compatibility.md#open-questions).

Clone the repository, then place it in Cursor's local plugin directory:

```powershell
git clone https://github.com/ZacheryKuykendall/skillbox.git $HOME\tools\skillbox
New-Item -ItemType Directory -Force -Path "$HOME\.cursor\plugins\local" | Out-Null
Copy-Item -Recurse "$HOME\tools\skillbox" "$HOME\.cursor\plugins\local\skillbox"
```

```bash
git clone https://github.com/ZacheryKuykendall/skillbox.git ~/tools/skillbox
mkdir -p ~/.cursor/plugins/local
ln -s ~/tools/skillbox ~/.cursor/plugins/local/skillbox
```

A symlink is preferable where your platform allows it, because `git pull` in the clone then updates the installed plugin. The PowerShell copy above is the safe default on Windows, where symlinks need Developer Mode or an elevated shell. To symlink instead, run in an elevated PowerShell:

```powershell
New-Item -ItemType SymbolicLink -Path "$HOME\.cursor\plugins\local\skillbox" -Target "$HOME\tools\skillbox"
```

Then restart Cursor, or run **Developer: Reload Window**. Skills and prompts appear under `/`; agents are invoked as `/agent-name` or delegated to by the main agent.

Note that Cursor has no mode picker entry for file-based agents — see [compatibility.md](compatibility.md#agent-modes) for why, and what a subagent does instead.

## Copy into your project

The right route when you want an asset committed alongside the code it serves, so everyone on the project gets it.

**A skill** is a folder. Copy the whole thing, keeping the folder name — the `name` in its frontmatter must match the folder, or discovery fails silently.

```powershell
Copy-Item -Recurse .\skills\commit-message .\.github\skills\commit-message
```

```bash
cp -r skills/commit-message .github/skills/commit-message
```

Use `.github/skills/` for Copilot, `.cursor/skills/` for Cursor, or `.claude/skills/` for Claude Code. Cursor reads all three, so `.claude/skills/` is the most economical choice for a mixed-tool team.

**A loop prompt** is one file:

```powershell
Copy-Item .\prompts\fix-until-green.prompt.md .\.github\prompts\
```

```bash
cp prompts/fix-until-green.prompt.md .github/prompts/
```

**An agent mode** is one file, into `.github/agents/` for Copilot or `.cursor/agents/` for Cursor:

```powershell
Copy-Item .\agents\debugger.agent.md .\.github\agents\
```

```bash
cp agents/debugger.agent.md .github/agents/
```

## Download a single file

For one asset without cloning. On GitHub, open the file, click the **Download raw file** button, and save it into the appropriate directory from the sections above.

For a skill, remember it is a folder: you need `SKILL.md` and anything in its `reference/` directory, with the folder name preserved.

## Verifying it worked

Type `/` in your chat input. Skills and prompts appear by name — `/commit-message`, `/fix-until-green`. Agent modes appear in Copilot's mode picker, and as `/debugger` in Cursor.

If an asset does not appear, check these in order:

1. **Skill `name` does not match its folder.** The most common cause, and it fails silently rather than erroring.
2. **The editor was not reloaded.** New locations are read at startup.
3. **The path in settings does not exist or is misspelled.** On Windows, backslashes in JSON must be escaped as `\\`.
4. **The file extension is wrong.** Prompts must end `.prompt.md` and agents `.agent.md`. A file named `debugger.md` in an agents directory will not be treated as an agent by Copilot.

There is one reported-but-undocumented Cursor setting that may gate third-party skills from appearing under `/`. It is listed in [compatibility.md](compatibility.md#open-questions) among the things this repository does not claim to have settled.
