import React, {useState, useCallback} from 'react';
import {Box, Text} from 'ink';
import {Select, MultiSelect, TextInput} from '@inkjs/ui';
import {type HookEventDisplay} from '../types/hooks/display.js';
import {isToolEvent} from '../types/hooks/events.js';

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
};

const OTHER_VALUE = '__other__';

function extractQuestions(request: HookEventDisplay): Question[] {
	if (!isToolEvent(request.payload)) return [];
	const input = request.payload.tool_input as {questions?: Question[]};
	return Array.isArray(input.questions) ? input.questions : [];
}

function SingleQuestion({
	question,
	onAnswer,
}: {
	question: Question;
	onAnswer: (answer: string) => void;
}) {
	const [isOther, setIsOther] = useState(false);

	const options = [
		...question.options.map(o => ({
			label: o.label,
			value: o.label,
		})),
		{label: 'Other (type custom answer)', value: OTHER_VALUE},
	];

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

	return (
		<Box flexDirection="column">
			<Box>
				<Text bold color="cyan">
					[{question.header}]
				</Text>
				<Text> {question.question}</Text>
			</Box>
			{question.options.map(o => (
				<Box key={o.label} paddingLeft={2}>
					<Text dimColor>
						{o.label}: {o.description}
					</Text>
				</Box>
			))}
			<Box marginTop={1}>
				{isOther ? (
					<Box>
						<Text color="yellow">{'> '}</Text>
						<TextInput
							placeholder="Type your answer..."
							onSubmit={handleOtherSubmit}
						/>
					</Box>
				) : (
					<Select options={options} onChange={handleSelect} />
				)}
			</Box>
		</Box>
	);
}

function MultiQuestion({
	question,
	onAnswer,
}: {
	question: Question;
	onAnswer: (answer: string) => void;
}) {
	const [isOther, setIsOther] = useState(false);
	const [selected, setSelected] = useState<string[]>([]);

	const options = [
		...question.options.map(o => ({
			label: o.label,
			value: o.label,
		})),
		{label: 'Other (type custom answer)', value: OTHER_VALUE},
	];

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

	return (
		<Box flexDirection="column">
			<Box>
				<Text bold color="cyan">
					[{question.header}]
				</Text>
				<Text> {question.question}</Text>
			</Box>
			{question.options.map(o => (
				<Box key={o.label} paddingLeft={2}>
					<Text dimColor>
						{o.label}: {o.description}
					</Text>
				</Box>
			))}
			<Box marginTop={1}>
				{isOther ? (
					<Box>
						<Text color="yellow">{'> '}</Text>
						<TextInput
							placeholder="Type your answer..."
							onSubmit={handleOtherSubmit}
						/>
					</Box>
				) : (
					<MultiSelect options={options} onSubmit={handleSubmit} />
				)}
			</Box>
		</Box>
	);
}

export default function QuestionDialog({
	request,
	queuedCount,
	onAnswer,
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
		>
			<Box>
				<Text bold color="cyan">
					Question
				</Text>
				{questions.length > 1 && (
					<Text dimColor>
						{' '}
						({currentIndex + 1}/{questions.length})
					</Text>
				)}
				{queuedCount > 0 && <Text dimColor> ({queuedCount} more queued)</Text>}
			</Box>
			<Box marginTop={1}>
				{question.multiSelect ? (
					<MultiQuestion
						key={currentIndex}
						question={question}
						onAnswer={handleQuestionAnswer}
					/>
				) : (
					<SingleQuestion
						key={currentIndex}
						question={question}
						onAnswer={handleQuestionAnswer}
					/>
				)}
			</Box>
		</Box>
	);
}
