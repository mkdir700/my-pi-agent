import {
	CustomEditor,
	type EditorFactory,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import type { EditorComponent } from "@earendil-works/pi-tui";
import { readFileSync } from "node:fs";

type SlashCommand = {
	name: string;
	description?: string;
	source: "prompt" | "skill";
	sourceInfo: { path: string; baseDir?: string };
};

type ThemeColors = {
	fg(color: "syntaxFunction" | "syntaxKeyword", text: string): string;
};

const colorTriggerTokens = (line: string, theme: ThemeColors): string =>
	line
		.split(/(\x1b\[7m[@/]\x1b\[0m)/g)
		.map((segment) => {
			if (segment === "\x1b[7m@\x1b[0m" || segment === "\x1b[7m/\x1b[0m")
				return segment;
			return segment.replace(
				/(^|[\t ])(@(?:"[^"]*"|\S*)|\/\S*)/g,
				(_match, prefix: string, token: string) =>
					`${prefix}${theme.fg(token.startsWith("@") ? "syntaxFunction" : "syntaxKeyword", token)}`,
			);
		})
		.join("");

class TriggerColorEditor implements EditorComponent {
	private readonly base: EditorComponent;
	private readonly getTheme: () => ThemeColors;

	constructor(base: EditorComponent, getTheme: () => ThemeColors) {
		this.base = base;
		this.getTheme = getTheme;
	}

	get focused(): boolean {
		return (
			(this.base as EditorComponent & { focused?: boolean }).focused ?? false
		);
	}

	set focused(value: boolean) {
		(this.base as EditorComponent & { focused?: boolean }).focused = value;
	}

	get onSubmit(): ((text: string) => void) | undefined {
		return this.base.onSubmit;
	}

	set onSubmit(handler: ((text: string) => void) | undefined) {
		this.base.onSubmit = handler;
	}

	get onChange(): ((text: string) => void) | undefined {
		return this.base.onChange;
	}

	set onChange(handler: ((text: string) => void) | undefined) {
		this.base.onChange = handler;
	}

	get borderColor(): ((text: string) => string) | undefined {
		return this.base.borderColor;
	}

	set borderColor(color: ((text: string) => string) | undefined) {
		this.base.borderColor = color;
	}

	get actionHandlers(): Map<unknown, () => void> {
		return (this.base as EditorComponent & { actionHandlers: Map<unknown, () => void> })
			.actionHandlers;
	}

	get onEscape(): (() => void) | undefined {
		return (this.base as EditorComponent & { onEscape?: () => void }).onEscape;
	}

	set onEscape(handler: (() => void) | undefined) {
		(this.base as EditorComponent & { onEscape?: () => void }).onEscape = handler;
	}

	get onCtrlD(): (() => void) | undefined {
		return (this.base as EditorComponent & { onCtrlD?: () => void }).onCtrlD;
	}

	set onCtrlD(handler: (() => void) | undefined) {
		(this.base as EditorComponent & { onCtrlD?: () => void }).onCtrlD = handler;
	}

	get onPasteImage(): (() => void) | undefined {
		return (this.base as EditorComponent & { onPasteImage?: () => void }).onPasteImage;
	}

	set onPasteImage(handler: (() => void) | undefined) {
		(this.base as EditorComponent & { onPasteImage?: () => void }).onPasteImage = handler;
	}

	get onExtensionShortcut(): ((data: string) => boolean) | undefined {
		return (this.base as EditorComponent & { onExtensionShortcut?: (data: string) => boolean })
			.onExtensionShortcut;
	}

	set onExtensionShortcut(handler: ((data: string) => boolean) | undefined) {
		(this.base as EditorComponent & { onExtensionShortcut?: (data: string) => boolean }).onExtensionShortcut = handler;
	}

	render(width: number): string[] {
		return this.base
			.render(width)
			.map((line) => colorTriggerTokens(line, this.getTheme()));
	}

	invalidate(): void {
		this.base.invalidate();
	}

	getText(): string {
		return this.base.getText();
	}

	setText(text: string): void {
		this.base.setText(text);
	}

	handleInput(data: string): void {
		this.base.handleInput(data);
	}

	addToHistory(text: string): void {
		this.base.addToHistory?.(text);
	}

	insertTextAtCursor(text: string): void {
		this.base.insertTextAtCursor?.(text);
	}

	getExpandedText(): string {
		return this.base.getExpandedText?.() ?? this.base.getText();
	}

	setAutocompleteProvider: EditorComponent["setAutocompleteProvider"] = (
		provider,
	) => {
		this.base.setAutocompleteProvider?.(provider);
	};

	setPaddingX(padding: number): void {
		this.base.setPaddingX?.(padding);
	}

	setAutocompleteMaxVisible(maxVisible: number): void {
		this.base.setAutocompleteMaxVisible?.(maxVisible);
	}
}

const parseArgs = (value: string): string[] => {
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

const substituteArgs = (content: string, args: string[]): string => {
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

const stripFrontmatter = (content: string): string =>
	content.startsWith("---\n")
		? (content.match(/^---\s*\n[\s\S]*?\n---\s*\n?([\s\S]*)$/)?.[1] ?? content)
		: content;

const getExpandableCommands = (pi: ExtensionAPI): SlashCommand[] =>
	pi
		.getCommands()
		.flatMap((command) =>
			(command.source === "prompt" || command.source === "skill") &&
			command.name.length > 0
				? [command as SlashCommand]
				: [],
		)
		.sort((left, right) => right.name.length - left.name.length);

const expandCommand = (
	command: SlashCommand,
	args: string,
): string | undefined => {
	try {
		const content = readFileSync(command.sourceInfo.path, "utf8");
		if (command.source === "prompt")
			return substituteArgs(stripFrontmatter(content), parseArgs(args));

		const body = stripFrontmatter(content).trim();
		const location = command.sourceInfo.path;
		const references = command.sourceInfo.baseDir ?? "the skill directory";
		const skill = `<skill name="${command.name.slice("skill:".length)}" location="${location}">\nReferences are relative to ${references}.\n\n${body}\n</skill>`;
		return args ? `${skill}\n\n${args}` : skill;
	} catch {
		return undefined;
	}
};

export default function inlineSlashCommands(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		const currentEditorFactory = ctx.ui.getEditorComponent();
		const colorEditor: EditorFactory = (tui, theme, keybindings) =>
			new TriggerColorEditor(
				currentEditorFactory?.(tui, theme, keybindings) ??
					new CustomEditor(tui, theme, keybindings),
				() => ctx.ui.theme,
			);
		ctx.ui.setEditorComponent(colorEditor);

		ctx.ui.addAutocompleteProvider((current) => ({
			triggerCharacters: ["/"],
			getSuggestions(lines, cursorLine, cursorCol, options) {
				const beforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
				const match = beforeCursor.match(/(?:^|[\t ])\/([^\s/]*)$/);
				if (!match || match.index === 0) {
					return current.getSuggestions(lines, cursorLine, cursorCol, options);
				}

				const prefix = `/${match[1] ?? ""}`;
				const query = match[1] ?? "";
				const items = getExpandableCommands(pi).flatMap((command) =>
					command.name.startsWith(query)
						? [
								{
									value: command.name,
									label: command.name,
									description:
										command.description ??
										(command.source === "skill" ? "Skill" : "Prompt template"),
								},
							]
						: [],
				);
				return Promise.resolve(items.length > 0 ? { items, prefix } : null);
			},
			applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
				if (!prefix.startsWith("/")) {
					return current.applyCompletion(
						lines,
						cursorLine,
						cursorCol,
						item,
						prefix,
					);
				}

				const line = lines[cursorLine] ?? "";
				const beforePrefix = line.slice(0, cursorCol - prefix.length);
				const afterCursor = line.slice(cursorCol);
				const nextLines = [...lines];
				nextLines[cursorLine] = `${beforePrefix}/${item.value} ${afterCursor}`;
				return {
					lines: nextLines,
					cursorLine,
					cursorCol: beforePrefix.length + item.value.length + 2,
				};
			},
			shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
				return (
					current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ??
					true
				);
			},
		}));
	});

	pi.on("input", (event) => {
		const commands = getExpandableCommands(pi);
		if (commands.length === 0) return { action: "continue" };

		const byName = new Map(commands.map((command) => [command.name, command]));
		const matches: Array<{
			commandStart: number;
			commandName: string;
			commandEnd: number;
		}> = [];
		for (let index = 0; index < event.text.length; index += 1) {
			if (
				event.text[index] !== "/" ||
				(index > 0 && !/[\t ]/.test(event.text[index - 1]))
			)
				continue;

			const command = commands.find((candidate) => {
				const commandEnd = index + candidate.name.length + 1;
				return (
					event.text.startsWith(`/${candidate.name}`, index) &&
					(commandEnd === event.text.length ||
						/[\t ]/.test(event.text[commandEnd]))
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

		if (matches.length === 0) return { action: "continue" };
		const firstCommand = matches[0];
		if (matches.length === 1 && firstCommand.commandStart === 0)
			return { action: "continue" };

		let expanded = "";
		let cursor = 0;
		for (let index = 0; index < matches.length; index += 1) {
			const match = matches[index];
			const next = matches[index + 1];
			const command = byName.get(match.commandName);
			if (!command) continue;

			expanded += event.text.slice(cursor, match.commandStart);
			const args = event.text
				.slice(match.commandEnd, next?.commandStart)
				.trim();
			const result = expandCommand(command, args);
			if (result === undefined) return { action: "continue" };
			expanded += result;
			cursor = next?.commandStart ?? event.text.length;
		}

		expanded += event.text.slice(cursor);
		return { action: "transform", text: expanded };
	});
}
