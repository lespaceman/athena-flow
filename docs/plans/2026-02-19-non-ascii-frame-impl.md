# Non-ASCII Box-Drawing Frame Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace ASCII frame characters (`+`, `-`, `|`) in DashboardFrame with Unicode single-line box-drawing characters (`┌─┐│├┤└┘`).

**Architecture:** Direct character swap in DashboardFrame.tsx. Split the single `border` variable into `topBorder`/`bottomBorder` (different corner chars). Update `separator` and `renderLine` to use `│`, `├`, `┤`, `─`.

**Tech Stack:** TypeScript, Ink/React, vitest, ink-testing-library

---

### Task 1: Update test to expect box-drawing characters

**Files:**

- Modify: `source/components/DashboardFrame.test.tsx:33`

**Step 1: Update the test assertion**

In the first test (`renders ascii frame sections`), change:

```typescript
// OLD
expect(frame).toContain('+');

// NEW
expect(frame).toContain('┌');
expect(frame).toContain('└');
expect(frame).toContain('│');
expect(frame).not.toContain('+');
```

**Step 2: Run the test to verify it fails**

Run: `npx vitest run source/components/DashboardFrame.test.tsx`
Expected: FAIL — frame still contains `+`, not `┌`

---

### Task 2: Replace ASCII with box-drawing in DashboardFrame

**Files:**

- Modify: `source/components/DashboardFrame.tsx`

**Step 1: Add BOX constant and update frame construction**

At the top of the file (after imports), add:

```typescript
const BOX = {
	topLeft: '┌',
	topRight: '┐',
	bottomLeft: '└',
	bottomRight: '┘',
	horizontal: '─',
	vertical: '│',
	teeRight: '├',
	teeLeft: '┤',
} as const;
```

**Step 2: Update `renderLine` function**

```typescript
// OLD
function renderLine(content: string, innerWidth: number): string {
	return `|${fit(content, innerWidth)}|`;
}

// NEW
function renderLine(content: string, innerWidth: number): string {
	return `${BOX.vertical}${fit(content, innerWidth)}${BOX.vertical}`;
}
```

**Step 3: Update frame variables in the component body**

Replace lines 142-145:

```typescript
// OLD
const border = `+${'-'.repeat(innerWidth)}+`;
const separator = `|${'-'.repeat(innerWidth)}|`;

// NEW
const topBorder = `${BOX.topLeft}${BOX.horizontal.repeat(innerWidth)}${BOX.topRight}`;
const bottomBorder = `${BOX.bottomLeft}${BOX.horizontal.repeat(innerWidth)}${BOX.bottomRight}`;
const separator = `${BOX.teeRight}${BOX.horizontal.repeat(innerWidth)}${BOX.teeLeft}`;
```

**Step 4: Update JSX references**

In the JSX return:

- Replace `<Text>{border}</Text>` (first occurrence, line 150) → `<Text>{topBorder}</Text>`
- Replace `<Text>{border}</Text>` (last occurrence, line 178) → `<Text>{bottomBorder}</Text>`
- Replace the two `<Text>|</Text>` in the input row (lines 174, 176) → `<Text>{BOX.vertical}</Text>`

**Step 5: Run tests**

Run: `npx vitest run source/components/DashboardFrame.test.tsx`
Expected: ALL PASS (3 tests)

**Step 6: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: No errors

---

### Task 3: Commit

**Step 1: Commit**

```bash
git add source/components/DashboardFrame.tsx source/components/DashboardFrame.test.tsx
git commit -m "feat(ui): replace ASCII frame with Unicode box-drawing characters"
```
