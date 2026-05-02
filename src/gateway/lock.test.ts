import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {acquireLock, GatewayAlreadyRunningError} from './lock';

describe('acquireLock', () => {
	let dir: string;
	let lockPath: string;
	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-lock-'));
		lockPath = path.join(dir, 'sub', 'gw.lock');
	});
	afterEach(() => {
		try {
			fs.rmSync(dir, {recursive: true, force: true});
		} catch {
			// best-effort
		}
	});

	it('creates the lockfile and writes the pid', () => {
		const handle = acquireLock(lockPath);
		expect(handle.pid).toBe(process.pid);
		expect(fs.readFileSync(lockPath, 'utf-8').trim()).toBe(String(process.pid));
		handle.release();
		expect(fs.existsSync(lockPath)).toBe(false);
	});

	it('reclaims a stale lockfile (pid not alive)', () => {
		// Choose a pid we know is dead. Using max pid (4 million on Linux,
		// 99999 on macOS) is unreliable; pick 1 (init) is alive on Linux.
		// Use a large unlikely pid + verify with kill(pid, 0) before claiming.
		fs.mkdirSync(path.dirname(lockPath), {recursive: true});
		// Pick a pid that's almost certainly dead — well above the typical
		// pid_max but small enough not to overflow signed int.
		const probablyDeadPid = 0x7ffffffe;
		fs.writeFileSync(lockPath, String(probablyDeadPid) + '\n');
		const handle = acquireLock(lockPath);
		expect(handle.pid).toBe(process.pid);
		handle.release();
	});

	it('throws GatewayAlreadyRunningError when a live pid owns the lock', () => {
		fs.mkdirSync(path.dirname(lockPath), {recursive: true});
		fs.writeFileSync(lockPath, String(process.pid) + '\n');
		expect(() => acquireLock(lockPath)).toThrow(GatewayAlreadyRunningError);
	});
});
