import {useCallback, useMemo} from 'react';
import {Box, Text, useInput, useStdout} from 'ink';
import {getGlyphs} from '../glyphs/index';
import {
	type PermissionDecision,
	type PermissionQueueItem,
	isScopedPermissionsRequest,
} from '../../core/controller/permission';
import {parseToolName} from '../../shared/utils/toolNameParser';
import {useTheme} from '../theme/index';
import OptionList, {type OptionItem} from './OptionList';

type Props = {
	request: PermissionQueueItem;
	queuedCount: number;
	onDecision: (decision: PermissionDecision) => void;
};

export default function PermissionDialog({
	request,
	queuedCount,
	onDecision,
}: Props) {
	const rawToolName = request.tool_name;
	const {displayName, serverLabel, isMcp} = parseToolName(rawToolName);
	const isPermissionsRequest = isScopedPermissionsRequest(request.hookName);

	const options: OptionItem[] = useMemo(() => {
		if (isPermissionsRequest) {
			return [
				{label: 'Allow this turn', value: 'allow'},
				{label: 'Deny', value: 'deny'},
				{label: 'Allow for this session', value: 'always-allow'},
			];
		}

		const items: OptionItem[] = [
			{label: 'Allow', value: 'allow'},
			{label: 'Deny', value: 'deny'},
			{label: `Always allow "${displayName}"`, value: 'always-allow'},
		];

		if (isMcp && serverLabel) {
			items.push({
				label: `Always allow all from ${serverLabel}`,
				value: 'always-allow-server',
			});
		}

		return items;
	}, [displayName, isMcp, isPermissionsRequest, serverLabel]);

	const handleSelect = useCallback(
		(value: string) => {
			onDecision(value as PermissionDecision);
		},
		[onDecision],
	);

	useInput((_input, key) => {
		if (key.escape) {
			onDecision('deny');
		}
	});

	const title = isPermissionsRequest
		? 'Grant requested permissions?'
		: serverLabel
			? `Allow "${displayName}" (${serverLabel})?`
			: `Allow "${displayName}"?`;

	const requestReason =
		typeof request.tool_input.reason === 'string'
			? request.tool_input.reason
			: null;

	const theme = useTheme();
	const g = getGlyphs();
	const {stdout} = useStdout();
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- can be undefined in non-TTY
	const columns = stdout?.columns ?? 80;
	const rule = g['general.divider'].repeat(columns);

	return (
		<Box flexDirection="column">
			<Text color={theme.dialog.borderPermission}>{rule}</Text>

			<Box flexDirection="column" paddingX={1}>
				<Box justifyContent="space-between">
					<Text bold color={theme.dialog.borderPermission}>
						{title}
					</Text>
					{queuedCount > 0 && <Text dimColor>+{queuedCount}</Text>}
				</Box>

				<Box marginTop={1}>
					<OptionList options={options} onSelect={handleSelect} />
				</Box>

				{requestReason && (
					<Box marginTop={1}>
						<Text dimColor>{requestReason}</Text>
					</Box>
				)}

				<Box marginTop={1} gap={2}>
					<Text>
						<Text dimColor>up/down</Text> Navigate
					</Text>
					<Text>
						<Text dimColor>1-{options.length}</Text> Jump
					</Text>
					<Text>
						<Text dimColor>Enter</Text> Select
					</Text>
					<Text>
						<Text dimColor>Esc</Text> Cancel
					</Text>
				</Box>
			</Box>
		</Box>
	);
}
