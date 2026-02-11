import React from 'react';
import {Box, Text} from 'ink';
import {type RiskTier, RISK_TIER_CONFIG} from '../services/riskTier.js';
import {useTheme} from '../theme/index.js';

type Props = {
	tier: RiskTier;
	queuedCount: number;
};

export default function PermissionHeader({tier, queuedCount}: Props) {
	const config = RISK_TIER_CONFIG[tier];
	const theme = useTheme();

	return (
		<Box>
			<Text color={config.color(theme)}>
				{config.icon} Permission Required [{config.label}]
			</Text>
			{queuedCount > 0 && <Text dimColor> ({queuedCount} more queued)</Text>}
		</Box>
	);
}
