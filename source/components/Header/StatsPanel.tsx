import React from 'react';
import {Box, Text} from 'ink';
import {formatTokens, formatDuration} from '../../utils/formatters.js';
import type {SessionMetrics} from '../../types/headerMetrics.js';

type Props = {
	metrics: SessionMetrics;
	elapsed: number;
	terminalWidth: number;
};

function StatRow({label, value}: {label: string; value: string | number}) {
	return (
		<Text>
			<Text dimColor>{label}: </Text>
			<Text>{String(value)}</Text>
		</Text>
	);
}

function TokenStats({metrics}: {metrics: SessionMetrics}) {
	return (
		<Box flexDirection="column">
			<Text bold dimColor>
				Tokens
			</Text>
			<StatRow label="  Input" value={formatTokens(metrics.tokens.input)} />
			<StatRow label="  Output" value={formatTokens(metrics.tokens.output)} />
			<StatRow
				label="  Cache read"
				value={formatTokens(metrics.tokens.cacheRead)}
			/>
			<StatRow
				label="  Cache write"
				value={formatTokens(metrics.tokens.cacheWrite)}
			/>
		</Box>
	);
}

function SubagentTable({metrics}: {metrics: SessionMetrics}) {
	if (metrics.subagentCount === 0) return null;

	return (
		<Box flexDirection="column" marginTop={1}>
			<Text bold dimColor>
				Sub-agents
			</Text>
			{metrics.subagentMetrics.map(sub => (
				<Text key={sub.agentId}>
					<Text dimColor>{'  '}</Text>
					<Text color="cyan">{sub.agentType}</Text>
					<Text dimColor> tools: </Text>
					<Text>{sub.toolCallCount}</Text>
				</Text>
			))}
		</Box>
	);
}

export default function StatsPanel({metrics, elapsed, terminalWidth}: Props) {
	const useColumns = terminalWidth >= 80;

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="gray"
			paddingX={1}
		>
			<Box
				flexDirection={useColumns ? 'row' : 'column'}
				gap={useColumns ? 4 : 0}
			>
				<Box flexDirection="column">
					<Text bold dimColor>
						Session
					</Text>
					<StatRow label="  Tool calls" value={metrics.toolCallCount} />
					<StatRow label="  Sub-agents" value={metrics.subagentCount} />
					<StatRow label="  Duration" value={formatDuration(elapsed)} />
					<StatRow
						label="  Permissions"
						value={`${metrics.permissions.allowed} allowed, ${metrics.permissions.denied} denied`}
					/>
				</Box>
				<TokenStats metrics={metrics} />
			</Box>
			<SubagentTable metrics={metrics} />
		</Box>
	);
}
