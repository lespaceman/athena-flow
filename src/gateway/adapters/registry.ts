/**
 * Registry of `AdapterModule` instances known to the gateway daemon.
 *
 * Adding a new channel:
 *   1. Implement `ChannelAdapter` for your platform.
 *   2. Implement `AdapterModule` next to it (parseConfig + create).
 *   3. Add it to `BUILTIN_MODULES` here. Done.
 *
 * The factory in `factory.ts` consumes this registry; nothing else hard-
 * codes the set of supported channel names.
 */

import type {AdapterModule} from '../../shared/gateway-protocol';
import {telegramModule} from './telegram/module';

export const BUILTIN_MODULES: ReadonlyArray<AdapterModule> = [telegramModule];

export function findAdapterModule(name: string): AdapterModule | undefined {
	return BUILTIN_MODULES.find(m => m.name === name);
}
