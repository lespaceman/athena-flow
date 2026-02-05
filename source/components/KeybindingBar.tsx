import React from 'react';
import {Box, Text} from 'ink';

type Props = {
	toolName: string;
	serverLabel?: string;
};

export default function KeybindingBar({toolName, serverLabel}: Props) {
	// Build the scope suffix for "always" actions
	const scopeSuffix = serverLabel ? ` on ${serverLabel}` : '';

	return (
		<Box flexDirection="column">
			{/* Line 1: Basic actions */}
			<Box gap={2}>
				<Text>
					<Text color="green" bold>
						a
					</Text>{' '}
					Allow
				</Text>
				<Text>
					<Text color="red" bold>
						d
					</Text>{' '}
					Deny <Text dimColor>(default)</Text>
				</Text>
				<Text>
					<Text dimColor>i</Text> Details
				</Text>
			</Box>

			{/* Line 2: Always allow */}
			<Box>
				<Text>
					<Text color="green" bold>
						A
					</Text>{' '}
					Always allow &quot;{toolName}&quot;{scopeSuffix}
				</Text>
			</Box>

			{/* Line 3: Always deny */}
			<Box>
				<Text>
					<Text color="red" bold>
						D
					</Text>{' '}
					Always deny &quot;{toolName}&quot;{scopeSuffix}
				</Text>
			</Box>
		</Box>
	);
}
