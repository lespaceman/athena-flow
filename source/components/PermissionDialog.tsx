import React, {useCallback} from 'react';
import {Box, Text} from 'ink';
import {Select} from '@inkjs/ui';
import {type HookEventDisplay} from '../types/hooks/display.js';
import {isToolEvent} from '../types/hooks/events.js';
import {type PermissionDecision} from '../types/server.js';

const PERMISSION_DECISIONS: readonly PermissionDecision[] = [
	'allow',
	'deny',
	'always-allow',
	'always-deny',
];

function isPermissionDecision(value: string): value is PermissionDecision {
	return (PERMISSION_DECISIONS as readonly string[]).includes(value);
}

type Props = {
	request: HookEventDisplay;
	queuedCount: number;
	onDecision: (decision: PermissionDecision) => void;
};

export default function PermissionDialog({
	request,
	queuedCount,
	onDecision,
}: Props) {
	const toolName = request.toolName ?? 'Unknown';

	// Build input preview
	let inputPreview = '';
	if (isToolEvent(request.payload)) {
		const inputStr = JSON.stringify(request.payload.tool_input, null, 2);
		inputPreview =
			inputStr.length > 200 ? inputStr.slice(0, 197) + '...' : inputStr;
	}

	const handleChange = useCallback(
		(value: string) => {
			if (isPermissionDecision(value)) {
				onDecision(value);
			}
		},
		[onDecision],
	);

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="yellow"
			paddingX={1}
		>
			<Box>
				<Text bold color="yellow">
					Permission Required
				</Text>
				{queuedCount > 0 && <Text dimColor> ({queuedCount} more queued)</Text>}
			</Box>
			<Box marginTop={1}>
				<Text>
					Tool: <Text bold>{toolName}</Text>
				</Text>
			</Box>
			{inputPreview && (
				<Box>
					<Text dimColor>{inputPreview}</Text>
				</Box>
			)}
			<Box marginTop={1}>
				<Select
					options={[
						{label: 'Allow', value: 'allow'},
						{label: 'Deny', value: 'deny'},
						{label: `Always allow ${toolName}`, value: 'always-allow'},
						{label: `Always deny ${toolName}`, value: 'always-deny'},
					]}
					onChange={handleChange}
				/>
			</Box>
		</Box>
	);
}
