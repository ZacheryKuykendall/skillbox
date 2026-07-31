---
name: fix-until-green
description: Iterate on a failing test suite until it passes or the loop hits a genuine blocker, without weakening the tests to get there.
mode: agent
---

# Fix Until Green

Drive a failing test suite to passing, one hypothesis at a time.

## The loop

| | |
| --- | --- |
| **Goal** | Every test passes for the right reason. |
| **Check each pass** | The project's test command, run in full. |
| **Stop when** | The suite is green, or a pass produces no new information. |
| **Give up after** | Five passes, or two consecutive passes with the same failure count and no new insight. |

The give-up bound is the point of this prompt. A loop with no exit condition burns budget and eventually starts making the code worse to satisfy the check.

## Before the first pass

Find the real test command rather than assuming one. Check `package.json` scripts, `pyproject.toml`, a `Makefile`, or the CI workflow. State the command you settled on.

Run it and record the starting state: how many tests fail, and their names. That baseline is how you tell progress from motion.

## Each pass

**1. Pick one failure.** Prefer the one most likely to be a shared root cause — the earliest in a dependency chain, or the one appearing in the most failures. Fixing a cause clears several symptoms; fixing a symptom clears one and can mask the cause.

**2. Read the actual error.** The full message, the stack trace, the assertion's expected and actual values. Not the test name.

**3. State a hypothesis before editing.** One sentence: what you believe is wrong and why that would produce this exact failure. If you cannot state it, you do not understand the failure yet — read more instead of editing.

**4. Make the smallest change that tests the hypothesis.** One change. Changing three things at once means a green result tells you nothing about which one mattered.

**5. Re-run the full suite.** Not just the one test. A fix that breaks two others is not a fix, and running the subset hides that.

**6. Compare against the baseline.** Failure count down means progress. Unchanged means the hypothesis was wrong; revert the change rather than layering another on top. Up means the change caused a regression; revert it.

**7. Report the pass** in one line: hypothesis, what you changed, and the resulting failure count.

## Hard rules

These exist because each one is a way to make the check pass while making the codebase worse.

- **Never weaken a test to make it pass.** No deleting assertions, loosening a comparison, adding a skip, widening a tolerance, or catching the exception the test was written to detect. If a test is genuinely wrong, stop and say why — that is a decision for a human.
- **Never change a test's intent.** Adjusting a test to match current behaviour turns a failing test into a rubber stamp.
- **Revert failed hypotheses.** Abandoned attempts left in the working tree accumulate into a change nobody can review.
- **Do not fix unrelated things you notice.** Note them and move on. An expanding diff is how a focused fix becomes unreviewable.
- **Do not commit** unless asked.

## When the loop ends

**Green:** report the passes taken, the root cause of each fix, and confirm you ran the full suite. Then flag anything you noticed but deliberately left alone.

**Give-up bound reached:** stop and hand back. Report what still fails, every hypothesis tried and what ruled it out, your best current theory, and specifically what you would need to make progress — a design decision, access to a system you cannot reach, or knowledge of intended behaviour that is not in the repository. A precise account of being stuck is a useful result. Silently continuing is not.

**A test looks wrong:** stop rather than deciding unilaterally. Report which test, what it asserts, what the code does, and why you believe the test rather than the code is mistaken.
