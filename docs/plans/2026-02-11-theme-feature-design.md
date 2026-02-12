# Theme Feature Design

## Problem

athena-cli hardcodes ~30 color values (cyan, yellow, green, etc.) across components. These are optimized for dark terminal backgrounds and become unreadable on light terminals.

## Solution

A semantic color token system with two built-in themes (`dark`, `light`), delivered via React context. Selected via `--theme` CLI flag or config file.

## Theme Type

```ts
export type ThemeName = 'dark' | 'light';

export type Theme = {
	name: ThemeName;
	border: string;
	text: string;
	textMuted: string;
	textInverse: string;
	status: {
		success: string; // completed, allowed, passthrough
		error: string; // failed, blocked, denied
		warning: string; // waiting, moderate risk
		info: string; // working, active, READ tier
		neutral: string; // idle, pending, disabled
	};
	accent: string; // primary brand accent
	accentSecondary: string; // subagent highlights
	contextBar: {
		low: string;
		medium: string;
		high: string;
	};
	userMessage: {
		text: string; // user message foreground
		background: string; // user message background
	};
};
```

## Theme Definitions

**Dark** (current behavior): cyan accent, standard terminal colors.

**Light**: blue accent (cyan invisible on white), dark goldenrod for warnings (yellow invisible on white), dark magenta for secondary.

| Token             | Dark    | Light   |
| ----------------- | ------- | ------- |
| border            | cyan    | blue    |
| text              | white   | black   |
| textMuted         | gray    | gray    |
| textInverse       | black   | white   |
| status.success    | green   | green   |
| status.error      | red     | red     |
| status.warning    | yellow  | #B8860B |
| status.info       | cyan    | blue    |
| status.neutral    | gray    | gray    |
| accent            | cyan    | blue    |
| accentSecondary   | magenta | #8B008B |
| contextBar.low    | green   | green   |
| contextBar.medium | #FF8C00 | #B8860B |
| contextBar.high   | red     | red     |

## Delivery Mechanism

- `--theme dark|light` CLI flag (default: `dark`)
- Config file support: `{ "theme": "light" }` in `~/.config/athena/config.json` or `{projectDir}/.athena/config.json`
- CLI flag overrides config
- React context: `<ThemeProvider>` wraps app tree, components use `useTheme()` hook

## File Structure

```
source/theme/
  types.ts          — Theme, ThemeName types
  themes.ts         — darkTheme, lightTheme, resolveTheme()
  ThemeContext.tsx   — ThemeProvider, useTheme()
  index.ts          — barrel export
```

## Migration Strategy

Color config objects (`STATUS_COLORS`, `STATE_COLORS`, `RISK_TIER_CONFIG`) become functions that accept a `Theme` parameter. ~20 component files get `useTheme()` at the top and replace inline color strings with semantic tokens.

## Implementation Steps

1. Create `source/theme/` module (types, themes, context, barrel)
2. Add `--theme` CLI flag + config file support
3. Wire `<ThemeProvider>` in `app.tsx`
4. Migrate color config objects (hookEventUtils, Header/constants, TaskList, riskTier, formatters)
5. Migrate component files — mechanical useTheme() + token replacement
6. Update tests (color assertions, add theme context wrapper)
7. Lint + typecheck

## Explicitly Out of Scope

- Custom/user-defined themes beyond dark/light
- Per-component theme overrides
- Runtime theme switching (restart required)
- COLORFGBG auto-detection
