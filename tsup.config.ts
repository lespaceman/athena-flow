import {defineConfig} from 'tsup';

export default defineConfig({
	entry: {
		cli: 'src/app/entry/cli.tsx',
		'hook-forwarder': 'src/harnesses/claude/hook-forwarder.ts',
	},
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
