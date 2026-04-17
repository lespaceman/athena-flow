import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as marketplaceShared from '../marketplaceShared';
import type {ResolvedWorkflowSource} from '../workflowSourceResolution';

// Keep a reference so the unused-imports lint doesn't complain now; later tasks use these.
void marketplaceShared;
void vi;
void beforeEach;
void afterEach;
void fs;
void os;
void path;

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
