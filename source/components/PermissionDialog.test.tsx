import {describe, expect, it, afterEach} from 'vitest';
import React from 'react';
import chalk from 'chalk';
import {render} from 'ink-testing-library';
import PermissionDialog from './PermissionDialog.js';

describe('PermissionDialog separator color', () => {
	const savedLevel = chalk.level;
	afterEach(() => {
		chalk.level = savedLevel;
	});

	it('uses themed separator instead of dim dashes', () => {
		chalk.level = 3;
		const {lastFrame} = render(
			<PermissionDialog
				request={{
					event_id: 'e1',
					tool_name: 'Bash',
					tool_input: {},
				}}
				queuedCount={0}
				onDecision={() => {}}
			/>,
		);
		const output = lastFrame() ?? '';
		// Should contain horizontal rule glyphs (─) instead of plain dashes
		expect(output).toContain('─');
	});
});
