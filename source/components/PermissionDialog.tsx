import React, {useState, useCallback} from 'react';
import {Box, Text, useInput} from 'ink';
import {type HookEventDisplay} from '../types/hooks/display.js';
import {isToolEvent} from '../types/hooks/events.js';
import {type PermissionDecision} from '../types/server.js';
import {parseToolName, formatArgs} from '../utils/toolNameParser.js';
import {getRiskTier, RISK_TIER_CONFIG} from '../services/riskTier.js';
import PermissionHeader from './PermissionHeader.js';
import KeybindingBar from './KeybindingBar.js';
import RawPayloadDetails from './RawPayloadDetails.js';
import TypeToConfirm from './TypeToConfirm.js';

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
	agentChain,
}: Props) {
	const [showDetails, setShowDetails] = useState(false);

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

	// Format args for display
	const formattedArgs = formatArgs(toolInput);

	// Check if type-to-confirm is required
	const requiresConfirmation = tierConfig.requiresConfirmation === true;

	// Handle type-to-confirm callbacks
	const handleConfirm = useCallback(() => {
		onDecision('allow');
	}, [onDecision]);

	const handleCancel = useCallback(() => {
		onDecision('deny');
	}, [onDecision]);

	// Keyboard handling with useInput
	useInput(
		(input, key) => {
			// If tier requires confirmation, don't process keyboard shortcuts
			// (TypeToConfirm handles its own input)
			if (requiresConfirmation) {
				return;
			}

			if (key.escape) {
				onDecision('deny');
				return;
			}

			// Toggle details with 'i' or '?'
			if (input === 'i' || input === '?') {
				setShowDetails(prev => !prev);
				return;
			}

			// Permission decisions
			if (input === 'a') {
				onDecision('allow');
				return;
			}

			if (input === 'd' || key.return) {
				onDecision('deny');
				return;
			}

			if (input === 'A') {
				onDecision('always-allow');
				return;
			}

			if (input === 'D') {
				onDecision('always-deny');
				return;
			}

			// "S" = always allow all tools from this MCP server
			if (input === 'S' && parsed.isMcp) {
				onDecision('always-allow-server');
				return;
			}
		},
		{isActive: !requiresConfirmation},
	);

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor={tierConfig.color}
			paddingX={1}
		>
			{/* Header with risk tier badge */}
			<PermissionHeader tier={tier} queuedCount={queuedCount} />

			{/* Context block */}
			<Box marginTop={1} flexDirection="column">
				{/* Tool name */}
				<Box>
					<Text>Tool: </Text>
					<Text bold>{displayName}</Text>
				</Box>

				{/* Server label (if MCP) */}
				{serverLabel && (
					<Box>
						<Text>Server: </Text>
						<Text dimColor>{serverLabel}</Text>
					</Box>
				)}

				{/* Args */}
				<Box>
					<Text>Args: </Text>
					<Text dimColor>{formattedArgs}</Text>
				</Box>

				{/* Agent chain context */}
				{agentChain && agentChain.length > 0 && (
					<Box>
						<Text dimColor>Context: </Text>
						<Text color="magenta">{agentChain.join(' → ')}</Text>
					</Box>
				)}
			</Box>

			{/* Raw payload details (collapsible) */}
			<Box marginTop={1}>
				<RawPayloadDetails
					rawToolName={rawToolName}
					payload={toolInput ?? {}}
					isExpanded={showDetails}
				/>
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
					<KeybindingBar toolName={displayName} serverLabel={serverLabel} />
				)}
			</Box>
		</Box>
	);
}
