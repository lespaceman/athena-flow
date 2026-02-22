/**
 * Standalone workflow registry.
 *
 * Manages workflow.json files in ~/.config/athena/workflows/.
 * Each workflow is stored as {name}/workflow.json.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {WorkflowConfig} from './types.js';

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

	return JSON.parse(fs.readFileSync(workflowPath, 'utf-8')) as WorkflowConfig;
}

/**
 * Install a workflow from a local file path.
 * Copies the workflow.json into the registry under the given name.
 */
export function installWorkflow(sourcePath: string, name?: string): string {
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
