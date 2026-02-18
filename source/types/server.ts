/**
 * Hook server types.
 *
 * Types for the hook server that receives events from hook-forwarder.
 */

export type PermissionDecision =
	| 'allow'
	| 'deny'
	| 'always-allow'
	| 'always-deny'
	| 'always-allow-server';
