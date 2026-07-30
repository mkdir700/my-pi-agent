import {
	findInlineCommandMatches,
	parseCommandArgs,
	stripFrontmatter,
	substituteArgs,
} from "../lib/inline-slash-command-utils.ts";

const assertEqual = (actual: unknown, expected: unknown, label: string): void => {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`${label}: ${JSON.stringify(actual)}`);
	}
};

const commands = [{ name: "first" }, { name: "skill:test" }, { name: "second" }];

assertEqual(
	findInlineCommandMatches('/first "mention /skill:test literally" /second', commands),
	[
		{ commandStart: 0, commandName: "first", commandEnd: 6 },
		{ commandStart: 39, commandName: "second", commandEnd: 46 },
	],
	"quoted slash commands must remain template arguments",
);
assertEqual(parseCommandArgs('one "two words"'), ["one", "two words"], "quoted arguments");
assertEqual(
	substituteArgs("$1 / $@ / ${2:-fallback}", ["one", "two"]),
	"one / one two / two",
	"template arguments",
);
assertEqual(
	stripFrontmatter("---\r\ndescription: test\r\n---\r\nbody\r\n"),
	"body",
	"CRLF frontmatter",
);

console.log("inline slash command utility tests passed");
