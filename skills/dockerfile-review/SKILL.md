---
name: dockerfile-review
description: Review a Dockerfile for security, image size, build cache behaviour, and correct process handling. Use when writing or reviewing a Dockerfile, a container build, or diagnosing slow builds and oversized images.
---

# Dockerfile Review

Review a Dockerfile for the handful of things that reliably go wrong. Most Dockerfiles are wrong in the same six ways, so work through them in order rather than reading top to bottom.

Lead with security and correctness. A 400 MB image is a cost problem; a container running as root with a baked-in credential is a different kind of problem.

## 1. Secrets baked into the image

The highest-severity category, because it survives the build and ships.

**Every layer is preserved.** Deleting a file in a later `RUN` does not remove it from the image — it is still recoverable from the earlier layer. So this leaks the key even though the file appears to be gone:

```dockerfile
COPY id_rsa /root/.ssh/id_rsa
RUN git clone git@internal:repo.git && rm /root/.ssh/id_rsa
```

**`ARG` values are visible.** They appear in `docker history`, so a build argument is not a safe way to pass a token.

**`ENV` values persist into the running container** and show in `docker inspect`.

The supported way to use a credential during a build without it entering the image is a build secret mount, which requires BuildKit:

```dockerfile
RUN --mount=type=secret,id=npmtoken \
    NPM_TOKEN=$(cat /run/secrets/npmtoken) npm ci
```

If you find a real credential in a Dockerfile, say plainly that it must be rotated. It is in the git history and, if the image was ever pushed, in the registry.

## 2. Running as root

By default a container runs as root, and `USER` is the only thing that changes it.

Check that a `USER` directive exists and appears *after* the steps that need elevated permissions. Check the user actually exists — `USER appuser` without a preceding `adduser` fails at runtime, not build time.

Files copied before `USER` are owned by root, so a process that needs to write to them will fail. `COPY --chown=appuser:appuser` is the fix, not a later `chmod 777`.

## 3. Base image pinning

`FROM node:latest` means the image is not reproducible and can change under you between builds.

A tag such as `node:22-alpine` is the practical minimum. A digest such as `node:22-alpine@sha256:...` is genuinely immutable, at the cost of needing deliberate updates.

Also worth flagging: a full distribution base where a slim or alpine variant would do, and a base image that is years out of date and carrying known CVEs.

## 4. Layer caching order

This is where build times are won or lost, and the mistake is almost universal.

Docker caches each layer and invalidates every layer after the first change. Copying source before installing dependencies means every source edit reinstalls all dependencies:

```dockerfile
# Wrong: any source change busts the dependency cache
COPY . .
RUN npm ci
```

```dockerfile
# Right: dependencies reinstall only when the manifests change
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
```

The same shape applies to `requirements.txt`, `pyproject.toml` with `poetry.lock`, `go.mod` with `go.sum`, and `Cargo.toml` with `Cargo.lock`.

Check for a `.dockerignore` too. Without one, `COPY . .` sends `node_modules`, `.git`, and local build output into the build context, which is slow and can overwrite what the build just produced.

## 5. Image size

**Multi-stage builds** are the big lever. Compilers, dev dependencies, and build toolchains do not belong in the runtime image:

```dockerfile
FROM golang:1.23 AS build
WORKDIR /src
COPY . .
RUN go build -o /app ./cmd/server

FROM gcr.io/distroless/static-debian12
COPY --from=build /app /app
ENTRYPOINT ["/app"]
```

**Clean up inside the same `RUN`.** A separate cleanup layer removes nothing, because the earlier layer still contains the files:

```dockerfile
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*
```

`--no-install-recommends` alone often saves more than everything else in this section.

## 6. Process handling

**Use exec form, not shell form.** `CMD ["node", "server.js"]` runs the process as PID 1 and it receives `SIGTERM`. `CMD node server.js` wraps it in a shell that does not forward signals, so the container ignores graceful shutdown and gets killed after the timeout on every deploy.

**`ENTRYPOINT` versus `CMD`.** `ENTRYPOINT` for the thing that always runs, `CMD` for default arguments a user may override.

**`COPY` rather than `ADD`.** `ADD` also unpacks archives and fetches URLs, which is rarely what was intended. Use `COPY` unless the extra behaviour is deliberate.

**`HEALTHCHECK`** if an orchestrator is not already providing one.

## How to report

For each finding:

- **Line** — the instruction, quoted.
- **Severity** — `high` for a secret, running as root in production, or a broken signal path; `medium` for cache order, a mutable base tag, or a missing multi-stage split; `low` for size and style.
- **Why it matters** — the consequence, not the rule. "Every source edit reinstalls dependencies, so builds take four minutes instead of ten seconds" beats "layer order is suboptimal".
- **The fix** — corrected Dockerfile lines, not prose.

Then a verdict: **ship it**, **fix before merge**, or **do not ship**, in one sentence.

## Rules

- Never suggest `chmod 777` or `--privileged` as a fix. They resolve the symptom by removing the protection.
- Never claim a deleted file is gone from the image. It is in the earlier layer unless the build used a secret mount or a multi-stage copy.
- Do not recommend a multi-stage build for an interpreted-language image that has no build step. It adds complexity and saves nothing.
- Do not repeat a credential you found. Say where it is and that it needs rotating.
- Verify a flag exists before recommending it. `--no-install-recommends` is apt-specific and means nothing to `apk` or `dnf`.
- If the Dockerfile is sound, say so. Six correct decisions in a row is a legitimate outcome.
