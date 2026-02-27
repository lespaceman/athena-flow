import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {spawn, type ChildProcess} from 'node:child_process';
import {processRegistry} from '../shared/utils/processRegistry';

describe('processRegistry', () => {
	beforeEach(() => {
		// Ensure registry is empty before each test
		processRegistry.killAll();
	});

	afterEach(() => {
		// Clean up after each test
		processRegistry.killAll();
	});

	it('should register a process and track it', () => {
		const child = spawn('sleep', ['10']);
		expect(child.pid).toBeDefined();

		processRegistry.register(child);
		expect(processRegistry.size).toBe(1);

		// Cleanup
		child.kill();
	});

	it('should auto-unregister when process exits', async () => {
		const child = spawn('echo', ['test']);
		processRegistry.register(child);

		expect(processRegistry.size).toBe(1);

		// Wait for process to exit
		await new Promise<void>(resolve => {
			child.on('exit', () => resolve());
		});

		expect(processRegistry.size).toBe(0);
	});

	it('should manually unregister a process', () => {
		const child = spawn('sleep', ['10']);
		processRegistry.register(child);
		expect(processRegistry.size).toBe(1);

		if (child.pid !== undefined) {
			processRegistry.unregister(child.pid);
		}
		expect(processRegistry.size).toBe(0);

		// Cleanup
		child.kill();
	});

	it('should kill all registered processes', () => {
		const child1 = spawn('sleep', ['10']);
		const child2 = spawn('sleep', ['10']);

		processRegistry.register(child1);
		processRegistry.register(child2);
		expect(processRegistry.size).toBe(2);

		processRegistry.killAll();
		expect(processRegistry.size).toBe(0);
	});

	it('should handle process without pid (spawn failure)', () => {
		// Create a mock process without pid
		const mockProcess = {
			pid: undefined,
			once: vi.fn(),
			kill: vi.fn(),
		} as unknown as ChildProcess;

		// Should not throw
		processRegistry.register(mockProcess);
		expect(processRegistry.size).toBe(0);
	});

	it('should handle killAll with already-exited processes gracefully', () => {
		const child = spawn('echo', ['test']);
		processRegistry.register(child);

		// Kill it manually first
		child.kill();

		// Should not throw when trying to kill again
		expect(() => processRegistry.killAll()).not.toThrow();
	});

	it('should track multiple processes independently', async () => {
		const child1 = spawn('sleep', ['10']);
		const child2 = spawn('echo', ['test']);

		processRegistry.register(child1);
		processRegistry.register(child2);
		expect(processRegistry.size).toBe(2);

		// Wait for echo to finish
		await new Promise<void>(resolve => {
			child2.on('exit', () => resolve());
		});

		// Only sleep should remain
		expect(processRegistry.size).toBe(1);

		// Cleanup
		child1.kill();
	});
});
