/**
 * Standalone workflow registry.
 *
 * Manages workflow.json files in ~/.config/athena/workflows/.
 * Each workflow is stored as {name}/workflow.json.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	isMarketplaceRef,
	resolveMarketplaceWorkflow,
} from '../../infra/plugins/marketplace';
import type {WorkflowConfig} from './types';

function registryDir(): string {
	return path.join(os.homedir(), '.config', 'athena', 'workflows');
}

/**
 * Resolve a workflow by name from the registry.
 * Throws if the workflow is not installed.
 */
export function resolveWorkflow(name: string): WorkflowConfig {
	const workflowPath = path.join(registryDir(), name, 'workflow.json');

	if (!fs.existsSync(workflowPath)) {
		throw new Error(
			`Workflow "${name}" not found. Install with: athena workflow install <source> --name ${name}`,
		);
	}

	const raw = JSON.parse(fs.readFileSync(workflowPath, 'utf-8')) as Record<
		string,
		unknown
	>;
	const workflowDir = path.dirname(workflowPath);

	if (!Array.isArray(raw['plugins'])) {
		throw new Error(
			`Invalid workflow.json: "plugins" must be an array (got ${typeof raw['plugins']})`,
		);
	}

	if (typeof raw['promptTemplate'] !== 'string') {
		throw new Error(`Invalid workflow.json: "promptTemplate" must be a string`);
	}

	// Resolve trackerTemplate file reference if it ends with .md
	const loop = raw['loop'] as Record<string, unknown> | undefined;
	// Backward compatibility: older marketplace workflows used trackerFile.
	if (
		loop &&
		typeof loop['trackerPath'] !== 'string' &&
		typeof loop['trackerFile'] === 'string'
	) {
		loop['trackerPath'] = loop['trackerFile'];
	}
	// Backward compatibility: older workflows used completionMarkers: [done, blocked?].
	if (
		loop &&
		typeof loop['completionMarker'] !== 'string' &&
		Array.isArray(loop['completionMarkers'])
	) {
		const markers = loop['completionMarkers'].filter(
			(v): v is string => typeof v === 'string' && v.length > 0,
		);
		if (markers[0]) loop['completionMarker'] = markers[0];
		if (markers[1] && typeof loop['blockedMarker'] !== 'string') {
			loop['blockedMarker'] = markers[1];
		}
	}

	// Resolve systemPromptFile relative to workflow directory when present.
	const systemPromptFile = raw['systemPromptFile'];
	if (
		typeof systemPromptFile === 'string' &&
		!path.isAbsolute(systemPromptFile)
	) {
		const systemPromptPath = path.resolve(workflowDir, systemPromptFile);
		if (fs.existsSync(systemPromptPath)) {
			raw['systemPromptFile'] = systemPromptPath;
		}
	}

	const tmpl = loop?.['trackerTemplate'];
	if (typeof tmpl === 'string' && tmpl.endsWith('.md')) {
		const tmplPath = path.resolve(workflowDir, tmpl);
		if (!fs.existsSync(tmplPath)) {
			throw new Error(
				`Invalid workflow.json: trackerTemplate "${tmpl}" not found at ${tmplPath}`,
			);
		}
		loop!['trackerTemplate'] = fs.readFileSync(tmplPath, 'utf-8');
	}

	return raw as unknown as WorkflowConfig;
}

/**
 * Install a workflow from a local file path.
 * Copies the workflow.json into the registry under the given name.
 */
export function installWorkflow(source: string, name?: string): string {
	// Resolve marketplace ref to local path
	const sourcePath = isMarketplaceRef(source)
		? resolveMarketplaceWorkflow(source)
		: source;

	const content = fs.readFileSync(sourcePath, 'utf-8');
	const workflow = JSON.parse(content) as WorkflowConfig;
	const workflowName = name ?? workflow.name;

	if (!workflowName) {
		throw new Error(
			'Workflow has no "name" field. Provide --name to specify one.',
		);
	}

	const destDir = path.join(registryDir(), workflowName);
	fs.mkdirSync(destDir, {recursive: true});
	fs.writeFileSync(path.join(destDir, 'workflow.json'), content, 'utf-8');

	// Copy referenced local assets next to workflow.json when available.
	const sourceDir = path.dirname(sourcePath);
	const copyRelativeAsset = (assetPath: string | undefined) => {
		if (!assetPath || path.isAbsolute(assetPath)) return;
		const sourceAssetPath = path.resolve(sourceDir, assetPath);
		if (!fs.existsSync(sourceAssetPath)) return;
		const destAssetPath = path.join(destDir, assetPath);
		fs.mkdirSync(path.dirname(destAssetPath), {recursive: true});
		fs.copyFileSync(sourceAssetPath, destAssetPath);
	};
	copyRelativeAsset(workflow.systemPromptFile);
	const trackerTemplate = (
		workflow.loop as {trackerTemplate?: unknown} | undefined
	)?.trackerTemplate;
	if (typeof trackerTemplate === 'string' && trackerTemplate.endsWith('.md')) {
		copyRelativeAsset(trackerTemplate);
	}

	return workflowName;
}

/**
 * List all installed workflow names.
 */
export function listWorkflows(): string[] {
	const dir = registryDir();
	if (!fs.existsSync(dir)) return [];

	return fs
		.readdirSync(dir, {withFileTypes: true})
		.filter(
			entry =>
				entry.isDirectory() &&
				fs.existsSync(path.join(dir, entry.name, 'workflow.json')),
		)
		.map(entry => entry.name);
}

/**
 * Remove a workflow from the registry.
 * Throws if the workflow is not installed.
 */
export function removeWorkflow(name: string): void {
	const dir = path.join(registryDir(), name);

	if (!fs.existsSync(dir)) {
		throw new Error(`Workflow "${name}" not found.`);
	}

	fs.rmSync(dir, {recursive: true, force: true});
}
