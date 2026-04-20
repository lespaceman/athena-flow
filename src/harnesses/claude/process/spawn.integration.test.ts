import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as childProcess from 'node:child_process';
import {EventEmitter} from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('node:child_process', () => ({
	spawn: vi.fn(),
}));

vi.mock('../system/resolveBinary', () => ({
	resolveClaudeBinary: vi.fn(() => '/resolved/claude'),
}));

vi.mock('../hooks/generateHookSettings', async importOriginal => {
	const actual =
		await importOriginal<typeof import('../hooks/generateHookSettings')>();
	return {
		...actual,
		resolveHookForwarderCommand: vi.fn(),
	};
});

import {spawnClaude} from './spawn';
import {resolveClaudeBinary} from '../system/resolveBinary';
import {resolveHookForwarderCommand} from '../hooks/generateHookSettings';

function createMockChildProcess() {
	const stdout = new EventEmitter();
	const stderr = new EventEmitter();
	return Object.assign(new EventEmitter(), {
		stdout,
		stderr,
		kill: vi.fn().mockReturnValue(true),
	}) as unknown as childProcess.ChildProcess & {
		stdout: EventEmitter;
		stderr: EventEmitter;
		kill: ReturnType<typeof vi.fn>;
	};
}

describe('spawnClaude integration', () => {
	let tempRoot: string;
	let projectDir: string;
	let configDir: string;
	let forwarderPath: string;
	let child: ReturnType<typeof createMockChildProcess>;
	const priorClaudeConfigDir = process.env['CLAUDE_CONFIG_DIR'];
	const priorOauthToken = process.env['CLAUDE_CODE_OAUTH_TOKEN'];

	beforeEach(() => {
		tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-spawn-int-'));
		projectDir = path.join(tempRoot, 'repo');
		configDir = path.join(tempRoot, 'claude-config');
		forwarderPath = path.join(tempRoot, 'hook-forwarder.js');
		fs.mkdirSync(projectDir, {recursive: true});
		fs.mkdirSync(configDir, {recursive: true});
		fs.writeFileSync(forwarderPath, 'console.log("ok");');

		child = createMockChildProcess();
		vi.mocked(childProcess.spawn).mockReturnValue(child);
		vi.mocked(resolveClaudeBinary).mockReturnValue('/resolved/claude');
		vi.mocked(resolveHookForwarderCommand).mockReturnValue({
			command: `'${process.execPath}' '${forwarderPath}'`,
			executable: process.execPath,
			args: [forwarderPath],
			source: 'bundled',
			scriptPath: forwarderPath,
		});
	});

	afterEach(() => {
		if (priorClaudeConfigDir === undefined) {
			delete process.env['CLAUDE_CONFIG_DIR'];
		} else {
			process.env['CLAUDE_CONFIG_DIR'] = priorClaudeConfigDir;
		}
		if (priorOauthToken === undefined) {
			delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
		} else {
			process.env['CLAUDE_CODE_OAUTH_TOKEN'] = priorOauthToken;
		}
		fs.rmSync(tempRoot, {recursive: true, force: true});
		vi.clearAllMocks();
	});

	it('generates strict settings that preserve portable auth from CLAUDE_CONFIG_DIR without leaking unrelated settings', () => {
		process.env['CLAUDE_CONFIG_DIR'] = configDir;
		fs.writeFileSync(
			path.join(configDir, 'settings.json'),
			JSON.stringify({
				env: {
					CLAUDE_CODE_USE_VERTEX: '1',
					GOOGLE_APPLICATION_CREDENTIALS: '/secrets/vertex.json',
				},
				apiKeyHelper: '/bin/provider-helper',
				model: 'claude-sonnet-4-5',
				permissions: {deny: ['Read(./secrets/**)']},
			}),
		);

		spawnClaude({
			prompt: 'Test portable auth overlay',
			projectDir,
			instanceId: 7,
		});

		const args = vi.mocked(childProcess.spawn).mock.calls[0]?.[1] as string[];
		const settingsIdx = args.indexOf('--settings');
		const settingsPath = args[settingsIdx + 1]!;
		const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
			hooks: Record<string, unknown>;
			env?: Record<string, string>;
			apiKeyHelper?: string;
			model?: string;
			permissions?: unknown;
		};

		expect(args).toContain('--setting-sources');
		expect(args[args.indexOf('--setting-sources') + 1]).toBe('');
		expect(settings.hooks).toBeDefined();
		expect(settings.env).toEqual({
			CLAUDE_CODE_USE_VERTEX: '1',
			GOOGLE_APPLICATION_CREDENTIALS: '/secrets/vertex.json',
		});
		expect(settings.apiKeyHelper).toBe('/bin/provider-helper');
		expect(settings.model).toBeUndefined();
		expect(settings.permissions).toBeUndefined();
		expect(fs.statSync(settingsPath).mode & 0o077).toBe(0);

		child.emit('exit', 0);
		expect(fs.existsSync(settingsPath)).toBe(false);
	});

	it('applies Claude settings precedence end-to-end when building the strict overlay', () => {
		process.env['CLAUDE_CONFIG_DIR'] = configDir;
		fs.mkdirSync(path.join(projectDir, '.claude'), {recursive: true});

		fs.writeFileSync(
			path.join(configDir, 'settings.json'),
			JSON.stringify({
				env: {ANTHROPIC_API_KEY: 'sk-ant-api03-user'},
				apiKeyHelper: '/bin/user-helper',
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, '.claude', 'settings.json'),
			JSON.stringify({
				env: {ANTHROPIC_AUTH_TOKEN: 'project-auth-token'},
				apiKeyHelper: '/bin/project-helper',
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, '.claude', 'settings.local.json'),
			JSON.stringify({
				env: {ANTHROPIC_API_KEY: 'sk-ant-api03-local'},
			}),
		);

		spawnClaude({
			prompt: 'Test settings precedence',
			projectDir,
			instanceId: 9,
		});

		const args = vi.mocked(childProcess.spawn).mock.calls[0]?.[1] as string[];
		const settingsPath = args[args.indexOf('--settings') + 1]!;
		const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
			env?: Record<string, string>;
			apiKeyHelper?: string;
		};

		expect(settings.env).toEqual({
			ANTHROPIC_API_KEY: 'sk-ant-api03-local',
			ANTHROPIC_AUTH_TOKEN: 'project-auth-token',
		});
		expect(settings.apiKeyHelper).toBe('/bin/project-helper');

		child.emit('exit', 0);
		expect(fs.existsSync(settingsPath)).toBe(false);
	});

	it('synthesizes an apiKeyHelper fallback when only oauth env is discoverable', () => {
		delete process.env['CLAUDE_CONFIG_DIR'];
		process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-oat01-env-token';

		spawnClaude({
			prompt: 'Test oauth helper fallback',
			projectDir,
			instanceId: 11,
		});

		const args = vi.mocked(childProcess.spawn).mock.calls[0]?.[1] as string[];
		const settingsPath = args[args.indexOf('--settings') + 1]!;
		const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
			env?: Record<string, string>;
			apiKeyHelper?: string;
		};

		expect(settings.env).toBeUndefined();
		expect(settings.apiKeyHelper).toBe("printf %s 'sk-ant-oat01-env-token'");

		child.emit('exit', 0);
		expect(fs.existsSync(settingsPath)).toBe(false);
	});
});
