# AskUserQuestion Dialog UX/UI Overhaul

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Overhaul the QuestionDialog component to be scannable, accessible, and polished — fixing 7 identified UX issues: dense option descriptions, missing keybinding hints, subtle selection indicators, inconsistent "Other" option, conflicting status lines, no escape hatch, and awkward box width.

**Architecture:** Replace the `@inkjs/ui` `Select`/`MultiSelect` components with a custom `OptionList` component that gives full control over rendering (focused-only descriptions, inverse highlighting, keybinding hints). Add Esc-to-skip support via a new `onSkip` callback prop. Fix the status line conflict in `app.tsx` by suppressing the spinner when the question dialog is active. Constrain box width to 76 chars max.

**Tech Stack:** Ink (React for CLIs), React 19, TypeScript, vitest, ink-testing-library

---

## Task 1: Build Custom `OptionList` Component (Single-Select)

Replaces `@inkjs/ui` `Select` with a custom component that shows short labels for all options, but only expands the description for the focused item. Uses inverse background + arrow indicator for clear selection visibility.

**Files:**

- Create: `source/components/OptionList.tsx`
- Test: `source/components/OptionList.test.tsx`

### Step 1: Write the failing tests

Create `source/components/OptionList.test.tsx`:

```tsx
import React from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render} from 'ink-testing-library';
import OptionList from './OptionList.js';

const options = [
	{
		label: 'Concise & minimal',
		description: 'Short names, fewer comments',
		value: 'concise',
	},
	{
		label: 'Verbose & explicit',
		description: 'Long names, many comments',
		value: 'verbose',
	},
	{
		label: 'Balanced & pragmatic',
		description: 'Middle ground approach',
		value: 'balanced',
	},
];

describe('OptionList', () => {
	it('renders all option labels', () => {
		const {lastFrame} = render(
			<OptionList options={options} onSelect={vi.fn()} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Concise & minimal');
		expect(frame).toContain('Verbose & explicit');
		expect(frame).toContain('Balanced & pragmatic');
	});

	it('shows description only for the focused option', () => {
		const {lastFrame} = render(
			<OptionList options={options} onSelect={vi.fn()} />,
		);
		const frame = lastFrame() ?? '';
		// First option is focused by default — its description should show
		expect(frame).toContain('Short names, fewer comments');
		// Other descriptions should NOT show
		expect(frame).not.toContain('Long names, many comments');
		expect(frame).not.toContain('Middle ground approach');
	});

	it('renders a focus indicator on the active option', () => {
		const {lastFrame} = render(
			<OptionList options={options} onSelect={vi.fn()} />,
		);
		const frame = lastFrame() ?? '';
		// The focused option should have the › indicator
		expect(frame).toContain('›');
	});

	it('moves focus down on arrow key', () => {
		const {lastFrame, stdin} = render(
			<OptionList options={options} onSelect={vi.fn()} />,
		);

		// Press down arrow (escape sequence)
		stdin.write('\x1B[B');

		const frame = lastFrame() ?? '';
		// Second option's description should now show
		expect(frame).toContain('Long names, many comments');
		// First option's description should be hidden
		expect(frame).not.toContain('Short names, fewer comments');
	});

	it('moves focus up on arrow key', () => {
		const {lastFrame, stdin} = render(
			<OptionList options={options} onSelect={vi.fn()} />,
		);

		// Press down then up
		stdin.write('\x1B[B');
		stdin.write('\x1B[A');

		const frame = lastFrame() ?? '';
		// Back to first option
		expect(frame).toContain('Short names, fewer comments');
	});

	it('wraps around when navigating past the last option', () => {
		const {lastFrame, stdin} = render(
			<OptionList options={options} onSelect={vi.fn()} />,
		);

		// Press down 3 times (past last option, should wrap to first)
		stdin.write('\x1B[B');
		stdin.write('\x1B[B');
		stdin.write('\x1B[B');

		const frame = lastFrame() ?? '';
		expect(frame).toContain('Short names, fewer comments');
	});

	it('calls onSelect with value on Enter', () => {
		const onSelect = vi.fn();
		const {stdin} = render(
			<OptionList options={options} onSelect={onSelect} />,
		);

		// Press Enter to select first option
		stdin.write('\r');

		expect(onSelect).toHaveBeenCalledWith('concise');
	});

	it('calls onSelect with correct value after navigating', () => {
		const onSelect = vi.fn();
		const {stdin} = render(
			<OptionList options={options} onSelect={onSelect} />,
		);

		// Navigate to second option and select
		stdin.write('\x1B[B');
		stdin.write('\r');

		expect(onSelect).toHaveBeenCalledWith('verbose');
	});

	it('renders option without description when description is empty', () => {
		const opts = [
			{label: 'Option A', description: '', value: 'a'},
			{label: 'Option B', description: 'Has a description', value: 'b'},
		];
		const {lastFrame} = render(
			<OptionList options={opts} onSelect={vi.fn()} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Option A');
		expect(frame).toContain('Option B');
	});
});
```

### Step 2: Run tests to verify they fail

Run: `npx vitest run source/components/OptionList.test.tsx`
Expected: FAIL — module not found

### Step 3: Write the `OptionList` component

Create `source/components/OptionList.tsx`:

```tsx
import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';

export type OptionItem = {
	label: string;
	description: string;
	value: string;
};

type Props = {
	options: OptionItem[];
	onSelect: (value: string) => void;
};

export default function OptionList({options, onSelect}: Props) {
	const [focusIndex, setFocusIndex] = useState(0);

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

	return (
		<Box flexDirection="column">
			{options.map((option, index) => {
				const isFocused = index === focusIndex;
				return (
					<Box key={option.value} flexDirection="column">
						<Box>
							<Text
								color={isFocused ? 'cyan' : undefined}
								bold={isFocused}
								inverse={isFocused}
							>
								{isFocused ? ' › ' : '   '}
								{option.label}
								{isFocused ? ' ' : ''}
							</Text>
						</Box>
						{isFocused && option.description ? (
							<Box paddingLeft={3}>
								<Text dimColor>{option.description}</Text>
							</Box>
						) : null}
					</Box>
				);
			})}
		</Box>
	);
}
```

### Step 4: Run tests to verify they pass

Run: `npx vitest run source/components/OptionList.test.tsx`
Expected: All PASS

### Step 5: Commit

```bash
git add source/components/OptionList.tsx source/components/OptionList.test.tsx
git commit -m "feat(question-dialog): add custom OptionList component with focused descriptions"
```

---

## Task 2: Build Custom `MultiOptionList` Component

Like `OptionList` but supports multi-select with Space to toggle and Enter to submit. Shows checkboxes `[ ]` / `[✓]`.

**Files:**

- Create: `source/components/MultiOptionList.tsx`
- Test: `source/components/MultiOptionList.test.tsx`

### Step 1: Write the failing tests

Create `source/components/MultiOptionList.test.tsx`:

```tsx
import React from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render} from 'ink-testing-library';
import MultiOptionList from './MultiOptionList.js';

const options = [
	{label: 'Auth', description: 'Authentication system', value: 'auth'},
	{label: 'Logging', description: 'Structured logging', value: 'logging'},
	{label: 'Cache', description: 'In-memory cache', value: 'cache'},
];

describe('MultiOptionList', () => {
	it('renders all options with empty checkboxes', () => {
		const {lastFrame} = render(
			<MultiOptionList options={options} onSubmit={vi.fn()} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Auth');
		expect(frame).toContain('Logging');
		expect(frame).toContain('Cache');
	});

	it('shows description only for focused option', () => {
		const {lastFrame} = render(
			<MultiOptionList options={options} onSubmit={vi.fn()} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Authentication system');
		expect(frame).not.toContain('Structured logging');
	});

	it('toggles selection with space', () => {
		const {lastFrame, stdin} = render(
			<MultiOptionList options={options} onSubmit={vi.fn()} />,
		);

		// Press space to toggle first option
		stdin.write(' ');

		const frame = lastFrame() ?? '';
		// Should show a checked indicator
		expect(frame).toContain('✓');
	});

	it('submits selected values on Enter', () => {
		const onSubmit = vi.fn();
		const {stdin} = render(
			<MultiOptionList options={options} onSubmit={onSubmit} />,
		);

		// Select first option, move down, select second, submit
		stdin.write(' ');
		stdin.write('\x1B[B');
		stdin.write(' ');
		stdin.write('\r');

		expect(onSubmit).toHaveBeenCalledWith(['auth', 'logging']);
	});

	it('submits empty array when nothing selected', () => {
		const onSubmit = vi.fn();
		const {stdin} = render(
			<MultiOptionList options={options} onSubmit={onSubmit} />,
		);

		stdin.write('\r');

		expect(onSubmit).toHaveBeenCalledWith([]);
	});

	it('wraps navigation around options', () => {
		const {lastFrame, stdin} = render(
			<MultiOptionList options={options} onSubmit={vi.fn()} />,
		);

		// Press up from first (should wrap to last)
		stdin.write('\x1B[A');

		const frame = lastFrame() ?? '';
		expect(frame).toContain('In-memory cache');
	});
});
```

### Step 2: Run tests to verify they fail

Run: `npx vitest run source/components/MultiOptionList.test.tsx`
Expected: FAIL — module not found

### Step 3: Write the `MultiOptionList` component

Create `source/components/MultiOptionList.tsx`:

```tsx
import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {type OptionItem} from './OptionList.js';

type Props = {
	options: OptionItem[];
	onSubmit: (values: string[]) => void;
};

export default function MultiOptionList({options, onSubmit}: Props) {
	const [focusIndex, setFocusIndex] = useState(0);
	const [selected, setSelected] = useState<Set<string>>(new Set());

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

	return (
		<Box flexDirection="column">
			{options.map((option, index) => {
				const isFocused = index === focusIndex;
				const isSelected = selected.has(option.value);
				const checkbox = isSelected ? '✓' : ' ';
				return (
					<Box key={option.value} flexDirection="column">
						<Box>
							<Text
								color={isFocused ? 'cyan' : undefined}
								bold={isFocused}
								inverse={isFocused}
							>
								{isFocused ? ' › ' : '   '}[{checkbox}] {option.label}
								{isFocused ? ' ' : ''}
							</Text>
						</Box>
						{isFocused && option.description ? (
							<Box paddingLeft={3}>
								<Text dimColor>{option.description}</Text>
							</Box>
						) : null}
					</Box>
				);
			})}
		</Box>
	);
}
```

### Step 4: Run tests to verify they pass

Run: `npx vitest run source/components/MultiOptionList.test.tsx`
Expected: All PASS

### Step 5: Commit

```bash
git add source/components/MultiOptionList.tsx source/components/MultiOptionList.test.tsx
git commit -m "feat(question-dialog): add custom MultiOptionList with focused descriptions and checkboxes"
```

---

## Task 3: Build `QuestionKeybindingBar` Component

A keybinding hint bar displayed at the bottom of the QuestionDialog, showing available actions.

**Files:**

- Create: `source/components/QuestionKeybindingBar.tsx`
- Test: `source/components/QuestionKeybindingBar.test.tsx`

### Step 1: Write the failing tests

Create `source/components/QuestionKeybindingBar.test.tsx`:

```tsx
import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import QuestionKeybindingBar from './QuestionKeybindingBar.js';

describe('QuestionKeybindingBar', () => {
	it('renders navigation and action hints for single-select', () => {
		const {lastFrame} = render(<QuestionKeybindingBar multiSelect={false} />);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Navigate');
		expect(frame).toContain('Select');
		expect(frame).toContain('Skip');
	});

	it('renders toggle hint for multi-select', () => {
		const {lastFrame} = render(<QuestionKeybindingBar multiSelect={true} />);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Toggle');
		expect(frame).toContain('Submit');
		expect(frame).toContain('Skip');
	});
});
```

### Step 2: Run tests to verify they fail

Run: `npx vitest run source/components/QuestionKeybindingBar.test.tsx`
Expected: FAIL — module not found

### Step 3: Write the component

Create `source/components/QuestionKeybindingBar.tsx`:

```tsx
import React from 'react';
import {Box, Text} from 'ink';

type Props = {
	multiSelect: boolean;
};

export default function QuestionKeybindingBar({multiSelect}: Props) {
	return (
		<Box gap={2}>
			<Text>
				<Text dimColor>↑/↓</Text> Navigate
			</Text>
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

### Step 4: Run tests to verify they pass

Run: `npx vitest run source/components/QuestionKeybindingBar.test.tsx`
Expected: All PASS

### Step 5: Commit

```bash
git add source/components/QuestionKeybindingBar.tsx source/components/QuestionKeybindingBar.test.tsx
git commit -m "feat(question-dialog): add QuestionKeybindingBar with context-aware hints"
```

---

## Task 4: Refactor `QuestionDialog` to Use New Components

Replace `@inkjs/ui` `Select`/`MultiSelect` with custom `OptionList`/`MultiOptionList`. Add keybinding bar, Esc-to-skip, constrained width, and improved "Other" option description.

**Files:**

- Modify: `source/components/QuestionDialog.tsx` (full rewrite of internals)
- Modify: `source/components/QuestionDialog.test.tsx` (update tests for new behavior)

### Step 1: Update QuestionDialog tests for new behavior

Rewrite `source/components/QuestionDialog.test.tsx` to test the new UX:

```tsx
import React from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render} from 'ink-testing-library';
import QuestionDialog from './QuestionDialog.js';
import type {HookEventDisplay, PreToolUseEvent} from '../types/hooks/index.js';

function makeRequest(
	questions: Array<{
		question: string;
		header: string;
		options: Array<{label: string; description: string}>;
		multiSelect: boolean;
	}>,
): HookEventDisplay {
	const payload: PreToolUseEvent = {
		session_id: 'session-1',
		transcript_path: '/tmp/transcript.jsonl',
		cwd: '/project',
		hook_event_name: 'PreToolUse',
		tool_name: 'AskUserQuestion',
		tool_input: {questions},
	};

	return {
		id: 'test-q-1',
		requestId: 'req-q-1',
		timestamp: new Date('2024-01-15T10:30:45.000Z'),
		hookName: 'PreToolUse',
		toolName: 'AskUserQuestion',
		payload,
		status: 'pending',
	};
}

describe('QuestionDialog', () => {
	it('renders question header and text', () => {
		const request = makeRequest([
			{
				question: 'Which library should we use?',
				header: 'Library',
				options: [
					{label: 'React', description: 'Popular UI library'},
					{label: 'Vue', description: 'Progressive framework'},
				],
				multiSelect: false,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('[Library]');
		expect(frame).toContain('Which library should we use?');
	});

	it('shows short option labels for all options', () => {
		const request = makeRequest([
			{
				question: 'Which library?',
				header: 'Library',
				options: [
					{label: 'React', description: 'Popular UI library'},
					{label: 'Vue', description: 'Progressive framework'},
				],
				multiSelect: false,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('React');
		expect(frame).toContain('Vue');
	});

	it('shows description only for focused option (first by default)', () => {
		const request = makeRequest([
			{
				question: 'Which library?',
				header: 'Library',
				options: [
					{label: 'React', description: 'Popular UI library'},
					{label: 'Vue', description: 'Progressive framework'},
				],
				multiSelect: false,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		// Focused option description visible
		expect(frame).toContain('Popular UI library');
		// Non-focused description hidden
		expect(frame).not.toContain('Progressive framework');
	});

	it('renders Other option with clarifier description', () => {
		const request = makeRequest([
			{
				question: 'Which library?',
				header: 'Library',
				options: [{label: 'React', description: 'UI lib'}],
				multiSelect: false,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Other');
	});

	it('renders keybinding hints', () => {
		const request = makeRequest([
			{
				question: 'Question?',
				header: 'Q',
				options: [{label: 'A', description: 'desc'}],
				multiSelect: false,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Navigate');
		expect(frame).toContain('Select');
		expect(frame).toContain('Skip');
	});

	it('renders multi-select keybinding hints', () => {
		const request = makeRequest([
			{
				question: 'Which features?',
				header: 'Features',
				options: [{label: 'Auth', description: 'Authentication'}],
				multiSelect: true,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('Toggle');
		expect(frame).toContain('Submit');
	});

	it('shows tab headers when multiple questions', () => {
		const request = makeRequest([
			{
				question: 'First question?',
				header: 'Q1',
				options: [{label: 'A', description: 'Option A'}],
				multiSelect: false,
			},
			{
				question: 'Second question?',
				header: 'Q2',
				options: [{label: 'B', description: 'Option B'}],
				multiSelect: false,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('[1. Q1]');
		expect(frame).toContain('2. Q2');
	});

	it('does not show tabs for single question', () => {
		const request = makeRequest([
			{
				question: 'Only question?',
				header: 'Q',
				options: [{label: 'A', description: 'desc'}],
				multiSelect: false,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).not.toContain('1.');
	});

	it('shows queued count when more questions are queued', () => {
		const request = makeRequest([
			{
				question: 'Question?',
				header: 'Q',
				options: [{label: 'A', description: 'desc'}],
				multiSelect: false,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={2}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('(2 more queued)');
	});

	it('shows message when no questions found', () => {
		const payload: PreToolUseEvent = {
			session_id: 'session-1',
			transcript_path: '/tmp/transcript.jsonl',
			cwd: '/project',
			hook_event_name: 'PreToolUse',
			tool_name: 'AskUserQuestion',
			tool_input: {},
		};

		const request: HookEventDisplay = {
			id: 'test-q-empty',
			requestId: 'req-q-empty',
			timestamp: new Date('2024-01-15T10:30:45.000Z'),
			hookName: 'PreToolUse',
			toolName: 'AskUserQuestion',
			payload,
			status: 'pending',
		};

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('No questions found');
	});

	it('renders with round border in cyan', () => {
		const request = makeRequest([
			{
				question: 'Question?',
				header: 'Q',
				options: [{label: 'A', description: 'desc'}],
				multiSelect: false,
			},
		]);

		const {lastFrame} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={vi.fn()}
			/>,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('\u256d'); // ╭
		expect(frame).toContain('\u256e'); // ╮
		expect(frame).toContain('\u2570'); // ╰
		expect(frame).toContain('\u256f'); // ╯
	});

	it('calls onSkip when Esc is pressed', () => {
		const onSkip = vi.fn();
		const request = makeRequest([
			{
				question: 'Question?',
				header: 'Q',
				options: [{label: 'A', description: 'desc'}],
				multiSelect: false,
			},
		]);

		const {stdin} = render(
			<QuestionDialog
				request={request}
				queuedCount={0}
				onAnswer={vi.fn()}
				onSkip={onSkip}
			/>,
		);

		// Press Escape
		stdin.write('\x1B');

		expect(onSkip).toHaveBeenCalled();
	});
});
```

### Step 2: Run tests to verify they fail

Run: `npx vitest run source/components/QuestionDialog.test.tsx`
Expected: FAIL — `onSkip` prop not accepted, keybinding hints not rendered, etc.

### Step 3: Rewrite QuestionDialog

Rewrite `source/components/QuestionDialog.tsx`:

```tsx
import React, {useState, useCallback} from 'react';
import {Box, Text, useInput} from 'ink';
import {TextInput} from '@inkjs/ui';
import {type HookEventDisplay} from '../types/hooks/display.js';
import {isToolEvent} from '../types/hooks/events.js';
import OptionList, {type OptionItem} from './OptionList.js';
import MultiOptionList from './MultiOptionList.js';
import QuestionKeybindingBar from './QuestionKeybindingBar.js';

const MAX_WIDTH = 76;

type QuestionOption = {
	label: string;
	description: string;
};

type Question = {
	question: string;
	header: string;
	options: QuestionOption[];
	multiSelect: boolean;
};

type Props = {
	request: HookEventDisplay;
	queuedCount: number;
	onAnswer: (answers: Record<string, string>) => void;
	onSkip: () => void;
};

const OTHER_VALUE = '__other__';

function buildOptions(options: QuestionOption[]): OptionItem[] {
	return [
		...options.map(o => ({
			label: o.label,
			description: o.description,
			value: o.label,
		})),
		{
			label: 'Other',
			description: 'Enter a custom response',
			value: OTHER_VALUE,
		},
	];
}

function extractQuestions(request: HookEventDisplay): Question[] {
	if (!isToolEvent(request.payload)) return [];
	const input = request.payload.tool_input as {questions?: Question[]};
	return Array.isArray(input.questions) ? input.questions : [];
}

function QuestionTabs({
	questions,
	currentIndex,
	answers,
}: {
	questions: Question[];
	currentIndex: number;
	answers: Record<string, string>;
}) {
	if (questions.length <= 1) return null;

	return (
		<Box gap={1}>
			{questions.map((q, i) => {
				const answered = answers[q.question] !== undefined;
				const active = i === currentIndex;
				const prefix = answered ? '\u2713' : `${i + 1}`; // ✓ or number
				const label = `${prefix}. ${q.header}`;

				return (
					<Text
						key={`${i}-${q.header}`}
						bold={active}
						color={active ? 'cyan' : answered ? 'green' : 'gray'}
						dimColor={!active && !answered}
					>
						{active ? `[${label}]` : ` ${label} `}
					</Text>
				);
			})}
		</Box>
	);
}

function SingleQuestion({
	question,
	onAnswer,
	onSkip,
}: {
	question: Question;
	onAnswer: (answer: string) => void;
	onSkip: () => void;
}) {
	const [isOther, setIsOther] = useState(false);
	const options = buildOptions(question.options);

	const handleSelect = useCallback(
		(value: string) => {
			if (value === OTHER_VALUE) {
				setIsOther(true);
			} else {
				onAnswer(value);
			}
		},
		[onAnswer],
	);

	const handleOtherSubmit = useCallback(
		(value: string) => {
			if (value.trim()) {
				onAnswer(value.trim());
			}
		},
		[onAnswer],
	);

	useInput((_input, key) => {
		if (key.escape) {
			onSkip();
		}
	});

	if (isOther) {
		return (
			<Box flexDirection="column">
				<Box>
					<Text color="yellow">{'> '}</Text>
					<TextInput
						placeholder="Type your answer..."
						onSubmit={handleOtherSubmit}
					/>
				</Box>
				<Box marginTop={1}>
					<QuestionKeybindingBar multiSelect={false} />
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<OptionList options={options} onSelect={handleSelect} />
			<Box marginTop={1}>
				<QuestionKeybindingBar multiSelect={false} />
			</Box>
		</Box>
	);
}

function MultiQuestion({
	question,
	onAnswer,
	onSkip,
}: {
	question: Question;
	onAnswer: (answer: string) => void;
	onSkip: () => void;
}) {
	const [isOther, setIsOther] = useState(false);
	const [selected, setSelected] = useState<string[]>([]);
	const options = buildOptions(question.options);

	const handleSubmit = useCallback(
		(values: string[]) => {
			if (values.includes(OTHER_VALUE)) {
				setSelected(values.filter(v => v !== OTHER_VALUE));
				setIsOther(true);
			} else {
				onAnswer(values.join(', '));
			}
		},
		[onAnswer],
	);

	const handleOtherSubmit = useCallback(
		(value: string) => {
			if (value.trim()) {
				const all = [...selected, value.trim()];
				onAnswer(all.join(', '));
			}
		},
		[onAnswer, selected],
	);

	useInput((_input, key) => {
		if (key.escape) {
			onSkip();
		}
	});

	if (isOther) {
		return (
			<Box flexDirection="column">
				<Box>
					<Text color="yellow">{'> '}</Text>
					<TextInput
						placeholder="Type your answer..."
						onSubmit={handleOtherSubmit}
					/>
				</Box>
				<Box marginTop={1}>
					<QuestionKeybindingBar multiSelect={true} />
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<MultiOptionList options={options} onSubmit={handleSubmit} />
			<Box marginTop={1}>
				<QuestionKeybindingBar multiSelect={true} />
			</Box>
		</Box>
	);
}

export default function QuestionDialog({
	request,
	queuedCount,
	onAnswer,
	onSkip,
}: Props) {
	const questions = extractQuestions(request);
	const [currentIndex, setCurrentIndex] = useState(0);
	const [answers, setAnswers] = useState<Record<string, string>>({});

	const handleQuestionAnswer = useCallback(
		(answer: string) => {
			const question = questions[currentIndex];
			if (!question) return;

			const newAnswers = {...answers, [question.question]: answer};

			if (currentIndex + 1 < questions.length) {
				setAnswers(newAnswers);
				setCurrentIndex(i => i + 1);
			} else {
				onAnswer(newAnswers);
			}
		},
		[answers, currentIndex, questions, onAnswer],
	);

	if (questions.length === 0) {
		return (
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="cyan"
				paddingX={1}
				width={MAX_WIDTH}
			>
				<Text color="yellow">No questions found in AskUserQuestion input.</Text>
			</Box>
		);
	}

	const question = questions[currentIndex]!;

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="cyan"
			paddingX={1}
			width={MAX_WIDTH}
		>
			<QuestionTabs
				questions={questions}
				currentIndex={currentIndex}
				answers={answers}
			/>
			<Box marginTop={questions.length > 1 ? 1 : 0}>
				<Text bold color="cyan">
					[{question.header}]
				</Text>
				<Text> {question.question}</Text>
				{queuedCount > 0 && <Text dimColor> ({queuedCount} more queued)</Text>}
			</Box>
			<Box marginTop={1}>
				{question.multiSelect ? (
					<MultiQuestion
						key={currentIndex}
						question={question}
						onAnswer={handleQuestionAnswer}
						onSkip={onSkip}
					/>
				) : (
					<SingleQuestion
						key={currentIndex}
						question={question}
						onAnswer={handleQuestionAnswer}
						onSkip={onSkip}
					/>
				)}
			</Box>
		</Box>
	);
}
```

### Step 4: Run tests to verify they pass

Run: `npx vitest run source/components/QuestionDialog.test.tsx`
Expected: All PASS

### Step 5: Commit

```bash
git add source/components/QuestionDialog.tsx source/components/QuestionDialog.test.tsx
git commit -m "refactor(question-dialog): use custom option lists, add keybinding hints, Esc skip, constrained width"
```

---

## Task 5: Wire Up `onSkip` in App and Fix Status Line Conflict

Update `app.tsx` to:

1. Pass `onSkip` to `QuestionDialog` (resolves question with empty answers, acting as skip/dismiss)
2. Suppress the "Agent is thinking..." spinner when the question dialog is showing
3. Remove the "Answering question..." disabled message from CommandInput (redundant with the dialog itself being visible)

**Files:**

- Modify: `source/app.tsx`

### Step 1: Update app.tsx

In `source/app.tsx`, make these changes:

**Change 1:** Add `handleQuestionSkip` callback (after `handleQuestionAnswer` around line 157):

```tsx
const handleQuestionSkip = useCallback(() => {
	if (!currentQuestionRequest) return;
	resolveQuestion(currentQuestionRequest.requestId, {});
}, [currentQuestionRequest, resolveQuestion]);
```

**Change 2:** Suppress "Agent is thinking..." when question dialog is active (line 244). Change:

```tsx
{isClaudeRunning && !currentPermissionRequest && (
```

To:

```tsx
{isClaudeRunning && !currentPermissionRequest && !currentQuestionRequest && (
```

**Change 3:** Pass `onSkip` to `QuestionDialog` (line 270-276). Change:

```tsx
<QuestionDialog
	request={currentQuestionRequest}
	queuedCount={questionQueueCount - 1}
	onAnswer={handleQuestionAnswer}
/>
```

To:

```tsx
<QuestionDialog
	request={currentQuestionRequest}
	queuedCount={questionQueueCount - 1}
	onAnswer={handleQuestionAnswer}
	onSkip={handleQuestionSkip}
/>
```

**Change 4:** Replace the "Answering question..." disabled message with a single-line status (line 281-288). Change:

```tsx
disabledMessage={
	currentQuestionRequest && !currentPermissionRequest
		? 'Answering question...'
		: undefined
}
```

To:

```tsx
disabledMessage={
	currentQuestionRequest && !currentPermissionRequest
		? 'Waiting for your input...'
		: undefined
}
```

### Step 2: Run all tests

Run: `npm test`
Expected: All PASS

### Step 3: Run lint and typecheck

Run: `npm run lint`
Run: `npx tsc --noEmit`
Expected: Both pass

### Step 4: Commit

```bash
git add source/app.tsx
git commit -m "fix(question-dialog): wire onSkip, fix status line conflict, improve disabled message"
```

---

## Task 6: Final Verification — Build, Lint, Typecheck, Full Test Suite

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

## Summary of Changes by Issue

| #   | Issue                      | Solution                                                | Files                                             |
| --- | -------------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| 1   | Dense option descriptions  | Custom `OptionList` — description only for focused item | `OptionList.tsx`, `QuestionDialog.tsx`            |
| 2   | No keybinding hints        | `QuestionKeybindingBar` component at bottom of dialog   | `QuestionKeybindingBar.tsx`, `QuestionDialog.tsx` |
| 3   | Subtle selection indicator | Inverse background + `›` arrow on focused item          | `OptionList.tsx`, `MultiOptionList.tsx`           |
| 4   | "Other" has no description | Added "Enter a custom response" as description          | `QuestionDialog.tsx`                              |
| 5   | Conflicting status lines   | Suppress spinner when question dialog active            | `app.tsx`                                         |
| 6   | No escape hatch            | `Esc` to skip + hint in keybinding bar                  | `QuestionDialog.tsx`, `app.tsx`                   |
| 7   | Awkward box width          | `width={76}` on dialog container                        | `QuestionDialog.tsx`                              |
