import React, {useCallback, useMemo} from 'react';
import {Box, Text, useInput, useStdout} from 'ink';
import {type HookEventDisplay} from '../types/hooks/display.js';
import {type PermissionDecision} from '../types/server.js';
import {parseToolName} from '../utils/toolNameParser.js';
import OptionList, {type OptionItem} from './OptionList.js';

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
	const rawToolName = request.toolName ?? 'Unknown';
	const {displayName, serverLabel, isMcp} = parseToolName(rawToolName);

	const options: OptionItem[] = useMemo(() => {
		const items: OptionItem[] = [
			{label: 'Allow', value: 'allow'},
			{label: 'Deny', value: 'deny'},
			{label: `Always allow "${displayName}"`, value: 'always-allow'},
		];

		if (isMcp && serverLabel) {
			items.push({
				label: `Always allow all from ${serverLabel}`,
				value: 'always-allow-server',
			});
		}

		return items;
	}, [displayName, serverLabel, isMcp]);

	const handleSelect = useCallback(
		(value: string) => {
			onDecision(value as PermissionDecision);
		},
		[onDecision],
	);

	useInput((_input, key) => {
		if (key.escape) {
			onDecision('deny');
		}
	});

	const title = serverLabel
		? `Allow "${displayName}" (${serverLabel})?`
		: `Allow "${displayName}"?`;

	const {stdout} = useStdout();
	const columns = stdout?.columns ?? 80;

	return (
		<Box flexDirection="column">
			<Text dimColor>{'╌'.repeat(columns)}</Text>

			<Box flexDirection="column" paddingX={1}>
				<Box justifyContent="space-between">
					<Text bold>{title}</Text>
					{queuedCount > 0 && <Text dimColor>+{queuedCount}</Text>}
				</Box>

				<Box marginTop={1}>
					<OptionList options={options} onSelect={handleSelect} />
				</Box>

				<Box marginTop={1} gap={2}>
					<Text>
						<Text dimColor>↑/↓</Text> Navigate
					</Text>
					<Text>
						<Text dimColor>1-{options.length}</Text> Jump
					</Text>
					<Text>
						<Text dimColor>Enter</Text> Select
					</Text>
					<Text>
						<Text dimColor>Esc</Text> Cancel
					</Text>
				</Box>
			</Box>
		</Box>
	);
}
