import {describe, it, expect} from 'vitest';
import {buildFileTree, renderTree} from './fileTree.js';

describe('buildFileTree', () => {
	it('builds a tree from flat file paths', () => {
		const paths = [
			'source/components/DiffBlock.tsx',
			'source/components/StructuredList.tsx',
			'source/utils/toolExtractors.ts',
		];
		const tree = buildFileTree(paths);
		// Root collapses common 'source' prefix
		expect(tree.name).toBe('source');
		expect(tree.children).toHaveLength(2); // 'components/', 'utils/'
	});

	it('collapses common prefix', () => {
		const paths = [
			'source/components/A.tsx',
			'source/components/B.tsx',
		];
		const tree = buildFileTree(paths);
		expect(tree.name).toBe('source/components');
		expect(tree.children).toHaveLength(2);
	});

	it('handles single file', () => {
		const paths = ['source/app.ts'];
		const tree = buildFileTree(paths);
		expect(tree.children).toHaveLength(1);
	});

	it('handles empty paths', () => {
		const tree = buildFileTree([]);
		expect(tree.children).toHaveLength(0);
	});
});

describe('renderTree', () => {
	it('renders with box-drawing characters', () => {
		const paths = [
			'source/a.ts',
			'source/b.ts',
		];
		const tree = buildFileTree(paths);
		const lines = renderTree(tree);
		expect(lines.some(l => l.includes('├─'))).toBe(true);
		expect(lines.some(l => l.includes('└─'))).toBe(true);
	});

	it('renders single file without tree decoration', () => {
		const paths = ['source/app.ts'];
		const tree = buildFileTree(paths);
		const lines = renderTree(tree);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain('app.ts');
	});
});
