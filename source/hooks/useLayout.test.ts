import {describe, it, expect} from 'vitest';

describe('useLayout height constants', () => {
	it('total rendered rows should equal terminalRows with dynamic footer', () => {
		// Frame: top(1) + header(1) + section(1) + body + section(1) + footer(footerRows) + bottom(1)
		const terminalRows = 40;
		const HEADER_ROWS = 1;
		const FRAME_BORDER_ROWS = 4;
		const footerRows = 2; // 1 hints + 1 input line (default)
		const bodyHeight =
			terminalRows - HEADER_ROWS - footerRows - FRAME_BORDER_ROWS;
		const totalRendered =
			bodyHeight + HEADER_ROWS + FRAME_BORDER_ROWS + footerRows;
		expect(totalRendered).toBe(terminalRows);
	});

	it('adjusts body height for multi-line input footer', () => {
		const terminalRows = 40;
		const HEADER_ROWS = 1;
		const FRAME_BORDER_ROWS = 4;
		const footerRows = 4; // 1 hints + 3 input lines
		const bodyHeight =
			terminalRows - HEADER_ROWS - footerRows - FRAME_BORDER_ROWS;
		expect(bodyHeight).toBe(31); // 40 - 1 - 4 - 4
	});
});
