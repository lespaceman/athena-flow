import React from 'react';
import {Box, Text} from 'ink';

type Props = {
	rawToolName: string;
	payload: Record<string, unknown>;
	isExpanded: boolean;
};

export default function RawPayloadDetails({
	rawToolName,
	payload,
	isExpanded,
}: Props) {
	if (!isExpanded) {
		return (
			<Box>
				<Text dimColor>▸ Show raw payload (press i)</Text>
			</Box>
		);
	}

	const jsonString = JSON.stringify(payload, null, 2);

	return (
		<Box flexDirection="column">
			<Text dimColor>▾ Hide raw payload (press i)</Text>
			<Text dimColor>Raw tool: {rawToolName}</Text>
			<Text dimColor>{jsonString}</Text>
		</Box>
	);
}
