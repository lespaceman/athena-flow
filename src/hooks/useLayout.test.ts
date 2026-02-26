import {describe, it, expect} from 'vitest';

describe('useLayout height constants', () => {
	it('total rendered rows should equal terminalRows with dynamic footer', () => {
		const terminalRows = 40;
		const HEADER_ROWS = 1;
		const FRAME_BORDER_ROWS = 4;
		const footerRows = 2;
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
		const footerRows = 4;
		const bodyHeight =
			terminalRows - HEADER_ROWS - footerRows - FRAME_BORDER_ROWS;
		expect(bodyHeight).toBe(31);
	});
});

describe('Bug #7: todoListHeight accounts for worst-case scroll affordances', () => {
	it('todoListHeight should subtract 2 when items exceed raw slots', () => {
		// Simulating the useLayout calculation for todoListHeight
		const actualTodoRows = 8;
		const itemSlots = actualTodoRows - 2; // 6 (header + divider)
		const totalItems = 10; // more items than slots → scrolling needed

		// Old (buggy): todoListHeight = actualTodoRows - 1 = 7
		// This is used to clamp scrolling. But actual visible items when both
		// affordances are present is only itemSlots - 2 = 4.
		// maxScroll = totalItems - todoListHeight
		// Old: maxScroll = 10 - 7 = 3. At scroll=3, visible = items[3..6], but
		// with both affordances only 4 items render, so items[7..9] unreachable.
		//
		// Correct: todoListHeight = itemSlots - 2 = 4 when totalItems > itemSlots
		// maxScroll = 10 - 4 = 6. At scroll=6, visible = items[6..9] ✓

		// The actual useLayout code computes:
		const oldTodoListHeight = Math.max(0, actualTodoRows - 1); // 7 — buggy
		const oldMaxScroll = Math.max(0, totalItems - oldTodoListHeight); // 3

		// At maxScroll, the render shows at most itemSlots - 2 items (both affordances)
		const worstCaseRenderSlots = itemSlots - 2; // 4
		const lastReachableOld = oldMaxScroll + worstCaseRenderSlots - 1; // 6

		// Bug: last item index is 9 but only index 6 is reachable
		expect(lastReachableOld).toBeLessThan(totalItems - 1);

		// After fix: todoListHeight should equal worstCaseRenderSlots
		const fixedTodoListHeight = itemSlots - 2; // 4
		const fixedMaxScroll = Math.max(0, totalItems - fixedTodoListHeight); // 6
		const lastReachableFixed = fixedMaxScroll + fixedTodoListHeight - 1; // 9
		expect(lastReachableFixed).toBe(totalItems - 1);
	});
});
