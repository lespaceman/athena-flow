import React, {useCallback, useMemo} from 'react';
import {Box, Text, useInput} from 'ink';
import {type HookEventDisplay} from '../types/hooks/display.js';
import {isToolEvent} from '../types/hooks/events.js';
import {type PermissionDecision} from '../types/server.js';
import {parseToolName} from '../utils/toolNameParser.js';
import {getRiskTier, RISK_TIER_CONFIG} from '../services/riskTier.js';
import OptionList, {type OptionItem} from './OptionList.js';
import TypeToConfirm from './TypeToConfirm.js';
import {useTheme} from '../theme/index.js';

type Props = {
	request: HookEventDisplay;
	queuedCount: number;
	onDecision: (decision: PermissionDecision) => void;
	agentChain?: string[];
};

export default function PermissionDialog({
	request,
	queuedCount,
	onDecision,
}: Props) {
	const theme = useTheme();

	// Get the raw tool name
	const rawToolName = request.toolName ?? 'Unknown';

	// Parse tool name for display
	const parsed = parseToolName(rawToolName);
	const {displayName, serverLabel} = parsed;

	// Extract tool input from payload if it's a tool event
	let toolInput: Record<string, unknown> | undefined;
	if (isToolEvent(request.payload)) {
		toolInput = request.payload.tool_input;
	}

	// Get risk tier (pass toolInput for Bash command-level classification)
	const tier = getRiskTier(rawToolName, toolInput);
	const tierConfig = RISK_TIER_CONFIG[tier];

	// Check if type-to-confirm is required
	const requiresConfirmation = tierConfig.requiresConfirmation === true;

	// Build options for the select menu
	const options: OptionItem[] = useMemo(() => {
		const items: OptionItem[] = [
			{label: 'Allow', description: 'Allow this tool call', value: 'allow'},
			{label: 'Deny', description: 'Deny this tool call', value: 'deny'},
			{
				label: `Always allow "${displayName}"`,
				description: 'Remember this choice for this tool',
				value: 'always-allow',
			},
			{
				label: `Always deny "${displayName}"`,
				description: 'Always block this tool',
				value: 'always-deny',
			},
		];

		if (parsed.isMcp && serverLabel) {
			items.push({
				label: `Always allow all from ${serverLabel}`,
				description: 'Trust all tools from this server',
				value: 'always-allow-server',
			});
		}

		return items;
	}, [displayName, serverLabel, parsed.isMcp]);

	// Handle type-to-confirm callbacks
	const handleConfirm = useCallback(() => {
		onDecision('allow');
	}, [onDecision]);

	const handleCancel = useCallback(() => {
		onDecision('deny');
	}, [onDecision]);

	// Handle option selection
	const handleSelect = useCallback(
		(value: string) => {
			onDecision(value as PermissionDecision);
		},
		[onDecision],
	);

	// Escape to deny (standard terminal convention)
	useInput(
		(_input, key) => {
			if (key.escape) {
				onDecision('deny');
			}
		},
		{isActive: !requiresConfirmation},
	);

	// Build title: "Allow {displayName}?" or "Allow {displayName} ({serverLabel})?"
	const title = serverLabel
		? `Allow ${displayName} (${serverLabel})?`
		: `Allow ${displayName}?`;

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor={tierConfig.color(theme)}
			paddingX={1}
		>
			{/* Title line with optional queue count */}
			<Box justifyContent="space-between">
				<Text bold>{title}</Text>
				{queuedCount > 0 && <Text dimColor>+{queuedCount}</Text>}
			</Box>

			{/* Action area */}
			<Box marginTop={1}>
				{requiresConfirmation ? (
					<TypeToConfirm
						confirmText={displayName}
						onConfirm={handleConfirm}
						onCancel={handleCancel}
					/>
				) : (
					<OptionList options={options} onSelect={handleSelect} />
				)}
			</Box>

			{/* Footer hint (non-destructive only) */}
			{!requiresConfirmation && (
				<Box marginTop={1}>
					<Text dimColor>↑↓ Navigate Enter Select Esc Deny</Text>
				</Box>
			)}
		</Box>
	);
}
