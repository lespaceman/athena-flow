import fs from 'node:fs';
import {readGlobalConfig} from '../../infra/plugins/config';
import {
	isMarketplaceRef,
	listMarketplaceWorkflows,
	listMarketplaceWorkflowsFromRepo,
	resolveWorkflowMarketplaceSource,
	resolveMarketplaceWorkflow,
	findMarketplaceRepoDir,
} from '../../infra/plugins/marketplace';

const DEFAULT_MARKETPLACE_OWNER = 'lespaceman';
const DEFAULT_MARKETPLACE_REPO = 'athena-workflow-marketplace';

export type WorkflowOption = {
	label: string;
	value: string;
	description: string;
};

function readLocalWorkflowOption(sourcePath: string): WorkflowOption {
	const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf-8')) as {
		name?: string;
		description?: string;
	};

	return {
		label: raw.name ?? sourcePath,
		value: sourcePath,
		description: raw.description ?? 'Local workflow',
	};
}

export function loadWorkflowOptions(): WorkflowOption[] {
	const sourceOverride = process.env.ATHENA_STARTER_WORKFLOW_SOURCE;

	if (!sourceOverride) {
		const configuredSource =
			readGlobalConfig().workflowMarketplaceSource ??
			`${DEFAULT_MARKETPLACE_OWNER}/${DEFAULT_MARKETPLACE_REPO}`;
		const marketplaceSource =
			resolveWorkflowMarketplaceSource(configuredSource);

		if (marketplaceSource.kind === 'remote') {
			return listMarketplaceWorkflows(
				marketplaceSource.owner,
				marketplaceSource.repo,
			).map(workflow => ({
				label: workflow.name,
				value: workflow.ref,
				description: workflow.description ?? 'Marketplace workflow',
			}));
		}

		return listMarketplaceWorkflowsFromRepo(marketplaceSource.repoDir).map(
			workflow => ({
				label: workflow.name,
				value: workflow.workflowPath,
				description: workflow.description ?? 'Local marketplace workflow',
			}),
		);
	}

	if (isMarketplaceRef(sourceOverride)) {
		const workflowPath = resolveMarketplaceWorkflow(sourceOverride);
		const option = readLocalWorkflowOption(workflowPath);
		return [{...option, value: sourceOverride}];
	}

	const repoDir = findMarketplaceRepoDir(sourceOverride);
	if (repoDir) {
		return listMarketplaceWorkflowsFromRepo(repoDir).map(workflow => ({
			label: workflow.name,
			value: workflow.workflowPath,
			description: workflow.description ?? 'Local marketplace workflow',
		}));
	}

	if (!fs.existsSync(sourceOverride)) {
		throw new Error(`Workflow source not found: ${sourceOverride}`);
	}

	return [readLocalWorkflowOption(sourceOverride)];
}
