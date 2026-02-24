# Remove `toAscii` Character Escaping — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the `toAscii()` function that unconditionally replaces non-ASCII characters with `?`, causing unicode glyphs to render as `?` even when `--ascii` is false. Keep all ANSI-aware layout utilities (`string-width`, `slice-ansi`, `strip-ansi`) intact — they're correct infrastructure.

**Architecture:** `toAscii()` is defined in `source/utils/format.ts` and has a single call site in `source/hooks/useTodoPanel.ts:55` where it's used to generate stable todo item IDs. The fix: replace it with a safe ID-generation approach that doesn't mangle display text, then delete `toAscii` entirely.

**Tech Stack:** TypeScript, vitest

---

### Task 1: Write failing test exposing the `toAscii` bug in todo IDs

**Files:**

- Modify: `source/hooks/useTodoPanel.ts`
- Create: `source/hooks/useTodoPanel.test.ts`

**Step 1: Write the failing test**

Create `source/hooks/useTodoPanel.test.ts`:

```typescript
import {describe, it, expect} from 'vitest';
import {renderHook} from '@testing-library/react';
import {useTodoPanel} from './useTodoPanel.js';

describe('useTodoPanel', () => {
	it('generates stable IDs without mangling unicode in task content', () => {
		const tasks = [
			{content: '✓ Deploy server', status: 'in_progress' as const},
			{content: 'café setup', status: 'pending' as const},
		];

		const {result} = renderHook(() =>
			useTodoPanel({tasks, todoVisible: true, focusMode: 'feed'}),
		);

		// IDs should be stable and not contain '?' from toAscii mangling
		const ids = result.current.todoItems.map(item => item.id);
		expect(ids.every(id => !id.includes('?'))).toBe(true);
		// Content should be preserved as-is
		expect(result.current.todoItems[0]!.text).toBe('✓ Deploy server');
		expect(result.current.todoItems[1]!.text).toBe('café setup');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run source/hooks/useTodoPanel.test.ts`
Expected: FAIL — IDs contain `?` because `toAscii('✓ Deploy server')` → `'? Deploy server'`

**Step 3: Fix — replace `toAscii` with safe ID slug in `useTodoPanel.ts`**

In `source/hooks/useTodoPanel.ts`, replace line 8 and line 55:

Remove:

```typescript
import {toAscii} from '../utils/format.js';
```

Change line 55 from:

```typescript
id: `task-${index}-${toAscii(task.content).slice(0, 16)}`,
```

to:

```typescript
id: `task-${index}-${task.content.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`,
```

This strips non-alphanumeric chars only for the ID (not the display text), which is what `toAscii` was poorly trying to do.

**Step 4: Run test to verify it passes**

Run: `npx vitest run source/hooks/useTodoPanel.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add source/hooks/useTodoPanel.ts source/hooks/useTodoPanel.test.ts
git commit -m "fix(todo): stop mangling unicode in task IDs — replace toAscii with safe slug"
```

---

### Task 2: Delete `toAscii` from `format.ts` and its tests

**Files:**

- Modify: `source/utils/format.ts`
- Modify: `source/utils/format.test.ts`

**Step 1: Remove `toAscii` from `format.ts`**

Delete lines 4-6:

```typescript
export function toAscii(value: string): string {
	return value.replace(/[^\x20-\x7e]/g, '?');
}
```

**Step 2: Remove `toAscii` tests from `format.test.ts`**

Remove the `import` of `toAscii` from the import block (line 3).

Remove the entire `describe('toAscii', ...)` block (lines 16-29).

**Step 3: Run tests**

Run: `npx vitest run source/utils/format.test.ts`
Expected: PASS

**Step 4: Run full build to confirm no other callers**

Run: `npm run build`
Expected: Clean — no compile errors. If any file still imports `toAscii`, the build will fail and that caller must be updated.

**Step 5: Commit**

```bash
git add source/utils/format.ts source/utils/format.test.ts
git commit -m "refactor(format): delete toAscii — no longer used"
```

---

### Task 3: Run full verification

**Step 1: Run all tests**

Run: `npx vitest run source/`
Expected: All PASS

**Step 2: Run lint**

Run: `npm run lint`
Expected: Clean

**Step 3: Run build**

Run: `npm run build`
Expected: Clean compile

**Step 4: Fix any remaining issues and commit if needed**

```bash
git add -A
git commit -m "chore: fix lint/type issues from toAscii removal"
```
