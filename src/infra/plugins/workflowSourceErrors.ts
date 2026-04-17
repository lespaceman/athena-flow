export {WorkflowVersionNotFoundError} from './workflowSourceResolution';

export type WorkflowAmbiguityCandidate = {
	sourceLabel: string;
	disambiguator: string;
};

export class WorkflowAmbiguityError extends Error {
	readonly workflowName: string;
	readonly candidates: readonly WorkflowAmbiguityCandidate[];

	constructor(workflowName: string, candidates: WorkflowAmbiguityCandidate[]) {
		const list = candidates
			.map(c => `  - ${c.sourceLabel}: use ${c.disambiguator}`)
			.join('\n');
		super(
			`Workflow "${workflowName}" is provided by multiple configured marketplaces:\n${list}\nRun \`athena-flow workflow install <disambiguator>\` to pick one.`,
		);
		this.name = 'WorkflowAmbiguityError';
		this.workflowName = workflowName;
		this.candidates = candidates;
	}
}

export class WorkflowNotFoundError extends Error {
	readonly workflowName: string;
	readonly searchedSources: readonly string[];

	constructor(workflowName: string, searchedSources: string[]) {
		const sourceList = searchedSources.length
			? searchedSources.join(', ')
			: '(no marketplaces configured)';
		super(
			`Workflow "${workflowName}" not found in any configured marketplace (searched: ${sourceList}).`,
		);
		this.name = 'WorkflowNotFoundError';
		this.workflowName = workflowName;
		this.searchedSources = searchedSources;
	}
}
