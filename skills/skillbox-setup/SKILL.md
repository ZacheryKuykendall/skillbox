---
name: skillbox-setup
description: Walk someone through Skillbox and install the assets they choose into the right directories for their editor, without overwriting anything they already have. Use when someone wants to set up, install, or learn about Skillbox.
---

# Skillbox Setup

You are onboarding someone to Skillbox. Teach them what it is, find out what they need, and put the files where their editor will find them.

Two things make this go wrong if you rush them. **Never write over something that is already there** — these directories are shared with the user's own work. And **do not install everything by default** — an agent given twenty irrelevant skills matches the wrong one. Ask.

Work through the steps in order. Explain as you go, in your own words, at whatever depth the person seems to want. Someone who says "just set it up" needs two sentences; someone asking what a skill is needs the tutorial.

## Step 1: Get access to the catalogue

You may be reading this file from a URL, with none of the repository on disk. Establish where the asset files are coming from before you promise anyone anything.

Try these in order and say which one you used:

1. **Already on disk.** If the Skillbox repository is the current directory, a sibling, or somewhere the user names, use it. Confirm by finding `skills/`, `prompts/`, and `agents/` alongside a `README.md`.
2. **Clone it.** Most reliable when git is available. Clone to a temporary directory, install from there, and delete it afterwards:

   ```powershell
   git clone --depth 1 https://github.com/ZacheryKuykendall/skillbox.git "$env:TEMP\skillbox-src"
   ```

   ```bash
   git clone --depth 1 https://github.com/ZacheryKuykendall/skillbox.git /tmp/skillbox-src
   ```

   The user did not ask to clone anything, so this is yours to clean up. Say you are doing it and say when it is gone.
3. **Fetch over HTTPS.** When git is unavailable but you can make web requests. List a directory with the contents API and read individual files raw:

   - List: `https://api.github.com/repos/ZacheryKuykendall/skillbox/contents/skills`
   - Read: `https://raw.githubusercontent.com/ZacheryKuykendall/skillbox/main/skills/commit-message/SKILL.md`

   Remember a skill is a folder. Listing `skills/<name>` shows whether it has a `reference/` directory you also need.

If none of the three work, stop and say so plainly rather than reconstructing assets from memory. **Never write an asset from memory.** A file that looks right but is not what the catalogue actually contains is worse than no file, because the user has no way to tell.

## Step 2: Find out where you are

Establish two facts and state them back.

**Which project am I installing into?** Usually the current working directory. If the current directory *is* the Skillbox repository, stop and ask — they almost certainly want a different project, and installing Skillbox into itself is never the intent.

**Which editor do they use?** Look for evidence rather than asking first:

| Found in the project | Suggests |
| --- | --- |
| `.cursor/` | Cursor |
| `.github/` with `copilot-instructions.md`, `prompts/`, or `agents/` inside | GitHub Copilot |
| `.claude/` or `CLAUDE.md` | Claude Code |
| `.vscode/` | VS Code, likely Copilot |
| `AGENTS.md` | Several tools read this; not decisive on its own |

State what you found and confirm it. A bare `.github/` directory means almost nothing on its own, since nearly every repository has one — do not treat it as proof of Copilot. If you find evidence of more than one, ask which they want, or offer both. If you find nothing, ask.

## Step 3: Explain what Skillbox is

Keep this short unless they ask for more. The essentials:

Skillbox is a catalogue of Markdown files that teach a coding agent how to do specific jobs. There is nothing to install and no CLI — setting one up means putting a file where the editor already looks.

There are three types, and the difference is **how the agent reaches for them**:

- **Skills** are knowledge the agent picks up on its own when a task calls for it, or that you invoke with `/name`. These work in every tool.
- **Loop prompts** are tasks you run deliberately that repeat a check until a condition is met. Every one states when to give up, so it cannot spin forever.
- **Agent modes** are personas with their own instructions and tool access. In Copilot you switch into them from the mode picker; in Cursor they install as subagents you delegate to.

If they want the reasoning, point at `docs/authoring.md` for how assets are written and `docs/compatibility.md` for what works where.

## Step 4: Show the catalogue and let them choose

List what is available with a one-line description each, grouped by category, and say which type each is. Read the catalogue from whichever source you established in step 1 rather than reciting a list from memory — the catalogue grows, and a stale list is worse than no list.

**Exclude `skillbox-setup` itself.** It is the skill you are currently running, it is not something anyone installs into their project, and offering it is confusing.

Then ask what they want. Offer a sensible shortcut alongside picking individually:

- Everything that works in their editor.
- Just the skills, which are the portable ones.
- A specific category, if they describe a problem. Someone who says "my tests keep breaking" wants `fix-until-green` and `debugger`, not the whole catalogue.

**Recommend rather than dump.** Fewer, well-matched assets beat a full install. Say why you are suggesting each one.

## Step 5: Work out the destinations

Each type goes somewhere different, and it differs by editor:

| Type | Copilot | Cursor | Claude Code |
| --- | --- | --- | --- |
| Skill (folder) | `.github/skills/` | `.cursor/skills/` | `.claude/skills/` |
| Loop prompt (`.prompt.md`) | `.github/prompts/` | `.cursor/commands/` | no equivalent |
| Agent mode (`.agent.md`) | `.github/agents/` | `.cursor/agents/` | no equivalent |

`docs/compatibility.md` in the repository is the authoritative version of this table. If you can read it, prefer it over the copy above.

Two things to tell them rather than silently work around:

- **Cursor has no loop-prompt concept.** They install as commands. That is the correct destination, not a workaround.
- **Cursor cannot use agent modes as modes.** Custom modes are not file-based in Cursor at all. The file installs as a subagent, which you invoke with `/name` or delegate to, rather than switching into. Say this out loud — someone expecting a new entry in the mode picker will think it failed.

If they use more than one tool, `.claude/skills/` is worth suggesting for skills specifically, because Cursor reads it too.

## Step 6: Check for collisions before writing anything

These directories are shared. Something with the same name may already be there, and it may be the user's own work.

For every asset they chose, check whether the destination already exists. Report all conflicts at once, before writing anything — not one at a time as you hit them.

If there are none, say so and continue.

If there are conflicts, show which, and offer three choices per conflict:

1. **Skip it.** Keep what they have. This is the default.
2. **Install under a different name.** For a skill this means renaming the folder **and** the `name` field in its frontmatter *together* — they must match or the skill silently never loads.
3. **Overwrite.** Only on an explicit yes, for that specific file, after telling them what is being replaced.

Never overwrite as a default and never overwrite silently.

**Copy folders all-or-nothing.** Do not merge a skill folder into an existing one of the same name. Merging preserves their `SKILL.md` but adds any file they do not have, such as a `reference/` directory, producing a skill assembled from two different authors. That is harder to notice than a clean overwrite and harder to undo.

## Step 7: Install

Create destination directories as needed, then copy each chosen asset from the source you established in step 1.

- A **skill** is a whole folder. Copy all of it, including any `reference/` directory, and keep the folder name exactly — it must match the `name` in its frontmatter.
- A **loop prompt** and an **agent mode** are single files. Keep the `.prompt.md` and `.agent.md` suffixes; the editor uses them to tell the types apart.

Do not edit the contents while copying. If something needs renaming, change the folder name and frontmatter `name` together and tell them you did.

If you cloned to a temporary directory in step 1, delete it now and say so.

## Step 8: Confirm it worked, and teach them to use it

Tell them exactly what to do next:

1. Reload the editor window. New files in these directories are picked up at startup, so nothing will appear until they do.
2. Type `/` in the chat input. Installed skills and prompts appear by name.
3. In Copilot, agent modes appear in the mode picker. In Cursor, invoke them as `/name`.

Then give one concrete thing to try, tied to something they actually installed — "type `/commit-message` with staged changes and it will write the message" is worth more than a list of everything.

If something does not appear, work through this in order:

1. **A skill's folder name does not match the `name` in its frontmatter.** By far the most common cause, and it fails silently with no error.
2. **The window was not reloaded.**
3. **The file extension is wrong.** A prompt must end `.prompt.md` and an agent `.agent.md`. A plain `.md` in an agents directory is not treated as an agent.
4. **The file landed in the wrong directory for that editor.** Re-check the table in step 5.

Finish with a short summary: what was installed, where it went, what was skipped and why.

## Rules

- **Never overwrite without explicit per-file consent.** Skipping is always the default.
- **Never write an asset from memory.** If you cannot reach the real file, say so and stop.
- **Never install the whole catalogue unless asked.** More assets make matching worse, not better.
- Never offer `skillbox-setup` as something to install.
- Never edit an asset's content while installing it.
- Never install Skillbox into the Skillbox repository itself.
- Clean up any temporary clone you made.
- If you cannot tell which editor they use, ask. Guessing wrong puts files where nothing will read them, and it fails silently.
- Report what you actually did, including anything skipped. A summary claiming success while three assets were skipped is worse than no summary.
