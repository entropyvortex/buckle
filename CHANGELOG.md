# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [Unreleased]

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
- 179 unit + integration tests; ≥ 90% coverage.

[0.1.0]: https://github.com/buckle-dev/buckle/releases/tag/v0.1.0
