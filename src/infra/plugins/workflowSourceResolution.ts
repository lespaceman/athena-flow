import fs from 'node:fs';
import path from 'node:path';
import {
	ensureRepo,
	isMarketplaceRef,
	isMarketplaceSlug,
	listWorkflowEntriesFromManifest,
	parseRef,
	requireGitForMarketplace,
	resolvePluginManifestPath,
	resolveWorkflowManifestPath,
	resolveWorkflowPathFromManifest,
	type MarketplaceWorkflowListing,
	type WorkflowMarketplaceSource,
} from './marketplaceShared';
import * as marketplaceShared from './marketplaceShared';
import {
	WorkflowAmbiguityError,
	WorkflowNotFoundError,
	type WorkflowAmbiguityCandidate,
} from './workflowSourceErrors';

export function findMarketplaceRepoDir(startPath: string): string | undefined {
	let currentDir = path.resolve(startPath);

	for (;;) {
		if (
			fs.existsSync(resolveWorkflowManifestPath(currentDir)) ||
			fs.existsSync(resolvePluginManifestPath(currentDir))
		) {
			return currentDir;
		}

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			return undefined;
		}
		currentDir = parentDir;
	}
}

export function resolveWorkflowMarketplaceSource(
	source: string,
): WorkflowMarketplaceSource {
	const trimmed = source.trim();
	const resolvedPath = path.resolve(trimmed);

	if (!fs.existsSync(resolvedPath) && isMarketplaceSlug(trimmed)) {
		const slashIdx = trimmed.indexOf('/');
		return {
			kind: 'remote',
			slug: trimmed,
			owner: trimmed.slice(0, slashIdx),
			repo: trimmed.slice(slashIdx + 1),
		};
	}

	const repoDir = findMarketplaceRepoDir(trimmed);
	if (!repoDir) {
		throw new Error(
			`Local marketplace not found from source: ${trimmed}. Expected a marketplace repo root or a path inside one.`,
		);
	}

	return {
		kind: 'local',
		path: resolvedPath,
		repoDir,
	};
}

export function listMarketplaceWorkflows(
	owner: string,
	repo: string,
): MarketplaceWorkflowListing[] {
	requireGitForMarketplace('workflows');
	const repoDir = ensureRepo(owner, repo);
	return listWorkflowEntriesFromManifest(
		repoDir,
		resolveWorkflowManifestPath(repoDir),
		{kind: 'remote', slug: `${owner}/${repo}`, owner, repo},
	);
}

export function listMarketplaceWorkflowsFromRepo(
	repoDir: string,
): MarketplaceWorkflowListing[] {
	return listWorkflowEntriesFromManifest(
		repoDir,
		resolveWorkflowManifestPath(repoDir),
		{kind: 'local', repoDir},
	);
}

export function resolveMarketplaceWorkflow(ref: string): string {
	requireGitForMarketplace('workflows');
	const {pluginName: workflowName, owner, repo} = parseRef(ref);
	const repoDir = ensureRepo(owner, repo);
	return resolveWorkflowPathFromManifest(
		workflowName,
		repoDir,
		resolveWorkflowManifestPath(repoDir),
	);
}

/**
 * Thrown when a workflow with the requested name exists in a marketplace but
 * the pinned version does not match. Surfaced separately from the generic
 * "not found" error so `resolveWorkflowInstallSourceFromSources` can report
 * the specific mismatch instead of a confusing catch-all message.
 */
export class WorkflowVersionNotFoundError extends Error {
	readonly workflowName: string;
	readonly requestedVersion: string;
	readonly availableVersion: string | undefined;
	readonly sourceLabel: string;

	constructor(
		workflowName: string,
		requestedVersion: string,
		availableVersion: string | undefined,
		sourceLabel: string,
	) {
		const availableText = availableVersion
			? `found version ${availableVersion}`
			: 'marketplace entry does not declare a version';
		super(
			`Workflow "${workflowName}" version ${requestedVersion} not found in ${sourceLabel} (${availableText}).`,
		);
		this.name = 'WorkflowVersionNotFoundError';
		this.workflowName = workflowName;
		this.requestedVersion = requestedVersion;
		this.availableVersion = availableVersion;
		this.sourceLabel = sourceLabel;
	}
}

type ParsedWorkflowName = {
	bareName: string;
	pinnedVersion: string | undefined;
};

/**
 * Marketplace refs (`name@owner/repo`) are handled upstream by
 * `isMarketplaceRef` and never reach this function, so any `@<suffix>`
 * without a slash is unambiguously a version pin.
 */
function parseBareWorkflowName(source: string): ParsedWorkflowName {
	const atIdx = source.indexOf('@');
	if (atIdx <= 0 || atIdx === source.length - 1) {
		return {bareName: source, pinnedVersion: undefined};
	}
	const suffix = source.slice(atIdx + 1);
	if (suffix.includes('/')) {
		// Looks like an owner/repo slug but failed isMarketplaceRef upstream.
		// Leave untouched so the normal not-found path reports it.
		return {bareName: source, pinnedVersion: undefined};
	}
	return {
		bareName: source.slice(0, atIdx),
		pinnedVersion: suffix,
	};
}

function findListingForInstall(
	listings: MarketplaceWorkflowListing[],
	bareName: string,
	pinnedVersion: string | undefined,
	sourceLabel: string,
): MarketplaceWorkflowListing | undefined {
	const namedMatches = listings.filter(entry => entry.name === bareName);
	if (namedMatches.length === 0) {
		return undefined;
	}
	if (pinnedVersion === undefined) {
		return namedMatches[0];
	}
	const exact = namedMatches.find(entry => entry.version === pinnedVersion);
	if (exact) {
		return exact;
	}
	// Name matched, version didn't — throw the specific error so the caller
	// can prefer it over generic "not found" messages from other sources.
	throw new WorkflowVersionNotFoundError(
		bareName,
		pinnedVersion,
		namedMatches[0]!.version,
		sourceLabel,
	);
}

type MarketplaceListingFetcher = {
	listings: MarketplaceWorkflowListing[];
	sourceLabel: string;
	installValue: (workflow: MarketplaceWorkflowListing) => string;
};

function fetchMarketplaceListings(
	marketplaceSource: WorkflowMarketplaceSource,
): MarketplaceListingFetcher {
	if (marketplaceSource.kind === 'remote') {
		return {
			listings: listMarketplaceWorkflows(
				marketplaceSource.owner,
				marketplaceSource.repo,
			),
			sourceLabel: `marketplace ${marketplaceSource.slug}`,
			installValue: workflow => {
				if (!workflow.ref) {
					throw new Error(
						`Workflow "${workflow.name}" in marketplace ${marketplaceSource.slug} is missing a marketplace ref`,
					);
				}
				return workflow.ref;
			},
		};
	}
	return {
		listings: listMarketplaceWorkflowsFromRepo(marketplaceSource.repoDir),
		sourceLabel: `local marketplace ${marketplaceSource.repoDir}`,
		installValue: workflow => workflow.workflowPath,
	};
}

export function resolveWorkflowInstallSource(
	source: string,
	configuredMarketplaceSource: string,
): string {
	if (isMarketplaceRef(source)) {
		return source;
	}

	const resolvedPath = path.resolve(source);
	if (fs.existsSync(resolvedPath)) {
		return source;
	}

	const {bareName, pinnedVersion} = parseBareWorkflowName(source);

	if (bareName.includes('/') || bareName.includes('\\')) {
		throw new Error(`Workflow source not found: ${source}`);
	}

	const fetcher = fetchMarketplaceListings(
		resolveWorkflowMarketplaceSource(configuredMarketplaceSource),
	);
	const workflow = findListingForInstall(
		fetcher.listings,
		bareName,
		pinnedVersion,
		fetcher.sourceLabel,
	);
	if (!workflow) {
		throw new Error(
			`Workflow "${bareName}" not found in ${fetcher.sourceLabel}`,
		);
	}
	return fetcher.installValue(workflow);
}

export function resolveWorkflowInstallSourceFromSources(
	name: string,
	sources: string[],
): string {
	let versionMismatch: WorkflowVersionNotFoundError | undefined;

	for (const source of sources) {
		try {
			return resolveWorkflowInstallSource(name, source);
		} catch (error) {
			if (error instanceof WorkflowVersionNotFoundError) {
				// Keep the first specific mismatch so we can surface it if no other
				// source resolves cleanly. A later source may still contain the
				// exact version, so continue iterating.
				versionMismatch ??= error;
				continue;
			}
			// Generic miss: try next configured source.
		}
	}

	if (versionMismatch) {
		throw versionMismatch;
	}
	throw new Error(`Workflow "${name}" not found in any configured marketplace`);
}

/**
 * Turn a configured marketplace source string (or loose workflow.json path)
 * into one or more canonical ResolvedWorkflowSource entries. Pure w.r.t.
 * arguments — remote marketplaces are fetched via ensureRepo elsewhere.
 */
export function gatherMarketplaceWorkflowSources(
	source: string,
): ResolvedWorkflowSource[] {
	const trimmed = source.trim();
	const resolvedPath = path.resolve(trimmed);

	// Loose workflow.json file
	if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
		return [
			{
				kind: 'filesystem',
				workflowPath: fs.realpathSync(resolvedPath),
			},
		];
	}

	// Remote marketplace slug
	if (!fs.existsSync(resolvedPath) && isMarketplaceSlug(trimmed)) {
		const slashIdx = trimmed.indexOf('/');
		const owner = trimmed.slice(0, slashIdx);
		const repo = trimmed.slice(slashIdx + 1);
		requireGitForMarketplace('workflows');
		const repoDir = ensureRepo(owner, repo);
		const manifestPath = resolveWorkflowManifestPath(repoDir);
		return listWorkflowEntriesFromManifest(repoDir, manifestPath, {
			kind: 'remote',
			slug: trimmed,
			owner,
			repo,
		}).map(entry => ({
			kind: 'marketplace-remote' as const,
			slug: trimmed,
			owner,
			repo,
			workflowName: entry.name,
			version: entry.version,
			ref: entry.ref!,
			manifestPath,
			workflowPath: entry.workflowPath,
		}));
	}

	// Local marketplace directory
	const repoDir = findMarketplaceRepoDir(trimmed);
	if (!repoDir) {
		throw new Error(
			`Marketplace source not found: ${trimmed}. Expected a marketplace repo root, a path inside one, or an owner/repo slug.`,
		);
	}
	const canonicalRepoDir = fs.realpathSync(repoDir);
	const manifestPath = resolveWorkflowManifestPath(canonicalRepoDir);
	return listWorkflowEntriesFromManifest(canonicalRepoDir, manifestPath, {
		kind: 'local',
		repoDir: canonicalRepoDir,
	}).map(entry => ({
		kind: 'marketplace-local' as const,
		repoDir: canonicalRepoDir,
		workflowName: entry.name,
		version: entry.version,
		manifestPath,
		workflowPath: entry.workflowPath,
	}));
}

function resolvedSourceLabel(s: ResolvedWorkflowSource): string {
	if (s.kind === 'marketplace-remote') return `marketplace ${s.slug}`;
	if (s.kind === 'marketplace-local') return `local marketplace ${s.repoDir}`;
	return `file ${s.workflowPath}`;
}

function resolvedSourceDisambiguator(s: ResolvedWorkflowSource): string {
	if (s.kind === 'marketplace-remote') return s.ref;
	return s.workflowPath;
}

export function resolveWorkflowInstall(
	sourceOrName: string,
	configuredSources: string[],
): ResolvedWorkflowSource {
	// Marketplace ref: resolve directly, no ambiguity checking.
	if (isMarketplaceRef(sourceOrName)) {
		const {pluginName: workflowName, owner, repo} = parseRef(sourceOrName);
		marketplaceShared.requireGitForMarketplace('workflows');
		const repoDir = marketplaceShared.ensureRepo(owner, repo);
		const manifestPath = resolveWorkflowManifestPath(repoDir);
		const workflowPath = resolveWorkflowPathFromManifest(
			workflowName,
			repoDir,
			manifestPath,
		);
		const entry = listWorkflowEntriesFromManifest(repoDir, manifestPath, {
			kind: 'remote',
			slug: `${owner}/${repo}`,
			owner,
			repo,
		}).find(e => e.name === workflowName);
		return {
			kind: 'marketplace-remote',
			slug: `${owner}/${repo}`,
			owner,
			repo,
			workflowName,
			version: entry?.version,
			ref: sourceOrName,
			manifestPath,
			workflowPath,
		};
	}

	// Filesystem path to workflow.json.
	const resolvedPath = path.resolve(sourceOrName);
	if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
		return {kind: 'filesystem', workflowPath: fs.realpathSync(resolvedPath)};
	}

	// Bare name (optionally version-pinned): gather all configured sources.
	const {bareName, pinnedVersion} = parseBareWorkflowName(sourceOrName);
	if (bareName.includes('/') || bareName.includes('\\')) {
		throw new Error(`Workflow source not found: ${sourceOrName}`);
	}

	const allListings: ResolvedWorkflowSource[] = [];
	let versionMismatch: WorkflowVersionNotFoundError | undefined;

	for (const configured of configuredSources) {
		let sources: ResolvedWorkflowSource[];
		try {
			sources = gatherMarketplaceWorkflowSources(configured);
		} catch {
			continue;
		}
		for (const src of sources) {
			if (
				(src.kind === 'marketplace-remote' ||
					src.kind === 'marketplace-local') &&
				src.workflowName === bareName
			) {
				if (pinnedVersion !== undefined && src.version !== pinnedVersion) {
					versionMismatch ??= new WorkflowVersionNotFoundError(
						bareName,
						pinnedVersion,
						src.version,
						resolvedSourceLabel(src),
					);
					continue;
				}
				allListings.push(src);
			}
		}
	}

	if (allListings.length === 0) {
		if (versionMismatch) throw versionMismatch;
		throw new WorkflowNotFoundError(bareName, configuredSources);
	}
	if (allListings.length > 1) {
		const candidates: WorkflowAmbiguityCandidate[] = allListings.map(s => ({
			sourceLabel: resolvedSourceLabel(s),
			disambiguator: resolvedSourceDisambiguator(s),
		}));
		throw new WorkflowAmbiguityError(bareName, candidates);
	}
	return allListings[0]!;
}

export type ResolvedWorkflowSource =
	| {
			kind: 'marketplace-remote';
			slug: string;
			owner: string;
			repo: string;
			workflowName: string;
			version?: string;
			ref: string;
			manifestPath: string;
			workflowPath: string;
	  }
	| {
			kind: 'marketplace-local';
			repoDir: string;
			workflowName: string;
			version?: string;
			manifestPath: string;
			workflowPath: string;
	  }
	| {
			kind: 'filesystem';
			workflowPath: string;
	  };
