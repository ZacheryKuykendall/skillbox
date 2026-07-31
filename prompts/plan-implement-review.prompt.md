---
name: plan-implement-review
description: Work a requirement end to end through four gated steps - plan, implement, review, document - stopping at each gate rather than pushing through.
mode: agent
---

# Plan, Implement, Review

An ordered workflow for making a change: plan it, build it, review it, document it.

This prompt composes three other Skillbox assets. Install them alongside it, or run their steps inline if you have not: the `implementation-planner` agent, the `code-review` prompt, and the `technical-documentation` skill.

## Why this order

Each step exists because skipping it fails in a specific way.

Planning first means the sequencing is reviewable before any code exists, when changing it is free. Implementing one step at a time keeps the repository working, so a failure is attributable to the step that caused it. Reviewing after implementation catches what the author stopped being able to see. Documenting last is the only point at which the change is settled enough to describe accurately.

## Step 1: Plan

Hand the requirement to the `implementation-planner` agent. It reads the existing code, states assumptions, and produces ordered steps that each name their files and carry an acceptance check.

**Before continuing, read the plan.** Check that:

- The assumptions match your intent. This is the cheapest point to correct a misreading.
- The step order follows dependencies, not convenience.
- Every step has an acceptance check you could actually run.
- Any open questions are answered.

**Gate:** do not proceed with a plan whose assumptions are wrong. Fixing the plan costs minutes; fixing the implementation costs hours.

## Step 2: Implement

Work through the plan one step at a time.

For each step:

1. Make only that step's change.
2. Run its acceptance check.
3. Confirm the repository is still in a working state.

Add tests alongside the code, not afterward. A step whose behavior has no test has not met its acceptance check.

**Gate:** a failing acceptance check stops the workflow. Do not continue to the next step on the assumption it will resolve itself. If the plan turns out to be wrong, return to step 1 rather than improvising — an improvised deviation is exactly what nobody reviews.

If a single step's tests are failing and the cause is unclear, `/fix-until-green` handles that loop with an explicit give-up bound.

## Step 3: Review

Run `/code-review` over the whole change rather than the last step, since the interaction between steps is where problems hide.

PowerShell:

```powershell
git diff --merge-base main
```

bash:

```bash
git diff --merge-base main
```

**Gate:** resolve every high-severity finding. For a medium finding, either fix it or record why it is acceptable. Do not silently dismiss one.

Re-run the review after fixing, since a fix can introduce its own problem.

## Step 4: Document

Use the `technical-documentation` skill to update what the change affects. Consider:

- A guide, if the change alters how something is used.
- A reference, if a flag, field, or option changed.
- An explanation, if a design decision was made worth recording.
- A README, if the change alters what the project is or how to start.

**Gate:** documentation and implementation must not contradict each other. A stale document is worse than a missing one, because it is trusted.

## Completion

The workflow is done when:

- Every plan step's acceptance check passes.
- No high-severity review finding is outstanding.
- Affected documentation is updated.
- The full test suite passes, not just the tests for the changed area.

## Output

A summary covering what was planned, what was built, what review found, and what was documented. State anything deferred and why, rather than leaving it implicit.
