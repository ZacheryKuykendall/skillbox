# Document Types

Four types, each answering a different question. Mixing them produces a document that serves nobody: a reader following steps does not want architecture, and a reader trying to understand a design does not want a numbered list.

## Guide

**Answers:** "How do I accomplish this task?"

A reader with a goal, following along.

Structure:

1. **What this achieves** — one or two sentences, so a reader can tell whether they are in the right place.
2. **Prerequisites** — versions, tools, access. Include the commands to check them.
3. **Numbered steps** — one action per step, in order.
4. **Expected output** — where it tells the reader whether the step worked.
5. **Verification** — how to confirm the whole thing worked.
6. **Troubleshooting** — the failures that actually happen, with causes.
7. **Next steps** — links onward.

Rules:

- Every step must be runnable as written.
- Never skip a step because it is obvious. The reader does not know what is obvious.
- State the starting directory before the first command.

## Reference

**Answers:** "What are the exact details of this thing?"

A reader who knows what they want and needs the specifics.

Structure:

1. **Purpose** — one sentence.
2. **Signature or syntax** — the complete form.
3. **Parameters** — a table: name, type, required, default, description.
4. **Return value or output.**
5. **Errors** — what can fail, and the code or message.
6. **Examples** — one minimal, one realistic.

Rules:

- Completeness matters more than readability here. Do not omit a parameter for brevity.
- Keep ordering consistent and predictable. Alphabetical or source order, chosen once.
- No narrative. A reader is scanning, not reading.

## Explanation

**Answers:** "Why is it built this way?"

A reader who needs to understand a design before changing it.

Structure:

1. **The problem** — what forced this design.
2. **The approach** — how it works, at the level of concepts rather than lines.
3. **Why this way** — the alternatives, and why they were rejected.
4. **Consequences** — what this makes easy, and what it makes hard.
5. **Where to look** — the files that implement it.

Rules:

- The rejected alternatives are the most valuable part. A reader who does not know what was already tried will suggest it again.
- Diagrams for structure and flow, prose for reasoning.
- Be honest about the downsides. A design document that lists only benefits is not trusted.

## README

**Answers:** "What is this, and should I use it?"

A reader deciding whether to invest any further attention.

Structure:

1. **Name and one-line description.**
2. **What problem it solves** — a short paragraph.
3. **Quick start** — the shortest path to it working.
4. **Key concepts** — only those needed to use it.
5. **Common tasks** — a few, with links to guides.
6. **Links** — full documentation, contributing, license.

Rules:

- The first paragraph decides whether the rest is read. Spend the effort there.
- Quick start must work from a clean checkout, with no undocumented steps.
- Link outward rather than inlining full documentation.
- State the current status honestly. "Pre-1.0, the format may change" saves a reader real time.
