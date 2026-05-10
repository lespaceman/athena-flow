import {readFileSync} from 'node:fs';
import {defineConfig} from 'tsup';

// Load .env file if present (for local builds). CI provides env vars directly.
try {
	const envFile = readFileSync('.env', 'utf-8');
	for (const line of envFile.split('\n')) {
		const match = line.match(/^([A-Z_]+)=(.+)$/);
		if (match && !process.env[match[1]]) {
			process.env[match[1]] = match[2].trim();
		}
	}
} catch {
	// No .env file — that's fine, CI sets env vars directly
}

export default defineConfig({
	entry: {
		cli: 'src/app/entry/cli.tsx',
		'hook-forwarder': 'src/harnesses/claude/hook-forwarder.ts',
		'athena-gateway': 'src/gateway/entry.ts',
		'dashboard-daemon': 'src/app/entry/dashboardDaemon.ts',
		supervisor: 'src/app/entry/supervisor.tsx',
	},
	format: ['esm'],
	target: 'node18',
	outDir: 'dist',
	clean: true,
	splitting: true,
	sourcemap: true,
	loader: {
		'.md': 'text',
	},
	define: {
		// Injected at build time from POSTHOG_API_KEY env var.
		// Set this in CI via GitHub Actions secrets. When unset (local dev),
		// telemetry silently no-ops.
		__POSTHOG_API_KEY__: JSON.stringify(process.env['POSTHOG_API_KEY'] ?? ''),
		// Injected from package.json at build time so the bundled daemon
		// reports a real version. createRequire('../../../package.json') from
		// the source file doesn't resolve correctly after bundling.
		__ATHENA_VERSION__: JSON.stringify(
			(JSON.parse(readFileSync('package.json', 'utf-8')) as {version?: string})
				.version ?? '0.0.0',
		),
	},
	external: [
		'better-sqlite3',
		'ink',
		'react',
		'@inkjs/ui',
		'react-devtools-core',
	],
});
