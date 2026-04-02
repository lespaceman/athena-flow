import {useState, useCallback, useEffect} from 'react';
import {Box, Text} from 'ink';
import StepSelector from '../../setup/components/StepSelector';
import StepStatus from '../../setup/components/StepStatus';
import McpOptionsStep from '../../setup/steps/McpOptionsStep';
import {
	installWorkflow,
	resolveWorkflow,
	installWorkflowPlugins,
} from '../../core/workflows/index';
import {
	loadWorkflowOptions,
	type WorkflowOption,
} from '../../core/workflows/workflowOptions';
import {
	writeProjectConfig,
	type McpServerChoices,
} from '../../infra/plugins/config';
import {
	collectMcpServersWithOptions,
	type McpServerWithOptions,
} from '../../infra/plugins/mcpOptions';
import {useTheme} from '../../ui/theme/index';

const DEFAULT_WORKFLOW_OPTION: WorkflowOption = {
	label: 'default',
	value: 'default',
	description: 'Built-in default workflow',
};

type PickerPhase =
	| {type: 'loading'}
	| {type: 'selecting'; options: WorkflowOption[]}
	| {type: 'installing'; workflowValue: string}
	| {
			type: 'mcp-options';
			workflowName: string;
			servers: McpServerWithOptions[];
	  }
	| {type: 'done'}
	| {type: 'error'; message: string};

type Props = {
	projectDir: string;
	onComplete: (
		workflowName: string,
		mcpServerOptions?: McpServerChoices,
	) => void;
};

export default function WorkflowPicker({projectDir, onComplete}: Props) {
	const theme = useTheme();
	const [phase, setPhase] = useState<PickerPhase>({type: 'loading'});

	useEffect(() => {
		try {
			const marketplaceOptions = loadWorkflowOptions();
			const options = [DEFAULT_WORKFLOW_OPTION, ...marketplaceOptions];
			setPhase({type: 'selecting', options});
		} catch {
			// If marketplace fails, still show default
			setPhase({type: 'selecting', options: [DEFAULT_WORKFLOW_OPTION]});
		}
	}, []);

	const handleSelect = useCallback(
		(value: string) => {
			if (value === 'default') {
				writeProjectConfig(projectDir, {activeWorkflow: 'default'});
				setPhase({type: 'done'});
				onComplete('default');
				return;
			}

			setPhase({type: 'installing', workflowValue: value});
			setTimeout(() => {
				try {
					const name = installWorkflow(value);
					const resolved = resolveWorkflow(name);
					const pluginDirs = installWorkflowPlugins(resolved);
					const servers = collectMcpServersWithOptions(pluginDirs);

					if (servers.length > 0) {
						setPhase({
							type: 'mcp-options',
							workflowName: name,
							servers,
						});
					} else {
						writeProjectConfig(projectDir, {activeWorkflow: name});
						setPhase({type: 'done'});
						onComplete(name);
					}
				} catch (err) {
					setPhase({
						type: 'error',
						message: `Installation failed: ${(err as Error).message}`,
					});
				}
			}, 0);
		},
		[projectDir, onComplete],
	);

	const handleMcpComplete = useCallback(
		(choices: McpServerChoices) => {
			if (phase.type !== 'mcp-options') return;
			const {workflowName} = phase;
			writeProjectConfig(projectDir, {
				activeWorkflow: workflowName,
				workflowSelections: {
					[workflowName]: {mcpServerOptions: choices},
				},
			});
			setPhase({type: 'done'});
			onComplete(workflowName, choices);
		},
		[phase, projectDir, onComplete],
	);

	return (
		<Box
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			paddingX={2}
		>
			<Text bold color={theme.accent}>
				Select a workflow
			</Text>
			<Text color={theme.textMuted}>Choose a workflow for this project.</Text>

			{phase.type === 'loading' && (
				<StepStatus status="verifying" message="Loading workflows..." />
			)}

			{phase.type === 'selecting' && (
				<Box marginTop={1}>
					<StepSelector options={phase.options} onSelect={handleSelect} />
				</Box>
			)}

			{phase.type === 'installing' && (
				<StepStatus status="verifying" message="Installing workflow..." />
			)}

			{phase.type === 'mcp-options' && (
				<Box marginTop={1}>
					<McpOptionsStep
						servers={phase.servers}
						onComplete={handleMcpComplete}
					/>
				</Box>
			)}

			{phase.type === 'error' && (
				<Text color={theme.status.error}>{phase.message}</Text>
			)}
		</Box>
	);
}
