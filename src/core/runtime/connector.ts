import type {Runtime} from './types';

/**
 * Transport-neutral connector contract used by harness runtime adapters.
 *
 * Runtime connectors are responsible for event delivery + decision transport,
 * regardless of whether the underlying transport is UDS, HTTP, stdio, etc.
 */
export type RuntimeConnector = Runtime;
