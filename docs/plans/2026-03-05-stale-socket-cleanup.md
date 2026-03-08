# Stale Socket Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically remove stale Unix Domain Socket files from `.claude/run/` on startup, preventing unbounded accumulation of orphaned sockets from crashed/killed athena processes.

**Architecture:** Socket filenames encode the owning PID (`ink-{PID}.sock`). On startup, before creating its own socket, the UDS server sweeps the socket directory and removes any `ink-*.sock` file whose PID no longer exists (checked via `/proc/{PID}` on Linux or `process.kill(pid, 0)` cross-platform). This is a best-effort cleanup — failures are silently ignored. The logic lives in a standalone pure function for testability, called from `createServer.start()`.

**Tech Stack:** TypeScript 5.7, Node.js 20+, Vitest 3.0

---

### Task 1: Create `cleanupStaleSockets` utility function with tests

**Files:**

- Create: `src/harnesses/claude/runtime/cleanupStaleSockets.ts`
- Create: `src/harnesses/claude/runtime/__tests__/cleanupStaleSockets.test.ts`

**Step 1: Write the test file**

In `src/harnesses/claude/runtime/__tests__/cleanupStaleSockets.test.ts`:

```typescript
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {cleanupStaleSockets} from '../cleanupStaleSockets';

function makeTmpDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'athena-sock-cleanup-'));
}

describe('cleanupStaleSockets', () => {
	let sockDir: string;

	beforeEach(() => {
		sockDir = makeTmpDir();
	});

	afterEach(() => {
		fs.rmSync(sockDir, {recursive: true, force: true});
	});

	it('removes socket files whose PID does not exist', () => {
		// PID 999999999 almost certainly doesn't exist
		const stalePath = path.join(sockDir, 'ink-999999999.sock');
		fs.writeFileSync(stalePath, '');

		const removed = cleanupStaleSockets(sockDir);

		expect(removed).toEqual(['ink-999999999.sock']);
		expect(fs.existsSync(stalePath)).toBe(false);
	});

	it('preserves socket files whose PID is alive', () => {
		// Use our own PID — guaranteed alive
		const livePath = path.join(sockDir, `ink-${process.pid}.sock`);
		fs.writeFileSync(livePath, '');

		const removed = cleanupStaleSockets(sockDir);

		expect(removed).toEqual([]);
		expect(fs.existsSync(livePath)).toBe(true);
	});

	it('ignores non-socket files in the directory', () => {
		const otherFile = path.join(sockDir, 'something-else.txt');
		fs.writeFileSync(otherFile, '');

		const removed = cleanupStaleSockets(sockDir);

		expect(removed).toEqual([]);
		expect(fs.existsSync(otherFile)).toBe(true);
	});

	it('handles missing directory gracefully', () => {
		const removed = cleanupStaleSockets('/tmp/nonexistent-dir-athena-test');
		expect(removed).toEqual([]);
	});

	it('removes multiple stale sockets in one sweep', () => {
		fs.writeFileSync(path.join(sockDir, 'ink-999999991.sock'), '');
		fs.writeFileSync(path.join(sockDir, 'ink-999999992.sock'), '');
		fs.writeFileSync(path.join(sockDir, 'ink-999999993.sock'), '');

		const removed = cleanupStaleSockets(sockDir);

		expect(removed.sort()).toEqual([
			'ink-999999991.sock',
			'ink-999999992.sock',
			'ink-999999993.sock',
		]);
		expect(fs.readdirSync(sockDir)).toEqual([]);
	});

	it('skips files that do not match ink-{PID}.sock pattern', () => {
		fs.writeFileSync(path.join(sockDir, 'ink-.sock'), '');
		fs.writeFileSync(path.join(sockDir, 'ink-abc.sock'), '');
		fs.writeFileSync(path.join(sockDir, 'other-123.sock'), '');

		const removed = cleanupStaleSockets(sockDir);

		expect(removed).toEqual([]);
		expect(fs.readdirSync(sockDir).length).toBe(3);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/harnesses/claude/runtime/__tests__/cleanupStaleSockets.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

In `src/harnesses/claude/runtime/cleanupStaleSockets.ts`:

```typescript
/**
 * Sweeps .claude/run/ for stale ink-{PID}.sock files left by crashed processes.
 * Returns the list of filenames that were removed (for logging/testing).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const SOCK_PATTERN = /^ink-(\d+)\.sock$/;

function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export function cleanupStaleSockets(sockDir: string): string[] {
	let entries: string[];
	try {
		entries = fs.readdirSync(sockDir);
	} catch {
		return [];
	}

	const removed: string[] = [];
	for (const entry of entries) {
		const match = SOCK_PATTERN.exec(entry);
		if (!match) continue;

		const pid = parseInt(match[1]!, 10);
		if (isPidAlive(pid)) continue;

		try {
			fs.unlinkSync(path.join(sockDir, entry));
			removed.push(entry);
		} catch {
			// Best effort — file may have been removed concurrently
		}
	}

	return removed;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/harnesses/claude/runtime/__tests__/cleanupStaleSockets.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/harnesses/claude/runtime/cleanupStaleSockets.ts src/harnesses/claude/runtime/__tests__/cleanupStaleSockets.test.ts
git commit -m "feat: add cleanupStaleSockets utility for orphaned UDS files"
```

---

### Task 2: Wire cleanup into `createServer.start()`

**Files:**

- Modify: `src/harnesses/claude/runtime/server.ts:96-110`
- Modify: `src/harnesses/claude/runtime/__tests__/server.test.ts`

**Step 1: Write the integration test**

Add a new test to `src/harnesses/claude/runtime/__tests__/server.test.ts`:

```typescript
it('cleans up stale socket files on start', async () => {
	const projectDir = makeTmpDir();
	cleanup.push(() => fs.rmSync(projectDir, {recursive: true, force: true}));

	// Create the run directory and plant a stale socket
	const runDir = path.join(projectDir, '.claude', 'run');
	fs.mkdirSync(runDir, {recursive: true});
	const staleSock = path.join(runDir, 'ink-999999999.sock');
	fs.writeFileSync(staleSock, '');

	const runtime = createClaudeHookRuntime({projectDir, instanceId: 77});
	runtime.start();
	cleanup.push(() => runtime.stop());

	await new Promise(r => setTimeout(r, 100));

	// Stale socket should be gone; only the new one should remain
	const remaining = fs.readdirSync(runDir);
	expect(remaining).toEqual(['ink-77.sock']);
	expect(fs.existsSync(staleSock)).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/harnesses/claude/runtime/__tests__/server.test.ts`
Expected: FAIL — stale socket still exists because cleanup isn't wired in yet.

**Step 3: Wire cleanup into server.ts**

In `src/harnesses/claude/runtime/server.ts`, add the import at the top:

```typescript
import {cleanupStaleSockets} from './cleanupStaleSockets';
```

In the `start()` method (around line 97), add the cleanup call after `mkdirSync` and before `unlinkSync`:

```typescript
start(): void {
	const socketDir = path.join(projectDir, '.claude', 'run');
	socketPath = path.join(socketDir, `ink-${instanceId}.sock`);

	try {
		fs.mkdirSync(socketDir, {recursive: true});
	} catch {
		/* exists */
	}

	// Sweep stale sockets from previous crashed processes
	cleanupStaleSockets(socketDir);

	try {
		fs.unlinkSync(socketPath);
	} catch {
		/* doesn't exist */
	}
	// ... rest unchanged ...
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/harnesses/claude/runtime/__tests__/server.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/harnesses/claude/runtime/server.ts src/harnesses/claude/runtime/__tests__/server.test.ts
git commit -m "feat: sweep stale sockets on UDS server startup"
```

---

### Task 3: Final verification

**Step 1: Run full lint, typecheck, and test suite**

```bash
npm run typecheck
npm run lint
npm test
```

Expected: All PASS.

**Step 2: Run dead code detection**

```bash
npm run lint:dead
```

Expected: No new dead code introduced.

**Step 3: Manual smoke test**

Start the app, verify no stale socket files remain in `.claude/run/` after startup. Only the current process's socket should exist.

```bash
ls .claude/run/
```

Expected: Only `ink-{current_pid}.sock` present.

---

## Summary of changes

| File                                                                 | Change                                                   | Impact                                             |
| -------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| `src/harnesses/claude/runtime/cleanupStaleSockets.ts`                | New: pure function to sweep stale `ink-{PID}.sock` files | Testable, cross-platform PID liveness check        |
| `src/harnesses/claude/runtime/server.ts`                             | Call `cleanupStaleSockets` in `start()`                  | Prevents unbounded socket file accumulation        |
| `src/harnesses/claude/runtime/__tests__/cleanupStaleSockets.test.ts` | New: unit tests for the cleanup utility                  | 6 test cases covering alive/dead/missing/malformed |
| `src/harnesses/claude/runtime/__tests__/server.test.ts`              | New: integration test for cleanup on startup             | Verifies end-to-end wiring                         |

**Expected outcome:** Socket directory stays clean across sessions. The 38+ stale files observed in production would be removed on next athena startup.
