import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import StructuredList from './StructuredList.js';

describe('StructuredList', () => {
	it('renders as flat list when displayMode is undefined', () => {
		const items = [{primary: 'a.ts'}, {primary: 'b.ts'}];
		const {lastFrame} = render(<StructuredList items={items} />);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('•');
	});

	it('renders as tree when displayMode is tree', () => {
		const items = [
			{primary: 'src/a.ts'},
			{primary: 'src/b.ts'},
			{primary: 'lib/c.ts'},
		];
		const {lastFrame} = render(
			<StructuredList items={items} displayMode="tree" />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).not.toContain('•');
		expect(frame).toContain('a.ts');
		expect(frame).toContain('b.ts');
	});

	it('renders grouped by file when groupBy is secondary', () => {
		const items = [
			{primary: 'const x = 1;', secondary: 'src/app.tsx:10'},
			{primary: 'const y = 2;', secondary: 'src/app.tsx:20'},
			{primary: 'import z', secondary: 'src/lib.ts:5'},
		];
		const {lastFrame} = render(
			<StructuredList items={items} groupBy="secondary" />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).not.toContain('•');
		expect(frame).toContain('src/app.tsx');
		expect(frame).toContain('src/lib.ts');
		expect(frame).toContain('10');
		expect(frame).toContain('const x = 1;');
	});

	it('renders as flat list when groupBy is undefined', () => {
		const items = [{primary: 'match', secondary: 'file:10'}];
		const {lastFrame} = render(<StructuredList items={items} />);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('•');
	});

	it('returns null for empty items', () => {
		const {lastFrame} = render(<StructuredList items={[]} />);
		expect(lastFrame()).toBe('');
	});

	it('truncates items beyond maxItems', () => {
		const items = Array.from({length: 20}, (_, i) => ({
			primary: `item ${i}`,
		}));
		const {lastFrame} = render(
			<StructuredList items={items} maxItems={5} />,
		);
		const frame = lastFrame() ?? '';
		expect(frame).toContain('more items');
	});
});
