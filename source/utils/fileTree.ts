export type TreeNode = {
	name: string;
	isDir: boolean;
	children: TreeNode[];
	fullPath?: string;
};

/**
 * Build a tree from flat file paths.
 * Collapses common prefix into root node name.
 */
export function buildFileTree(paths: string[]): TreeNode {
	const root: TreeNode = {name: '', isDir: true, children: []};
	if (paths.length === 0) return root;

	for (const path of paths) {
		const parts = path.split('/');
		let current = root;
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i]!;
			const isLast = i === parts.length - 1;
			let child = current.children.find(c => c.name === part);
			if (!child) {
				child = {
					name: part,
					isDir: !isLast,
					children: [],
					fullPath: isLast ? path : undefined,
				};
				current.children.push(child);
			}
			if (!isLast) {
				current = child;
			}
		}
	}

	// Collapse single-child directory chains
	return collapseTree(root);
}

function collapseTree(node: TreeNode): TreeNode {
	// Recursively collapse children first
	node.children = node.children.map(collapseTree);

	// Collapse: if a dir has exactly one child that is also a dir, merge them
	while (
		node.isDir &&
		node.children.length === 1 &&
		node.children[0]!.isDir
	) {
		const child = node.children[0]!;
		const separator = node.name ? '/' : '';
		node = {
			name: `${node.name}${separator}${child.name}`,
			isDir: true,
			children: child.children,
		};
	}

	return node;
}

/**
 * Render tree to string lines with box-drawing characters.
 */
export function renderTree(node: TreeNode): string[] {
	// If root has a name and only leaf children, show name as header
	if (node.children.length === 0) {
		return [node.name || '(empty)'];
	}

	// Single leaf child — no tree decoration
	if (node.children.length === 1 && !node.children[0]!.isDir) {
		const prefix = node.name ? `${node.name}/` : '';
		return [`${prefix}${node.children[0]!.name}`];
	}

	const lines: string[] = [];
	if (node.name) {
		lines.push(`${node.name}/`);
	}

	const indent = node.name ? '  ' : '';
	renderChildren(node.children, indent, lines);
	return lines;
}

function renderChildren(
	children: TreeNode[],
	prefix: string,
	lines: string[],
): void {
	children.forEach((child, i) => {
		const isLast = i === children.length - 1;
		const connector = isLast ? '└─ ' : '├─ ';
		const childPrefix = isLast ? '   ' : '│  ';

		if (child.isDir) {
			lines.push(`${prefix}${connector}${child.name}/`);
			renderChildren(child.children, `${prefix}${childPrefix}`, lines);
		} else {
			lines.push(`${prefix}${connector}${child.name}`);
		}
	});
}
