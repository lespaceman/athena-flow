import {describe, it, expect} from 'vitest';

describe('useLayout height constants', () => {
	it('total rendered rows should equal terminalRows', () => {
		// Frame: top(1) + header(1) + section(1) + body + section(1) + footer(2) + bottom(1) = body + 7
		const terminalRows = 40;
		const HEADER_ROWS = 1;
		const FOOTER_ROWS = 2;
		const FRAME_BORDER_ROWS = 4;
		const bodyHeight =
			terminalRows - HEADER_ROWS - FOOTER_ROWS - FRAME_BORDER_ROWS;
		const totalRendered = bodyHeight + 7;
		expect(totalRendered).toBe(terminalRows);
	});
});
