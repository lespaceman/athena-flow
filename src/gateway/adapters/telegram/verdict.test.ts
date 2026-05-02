import {describe, expect, it} from 'vitest';
import {
	buildPermissionCallbackData,
	buildPlainTextQuestionAnswer,
	buildQuestionCallbackData,
	parseCallbackData,
	parseQuestionAnswer,
	parseVerdict,
} from './verdict';

describe('parseVerdict', () => {
	it.each([
		['yes abcde', 'allow', 'abcde'],
		['no abcde', 'deny', 'abcde'],
		['y abcde', 'allow', 'abcde'],
		['n abcde', 'deny', 'abcde'],
		['  yes abcde  ', 'allow', 'abcde'],
		['Yes abcde', 'allow', 'abcde'],
		['NO abcde', 'deny', 'abcde'],
		['Yes Abcde', 'allow', 'abcde'],
	])('parses %j as %s %s', (input, behavior, id) => {
		const result = parseVerdict(input);
		expect(result).toEqual({channelRequestId: id, behavior});
	});

	it.each([
		'',
		'yes',
		'abcde',
		'maybe abcde',
		'yes abcd1', // digit in id
		'yes lloyd', // 'l' is excluded from the alphabet
		'yes abcdef', // 6 chars
		'yes abcd', // 4 chars
		'random message',
	])('rejects %j', input => {
		expect(parseVerdict(input)).toBeNull();
	});
});

describe('parseQuestionAnswer', () => {
	it('parses a single text answer for the first question key', () => {
		const result = parseQuestionAnswer('answer abcde push main', [
			'Which branch?',
		]);

		expect(result).toEqual({
			channelRequestId: 'abcde',
			answers: {'Which branch?': 'push main'},
		});
	});

	it('parses JSON answers', () => {
		const result = parseQuestionAnswer(
			'answer abcde {"Which branch?":"main","Confirm?":"yes"}',
			['Which branch?', 'Confirm?'],
		);

		expect(result).toEqual({
			channelRequestId: 'abcde',
			answers: {'Which branch?': 'main', 'Confirm?': 'yes'},
		});
	});

	it.each([
		'answer',
		'answer abcde',
		'answer abcd1 yes',
		'answer lloyd yes',
		'yes abcde',
	])('rejects %j', input => {
		expect(parseQuestionAnswer(input, ['Question?'])).toBeNull();
	});
});

describe('buildPlainTextQuestionAnswer', () => {
	it('uses the full message as the first question answer', () => {
		expect(
			buildPlainTextQuestionAnswer('abcde', 'Yes allow it', [
				'May I continue?',
			]),
		).toEqual({
			channelRequestId: 'abcde',
			answers: {'May I continue?': 'Yes allow it'},
		});
	});

	it('rejects empty messages or missing question keys', () => {
		expect(
			buildPlainTextQuestionAnswer('abcde', '   ', ['Question?']),
		).toBeNull();
		expect(buildPlainTextQuestionAnswer('abcde', 'yes', [])).toBeNull();
	});
});

describe('parseCallbackData', () => {
	it('parses permission allow', () => {
		expect(parseCallbackData('v:abcde:a')).toEqual({
			kind: 'permission',
			channelRequestId: 'abcde',
			behavior: 'allow',
		});
	});

	it('parses permission deny', () => {
		expect(parseCallbackData('v:abcde:d')).toEqual({
			kind: 'permission',
			channelRequestId: 'abcde',
			behavior: 'deny',
		});
	});

	it('parses question pick', () => {
		expect(parseCallbackData('q:abcde:3')).toEqual({
			kind: 'question',
			channelRequestId: 'abcde',
			optionIndex: 3,
		});
	});

	it.each([
		'',
		'v:abcde',
		'v:abcde:x',
		'v:lloyd:a', // invalid id alphabet
		'v:abcd:a', // wrong length
		'q:abcde',
		'q:abcde:-1',
		'q:abcde:foo',
		'q:abcde:5x', // trailing chars after digits
		'q:abcde:0:0', // legacy 4-part form is no longer accepted
		'random',
	])('rejects %j', input => {
		expect(parseCallbackData(input)).toBeNull();
	});

	it('round-trips with builders', () => {
		expect(
			parseCallbackData(buildPermissionCallbackData('abcde', 'allow')),
		).toEqual({
			kind: 'permission',
			channelRequestId: 'abcde',
			behavior: 'allow',
		});
		expect(parseCallbackData(buildQuestionCallbackData('abcde', 5))).toEqual({
			kind: 'question',
			channelRequestId: 'abcde',
			optionIndex: 5,
		});
	});
});
