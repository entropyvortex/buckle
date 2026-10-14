# buckle

> One verb for devcontainers — generate, build, up, and bash with user-wide templates.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](#requirements)
[![Coverage](https://img.shields.io/badge/coverage-%E2%89%A590%25-success)](#testing)
[![Status](https://img.shields.io/badge/status-alpha-yellow)](#stability)

`buckle` is a single TypeScript CLI that collapses the daily devcontainer ritual —
hand-author `.devcontainer/devcontainer.json` → maybe a Dockerfile → maybe a compose file →
`devcontainer up` → `docker exec -it … bash` — into one verb. It also gives you **user-wide
templates** so the same config travels with *you*, not with each repo.

```bash
$ buckle up claude-corp      # build & up & bash in
$ buckle                     # land in any folder; TUI does the right thing
$ buckle node --feature dod  # render Node template + docker-outside-of-docker
$ buckle down                # tear it down
```

---

## Why

Developers create, rebuild, and shell into devcontainers many times per day, in many folders.
Doing this by hand means: copy-paste a `devcontainer.json` from the last project, tweak it,
run `devcontainer up`, then a long `docker exec -it … bash` incantation. There is no good
"my standard environment" story across folders.

`buckle` fixes that with three ideas:

1. **Templates are user-wide.** `~/.config/buckle/templates/<name>/template.yaml` — author once,
   use everywhere. Inheritance with `extends:`. Override with `!replace`.
2. **One verb does the obvious thing.** Empty folder → wizard. Folder with `.devcontainer/` →
   status panel. `buckle up <tpl>` builds and bashes. Nothing surprising.
3. **The same template emits all three artifacts** (`devcontainer.json`, optional `Dockerfile`,
   optional `docker-compose.yml`) deterministically. Diffs are stable; round-trip is safe.

---

## Install

Requires **Node ≥ 20** and a working **Docker daemon**. The
[`@devcontainers/cli`](https://github.com/devcontainers/cli) is required for `buckle up` /
`rebuild` because it correctly wires features and lifecycle hooks; `buckle doctor` will tell
you if it's missing.

```bash
npm install -g buckle-cli @devcontainers/cli
```

> **Note**: The package on npm is published as `buckle-cli`, but the executable command is `buckle`.

Verify:

```bash
buckle --version
buckle doctor
```

---

## Quickstart

```bash
$ cd ~/scratch/myproj
$ buckle                  # opens TUI: detects project, suggests templates, writes .devcontainer
$ buckle up               # build, up, and drop into a shell
```

Or non-interactively:

```bash
$ buckle node --yes --trust    # render the built-in `node` template
$ buckle up                    # build & shell in
```

With AI agents:

```bash
$ buckle up claude-corp        # Node + Claude Code + Grok Build + GitHub CLI + MCP servers
```

---

## Commands

| Command | What it does |
| --- | --- |
| `buckle` | If no `.devcontainer` exists → wizard. Else → live status panel. |
| `buckle <template>` | Render `<template>` into `.devcontainer/`. No build. |
| `buckle up [<template>]` | Generate (if missing), build, up, exec a shell. |
| `buckle down [--prune]` | Stop & remove the workspace's container. `--prune` cleans dangling images/volumes. |
| `buckle bash` | Exec a shell into the running container. |
| `buckle restart` | Restart in place (no rebuild). |
| `buckle rebuild` | Down + force-rebuild + up + bash. |
| `buckle logs [-f] [--tail N]` | Stream container logs. |
| `buckle status` | Show container state and metadata. |
| `buckle list [--installed-only]` | List built-in / user / installed templates. |
| `buckle view <template>` | Print the resolved devcontainer (features expanded) without writing. |
| `buckle edit <template>` | Open user template in `$EDITOR`. |
| `buckle new <name> [--extend <p>]` | Scaffold a new user template. |
| `buckle install <origin>` | Install a template from `gh:user/repo`, `gl:user/repo`, https git URL, or `file://`. |
| `buckle uninstall <name>` | Remove a previously installed template. |
| `buckle doctor` | Diagnose the host environment. |

### Global flags

| Flag | Effect |
| --- | --- |
| `--json` | Machine-readable output for every command. |
| `--verbose` | Extra logs to stderr. |
| `--yes` | Skip the diff confirmation when writing files. |
| `--trust` | Skip the lifecycle-trust prompt. |
| `--feature <spec>` | Add a buckle convenience feature; repeatable. (`--feature dod --feature node:20`) |
| `--user <user>` | Run the shell as `<user>` when bashing in. |
| `--rebuild` | Force rebuild on `up`. |
| `--detach` | Don't attach a shell after `up`/`rebuild`. |
| `--git-init` | Initialize a git repo in the workspace if there is none. |
| `--preview`, `--dry-run` | Show what *would* be written without touching disk. |
| `--isolate` | Default. Per-workspace `~/.claude` / `~/.grok` / `~/.config/gh` under `$XDG_DATA_HOME/buckle/workspaces/`. |
| `--share-home`, `--no-isolate` | Bind-mount host `~/.claude`, `~/.grok`, and `~/.config/gh` instead (`~/.gitconfig` is always bound from the host). |

---

## Templates

A buckle template is a YAML file at
`~/.config/buckle/templates/<name>/template.yaml`. Built-ins ship with the binary; user templates
override built-ins with the same name; installed templates (via `buckle install`) live in their
own subtree.

### Minimal example

```yaml
# ~/.config/buckle/templates/claude-corp1/template.yaml
name: Claude Corp 1
description: Node + Claude Code with my team's MCP set.
version: 0.1.0

extends: claude-corp           # inherit from a built-in

features:
  - claude-code
  - grok
  - mcp:filesystem
  - mcp:github

env:
  ANTHROPIC_LOG: warn

lifecycle:
  postCreate:
    - npm install -g pnpm
  postAttach:
    - "echo 'corp1 ready'"
```

### Full schema (cheat sheet)

```yaml
name: Display name
description: Long-form description.
version: 0.1.0

# Inheritance: single parent or ordered MRO array (rightmost wins on conflicts).
extends: ubuntu-base
# extends: [base, mixin-a, mixin-b]

# EXACTLY ONE of image / build / compose may be set per template level.
image: mcr.microsoft.com/devcontainers/base:ubuntu
build:
  dockerfile: Dockerfile
  context: .
  args: { NODE_VERSION: "20" }
  target: dev
compose:
  file: docker-compose.yml
  service: app
  runServices: [app, db]
  shutdownAction: stopCompose

# Buckle convenience features (sugar). Compile to native devcontainer features + hooks.
features:
  - dod                  # docker-outside-of-docker
  - dind                 # docker-in-docker (privileged)
  - gh
  - git-config
  - claude-code
  - grok                  # Grok Build (xAI agentic CLI/TUI)
  - mcp:filesystem
  - aws
  - gcloud
  - kube
  - terraform
  - node:20
  - python:3.12
  - go:1.22
  - rust:1.75
  - java:21
  # native devcontainer features pass through:
  - ghcr.io/devcontainers/features/git:1

# Pass-through native devcontainer features (advanced).
nativeFeatures:
  ghcr.io/devcontainers/features/python:1: { version: "3.12" }

forwardPorts:
  - 3000
  - { port: 8080, label: api, onAutoForward: notify }
appPort: 3000

mounts:
  - { source: "${localEnv:HOME}/.aws", target: /home/vscode/.aws, type: bind, readOnly: true }

env:
  NODE_ENV: development

runArgs:
  - "--cap-add=SYS_PTRACE"
  - "--init"

customizations:
  vscode:
    extensions: [dbaeumer.vscode-eslint, esbenp.prettier-vscode]
    settings: { "editor.formatOnSave": true }

remoteUser: vscode
containerUser: vscode
workspaceFolder: /workspaces

# Lifecycle hooks. Append-merge by default; first element "!replace" replaces parent.
lifecycle:
  initialize:    [ ./bin/preflight ]
  onCreate:      [ ]
  updateContent: [ ]
  postCreate:    [ corepack enable, npm ci ]
  postStart:     [ ]
  postAttach:    [ "node --version" ]
```

### Inheritance & merging

- `extends:` accepts a string or an ordered list (MRO; rightmost wins).
- Cycles are detected; depth is capped at 8.
- Plain objects merge key-by-key.
- Arrays append by default. To replace the parent's array, prefix with the literal `!replace`:

  ```yaml
  lifecycle:
    postCreate:
      - "!replace"
      - echo "this fully overrides the parent's postCreate"
  ```

- `image` / `build` / `compose` are mutually exclusive *at any single level*. A child's choice
  replaces the parent's.

### Common patterns & gotchas

#### Lifecycle hook ordering

Hooks run in this order (the devcontainer spec defines the timing):

| Hook            | When it runs                                      | Typical use |
|-----------------|---------------------------------------------------|-------------|
| `initialize`    | Very early, on the host (before container exists) | Preflight scripts, secret fetching |
| `onCreate`      | Once, when the container is first created        | One-time heavy setup (tool installs that don't change often) |
| `updateContent` | When content is refreshed (git pull, etc.)       | `npm ci`, `go mod download` |
| `postCreate`    | After the container is created and code is present | Most common place for `npm install -g`, database migrations, `corepack enable` |
| `postStart`     | Every time the container starts                  | Lightweight background services |
| `postAttach`    | Every time you `buckle bash` or attach in VS Code | Welcome messages, `node --version`, `git status` |

**Tip**: Use `!replace` at the start of a list when you want to completely override a parent's hooks instead of appending.

#### Variable expansion in mounts and env

Buckle (and the underlying devcontainer tooling) supports `${localEnv:VAR}` syntax. This is **not** shell expansion — it is performed by the devcontainer CLI / VS Code when the container is created.

```yaml
mounts:
  - source: "${localEnv:HOME}/.aws"
    target: /home/vscode/.aws
    type: bind
    readOnly: true

  # Agent dirs: never ${localEnv:HOME}/.claude or ~/.grok — those leak host state.
  # buckle:workspace/* is resolved at generate time to a per-workspace dir
  # (or host home only with --share-home).
  - source: buckle:workspace/claude
    target: /home/vscode/.claude
    type: bind
  - source: buckle:workspace/grok
    target: /home/vscode/.grok
    type: bind
```

- Use `${localEnv:HOME}` rather than hard-coding `/Users/you` or `/home/you` for host identity/secrets (`.aws`, `.gitconfig`).
- Do **not** bind-mount host `~/.claude` or `~/.grok` in a template. Use `buckle:workspace/claude` and `buckle:workspace/grok`.
- The variable must exist in your shell environment when you run `buckle up` / the wizard.
- For secrets or tokens, prefer mounting a directory or using a short-lived `initialize` script rather than embedding them in the template.

#### Using both Claude Code and Grok Build

Both agents install side by side; each gets its own per-workspace state mount
(`~/.claude`, `~/.grok`) and independent `postCreate` install step.

```bash
buckle up --feature claude-code --feature grok   # add both to any template
buckle up ai-native                              # or use the dedicated template
```

In your own templates:

```yaml
features:
  - claude-code
  - grok
  - mcp:filesystem
  - mcp:github
```

See the `ai-native` and `claude-corp` built-in templates for worked examples.

**The `ai-native` template disables agent permission prompts.** It installs:

```bash
alias claude='claude --dangerously-skip-permissions'
alias grok='grok --yolo'
```

The container is treated as a disposable sandbox: source code is bind-mounted
from the host, agent state is per-workspace, and `buckle up ai-native --rebuild`
recreates the environment from scratch. The aliases exist so agents can edit
files, run commands, and install packages without per-action confirmation. If
you want the agents' own permission prompts, extend `ai-native` and remove the
aliases (`!replace` the `postCreate` list), or use `claude-corp`, which does not
set them.

#### Working with compose (multi-service)

When you set `compose:` instead of `image` or `build`, buckle generates a minimal `docker-compose.yml` on first use.

Important realities:
- Lifecycle hooks (`postCreate`, etc.) run **only against the primary `service`** you declared.
- If you need to run commands in other services, use `docker compose exec <service> ...` inside your hooks.
- Features like `dind` and `dod` only affect the primary service unless you duplicate the configuration in your compose file.
- The generated compose file is a **starting point**. Edit it freely after the first render.

See the `compose-demo` built-in template (run `buckle new myapp --extend compose-demo`) and [docs/PATTERNS.md](docs/PATTERNS.md) for deeper multi-service guidance, including how hooks interact with secondary services and common customizations people make after first render.

#### Realistic corporate inheritance example

```yaml
# ~/.config/buckle/templates/my-corp-base/template.yaml
name: My Corp Base
extends: ubuntu-base
features:
  - gh
  - git-config
  - aws
lifecycle:
  postCreate:
    - corepack enable
    - npm install -g pnpm@latest

# ~/.config/buckle/templates/claude-corp1/template.yaml
name: Claude Corp 1
extends: my-corp-base          # your internal base
features:
  - claude-code
  - grok
  - mcp:filesystem
  - mcp:github
env:
  ANTHROPIC_LOG: warn
mounts:
  - source: buckle:workspace/claude
    target: /home/vscode/.claude
  - source: buckle:workspace/grok
    target: /home/vscode/.grok
```

This pattern keeps company policy in one place while individual teams or roles add their own layers.

### Built-in templates

| Name | Description |
| --- | --- |
| `ubuntu-base` | Plain Ubuntu LTS with the `vscode` user. Good base to extend. |
| `node` | Node.js 20 (Bullseye), corepack pre-enabled. |
| `python` | Python 3.12 with pip / venv / uv. |
| `go` | Go 1.22 with delve, gopls, persistent module cache. |
| `rust` | Rust stable, rust-analyzer, persistent target cache. |
| `bun` | Bun runtime on Debian. |
| `deno` | Deno runtime, secure by default. |
| `polyglot` | Node + Python + Go on a Debian universal base. |
| `claude-corp` | Node + Claude Code + Grok Build + GitHub CLI + MCP servers. Reference template. |
| `compose-demo` | Minimal compose-based multi-service starter (app + sidecar pattern). |
| `ai-native` | Claude Code + Grok Build with common MCP servers. Agents run with permission prompts disabled (see trust model). |

Run `buckle list` to see the live catalog (built-in + user + installed).

### Installing third-party templates

```bash
buckle install gh:acme/devcontainer-templates/node-strict
buckle install gh:acme/devcontainer-templates#v2
buckle install gl:acme/templates
buckle install https://example.com/x.git#v1
buckle install file:///abs/path/to/template-dir
```

Installed templates land under
`~/.config/buckle/templates/_installed/<origin-hash>/<template-name>/`. They appear in
`buckle list` with an `installed (origin-hash)` marker.

---

## Daily flow

```bash
# Land in a brand-new project, no devcontainer.
$ cd ~/code/some-fresh-clone
$ buckle             # TUI: detects 'package.json' + 'pnpm-lock.yaml' → suggests `node`
                     # Pick template, toggle features, hit "u" → writes .devcontainer & ups.

# Iterate.
$ buckle             # already has .devcontainer → status panel: r rebuild · u up · s/d down · b bash

# Try a quick docker-in-docker test.
$ buckle up --rebuild --feature dind

# Save your favorite stack as a personal template.
$ buckle new claude-corp1 --extend claude-corp
# … edit template.yaml in $EDITOR …
$ buckle up claude-corp1
```

---

## TUI

Two flows, picked by whether the cwd already has `.devcontainer/devcontainer.json`:

**Wizard** (no devcontainer) — auto-detects language signals, suggests top templates, lets you
toggle features, previews changes, then either *just writes* (`y`) or *writes-and-ups* (`u`).

**Status panel** (devcontainer present) — a one-screen dashboard:

```
╭───╮  buckle
╰───╯  one verb for devcontainers

workspace: /home/me/myproj
container: buckle.myproj.node
status:    running
image:     mcr.microsoft.com/devcontainers/javascript-node:1-20-bullseye
ports:     3000 → 3000/tcp

r rebuild · u up · s/d down · b bash · c reconfigure · q quit
```

Refresh interval defaults to 5 s; override with `BUCKLE_STATUS_REFRESH=2000`.

---

## JSON mode

Every command supports `--json`. The envelope:

```jsonc
{
  "ok": true,
  "timestamp": "2026-05-08T12:34:56.789Z",
  "workspace": "/home/me/proj",
  "data": { "...": "..." }
}
```

On error:

```jsonc
{
  "ok": false,
  "timestamp": "...",
  "error": { "code": "E_DOCKER_DOWN", "message": "...", "hint": "..." }
}
```

Error codes are stable: `E_DOCKER_DOWN`, `E_TEMPLATE_NOT_FOUND`, `E_TEMPLATE_INVALID`,
`E_TEMPLATE_CONFLICT`, `E_HOOK_FAILED`, `E_BUILD_FAILED`, `E_PORT_CONFLICT`, `E_HASH_MISMATCH`,
`E_CYCLE`, `E_PERMISSION`, `E_NO_GIT`, `E_USER_ABORT`, `E_INSTALL_FAILED`, `E_UNSUPPORTED`,
`E_INTERNAL`.

---

## Trust model

Templates can run shell commands (`postCreate`, `postStart`, …) and mount paths from your host
file system. `buckle` therefore prompts you on first use of any template whose
**executable surface** (lifecycle, mounts, runArgs, features, native features, customizations)
is unseen. The trust store lives at `~/.config/buckle/trust.json` and maps the merged-template
SHA-256 to the date you trusted it. If the surface changes, you're prompted again.

On a TTY, buckle prints that surface and asks `[y/N]`. In CI, `--json`, or any non-TTY
context the prompt is a hard error (`E_HASH_MISMATCH`); pass `--trust` after reviewing
with `buckle view`.

You can:

- pass `--trust` to skip the prompt for that one run
- inspect a template before trusting with `buckle view <name>` / `buckle edit <name>`
- review what would be written without committing with `--preview` / `--dry-run`

Built-in templates are pre-trusted. User and installed templates are not.

`buckle` does no network access during template resolution. `buckle install` clones via
`git` over `https://`, `ssh://`, or `git@` (plaintext `http://` is rejected). `buckle doctor`
is the only command that probes outside the workspace.

See [SECURITY.md](SECURITY.md) for the full threat model.

## Isolation (default)

Agent skills, versions, and config are **per workspace**, not shared from the host:

| Path in container | Isolated source (default) | `--share-home` |
| --- | --- | --- |
| `/home/vscode/.claude` | `$XDG_DATA_HOME/buckle/workspaces/<slug>-<hash>/claude` | `${localEnv:HOME}/.claude` |
| `/home/vscode/.grok` | `$XDG_DATA_HOME/buckle/workspaces/<slug>-<hash>/grok` | `${localEnv:HOME}/.grok` |
| `/home/vscode/.config/gh` | `$XDG_DATA_HOME/buckle/workspaces/<slug>-<hash>/gh` | `${localEnv:HOME}/.config/gh` |
| `/home/vscode/.gitconfig` | host `~/.gitconfig` (identity, always) | host `~/.gitconfig` |

Re-render an existing project to pick up isolation:

```bash
buckle ai-native --yes          # isolated (default)
buckle ai-native --share-home --yes
```

Override for every command via `~/.config/buckle/config.yaml`:

```yaml
isolate: false   # equivalent to always passing --share-home
```

---

## Compatibility

- **Linux** (amd64, arm64) — first-class.
- **macOS** (Apple Silicon) — first-class with Docker Desktop, OrbStack, or Colima. Buckle
  inherits `DOCKER_HOST` / `DOCKER_CONTEXT` from your shell, so any of these work.
- **WSL2** — works; run buckle from inside WSL.
- **Podman** — supported when a Docker-compatible API socket is available (via `DOCKER_HOST`
  or `alias docker=podman`). Many devcontainer features and the official `@devcontainers/cli`
  have reduced functionality. Run `buckle doctor` to see the detected runtime (`container.runtime`).
  First-class support is a v1.x goal.

`buckle` requires the [`@devcontainers/cli`](https://github.com/devcontainers/cli) for
`up` / `rebuild`; `buckle doctor` will tell you what's missing.

Lifecycle hooks (`postCreateCommand` etc.) are always emitted as a single flat string
joined with `&&`. If a template declares per-step `user:` on a hook, buckle folds it
away — the whole hook runs as the template's `remoteUser` (which is `vscode` in every
built-in). The `{ command, user }` per-step form crashes `@devcontainers/cli` (still
broken in 0.87.0) and isn't part of the devcontainer JSON spec for named-object hooks.

---

## Configuration

Per-user file at `~/.config/buckle/config.yaml` (optional):

```yaml
editor: code              # falls back to $VISUAL → $EDITOR → vi
defaultTemplate: node     # used by the wizard if autodetect can't decide
isolate: true             # default; false = share host ~/.claude, ~/.grok, ~/.config/gh
```

Environment variables:

| Variable | Effect |
| --- | --- |
| `BUCKLE_SHELL` | Preferred shell when `buckle bash`. Default: zsh > bash > sh. |
| `BUCKLE_STATUS_REFRESH` | Status-panel refresh in ms (default 5000). |
| `BUCKLE_BUILTIN_DIR` | Override built-in template directory (testing). |
| `BUCKLE_NO_COLOR` | Strip ANSI from output (also honors `NO_COLOR`). |
| `BUCKLE_DEBUG` | Print full stack traces on uncaught errors. |
| `BUCKLE_STATE_DIR` | Override the per-workspace AI state root (default `$XDG_DATA_HOME/buckle/workspaces`). |

---

## Testing

Run the full suite:

```bash
npm test
npm run test:coverage   # thresholds: 90% lines/functions, 89% statements, 80% branches
```

The docker-subprocess layer and the TUI render layer are excluded from coverage and are not
exercised in CI; they require a real docker daemon / TTY.

---

## Architecture

```
src/
  cli/                # argument parsing, render pipeline, JSON envelope, command shells
    commands/         # one file per subcommand
    parse.ts          # commander program & `buckle <template>` rewrite
    render.ts         # resolve → trust → plan → apply
    install.ts        # gh: / gl: / https / file:// origins
  templates/
    schema.ts         # zod schema (single source of truth)
    loader.ts         # discovery (built-in / user / installed)
    resolver.ts       # extends, deep merge, !replace, cycle detection, hashing
    autodetect.ts     # project signals → suggested templates
    trust.ts          # SHA-256 trust store
    builtin/          # bundled templates
  features/
    catalog.ts        # buckle convenience-feature catalog
    compile.ts        # convenience features → native features + hooks/env/mounts
  generators/
    devcontainer.ts   # Template → devcontainer.json (deterministic, sorted)
    dockerfile.ts     # minimal Dockerfile when build:.dockerfile is missing
    compose.ts        # single-service docker-compose.yml when compose: is set & missing
    writer.ts         # plan / apply / preview / diff
  docker/
    naming.ts         # buckle.<cwd>.<template> with collision suffix
    inspect.ts        # 5-state status (absent | built | running | dead | broken)
    devcontainer-cli.ts  # @devcontainers/cli wrapper
    driver.ts         # high-level: status, up, down, bash, restart, logs
  tui/
    Wizard.tsx        # interactive setup
    StatusPanel.tsx   # interactive dashboard
  util/               # logging, paths (XDG), errors, slug, fs
```

---

## Stability

`buckle` is **alpha**. The CLI surface, JSON shape, error codes, and template schema are
stable for 0.x but may shift before 1.0. Expect to pin a specific version in CI.

We follow semver:

- Pre-1.0: minor versions can be breaking; PATCH versions are bug-fix only.
- Post-1.0: breaking changes only on MAJOR.

---

## Contributing

PRs welcome. The design constraints are documented in [docs/DESIGN-NOTES.md](docs/DESIGN-NOTES.md);
if you'd change the spec, please reference them.

To work on buckle locally:

```bash
git clone https://github.com/entropyvortex/buckle.git
cd buckle
npm install
npm run build
npm test
node bin/buckle.mjs --help
```

Style: TypeScript strict, ESM, Node ≥ 20, vitest, ink, commander, zod. Lint with `npm run lint`,
auto-format with `npm run format`. Coverage thresholds in `vitest.config.ts` are enforced in CI.

---

## License

[MIT](LICENSE).
