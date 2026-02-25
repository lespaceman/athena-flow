# Athena CLI — Theme Definitions

Actual hex values for all three themes. Copy into `theme/themes.ts`.

---

## Dark Theme (default)

The primary design target. Assumes a dark terminal background (#0d1117 or similar).

```ts
export const darkTheme: Theme = {
	name: 'dark',

	// ── Text hierarchy ──────────────────────────────────────
	text: '#c9d1d9', // Primary text. Warm gray, not pure white.
	textMuted: '#484f58', // Dim text. Paths, labels, happy-path events.
	textInverse: '#0d1117', // Text on colored backgrounds.

	// ── Accent ──────────────────────────────────────────────
	accent: '#58a6ff', // Blue. Focus bar, branding, selection, links.
	accentSecondary: '#bc8cff', // Soft purple. Permission events.

	// ── Status ──────────────────────────────────────────────
	status: {
		success: '#3fb950', // Green. Completion, done glyphs.
		error: '#f85149', // Red. Failures, blocks, Tool Fail.
		warning: '#d29922', // Amber. Active stage, zero-result tint, caution.
		info: '#58a6ff', // Blue. Agent messages, Run OK.
		working: '#d29922', // Amber. Spinner state (same as warning).
		neutral: '#8b949e', // Mid gray. Idle state, neutral badges.
	},

	// ── Context bar ─────────────────────────────────────────
	contextBar: {
		low: '#3fb950', // Green.  0–50% budget used.
		medium: '#d29922', // Amber. 50–80% budget used.
		high: '#f85149', // Red.   80–100% budget used.
	},

	// ── Dialog borders ──────────────────────────────────────
	dialog: {
		borderPermission: '#d29922', // Amber border for permission prompts.
		borderQuestion: '#58a6ff', // Blue border for question prompts.
	},

	// ── Input ───────────────────────────────────────────────
	inputPrompt: '#58a6ff', // Blue "input>" prefix.

	// ── User messages ───────────────────────────────────────
	userMessage: {
		text: '#c9d1d9', // Same as primary text.
		background: '#161b22', // Slightly lifted from terminal bg.
		border: '#30363d', // Subtle border.
	},
};
```

---

## Light Theme

For light terminal backgrounds (#ffffff or #f6f8fa).

```ts
export const lightTheme: Theme = {
	name: 'light',

	// ── Text hierarchy ──────────────────────────────────────
	text: '#1f2328', // Near-black. Strong contrast.
	textMuted: '#656d76', // Medium gray. Same role as dark textMuted.
	textInverse: '#ffffff', // White on colored backgrounds.

	// ── Accent ──────────────────────────────────────────────
	accent: '#0969da', // Darker blue for light backgrounds.
	accentSecondary: '#8250df', // Purple, darkened for readability.

	// ── Status ──────────────────────────────────────────────
	status: {
		success: '#1a7f37', // Dark green. Readable on white.
		error: '#cf222e', // Dark red.
		warning: '#9a6700', // Dark amber.
		info: '#0969da', // Dark blue. Matches accent.
		working: '#9a6700', // Dark amber.
		neutral: '#656d76', // Mid gray.
	},

	// ── Context bar ─────────────────────────────────────────
	contextBar: {
		low: '#1a7f37',
		medium: '#9a6700',
		high: '#cf222e',
	},

	// ── Dialog borders ──────────────────────────────────────
	dialog: {
		borderPermission: '#9a6700',
		borderQuestion: '#0969da',
	},

	// ── Input ───────────────────────────────────────────────
	inputPrompt: '#0969da',

	// ── User messages ───────────────────────────────────────
	userMessage: {
		text: '#1f2328',
		background: '#f6f8fa',
		border: '#d0d7de',
	},
};
```

---

## High Contrast Theme

Maximum differentiation. For accessibility and bright-terminal users.

```ts
export const highContrastTheme: Theme = {
	name: 'high-contrast',

	// ── Text hierarchy ──────────────────────────────────────
	text: '#f0f6fc', // Near-white. Maximum brightness.
	textMuted: '#7d8590', // Brighter than dark theme's muted. Still readable.
	textInverse: '#010409', // Near-black.

	// ── Accent ──────────────────────────────────────────────
	accent: '#71b7ff', // Brighter blue. Punches through.
	accentSecondary: '#d2a8ff', // Bright purple.

	// ── Status ──────────────────────────────────────────────
	status: {
		success: '#56d364', // Bright green. Higher saturation.
		error: '#ff7b72', // Bright red. Softened for readability.
		warning: '#e3b341', // Bright amber.
		info: '#71b7ff', // Bright blue.
		working: '#e3b341', // Bright amber.
		neutral: '#9ea7b3', // Lighter gray.
	},

	// ── Context bar ─────────────────────────────────────────
	contextBar: {
		low: '#56d364',
		medium: '#e3b341',
		high: '#ff7b72',
	},

	// ── Dialog borders ──────────────────────────────────────
	dialog: {
		borderPermission: '#e3b341',
		borderQuestion: '#71b7ff',
	},

	// ── Input ───────────────────────────────────────────────
	inputPrompt: '#71b7ff',

	// ── User messages ───────────────────────────────────────
	userMessage: {
		text: '#f0f6fc',
		background: '#161b22',
		border: '#3d444d',
	},
};
```

---

## Visual Weight Ladder (dark theme, with actual values)

From loudest to quietest:

```
Level  Token                  Hex        What it looks like
─────────────────────────────────────────────────────────────
  1    status.error           #f85149    Bright red
  2    status.warning         #d29922    Warm amber
  3    status.info / accent   #58a6ff    Clean blue
  4    accentSecondary        #bc8cff    Soft purple
  5    status.neutral         #8b949e    Mid gray
  6    text                   #c9d1d9    Warm light gray (default)
  7    textMuted              #484f58    Dark gray
  8    chalk.dim(textMuted)   ~#2d333b   Near-invisible (computed)
```

Level 8 is not a token — it's the runtime result of `chalk.dim()` applied
to `textMuted`. It pushes things one step closer to the background. Used
for elapsed times on completed stages, lifecycle event summaries, and
minute separators.

---

## Design Rationale

**Why these specific values?**

The palette is derived from GitHub's Primer color system, which is battle-tested
for code-adjacent UIs on dark backgrounds. The values are adjusted for terminal
rendering (terminals quantize colors differently than browsers).

**Why warm grays (#c9d1d9) instead of cool whites (#e0e0e0)?**

Pure white and cool grays cause eye strain on dark backgrounds in prolonged
terminal sessions. The warm gray has a slight blue undertone that softens
without losing contrast. The WCAG contrast ratio of #c9d1d9 on #0d1117 is
~11:1, well above the 7:1 AAA threshold.

**Why is status.info the same as accent (#58a6ff)?**

Blue serves double duty: it's both the interactive accent (focus, links) and
the informational status (agent messages, run info). This is intentional —
blue is the "Claude is talking" color. It connects the agent's messages in
the feed with the selection state and branding. One color, one meaning.

**Why amber for both warning and working (#d29922)?**

Working and warning are both "pay attention, something is in progress."
The spinner glyph differentiates working from static warnings. Using the
same color avoids a fourth loud color in the hierarchy — three is enough
(red, amber, blue).

**Why is textMuted so dark (#484f58)?**

It needs to recede hard. The gap between text (#c9d1d9) and textMuted
(#484f58) is deliberate — it creates a strong two-tier system where
bright things are readable and dim things are ignorable. If textMuted
were lighter (#6e7681), the feed would feel muddy because everything
competes at the same level.
