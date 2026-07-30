export type InlineCommand = { name: string };

export type InlineCommandMatch = {
	commandStart: number;
	commandName: string;
	commandEnd: number;
};

export const parseCommandArgs = (value: string): string[] => {
	const args: string[] = [];
	let current = "";
	let quote: string | undefined;

	for (const character of value) {
		if (quote) {
			if (character === quote) quote = undefined;
			else current += character;
		} else if (character === '"' || character === "'") {
			quote = character;
		} else if (/\s/.test(character)) {
			if (current) {
				args.push(current);
				current = "";
			}
		} else {
			current += character;
		}
	}

	if (current) args.push(current);
	return args;
};

export const substituteArgs = (content: string, args: string[]): string => {
	const allArgs = args.join(" ");
	return content.replace(
		/\$\{(\d+|ARGUMENTS|@):-([^}]*)\}|\$\{@:(\d+)(?::(\d+))?\}|\$(ARGUMENTS|@|\d+)/g,
		(_match, defaultTarget, defaultValue, sliceStart, sliceLength, simple) => {
			if (defaultTarget) {
				const value =
					defaultTarget === "@" || defaultTarget === "ARGUMENTS"
						? allArgs
						: args[Number.parseInt(defaultTarget, 10) - 1];
				return value || defaultValue;
			}
			if (sliceStart) {
				const start = Math.max(0, Number.parseInt(sliceStart, 10) - 1);
				return sliceLength
					? args
							.slice(start, start + Number.parseInt(sliceLength, 10))
							.join(" ")
					: args.slice(start).join(" ");
			}
			if (simple === "@" || simple === "ARGUMENTS") return allArgs;
			return args[Number.parseInt(simple, 10) - 1] ?? "";
		},
	);
};

export const stripFrontmatter = (content: string): string => {
	const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	if (!normalized.startsWith("---")) return normalized;

	const endIndex = normalized.indexOf("\n---", 3);
	return endIndex === -1 ? normalized : normalized.slice(endIndex + 4).trim();
};

export const findInlineCommandMatches = (
	text: string,
	commands: InlineCommand[],
): InlineCommandMatch[] => {
	const matches: InlineCommandMatch[] = [];
	let quote: string | undefined;

	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];
		if (quote) {
			if (character === quote) quote = undefined;
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}
		if (character !== "/" || (index > 0 && !/[\t ]/.test(text[index - 1])))
			continue;

		const command = commands.find((candidate) => {
			const commandEnd = index + candidate.name.length + 1;
			return (
				text.startsWith(`/${candidate.name}`, index) &&
				(commandEnd === text.length || /[\t ]/.test(text[commandEnd]))
			);
		});
		if (!command) continue;

		matches.push({
			commandStart: index,
			commandName: command.name,
			commandEnd: index + command.name.length + 1,
		});
		index += command.name.length;
	}

	return matches;
};
