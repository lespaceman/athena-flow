import {describe, it, expect} from 'vitest';
import {
	isResponse,
	isNotification,
	isServerRequest,
} from '../../protocol/jsonrpc.js';

describe('AppServerManager message routing', () => {
	it('classifies response correctly', () => {
		expect(isResponse({id: 1, result: {thread: {id: 'thr_1'}}})).toBe(true);
	});

	it('classifies notification correctly', () => {
		expect(
			isNotification({method: 'turn/started', params: {turn: {id: 't1'}}}),
		).toBe(true);
	});

	it('classifies server request correctly', () => {
		expect(
			isServerRequest({
				method: 'item/commandExecution/requestApproval',
				id: 5,
				params: {command: 'ls'},
			}),
		).toBe(true);
	});
});
