# Buckle patterns

Longer-form patterns beyond the quick reference in the README.

## Lifecycle hook ordering

The devcontainer spec defines the sequence; buckle passes hooks through unchanged.

Use this table when deciding where to put work:

- `initialize`: Runs on the **host**, before any container exists. Use for: checking prerequisites, fetching secrets into the environment, very early validation. Keep it fast and idempotent.
- `onCreate`: Runs once when the container is first created. Heavy one-time work (large tool installs, building base images inside the container).
- `updateContent`: Runs on content refresh (git pull in certain flows). Place `npm ci`, `go mod download`, `pip install -r requirements.txt` here.
- `postCreate`: The most common location. Runs after code is present. `corepack enable`, global CLIs, database setup, `pnpm install`.
- `postStart`: Every container start. Lightweight daemons or watchers.
- `postAttach`: Every shell attach / VS Code attach. Greeting messages, `git status`, version checks.

**!replace** example (from README, expanded):

```yaml
lifecycle:
  postCreate:
    - "!replace"
    - echo "Completely replace whatever the parent did"
    - ./scripts/my-corp-setup.sh
```

## Variable expansion

`${localEnv:HOME}` and friends are expanded by the `@devcontainers/cli` and VS Code, **not** by your shell at `buckle` invocation time.

This means:
- The variable must exist in the environment of the person who triggers the container creation.
- It works in `mounts`, `env`, some `runArgs`, and inside your generated Dockerfile/compose if you pass them through.
- It does **not** support arbitrary command substitution or complex expressions.

Common working patterns:

```yaml
mounts:
  - source: "${localEnv:HOME}/.ssh"
    target: /home/vscode/.ssh
    type: bind
    readOnly: true
```

`~/.config/gh` is already persisted by the `gh` feature. If you mount it yourself,
declare `buckle:workspace/gh` as the source — a host-home source targeting an agent
config dir is remapped to the per-workspace dir when isolation is on.

## Compose + Real Multi-Service (Expanded from compose-demo)

The `compose-demo` built-in generates a minimal but usable starting point.

Key things users usually need to customize after first render:

1. Add a real database service (postgres, mysql, redis, etc.).
2. Wire networking between services (`depends_on`, shared networks).
3. Duplicate important mounts (e.g. docker socket for dod) into additional services if needed.
4. Use `runServices` in the template to control which services come up by default.
5. Override `shutdownAction` appropriately.

Example addition people commonly make to the generated `docker-compose.yml`:

```yaml
services:
  app:
    # ... generated content ...
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: dev
    volumes:
      - db-data:/var/lib/postgresql/data
volumes:
  db-data:
```

Remember: hooks still only target your declared primary `service`.

## Corporate / Team Inheritance Strategy (3-Level)

Level 1: `my-corp-base` (company policy)
- Common tools (gh, git-config, aws/gcloud/kube depending on stack)
- Security baselines (no passwordless sudo, certain mounts)
- Standardized lifecycle (corepack, pnpm, etc.)
- Company VS Code extensions

Level 2: Role / stack bases (`my-corp-frontend`, `my-corp-data`, `my-corp-platform`)
- Language-specific features + lifecycle

Level 3: Personal or project overrides (`my-corp-claude`, `proj-x-experimental`)
- Personal MCPs, extra tools, experiment flags

This structure keeps `buckle list` and inheritance chains understandable while giving individuals freedom.

## When to Choose compose vs image/build

Choose `compose` when:
- You genuinely need multiple containers (app + db + cache + worker is the classic).
- You want to model production topology locally.
- You are comfortable owning more of the compose file.

Choose single `image` or `build` (the default) when:
- One primary development container is sufficient.
- You want convenience features and the devcontainer ecosystem to apply directly.

The guardrails in buckle will warn you when you combine `compose` with `dind`/`dod` because those features have container-scoped side effects.

## Trust Model + Lifecycle Surface

The trust prompt only cares about the "executable surface":
- lifecycle hooks
- mounts (especially host binds)
- runArgs
- features / nativeFeatures
- customizations that can run code

Changing non-executable things (env vars, forwardPorts, name) will **not** re-trigger trust.

This is intentional and documented in SECURITY.md.
