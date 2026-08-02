---
name: terraform-plan-review
description: Read a terraform plan and report what it will actually destroy, replace, or change out from under you, before anyone applies it. Use when reviewing terraform plan output, an infrastructure pull request, or deciding whether an apply is safe.
---

# Terraform Plan Review

A plan is the last honest moment before infrastructure changes. Read it for the things that are expensive or impossible to undo, not for style.

## Get a plan worth reading

If you were handed plan output, use it. If you can run the plan yourself, save it so the applied plan is the reviewed plan:

```powershell
terraform plan -out=tfplan
terraform show -json tfplan | Out-File plan.json
```

```bash
terraform plan -out=tfplan
terraform show -json tfplan > plan.json
```

The JSON form is worth the extra step on a large plan. Text output hides attributes behind `# (N unchanged attributes hidden)`, and it is easy to skim past a replacement in three hundred lines of diff.

If the plan is stale, say so and ask for a fresh one. Reviewing a plan generated before the last three commits tells nobody anything.

## Read the symbols exactly

Getting these wrong inverts the entire review:

| Symbol | Means |
| --- | --- |
| `+` | create |
| `-` | destroy |
| `~` | update in place |
| `-/+` | **destroy, then create** — the resource ceases to exist in between |
| `+/-` | create, then destroy — `create_before_destroy` is set |
| `<=` | read a data source |

`-/+` is the one to slow down on. The summary line `Plan: 2 to add, 1 to change, 2 to destroy.` counts a replacement as both an add and a destroy, so a plan claiming two destroys may be replacing two live resources rather than removing two unused ones.

## What to look for

Work down this list. Stop at the first category that produces a finding serious enough to block, and say so rather than continuing to catalogue style issues.

### 1. Destruction and replacement

For every `-` and `-/+`, name the resource and answer: does this hold state that will not survive?

Treat these as high severity by default: databases and database instances, disks and volumes, storage buckets and containers, persistent volume claims, stateful sets, key vaults and their secrets, certificates, and anything holding logs or backups you would need after a failed apply.

Terraform tells you *why* a replacement is happening. Find the line and quote it:

```
# forces replacement
```

An attribute that forces replacement is often changeable another way — a rename that could be a `moved` block, a tag change that should not require it, an argument that only forces replacement on one provider version.

### 2. Data loss that is not a destroy

A resource can survive while its contents do not. Look for retention periods shortened, `deletion_protection` or `prevent_destroy` being removed, backup or point-in-time-restore windows reduced, lifecycle rules that expire objects, and `skip_final_snapshot` being turned on.

### 3. Drift

Changes nobody asked for mean the real world moved. If the diff contains resources unrelated to the stated intent of the change, someone edited infrastructure by hand, or another pipeline owns the same resource.

Say which changes look like drift and which look intended. Applying a plan that quietly reverts someone's emergency fix is its own outage.

### 4. Blast radius

Check the counts before the details. A change to a module input, a `count`, a `for_each`, or a provider version can rewrite hundreds of resources from a one-line diff.

If the plan touches more resources than the change description implies, that gap is the finding. Say the number.

### 5. Security regressions

Public network exposure, a security group or NSG opening to `0.0.0.0/0`, IAM or role assignments widening, public access flags on storage, encryption or customer-managed keys being disabled, audit logging or flow logs being turned off, TLS minimum versions dropping.

### 6. Secrets in the output

Terraform redacts values it knows are sensitive, but a value only becomes sensitive if it is marked. Check for credentials, connection strings, tokens, and private keys appearing in plaintext in the diff or in outputs.

If you find one, that is a finding about the configuration, not just the plan: the attribute needs `sensitive = true`, and the exposed credential should be treated as compromised because the plan output is in CI logs.

### 7. State operations

`moved` blocks, imports, and anything that changes addresses without changing infrastructure. These are usually correct and usually invisible in the summary counts. Confirm the address on each side is what was intended, because a wrong `moved` block destroys one resource and adopts another.

## How to report

For each finding:

- **Resource address** — `module.db.aws_db_instance.main`, exactly as the plan writes it.
- **Severity** — `high` for data loss, destruction of a stateful resource, or a security regression; `medium` for unexplained drift or blast radius beyond the stated intent; `low` for everything else.
- **What the plan does** — one or two sentences, with the `# forces replacement` reason quoted where there is one.
- **What to do** — a concrete alternative, or the specific thing to confirm before applying.

Then a verdict: **safe to apply**, **apply with confirmation**, or **do not apply**, in one sentence.

Finish with the counts as terraform reports them, and separately your own count of stateful resources being destroyed or replaced. Those two numbers differing is usually the most useful line in the review.

## Rules

- **Never run `terraform apply`.** Reviewing and applying are different jobs, and this is the review.
- Never advise applying a plan containing an unexplained `-/+` on a stateful resource. Say what would be lost.
- Only report what is in the plan. If the diff shows an attribute change whose consequence depends on code you cannot see, say that rather than guessing.
- Quote the plan rather than paraphrasing it. A paraphrased replacement reads like an update.
- Do not repeat a credential you found in the output. Say where it appears and that it needs rotating.
- If the plan is empty, say so plainly. A no-op plan is a legitimate and useful result.
