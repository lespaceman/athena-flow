import React from 'react';
import {Box, Text} from 'ink';
import {type RiskTier, RISK_TIER_CONFIG} from '../services/riskTier.js';

type Props = {
	tier: RiskTier;
	queuedCount: number;
};

export default function PermissionHeader({tier, queuedCount}: Props) {
	const config = RISK_TIER_CONFIG[tier];

	return (
		<Box>
			<Text color={config.color}>
				{config.icon} Permission Required [{config.label}]
			</Text>
			{queuedCount > 0 && <Text dimColor> ({queuedCount} more queued)</Text>}
		</Box>
	);
}
