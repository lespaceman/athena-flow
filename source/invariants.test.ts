import {describe, it, expect} from 'vitest';
import {execSync} from 'child_process';

describe('architectural invariants', () => {
	it('no FeedEvent construction outside mapper', () => {
		// Search for files that both define `kind:` and `seq:` properties
		// (the signature of a FeedEvent literal) outside mapper.ts
		const result = execSync(
			[
				'grep -rn "seq:" source/feed/ source/hooks/ --include="*.ts"',
				'grep -v "mapper.ts"',
				'grep -v ".test.ts"',
				'grep -v "types.ts"',
				'grep -v "filter.ts"',
				'grep -v "bootstrap.ts"',
				'grep -v "entities.ts"',
				'grep -v "titleGen.ts"',
				'grep -v "todoPanel.ts"',
				// Only match lines that also contain kind: (FeedEvent shape)
				'grep "kind:" || true',
			].join(' | '),
			{encoding: 'utf-8'},
		);
		expect(result.trim()).toBe('');
	});

	it('feed sort comparators use seq, not ts', () => {
		// Verify no sort comparator in hooks uses .ts for feed events
		const result = execSync(
			[
				'grep -rn "sort" source/hooks/ --include="*.ts"',
				'grep -v ".test.ts"',
				'grep "\\.data\\.ts" || true',
			].join(' | '),
			{encoding: 'utf-8'},
		);
		expect(result.trim()).toBe('');
	});
});
