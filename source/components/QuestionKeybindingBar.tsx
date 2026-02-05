import React from 'react';
import {Box, Text} from 'ink';

type Props = {
	multiSelect: boolean;
};

export default function QuestionKeybindingBar({multiSelect}: Props) {
	return (
		<Box gap={2}>
			<Text>
				<Text dimColor>↑/↓</Text> Navigate
			</Text>
			{multiSelect ? (
				<>
					<Text>
						<Text dimColor>Space</Text> Toggle
					</Text>
					<Text>
						<Text dimColor>Enter</Text> Submit
					</Text>
				</>
			) : (
				<Text>
					<Text dimColor>Enter</Text> Select
				</Text>
			)}
			<Text>
				<Text dimColor>Esc</Text> Skip
			</Text>
		</Box>
	);
}
