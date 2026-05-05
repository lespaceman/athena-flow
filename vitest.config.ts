import fs from 'node:fs';
import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		include: ['**/*.test.{ts,tsx}', 'test.tsx'],
		exclude: ['**/node_modules/**', '**/dist/**', '.worktrees/**'],
		environment: 'node',
	},
	define: {
		// Mirror tsup's build-time define so telemetry tests can exercise the client.
		// In CI the real key comes from POSTHOG_API_KEY env var; in local dev a
		// test-only placeholder keeps tests functional.
		// `||` (not `??`): in CI an unset secret is forwarded as an empty string
		// rather than undefined, and we want that to fall back to the placeholder
		// so telemetry tests still exercise the enabled code path.
		__POSTHOG_API_KEY__: JSON.stringify(
			process.env['POSTHOG_API_KEY'] || 'phc_test_key',
		),
	},
	esbuild: {
		jsx: 'automatic',
	},
	plugins: [
		{
			// Match tsup's `.md` text loader so `import md from './x.md'` returns
			// the file contents as a string in both production builds and tests.
			name: 'load-md-as-text',
			transform(_code, id) {
				if (id.endsWith('.md')) {
					const content = fs.readFileSync(id, 'utf-8');
					return {
						code: `export default ${JSON.stringify(content)};`,
						map: null,
					};
				}
				return undefined;
			},
		},
	],
});
