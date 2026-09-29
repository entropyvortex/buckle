# Design notes

This is the architecture consensus for buckle: a single TypeScript CLI that
collapses generate → build → up → bash into one verb, with **user-wide**
templates rather than per-repo copy-paste.

## Core bets

1. **Templates travel with the developer.** `~/.config/buckle/templates/` is the
   source of truth. Repos receive generated `.devcontainer/` artifacts, not the
   template itself.
2. **One schema, three artifacts.** A YAML template compiles deterministically
   to `devcontainer.json` plus optional `Dockerfile` / `docker-compose.yml`.
3. **Inheritance is data, not a preprocessor.** `extends` is a string or ordered
   list; objects deep-merge; arrays append unless the child starts with
   `!replace`. Cycles are errors. Depth is capped at 8.
4. **Convenience features are sugar.** `dod`, `claude-code`, `grok`, `mcp:*`
   compile to native devcontainer features + hooks + mounts. Unknown names are
   `E_TEMPLATE_INVALID`.
5. **The executable surface is a trust boundary.** Lifecycle, mounts, runArgs,
   and features are hashed with a stable serializer. Built-ins are pre-trusted.
   User/installed templates prompt interactively (or require `--trust` when
   non-TTY).
6. **AI agent state is per-workspace by default.** Host `~/.claude` and `~/.grok`
   are not bind-mounted unless `--share-home`. Isolated state lives under
   `$XDG_DATA_HOME/buckle/workspaces/<slug>-<hash>/{claude,grok}` so skills,
   versions, and configs do not leak across containers. Host `~/.gitconfig`
   remains shared (identity, not agent state).

## Layers

```
cli/          parse, JSON envelope, command shells, render pipeline
templates/    zod schema, loader, resolver, autodetect, trust, isolate
features/     convenience catalog → native features + hooks
generators/   devcontainer / Dockerfile / compose + plan/apply
docker/       naming, inspect, @devcontainers/cli wrapper, Driver
tui/          wizard (no .devcontainer) / status panel (has one)
util/         errors, paths (XDG), log, fs, slug, config, version
```

## Non-goals (0.x)

- Signature verification of installed templates (`metadata.signature` is reserved).
- Static analysis of hook command bodies.
- First-class Podman (Docker-API compat only; `doctor` warns).
- Per-step `user:` on lifecycle hooks (`@devcontainers/cli` rejects the shape).

## CLI contract

- Every command accepts `--json` with a stable envelope (`ok`, `timestamp`,
  `workspace`, `data` | `error.code`).
- Error codes in `src/util/errors.ts` are never repurposed.
- `--version` is read from `package.json` (`buckle-cli`), not a string literal.
- `--preview` / `--dry-run` never write.

## Invariants

- At most one of `image` / `build` / `compose` after merge.
- Generated JSON is key-sorted for stable diffs.
- Writes go through `writeTextAtomic`.
- Isolation dirs are created at plan time so `devcontainer up` can bind them.
