# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `writeTextAtomic` is now a real best-effort atomic write (temp file + rename + fsync + cross-device fallback) with honest JSDoc and tests.
- `buckle doctor` now detects and reports actual container runtime (`container.runtime`: docker vs podman via compat).
- Full TUI dependency injection via `TuiServices` bag — Wizard and StatusPanel no longer directly construct `makeContext`/`Driver` (major purity improvement, enables testing).
- `buckle up` (no template, no existing `.devcontainer/`) now launches the wizard with up-intent, making the "one verb" mental model consistent.
- Major compose improvements: better mounts→volumes conversion, workspaceFolder support, expanded runArgs, `working_dir`, generated header.
- Compose guardrails: warnings when `compose` + `dind`/`dod` or conflicting user settings are used.
- New built-in `compose-demo` template for multi-service starting points.
- `docs/PATTERNS.md` + large new "Common Patterns & Gotchas" section in README (lifecycle table, `${localEnv:...}` rules, realistic corporate inheritance, compose realities).
- High-quality explanatory comments added to all built-in templates.
- 5 new tests across writer/compose/fs (now 184 total).

### Changed
- Podman language in README and doctor made precise and hedged (no more "expected to just work").
- `package.json` now includes `docs/` so documentation ships with the package.

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
