import {Text} from 'ink';
import {type Command} from '../../app/commands/types';
import {useTheme} from '../theme/index';
import chalk from 'chalk';
import {fit} from '../../shared/utils/format';

type Props = {
	commands: Command[];
	selectedIndex: number;
	innerWidth: number;
	/** Wraps a plain-text line with frame border edges (e.g. │…│). */
	wrapLine: (line: string) => string;
};

export default function CommandSuggestions({
	commands,
	selectedIndex,
	innerWidth,
	wrapLine,
}: Props) {
	const theme = useTheme();
	if (commands.length === 0) return null;

	const nameColWidth = Math.max(...commands.map(cmd => cmd.name.length + 1));
	const PROMPT_WIDTH = 3; // align '/' with input content (' › ' = 3 chars)
	const GAP = 2;
	const maxDescLen = Math.max(
		20,
		innerWidth - nameColWidth - PROMPT_WIDTH - GAP,
	);
	const padding = ' '.repeat(PROMPT_WIDTH);

	return (
		<>
			{commands.map((cmd, i) => {
				const isSelected = i === selectedIndex;
				const name = `/${cmd.name}`.padEnd(nameColWidth + 2);
				const styledName = isSelected
					? chalk.hex(theme.accent).bold(name)
					: chalk.hex(theme.text)(name);
				const desc =
					cmd.description.length > maxDescLen
						? cmd.description.slice(0, maxDescLen - 1) + '\u2026'
						: cmd.description;
				const styledDesc = chalk.dim(desc);
				const line = fit(`${padding}${styledName}${styledDesc}`, innerWidth);
				return <Text key={cmd.name}>{wrapLine(line)}</Text>;
			})}
		</>
	);
}
