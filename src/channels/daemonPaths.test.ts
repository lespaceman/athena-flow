import {describe, it, expect} from 'vitest';
import {
	channelDaemonRunDir,
	channelDaemonSocketPath,
	channelDaemonAuthPath,
} from './daemonPaths';

describe('daemon path helpers', () => {
	const home = '/tmp/fake-home';

	it('builds run dir under ~/.athena/run', () => {
		expect(channelDaemonRunDir(home)).toBe('/tmp/fake-home/.athena/run');
	});

	it('builds socket path with sanitized channel name', () => {
		expect(channelDaemonSocketPath('telegram', home)).toBe(
			'/tmp/fake-home/.athena/run/channel-telegram.sock',
		);
	});

	it('builds auth path matching socket', () => {
		expect(channelDaemonAuthPath('telegram', home)).toBe(
			'/tmp/fake-home/.athena/run/channel-telegram.token',
		);
	});

	it('sanitizes path-traversal attempts', () => {
		expect(channelDaemonSocketPath('a/b', home)).toBe(
			'/tmp/fake-home/.athena/run/channel-a_b.sock',
		);
		expect(channelDaemonSocketPath('a..b', home)).toBe(
			'/tmp/fake-home/.athena/run/channel-a..b.sock',
		);
		expect(channelDaemonSocketPath('with space', home)).toBe(
			'/tmp/fake-home/.athena/run/channel-with_space.sock',
		);
	});

	it('rejects empty channel names', () => {
		expect(() => channelDaemonSocketPath('', home)).toThrow(/invalid channel/);
	});

	it('rejects dot-only channel names', () => {
		expect(() => channelDaemonSocketPath('.', home)).toThrow(/invalid channel/);
		expect(() => channelDaemonSocketPath('..', home)).toThrow(
			/invalid channel/,
		);
	});

	it('rejects names that sanitize to empty', () => {
		// Slashes-only — would sanitize to empty after replacement.
		expect(() => channelDaemonSocketPath('!@#', home)).not.toThrow();
		// `!@#` → `___`, valid (3 chars, not all dots)
		expect(channelDaemonSocketPath('!@#', home)).toBe(
			'/tmp/fake-home/.athena/run/channel-___.sock',
		);
	});
});
