# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] — 2026-10-14

### Breaking

- **Per-workspace isolation is now the default.** `~/.claude` and `~/.grok` are
  no longer bind-mounted from the host when rendering. Each workspace gets its
  own skills/config under `$XDG_DATA_HOME/buckle/workspaces/<id>/`.
  Pass `--share-home` (or `--no-isolate`, or `isolate: false` in
  `~/.config/buckle/config.yaml`) to restore the previous host-home mounts.
  Existing `.devcontainer/` files are unchanged until you re-render
  (`buckle <template> --yes` or status-panel `c`).
- Built-in `ai-native` / `claude-corp` templates and the `grok` / `gh` features no
  longer bind-mount host paths directly. They declare `buckle:workspace/{claude,grok,gh}`
  sentinels; generate-time resolution maps those to per-workspace dirs (default) or
  host home only with `--share-home`. Copying a template without the remap step
  cannot clobber host agent state.
- Non-interactive trust failures tell you to pass `--trust` after `buckle view`.
  Interactive TTYs now actually prompt `[y/N]` and show the executable surface;
  the wizard and status panel show their own in-TUI trust confirm.
- Trust-surface hashing switched to a key-sorted serializer, so previously
  recorded trust entries are invalidated once: the first render of an already
  trusted custom template will ask you to re-confirm it.
- `buckle install` refuses plaintext `http://` origins.
- MCP convenience features no longer swallow `npm install` failures (`|| true` removed).

### Added

- `--share-home` / `--no-isolate` to opt out of isolation.
- `~/.config/buckle/config.yaml` is loaded (`editor`, `defaultTemplate`, `isolate`).
- `gh` feature persists `~/.config/gh` per workspace, so container rebuilds no
  longer force a fresh `gh auth login` (GitHub revokes the oldest OAuth token
  once a user/app/scope mints more than ten).
- Status panel `c` reconfigure flow (pick a template, rewrite `.devcontainer/`).
- Dual-agent callouts for `ai-native` and `claude-corp` in `buckle list`,
  `buckle doctor`, and the wizard.
- Empty-directory autodetect suggests `ai-native` first.
- Interactive lifecycle trust prompt for user/installed templates.
- `docs/DESIGN-NOTES.md`, `MAINTAINERS.md`.

### Fixed

- `--preview` / `--dry-run` was parsed under a single `dryRun` option key, so the
  flag never took effect from the CLI and templates were written anyway. It now
  works, and previewing touches nothing on disk (not even the per-workspace
  state dirs, which are only created on apply).
- `isolate: false` in `~/.config/buckle/config.yaml` is honored by CLI commands,
  not just the TUI (flags no longer force a concrete default past the config).
- `--version` reports the `package.json` version instead of a stale `0.1.0`.
- Trust-surface hashes use a key-sorted serializer (no false “changed” from key order).
- Unknown convenience features raise `BuckleError` (`E_TEMPLATE_INVALID`).
- Generated file banners and docs point at `entropyvortex/buckle`.
- CI runs coverage thresholds. Code scanning uses GitHub's default CodeQL setup.

### Security

- Path-stable origin parsing and ReDoS hardening remain as of 0.3.0.
- Hook-surface hashing is now order-independent.
- Install origins cannot be plaintext HTTP.

## [0.3.0] — 2026-05-28

### Security

- Path traversal prevention in `buckle install` (gh:/gl:/URL origins) and `buckle new`:
  - `parseOrigin` now strips `..`, `.`, and path separators from the path component of remote origins.
  - Defense-in-depth: after `join()`, a resolved-path check throws if the template directory would escape the install root.
  - `buckle new <name>` strictly validates names against `/^[a-zA-Z0-9._-]+$/` and rejects `..`.
- Additional ReDoS hardening:
  - `parseOrigin`: manual linear scan replaces regex trailing-slash stripping to eliminate quadratic backtracking on long slash input.
  - `slug`: reorder replace steps so dash-run collapse happens before anchor trimming, removing backtracking vectors on adversarial input.

These changes address GitHub CodeQL alerts ("Uncontrolled data used in path expression") plus static analysis findings on regular expression denial-of-service.

### Changed

- Version bump to 0.3.0 to ship the security fixes with a clean, working Trusted Publishing release process.

## [0.2.0] — 2026-05-28

### Added

- Trusted Publishing support via GitHub Actions OIDC (no more long-lived NPM_TOKEN required).
- Proper release workflow (`.github/workflows/release.yml`) triggered on version tags.
- Code scanning fixes for path traversal vulnerabilities (in template installation and `buckle new`).
- Improved pre-commit lint guard using Husky + lint-staged.
- Better Dependabot configuration to reduce noise on risky major updates.

### Changed

- Package is now published as `buckle-cli` on npm (binary remains `buckle`).
- Repository references updated for current fork during initial development.
- Various CI and developer experience improvements (lint config, version validation on release).

## [0.1.0] — 2026-05-08

### Added

- Initial public alpha.
- TUI wizard (no `.devcontainer`) and status panel (existing `.devcontainer`).
- CLI: `buckle [<template>]`, `up`, `down`, `bash`, `rebuild`, `restart`, `logs`, `status`,
  `list`, `edit`, `new`, `install`, `uninstall`, `doctor`. All accept `--json`.
- User-wide template store at `~/.config/buckle/templates/` with built-in catalog: `ubuntu-base`,
  `node`, `python`, `go`, `rust`, `bun`, `deno`, `polyglot`, `claude-corp`.
- Template inheritance via `extends:` (string or ordered MRO array), deep merge, `!replace`
  override, cycle detection, source mutex on `image`/`build`/`compose`.
- Buckle convenience features (`dod`, `dind`, `gh`, `git-config`, `claude-code`, `mcp:<name>`,
  `aws`, `gcloud`, `kube`, `terraform`, `node[:ver]`, `python[:ver]`, `go[:ver]`, `rust[:ver]`,
  `java[:ver]`, plus `ghcr.io/...` passthrough).
- Project autodetect: lockfile (3) > manifest (2) > framework (1) + Dockerfile FROM hint (1)
  scoring; polyglot fallback when two languages tie.
- Trust store at `~/.config/buckle/trust.json` (resolved-hash → hook-surface-hash) with re-prompt
  on surface change.
- `buckle install` from `gh:user/repo`, `gl:user/repo`, https git URL, or `file://`.
- `--preview` / `--dry-run` to emit a diff without writing.
- Stable JSON error codes.

[0.4.0]: https://github.com/entropyvortex/buckle/releases/tag/v0.4.0
[0.3.0]: https://github.com/entropyvortex/buckle/releases/tag/v0.3.0
[0.2.0]: https://github.com/entropyvortex/buckle/releases/tag/v0.2.0
[0.1.0]: https://github.com/entropyvortex/buckle/releases/tag/v0.1.0
