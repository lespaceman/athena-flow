import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as marketplaceShared from '../marketplaceShared';
import type {ResolvedWorkflowSource} from '../workflowSourceResolution';
import {gatherMarketplaceWorkflowSources} from '../workflowSourceResolution';

// Keep a reference so the unused-imports lint doesn't complain now; later tasks use these.
void marketplaceShared;
void vi;

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
