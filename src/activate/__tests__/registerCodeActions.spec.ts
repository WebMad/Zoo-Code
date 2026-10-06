import * as vscode from "vscode"

import { registerCodeActions } from "../registerCodeActions"
import { ClineProvider } from "../../core/webview/ClineProvider"
import { WebviewFocusTracker } from "../../core/webview/WebviewFocusTracker"
import { getCodeActionCommand } from "../../utils/commands"
import { makeExtensionContext } from "../../test-utils/vscode"
import { EditorUtils } from "../../integrations/editor/EditorUtils"

const codeActions = [
	["addToContext", "ADD_TO_CONTEXT"],
	["explainCode", "EXPLAIN"],
	["fixCode", "FIX"],
	["improveCode", "IMPROVE"],
] as const

vi.mock("vscode", () => ({ commands: { registerCommand: vi.fn() } }))
vi.mock("../../core/webview/ClineProvider", () => ({
	ClineProvider: class {
		static getInstance = vi.fn()
	},
}))
vi.mock("../../integrations/editor/EditorUtils", () => ({ EditorUtils: { getEditorContext: vi.fn() } }))

describe("registerCodeActions destination", () => {
	let tracker: WebviewFocusTracker
	let handlers: Map<string, (...args: unknown[]) => unknown>

	function createProvider() {
		const provider = Object.create(ClineProvider.prototype) as ClineProvider
		provider.handleCodeAction = vi.fn().mockResolvedValue(undefined)
		return provider
	}

	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(ClineProvider.getInstance).mockResolvedValue(undefined)
		tracker = new WebviewFocusTracker()
		handlers = new Map()
		vi.mocked(vscode.commands.registerCommand).mockImplementation((command, handler) => {
			handlers.set(command, handler)
			return { dispose: vi.fn() }
		})
		registerCodeActions(makeExtensionContext(), tracker)
	})

	it.each(codeActions)("executes %s directly on the last active chat", async (command, promptType) => {
		const provider = createProvider()
		const getLastActive = vi.spyOn(tracker, "getLastActiveProvider").mockReturnValue(provider)
		await handlers.get(getCodeActionCommand(command))!("file.ts", "selected code", 1, 2)

		expect(getLastActive).toHaveBeenCalledOnce()
		expect(ClineProvider.getInstance).not.toHaveBeenCalled()
		expect(provider.handleCodeAction).toHaveBeenCalledOnce()
		expect(provider.handleCodeAction).toHaveBeenCalledWith(command, promptType, {
			filePath: "file.ts",
			selectedText: "selected code",
			startLine: "1",
			endLine: "2",
		})
	})

	it.each(codeActions)("preserves fallback for %s when no chat has been focused", async (command, promptType) => {
		const provider = createProvider()
		vi.mocked(ClineProvider.getInstance).mockResolvedValue(provider)
		await handlers.get(getCodeActionCommand(command))!("file.ts", "selected code")
		expect(ClineProvider.getInstance).toHaveBeenCalledOnce()
		expect(provider.handleCodeAction).toHaveBeenCalledOnce()
		expect(provider.handleCodeAction).toHaveBeenCalledWith(command, promptType, {
			filePath: "file.ts",
			selectedText: "selected code",
		})
	})

	it.each(codeActions)("uses the last active chat for %s from the command palette", async (command, promptType) => {
		const provider = createProvider()
		vi.spyOn(tracker, "getLastActiveProvider").mockReturnValue(provider)
		vi.mocked(EditorUtils.getEditorContext).mockReturnValue({
			filePath: "file.ts",
			selectedText: "selected code",
			startLine: 1,
			endLine: 2,
			diagnostics: [],
		})
		await handlers.get(getCodeActionCommand(command))!()
		expect(ClineProvider.getInstance).not.toHaveBeenCalled()
		expect(provider.handleCodeAction).toHaveBeenCalledWith(command, promptType, {
			filePath: "file.ts",
			selectedText: "selected code",
			startLine: "1",
			endLine: "2",
			diagnostics: [],
		})
	})

	it.each(codeActions)("does nothing for %s when fallback cannot find a provider", async (command) => {
		await expect(handlers.get(getCodeActionCommand(command))!("file.ts", "selected code")).resolves.toBeUndefined()
		expect(ClineProvider.getInstance).toHaveBeenCalledOnce()
	})

	it("awaits execution on the selected provider and propagates its error", async () => {
		const provider = createProvider()
		const error = new Error("Code action failed")
		vi.mocked(provider.handleCodeAction).mockRejectedValue(error)
		vi.spyOn(tracker, "getLastActiveProvider").mockReturnValue(provider)
		await expect(handlers.get(getCodeActionCommand("fixCode"))!("file.ts", "selected code")).rejects.toBe(error)
		expect(ClineProvider.getInstance).not.toHaveBeenCalled()
	})
})
