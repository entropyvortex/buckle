import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';

import type { ContainerInfo, Status } from '../docker/inspect.js';
import { isDualAgentTemplate } from '../templates/ai.js';
import { listCatalog } from '../templates/loader.js';
import { Logo } from './components/Logo.js';
import { getContext, getDriver, getRenderTemplate, type TuiServices } from './dependencies.js';

interface StatusPanelProps {
  cwd: string;
  /** Optional dependency overrides — primarily for testing with ink-testing-library. */
  services?: Partial<TuiServices>;
}

interface StatusState {
  status: Status;
  name: string;
  container?: ContainerInfo;
  loading: boolean;
  error?: string;
  flash?: string;
}

type Mode = 'status' | 'reconfigure';

const KEY_HINTS = 'r rebuild · u up · s/d down · b bash · c reconfigure · q quit';

export function StatusPanel({ cwd, services }: StatusPanelProps): React.ReactElement {
  const { exit } = useApp();
  const [state, setState] = useState<StatusState>({ status: 'absent', name: '', loading: true });
  const [mode, setMode] = useState<Mode>('status');
  const [templates, setTemplates] = useState<{ name: string; description?: string; origin: string }[]>([]);

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const driver = getDriver(services, 'unknown');
      const s = await driver.status();
      setState((prev) => ({
        status: s.status,
        name: s.name,
        ...(s.container !== undefined ? { container: s.container } : {}),
        loading: false,
        ...(prev.flash !== undefined ? { flash: prev.flash } : {}),
      }));
    } catch (e) {
      setState((prev) => ({ ...prev, loading: false, error: (e as Error).message }));
    }
  }, [cwd, services]);

  useEffect(() => {
    void refresh();
    const fromEnv = Number(process.env['BUCKLE_STATUS_REFRESH'] ?? '');
    const ms = Number.isFinite(fromEnv) && fromEnv >= 1000 ? fromEnv : 5000;
    const id = setInterval(() => {
      if (mode === 'status') void refresh();
    }, ms);
    return () => clearInterval(id);
  }, [refresh, mode]);

  const action = useCallback(
    async (op: 'rebuild' | 'up' | 'down' | 'bash') => {
      setState((s) => ({ ...s, loading: true, flash: `running ${op}…` }));
      try {
        const driver = getDriver(services, 'unknown');
        if (op === 'down') {
          await driver.down();
          setState((s) => ({ ...s, flash: 'container removed' }));
        } else if (op === 'up') {
          await driver.up({ quiet: true });
          setState((s) => ({ ...s, flash: 'container up' }));
        } else if (op === 'rebuild') {
          await driver.down();
          await driver.up({ rebuild: true, quiet: true });
          setState((s) => ({ ...s, flash: 'rebuild done' }));
        } else if (op === 'bash') {
          exit();
          process.nextTick(async () => {
            await driver.bash({});
            process.exit(0);
          });
          return;
        }
        await refresh();
      } catch (e) {
        setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
      }
    },
    [cwd, exit, refresh, services],
  );

  const startReconfigure = useCallback(async () => {
    try {
      const catalog = services?.listCatalog ?? listCatalog;
      const cat = await catalog();
      setTemplates(cat);
      setMode('reconfigure');
    } catch (e) {
      setState((s) => ({ ...s, error: (e as Error).message }));
    }
  }, [services]);

  const applyReconfigure = useCallback(
    async (templateName: string) => {
      setMode('status');
      setState((s) => ({ ...s, loading: true, flash: `reconfiguring ${templateName}…` }));
      try {
        const origin = templates.find((t) => t.name === templateName)?.origin;
        const trust = origin === 'builtin';
        const ctx = getContext(services, { yes: true, trust });
        const render = getRenderTemplate(services);
        await render(ctx, { templateName, features: ctx.flags.feature ?? [], trust, yes: true });
        setState((s) => ({ ...s, flash: `rewrote .devcontainer/ from ${templateName}` }));
        await refresh();
      } catch (e) {
        setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
      }
    },
    [refresh, services, templates],
  );

  useInput((input, key) => {
    if (mode === 'reconfigure') {
      if (input === 'q' || key.escape) setMode('status');
      return;
    }
    if (input === 'q') exit();
    else if (input === 'r') void action('rebuild');
    else if (input === 's' || input === 'd') void action('down');
    else if (input === 'b') void action('bash');
    else if (input === 'u') void action('up');
    else if (input === 'c') void startReconfigure();
  });

  const reconfigureItems = useMemo(
    () =>
      templates.map((t) => ({
        label: `${t.name.padEnd(16)} ${t.description ?? ''}${isDualAgentTemplate(t.name) ? ' · dual-agent' : ''}`,
        value: t.name,
      })),
    [templates],
  );

  if (mode === 'reconfigure') {
    return (
      <Box flexDirection="column">
        <Logo />
        <Text>reconfigure .devcontainer/ in {cwd}</Text>
        <Text dimColor>pick a template · esc/q to cancel</Text>
        <SelectInput items={reconfigureItems} onSelect={(item) => void applyReconfigure(item.value)} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Logo />
      <Text>
        workspace: <Text color="cyan">{cwd}</Text>
      </Text>
      <Text>
        container: <Text color="cyan">{state.name}</Text>
      </Text>
      <Text>
        status:    <StatusBadge s={state.status} />
      </Text>
      {state.container && (
        <Box flexDirection="column">
          <Text>
            image:     <Text color="cyan">{state.container.image}</Text>
          </Text>
          <Text>
            ports:     {state.container.ports.length === 0 ? <Text dimColor>none</Text> : state.container.ports.map((p, i) => (
              <Text key={i}>
                {p.host ?? '?'}<Text dimColor>→</Text>{p.container}/{p.protocol}{i < state.container!.ports.length - 1 ? ', ' : ''}
              </Text>
            ))}
          </Text>
        </Box>
      )}
      <Box marginTop={1}>
        {state.loading ? (
          <Text color="cyan">
            <Spinner type="dots" />
            <Text> {state.flash ?? 'refreshing…'}</Text>
          </Text>
        ) : (
          <Text dimColor>{state.flash ?? KEY_HINTS}</Text>
        )}
      </Box>
      {state.error && (
        <Box marginTop={1}>
          <Text color="red">error: {state.error}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>{KEY_HINTS}</Text>
      </Box>
    </Box>
  );
}

function StatusBadge({ s }: { s: Status }): React.ReactElement {
  const palette: Record<Status, { color: string; label: string }> = {
    running: { color: 'green', label: 'running' },
    built: { color: 'yellow', label: 'built (stopped)' },
    dead: { color: 'red', label: 'dead' },
    broken: { color: 'red', label: 'broken' },
    absent: { color: 'gray', label: 'absent' },
  };
  const p = palette[s];
  return <Text color={p.color}>{p.label}</Text>;
}
