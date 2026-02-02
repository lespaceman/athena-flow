import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import * as childProcess from 'node:child_process';
import {spawnClaude, type SpawnClaudeOptions} from './spawnClaude.js';
import {EventEmitter} from 'node:events';

// Mock cleanup function
const mockCleanup = vi.fn();

// Mock generateHookSettings before importing spawnClaude
vi.mock('./generateHookSettings.js', () => ({
	generateHookSettings: vi.fn(() => ({
		settingsPath: '/tmp/mock-settings.json',
		cleanup: mockCleanup,
	})),
	registerCleanupOnExit: vi.fn(),
}));

// Create a mock ChildProcess with event emitter based stdout/stderr
function createMockChildProcess() {
	const stdout = new EventEmitter();
	const stderr = new EventEmitter();
	const mockProcess = new EventEmitter() as childProcess.ChildProcess & {
		stdout: EventEmitter;
		stderr: EventEmitter;
		kill: () => boolean;
	};
	mockProcess.stdout = stdout;
	mockProcess.stderr = stderr;
	mockProcess.kill = vi.fn().mockReturnValue(true);
	return mockProcess;
}

vi.mock('node:child_process', () => ({
	spawn: vi.fn(),
}));

describe('spawnClaude', () => {
	let mockChildProcess: ReturnType<typeof createMockChildProcess>;

	beforeEach(() => {
		mockChildProcess = createMockChildProcess();
		vi.mocked(childProcess.spawn).mockReturnValue(mockChildProcess);
		mockCleanup.mockClear();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('should spawn claude with headless arguments and instance ID env var', () => {
		const options: SpawnClaudeOptions = {
			prompt: 'Hello, Claude!',
			projectDir: '/test/project',
			instanceId: 12345,
		};

		spawnClaude(options);

		expect(childProcess.spawn).toHaveBeenCalledWith(
			'claude',
			expect.arrayContaining([
				'-p',
				'Hello, Claude!',
				'--output-format',
				'stream-json',
			]),
			expect.objectContaining({
				cwd: '/test/project',
				stdio: ['ignore', 'pipe', 'pipe'],
				env: expect.objectContaining({
					ATHENA_INSTANCE_ID: '12345',
				}),
			}),
		);
	});

	it('should return the child process', () => {
		const options: SpawnClaudeOptions = {
			prompt: 'Test prompt',
			projectDir: '/test/project',
			instanceId: 12345,
		};

		const result = spawnClaude(options);

		expect(result).toBe(mockChildProcess);
	});

	it('should call onStdout when stdout emits data', () => {
		const onStdout = vi.fn();
		const options: SpawnClaudeOptions = {
			prompt: 'Test',
			projectDir: '/test',
			instanceId: 12345,
			onStdout,
		};

		spawnClaude(options);
		// Emit data event after handler is attached
		mockChildProcess.stdout.emit('data', Buffer.from('stdout data'));

		expect(onStdout).toHaveBeenCalledWith('stdout data');
	});

	it('should call onStderr when stderr emits data', () => {
		const onStderr = vi.fn();
		const options: SpawnClaudeOptions = {
			prompt: 'Test',
			projectDir: '/test',
			instanceId: 12345,
			onStderr,
		};

		spawnClaude(options);
		// Emit data event after handler is attached
		mockChildProcess.stderr.emit('data', Buffer.from('stderr data'));

		expect(onStderr).toHaveBeenCalledWith('stderr data');
	});

	it('should call onExit when process exits', () => {
		const onExit = vi.fn();
		const options: SpawnClaudeOptions = {
			prompt: 'Test',
			projectDir: '/test',
			instanceId: 12345,
			onExit,
		};

		spawnClaude(options);
		mockChildProcess.emit('exit', 0);

		expect(onExit).toHaveBeenCalledWith(0);
	});

	it('should work without callbacks', () => {
		const options: SpawnClaudeOptions = {
			prompt: 'Test',
			projectDir: '/test',
			instanceId: 12345,
		};

		// Should not throw
		expect(() => spawnClaude(options)).not.toThrow();
	});

	it('should call onError when spawn fails', () => {
		const onError = vi.fn();
		const options: SpawnClaudeOptions = {
			prompt: 'Test',
			projectDir: '/test',
			instanceId: 12345,
			onError,
		};

		spawnClaude(options);
		const spawnError = new Error('spawn claude ENOENT');
		mockChildProcess.emit('error', spawnError);

		expect(onError).toHaveBeenCalledWith(spawnError);
	});

	it('should not throw when onError is not provided and error occurs', () => {
		const options: SpawnClaudeOptions = {
			prompt: 'Test',
			projectDir: '/test',
			instanceId: 12345,
		};

		spawnClaude(options);

		// Should not throw when error event is emitted without handler
		expect(() => {
			mockChildProcess.emit('error', new Error('spawn claude ENOENT'));
		}).not.toThrow();
	});

	it('should not include --resume flag when sessionId is not provided', () => {
		const options: SpawnClaudeOptions = {
			prompt: 'Test',
			projectDir: '/test',
			instanceId: 12345,
		};

		spawnClaude(options);

		const args = vi.mocked(childProcess.spawn).mock.calls[0]?.[1] as string[];
		expect(args).not.toContain('--resume');
	});

	it('should include --resume flag with sessionId when provided', () => {
		const options: SpawnClaudeOptions = {
			prompt: 'Test',
			projectDir: '/test',
			instanceId: 12345,
			sessionId: 'abc-123-session-id',
		};

		spawnClaude(options);

		const args = vi.mocked(childProcess.spawn).mock.calls[0]?.[1] as string[];
		expect(args).toContain('--resume');
		expect(args).toContain('abc-123-session-id');
	});

	describe('isolation', () => {
		it('should include --settings flag with generated settings path', () => {
			const options: SpawnClaudeOptions = {
				prompt: 'Test',
				projectDir: '/test',
				instanceId: 12345,
			};

			spawnClaude(options);

			const args = vi.mocked(childProcess.spawn).mock.calls[0]?.[1] as string[];
			expect(args).toContain('--settings');
			expect(args).toContain('/tmp/mock-settings.json');
		});

		it('should include --setting-sources with user by default (strict preset)', () => {
			const options: SpawnClaudeOptions = {
				prompt: 'Test',
				projectDir: '/test',
				instanceId: 12345,
			};

			spawnClaude(options);

			const args = vi.mocked(childProcess.spawn).mock.calls[0]?.[1] as string[];
			expect(args).toContain('--setting-sources');
			expect(args).toContain('user');
		});

		it('should include --strict-mcp-config by default (strict preset)', () => {
			const options: SpawnClaudeOptions = {
				prompt: 'Test',
				projectDir: '/test',
				instanceId: 12345,
			};

			spawnClaude(options);

			const args = vi.mocked(childProcess.spawn).mock.calls[0]?.[1] as string[];
			expect(args).toContain('--strict-mcp-config');
		});

		it('should not include --strict-mcp-config for minimal preset', () => {
			const options: SpawnClaudeOptions = {
				prompt: 'Test',
				projectDir: '/test',
				instanceId: 12345,
				isolation: 'minimal',
			};

			spawnClaude(options);

			const args = vi.mocked(childProcess.spawn).mock.calls[0]?.[1] as string[];
			expect(args).not.toContain('--strict-mcp-config');
		});

		it('should include user,project setting sources for permissive preset', () => {
			const options: SpawnClaudeOptions = {
				prompt: 'Test',
				projectDir: '/test',
				instanceId: 12345,
				isolation: 'permissive',
			};

			spawnClaude(options);

			const args = vi.mocked(childProcess.spawn).mock.calls[0]?.[1] as string[];
			expect(args).toContain('--setting-sources');
			expect(args).toContain('user,project');
		});

		it('should include allowed tools when specified', () => {
			const options: SpawnClaudeOptions = {
				prompt: 'Test',
				projectDir: '/test',
				instanceId: 12345,
				isolation: {
					allowedTools: ['Read', 'Write'],
				},
			};

			spawnClaude(options);

			const args = vi.mocked(childProcess.spawn).mock.calls[0]?.[1] as string[];
			expect(args).toContain('--allowed-tools');
			expect(args).toContain('Read');
			expect(args).toContain('Write');
		});

		it('should include disallowed tools when specified', () => {
			const options: SpawnClaudeOptions = {
				prompt: 'Test',
				projectDir: '/test',
				instanceId: 12345,
				isolation: {
					disallowedTools: ['Bash'],
				},
			};

			spawnClaude(options);

			const args = vi.mocked(childProcess.spawn).mock.calls[0]?.[1] as string[];
			expect(args).toContain('--disallowed-tools');
			expect(args).toContain('Bash');
		});

		it('should include permission mode when specified', () => {
			const options: SpawnClaudeOptions = {
				prompt: 'Test',
				projectDir: '/test',
				instanceId: 12345,
				isolation: {
					permissionMode: 'auto-accept-all',
				},
			};

			spawnClaude(options);

			const args = vi.mocked(childProcess.spawn).mock.calls[0]?.[1] as string[];
			expect(args).toContain('--permission-mode');
			expect(args).toContain('auto-accept-all');
		});

		it('should include custom mcp config when specified', () => {
			const options: SpawnClaudeOptions = {
				prompt: 'Test',
				projectDir: '/test',
				instanceId: 12345,
				isolation: {
					mcpConfig: '/path/to/mcp.json',
				},
			};

			spawnClaude(options);

			const args = vi.mocked(childProcess.spawn).mock.calls[0]?.[1] as string[];
			expect(args).toContain('--mcp-config');
			expect(args).toContain('/path/to/mcp.json');
		});

		it('should cleanup settings file on process exit', () => {
			const options: SpawnClaudeOptions = {
				prompt: 'Test',
				projectDir: '/test',
				instanceId: 12345,
			};

			spawnClaude(options);

			// Cleanup should not be called yet
			expect(mockCleanup).not.toHaveBeenCalled();

			// Emit exit event
			mockChildProcess.emit('exit', 0);

			// Cleanup should be called
			expect(mockCleanup).toHaveBeenCalled();
		});

		it('should cleanup settings file on process error', () => {
			const options: SpawnClaudeOptions = {
				prompt: 'Test',
				projectDir: '/test',
				instanceId: 12345,
			};

			spawnClaude(options);

			// Emit error event
			mockChildProcess.emit('error', new Error('spawn failed'));

			// Cleanup should be called
			expect(mockCleanup).toHaveBeenCalled();
		});

		it('should not pass --strict-mcp-config when mcpConfig is provided', () => {
			const options: SpawnClaudeOptions = {
				prompt: 'Test',
				projectDir: '/test',
				instanceId: 12345,
				isolation: {
					strictMcpConfig: true,
					mcpConfig: '/path/to/merged-mcp.json',
				},
			};

			spawnClaude(options);

			const args = vi.mocked(childProcess.spawn).mock.calls[0]?.[1] as string[];
			expect(args).toContain('--mcp-config');
			expect(args).toContain('/path/to/merged-mcp.json');
			expect(args).not.toContain('--strict-mcp-config');
		});

		it('should merge preset with custom config', () => {
			const options: SpawnClaudeOptions = {
				prompt: 'Test',
				projectDir: '/test',
				instanceId: 12345,
				isolation: {
					preset: 'strict',
					allowedTools: ['Read'],
				},
			};

			spawnClaude(options);

			const args = vi.mocked(childProcess.spawn).mock.calls[0]?.[1] as string[];
			// Should have strict preset's settings
			expect(args).toContain('--strict-mcp-config');
			expect(args).toContain('--setting-sources');
			// Plus custom allowed tools
			expect(args).toContain('--allowed-tools');
			expect(args).toContain('Read');
		});
	});
});
