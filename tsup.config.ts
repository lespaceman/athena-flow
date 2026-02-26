import {defineConfig} from 'tsup';

export default defineConfig({
	entry: ['src/cli.tsx', 'src/hook-forwarder.ts'],
	format: ['esm'],
	target: 'node18',
	outDir: 'dist',
	clean: true,
	splitting: true,
	sourcemap: true,
	external: [
		'better-sqlite3',
		'ink',
		'react',
		'@inkjs/ui',
		'react-devtools-core',
	],
});
