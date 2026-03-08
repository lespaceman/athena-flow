import os from 'node:os';
import {capture} from './client';

function systemProps() {
	return {
		os: `${os.platform()}-${os.arch()}`,
		nodeVersion: process.version,
	};
}

export function trackAppInstalled(props: {
	version: string;
	harness: string;
}): void {
	capture('app.installed', {...props, ...systemProps()});
}

export function trackAppLaunched(props: {
	version: string;
	harness: string;
}): void {
	capture('app.launched', {...props, ...systemProps()});
}

export function trackSessionStarted(props: {
	harness: string;
	workflow?: string;
	model?: string;
}): void {
	capture('session.started', props);
}

export function trackSessionEnded(props: {
	durationMs: number;
	toolCallCount: number;
	subagentCount: number;
	permissionsAllowed: number;
	permissionsDenied: number;
}): void {
	capture('session.ended', props);
}

export function trackError(props: {
	errorName: string;
	stackTrace: string;
}): void {
	capture('app.error', props);
}

export function trackTelemetryOptedOut(): void {
	capture('telemetry.opted_out', {});
}
