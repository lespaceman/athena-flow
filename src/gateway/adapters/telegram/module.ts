/**
 * Telegram `AdapterModule` — config parsing + adapter construction.
 *
 * Keeps platform-specific knowledge out of the generic factory: all the
 * sidecar-options-to-typed-config glue lives next to the adapter that
 * consumes it. New platforms add a sibling file and one line in
 * `registry.ts`.
 */

import type {AdapterModule} from '../../../shared/gateway-protocol';
import {TelegramAdapter, type TelegramAdapterOptions} from './adapter';

export const telegramModule: AdapterModule<TelegramAdapterOptions> = {
	name: 'telegram',

	parseConfig({options, allowedUserIds}) {
		const token = options['bot_token'];
		if (typeof token !== 'string' || token.length === 0) {
			return {ok: false, reason: 'bot_token missing'};
		}
		const defaultChatRaw = options['default_chat_id'];
		const defaultThreadRaw = options['default_thread_id'];
		const apiBaseRaw = options['api_base'];
		const pollTimeoutRaw = options['poll_timeout_sec'];

		if (
			defaultChatRaw !== undefined &&
			typeof defaultChatRaw !== 'string' &&
			typeof defaultChatRaw !== 'number'
		) {
			return {ok: false, reason: 'default_chat_id must be string or number'};
		}
		if (
			defaultThreadRaw !== undefined &&
			typeof defaultThreadRaw !== 'number'
		) {
			return {ok: false, reason: 'default_thread_id must be number'};
		}
		if (apiBaseRaw !== undefined && typeof apiBaseRaw !== 'string') {
			return {ok: false, reason: 'api_base must be string'};
		}
		if (pollTimeoutRaw !== undefined && typeof pollTimeoutRaw !== 'number') {
			return {ok: false, reason: 'poll_timeout_sec must be number'};
		}

		const config: TelegramAdapterOptions = {
			token,
			allowedUserIds,
			...(defaultChatRaw !== undefined ? {defaultChatId: defaultChatRaw} : {}),
			...(defaultThreadRaw !== undefined
				? {defaultThreadId: defaultThreadRaw}
				: {}),
			...(apiBaseRaw !== undefined ? {apiBase: apiBaseRaw} : {}),
			...(pollTimeoutRaw !== undefined ? {pollTimeoutSec: pollTimeoutRaw} : {}),
		};
		return {ok: true, config};
	},

	create(config) {
		return new TelegramAdapter(config);
	},
};
