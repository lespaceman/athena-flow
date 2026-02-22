/**
 * Marketplace plugin resolver.
 *
 * Handles config entries like `"web-testing-toolkit@lespaceman/athena-plugin-marketplace"`
 * by cloning the marketplace repo, reading its manifest, and returning the
 * absolute path to the requested plugin directory.
 *
 * Clone/pull behavior:
 * - Clone: only when plugin is in config but repo not found locally
 * - Pull: every startup (gracefully degrades if offline)
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** A single plugin entry inside a marketplace manifest. */
export type MarketplaceEntry = {
	name: string;
	source: string | {source: string; [key: string]: unknown};
	description?: string;
	version?: string;
};

/** Shape of `.claude-plugin/marketplace.json`. */
export type MarketplaceManifest = {
	name: string;
	owner: {name: string; email?: string};
	metadata?: {
		description?: string;
		version?: string;
		pluginRoot?: string;
	};
	plugins: MarketplaceEntry[];
	workflows?: MarketplaceEntry[];
};

const MARKETPLACE_REF_RE = /^[a-zA-Z0-9_-]+@[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

/**
 * Test whether a config entry is a marketplace reference
 * (e.g. `"web-testing-toolkit@lespaceman/athena-plugin-marketplace"`).
 */
export function isMarketplaceRef(entry: string): boolean {
	return MARKETPLACE_REF_RE.test(entry);
}

/**
 * Parse a marketplace reference into its components.
 * Assumes the ref has already been validated with `isMarketplaceRef`.
 */
function parseRef(ref: string): {
	pluginName: string;
	owner: string;
	repo: string;
} {
	const atIdx = ref.indexOf('@');
	const pluginName = ref.slice(0, atIdx);
	const slug = ref.slice(atIdx + 1);
	const slashIdx = slug.indexOf('/');
	return {
		pluginName,
		owner: slug.slice(0, slashIdx),
		repo: slug.slice(slashIdx + 1),
	};
}

/**
 * Ensure the marketplace repo is cloned locally.
 * Only clones if repo doesn't exist. No automatic pull on startup.
 * Returns the absolute path to the cached repo directory.
 */
function ensureRepo(cacheDir: string, owner: string, repo: string): string {
	const repoDir = path.join(cacheDir, owner, repo);

	if (!fs.existsSync(repoDir)) {
		// Not cached — clone the repo
		const repoUrl = `https://github.com/${owner}/${repo}.git`;
		fs.mkdirSync(repoDir, {recursive: true});

		try {
			execFileSync('git', ['clone', '--depth', '1', repoUrl, repoDir], {
				stdio: 'ignore',
			});
		} catch (error) {
			// Clean up partial clone
			fs.rmSync(repoDir, {recursive: true, force: true});
			throw new Error(
				`Failed to clone marketplace repo ${owner}/${repo}: ${(error as Error).message}`,
			);
		}
	} else {
		// Cached — pull latest, but don't fail startup if offline
		try {
			execFileSync('git', ['pull', '--ff-only'], {
				cwd: repoDir,
				stdio: 'ignore',
			});
		} catch {
			// Graceful degradation: use cached version if pull fails
		}
	}

	return repoDir;
}

/**
 * Pull latest changes for a cached marketplace repo.
 * Call this explicitly when user requests an update.
 */
export function pullMarketplaceRepo(owner: string, repo: string): void {
	const cacheDir = path.join(os.homedir(), '.config', 'athena', 'marketplaces');
	const repoDir = path.join(cacheDir, owner, repo);

	if (!fs.existsSync(repoDir)) {
		throw new Error(
			`Marketplace repo ${owner}/${repo} is not cached. It will be cloned on first use.`,
		);
	}

	execFileSync('git', ['pull', '--ff-only'], {
		cwd: repoDir,
		stdio: 'ignore',
	});
}

/**
 * Resolve a marketplace reference to an absolute plugin directory path.
 *
 * Clones or updates the marketplace repo, reads its manifest, and returns
 * the resolved path to the requested plugin.
 */
export function resolveMarketplacePlugin(ref: string): string {
	// Verify git is available
	try {
		execFileSync('git', ['--version'], {stdio: 'ignore'});
	} catch {
		throw new Error(
			'git is not installed. Install git to use marketplace plugins.',
		);
	}

	const {pluginName, owner, repo} = parseRef(ref);
	const cacheDir = path.join(os.homedir(), '.config', 'athena', 'marketplaces');
	const repoDir = ensureRepo(cacheDir, owner, repo);

	// Read marketplace manifest
	const manifestPath = path.join(repoDir, '.claude-plugin', 'marketplace.json');
	if (!fs.existsSync(manifestPath)) {
		throw new Error(`Marketplace manifest not found: ${manifestPath}`);
	}

	const manifest = JSON.parse(
		fs.readFileSync(manifestPath, 'utf-8'),
	) as MarketplaceManifest;

	if (!Array.isArray(manifest.plugins)) {
		throw new Error(
			`Invalid marketplace manifest at ${manifestPath}: "plugins" must be an array`,
		);
	}

	const entry = manifest.plugins.find(p => p.name === pluginName);
	if (!entry) {
		const available = manifest.plugins.map(p => p.name).join(', ');
		throw new Error(
			`Plugin "${pluginName}" not found in marketplace ${owner}/${repo}. Available plugins: ${available}`,
		);
	}

	if (typeof entry.source !== 'string') {
		throw new Error(
			`Plugin "${pluginName}" uses a remote source type which is not supported by athena-cli. Only relative path sources are supported.`,
		);
	}

	// If pluginRoot is set and source is a bare name (not a relative path),
	// prepend pluginRoot. This lets manifests use short names like "formatter"
	// with pluginRoot "./plugins" instead of "./plugins/formatter".
	const {pluginRoot} = manifest.metadata ?? {};
	let sourcePath = entry.source;
	if (
		pluginRoot &&
		!sourcePath.startsWith('./') &&
		!sourcePath.startsWith('../')
	) {
		sourcePath = path.join(pluginRoot, sourcePath);
	}

	const pluginDir = path.resolve(repoDir, sourcePath);

	// Guard against path traversal from malicious manifests
	if (!pluginDir.startsWith(repoDir + path.sep) && pluginDir !== repoDir) {
		throw new Error(
			`Plugin "${pluginName}" source resolves outside the marketplace repo: ${pluginDir}`,
		);
	}

	if (!fs.existsSync(pluginDir)) {
		throw new Error(`Plugin source directory not found: ${pluginDir}`);
	}

	return pluginDir;
}

/**
 * Resolve a marketplace workflow reference to an absolute workflow.json path.
 */
export function resolveMarketplaceWorkflow(ref: string): string {
	try {
		execFileSync('git', ['--version'], {stdio: 'ignore'});
	} catch {
		throw new Error(
			'git is not installed. Install git to use marketplace workflows.',
		);
	}

	const {pluginName: workflowName, owner, repo} = parseRef(ref);
	const cacheDir = path.join(os.homedir(), '.config', 'athena', 'marketplaces');
	const repoDir = ensureRepo(cacheDir, owner, repo);

	const manifestPath = path.join(repoDir, '.claude-plugin', 'marketplace.json');
	if (!fs.existsSync(manifestPath)) {
		throw new Error(`Marketplace manifest not found: ${manifestPath}`);
	}

	const manifest = JSON.parse(
		fs.readFileSync(manifestPath, 'utf-8'),
	) as MarketplaceManifest;

	const workflows = manifest.workflows ?? [];
	const entry = workflows.find(w => w.name === workflowName);
	if (!entry) {
		const available = workflows.map(w => w.name).join(', ') || '(none)';
		throw new Error(
			`Workflow "${workflowName}" not found in marketplace ${owner}/${repo}. Available workflows: ${available}`,
		);
	}

	if (typeof entry.source !== 'string') {
		throw new Error(
			`Workflow "${workflowName}" uses a remote source type which is not supported.`,
		);
	}

	const workflowPath = path.resolve(repoDir, entry.source);

	// Guard against path traversal
	if (
		!workflowPath.startsWith(repoDir + path.sep) &&
		workflowPath !== repoDir
	) {
		throw new Error(
			`Workflow "${workflowName}" source resolves outside the marketplace repo: ${workflowPath}`,
		);
	}

	if (!fs.existsSync(workflowPath)) {
		throw new Error(`Workflow source not found: ${workflowPath}`);
	}

	return workflowPath;
}
