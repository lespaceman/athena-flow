# Question Dialog UX Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply three UX polish improvements to the AskUserQuestion dialog: (1) dim non-focused option labels for better focus hierarchy, (2) add number key shortcuts (1-9) for direct option selection, and (3) add `1-N` keybinding hint to the QuestionKeybindingBar.

**Architecture:** All three changes are additive modifications to existing components (`OptionList`, `MultiOptionList`, `QuestionKeybindingBar`). Non-focused items get `dimColor` treatment. Number keys map to 1-based option indices — pressing a number in single-select fires `onSelect` immediately; in multi-select it toggles the checkbox. The keybinding bar gains a `1-N` hint showing the option count.

**Tech Stack:** Ink (React for CLIs), React 19, TypeScript, vitest, ink-testing-library

---

## Task 1: Dim Non-Focused Option Labels in `OptionList`

Non-focused options currently render in default terminal color with no visual distinction from focused. Adding `dimColor` to non-focused items creates a clear focus hierarchy where the selected item pops and others recede.

**Files:**

- Modify: `source/components/OptionList.tsx:38-46`
- Test: `source/components/OptionList.test.tsx`

### Step 1: Write the failing test

Add to `source/components/OptionList.test.tsx` after the existing tests:

```tsx
it('renders non-focused options with dim styling', async () => {
	const {lastFrame, stdin} = render(
		<OptionList options={options} onSelect={vi.fn()} />,
	);
	stdin.write('\x1B[B');
	await delay(50);
	const frame = lastFrame() ?? '';
	// Focused option (Verbose) should NOT be dimmed — it has cyan + bold + inverse
	// Non-focused options should be dimmed (ink renders dimColor as ESC[2m)
	// We can verify the focused option's description is showing (already tested)
	// and that the frame contains the dim escape sequence for non-focused items
	expect(frame).toContain('\u001B[2m');
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run source/components/OptionList.test.tsx`
Expected: FAIL — non-focused items have no dim escape sequence

### Step 3: Add dimColor to non-focused options

In `source/components/OptionList.tsx`, change the `<Text>` element (lines 38-46):

From:

```tsx
<Text
	color={isFocused ? 'cyan' : undefined}
	bold={isFocused}
	inverse={isFocused}
>
	{isFocused ? ' › ' : '   '}
	{option.label}
	{isFocused ? ' ' : ''}
</Text>
```

To:

```tsx
<Text
	color={isFocused ? 'cyan' : undefined}
	bold={isFocused}
	inverse={isFocused}
	dimColor={!isFocused}
>
	{isFocused ? ' › ' : '   '}
	{option.label}
	{isFocused ? ' ' : ''}
</Text>
```

### Step 4: Run test to verify it passes

Run: `npx vitest run source/components/OptionList.test.tsx`
Expected: All PASS

### Step 5: Commit

```bash
git add source/components/OptionList.tsx source/components/OptionList.test.tsx
git commit -m "style(option-list): dim non-focused options for better focus hierarchy"
```

---

## Task 2: Dim Non-Focused Option Labels in `MultiOptionList`

Same dimming treatment for the multi-select variant. Keeps visual consistency between both list types.

**Files:**

- Modify: `source/components/MultiOptionList.tsx:46-53`
- Test: `source/components/MultiOptionList.test.tsx`

### Step 1: Write the failing test

Add to `source/components/MultiOptionList.test.tsx` after the existing tests:

```tsx
it('renders non-focused options with dim styling', async () => {
	const {lastFrame, stdin} = render(
		<MultiOptionList options={options} onSubmit={vi.fn()} />,
	);
	stdin.write('\x1B[B');
	await delay(50);
	const frame = lastFrame() ?? '';
	// Non-focused items should have dim escape sequence
	expect(frame).toContain('\u001B[2m');
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run source/components/MultiOptionList.test.tsx`
Expected: FAIL — non-focused items have no dim escape sequence

### Step 3: Add dimColor to non-focused options

In `source/components/MultiOptionList.tsx`, change the `<Text>` element (lines 46-53):

From:

```tsx
<Text
	color={isFocused ? 'cyan' : undefined}
	bold={isFocused}
	inverse={isFocused}
>
```

To:

```tsx
<Text
	color={isFocused ? 'cyan' : undefined}
	bold={isFocused}
	inverse={isFocused}
	dimColor={!isFocused}
>
```

### Step 4: Run test to verify it passes

Run: `npx vitest run source/components/MultiOptionList.test.tsx`
Expected: All PASS

### Step 5: Commit

```bash
git add source/components/MultiOptionList.tsx source/components/MultiOptionList.test.tsx
git commit -m "style(multi-option-list): dim non-focused options for visual consistency"
```

---

## Task 3: Add Number Key Shortcuts to `OptionList`

Pressing 1-9 jumps directly to that option index (1-based). In single-select mode, this immediately fires `onSelect` — no extra Enter needed. This is the fastest interaction path for users who know which option they want.

**Files:**

- Modify: `source/components/OptionList.tsx:18-29`
- Test: `source/components/OptionList.test.tsx`

### Step 1: Write the failing tests

Add to `source/components/OptionList.test.tsx`:

```tsx
it('selects option directly when pressing its number key', () => {
	const onSelect = vi.fn();
	const {stdin} = render(<OptionList options={options} onSelect={onSelect} />);
	stdin.write('2');
	expect(onSelect).toHaveBeenCalledWith('verbose');
});

it('selects first option when pressing 1', () => {
	const onSelect = vi.fn();
	const {stdin} = render(<OptionList options={options} onSelect={onSelect} />);
	stdin.write('1');
	expect(onSelect).toHaveBeenCalledWith('concise');
});

it('ignores number keys beyond option count', () => {
	const onSelect = vi.fn();
	const {stdin} = render(<OptionList options={options} onSelect={onSelect} />);
	// options has 3 items, pressing 9 should do nothing
	stdin.write('9');
	expect(onSelect).not.toHaveBeenCalled();
});
```

### Step 2: Run tests to verify they fail

Run: `npx vitest run source/components/OptionList.test.tsx`
Expected: FAIL — number keys not handled

### Step 3: Add number key handling

In `source/components/OptionList.tsx`, modify the `useInput` callback (lines 18-29):

From:

```tsx
useInput((_input, key) => {
	if (key.downArrow) {
		setFocusIndex(i => (i + 1) % options.length);
	} else if (key.upArrow) {
		setFocusIndex(i => (i - 1 + options.length) % options.length);
	} else if (key.return) {
		const option = options[focusIndex];
		if (option) {
			onSelect(option.value);
		}
	}
});
```

To:

```tsx
useInput((input, key) => {
	if (key.downArrow) {
		setFocusIndex(i => (i + 1) % options.length);
	} else if (key.upArrow) {
		setFocusIndex(i => (i - 1 + options.length) % options.length);
	} else if (key.return) {
		const option = options[focusIndex];
		if (option) {
			onSelect(option.value);
		}
	} else {
		const num = parseInt(input, 10);
		if (num >= 1 && num <= options.length) {
			const option = options[num - 1];
			if (option) {
				onSelect(option.value);
			}
		}
	}
});
```

### Step 4: Run tests to verify they pass

Run: `npx vitest run source/components/OptionList.test.tsx`
Expected: All PASS

### Step 5: Commit

```bash
git add source/components/OptionList.tsx source/components/OptionList.test.tsx
git commit -m "feat(option-list): add number key shortcuts for direct selection"
```

---

## Task 4: Add Number Key Shortcuts to `MultiOptionList`

In multi-select mode, number keys toggle the checkbox at that index (same as navigating to it and pressing Space). This doesn't submit — the user still presses Enter when done.

**Files:**

- Modify: `source/components/MultiOptionList.tsx:14-35`
- Test: `source/components/MultiOptionList.test.tsx`

### Step 1: Write the failing tests

Add to `source/components/MultiOptionList.test.tsx`:

```tsx
it('toggles selection when pressing a number key', async () => {
	const {lastFrame, stdin} = render(
		<MultiOptionList options={options} onSubmit={vi.fn()} />,
	);
	stdin.write('1');
	await delay(50);
	const frame = lastFrame() ?? '';
	expect(frame).toContain('✓');
});

it('submits number-key-toggled selections on Enter', async () => {
	const onSubmit = vi.fn();
	const {stdin} = render(
		<MultiOptionList options={options} onSubmit={onSubmit} />,
	);
	stdin.write('1');
	await delay(50);
	stdin.write('3');
	await delay(50);
	stdin.write('\r');
	expect(onSubmit).toHaveBeenCalledWith(['auth', 'cache']);
});

it('ignores number keys beyond option count', async () => {
	const {lastFrame, stdin} = render(
		<MultiOptionList options={options} onSubmit={vi.fn()} />,
	);
	stdin.write('9');
	await delay(50);
	const frame = lastFrame() ?? '';
	// Should not have any checkmarks
	expect(frame).not.toContain('✓');
});
```

### Step 2: Run tests to verify they fail

Run: `npx vitest run source/components/MultiOptionList.test.tsx`
Expected: FAIL — number keys not handled

### Step 3: Add number key handling

In `source/components/MultiOptionList.tsx`, modify the `useInput` callback (lines 14-35):

From:

```tsx
useInput((input, key) => {
	if (key.downArrow) {
		setFocusIndex(i => (i + 1) % options.length);
	} else if (key.upArrow) {
		setFocusIndex(i => (i - 1 + options.length) % options.length);
	} else if (input === ' ') {
		const option = options[focusIndex];
		if (option) {
			setSelected(prev => {
				const next = new Set(prev);
				if (next.has(option.value)) {
					next.delete(option.value);
				} else {
					next.add(option.value);
				}
				return next;
			});
		}
	} else if (key.return) {
		onSubmit(options.filter(o => selected.has(o.value)).map(o => o.value));
	}
});
```

To:

```tsx
useInput((input, key) => {
	if (key.downArrow) {
		setFocusIndex(i => (i + 1) % options.length);
	} else if (key.upArrow) {
		setFocusIndex(i => (i - 1 + options.length) % options.length);
	} else if (input === ' ') {
		const option = options[focusIndex];
		if (option) {
			toggleOption(option.value);
		}
	} else if (key.return) {
		onSubmit(options.filter(o => selected.has(o.value)).map(o => o.value));
	} else {
		const num = parseInt(input, 10);
		if (num >= 1 && num <= options.length) {
			const option = options[num - 1];
			if (option) {
				toggleOption(option.value);
			}
		}
	}
});
```

Extract the toggle logic into a helper function (add before `useInput`):

```tsx
const toggleOption = useCallback((value: string) => {
	setSelected(prev => {
		const next = new Set(prev);
		if (next.has(value)) {
			next.delete(value);
		} else {
			next.add(value);
		}
		return next;
	});
}, []);
```

Add `useCallback` to the import from React:

```tsx
import React, {useState, useCallback} from 'react';
```

### Step 4: Run tests to verify they pass

Run: `npx vitest run source/components/MultiOptionList.test.tsx`
Expected: All PASS

### Step 5: Commit

```bash
git add source/components/MultiOptionList.tsx source/components/MultiOptionList.test.tsx
git commit -m "feat(multi-option-list): add number key shortcuts for toggling selections"
```

---

## Task 5: Add Number Key Hint to `QuestionKeybindingBar`

Show `1-N` hint (where N is the option count) in the keybinding bar so users discover the number key shortcuts. The bar needs to accept the option count as a prop.

**Files:**

- Modify: `source/components/QuestionKeybindingBar.tsx`
- Modify: `source/components/QuestionKeybindingBar.test.tsx`
- Modify: `source/components/QuestionDialog.tsx` (pass `optionCount` prop)

### Step 1: Write the failing tests

Update `source/components/QuestionKeybindingBar.test.tsx`:

```tsx
import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import QuestionKeybindingBar from './QuestionKeybindingBar.js';

describe('QuestionKeybindingBar', () => {
	it('renders navigation and action hints for single-select', () => {
		const {lastFrame} = render(
			<QuestionKeybindingBar multiSelect={false} optionCount={4} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Navigate');
		expect(frame).toContain('Select');
		expect(frame).toContain('Skip');
	});

	it('renders toggle hint for multi-select', () => {
		const {lastFrame} = render(
			<QuestionKeybindingBar multiSelect={true} optionCount={3} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Toggle');
		expect(frame).toContain('Submit');
		expect(frame).toContain('Skip');
	});

	it('renders number key hint with option count', () => {
		const {lastFrame} = render(
			<QuestionKeybindingBar multiSelect={false} optionCount={4} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('1-4');
		expect(frame).toContain('Jump');
	});

	it('does not render number key hint when optionCount is 0', () => {
		const {lastFrame} = render(
			<QuestionKeybindingBar multiSelect={false} optionCount={0} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).not.toContain('Jump');
	});
});
```

### Step 2: Run tests to verify they fail

Run: `npx vitest run source/components/QuestionKeybindingBar.test.tsx`
Expected: FAIL — `optionCount` prop not accepted, no "1-4" or "Jump" text

### Step 3: Update the component

Rewrite `source/components/QuestionKeybindingBar.tsx`:

```tsx
import React from 'react';
import {Box, Text} from 'ink';

type Props = {
	multiSelect: boolean;
	optionCount?: number;
};

export default function QuestionKeybindingBar({
	multiSelect,
	optionCount = 0,
}: Props) {
	return (
		<Box gap={2}>
			<Text>
				<Text dimColor>↑/↓</Text> Navigate
			</Text>
			{optionCount > 0 && (
				<Text>
					<Text dimColor>1-{optionCount}</Text> Jump
				</Text>
			)}
			{multiSelect ? (
				<>
					<Text>
						<Text dimColor>Space</Text> Toggle
					</Text>
					<Text>
						<Text dimColor>Enter</Text> Submit
					</Text>
				</>
			) : (
				<Text>
					<Text dimColor>Enter</Text> Select
				</Text>
			)}
			<Text>
				<Text dimColor>Esc</Text> Skip
			</Text>
		</Box>
	);
}
```

### Step 4: Pass `optionCount` from QuestionDialog

In `source/components/QuestionDialog.tsx`, update the four `<QuestionKeybindingBar>` usages to pass `optionCount`.

In `SingleQuestion` (around line 137 and 147), change:

```tsx
<QuestionKeybindingBar multiSelect={false} />
```

To:

```tsx
<QuestionKeybindingBar multiSelect={false} optionCount={options.length} />
```

In `MultiQuestion` (around line 205 and 215), change:

```tsx
<QuestionKeybindingBar multiSelect={true} />
```

To:

```tsx
<QuestionKeybindingBar multiSelect={true} optionCount={options.length} />
```

### Step 5: Run all tests to verify they pass

Run: `npx vitest run source/components/QuestionKeybindingBar.test.tsx source/components/QuestionDialog.test.tsx`
Expected: All PASS

### Step 6: Commit

```bash
git add source/components/QuestionKeybindingBar.tsx source/components/QuestionKeybindingBar.test.tsx source/components/QuestionDialog.tsx
git commit -m "feat(keybinding-bar): add number key hint showing 1-N jump shortcut"
```

---

## Task 6: Final Verification — Lint, Typecheck, Test, Build

**Files:** None (verification only)

### Step 1: Run full test suite

Run: `npm test`
Expected: All tests pass

### Step 2: Run lint

Run: `npm run lint`
Expected: No errors

### Step 3: Run typecheck

Run: `npx tsc --noEmit`
Expected: No errors

### Step 4: Run build

Run: `npm run build`
Expected: Compiles successfully

---

## Summary of Changes

| #   | Polish Item            | Solution                                          | Files                                             |
| --- | ---------------------- | ------------------------------------------------- | ------------------------------------------------- |
| 1   | Dim non-focused items  | `dimColor={!isFocused}` on option `<Text>`        | `OptionList.tsx`, `MultiOptionList.tsx`           |
| 2   | Number key shortcuts   | Parse digit input, select/toggle at `num-1` index | `OptionList.tsx`, `MultiOptionList.tsx`           |
| 3   | Number key hint in bar | `1-N Jump` hint in `QuestionKeybindingBar`        | `QuestionKeybindingBar.tsx`, `QuestionDialog.tsx` |
