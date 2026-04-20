import {describe, expect, it} from 'vitest';
import {resolvePortableAuthSettings} from './portableAuth';

describe('resolvePortableAuthSettings', () => {
	it('returns null when no portable auth is configured in Claude settings', () => {
		const result = resolvePortableAuthSettings({
			cwd: '/repo',
			homeDir: '/home/test',
			readFileFn: () => {
				throw new Error('missing');
			},
		});

		expect(result).toBeNull();
	});

	it('extracts only portable auth fields from settings env blocks', () => {
		const result = resolvePortableAuthSettings({
			cwd: '/repo',
			homeDir: '/home/test',
			readFileFn: filePath => {
				if (filePath === '/home/test/.claude/settings.json') {
					return JSON.stringify({
						env: {
							ANTHROPIC_API_KEY: 'sk-ant-api03-user',
							UNRELATED_VALUE: 'should-not-leak',
						},
						model: 'opus',
					});
				}
				throw new Error('missing');
			},
		});

		expect(result).toEqual({
			env: {ANTHROPIC_API_KEY: 'sk-ant-api03-user'},
		});
	});

	it('uses the highest-precedence settings value across user, project, and local', () => {
		const result = resolvePortableAuthSettings({
			cwd: '/repo',
			homeDir: '/home/test',
			readFileFn: filePath => {
				if (filePath === '/home/test/.claude/settings.json') {
					return JSON.stringify({
						env: {ANTHROPIC_API_KEY: 'sk-ant-api03-user'},
						apiKeyHelper: '/bin/user-helper',
					});
				}
				if (filePath === '/repo/.claude/settings.json') {
					return JSON.stringify({
						env: {ANTHROPIC_AUTH_TOKEN: 'project-auth-token'},
						apiKeyHelper: '/bin/project-helper',
					});
				}
				if (filePath === '/repo/.claude/settings.local.json') {
					return JSON.stringify({
						env: {ANTHROPIC_API_KEY: 'sk-ant-api03-local'},
					});
				}
				throw new Error('missing');
			},
		});

		expect(result).toEqual({
			env: {
				ANTHROPIC_API_KEY: 'sk-ant-api03-local',
				ANTHROPIC_AUTH_TOKEN: 'project-auth-token',
			},
			apiKeyHelper: '/bin/project-helper',
		});
	});

	it('respects CLAUDE_CONFIG_DIR for user settings and carries provider env vars', () => {
		const result = resolvePortableAuthSettings({
			cwd: '/repo',
			homeDir: '/home/test',
			env: {CLAUDE_CONFIG_DIR: '/custom/claude'},
			readFileFn: filePath => {
				if (filePath === '/custom/claude/settings.json') {
					return JSON.stringify({
						env: {
							CLAUDE_CODE_USE_VERTEX: '1',
							GOOGLE_APPLICATION_CREDENTIALS: '/secrets/vertex.json',
							UNRELATED_VALUE: 'ignore-me',
						},
					});
				}
				throw new Error('missing');
			},
		});

		expect(result).toEqual({
			env: {
				CLAUDE_CODE_USE_VERTEX: '1',
				GOOGLE_APPLICATION_CREDENTIALS: '/secrets/vertex.json',
			},
		});
	});
});
