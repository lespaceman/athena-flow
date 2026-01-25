import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		include: ['**/*.test.{ts,tsx}', 'test.tsx'],
		environment: 'node',
	},
	esbuild: {
		jsx: 'automatic',
	},
});
