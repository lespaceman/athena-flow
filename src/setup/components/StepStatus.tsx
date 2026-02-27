import {Text, Box} from 'ink';
import {useTheme} from '../../ui/theme/index';

type Props = {
	status: 'verifying' | 'success' | 'error';
	message: string;
};

export default function StepStatus({status, message}: Props) {
	const theme = useTheme();
	const icon = status === 'success' ? '✓' : status === 'error' ? '✗' : '⠋';
	const color =
		status === 'success'
			? theme.status.success
			: status === 'error'
				? theme.status.error
				: theme.status.working;

	return (
		<Box flexDirection="row" marginTop={1}>
			<Text color={color} bold>
				{icon}{' '}
			</Text>
			<Text color={color}>{message}</Text>
		</Box>
	);
}
