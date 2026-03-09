import {Box, Text} from 'ink';
import {useTheme} from '../../ui/theme/index';
import {getGlyphs} from '../../ui/glyphs/index';

type Props = {
	steps: string[];
	currentIndex: number;
	completedSteps: Set<number>;
};

export default function StepDots({steps, currentIndex, completedSteps}: Props) {
	const theme = useTheme();
	const g = getGlyphs();

	const label =
		currentIndex >= steps.length ? 'Complete' : (steps[currentIndex] ?? '');

	return (
		<Box>
			{steps.map((_, i) => {
				const isCompleted = completedSteps.has(i);
				const isCurrent = i === currentIndex;

				let dot: string;
				let color: string;
				if (isCompleted) {
					dot = g['todo.done'];
					color = theme.status.success;
				} else if (isCurrent) {
					dot = g['status.active'];
					color = theme.accent;
				} else {
					dot = g['status.pending'];
					color = theme.textMuted;
				}

				return (
					<Text key={i} color={color}>
						{dot}
						{i < steps.length - 1 ? ' ' : ''}
					</Text>
				);
			})}
			<Text color={theme.accent} bold>
				{'  '}
				{label}
			</Text>
		</Box>
	);
}
