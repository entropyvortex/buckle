# Security policy

`buckle` runs developer-supplied templates that can mount host paths and execute shell commands
inside containers. This document describes the threat model, the supported versions, and how to
report a vulnerability.

## Supported versions

| Version line | Status                | Security fixes |
| ------------ | --------------------- | -------------- |
| 0.x          | Active alpha          | Yes            |
| < 0.1        | Pre-release prototype | No             |

We commit to issuing security patches for the latest 0.x line until the 1.0 release; after 1.0,
the latest minor of the current major and the previous major receive fixes for 6 months.

## Reporting a vulnerability

**Please do not open a public issue for security reports.** Instead, email
**security@buckle.dev** with:

- a clear description of the issue,
- a minimal reproducer,
- the impact you observed, and
- any suggested fix.

You can expect:

- an acknowledgement within **3 business days**,
- a remediation plan within **10 business days**,
- public disclosure coordinated with you, typically within **30 days** of the patch release.

If you would prefer end-to-end-encrypted communication, use the project maintainers' GPG keys
listed in `MAINTAINERS.md`.

We do not currently run a paid bug bounty. We are happy to credit reporters in release notes
unless you'd prefer to remain anonymous.

## Threat model

`buckle` operates as a thin layer on top of Docker and the official `@devcontainers/cli`. The
material risks come from three places:

### 1. Templates execute commands on first use

A template's `lifecycle.postCreate` (and friends), `runArgs`, `mounts`, and `features`
collectively form an **executable surface** that runs against your host or inside a container
that has been granted host access (e.g., via `dod` or bind-mounts).

**Mitigations**:

- `buckle` prompts on **first use** of any (resolved-hash, hook-surface-hash) pair. The trust
  store is at `~/.config/buckle/trust.json`.
- The hook-surface hash covers `lifecycle`, `runArgs`, `mounts`, `features`, `nativeFeatures`,
  and `customizations`. If any of those change, you are re-prompted.
- `buckle edit <name>` opens the template for review before you trust it.
- `buckle <name> --preview` (or `--dry-run`) emits the full diff of generated files without
  touching disk.
- The trust prompt is **non-interactive-aware**: in CI / non-TTY contexts, the prompt becomes a
  hard error (`E_HASH_MISMATCH`); you must opt in explicitly with `--trust`.

**Out of scope**: We do *not* statically analyze the body of `postCreate` commands. The trust
boundary is your eyes — the same as `make` or `npm install`.

### 2. Installed templates may be tampered with

`buckle install` performs a `git clone --depth 1` from the origin you provide and stores the
result in your config directory. There is no signature verification in 0.x.

**Mitigations**:

- The origin URL is recorded; `buckle list` shows it.
- The origin's first 16 hex characters are part of the on-disk path, so multiple references to
  the same repo at different refs do not collide.
- We schema-validate the cloned `template.yaml` at install time, so a malformed remote fails
  fast rather than at first `up`.

**Planned**: `metadata.signature` is reserved in the schema; `buckle install` will accept
`sigstore`-signed templates in a future minor release.

### 3. Convenience features may grant the container privileged host access

A feature like `dod` (docker-outside-of-docker) bind-mounts `/var/run/docker.sock` into the
container, giving any process inside the container the ability to launch sibling containers on
your host. `dind` runs the container in `--privileged` mode.

**Mitigations**:

- The trust prompt covers any change to the `features` list, so adding `dod` to a previously
  trusted template re-prompts.
- `buckle list` and `buckle edit` show the resolved feature list before you accept.
- Each convenience feature is documented in the README with its concrete effect on the
  generated `devcontainer.json`.

You are responsible for understanding that, e.g., `dod` is functionally equivalent to handing
the container access to your host docker daemon.

## What `buckle` does NOT do

- We do not collect telemetry. There is no opt-in path in 0.x.
- We do not phone home, write to system directories, or modify your shell rc.
- We do not modify your project files outside of `.devcontainer/` unless you explicitly pass
  `--git-init` (which runs `git init` in the cwd).
- We do not execute arbitrary code from a template *during resolution* — only the documented
  lifecycle hooks run, and only inside the container.

## Operational hardening

For team or CI use, we recommend:

- Pin a specific buckle version in your CI image.
- Vendor your team's templates via `buckle install gh:org/templates#<sha>` so the install ref
  is a commit SHA rather than a branch.
- Run `buckle doctor --json` in CI to verify the host environment before invoking `up`.
- Set `--trust` only after a code review of the template, never blanket-trust unknown origins.

## Cryptography

`buckle` uses the Node `crypto` standard library: SHA-256 for trust hashing and origin keys.
We do not roll our own crypto. We do not transmit any data over the network during template
resolution.

## Contact

- General security issues: **security@buckle.dev**
- Public discussion: `#security` in the project chat
- Maintainer GPG keys: Available upon request via the security email above.
