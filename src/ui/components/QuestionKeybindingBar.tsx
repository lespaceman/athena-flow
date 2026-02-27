import {Box, Text} from 'ink';

type Props = {
	multiSelect: boolean;
	optionCount?: number;
};

export default function QuestionKeybindingBar({
	multiSelect,
	optionCount = 0,
}: Props) {
	return (
		<Box gap={2}>
			<Text>
				<Text dimColor>up/down</Text> Navigate
			</Text>
			{optionCount > 0 && (
				<Text>
					<Text dimColor>1-{optionCount}</Text> Jump
				</Text>
			)}
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
