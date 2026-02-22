import React from 'react';
import {Text, Box} from 'ink';

type Props = {
	status: 'verifying' | 'success' | 'error';
	message: string;
};

export default function StepStatus({status, message}: Props) {
	const icon = status === 'success' ? '✓' : status === 'error' ? '✗' : '⠋';
	const color =
		status === 'success' ? 'green' : status === 'error' ? 'red' : 'yellow';

	return (
		<Box>
			<Text color={color}>{icon} </Text>
			<Text color={color}>{message}</Text>
		</Box>
	);
}
