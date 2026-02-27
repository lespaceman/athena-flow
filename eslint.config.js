import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const RELATIVE_PREFIXES = [
	'../',
	'../../',
	'../../../',
	'../../../../',
	'../../../../../',
	'../../../../../../',
];

const relativeImportPatterns = target =>
	RELATIVE_PREFIXES.flatMap(prefix => [
		`${prefix}${target}`,
		`${prefix}${target}/**`,
	]);

const legacyRoots = [
	'context',
	'runtime/adapters/claudeHooks',
	'runtime/types',
	'types/hooks',
	'types/isolation',
];

const legacyModules = [
	'hook-forwarder',
	'utils/detectClaudeVersion',
	'utils/flagRegistry',
	'utils/format',
	'utils/generateHookSettings',
	'utils/parseStreamJson',
	'utils/resolveModel',
	'utils/spawnClaude',
	'utils/truncate',
];

const legacyImportPatterns = [
	...legacyRoots.flatMap(relativeImportPatterns),
	...legacyModules.flatMap(relativeImportPatterns),
];

const testFileGlobs = [
	'src/**/*.test.ts',
	'src/**/*.test.tsx',
	'src/**/__tests__/**',
	'src/**/__sentinels__/**',
];

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
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: legacyImportPatterns,
							message:
								'Import from new structure boundaries (app/core/harnesses/infra/ui/shared), not legacy shim paths.',
						},
					],
				},
			],
		},
	},
	{
		files: ['src/**/*.{ts,tsx}'],
		ignores: testFileGlobs,
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'@typescript-eslint/no-unnecessary-condition': 'warn',
			'@typescript-eslint/switch-exhaustiveness-check': 'warn',
		},
	},
	{
		files: ['src/ui/components/**/*.{ts,tsx}', 'src/ui/hooks/**/*.{ts,tsx}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: relativeImportPatterns('harnesses'),
							message:
								'UI must remain harness-agnostic. Import via core/runtime boundaries instead.',
						},
						{
							group: relativeImportPatterns('infra'),
							message: 'UI must not depend directly on infra modules.',
						},
						{
							group: [
								...relativeImportPatterns('core/feed/mapper'),
								...relativeImportPatterns('core/feed/filter'),
								...relativeImportPatterns('core/feed/entities'),
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
		files: ['src/core/**/*.{ts,tsx}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: [
								...relativeImportPatterns('app'),
								...relativeImportPatterns('harnesses'),
							],
							message: 'Core must stay app-agnostic and harness-agnostic.',
						},
					],
				},
			],
		},
	},
	{
		files: ['src/harnesses/**/*.{ts,tsx}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: [
								...relativeImportPatterns('app'),
								...relativeImportPatterns('ui'),
							],
							message: 'Harness adapters must not depend on app or UI layers.',
						},
					],
				},
			],
		},
	},
	{
		files: ['src/shared/**/*.{ts,tsx}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: [
								...relativeImportPatterns('app'),
								...relativeImportPatterns('core'),
								...relativeImportPatterns('harnesses'),
								...relativeImportPatterns('infra'),
								...relativeImportPatterns('ui'),
							],
							message:
								'Shared modules must remain boundary-neutral and not import layered domains.',
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
