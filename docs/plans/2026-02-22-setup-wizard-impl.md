# Setup Wizard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a first-run setup wizard that guides users through theme selection, harness verification, and workflow installation.

**Architecture:** New `setup` AppPhase with a `SetupWizard` Ink component. Three triggers converge to the same phase: first-run detection, `athena-cli setup` subcommand, and `/setup` slash command. Each wizard step has a state machine (idle → selecting → verifying → success/error) with retry support.

**Tech Stack:** Ink + React 19, existing theme system, existing workflow registry/marketplace, existing `detectClaudeVersion()`.

---

### Task 1: Add `setupComplete` and `harness` to AthenaConfig

**Files:**
- Modify: `source/plugins/config.ts:14-24`
- Test: `source/plugins/__tests__/config.test.ts`

**Step 1: Write the failing test**

Add a test that verifies `readConfigFile` parses `setupComplete` and `harness` fields:

```typescript
it('parses setupComplete and harness fields', () => {
  vol.fromJSON({
    '/project/.athena/config.json': JSON.stringify({
      plugins: [],
      setupComplete: true,
      harness: 'claude-code',
    }),
  });
  const config = readConfig('/project');
  expect(config.setupComplete).toBe(true);
  expect(config.harness).toBe('claude-code');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/plugins/__tests__/config.test.ts`
Expected: FAIL — `setupComplete` and `harness` not in type or returned object

**Step 3: Write minimal implementation**

In `source/plugins/config.ts`, update the `AthenaConfig` type:

```typescript
export type AthenaConfig = {
  plugins: string[];
  additionalDirectories: string[];
  model?: string;
  theme?: string;
  workflow?: string;
  setupComplete?: boolean;
  harness?: 'claude-code' | 'codex';
};
```

Update `readConfigFile` return (line ~83-90) to include the new fields:

```typescript
return {
  plugins,
  additionalDirectories,
  model: raw.model,
  theme: raw.theme,
  workflow: raw.workflow,
  setupComplete: raw.setupComplete as boolean | undefined,
  harness: raw.harness as AthenaConfig['harness'],
};
```

Also update the `raw` type annotation to include `setupComplete?: boolean; harness?: string;`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/plugins/__tests__/config.test.ts`
Expected: PASS

**Step 5: Add a `writeGlobalConfig` helper**

The setup wizard needs to write config. Add this function to `source/plugins/config.ts`:

```typescript
/**
 * Write global config to `~/.config/athena/config.json`.
 * Merges with existing config if present. Creates directories as needed.
 */
export function writeGlobalConfig(updates: Partial<AthenaConfig>): void {
  const homeDir = os.homedir();
  const configDir = path.join(homeDir, '.config', 'athena');
  const configPath = path.join(configDir, 'config.json');

  let existing: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    existing = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
  }

  const merged = { ...existing, ...updates };
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
}
```

**Step 6: Test writeGlobalConfig**

```typescript
it('writeGlobalConfig merges with existing config', () => {
  vol.fromJSON({
    [path.join(os.homedir(), '.config/athena/config.json')]: JSON.stringify({
      plugins: ['existing'],
      theme: 'dark',
    }),
  });
  writeGlobalConfig({ setupComplete: true, harness: 'claude-code' });
  const written = JSON.parse(
    vol.readFileSync(path.join(os.homedir(), '.config/athena/config.json'), 'utf-8') as string,
  );
  expect(written.plugins).toEqual(['existing']);
  expect(written.setupComplete).toBe(true);
  expect(written.harness).toBe('claude-code');
});
```

**Step 7: Run all config tests**

Run: `npx vitest run source/plugins/__tests__/config.test.ts`
Expected: ALL PASS

**Step 8: Commit**

```bash
git add source/plugins/config.ts source/plugins/__tests__/config.test.ts
git commit -m "feat(config): add setupComplete, harness fields and writeGlobalConfig"
```

---

### Task 2: Create StepSelector component

**Files:**
- Create: `source/setup/components/StepSelector.tsx`
- Test: `source/setup/components/__tests__/StepSelector.test.tsx`

**Step 1: Write the failing test**

```typescript
import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import StepSelector from '../StepSelector.js';

describe('StepSelector', () => {
  it('renders options with cursor on first item', () => {
    const {lastFrame} = render(
      <StepSelector
        options={[
          {label: 'Dark', value: 'dark'},
          {label: 'Light', value: 'light'},
        ]}
        onSelect={() => {}}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Dark');
    expect(frame).toContain('Light');
  });

  it('calls onSelect with value on Enter', () => {
    let selected = '';
    const {stdin} = render(
      <StepSelector
        options={[
          {label: 'Dark', value: 'dark'},
          {label: 'Light', value: 'light'},
        ]}
        onSelect={(v) => { selected = v; }}
      />,
    );
    stdin.write('\r');
    expect(selected).toBe('dark');
  });

  it('renders disabled options as grayed out and non-selectable', () => {
    let selected = '';
    const {lastFrame, stdin} = render(
      <StepSelector
        options={[
          {label: 'Claude Code', value: 'claude-code'},
          {label: 'Codex (coming soon)', value: 'codex', disabled: true},
        ]}
        onSelect={(v) => { selected = v; }}
      />,
    );
    // Move down to disabled item
    stdin.write('\u001B[B');
    // Try to select — should not fire
    stdin.write('\r');
    expect(selected).toBe('');
    expect(lastFrame()!).toContain('coming soon');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/setup/components/__tests__/StepSelector.test.tsx`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```tsx
import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';

export type SelectorOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

type Props = {
  options: SelectorOption[];
  onSelect: (value: string) => void;
  isActive?: boolean;
};

export default function StepSelector({options, onSelect, isActive = true}: Props) {
  const [cursor, setCursor] = useState(0);

  useInput(
    (input, key) => {
      if (key.downArrow) {
        setCursor(prev => Math.min(prev + 1, options.length - 1));
      } else if (key.upArrow) {
        setCursor(prev => Math.max(prev - 1, 0));
      } else if (key.return) {
        const opt = options[cursor];
        if (opt && !opt.disabled) {
          onSelect(opt.value);
        }
      }
    },
    {isActive},
  );

  return (
    <Box flexDirection="column">
      {options.map((opt, i) => {
        const isCursor = i === cursor;
        const prefix = isCursor ? '❯' : ' ';
        return (
          <Text
            key={opt.value}
            dimColor={opt.disabled}
            color={isCursor && !opt.disabled ? 'cyan' : undefined}
          >
            {prefix} {opt.label}
          </Text>
        );
      })}
    </Box>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/setup/components/__tests__/StepSelector.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add source/setup/
git commit -m "feat(setup): add StepSelector component with disabled option support"
```

---

### Task 3: Create StepStatus component

**Files:**
- Create: `source/setup/components/StepStatus.tsx`
- Test: `source/setup/components/__tests__/StepStatus.test.tsx`

**Step 1: Write the failing test**

```typescript
import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import StepStatus from '../StepStatus.js';

describe('StepStatus', () => {
  it('renders success state with checkmark', () => {
    const {lastFrame} = render(
      <StepStatus status="success" message="Theme set to Dark" />,
    );
    expect(lastFrame()!).toContain('✓');
    expect(lastFrame()!).toContain('Theme set to Dark');
  });

  it('renders error state with cross', () => {
    const {lastFrame} = render(
      <StepStatus status="error" message="Claude Code not found" />,
    );
    expect(lastFrame()!).toContain('✗');
    expect(lastFrame()!).toContain('Claude Code not found');
  });

  it('renders verifying state with spinner text', () => {
    const {lastFrame} = render(
      <StepStatus status="verifying" message="Checking..." />,
    );
    expect(lastFrame()!).toContain('Checking...');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/setup/components/__tests__/StepStatus.test.tsx`
Expected: FAIL

**Step 3: Write minimal implementation**

```tsx
import React from 'react';
import {Text, Box} from 'ink';

type Props = {
  status: 'verifying' | 'success' | 'error';
  message: string;
};

export default function StepStatus({status, message}: Props) {
  const icon =
    status === 'success' ? '✓' : status === 'error' ? '✗' : '⠋';
  const color =
    status === 'success' ? 'green' : status === 'error' ? 'red' : 'yellow';

  return (
    <Box>
      <Text color={color}>{icon} </Text>
      <Text color={color}>{message}</Text>
    </Box>
  );
}
```

**Step 4: Run test, commit**

Run: `npx vitest run source/setup/components/__tests__/StepStatus.test.tsx`

```bash
git add source/setup/components/
git commit -m "feat(setup): add StepStatus component"
```

---

### Task 4: Create useSetupState hook

**Files:**
- Create: `source/setup/useSetupState.ts`
- Test: `source/setup/__tests__/useSetupState.test.ts`

**Step 1: Write the failing test**

```typescript
import {describe, it, expect} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useSetupState} from '../useSetupState.js';

describe('useSetupState', () => {
  it('starts at step 0 in selecting state', () => {
    const {result} = renderHook(() => useSetupState());
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.stepState).toBe('selecting');
  });

  it('transitions to verifying then success', () => {
    const {result} = renderHook(() => useSetupState());
    act(() => result.current.startVerifying());
    expect(result.current.stepState).toBe('verifying');
    act(() => result.current.markSuccess());
    expect(result.current.stepState).toBe('success');
  });

  it('advances to next step', () => {
    const {result} = renderHook(() => useSetupState());
    act(() => result.current.startVerifying());
    act(() => result.current.markSuccess());
    act(() => result.current.advance());
    expect(result.current.stepIndex).toBe(1);
    expect(result.current.stepState).toBe('selecting');
  });

  it('transitions to error and allows retry', () => {
    const {result} = renderHook(() => useSetupState());
    act(() => result.current.startVerifying());
    act(() => result.current.markError());
    expect(result.current.stepState).toBe('error');
    act(() => result.current.retry());
    expect(result.current.stepState).toBe('selecting');
  });

  it('reports isComplete when past last step', () => {
    const {result} = renderHook(() => useSetupState());
    // Step 0
    act(() => { result.current.startVerifying(); result.current.markSuccess(); result.current.advance(); });
    // Step 1
    act(() => { result.current.startVerifying(); result.current.markSuccess(); result.current.advance(); });
    // Step 2
    act(() => { result.current.startVerifying(); result.current.markSuccess(); result.current.advance(); });
    expect(result.current.isComplete).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/setup/__tests__/useSetupState.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
import {useState, useCallback} from 'react';

const TOTAL_STEPS = 3;

export type StepState = 'selecting' | 'verifying' | 'success' | 'error';

export function useSetupState() {
  const [stepIndex, setStepIndex] = useState(0);
  const [stepState, setStepState] = useState<StepState>('selecting');

  const startVerifying = useCallback(() => setStepState('verifying'), []);
  const markSuccess = useCallback(() => setStepState('success'), []);
  const markError = useCallback(() => setStepState('error'), []);
  const retry = useCallback(() => setStepState('selecting'), []);

  const advance = useCallback(() => {
    setStepIndex(prev => prev + 1);
    setStepState('selecting');
  }, []);

  return {
    stepIndex,
    stepState,
    isComplete: stepIndex >= TOTAL_STEPS,
    startVerifying,
    markSuccess,
    markError,
    retry,
    advance,
  };
}
```

**Step 4: Run test, commit**

Run: `npx vitest run source/setup/__tests__/useSetupState.test.ts`

```bash
git add source/setup/
git commit -m "feat(setup): add useSetupState hook with step state machine"
```

---

### Task 5: Create ThemeStep component

**Files:**
- Create: `source/setup/steps/ThemeStep.tsx`
- Test: `source/setup/steps/__tests__/ThemeStep.test.tsx`

**Step 1: Write the failing test**

```typescript
import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect} from 'vitest';
import ThemeStep from '../ThemeStep.js';

describe('ThemeStep', () => {
  it('renders Dark and Light options', () => {
    const {lastFrame} = render(
      <ThemeStep onComplete={() => {}} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Dark');
    expect(frame).toContain('Light');
  });

  it('calls onComplete with selected theme on Enter', () => {
    let result = '';
    const {stdin} = render(
      <ThemeStep onComplete={(v) => { result = v; }} />,
    );
    stdin.write('\r'); // Select first option (Dark)
    expect(result).toBe('dark');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/setup/steps/__tests__/ThemeStep.test.tsx`

**Step 3: Write minimal implementation**

```tsx
import React from 'react';
import {Box, Text} from 'ink';
import StepSelector from '../components/StepSelector.js';

type Props = {
  onComplete: (theme: string) => void;
};

export default function ThemeStep({onComplete}: Props) {
  return (
    <Box flexDirection="column">
      <Text bold>Select theme:</Text>
      <StepSelector
        options={[
          {label: 'Dark', value: 'dark'},
          {label: 'Light', value: 'light'},
        ]}
        onSelect={onComplete}
      />
    </Box>
  );
}
```

**Step 4: Run test, commit**

Run: `npx vitest run source/setup/steps/__tests__/ThemeStep.test.tsx`

```bash
git add source/setup/steps/
git commit -m "feat(setup): add ThemeStep component"
```

---

### Task 6: Create HarnessStep component

**Files:**
- Create: `source/setup/steps/HarnessStep.tsx`
- Test: `source/setup/steps/__tests__/HarnessStep.test.tsx`

**Step 1: Write the failing test**

```typescript
import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi} from 'vitest';
import HarnessStep from '../HarnessStep.js';

vi.mock('../../../utils/detectClaudeVersion.js', () => ({
  detectClaudeVersion: vi.fn(() => '2.5.0'),
}));

describe('HarnessStep', () => {
  it('renders Claude Code option and Codex as disabled', () => {
    const {lastFrame} = render(
      <HarnessStep onComplete={() => {}} onError={() => {}} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Claude Code');
    expect(frame).toContain('Codex');
  });

  it('calls onComplete with harness and version after selection', async () => {
    let result = '';
    const {stdin} = render(
      <HarnessStep
        onComplete={(v) => { result = v; }}
        onError={() => {}}
      />,
    );
    stdin.write('\r'); // Select Claude Code
    // Wait for async verification
    await vi.waitFor(() => {
      expect(result).toBe('claude-code');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/setup/steps/__tests__/HarnessStep.test.tsx`

**Step 3: Write minimal implementation**

```tsx
import React, {useState, useCallback} from 'react';
import {Box, Text} from 'ink';
import StepSelector from '../components/StepSelector.js';
import StepStatus from '../components/StepStatus.js';
import {detectClaudeVersion} from '../../utils/detectClaudeVersion.js';

type Props = {
  onComplete: (harness: string) => void;
  onError: (message: string) => void;
};

export default function HarnessStep({onComplete, onError}: Props) {
  const [status, setStatus] = useState<'selecting' | 'verifying' | 'success' | 'error'>('selecting');
  const [message, setMessage] = useState('');

  const handleSelect = useCallback(
    (value: string) => {
      if (value !== 'claude-code') return;
      setStatus('verifying');
      // Run detection asynchronously to not block render
      setTimeout(() => {
        const version = detectClaudeVersion();
        if (version) {
          setMessage(`Claude Code v${version} detected`);
          setStatus('success');
          onComplete('claude-code');
        } else {
          setMessage('Claude Code not found. Install from https://docs.anthropic.com/en/docs/claude-code');
          setStatus('error');
          onError('Claude Code not found');
        }
      }, 0);
    },
    [onComplete, onError],
  );

  return (
    <Box flexDirection="column">
      <Text bold>Select harness:</Text>
      {status === 'selecting' && (
        <StepSelector
          options={[
            {label: 'Claude Code', value: 'claude-code'},
            {label: 'Codex (coming soon)', value: 'codex', disabled: true},
          ]}
          onSelect={handleSelect}
        />
      )}
      {(status === 'verifying' || status === 'success' || status === 'error') && (
        <StepStatus status={status} message={message || 'Verifying Claude Code...'} />
      )}
    </Box>
  );
}
```

**Step 4: Run test, commit**

Run: `npx vitest run source/setup/steps/__tests__/HarnessStep.test.tsx`

```bash
git add source/setup/steps/
git commit -m "feat(setup): add HarnessStep with Claude Code verification"
```

---

### Task 7: Create WorkflowStep component

**Files:**
- Create: `source/setup/steps/WorkflowStep.tsx`
- Test: `source/setup/steps/__tests__/WorkflowStep.test.tsx`

**Step 1: Write the failing test**

```typescript
import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi} from 'vitest';
import WorkflowStep from '../WorkflowStep.js';

vi.mock('../../../workflows/index.js', () => ({
  installWorkflow: vi.fn(() => 'e2e-test-builder'),
  resolveWorkflow: vi.fn(() => ({ name: 'e2e-test-builder', plugins: [] })),
}));

vi.mock('../../../plugins/marketplace.js', () => ({
  resolveMarketplaceWorkflow: vi.fn(() => '/tmp/workflow.json'),
  isMarketplaceRef: vi.fn(() => true),
}));

describe('WorkflowStep', () => {
  it('renders workflow options including skip', () => {
    const {lastFrame} = render(
      <WorkflowStep onComplete={() => {}} onError={() => {}} onSkip={() => {}} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('e2e-test-builder');
    expect(frame).toContain('None');
  });

  it('calls onSkip when None is selected', () => {
    let skipped = false;
    const {stdin} = render(
      <WorkflowStep
        onComplete={() => {}}
        onError={() => {}}
        onSkip={() => { skipped = true; }}
      />,
    );
    // Move down to "None" (3rd option: e2e, bug-triage disabled, None)
    stdin.write('\u001B[B'); // down
    stdin.write('\u001B[B'); // down
    stdin.write('\r');
    expect(skipped).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/setup/steps/__tests__/WorkflowStep.test.tsx`

**Step 3: Write minimal implementation**

```tsx
import React, {useState, useCallback} from 'react';
import {Box, Text} from 'ink';
import StepSelector from '../components/StepSelector.js';
import StepStatus from '../components/StepStatus.js';
import {installWorkflow, resolveWorkflow} from '../../workflows/index.js';

// Marketplace ref for the e2e-test-builder workflow
const E2E_WORKFLOW_REF = 'e2e-test-builder@lespaceman/athena-plugin-marketplace';

type Props = {
  onComplete: (workflowName: string) => void;
  onError: (message: string) => void;
  onSkip: () => void;
};

export default function WorkflowStep({onComplete, onError, onSkip}: Props) {
  const [status, setStatus] = useState<'selecting' | 'verifying' | 'success' | 'error'>('selecting');
  const [message, setMessage] = useState('');

  const handleSelect = useCallback(
    (value: string) => {
      if (value === 'none') {
        onSkip();
        return;
      }
      setStatus('verifying');
      setTimeout(() => {
        try {
          const name = installWorkflow(E2E_WORKFLOW_REF);
          // Verify it resolves
          resolveWorkflow(name);
          setMessage(`Workflow "${name}" installed`);
          setStatus('success');
          onComplete(name);
        } catch (err) {
          const msg = (err as Error).message;
          setMessage(`Installation failed: ${msg}`);
          setStatus('error');
          onError(msg);
        }
      }, 0);
    },
    [onComplete, onError, onSkip],
  );

  return (
    <Box flexDirection="column">
      <Text bold>Select workflow to install:</Text>
      {status === 'selecting' && (
        <StepSelector
          options={[
            {label: 'e2e-test-builder', value: 'e2e-test-builder'},
            {label: 'bug-triage (coming soon)', value: 'bug-triage', disabled: true},
            {label: 'None — configure later', value: 'none'},
          ]}
          onSelect={handleSelect}
        />
      )}
      {(status === 'verifying' || status === 'success' || status === 'error') && (
        <StepStatus status={status} message={message || 'Installing workflow...'} />
      )}
    </Box>
  );
}
```

**Step 4: Run test, commit**

Run: `npx vitest run source/setup/steps/__tests__/WorkflowStep.test.tsx`

```bash
git add source/setup/steps/
git commit -m "feat(setup): add WorkflowStep with marketplace install and verification"
```

---

### Task 8: Create SetupWizard orchestrator

**Files:**
- Create: `source/setup/SetupWizard.tsx`
- Test: `source/setup/__tests__/SetupWizard.test.tsx`

**Step 1: Write the failing test**

```typescript
import React from 'react';
import {render} from 'ink-testing-library';
import {describe, it, expect, vi} from 'vitest';
import SetupWizard from '../SetupWizard.js';
import {ThemeProvider} from '../../theme/index.js';
import {darkTheme} from '../../theme/index.js';

vi.mock('../../utils/detectClaudeVersion.js', () => ({
  detectClaudeVersion: vi.fn(() => '2.5.0'),
}));
vi.mock('../../workflows/index.js', () => ({
  installWorkflow: vi.fn(() => 'e2e-test-builder'),
  resolveWorkflow: vi.fn(() => ({ name: 'e2e-test-builder', plugins: [] })),
}));

describe('SetupWizard', () => {
  it('renders the first step (theme selection)', () => {
    const {lastFrame} = render(
      <ThemeProvider value={darkTheme}>
        <SetupWizard onComplete={() => {}} />
      </ThemeProvider>,
    );
    expect(lastFrame()!).toContain('Select theme');
    expect(lastFrame()!).toContain('Dark');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/setup/__tests__/SetupWizard.test.tsx`

**Step 3: Write minimal implementation**

```tsx
import React, {useState, useCallback} from 'react';
import {Box, Text} from 'ink';
import {useSetupState} from './useSetupState.js';
import ThemeStep from './steps/ThemeStep.js';
import HarnessStep from './steps/HarnessStep.js';
import WorkflowStep from './steps/WorkflowStep.js';
import StepStatus from './components/StepStatus.js';
import {writeGlobalConfig} from '../plugins/config.js';

type SetupResult = {
  theme: string;
  harness?: string;
  workflow?: string;
};

type Props = {
  onComplete: (result: SetupResult) => void;
};

export default function SetupWizard({onComplete}: Props) {
  const {stepIndex, stepState, isComplete, startVerifying, markSuccess, markError, retry, advance} = useSetupState();
  const [result, setResult] = useState<SetupResult>({theme: 'dark'});

  // Step completion handlers
  const handleThemeComplete = useCallback((theme: string) => {
    setResult(prev => ({...prev, theme}));
    markSuccess();
  }, [markSuccess]);

  const handleThemeAdvance = useCallback(() => {
    advance();
  }, [advance]);

  const handleHarnessComplete = useCallback((harness: string) => {
    setResult(prev => ({...prev, harness}));
    markSuccess();
  }, [markSuccess]);

  const handleWorkflowComplete = useCallback((workflow: string) => {
    setResult(prev => ({...prev, workflow}));
    markSuccess();
  }, [markSuccess]);

  const handleWorkflowSkip = useCallback(() => {
    markSuccess();
  }, [markSuccess]);

  // Auto-advance on success after short delay (for user to see checkmark)
  React.useEffect(() => {
    if (stepState === 'success') {
      const timer = setTimeout(() => {
        if (!isComplete) {
          advance();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [stepState, advance, isComplete]);

  // Write config and notify parent on completion
  React.useEffect(() => {
    if (isComplete) {
      writeGlobalConfig({
        setupComplete: true,
        theme: result.theme,
        harness: result.harness,
        workflow: result.workflow,
      });
      onComplete(result);
    }
  }, [isComplete, result, onComplete]);

  const stepLabels = ['Theme', 'Harness', 'Workflow'];

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>athena-cli Setup</Text>
      <Text dimColor>Step {Math.min(stepIndex + 1, 3)} of 3 — {stepLabels[stepIndex] ?? 'Complete'}</Text>
      <Box marginTop={1} flexDirection="column">
        {stepIndex === 0 && stepState === 'selecting' && (
          <ThemeStep onComplete={handleThemeComplete} />
        )}
        {stepIndex === 0 && stepState === 'success' && (
          <StepStatus status="success" message={`Theme: ${result.theme}`} />
        )}

        {stepIndex === 1 && (stepState === 'selecting' || stepState === 'verifying' || stepState === 'success' || stepState === 'error') && (
          <HarnessStep
            onComplete={handleHarnessComplete}
            onError={() => markError()}
          />
        )}
        {stepIndex === 1 && stepState === 'error' && (
          <Text color="yellow">Press 'r' to retry</Text>
        )}

        {stepIndex === 2 && (stepState === 'selecting' || stepState === 'verifying' || stepState === 'success' || stepState === 'error') && (
          <WorkflowStep
            onComplete={handleWorkflowComplete}
            onError={() => markError()}
            onSkip={handleWorkflowSkip}
          />
        )}
      </Box>
    </Box>
  );
}
```

**Step 4: Run test, commit**

Run: `npx vitest run source/setup/__tests__/SetupWizard.test.tsx`

```bash
git add source/setup/
git commit -m "feat(setup): add SetupWizard orchestrator component"
```

---

### Task 9: Add `setup` AppPhase to app.tsx

**Files:**
- Modify: `source/app.tsx:56-58` (AppPhase type)
- Modify: `source/app.tsx:700-781` (App component)

**Step 1: Update AppPhase type**

At line 56, add the `setup` phase:

```typescript
type AppPhase =
  | {type: 'setup'}
  | {type: 'session-select'}
  | {type: 'main'; initialSessionId?: string};
```

**Step 2: Add setup phase rendering in App component**

Import SetupWizard at the top of app.tsx:

```typescript
import SetupWizard from './setup/SetupWizard.js';
```

In the `App` component (around line 717-720), update the initial phase logic:

```typescript
const initialPhase: AppPhase = showSetup
  ? {type: 'setup'}
  : showSessionPicker
    ? {type: 'session-select'}
    : {type: 'main', initialSessionId};
```

Add `showSetup` to the Props type:

```typescript
type Props = {
  // ...existing fields
  showSetup?: boolean;
};
```

Add the setup phase render branch before the session-select branch (around line 736):

```typescript
if (phase.type === 'setup') {
  return (
    <ThemeProvider value={theme}>
      <SetupWizard
        onComplete={(result) => {
          // Transition to main app with new theme
          setPhase({type: 'main'});
        }}
      />
    </ThemeProvider>
  );
}
```

**Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add source/app.tsx
git commit -m "feat(app): add setup AppPhase with SetupWizard rendering"
```

---

### Task 10: Add first-run detection and `setup` subcommand to cli.tsx

**Files:**
- Modify: `source/cli.tsx`

**Step 1: Add first-run detection**

After line 119 (after `readGlobalConfig()`), add:

```typescript
// Detect first run or 'setup' subcommand
const isSetupCommand = cli.input[0] === 'setup';
const isFirstRun = !globalConfig.setupComplete && !fs.existsSync(
  path.join(os.homedir(), '.config', 'athena', 'config.json'),
);
const showSetup = isSetupCommand || isFirstRun;
```

Add the required imports at the top:

```typescript
import fs from 'node:fs';
import os from 'node:os';
```

**Step 2: Pass showSetup to App**

At the `render(<App ...>)` call (around line 224), add:

```typescript
showSetup={showSetup}
```

**Step 3: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS

**Step 4: Commit**

```bash
git add source/cli.tsx
git commit -m "feat(cli): add first-run detection and setup subcommand"
```

---

### Task 11: Create `/setup` slash command

**Files:**
- Create: `source/commands/builtins/setup.ts`
- Modify: `source/commands/builtins/index.ts`

**Step 1: Create the command**

```typescript
import {type UICommand} from '../types.js';

const setup: UICommand = {
  name: 'setup',
  description: 'Re-run the setup wizard',
  category: 'ui',
  execute: (ctx) => {
    // Signal the App to transition to setup phase.
    // We use showSessions() pattern — add showSetup() to UICommandContext.
    ctx.showSetup();
  },
};

export default setup;
```

**Step 2: Add `showSetup` to UICommandContext**

In `source/commands/types.ts`, add to `UICommandContext`:

```typescript
export type UICommandContext = {
  // ...existing fields
  showSetup: () => void;
};
```

**Step 3: Register in builtins/index.ts**

```typescript
import setup from './setup.js';
// In registerBuiltins():
register(setup);
```

**Step 4: Wire up in app.tsx**

In the `executeCommand` call (around line 301-327), add `showSetup` to the `ui` context:

```typescript
ui: {
  // ...existing fields
  showSetup: () => setPhase({type: 'setup'}),
},
```

You'll need to add `setPhase` to the `AppContent` props or lift the phase state management.

Since `setPhase` lives in `App` (parent), add `onShowSetup` callback prop to `AppContent`:

```typescript
// In App component:
const handleShowSetup = useCallback(() => {
  setPhase({type: 'setup'});
}, []);

// Pass to AppContent:
<AppContent
  ...
  onShowSetup={handleShowSetup}
/>

// In AppContent, add to props and wire into executeCommand context:
showSetup: onShowSetup,
```

**Step 5: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS

**Step 6: Commit**

```bash
git add source/commands/builtins/setup.ts source/commands/builtins/index.ts source/commands/types.ts source/app.tsx
git commit -m "feat(commands): add /setup slash command with phase transition"
```

---

### Task 12: Run full test suite and lint

**Files:** None (verification only)

**Step 1: Run all tests**

Run: `npm test`
Expected: ALL PASS

**Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

**Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Fix any issues found, then commit**

```bash
git add -A
git commit -m "fix: address lint and test issues from setup wizard integration"
```

---

### Task 13: Manual smoke test

**Files:** None

**Step 1: Test first-run**

Delete global config to simulate first run:
```bash
mv ~/.config/athena/config.json ~/.config/athena/config.json.bak
npm run start
```
Expected: Setup wizard launches automatically

**Step 2: Test subcommand**

```bash
npm run build && node dist/cli.js setup
```
Expected: Setup wizard launches

**Step 3: Restore config**

```bash
mv ~/.config/athena/config.json.bak ~/.config/athena/config.json
```
