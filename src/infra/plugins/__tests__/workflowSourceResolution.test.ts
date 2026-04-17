import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as marketplaceShared from '../marketplaceShared';
import type {ResolvedWorkflowSource} from '../workflowSourceResolution';
import {
	gatherMarketplaceWorkflowSources,
	resolveWorkflowInstall,
	WorkflowVersionNotFoundError,
} from '../workflowSourceResolution';
import {
	WorkflowAmbiguityError,
	WorkflowNotFoundError,
} from '../workflowSourceErrors';

describe('ResolvedWorkflowSource', () => {
	it('carries marketplace identity for local installs', () => {
		const src: ResolvedWorkflowSource = {
			kind: 'marketplace-local',
			repoDir: '/tmp/m',
			workflowName: 'w',
			manifestPath: '/tmp/m/.athena-workflow/marketplace.json',
			workflowPath: '/tmp/m/workflows/w/workflow.json',
		};
		expect(src.kind).toBe('marketplace-local');
		expect(src.workflowName).toBe('w');
	});
});

describe('gatherMarketplaceWorkflowSources', () => {
	let tmp: string;

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-resolver-'));
	});

	afterEach(() => {
		fs.rmSync(tmp, {recursive: true, force: true});
	});

	it('returns marketplace-local sources for a local marketplace path', () => {
		const repo = path.join(tmp, 'marketplace');
		fs.mkdirSync(path.join(repo, '.athena-workflow'), {recursive: true});
		fs.mkdirSync(path.join(repo, 'workflows', 'w'), {recursive: true});
		fs.writeFileSync(
			path.join(repo, '.athena-workflow', 'marketplace.json'),
			JSON.stringify({
				name: 'm',
				owner: {name: 't'},
				plugins: [],
				workflows: [
					{name: 'w', source: './workflows/w/workflow.json', version: '1.0.0'},
				],
			}),
		);
		fs.writeFileSync(path.join(repo, 'workflows', 'w', 'workflow.json'), '{}');

		const sources = gatherMarketplaceWorkflowSources(repo);

		expect(sources).toHaveLength(1);
		expect(sources[0]).toMatchObject({
			kind: 'marketplace-local',
			repoDir: fs.realpathSync(repo),
			workflowName: 'w',
			version: '1.0.0',
		});
	});

	it('returns filesystem source when the input is a loose workflow.json', () => {
		const wfPath = path.join(tmp, 'loose', 'workflow.json');
		fs.mkdirSync(path.dirname(wfPath), {recursive: true});
		fs.writeFileSync(wfPath, '{}');

		const sources = gatherMarketplaceWorkflowSources(wfPath);

		expect(sources).toHaveLength(1);
		expect(sources[0]).toEqual({
			kind: 'filesystem',
			workflowPath: fs.realpathSync(wfPath),
		});
	});
});

function makeLocalMarketplace(
	repo: string,
	entries: Array<{name: string; version?: string}>,
) {
	fs.mkdirSync(path.join(repo, '.athena-workflow'), {recursive: true});
	const workflows = entries.map(e => ({
		name: e.name,
		source: `./workflows/${e.name}/workflow.json`,
		...(e.version ? {version: e.version} : {}),
	}));
	fs.writeFileSync(
		path.join(repo, '.athena-workflow', 'marketplace.json'),
		JSON.stringify({name: 'm', owner: {name: 't'}, plugins: [], workflows}),
	);
	for (const e of entries) {
		const dir = path.join(repo, 'workflows', e.name);
		fs.mkdirSync(dir, {recursive: true});
		fs.writeFileSync(path.join(dir, 'workflow.json'), '{}');
	}
}

describe('resolveWorkflowInstall', () => {
	let tmp: string;

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-resolver-'));
	});

	afterEach(() => {
		fs.rmSync(tmp, {recursive: true, force: true});
		vi.restoreAllMocks();
	});

	it('returns filesystem source when input is an existing workflow.json path', () => {
		const wf = path.join(tmp, 'loose', 'workflow.json');
		fs.mkdirSync(path.dirname(wf), {recursive: true});
		fs.writeFileSync(wf, '{}');

		const result = resolveWorkflowInstall(wf, []);

		expect(result.kind).toBe('filesystem');
		if (result.kind === 'filesystem') {
			expect(result.workflowPath).toBe(fs.realpathSync(wf));
		}
	});

	it('returns a marketplace-local source for a bare name from one local marketplace', () => {
		const repo = path.join(tmp, 'm');
		makeLocalMarketplace(repo, [{name: 'w', version: '1.0.0'}]);

		const result = resolveWorkflowInstall('w', [repo]);

		expect(result).toMatchObject({
			kind: 'marketplace-local',
			workflowName: 'w',
			version: '1.0.0',
		});
	});

	it('throws WorkflowAmbiguityError when the bare name matches two local marketplaces', () => {
		const a = path.join(tmp, 'a');
		const b = path.join(tmp, 'b');
		makeLocalMarketplace(a, [{name: 'dup'}]);
		makeLocalMarketplace(b, [{name: 'dup'}]);

		expect(() => resolveWorkflowInstall('dup', [a, b])).toThrow(
			WorkflowAmbiguityError,
		);

		try {
			resolveWorkflowInstall('dup', [a, b]);
		} catch (err) {
			if (!(err instanceof WorkflowAmbiguityError)) throw err;
			expect(err.candidates).toHaveLength(2);
			expect(err.candidates.map(c => c.sourceLabel)).toEqual(
				expect.arrayContaining([
					expect.stringContaining(fs.realpathSync(a)),
					expect.stringContaining(fs.realpathSync(b)),
				]),
			);
		}
	});

	it('resolves when only one source has a version match even if another source has the name', () => {
		const a = path.join(tmp, 'a');
		const b = path.join(tmp, 'b');
		makeLocalMarketplace(a, [{name: 'w', version: '1.0.0'}]);
		makeLocalMarketplace(b, [{name: 'w', version: '2.0.0'}]);

		const result = resolveWorkflowInstall('w@2.0.0', [a, b]);

		expect(result).toMatchObject({
			kind: 'marketplace-local',
			workflowName: 'w',
			version: '2.0.0',
			repoDir: fs.realpathSync(b),
		});
	});

	it('throws WorkflowVersionNotFoundError when no source has the requested version', () => {
		const a = path.join(tmp, 'a');
		makeLocalMarketplace(a, [{name: 'w', version: '1.0.0'}]);

		expect(() => resolveWorkflowInstall('w@2.0.0', [a])).toThrow(
			WorkflowVersionNotFoundError,
		);
	});

	it('throws WorkflowNotFoundError when no source has the name', () => {
		const a = path.join(tmp, 'a');
		makeLocalMarketplace(a, [{name: 'other'}]);

		expect(() => resolveWorkflowInstall('missing', [a])).toThrow(
			WorkflowNotFoundError,
		);
	});

	it('accepts a marketplace ref directly without ambiguity checking', () => {
		const cache = path.join(tmp, 'cache', 'owner', 'repo');
		fs.mkdirSync(path.join(cache, '.athena-workflow'), {recursive: true});
		fs.mkdirSync(path.join(cache, 'workflows', 'w'), {recursive: true});
		fs.writeFileSync(
			path.join(cache, '.athena-workflow', 'marketplace.json'),
			JSON.stringify({
				name: 'm',
				owner: {name: 't'},
				plugins: [],
				workflows: [{name: 'w', source: './workflows/w/workflow.json'}],
			}),
		);
		fs.writeFileSync(path.join(cache, 'workflows', 'w', 'workflow.json'), '{}');

		vi.spyOn(marketplaceShared, 'ensureRepo').mockReturnValue(cache);
		vi.spyOn(marketplaceShared, 'requireGitForMarketplace').mockImplementation(
			() => {},
		);

		const result = resolveWorkflowInstall('w@owner/repo', []);

		expect(result).toMatchObject({
			kind: 'marketplace-remote',
			ref: 'w@owner/repo',
			workflowName: 'w',
		});
	});
});
