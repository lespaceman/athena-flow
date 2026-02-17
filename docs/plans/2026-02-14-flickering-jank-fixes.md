# Flickering & Jank Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate visual flickering, layout shifts, and jank in the Ink terminal UI.

**Architecture:** Four independent layers — Ink upgrade, re-render reduction, dialog stability, and Static transition guards.

**Tech Stack:** Ink ≥6.7.0, React 19, TypeScript

---

### Task 1: Upgrade Ink to ≥6.7.0

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1: Bump Ink version**

```bash
npm install ink@latest
```

**Step 2: Run tests to verify compatibility**

```bash
npm test
```

Expected: All tests pass.

**Step 3: Run lint and typecheck**

```bash
npm run lint
```

Expected: No new errors.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: upgrade ink to latest for synchronized terminal updates"
```

---

### Task 2: Slow Spinner Interval

**Files:**

- Modify: `source/hooks/useSpinner.ts:4`
- Test: `source/hooks/useSpinner.test.ts` (if exists, otherwise skip)

**Step 1: Change spinner interval from 80ms to 120ms**

In `source/hooks/useSpinner.ts`, change:

```typescript
const SPINNER_INTERVAL_MS = 80;
```

to:

```typescript
const SPINNER_INTERVAL_MS = 120;
```

**Step 2: Run tests**

```bash
npm test
```

**Step 3: Commit**

```bash
git add source/hooks/useSpinner.ts
git commit -m "perf: slow spinner from 80ms to 120ms to reduce re-renders"
```

---

### Task 3: Remove Pulse Effect from UnifiedToolCallEvent

**Files:**

- Modify: `source/components/UnifiedToolCallEvent.tsx:73-78`

**Step 1: Remove the pulse useState and useEffect**

Remove this block (lines 73-78):

```typescript
const [pulse, setPulse] = useState(true);
useEffect(() => {
	if (!isPending) return;
	const id = setInterval(() => setPulse(p => !p), 500);
	return () => clearInterval(id);
}, [isPending]);
```

**Step 2: Replace pulse-based bullet color with static pending color**

Find where `pulse` is used to determine `bulletColor` and replace with a static color for pending state. Use the theme's pending color directly instead of toggling between two colors.

**Step 3: Remove unused useState import if no other state remains**

**Step 4: Run tests and lint**

```bash
npm test && npm run lint
```

**Step 5: Commit**

```bash
git add source/components/UnifiedToolCallEvent.tsx
git commit -m "perf: remove pulse animation to reduce re-renders on pending tool calls"
```

---

### Task 4: Stabilize Dialog Transitions

**Files:**

- Modify: `source/app.tsx:379-417`

**Step 1: Refactor conditional rendering**

Change from:

```tsx
{appMode.type === 'permission' ? (
    <PermissionDialog ... />
) : appMode.type === 'question' ? (
    <QuestionDialog ... />
) : (
    <>
        <CommandInput ... />
        <StatusLine ... />
    </>
)}
```

To always render CommandInput + StatusLine, with dialogs rendered above:

```tsx
{appMode.type === 'permission' && currentPermissionRequest && (
    <ErrorBoundary ...>
        <PermissionDialog ... />
    </ErrorBoundary>
)}
{appMode.type === 'question' && currentQuestionRequest && (
    <ErrorBoundary ...>
        <QuestionDialog ... />
    </ErrorBoundary>
)}
<CommandInput
    onSubmit={handleSubmit}
    disabled={dialogActive}
    disabledMessage={
        appMode.type === 'question'
            ? 'Waiting for your input...'
            : appMode.type === 'permission'
                ? 'Respond to permission request above...'
                : undefined
    }
    onEscape={isClaudeRunning ? sendInterrupt : undefined}
    onArrowUp={inputHistory.back}
    onArrowDown={inputHistory.forward}
/>
<StatusLine ... />
```

**Step 2: Verify CommandInput disabled state handles keyboard correctly**

Ensure `disabled` prop prevents submission but doesn't swallow Escape (needed for interrupt).

**Step 3: Run tests**

```bash
npm test && npm run lint
```

**Step 4: Commit**

```bash
git add source/app.tsx
git commit -m "fix: always render CommandInput to prevent layout shift on dialog transitions"
```

---

### Task 5: Guard Dynamic→Static Transition

**Files:**

- Modify: `source/hooks/useContentOrdering.ts:396-400`

**Step 1: Add a promotion delay ref**

Track items that became stable this render cycle. Only promote them on the _next_ render by storing "pending promotion" IDs in a ref.

```typescript
const pendingPromotionRef = useRef<Set<string>>(new Set());
```

**Step 2: Modify the newly-stable append logic**

Instead of immediately appending newly-stable items, add them to `pendingPromotionRef`. On the next render, items in `pendingPromotionRef` that are still stable get promoted.

```typescript
// Previously pending items that are still stable → promote now
for (const id of pendingPromotionRef.current) {
	const item = itemById.get(id);
	if (item && isStable(item) && !prevStableIds.has(id)) {
		stableItems.push(item);
	}
}

// Newly stable items → defer to next render
const newPending = new Set<string>();
for (const item of contentItems) {
	if (
		isStable(item) &&
		!prevStableIds.has(item.data.id) &&
		!pendingPromotionRef.current.has(item.data.id)
	) {
		newPending.add(item.data.id);
	}
}
pendingPromotionRef.current = newPending;
```

**Step 3: Run tests**

```bash
npm test && npm run lint
```

**Step 4: Commit**

```bash
git add source/hooks/useContentOrdering.ts
git commit -m "fix: defer Static promotion by one render cycle to prevent transition gap"
```

---

### Task 6: Final Verification

**Step 1: Run full test suite**

```bash
npm test
```

**Step 2: Run lint and typecheck**

```bash
npm run lint
```

**Step 3: Manual smoke test**

```bash
npm run build && npm run start
```

Verify:

- Spinner animates smoothly without flicker
- Tool calls show pending state without pulsing
- Permission dialogs don't cause layout jumps
- Tool results transition cleanly to scrollback
