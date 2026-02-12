# Fix Permission Prompt Input Wiring

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Diagnose and fix why permission dialog keyboard input doesn't reach the response handler — permission requests render but user can't allow/deny them.

**Architecture:** The permission flow is: hook-forwarder → UDS → eventHandlers dispatch → usePermissionQueue → PermissionDialog renders → useInput captures keys → onDecision → resolvePermission → socket response. The break is somewhere in this chain.

**Tech Stack:** Ink (React for CLIs), useInput hook, Unix Domain Sockets, vitest

---

## Context: In-Flight Refactoring

There is an uncommitted refactoring that merged `handleSafeToolAutoAllow` + `handlePermissionCheck` into a single `handlePermissionCheck` function. The build passes but 6 tests fail because they still test the old two-function API. This refactoring also touched `useHookServer.ts` (split the always-allow/always-deny rule creation into separate branches). These changes need to be completed first.

---

### Task 1: Fix Failing eventHandlers Tests

**Files:**

- Modify: `source/hooks/eventHandlers.test.ts`

The merged `handlePermissionCheck` now handles BOTH safe tools (auto-allow) and dangerous tools (enqueue permission). Tests that call `handleSafeToolAutoAllow` or test `handlePermissionCheck` returning `false` for safe tools need updating.

**Step 1: Read failing tests and identify what changed**

Run: `npx vitest run source/hooks/eventHandlers.test.ts 2>&1 | grep -E '(FAIL|✕|×|AssertionError|toBe)'`

Identify the 6 failing tests. They likely:

- Reference `handleSafeToolAutoAllow` (removed function)
- Expect `handlePermissionCheck` to return `false` for safe tools (now returns `true` and auto-allows)
- Expect separate handler behavior that's now unified

**Step 2: Update tests to match merged handler behavior**

For each failing test:

- If it tested `handleSafeToolAutoAllow` directly → merge into `handlePermissionCheck` test group
- If it expected `false` for safe tools → now expect `true` with `cb.respond()` called (auto-allow)
- If it expected `false` for non-PreToolUse → still expect `false` (guard clause unchanged)
- Verify: dangerous tools → `cb.enqueuePermission()` called, safe tools → `cb.respond()` with allow result

**Step 3: Run tests**

Run: `npx vitest run source/hooks/eventHandlers.test.ts`
Expected: All 45 tests pass (some renamed/restructured)

**Step 4: Commit**

```bash
git add source/hooks/eventHandlers.ts source/hooks/eventHandlers.test.ts source/hooks/useHookServer.ts
git commit -m "refactor: merge safe-tool and permission-check handlers into single dispatch"
```

---

### Task 2: Investigate the Actual Input Wiring Issue

**Goal:** Determine exactly WHERE input breaks in the permission flow. This is a diagnostic task — do NOT write code yet.

**Key question:** In Ink, `useInput` broadcasts stdin data to ALL active listeners. Multiple `useInput` hooks don't block each other. So the issue is likely NOT that TaskList "steals" input.

**Possible root causes to investigate:**

1. **PermissionDialog not mounting**: Is `appMode.type` actually `'permission'` when permission events arrive? Add a `console.error('PERM DIALOG MOUNTED')` temporarily and test.

2. **`useInput` not firing**: Ink's `useInput` requires raw mode on stdin. If something disables raw mode, no `useInput` handler fires. Check if `setRawMode` is called anywhere.

3. **`onDecision` callback stale or broken**: Check if `handlePermissionDecision` in app.tsx has a stale closure over `currentPermissionRequest`.

4. **`resolvePermission` failing silently**: The function looks up the pending request in a ref Map. If the request was already removed (timeout, socket close), the function would no-op.

5. **Auto-passthrough timeout firing first**: `storeWithoutPassthrough` is used for permission events, so they should NOT auto-timeout. Verify this is still the case after the refactoring.

**Steps:**

1. Read `source/hooks/useHookServer.ts` — verify `storeWithoutPassthrough` does NOT set a timeout
2. Read `source/app.tsx` lines 200-215 — verify `handlePermissionDecision` uses current state
3. Check if there's a race: does the socket close before the user responds?
4. Test manually: run athena-cli, trigger a dangerous tool, see if dialog renders, press 'a', check if response is sent

**Capture findings in a comment at top of this plan before proceeding to Task 3.**

---

### Task 3: Write a Failing Integration Test

**Files:**

- Modify: `source/hooks/eventHandlers.test.ts` OR create `source/components/PermissionDialog.test.tsx` test

Based on findings from Task 2, write a test that reproduces the exact failure:

- If the issue is the handler chain: test that `handlePermissionCheck` stores the request correctly for both safe and dangerous tools
- If the issue is the UI: test that PermissionDialog's `onDecision` is callable after render
- If the issue is socket response: test that `resolvePermission` writes to socket

**Step 1: Write the failing test**
**Step 2: Run it to confirm it fails**
**Step 3: Commit the failing test**

---

### Task 4: Fix the Root Cause

Based on Tasks 2-3, implement the minimal fix. Possible fixes depending on root cause:

- **If TaskList useInput conflict** (unlikely but possible in specific Ink versions): Add `dialogActive` prop to TaskList, set `isActive: !!onToggle && !dialogActive`
- **If stale closure**: Fix dependency array in `useCallback` for `handlePermissionDecision`
- **If auto-passthrough race**: Ensure merged handler still calls `storeWithoutPassthrough` before `enqueuePermission` (it does in current diff — verify)
- **If raw mode issue**: Ensure stdin raw mode is maintained

**Step 1: Implement fix**
**Step 2: Run the failing test from Task 3 — should now pass**
**Step 3: Run full test suite: `npx vitest run`**
**Step 4: Run lint: `npm run lint`**
**Step 5: Run typecheck: `npm run build`**
**Step 6: Commit**

---

### Task 5: Add Defensive Guard to TaskList (Low Priority)

Even if TaskList's `useInput` isn't the root cause, it's good practice to disable it during dialogs.

**Files:**

- Modify: `source/components/TaskList.tsx` — add `dialogActive?: boolean` prop, update `isActive`
- Modify: `source/app.tsx` line 368-372 — pass `dialogActive` prop
- Modify: `source/components/TaskList.test.tsx` (if exists) — add test

**Step 1: Write failing test** — render TaskList with `dialogActive=true`, simulate Ctrl+T, verify `onToggle` NOT called
**Step 2: Implement** — add prop, update `isActive: !!onToggle && !dialogActive`
**Step 3: Run tests**
**Step 4: Commit**
