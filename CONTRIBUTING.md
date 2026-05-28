# Contributing to buckle

Thank you for your interest in contributing to buckle!

## Development Setup

```bash
git clone https://github.com/buckle-dev/buckle.git
cd buckle
npm install
npm run build
npm test
node bin/buckle.mjs --help
```

### Requirements

- Node.js ≥ 20
- A working Docker daemon (required for integration tests and full `buckle up` experience)
- `@devcontainers/cli` installed globally (`npm install -g @devcontainers/cli`)

## Project Philosophy

- **Simplicity first**: The entire value of buckle is reducing cognitive load. If a feature adds more concepts than it removes, it doesn't belong.
- **AI agents are first-class users**: Many design decisions (trust model, explicit aliases, `--yolo` encouragement in templates) exist because people use this tool with Claude Code and Grok Build.
- **Built-ins are opinionated**: The templates and features that ship with buckle reflect strong opinions. It's okay if they don't suit everyone.

## Code Style & Conventions

- TypeScript strict mode, ESM only.
- One responsibility per file.
- Prefer pure functions. The only acceptable impurity is in the Docker driver layer.
- All errors must be instances of `BuckleError` with a stable `ErrorCode` defined in `src/util/errors.ts`.
- Use `execa` for all subprocess execution.

## Testing

- **Coverage requirements** (enforced in CI):
  - 90% lines / statements / functions
  - 80% branches
- Docker-dependent code lives in `test/integration/` and is allowed lower coverage.
- The TUI (`src/tui/`) is also excluded from strict coverage.

Run tests with:

```bash
npm test
npm run test:coverage
```

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Imperative mood ("add support for X", not "added support")
- Keep the subject line under ~72 characters

## Pull Requests

1. Run `npm run lint && npm run typecheck && npm test` locally before opening a PR.
2. One logical change per PR.
3. Include tests for new behavior.
4. Update documentation (README, relevant `.md` files) when user-facing behavior changes.

## Security

Security issues must **not** be reported via public issues or pull requests.

Please follow the process described in [SECURITY.md](./SECURITY.md).

## Releasing

Releases are performed by maintainers from the `main` branch:

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create a git tag (`vX.Y.Z`)
4. Push the tag — CI will publish to npm

## Questions?

Feel free to open a discussion or issue for anything that isn't a security report. We're happy to help you get a contribution over the finish line.