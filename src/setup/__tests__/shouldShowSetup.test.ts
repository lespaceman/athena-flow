import {describe, expect, it} from 'vitest';
import {shouldShowSetup} from '../shouldShowSetup.js';

describe('shouldShowSetup', () => {
	it('shows setup when explicitly requested by subcommand', () => {
		expect(
			shouldShowSetup({
				cliInput: ['setup'],
				setupComplete: true,
				globalConfigExists: true,
			}),
		).toBe(true);
	});

	it('shows setup when config file does not exist', () => {
		expect(
			shouldShowSetup({
				cliInput: [],
				setupComplete: undefined,
				globalConfigExists: false,
			}),
		).toBe(true);
	});

	it('shows setup when config exists but setupComplete is missing', () => {
		expect(
			shouldShowSetup({
				cliInput: [],
				setupComplete: undefined,
				globalConfigExists: true,
			}),
		).toBe(true);
	});

	it('shows setup when config exists but setupComplete is false', () => {
		expect(
			shouldShowSetup({
				cliInput: [],
				setupComplete: false,
				globalConfigExists: true,
			}),
		).toBe(true);
	});

	it('skips setup only when config exists and setupComplete is true', () => {
		expect(
			shouldShowSetup({
				cliInput: [],
				setupComplete: true,
				globalConfigExists: true,
			}),
		).toBe(false);
	});
});
