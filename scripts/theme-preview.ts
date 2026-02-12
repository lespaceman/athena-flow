/**
 * Quick theme color preview script.
 * Run: npx tsx scripts/theme-preview.ts
 */
import chalk from 'chalk';

const dark = {
	border: chalk.cyan,
	text: chalk.white,
	textMuted: chalk.gray,
	accent: chalk.cyan,
	accentSecondary: chalk.magenta,
	success: chalk.green,
	error: chalk.red,
	warning: chalk.yellow,
	info: chalk.cyan,
	neutral: chalk.gray,
	userMsg: chalk.hex('#b0b0b0').bgHex('#2d3748'),
};

const darkProposed = {
	border: chalk.hex('#89b4fa'),
	text: chalk.hex('#cdd6f4'),
	textMuted: chalk.hex('#6c7086'),
	accent: chalk.hex('#89b4fa'),
	accentSecondary: chalk.hex('#cba6f7'),
	success: chalk.hex('#a6e3a1'),
	error: chalk.hex('#f38ba8'),
	warning: chalk.hex('#f9e2af'),
	info: chalk.hex('#89dceb'),
	neutral: chalk.hex('#6c7086'),
	userMsg: chalk.hex('#bac2de').bgHex('#313244'),
};

const lightCurrent = {
	border: chalk.blue,
	text: chalk.black,
	textMuted: chalk.gray,
	accent: chalk.blue,
	accentSecondary: chalk.hex('#8B008B'),
	success: chalk.green,
	error: chalk.red,
	warning: chalk.hex('#B8860B'),
	info: chalk.blue,
	neutral: chalk.gray,
	userMsg: chalk.hex('#4a5568').bgHex('#edf2f7'),
};

const lightProposed = {
	border: chalk.hex('#5c5cff'),
	text: chalk.black,
	textMuted: chalk.hex('#6c6f85'),
	accent: chalk.hex('#5c5cff'),
	accentSecondary: chalk.hex('#8839ef'),
	success: chalk.hex('#40a02b'),
	error: chalk.hex('#d20f39'),
	warning: chalk.hex('#df8e1d'),
	info: chalk.hex('#1e66f5'),
	neutral: chalk.hex('#6c6f85'),
	userMsg: chalk.hex('#4c4f69').bgHex('#ccd0da'),
};

function renderTheme(name: string, t: typeof dark) {
	console.log(chalk.bold.underline(`\n  ${name}\n`));

	// Simulated header box
	const top = t.border('╭─────────────────────────────────────────────╮');
	const bot = t.border('╰─────────────────────────────────────────────╯');
	const side = t.border('│');
	console.log(top);
	console.log(
		`${side}  ${t.accent.bold('Welcome back!')}                              ${side}`,
	);
	console.log(
		`${side}  ${t.text('Opus 4.6')} ${t.textMuted('· Athena v0.1.0')}                  ${side}`,
	);
	console.log(
		`${side}  ${t.textMuted('~/Projects/ai-projects/athena-cli')}           ${side}`,
	);
	console.log(bot);

	// Status line
	console.log(
		`  ${t.info('◐ Athena: working')} ${t.textMuted('|')} ${t.text('Opus 4.6')} ${t.textMuted('| Tools:')} ${t.text('5')}`,
	);

	// Tool events
	console.log(`\n  ${t.success('● Read')} ${t.textMuted('source/app.tsx')}`);
	console.log(`  ${t.warning('○ Bash')} ${t.textMuted('npm test')}`);
	console.log(`  ${t.error('✗ Write')} ${t.textMuted('(blocked)')}`);
	console.log(`  ${t.info('→ Task')} ${t.textMuted('(json_output)')}`);

	// Subagent box
	console.log(`\n  ${t.accentSecondary('╭─ ◆ Task(explore) ─────────╮')}`);
	console.log(
		`  ${t.accentSecondary('│')}  ${t.success('● Glob')} ${t.textMuted('**/*.ts')}`,
	);
	console.log(`  ${t.accentSecondary('╰───────────────────────────╯')}`);

	// Permission keybindings
	console.log(
		`\n  ${t.success.bold('a')} Allow  ${t.error.bold('d')} Deny  ${t.info.bold('S')} Server-allow`,
	);

	// User message
	console.log(`\n  ${t.userMsg(' User: fix the bug in auth ')}`);

	// Streaming response
	console.log(`  ${t.accent.bold('◐ Streaming')}`);
	console.log(`  ${t.text("I'll look into the auth module...")}`);
}

console.log(chalk.bold('\n═══════════════════════════════════════════════'));
console.log(chalk.bold('  THEME COMPARISON'));
console.log(chalk.bold('═══════════════════════════════════════════════'));

renderTheme('DARK THEME (current)', dark);
renderTheme('DARK THEME (proposed — Catppuccin Mocha)', darkProposed);
renderTheme('LIGHT THEME (current)', lightCurrent);
renderTheme('LIGHT THEME (proposed — Catppuccin Latte)', lightProposed);

console.log('\n');
