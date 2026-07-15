import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { basename } from "node:path";

const compact = (value: string): string =>
	value
		.normalize("NFKC")
		.toLocaleLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "");

const makeFdPattern = (query: string): string =>
	[...query.normalize("NFKC")]
		.filter((character) => /[\p{L}\p{N}]/u.test(character))
		.join(String.raw`[^\p{L}\p{N}]*`);

const rankFile = (file: string, query: string): number => {
	const fileName = compact(basename(file));
	if (fileName === query) return 0;
	if (fileName.startsWith(query)) return 1;
	if (fileName.includes(query)) return 2;
	return 3;
};

export default function punctuationFuzzyAt(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.addAutocompleteProvider((current) => ({
			triggerCharacters: ["@"],

			async getSuggestions(lines, cursorLine, cursorCol, options) {
				const beforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
				const match = beforeCursor.match(/(?:^|[ \t=])@([^\s@]*)$/);
				if (!match) {
					return current.getSuggestions(lines, cursorLine, cursorCol, options);
				}

				const query = match[1] ?? "";
				const normalizedQuery = compact(query);
				if (normalizedQuery.length < 3 || query.includes("/")) {
					return current.getSuggestions(lines, cursorLine, cursorCol, options);
				}

				const result = await pi.exec(
					"fd",
					[
						"--hidden",
						"--follow",
						"--ignore-case",
						"--type",
						"f",
						"--exclude",
						".git",
						"--max-results",
						"200",
						"--base-directory",
						ctx.cwd,
						makeFdPattern(query),
					],
					{ cwd: ctx.cwd, signal: options.signal, timeout: 2_000 },
				);

				if (result.code !== 0 || options.signal.aborted) {
					return current.getSuggestions(lines, cursorLine, cursorCol, options);
				}

				const files = result.stdout
					.split("\n")
					.filter(Boolean)
					.filter((file) => compact(file).includes(normalizedQuery))
					.sort(
						(a, b) =>
							rankFile(a, normalizedQuery) - rankFile(b, normalizedQuery) || a.localeCompare(b),
					)
					.slice(0, 20);

				if (files.length === 0) {
					return current.getSuggestions(lines, cursorLine, cursorCol, options);
				}

				return {
					prefix: `@${query}`,
					items: files.map((file) => ({
						value: file.includes(" ") ? `@"${file}"` : `@${file}`,
						label: basename(file),
						description: file,
					})),
				};
			},

			applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
				return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
			},

			shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
				return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
			},
		}));
	});
}
