import React, {useState, useCallback} from 'react';
import {Box, Text, useInput} from 'ink';
import {TextInput} from '@inkjs/ui';
import {type HookEventDisplay} from '../types/hooks/display.js';
import {isToolEvent} from '../types/hooks/events.js';
import OptionList, {type OptionItem} from './OptionList.js';
import MultiOptionList from './MultiOptionList.js';
import QuestionKeybindingBar from './QuestionKeybindingBar.js';

const MAX_WIDTH = 76;

type QuestionOption = {
	label: string;
	description: string;
};

type Question = {
	question: string;
	header: string;
	options: QuestionOption[];
	multiSelect: boolean;
};

type Props = {
	request: HookEventDisplay;
	queuedCount: number;
	onAnswer: (answers: Record<string, string>) => void;
	onSkip: () => void;
};

const OTHER_VALUE = '__other__';

function buildOptions(options: QuestionOption[]): OptionItem[] {
	return [
		...options.map(o => ({
			label: o.label,
			description: o.description,
			value: o.label,
		})),
		{
			label: 'Other',
			description: 'Enter a custom response',
			value: OTHER_VALUE,
		},
	];
}

function extractQuestions(request: HookEventDisplay): Question[] {
	if (!isToolEvent(request.payload)) return [];
	const input = request.payload.tool_input as {questions?: Question[]};
	return Array.isArray(input.questions) ? input.questions : [];
}

function QuestionTabs({
	questions,
	currentIndex,
	answers,
}: {
	questions: Question[];
	currentIndex: number;
	answers: Record<string, string>;
}) {
	if (questions.length <= 1) return null;

	return (
		<Box gap={1}>
			{questions.map((q, i) => {
				const answered = answers[q.question] !== undefined;
				const active = i === currentIndex;
				const prefix = answered ? '\u2713' : `${i + 1}`; // ✓ or number
				const label = `${prefix}. ${q.header}`;

				return (
					<Text
						key={`${i}-${q.header}`}
						bold={active}
						color={active ? 'cyan' : answered ? 'green' : 'gray'}
						dimColor={!active && !answered}
					>
						{active ? `[${label}]` : ` ${label} `}
					</Text>
				);
			})}
		</Box>
	);
}

function SingleQuestion({
	question,
	onAnswer,
	onSkip,
}: {
	question: Question;
	onAnswer: (answer: string) => void;
	onSkip: () => void;
}) {
	const [isOther, setIsOther] = useState(false);
	const options = buildOptions(question.options);

	const handleSelect = useCallback(
		(value: string) => {
			if (value === OTHER_VALUE) {
				setIsOther(true);
			} else {
				onAnswer(value);
			}
		},
		[onAnswer],
	);

	const handleOtherSubmit = useCallback(
		(value: string) => {
			if (value.trim()) {
				onAnswer(value.trim());
			}
		},
		[onAnswer],
	);

	useInput((_input, key) => {
		if (key.escape) {
			onSkip();
		}
	});

	if (isOther) {
		return (
			<Box flexDirection="column">
				<Box>
					<Text color="yellow">{'> '}</Text>
					<TextInput
						placeholder="Type your answer..."
						onSubmit={handleOtherSubmit}
					/>
				</Box>
				<Box marginTop={1}>
					<QuestionKeybindingBar multiSelect={false} />
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<OptionList options={options} onSelect={handleSelect} />
			<Box marginTop={1}>
				<QuestionKeybindingBar multiSelect={false} />
			</Box>
		</Box>
	);
}

function MultiQuestion({
	question,
	onAnswer,
	onSkip,
}: {
	question: Question;
	onAnswer: (answer: string) => void;
	onSkip: () => void;
}) {
	const [isOther, setIsOther] = useState(false);
	const [selected, setSelected] = useState<string[]>([]);
	const options = buildOptions(question.options);

	const handleSubmit = useCallback(
		(values: string[]) => {
			if (values.includes(OTHER_VALUE)) {
				setSelected(values.filter(v => v !== OTHER_VALUE));
				setIsOther(true);
			} else {
				onAnswer(values.join(', '));
			}
		},
		[onAnswer],
	);

	const handleOtherSubmit = useCallback(
		(value: string) => {
			if (value.trim()) {
				const all = [...selected, value.trim()];
				onAnswer(all.join(', '));
			}
		},
		[onAnswer, selected],
	);

	useInput((_input, key) => {
		if (key.escape) {
			onSkip();
		}
	});

	if (isOther) {
		return (
			<Box flexDirection="column">
				<Box>
					<Text color="yellow">{'> '}</Text>
					<TextInput
						placeholder="Type your answer..."
						onSubmit={handleOtherSubmit}
					/>
				</Box>
				<Box marginTop={1}>
					<QuestionKeybindingBar multiSelect={true} />
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<MultiOptionList options={options} onSubmit={handleSubmit} />
			<Box marginTop={1}>
				<QuestionKeybindingBar multiSelect={true} />
			</Box>
		</Box>
	);
}

export default function QuestionDialog({
	request,
	queuedCount,
	onAnswer,
	onSkip,
}: Props) {
	const questions = extractQuestions(request);
	const [currentIndex, setCurrentIndex] = useState(0);
	const [answers, setAnswers] = useState<Record<string, string>>({});

	const handleQuestionAnswer = useCallback(
		(answer: string) => {
			const question = questions[currentIndex];
			if (!question) return;

			const newAnswers = {...answers, [question.question]: answer};

			if (currentIndex + 1 < questions.length) {
				setAnswers(newAnswers);
				setCurrentIndex(i => i + 1);
			} else {
				onAnswer(newAnswers);
			}
		},
		[answers, currentIndex, questions, onAnswer],
	);

	if (questions.length === 0) {
		return (
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="cyan"
				paddingX={1}
				width={MAX_WIDTH}
			>
				<Text color="yellow">No questions found in AskUserQuestion input.</Text>
			</Box>
		);
	}

	const question = questions[currentIndex]!;

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="cyan"
			paddingX={1}
			width={MAX_WIDTH}
		>
			<QuestionTabs
				questions={questions}
				currentIndex={currentIndex}
				answers={answers}
			/>
			<Box marginTop={questions.length > 1 ? 1 : 0}>
				<Text bold color="cyan">
					[{question.header}]
				</Text>
				<Text> {question.question}</Text>
				{queuedCount > 0 && <Text dimColor> ({queuedCount} more queued)</Text>}
			</Box>
			<Box marginTop={1}>
				{question.multiSelect ? (
					<MultiQuestion
						key={currentIndex}
						question={question}
						onAnswer={handleQuestionAnswer}
						onSkip={onSkip}
					/>
				) : (
					<SingleQuestion
						key={currentIndex}
						question={question}
						onAnswer={handleQuestionAnswer}
						onSkip={onSkip}
					/>
				)}
			</Box>
		</Box>
	);
}
