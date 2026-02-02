import React from 'react';
import {Box, Text} from 'ink';
import os from 'node:os';

type Props = {
	version: string;
	projectDir: string;
};

function shortenPath(fullPath: string): string {
	const home = os.homedir();
	if (fullPath.startsWith(home)) {
		return '~' + fullPath.slice(home.length);
	}
	return fullPath;
}

export default function Header({version, projectDir}: Props) {
	return (
		<Box flexDirection="row" marginTop={1} marginBottom={1} gap={2}>
			<Box flexDirection="column">
				<Text color="cyan">{'░████            ░████'}</Text>
				<Text color="cyan">{'░██     ░██ ░██    ░██'}</Text>
				<Text color="cyan">{'░██    ░██   ░██   ░██'}</Text>
				<Text color="cyan">{'░██   ░██     ░██  ░██'}</Text>
				<Text color="cyan">{'░██    ░██   ░██   ░██'}</Text>
				<Text color="cyan">{'░██     ░██ ░██    ░██'}</Text>
				<Text color="cyan">{'░██                ░██'}</Text>
				<Text color="cyan">{'░████            ░████'}</Text>
			</Box>
			<Box flexDirection="column" paddingTop={3}>
				<Text>
					<Text bold>Athena</Text>
					<Text dimColor> v{version}</Text>
				</Text>
				<Text dimColor>Opus 4.5</Text>
				<Text dimColor>{shortenPath(projectDir)}</Text>
			</Box>
		</Box>
	);
}

export {shortenPath};
