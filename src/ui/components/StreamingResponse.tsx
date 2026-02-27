import {Box, Text} from 'ink';
import {useTheme} from '../theme/index';
import {getGlyphs} from '../glyphs/index';

const g = getGlyphs();

type Props = {
	text: string;
	isStreaming: boolean;
};

export default function StreamingResponse({text, isStreaming}: Props) {
	const theme = useTheme();
	if (!text) {
		return null;
	}

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text bold color={theme.accent}>
				{isStreaming
					? `${g['status.streaming']} Streaming`
					: `${g['status.active']} Response`}
			</Text>
			<Text wrap="wrap" color={theme.text}>
				{text}
			</Text>
		</Box>
	);
}
