import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      all: true,
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/tui/**',
        'src/templates/builtin/**',
        'src/**/*.d.ts',
        // Subprocess-bound: needs a real docker daemon to exercise meaningfully.
        'src/docker/driver.ts',
        'src/docker/devcontainer-cli.ts',
        'src/docker/inspect.ts',
        // Thin wrappers over the docker driver; covered via integration when docker is up.
        'src/cli/commands/up.ts',
        'src/cli/commands/down.ts',
        'src/cli/commands/bash.ts',
        'src/cli/commands/rebuild.ts',
        'src/cli/commands/status.ts',
        'src/cli/commands/install.ts',
        'src/cli/commands/uninstall.ts',
        'src/cli/commands/edit.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90,
      },
    },
  },
});
