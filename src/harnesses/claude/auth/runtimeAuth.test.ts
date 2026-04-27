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

	it('forwards a keychain OAuth token via CLAUDE_CODE_OAUTH_TOKEN env, not apiKeyHelper', () => {
		// OAuth access tokens must travel as Authorization: Bearer headers.
		// apiKeyHelper output is sent as x-api-key, which Anthropic rejects with
		// "Invalid API key" for OAuth tokens. Forward the token through the
		// CLAUDE_CODE_OAUTH_TOKEN env slot, which Claude Code routes via Bearer.
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
			env: {CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-from-keychain'},
		});
	});

	it('synthesizes an apiKeyHelper for a discovered API key credential', () => {
		const result = resolveRuntimeAuthOverlay({
			cwd: '/repo',
			homeDir: '/home/test',
			platform: 'darwin',
			env: {ANTHROPIC_API_KEY: 'sk-ant-api03-from-env'},
			readFileFn: () => {
				throw new Error('missing');
			},
			keychainLookupFn: () => null,
			runHelperFn: () => null,
		});

		expect(result).toEqual({
			apiKeyHelper: "printf %s 'sk-ant-api03-from-env'",
		});
	});

	it('forwards an authToken credential via ANTHROPIC_AUTH_TOKEN env', () => {
		const result = resolveRuntimeAuthOverlay({
			cwd: '/repo',
			homeDir: '/home/test',
			platform: 'darwin',
			env: {ANTHROPIC_AUTH_TOKEN: 'auth-token-value'},
			readFileFn: () => {
				throw new Error('missing');
			},
			keychainLookupFn: () => null,
			runHelperFn: () => null,
		});

		expect(result).toEqual({
			env: {ANTHROPIC_AUTH_TOKEN: 'auth-token-value'},
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
