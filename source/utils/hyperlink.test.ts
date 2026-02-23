import {describe, it, expect, vi, afterEach} from 'vitest';
import {hyperlink, supportsHyperlinks, fileLink, urlLink} from './hyperlink.js';

describe('hyperlink', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe('supportsHyperlinks', () => {
		it('returns true for iTerm2', () => {
			vi.stubEnv('TERM_PROGRAM', 'iTerm.app');
			expect(supportsHyperlinks()).toBe(true);
		});

		it('returns true for WezTerm', () => {
			vi.stubEnv('TERM_PROGRAM', 'WezTerm');
			expect(supportsHyperlinks()).toBe(true);
		});

		it('returns true for Windows Terminal', () => {
			vi.stubEnv('WT_SESSION', 'some-session-id');
			expect(supportsHyperlinks()).toBe(true);
		});

		it('returns true for VTE >= 5000', () => {
			vi.stubEnv('VTE_VERSION', '5200');
			expect(supportsHyperlinks()).toBe(true);
		});

		it('returns false for VTE < 5000', () => {
			vi.stubEnv('VTE_VERSION', '4800');
			expect(supportsHyperlinks()).toBe(false);
		});

		it('returns true for Kitty', () => {
			vi.stubEnv('TERM', 'xterm-kitty');
			expect(supportsHyperlinks()).toBe(true);
		});

		it('returns false for unknown terminals', () => {
			vi.stubEnv('TERM_PROGRAM', '');
			vi.stubEnv('WT_SESSION', '');
			vi.stubEnv('VTE_VERSION', '');
			vi.stubEnv('TERM', 'xterm-256color');
			vi.stubEnv('ATHENA_HYPERLINKS', '');
			expect(supportsHyperlinks()).toBe(false);
		});

		it('respects ATHENA_HYPERLINKS=1 override', () => {
			vi.stubEnv('ATHENA_HYPERLINKS', '1');
			expect(supportsHyperlinks()).toBe(true);
		});

		it('respects ATHENA_HYPERLINKS=0 override', () => {
			vi.stubEnv('TERM_PROGRAM', 'iTerm.app');
			vi.stubEnv('ATHENA_HYPERLINKS', '0');
			expect(supportsHyperlinks()).toBe(false);
		});
	});

	describe('hyperlink', () => {
		it('wraps text with OSC 8 sequences when supported', () => {
			vi.stubEnv('ATHENA_HYPERLINKS', '1');
			const result = hyperlink('click me', 'https://example.com');
			expect(result).toBe(
				'\x1b]8;;https://example.com\x07click me\x1b]8;;\x07',
			);
		});

		it('returns plain text when not supported', () => {
			vi.stubEnv('ATHENA_HYPERLINKS', '0');
			vi.stubEnv('TERM_PROGRAM', '');
			vi.stubEnv('WT_SESSION', '');
			vi.stubEnv('VTE_VERSION', '');
			vi.stubEnv('TERM', 'xterm-256color');
			const result = hyperlink('click me', 'https://example.com');
			expect(result).toBe('click me');
		});
	});

	describe('fileLink', () => {
		it('creates file:// URI for absolute paths', () => {
			vi.stubEnv('ATHENA_HYPERLINKS', '1');
			const result = fileLink('/home/user/app.ts');
			expect(result).toContain('file:///home/user/app.ts');
			expect(result).toContain('/home/user/app.ts');
		});

		it('appends line number to URI when provided', () => {
			vi.stubEnv('ATHENA_HYPERLINKS', '1');
			const result = fileLink('/home/user/app.ts', 42);
			expect(result).toContain(':42');
		});

		it('returns plain text for relative paths', () => {
			vi.stubEnv('ATHENA_HYPERLINKS', '1');
			const result = fileLink('src/app.ts');
			expect(result).toBe('src/app.ts');
		});
	});

	describe('urlLink', () => {
		it('creates clickable URL', () => {
			vi.stubEnv('ATHENA_HYPERLINKS', '1');
			const result = urlLink('https://example.com', 'Example');
			expect(result).toContain('https://example.com');
			expect(result).toContain('Example');
		});

		it('uses URL as display text when no display text given', () => {
			vi.stubEnv('ATHENA_HYPERLINKS', '1');
			const result = urlLink('https://example.com');
			expect(result).toContain('https://example.com');
		});
	});
});
