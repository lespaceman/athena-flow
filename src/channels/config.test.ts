import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadChannelConfig, channelConfigPath} from './config';

const isPosix = process.platform !== 'win32';
const skip = !isPosix;

describe.skipIf(skip)('loadChannelConfig', () => {
	let tmp: string;
	let originalHome: string | undefined;

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-channel-cfg-'));
		originalHome = process.env['HOME'];
		process.env['HOME'] = tmp;
		fs.mkdirSync(path.join(tmp, '.config', 'athena', 'channels'), {
			recursive: true,
			mode: 0o700,
		});
	});

	afterEach(() => {
		if (originalHome === undefined) delete process.env['HOME'];
		else process.env['HOME'] = originalHome;
		fs.rmSync(tmp, {recursive: true, force: true});
	});

	function writeConfig(name: string, body: unknown, mode = 0o600): string {
		const p = channelConfigPath(name);
		fs.writeFileSync(p, JSON.stringify(body), {mode});
		fs.chmodSync(p, mode); // ensure umask isn't lying
		return p;
	}

	it('loads a 0600 config successfully', () => {
		writeConfig('telegram', {allowed_user_ids: ['1', '2'], bot_token: 'x'});
		const result = loadChannelConfig('telegram');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.config.allowed_user_ids).toEqual(['1', '2']);
			expect(result.config.options['bot_token']).toBe('x');
		}
	});

	it('refuses 0644 (group/other readable)', () => {
		writeConfig('telegram', {allowed_user_ids: []}, 0o644);
		const result = loadChannelConfig('telegram');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toMatch(/too permissive/);
		}
	});

	it('refuses 0640 (group readable)', () => {
		writeConfig('telegram', {allowed_user_ids: []}, 0o640);
		const result = loadChannelConfig('telegram');
		expect(result.ok).toBe(false);
	});

	it('returns a structured failure when file is missing', () => {
		const result = loadChannelConfig('nope');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toMatch(/config not found/);
	});

	it('rejects non-object root', () => {
		const p = channelConfigPath('telegram');
		fs.writeFileSync(p, '"oops"', {mode: 0o600});
		fs.chmodSync(p, 0o600);
		const result = loadChannelConfig('telegram');
		expect(result.ok).toBe(false);
	});

	it('rejects allowed_user_ids that is not an array', () => {
		writeConfig('telegram', {allowed_user_ids: 'not-an-array'});
		const result = loadChannelConfig('telegram');
		expect(result.ok).toBe(false);
	});

	it('coerces numeric user ids to strings', () => {
		writeConfig('telegram', {allowed_user_ids: [12345, 67890]});
		const result = loadChannelConfig('telegram');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.config.allowed_user_ids).toEqual(['12345', '67890']);
		}
	});
});
