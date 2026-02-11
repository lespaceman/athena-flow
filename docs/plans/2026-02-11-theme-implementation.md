# Theme Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add dark/light theme support so athena-cli is readable on any terminal background.

**Architecture:** A `Theme` type with semantic color tokens, two built-in themes (dark/light), delivered via React context. Components use `useTheme()` instead of hardcoded color strings. Selected via `--theme` CLI flag or config file.

**Tech Stack:** React context (Ink), TypeScript, vitest

**Design doc:** `docs/plans/2026-02-11-theme-feature-design.md`

---

### Task 1: Create theme types

**Files:**

- Create: `source/theme/types.ts`

**Step 1: Write the type definitions**

```ts
// source/theme/types.ts
export type ThemeName = 'dark' | 'light';

export type Theme = {
	name: ThemeName;
	border: string;
	text: string;
	textMuted: string;
	textInverse: string;
	status: {
		success: string;
		error: string;
		warning: string;
		info: string;
		neutral: string;
	};
	accent: string;
	accentSecondary: string;
	contextBar: {
		low: string;
		medium: string;
		high: string;
	};
	userMessage: {
		text: string;
		background: string;
	};
};
```

Note: `userMessage` is added to replace the hardcoded hex colors in `Message.tsx` (`#b0b0b0` and `#2d3748`).

**Step 2: Commit**

```bash
git add source/theme/types.ts
git commit -m "feat(theme): add Theme and ThemeName types"
```

---

### Task 2: Create theme definitions

**Files:**

- Create: `source/theme/themes.ts`
- Test: `source/theme/themes.test.ts`

**Step 1: Write the failing test**

```ts
// source/theme/themes.test.ts
import {describe, it, expect} from 'vitest';
import {darkTheme, lightTheme, resolveTheme} from './themes.js';

describe('themes', () => {
	it('darkTheme has all required tokens', () => {
		expect(darkTheme.name).toBe('dark');
		expect(darkTheme.accent).toBe('cyan');
		expect(darkTheme.status.success).toBe('green');
		expect(darkTheme.status.error).toBe('red');
		expect(darkTheme.status.warning).toBe('yellow');
		expect(darkTheme.status.info).toBe('cyan');
		expect(darkTheme.status.neutral).toBe('gray');
		expect(darkTheme.accentSecondary).toBe('magenta');
		expect(darkTheme.contextBar.medium).toBe('#FF8C00');
		expect(darkTheme.userMessage.text).toBe('#b0b0b0');
		expect(darkTheme.userMessage.background).toBe('#2d3748');
	});

	it('lightTheme avoids cyan and yellow (unreadable on light backgrounds)', () => {
		expect(lightTheme.name).toBe('light');
		expect(lightTheme.accent).not.toBe('cyan');
		expect(lightTheme.status.warning).not.toBe('yellow');
		expect(lightTheme.status.info).not.toBe('cyan');
	});

	it('resolveTheme returns dark by default', () => {
		expect(resolveTheme(undefined).name).toBe('dark');
		expect(resolveTheme('dark').name).toBe('dark');
	});

	it('resolveTheme returns light when requested', () => {
		expect(resolveTheme('light').name).toBe('light');
	});

	it('resolveTheme falls back to dark for invalid values', () => {
		expect(resolveTheme('neon').name).toBe('dark');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/theme/themes.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```ts
// source/theme/themes.ts
import {type Theme, type ThemeName} from './types.js';

export const darkTheme: Theme = {
	name: 'dark',
	border: 'cyan',
	text: 'white',
	textMuted: 'gray',
	textInverse: 'black',
	status: {
		success: 'green',
		error: 'red',
		warning: 'yellow',
		info: 'cyan',
		neutral: 'gray',
	},
	accent: 'cyan',
	accentSecondary: 'magenta',
	contextBar: {
		low: 'green',
		medium: '#FF8C00',
		high: 'red',
	},
	userMessage: {
		text: '#b0b0b0',
		background: '#2d3748',
	},
};

export const lightTheme: Theme = {
	name: 'light',
	border: 'blue',
	text: 'black',
	textMuted: 'gray',
	textInverse: 'white',
	status: {
		success: 'green',
		error: 'red',
		warning: '#B8860B',
		info: 'blue',
		neutral: 'gray',
	},
	accent: 'blue',
	accentSecondary: '#8B008B',
	contextBar: {
		low: 'green',
		medium: '#B8860B',
		high: 'red',
	},
	userMessage: {
		text: '#4a5568',
		background: '#edf2f7',
	},
};

const THEMES: Record<ThemeName, Theme> = {dark: darkTheme, light: lightTheme};

export function resolveTheme(name: string | undefined): Theme {
	if (name && name in THEMES) {
		return THEMES[name as ThemeName];
	}
	return darkTheme;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/theme/themes.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/theme/themes.ts source/theme/themes.test.ts
git commit -m "feat(theme): add dark and light theme definitions with resolveTheme"
```

---

### Task 3: Create ThemeContext and barrel export

**Files:**

- Create: `source/theme/ThemeContext.tsx`
- Create: `source/theme/index.ts`

**Step 1: Write the context**

```tsx
// source/theme/ThemeContext.tsx
import {createContext, useContext} from 'react';
import {type Theme} from './types.js';
import {darkTheme} from './themes.js';

const ThemeContext = createContext<Theme>(darkTheme);

export const ThemeProvider = ThemeContext.Provider;

export function useTheme(): Theme {
	return useContext(ThemeContext);
}
```

**Step 2: Write the barrel export**

```ts
// source/theme/index.ts
export {type Theme, type ThemeName} from './types.js';
export {darkTheme, lightTheme, resolveTheme} from './themes.js';
export {ThemeProvider, useTheme} from './ThemeContext.js';
```

**Step 3: Commit**

```bash
git add source/theme/ThemeContext.tsx source/theme/index.ts
git commit -m "feat(theme): add ThemeContext, useTheme hook, and barrel export"
```

---

### Task 4: Add --theme CLI flag and config support

**Files:**

- Modify: `source/cli.tsx` (add flag, resolve theme, pass to App)
- Modify: `source/app.tsx` (accept themeName prop, wrap with ThemeProvider)
- Modify: `source/plugins/config.ts` (add `theme` to AthenaConfig)

**Step 1: Add `theme` to AthenaConfig**

In `source/plugins/config.ts`:

- Add `theme?: string;` to the `AthenaConfig` type (line 19, after `model`)
- Add `theme: raw.theme` to the return in `readConfigFile` (line 68)

```ts
// AthenaConfig type becomes:
export type AthenaConfig = {
	plugins: string[];
	additionalDirectories: string[];
	model?: string;
	theme?: string;
};

// readConfigFile raw type adds: theme?: string;
// return adds: theme: raw.theme
```

**Step 2: Add --theme flag to cli.tsx**

In `source/cli.tsx`:

- Add to meow help text (after --verbose line): `--theme      Color theme: dark (default) or light`
- Add to flags object:

```ts
theme: {
	type: 'string',
	default: 'dark',
},
```

- After isolationPreset resolution (line 88), resolve the theme:

```ts
import {resolveTheme} from './theme/index.js';

// CLI flag overrides config
const themeName =
	cli.flags.theme !== 'dark'
		? cli.flags.theme
		: projectConfig.theme || globalConfig.theme || 'dark';
const theme = resolveTheme(themeName);
```

- Pass `theme` to the `<App>` component as a prop

**Step 3: Wire ThemeProvider in app.tsx**

In `source/app.tsx`:

- Add `theme` to the `Props` type: `theme: Theme;`
- Import `ThemeProvider` and `Theme` from `'./theme/index.js'`
- In the `App` component, wrap `<HookProvider>` with `<ThemeProvider value={theme}>`:

```tsx
// source/app.tsx — App component render
return (
	<ThemeProvider value={theme}>
		<HookProvider projectDir={projectDir} instanceId={instanceId}>
			<AppContent
				key={clearCount}
				{/* ...existing props... */}
			/>
		</HookProvider>
	</ThemeProvider>
);
```

- Pass `theme` through `AppContent` props too (for the error fallback Text components that can't use hooks)

**Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add source/cli.tsx source/app.tsx source/plugins/config.ts
git commit -m "feat(theme): add --theme CLI flag, config support, and ThemeProvider wiring"
```

---

### Task 5: Migrate color config objects

**Files:**

- Modify: `source/components/hookEventUtils.tsx` — `STATUS_COLORS` becomes theme-derived
- Modify: `source/components/Header/constants.ts` — `STATE_COLORS` becomes theme-derived
- Modify: `source/services/riskTier.ts` — `RISK_TIER_CONFIG.color` becomes theme-derived
- Modify: `source/utils/formatters.ts` — `getContextBarColor` becomes theme-derived

These config objects are currently static `Record` constants. They need to become functions that accept a `Theme` and return the same shape.

**Step 1: Migrate hookEventUtils.tsx**

Replace the `STATUS_COLORS` constant with a function:

```ts
import {type Theme} from '../theme/index.js';

// Before:
// export const STATUS_COLORS = { pending: 'yellow', passthrough: 'green', blocked: 'red', json_output: 'blue' };

// After:
export function getStatusColors(theme: Theme) {
	return {
		pending: theme.status.warning,
		passthrough: theme.status.success,
		blocked: theme.status.error,
		json_output: theme.status.info,
	} as const;
}
```

Keep `STATUS_SYMBOLS`, `SUBAGENT_SYMBOLS`, `RESPONSE_PREFIX` unchanged (they're not colors).

Replace `SUBAGENT_COLOR` constant:

```ts
// Before:
// export const SUBAGENT_COLOR = 'magenta';

// After: components will use theme.accentSecondary directly
// Remove SUBAGENT_COLOR export
```

Update `ResponseBlock` to accept a theme-derived error color:

```tsx
export function ResponseBlock({
	response,
	isFailed,
}: {
	response: string;
	isFailed: boolean;
}): React.ReactNode {
	// ResponseBlock uses 'red' for failed — this is theme.status.error
	// But it's a shared sub-component, so accept color via dimColor/color props
	// Actually: 'red' for errors is consistent across both themes, so this is fine as-is.
	// The dimColor for non-failed responses is also theme-agnostic.
	// No change needed here.
}
```

Update `StderrBlock` — uses `color="red"` which maps to `theme.status.error`. Since `red` is the same in both themes, no change needed.

**Step 2: Migrate Header/constants.ts**

```ts
import {type Theme} from '../../theme/index.js';
import type {ClaudeState} from '../../types/headerMetrics.js';

// Before:
// export const STATE_COLORS: Record<ClaudeState, string> = { idle: 'gray', working: 'cyan', ... };

// After:
export function getStateColors(theme: Theme): Record<ClaudeState, string> {
	return {
		idle: theme.status.neutral,
		working: theme.status.info,
		waiting: theme.status.warning,
		error: theme.status.error,
	};
}
```

`STATE_LABELS`, `LOGO_LINES`, `TIPS` stay unchanged.

**Step 3: Migrate riskTier.ts**

The `RISK_TIER_CONFIG` object has a `color` field. Change it to a function:

```ts
import {type Theme} from '../theme/index.js';

export type RiskTierConfig = {
	label: string;
	icon: string;
	color: (theme: Theme) => string;
	autoAllow?: boolean;
	requiresConfirmation?: boolean;
};

export const RISK_TIER_CONFIG: Record<RiskTier, RiskTierConfig> = {
	READ: {label: 'READ', icon: 'ℹ', color: t => t.status.info, autoAllow: true},
	MODERATE: {label: 'MODERATE', icon: '⚠', color: t => t.status.warning},
	WRITE: {label: 'WRITE', icon: '⚠', color: t => t.status.warning},
	DESTRUCTIVE: {
		label: 'DESTRUCTIVE',
		icon: '⛔',
		color: t => t.status.error,
		requiresConfirmation: true,
	},
};
```

**Step 4: Migrate formatters.ts**

```ts
import {type Theme} from '../theme/index.js';

// Before:
// export function getContextBarColor(percent: number | null): string { ... }

// After:
export function getContextBarColor(
	percent: number | null,
	theme: Theme,
): string {
	if (percent === null) return theme.status.neutral;
	if (percent < 60) return theme.contextBar.low;
	if (percent < 80) return theme.status.warning;
	if (percent < 95) return theme.contextBar.medium;
	return theme.contextBar.high;
}
```

**Step 5: Run typecheck to find all broken call sites**

Run: `npx tsc --noEmit`
Expected: FAIL — call sites still use old signatures. This is intentional — Task 6 fixes them.

**Step 6: Commit**

```bash
git add source/components/hookEventUtils.tsx source/components/Header/constants.ts source/services/riskTier.ts source/utils/formatters.ts
git commit -m "feat(theme): migrate color config objects to theme-derived functions"
```

---

### Task 6: Migrate components — Header group

**Files:**

- Modify: `source/components/Header/Header.tsx`
- Modify: `source/components/Header/StatusLine.tsx`
- Modify: `source/components/Header/StatsPanel.tsx`

**Step 1: Migrate Header.tsx**

```tsx
import {useTheme} from '../../theme/index.js';

// Inside component:
const theme = useTheme();

// Replace all color="cyan" with theme tokens:
// borderColor="cyan" → borderColor={theme.border}
// color="cyan" (logo lines) → color={theme.accent}
// color="cyan" (Welcome back) → color={theme.accent}
// borderColor="gray" (divider) → borderColor={theme.textMuted}
```

**Step 2: Migrate StatusLine.tsx**

```tsx
import {useTheme} from '../../theme/index.js';
import {getStateColors} from './constants.js';

// Inside component:
const theme = useTheme();
const stateColors = getStateColors(theme);

// Replace:
// STATE_COLORS[claudeState] → stateColors[claudeState]
// color={isServerRunning ? 'green' : 'red'} → color={isServerRunning ? theme.status.success : theme.status.error}
```

**Step 3: Migrate StatsPanel.tsx**

```tsx
import {useTheme} from '../../theme/index.js';

// Inside StatsPanel:
const theme = useTheme();

// borderColor="gray" → borderColor={theme.textMuted}
// color="cyan" (subagent type) → color={theme.accent}
```

**Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: May still fail (other call sites). Continue.

**Step 5: Commit**

```bash
git add source/components/Header/Header.tsx source/components/Header/StatusLine.tsx source/components/Header/StatsPanel.tsx
git commit -m "feat(theme): migrate Header, StatusLine, StatsPanel to useTheme"
```

---

### Task 7: Migrate components — Dialog group

**Files:**

- Modify: `source/components/PermissionDialog.tsx`
- Modify: `source/components/PermissionHeader.tsx`
- Modify: `source/components/KeybindingBar.tsx`
- Modify: `source/components/TypeToConfirm.tsx`
- Modify: `source/components/QuestionDialog.tsx`

**Step 1: Migrate PermissionDialog.tsx**

```tsx
import {useTheme} from '../theme/index.js';

const theme = useTheme();

// borderColor={tierConfig.color} → borderColor={tierConfig.color(theme)}
// color="magenta" (agent chain) → color={theme.accentSecondary}
```

**Step 2: Migrate PermissionHeader.tsx**

```tsx
import {useTheme} from '../theme/index.js';

const theme = useTheme();

// color={config.color} → color={config.color(theme)}
```

**Step 3: Migrate KeybindingBar.tsx**

```tsx
import {useTheme} from '../theme/index.js';

const theme = useTheme();

// color="green" (allow) → color={theme.status.success}
// color="red" (deny) → color={theme.status.error}
// color="blue" (server allow) → color={theme.status.info}
```

**Step 4: Migrate TypeToConfirm.tsx**

```tsx
import {useTheme} from '../theme/index.js';

const theme = useTheme();

// color="red" (prompt) → color={theme.status.error}
// color={isMatch ? 'green' : undefined} → color={isMatch ? theme.status.success : undefined}
```

**Step 5: Migrate QuestionDialog.tsx**

```tsx
import {useTheme} from '../theme/index.js';

const theme = useTheme();

// borderColor="cyan" → borderColor={theme.border}
// color="cyan" (active tab, header) → color={theme.accent}
// color="green" (answered tab) → color={theme.status.success}
// color="gray" (inactive tab) → color={theme.textMuted}
// color="yellow" (other prompt) → color={theme.status.warning}
```

**Step 6: Commit**

```bash
git add source/components/PermissionDialog.tsx source/components/PermissionHeader.tsx source/components/KeybindingBar.tsx source/components/TypeToConfirm.tsx source/components/QuestionDialog.tsx
git commit -m "feat(theme): migrate dialog components to useTheme"
```

---

### Task 8: Migrate components — Event renderers

**Files:**

- Modify: `source/components/ToolCallEvent.tsx`
- Modify: `source/components/ToolResultEvent.tsx`
- Modify: `source/components/SubagentEvent.tsx`
- Modify: `source/components/SubagentStopEvent.tsx`
- Modify: `source/components/GenericHookEvent.tsx`
- Modify: `source/components/AskUserQuestionEvent.tsx`
- Modify: `source/components/SessionEndEvent.tsx`

All event renderers follow the same pattern:

```tsx
import {useTheme} from '../theme/index.js';
import {getStatusColors, STATUS_SYMBOLS} from './hookEventUtils.js';

const theme = useTheme();
const statusColors = getStatusColors(theme);

// Replace: STATUS_COLORS[event.status] → statusColors[event.status]
// Replace: SUBAGENT_COLOR → theme.accentSecondary
```

**Step 1: Migrate ToolCallEvent.tsx and ToolResultEvent.tsx**

Both use `STATUS_COLORS[event.status]` — replace with `getStatusColors(theme)[event.status]`.

**Step 2: Migrate SubagentEvent.tsx**

- Replace `SUBAGENT_COLOR` with `theme.accentSecondary`
- Replace `STATUS_COLORS` usage in `ChildEvent` with `getStatusColors(theme)`
- Note: `ChildEvent` is a nested function component — it can call `useTheme()` directly

**Step 3: Migrate SubagentStopEvent.tsx**

- Replace `SUBAGENT_COLOR` with `theme.accentSecondary`

**Step 4: Migrate GenericHookEvent.tsx**

- Replace `STATUS_COLORS[event.status]` with `getStatusColors(theme)[event.status]`
- Replace `color="gray"` with `theme.textMuted`

**Step 5: Migrate AskUserQuestionEvent.tsx**

- Replace `STATUS_COLORS[event.status]` with `getStatusColors(theme)[event.status]`
- Replace `color="cyan"` with `theme.accent`
- Replace `color="green"` with `theme.status.success`

**Step 6: Migrate SessionEndEvent.tsx**

- Replace `STATUS_COLORS[event.status]` with `getStatusColors(theme)[event.status]`
- Replace `color="gray"` with `theme.textMuted`
- Replace `color="yellow"` with `theme.status.warning`
- Replace `color="cyan"` with `theme.accent`

**Step 7: Commit**

```bash
git add source/components/ToolCallEvent.tsx source/components/ToolResultEvent.tsx source/components/SubagentEvent.tsx source/components/SubagentStopEvent.tsx source/components/GenericHookEvent.tsx source/components/AskUserQuestionEvent.tsx source/components/SessionEndEvent.tsx
git commit -m "feat(theme): migrate all event renderer components to useTheme"
```

---

### Task 9: Migrate remaining components

**Files:**

- Modify: `source/components/Message.tsx`
- Modify: `source/components/StreamingResponse.tsx`
- Modify: `source/components/CommandInput.tsx`
- Modify: `source/components/CommandSuggestions.tsx`
- Modify: `source/components/OptionList.tsx`
- Modify: `source/components/MultiOptionList.tsx`
- Modify: `source/components/TaskList.tsx`
- Modify: `source/app.tsx` (error fallback components)

**Step 1: Migrate Message.tsx**

```tsx
import {useTheme} from '../theme/index.js';

const theme = useTheme();

// User message:
// color="#b0b0b0" backgroundColor="#2d3748" → color={theme.userMessage.text} backgroundColor={theme.userMessage.background}
// Assistant message:
// color="white" → color={theme.text}
```

**Step 2: Migrate StreamingResponse.tsx**

```tsx
import {useTheme} from '../theme/index.js';

const theme = useTheme();

// color="cyan" → color={theme.accent}
// color="white" → color={theme.text}
```

**Step 3: Migrate CommandInput.tsx**

```tsx
import {useTheme} from '../theme/index.js';

const theme = useTheme();

// promptColor: isCommandMode ? 'cyan' : 'gray' → isCommandMode ? theme.accent : theme.textMuted
// borderColor="gray" → borderColor={theme.textMuted}
```

**Step 4: Migrate CommandSuggestions.tsx**

```tsx
import {useTheme} from '../theme/index.js';

const theme = useTheme();

// color="cyan" (indicator, selected) → color={theme.accent}
// color="white" (unselected name) → color={theme.text}
```

**Step 5: Migrate OptionList.tsx and MultiOptionList.tsx**

```tsx
import {useTheme} from '../theme/index.js';

const theme = useTheme();

// color={isFocused ? 'cyan' : undefined} → color={isFocused ? theme.accent : undefined}
```

**Step 6: Migrate TaskList.tsx**

Replace local `STATE_COLORS` with theme-derived version:

```tsx
import {useTheme} from '../theme/index.js';

const theme = useTheme();

// STATE_COLORS becomes:
const stateColors = {
	completed: theme.status.success,
	in_progress: theme.status.info,
	pending: theme.status.neutral,
	failed: theme.status.error,
};
```

Also replace inline colors:

- `color="red"` (failed text) → `color={theme.status.error}`
- `color="green"` (all done) → `color={theme.status.success}`
- `color="cyan"` (in progress) → `color={theme.status.info}`

**Step 7: Migrate app.tsx error fallbacks**

The `PermissionErrorFallback` and `QuestionErrorFallback` components use `<Text color="red">`. These are class-less function components that can use `useTheme()`:

```tsx
const theme = useTheme();
// color="red" → color={theme.status.error}
```

Also replace the inline `<Text color="red">[Error rendering event]</Text>` strings in the JSX. These are inside JSX expressions (not components), so they can't call hooks. Since `red` is the same in both themes, these can stay as-is OR receive theme from the parent component scope.

**Step 8: Commit**

```bash
git add source/components/Message.tsx source/components/StreamingResponse.tsx source/components/CommandInput.tsx source/components/CommandSuggestions.tsx source/components/OptionList.tsx source/components/MultiOptionList.tsx source/components/TaskList.tsx source/app.tsx
git commit -m "feat(theme): migrate remaining components to useTheme"
```

---

### Task 10: Remove dead SUBAGENT_COLOR export

**Files:**

- Modify: `source/components/hookEventUtils.tsx` — remove `SUBAGENT_COLOR` export

After Task 8, nothing imports `SUBAGENT_COLOR` anymore. Remove it.

**Step 1: Remove the export**

Delete the line `export const SUBAGENT_COLOR = 'magenta';` from `hookEventUtils.tsx`.

**Step 2: Run typecheck to confirm nothing breaks**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add source/components/hookEventUtils.tsx
git commit -m "chore: remove unused SUBAGENT_COLOR constant"
```

---

### Task 11: Update existing tests

**Files:**

- Modify: `source/components/TaskList.test.tsx` — wrap renders in ThemeProvider if needed
- Modify: any other test files that assert on specific color strings

**Step 1: Check which tests fail**

Run: `npm test`
Expected: Some tests may fail if they render components that now call `useTheme()` without a provider. The default context value (`darkTheme`) should handle most cases, but tests that explicitly check color strings may need updating.

**Step 2: Fix failing tests**

For tests using `ink-testing-library`'s `render()`, the components should get `darkTheme` from the default context value. If any test wraps in a custom provider or checks for specific color output, update accordingly.

For `hookEventUtils` tests (if any exist), update to pass a theme to `getStatusColors(theme)`.

For `riskTier` tests, update `RISK_TIER_CONFIG[tier].color` references to `RISK_TIER_CONFIG[tier].color(darkTheme)`.

For `formatters` tests, update `getContextBarColor(percent)` calls to `getContextBarColor(percent, darkTheme)`.

**Step 3: Run full test suite**

Run: `npm test`
Expected: PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "test: update tests for theme-derived color functions"
```

---

### Task 12: Final verification

**Step 1: Run lint**

Run: `npm run lint`
Expected: PASS (fix any formatting issues)

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Run full test suite**

Run: `npm test`
Expected: PASS

**Step 4: Build**

Run: `npm run build`
Expected: PASS

**Step 5: Manual smoke test**

Run: `npm run start -- --theme=dark` and `npm run start -- --theme=light`
Verify: Colors look correct on your terminal background.

**Step 6: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: final lint and typecheck fixes for theme feature"
```

---

## Color Migration Reference

Quick-reference for the mechanical replacements across all files:

| Old (hardcoded)             | New (theme token)                  | Usage                                                                                      |
| --------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `'cyan'` (borders)          | `theme.border`                     | Header, QuestionDialog                                                                     |
| `'cyan'` (accent text)      | `theme.accent`                     | Logo, "Welcome", active tabs, question headers, streaming title, command mode, suggestions |
| `'magenta'`                 | `theme.accentSecondary`            | Subagent borders, agent chain context                                                      |
| `'green'` (success)         | `theme.status.success`             | Allow keybinding, passthrough, completed, answered tabs                                    |
| `'red'` (error)             | `theme.status.error`               | Deny keybinding, blocked, failed, error fallbacks, type-to-confirm                         |
| `'yellow'` (warning)        | `theme.status.warning`             | Pending, waiting, moderate risk, session end errors, other prompt                          |
| `'cyan'` (info/active)      | `theme.status.info`                | Working state, READ tier, in-progress tasks, json_output, server allow                     |
| `'gray'` (neutral)          | `theme.status.neutral`             | Idle state, pending tasks                                                                  |
| `'gray'` (muted text)       | `theme.textMuted`                  | Dividers, inactive text, status labels                                                     |
| `'white'`                   | `theme.text`                       | Primary text, assistant messages, streaming text                                           |
| `'blue'` (keybinding)       | `theme.status.info`                | Server-wide allow action                                                                   |
| `'#b0b0b0'`                 | `theme.userMessage.text`           | User message foreground                                                                    |
| `'#2d3748'`                 | `theme.userMessage.background`     | User message background                                                                    |
| `'#FF8C00'`                 | `theme.contextBar.medium`          | Context bar 80-95%                                                                         |
| `STATUS_COLORS[x]`          | `getStatusColors(theme)[x]`        | All event renderers                                                                        |
| `STATE_COLORS[x]`           | `getStateColors(theme)[x]`         | StatusLine                                                                                 |
| `SUBAGENT_COLOR`            | `theme.accentSecondary`            | SubagentEvent, SubagentStopEvent                                                           |
| `RISK_TIER_CONFIG[t].color` | `RISK_TIER_CONFIG[t].color(theme)` | PermissionDialog, PermissionHeader                                                         |
| `getContextBarColor(p)`     | `getContextBarColor(p, theme)`     | StatsPanel (if used)                                                                       |

## Files NOT changed (no color usage)

- `QuestionKeybindingBar.tsx` — only uses `dimColor` (theme-agnostic)
- `RawPayloadDetails.tsx` — only uses `dimColor`
- `ErrorBoundary.tsx` — class component, `color="red"` is same in both themes (leave as-is since it can't use hooks)
