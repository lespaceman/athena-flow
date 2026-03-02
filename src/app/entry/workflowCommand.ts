import {
	installWorkflow,
	listWorkflows,
	removeWorkflow,
} from '../../core/workflows/index';

const USAGE = `Usage: athena-flow workflow <subcommand>

Subcommands
  install <source>   Install a workflow from a file path or marketplace ref
  list               List installed workflows
  remove <name>      Remove an installed workflow`;

export type WorkflowCommandInput = {
	subcommand: string;
	subcommandArgs: string[];
};

export type WorkflowCommandDeps = {
	installWorkflow?: typeof installWorkflow;
	listWorkflows?: typeof listWorkflows;
	removeWorkflow?: typeof removeWorkflow;
	logError?: (message: string) => void;
	logOut?: (message: string) => void;
};

export function runWorkflowCommand(
	input: WorkflowCommandInput,
	deps: WorkflowCommandDeps = {},
): number {
	const install = deps.installWorkflow ?? installWorkflow;
	const list = deps.listWorkflows ?? listWorkflows;
	const remove = deps.removeWorkflow ?? removeWorkflow;
	const logError = deps.logError ?? console.error;
	const logOut = deps.logOut ?? console.log;

	switch (input.subcommand) {
		case 'install': {
			const source = input.subcommandArgs[0];
			if (!source) {
				logError('Usage: athena-flow workflow install <source>');
				return 1;
			}
			try {
				const name = install(source);
				logOut(`Installed workflow: ${name}`);
				return 0;
			} catch (error) {
				logError(
					`Error: ${error instanceof Error ? error.message : String(error)}`,
				);
				return 1;
			}
		}

		case 'list': {
			const workflows = list();
			if (workflows.length === 0) {
				logOut('No workflows installed.');
			} else {
				for (const name of workflows) {
					logOut(name);
				}
			}
			return 0;
		}

		case 'remove': {
			const name = input.subcommandArgs[0];
			if (!name) {
				logError('Usage: athena-flow workflow remove <name>');
				return 1;
			}
			try {
				remove(name);
				logOut(`Removed workflow: ${name}`);
				return 0;
			} catch (error) {
				logError(
					`Error: ${error instanceof Error ? error.message : String(error)}`,
				);
				return 1;
			}
		}

		default:
			logError(USAGE);
			return 1;
	}
}
