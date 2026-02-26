import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['**/*.{ts,tsx}'],
		plugins: {
			react,
			'react-hooks': reactHooks,
		},
		languageOptions: {
			parserOptions: {
				ecmaFeatures: {
					jsx: true,
				},
			},
		},
		rules: {
			'react/prop-types': 'off',
			'react/react-in-jsx-scope': 'off',
			'react-hooks/rules-of-hooks': 'error',
			'react-hooks/exhaustive-deps': 'warn',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{argsIgnorePattern: '^_', varsIgnorePattern: '^_'},
			],
		},
	},
	{
		files: [
			'src/components/**/*.{ts,tsx}',
			'src/context/**/*.{ts,tsx}',
			'src/hooks/**/*.{ts,tsx}',
			'src/feed/**/*.{ts,tsx}',
		],
		ignores: ['src/context/HookContext.tsx', 'src/hooks/useFeed.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['**/runtime/adapters/claudeHooks/**'],
							message:
								'UI must not import from Claude adapter. Use runtime boundary types instead.',
						},
						{
							group: ['**/types/hooks/envelope*'],
							message:
								'UI must not import protocol envelope types. Use runtime boundary types instead.',
						},
						{
							group: ['**/types/hooks/result*'],
							message:
								'UI must not import protocol result types. Use runtime boundary types instead.',
						},
						{
							group: ['**/types/hooks/events*'],
							message:
								'UI must not import protocol event types. Use runtime boundary types instead.',
						},
						{
							group: [
								'**/feed/mapper*',
								'**/feed/filter*',
								'**/feed/entities*',
							],
							message:
								'Components may only import from feed/types.ts and feed/expandable.ts. Do not import stateful feed internals.',
						},
					],
				},
			],
		},
	},
	{
		ignores: ['dist/**', '.worktrees/**'],
	},
);
