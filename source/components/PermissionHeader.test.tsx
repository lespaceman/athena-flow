import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from 'ink-testing-library';
import PermissionHeader from './PermissionHeader.js';

describe('PermissionHeader', () => {
	it('displays READ tier with ℹ icon and "READ" label', () => {
		const {lastFrame} = render(
			<PermissionHeader tier="READ" queuedCount={0} />,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('ℹ');
		expect(frame).toContain('Permission Required');
		expect(frame).toContain('[READ]');
	});

	it('displays MODERATE tier with ⚠ icon and "MODERATE" label', () => {
		const {lastFrame} = render(
			<PermissionHeader tier="MODERATE" queuedCount={0} />,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('⚠');
		expect(frame).toContain('Permission Required');
		expect(frame).toContain('[MODERATE]');
	});

	it('displays WRITE tier with "WRITE" label', () => {
		const {lastFrame} = render(
			<PermissionHeader tier="WRITE" queuedCount={0} />,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('⚠');
		expect(frame).toContain('Permission Required');
		expect(frame).toContain('[WRITE]');
	});

	it('displays DESTRUCTIVE tier with ⛔ icon and "DESTRUCTIVE" label', () => {
		const {lastFrame} = render(
			<PermissionHeader tier="DESTRUCTIVE" queuedCount={0} />,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('⛔');
		expect(frame).toContain('Permission Required');
		expect(frame).toContain('[DESTRUCTIVE]');
	});

	it('shows queue count when > 0', () => {
		const {lastFrame} = render(
			<PermissionHeader tier="MODERATE" queuedCount={3} />,
		);
		const frame = lastFrame() ?? '';

		expect(frame).toContain('(3 more queued)');
	});

	it('hides queue count when 0', () => {
		const {lastFrame} = render(
			<PermissionHeader tier="MODERATE" queuedCount={0} />,
		);
		const frame = lastFrame() ?? '';

		expect(frame).not.toContain('queued');
		expect(frame).not.toContain('more');
	});
});
