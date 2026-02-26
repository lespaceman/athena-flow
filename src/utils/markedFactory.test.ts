import {describe, it, expect} from 'vitest';
import {createMarkedInstance} from './markedFactory.js';

describe('createMarkedInstance', () => {
	it('does not leak colon placeholders in list items with code spans', () => {
		const m = createMarkedInstance(120);
		const input =
			'- Read `playwright.config.ts` to learn `baseURL: "https://myapp.com"`, `testDir: "./tests"`';
		const result = m.parse(input);
		expect(typeof result).toBe('string');
		const output = result as string;
		expect(output).not.toContain('*#COLON|*');
		expect(output).toContain('baseURL:');
		expect(output).toContain('testDir:');
	});
});
