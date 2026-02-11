import React from 'react';
import {Box, Text} from 'ink';
import {useTheme} from '../theme/index.js';

type Props = {
	toolName: string;
	serverLabel?: string;
};

export default function KeybindingBar({toolName, serverLabel}: Props) {
	const theme = useTheme();
	// Build the scope suffix for "always" actions
	const scopeSuffix = serverLabel ? ` on ${serverLabel}` : '';

	return (
		<Box flexDirection="column">
			{/* Line 1: Basic actions */}
			<Box gap={2}>
				<Text>
					<Text color={theme.status.success} bold>
						a
					</Text>{' '}
					Allow
				</Text>
				<Text>
					<Text color={theme.status.error} bold>
						d
					</Text>{' '}
					Deny <Text dimColor>(default)</Text>
				</Text>
				<Text>
					<Text dimColor>Esc</Text> Cancel
				</Text>
			</Box>

			{/* Separator */}
			<Box>
				<Text dimColor>Persistent:</Text>
			</Box>

			{/* Line 2: Always allow */}
			<Box>
				<Text>
					<Text color={theme.status.success} bold>
						A
					</Text>{' '}
					Always allow &quot;{toolName}&quot;{scopeSuffix}
				</Text>
			</Box>

			{/* Line 3: Always deny */}
			<Box>
				<Text>
					<Text color={theme.status.error} bold>
						D
					</Text>{' '}
					Always deny &quot;{toolName}&quot;{scopeSuffix}
				</Text>
			</Box>

			{/* Line 4: Always allow server (MCP only) */}
			{serverLabel && (
				<Box>
					<Text>
						<Text color={theme.status.info} bold>
							S
						</Text>{' '}
						Always allow all from {serverLabel}
					</Text>
				</Box>
			)}
		</Box>
	);
}
