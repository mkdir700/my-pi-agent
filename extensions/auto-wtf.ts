import {
	CustomEditor,
	type EditorFactory,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { EditorComponent } from "@earendil-works/pi-tui";

const WTF_COMMAND_DESCRIPTION = "Abort the current run and recover the last prompt";
const RECOVERY_TIMEOUT_MS = 30_000;

const mergeWithDraft = (prompt: string, draft: string): string =>
	draft.length === 0 ? prompt : `${prompt}\n\n${draft}`;

export default function autoWtf(pi: ExtensionAPI): void {
	let latestUserPrompt: string | undefined;
	let assistantOutputSinceLatestUser = false;
	let recoverOnSettled = false;
	let pendingRecovery: { prompt: string; navigationStarted: boolean } | undefined;
	let recoveryTimeout: ReturnType<typeof setTimeout> | undefined;
	let activeEditor: EditorComponent | undefined;
	let installedEditorFactory: EditorFactory | undefined;

	const clearRecoveryTimeout = () => {
		if (recoveryTimeout) clearTimeout(recoveryTimeout);
		recoveryTimeout = undefined;
	};

	const reset = () => {
		clearRecoveryTimeout();
		latestUserPrompt = undefined;
		assistantOutputSinceLatestUser = false;
		recoverOnSettled = false;
		pendingRecovery = undefined;
		activeEditor = undefined;
		installedEditorFactory = undefined;
	};

	const installEditorWrapper = (ctx: ExtensionContext) => {
		const currentEditorFactory = ctx.ui.getEditorComponent();
		if (installedEditorFactory && currentEditorFactory === installedEditorFactory) return;

		const wrapper: EditorFactory = (tui, theme, keybindings) => {
			activeEditor =
				currentEditorFactory?.(tui, theme, keybindings) ?? new CustomEditor(tui, theme, keybindings);
			return activeEditor;
		};
		installedEditorFactory = wrapper;
		ctx.ui.setEditorComponent(wrapper);
	};

	pi.on("session_start", (_event, ctx) => {
		reset();
		if (ctx.mode === "tui") {
			installEditorWrapper(ctx);
			setTimeout(() => ctx.ui.notify("auto-wtf loaded", "info"), 0);
		}
	});

	pi.on("session_shutdown", reset);

	pi.on("message_start", (event) => {
		if (event.message.role !== "user") return;

		const content = event.message.content;
		latestUserPrompt =
			typeof content === "string"
				? content
				: content
						.filter((block) => block.type === "text")
						.map((block) => block.text)
						.join("");
		assistantOutputSinceLatestUser = false;
		recoverOnSettled = false;
	});

	pi.on("message_update", (event) => {
		if (!latestUserPrompt || event.message.role !== "assistant") return;
		assistantOutputSinceLatestUser ||= event.message.content.some((block) => {
			if (block.type === "text") return block.text.length > 0;
			if (block.type === "thinking") return block.thinking.length > 0;
			return true;
		});
	});

	pi.on("message_end", (event) => {
		if (!latestUserPrompt || event.message.role !== "assistant") return;
		const hasOutput = event.message.content.some((block) => {
			if (block.type === "text") return block.text.length > 0;
			if (block.type === "thinking") return block.thinking.length > 0;
			return true;
		});
		assistantOutputSinceLatestUser ||= hasOutput;
		recoverOnSettled =
			event.message.stopReason === "aborted" && !assistantOutputSinceLatestUser && !hasOutput;
	});

	pi.on("agent_settled", (_event, ctx) => {
		const prompt = latestUserPrompt;
		const shouldRecover = recoverOnSettled;
		latestUserPrompt = undefined;
		assistantOutputSinceLatestUser = false;
		recoverOnSettled = false;
		if (!prompt || !shouldRecover || ctx.mode !== "tui") return;

		installEditorWrapper(ctx);
		const command = pi
			.getCommands()
			.find((candidate) => candidate.description === WTF_COMMAND_DESCRIPTION);
		if (!command) {
			ctx.ui.notify("Automatic pi-wtf recovery is unavailable: command not found", "warning");
			return;
		}
		if (!activeEditor?.onSubmit) {
			ctx.ui.notify("Automatic pi-wtf recovery is unavailable: editor submit not ready", "warning");
			return;
		}

		ctx.ui.notify(`Automatically running /${command.name}`, "info");
		pendingRecovery = { prompt, navigationStarted: false };
		clearRecoveryTimeout();
		recoveryTimeout = setTimeout(() => {
			if (!pendingRecovery) return;
			pendingRecovery = undefined;
			ctx.ui.notify("Automatic pi-wtf recovery did not complete", "warning");
		}, RECOVERY_TIMEOUT_MS);

		const addToHistory = activeEditor.addToHistory;
		if (addToHistory) activeEditor.addToHistory = () => {};
		try {
			activeEditor.onSubmit(`/${command.name}`);
		} finally {
			if (addToHistory) activeEditor.addToHistory = addToHistory;
		}
	});

	pi.on("session_before_tree", () => {
		if (pendingRecovery) pendingRecovery.navigationStarted = true;
	});

	pi.on("session_tree", (_event, ctx) => {
		const recovery = pendingRecovery;
		if (!recovery?.navigationStarted || ctx.mode !== "tui") return;

		const draft = ctx.ui.getEditorText();
		pendingRecovery = undefined;
		clearRecoveryTimeout();
		setTimeout(() => {
			ctx.ui.setEditorText(mergeWithDraft(recovery.prompt, draft));
		}, 0);
	});
}
