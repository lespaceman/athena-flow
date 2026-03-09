import {Box, Text} from 'ink';
import {useTheme} from '../../ui/theme/index';
import {getGlyphs} from '../../ui/glyphs/index';

type Props = {
	stepState: 'selecting' | 'verifying' | 'success' | 'error';
	stepIndex: number;
};

export default function WizardHints({stepState, stepIndex}: Props) {
	const theme = useTheme();
	const g = getGlyphs();

	if (stepState === 'verifying' || stepState === 'success') {
		return <Box />;
	}

	const hints: string[] = [];

	if (stepState === 'error') {
		hints.push('r retry');
		if (stepIndex > 0) hints.push(`${g['hint.escape']} back`);
	} else {
		hints.push(`${g['hint.arrowsUpDown']} move`);
		hints.push(`${g['hint.enter']} select`);
		if (stepIndex > 0) hints.push(`${g['hint.escape']} back`);
		hints.push('s skip');
	}

	return (
		<Box>
			<Text color={theme.textMuted}>{hints.join('  ')}</Text>
		</Box>
	);
}
