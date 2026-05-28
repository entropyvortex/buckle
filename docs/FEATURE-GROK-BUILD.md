# Feature Plan: First-Class Grok Build Support in Buckle

**Goal**: Make Grok Build (the xAI agentic coding CLI/TUI) a first-class convenience feature in buckle, on par with `claude-code`.

**Primary installation vector**: The official one-liner  
`curl -fsSL https://x.ai/cli/install.sh | bash`

**Status**: Planning + initial implementation started (Zero-Pause mode)

---

## Background & Rationale

- Grok Build (`grok` + `agent` commands) is xAI's official agentic coding experience (TUI, Plan Mode, subagents, skills via AGENTS.md, MCP support).
- It is the direct spiritual analog to Claude Code.
- buckle already has excellent first-class support for Claude Code via the `claude-code` convenience feature.
- Adding symmetric support for Grok Build creates a powerful "bring your favorite AI coding agents" story for buckle users.
- The official installer is high-quality, cross-platform, and handles auth, completions, PATH, and managed deployment config.

**Why this belongs in buckle**:
- Developers want their AI coding agents pre-installed and configured in every devcontainer.
- The pattern (postCreate install + persistent mount of config dir + PATH) is already proven with `claude-code`.
- This positions buckle as the best "AI-native devcontainer" tool.

---

## Proposed Design

### Feature Name

**Primary**: `grok` (short, matches the command users will actually run)

**Aliases / considerations**:
- `grok-build` (more descriptive)
- `xai` or `xai-cli`

**Recommendation**: Register `grok` as the main name. Document `grok-build` as an alias if desired later.

### Behavior (analogous to `claude-code`)

When a user specifies `--feature grok` or includes it in a template:

1. **Installation** (in `postCreate`):
   - Run the official installer: `curl -fsSL https://x.ai/cli/install.sh | bash`
   - Support optional version pinning: `--feature grok:0.2.3`

2. **Persistent state**:
   - Mount `~/.grok` (bind, read/write) so that:
     - `~/.grok/auth.json` (auth tokens)
     - `~/.grok/config.toml`
     - `~/.grok/skills/`, managed config, etc.
     - Completions
   - This is the direct equivalent of mounting `~/.claude` for Claude Code.

3. **Environment / PATH**:
   - We deliberately do **not** inject a `containerEnv.PATH` entry.
   - The official installer already:
     - Symlinks the binary into the first writable dir on the current PATH (`~/.local/bin` or `/usr/local/bin`).
     - Appends the proper `export PATH=...` (plus completions) to `~/.bashrc`, `~/.zshrc`, etc.
   - This is sufficient and avoids a subtle but real fragility: any `${containerEnv:...}` interpolation in `containerEnv` can be passed literally during the `@devcontainers/cli` initial probe `docker run --entrypoint /bin/sh`, breaking core commands (`sleep` etc.) on macOS arm64 + devcontainers/base.
   - Templates that need extra control (e.g. `ai-native`) can provide their own mounts + lifecycle steps instead of (or in addition to) the features.

4. **Trust surface**:
   - The installer runs a curl | bash script → this is captured by the existing trust model (lifecycle hooks + mounts).
   - We should surface a clear description in `listFeatures`.

### Implementation Location

- `src/features/catalog.ts` — add `'grok'` entry (and optionally `'grok-build'` alias)
- `src/features/compile.ts` — no changes expected (existing machinery is sufficient)
- Update `listFeatures()` return value
- Add tests in `test/unit/features.test.ts` and `test/unit/features-catalog-all.test.ts`
- Document in README (features list + example)
- Consider adding to `claude-corp` or creating a `grok-corp` / `ai-native` built-in template

### Proposed `grok` Feature Implementation Sketch

```ts
'grok': (arg) => {
  const installCmd = arg
    ? `curl -fsSL https://x.ai/cli/install.sh | bash -s ${arg}`
    : `curl -fsSL https://x.ai/cli/install.sh | bash`;

  return {
    lifecycle: {
      postCreate: [installCmd],
    },
    mounts: [
      {
        source: '${localEnv:HOME}/.grok',
        target: '/home/vscode/.grok',
        type: 'bind',
      },
    ],
    // No containerEnv injection. See "Environment / PATH" section above for rationale.
  };
},
```

**Open questions (historical — resolved in final implementation)**:
- PATH handling: resolved — we do **not** use `containerEnv.PATH` (see rationale above). The installer + symlinks + rc updates are sufficient and probe-safe.
- `agent` command: handled automatically by the official installer (symlinked alongside `grok`).
- Version pinning, channels, deployment keys: supported via the feature arg and environment variables passed through to the installer.

---

## Scope

### In Scope (MVP)
- Add `grok` convenience feature
- Mount `~/.grok`
- Run official installer in postCreate (with optional version)
- Update `listFeatures()`
- Basic tests
- README documentation + example
- Mention in one built-in template (e.g. enhance `claude-corp` or add notes)

### Out of Scope (future)
- Deep integration with Grok Build skills / AGENTS.md discovery
- Automatic MCP registration for Grok Build
- Special `grok` subcommand in buckle itself
- Native devcontainer feature (if xAI ever publishes one)
- Windows-specific handling beyond what the installer provides

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|----------|
| curl \| bash inside container feels scary | Medium | Medium | Already how many tools work; trust model protects it; document clearly |
| Installer modifies shell rc files inside container | Medium | Low | Noisy but harmless in most devcontainer images; installer is already designed for containers |
| Auth / `~/.grok` mount permissions | Low | Medium | Same pattern as `~/.claude` and `~/.gitconfig` — works today |
| Installer changes over time | Medium | Low | We delegate almost everything to the official script. We only own the "when to run it + what to mount" |
| Name collision (`grok` vs future native feature) | Low | Low | We can always support `ghcr.io/...` passthrough as escape hatch |

---

## Implementation Plan (Phased)

**Phase 1 — Core Feature (High confidence)**
1. Add `grok` (and `grok-build` alias) to `CATALOG` in `catalog.ts`
2. Implement the lifecycle + mount logic
3. Update `listFeatures()`
4. Add unit test coverage
5. Verify `applyFeatures` + resolver still work

**Phase 2 — Polish & DX**
1. Update README (features table + realistic example)
2. Add explanatory comments in `claude-corp` or a new lightweight AI-focused template
3. Consider adding `grok` to the default suggestions in autodetect or docs

**Phase 3 — Advanced (optional)**
- Support for `GROK_CHANNEL`
- Better PATH handling inside container (if the installer doesn't fully solve it)
- Documentation of deployment key + enterprise flows

---

## Success Criteria

- `buckle up --feature grok` produces a working devcontainer where `grok` and `agent` commands are available after `postCreate`.
- `~/.grok` is persisted across container rebuilds via mount.
- Existing trust prompt fires (because of the lifecycle hook).
- Documentation is clear and symmetric with `claude-code`.
- No regression in existing tests or behavior.

---

## Opinion (What I Think)

**This is a high-signal, high-leverage feature.**

Grok Build is one of the most interesting new entrants in the agentic coding CLI space. Giving buckle users a one-line way to get both Claude Code *and* Grok Build preconfigured in their devcontainers creates a very compelling "AI-maximal" development environment story.

The fact that xAI provides a clean, official, cross-platform installer makes the integration unusually clean compared to many other tools.

**Recommendation**: Treat this with the same priority and quality bar as the existing `claude-code` feature. Do not make it a second-class citizen.

Potential brand win: buckle becomes known as "the devcontainer tool that makes modern AI coding agents boring to set up."

---

**Execution Progress (Zero-Pause)**

- Core `grok` + `grok-build` features implemented in catalog.ts
- Both registered in `listFeatures()` with descriptions that cross-promote the dual-agent combination
- Proper patch verification tests added (`features.test.ts`)
- "Every feature compiles" test updated
- New dedicated `ai-native` built-in template created — explicitly designed around the dual (Claude + Grok) agent experience with excellent documentation
- `claude-corp` built-in template updated to include `grok` by default + rich comments positioning **both Claude + Grok as first-class citizens**
- New dedicated section "Using both Claude Code and Grok Build" added to README Patterns area
- README built-in templates table updated to highlight the `ai-native` template
- PATH handling finalized: no fragile containerEnv injection (installer + symlinks are used instead; this also eliminated the macOS arm64 probe "sleep: not found" failure for AI templates)
- Typecheck + full test suite green (188 tests)

The "container with both Claude Code and Grok Build" experience is now **strongly and explicitly** first-class across templates, documentation, and feature discovery.

---

*Document maintained during Zero-Pause execution following the META v2.0 charter.*