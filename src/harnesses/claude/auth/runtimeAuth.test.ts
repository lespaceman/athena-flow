import {describe, expect, it} from 'vitest';
import {
	buildInlineApiKeyHelperCommand,
	resolveRuntimeAuthOverlay,
} from './runtimeAuth';

describe('buildInlineApiKeyHelperCommand', () => {
	it('shell-quotes embedded single quotes', () => {
		expect(buildInlineApiKeyHelperCommand("weird'key")).toBe(
			"printf %s 'weird'\\''key'",
		);
	});
});

describe('resolveRuntimeAuthOverlay', () => {
	it('preserves a portable settings env overlay without synthesizing a helper', () => {
		const result = resolveRuntimeAuthOverlay({
			cwd: '/repo',
			homeDir: '/home/test',
			readFileFn: filePath => {
				if (filePath === '/home/test/.claude/settings.json') {
					return JSON.stringify({
						env: {ANTHROPIC_API_KEY: 'sk-ant-api03-user'},
					});
				}
				throw new Error('missing');
			},
			keychainLookupFn: () =>
				JSON.stringify({
					claudeAiOauth: {accessToken: 'sk-ant-oat01-from-keychain'},
				}),
		});

		expect(result).toEqual({
			env: {ANTHROPIC_API_KEY: 'sk-ant-api03-user'},
		});
	});

	it('preserves a portable settings apiKeyHelper without replacing it', () => {
		const result = resolveRuntimeAuthOverlay({
			cwd: '/repo',
			homeDir: '/home/test',
			readFileFn: filePath => {
				if (filePath === '/home/test/.claude/settings.json') {
					return JSON.stringify({
						apiKeyHelper: '/bin/get-portable-auth',
					});
				}
				throw new Error('missing');
			},
			runHelperFn: () => 'sk-ant-api03-from-helper',
		});

		expect(result).toEqual({
			apiKeyHelper: '/bin/get-portable-auth',
		});
	});

	it('falls back to a synthesized apiKeyHelper for oauth-only users', () => {
		const result = resolveRuntimeAuthOverlay({
			cwd: '/repo',
			homeDir: '/home/test',
			platform: 'darwin',
			readFileFn: () => {
				throw new Error('missing');
			},
			keychainLookupFn: service =>
				service === 'Claude Code-credentials'
					? JSON.stringify({
							claudeAiOauth: {accessToken: 'sk-ant-oat01-from-keychain'},
						})
					: null,
			runHelperFn: () => null,
		});

		expect(result).toEqual({
			apiKeyHelper: "printf %s 'sk-ant-oat01-from-keychain'",
		});
	});

	it('returns null when no portable or discovered credential exists', () => {
		const result = resolveRuntimeAuthOverlay({
			cwd: '/repo',
			homeDir: '/home/test',
			readFileFn: () => {
				throw new Error('missing');
			},
			runHelperFn: () => null,
			keychainLookupFn: () => null,
		});

		expect(result).toBeNull();
	});
});
