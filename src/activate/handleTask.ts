import * as vscode from "vscode"

import { Package } from "../shared/package"
import { ClineProvider } from "../core/webview/ClineProvider"
import type { WebviewFocusTracker } from "../core/webview/WebviewFocusTracker"
import { t } from "../i18n"

export const handleNewTask = async (
	params: { prompt?: string } | null | undefined,
	webviewFocusTracker: WebviewFocusTracker,
) => {
	let prompt = params?.prompt

	if (!prompt) {
		prompt = await vscode.window.showInputBox({
			prompt: t("common:input.task_prompt"),
			placeHolder: t("common:input.task_placeholder"),
		})
	}

	if (!prompt) {
		await vscode.commands.executeCommand(`${Package.name}.SidebarProvider.focus`)
		return
	}

	const provider = webviewFocusTracker.getLastActiveProvider() ?? (await ClineProvider.getInstance())
	await provider?.handleCodeAction("newTask", "NEW_TASK", { userInput: prompt })
}
