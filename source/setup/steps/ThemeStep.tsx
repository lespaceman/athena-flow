import React from 'react';
import {Box, Text} from 'ink';
import StepSelector from '../components/StepSelector.js';

type Props = {
	onComplete: (theme: string) => void;
};

export default function ThemeStep({onComplete}: Props) {
	return (
		<Box flexDirection="column">
			<Text bold>Select theme:</Text>
			<StepSelector
				options={[
					{label: 'Dark', value: 'dark'},
					{label: 'Light', value: 'light'},
				]}
				onSelect={onComplete}
			/>
		</Box>
	);
}
