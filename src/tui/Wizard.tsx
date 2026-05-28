import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';

import { detectProject, type AutoDetectResult } from '../templates/autodetect.js';
import { listFeatures } from '../features/catalog.js';
import { listCatalog } from '../templates/loader.js';
import { Logo } from './components/Logo.js';
import { getContext, getDriver, getRenderTemplate, type TuiServices } from './dependencies.js';

interface WizardProps {
  cwd: string;
  /** Optional dependency overrides — primarily for testing with ink-testing-library. */
  services?: Partial<TuiServices>;
  /**
   * When 'up', the wizard was launched via `buckle up` with no template in a clean folder.
   * After the user confirms, we force the "write + up" path (equivalent to pressing 'u').
   */
  initialIntent?: 'up';
}

type Step = 'detect' | 'pick-template' | 'pick-features' | 'review' | 'apply' | 'docker' | 'done' | 'error';

const ALL_FEATURES = listFeatures();

export function Wizard({ cwd, services, initialIntent }: WizardProps): React.ReactElement {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>('detect');
  const [detection, setDetection] = useState<AutoDetectResult | null>(null);
  const [templates, setTemplates] = useState<{ name: string; description?: string }[]>([]);
  const [chosenTemplate, setChosenTemplate] = useState<string>('');
  const [chosenFeatures, setChosenFeatures] = useState<string[]>([]);
  const [featureCursor, setFeatureCursor] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [doUp, setDoUp] = useState<boolean>(false);
  const [report, setReport] = useState<string[]>([]);

  // Step: detect.
  useEffect(() => {
    if (step !== 'detect') return;
    let cancelled = false;
    (async () => {
      try {
        const det = await detectProject(cwd);
        const cat = await listCatalog();
        if (cancelled) return;
        setDetection(det);
        setTemplates(cat);
        setStep('pick-template');
      } catch (e) {
        setErrorMsg((e as Error).message);
        setStep('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, cwd]);

  // Step: pick-features (custom keyboard).
  useInput((input, key) => {
    if (step !== 'pick-features') return;
    if (key.upArrow) setFeatureCursor((c) => Math.max(0, c - 1));
    else if (key.downArrow) setFeatureCursor((c) => Math.min(ALL_FEATURES.length - 1, c + 1));
    else if (input === ' ') {
      const name = ALL_FEATURES[featureCursor]!.name;
      setChosenFeatures((prev) => (prev.includes(name) ? prev.filter((f) => f !== name) : [...prev, name]));
    } else if (key.return) {
      setStep('review');
    } else if (input === 'q') {
      exit();
    }
  });

  // Step: review.
  useInput((input, key) => {
    if (step !== 'review') return;
    if (input === 'y' || key.return) {
      setDoUp(initialIntent === 'up' ? true : false);
      setStep('apply');
    } else if (input === 'u') {
      setDoUp(true);
      setStep('apply');
    } else if (input === 'n' || input === 'q' || key.escape) {
      exit();
    }
  });

  // Step: apply.
  useEffect(() => {
    if (step !== 'apply') return;
    let cancelled = false;
    (async () => {
      try {
        const ctx = getContext(services, { yes: true, trust: true, feature: chosenFeatures });
        const render = getRenderTemplate(services);
        const out = await render(ctx, {
          templateName: chosenTemplate,
          features: chosenFeatures,
          trust: true,
          yes: true,
        });
        if (cancelled) return;
        const lines = out.plan.files.map((f) => `${f.changed ? (f.existed ? 'updated' : 'created') : 'unchanged'}  ${f.path}`);
        setReport(lines);
        if (doUp) {
          setStep('docker');
        } else {
          setStep('done');
          setTimeout(() => exit(), 250);
        }
      } catch (e) {
        setErrorMsg((e as Error).message);
        setStep('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, chosenTemplate, chosenFeatures, doUp, exit]);

  // Step: docker (build & up).
  useEffect(() => {
    if (step !== 'docker') return;
    let cancelled = false;
    (async () => {
      try {
        const driver = getDriver(services, chosenTemplate);
        const r = await driver.up({ quiet: true });
        if (cancelled) return;
        setReport((prev) => [...prev, `container up: ${r.containerName}`]);
        setStep('done');
        setTimeout(() => exit(), 500);
      } catch (e) {
        setErrorMsg((e as Error).message);
        setStep('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, cwd, chosenTemplate, exit]);

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <Box flexDirection="column">
      <Logo />
      {step === 'detect' && (
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> scanning {cwd}…</Text>
        </Box>
      )}
      {step === 'pick-template' && detection && <PickTemplate detection={detection} templates={templates} onPick={(t) => { setChosenTemplate(t); setStep('pick-features'); }} />}
      {step === 'pick-features' && (
        <PickFeatures items={ALL_FEATURES} cursor={featureCursor} chosen={chosenFeatures} />
      )}
      {step === 'review' && (
        <Review template={chosenTemplate} features={chosenFeatures} cwd={cwd} />
      )}
      {step === 'apply' && (
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> writing .devcontainer/…</Text>
        </Box>
      )}
      {step === 'docker' && (
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> building &amp; starting container…</Text>
        </Box>
      )}
      {step === 'done' && (
        <Box flexDirection="column">
          <Text color="green">✓ done</Text>
          {report.map((l, i) => (
            <Text key={i} dimColor>
              {l}
            </Text>
          ))}
        </Box>
      )}
      {step === 'error' && errorMsg && (
        <Box flexDirection="column">
          <Text color="red">error: {errorMsg}</Text>
          <Text dimColor>press q to quit</Text>
        </Box>
      )}
    </Box>
  );
}

interface PickTemplateProps {
  detection: AutoDetectResult;
  templates: { name: string; description?: string }[];
  onPick: (name: string) => void;
}

function PickTemplate({ detection, templates, onPick }: PickTemplateProps): React.ReactElement {
  const items = useMemo(() => {
    // Show suggestions first, then alphabetical rest.
    const head = detection.suggestions
      .map((n) => templates.find((t) => t.name === n))
      .filter((x): x is { name: string; description?: string } => Boolean(x));
    const rest = templates.filter((t) => !detection.suggestions.includes(t.name));
    return [...head, ...rest].map((t) => ({
      label: `${t.name.padEnd(16)} ${t.description ?? ''}`,
      value: t.name,
    }));
  }, [detection, templates]);

  return (
    <Box flexDirection="column">
      <Text>
        suggestions: <Text color="cyan">{detection.suggestions.join(', ')}</Text>
        {detection.polyglot ? <Text dimColor> (polyglot signals)</Text> : null}
      </Text>
      <Text dimColor>↑/↓ to choose, enter to pick</Text>
      <SelectInput items={items} onSelect={(item) => onPick(item.value as string)} />
    </Box>
  );
}

interface PickFeaturesProps {
  items: { name: string; description: string }[];
  cursor: number;
  chosen: string[];
}

function PickFeatures({ items, cursor, chosen }: PickFeaturesProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text>
        features <Text dimColor>(space to toggle, enter to continue, q to quit)</Text>
      </Text>
      {items.map((it, i) => {
        const selected = chosen.includes(it.name);
        const marker = selected ? '[x]' : '[ ]';
        const arrow = i === cursor ? '›' : ' ';
        return i === cursor ? (
          <Text key={it.name} color="cyan">
            {arrow} {marker} {it.name.padEnd(20)} <Text dimColor>{it.description}</Text>
          </Text>
        ) : (
          <Text key={it.name}>
            {arrow} {marker} {it.name.padEnd(20)} <Text dimColor>{it.description}</Text>
          </Text>
        );
      })}
    </Box>
  );
}

interface ReviewProps {
  template: string;
  features: string[];
  cwd: string;
}

function Review({ template, features, cwd }: ReviewProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text>
        ready to write <Text color="cyan">.devcontainer/</Text> in {cwd}
      </Text>
      <Text>
        template: <Text color="cyan">{template}</Text>
      </Text>
      <Text>features: {features.length === 0 ? <Text dimColor>(none)</Text> : <Text color="cyan">{features.join(', ')}</Text>}</Text>
      <Text dimColor>y to write • u to write &amp; up • n/esc to abort</Text>
    </Box>
  );
}
