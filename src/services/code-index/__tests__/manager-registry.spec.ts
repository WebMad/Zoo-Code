import * as vscode from "vscode"
import { makeExtensionContext, makeTextEditor, makeUri } from "../../../test-utils/vscode"
import { CodeIndexManager } from "../manager"
import { CodeIndexManagerRegistry } from "../manager-registry"
import { CodeIndexScope } from "../code-index-scope"

vi.mock("../state-manager", () => ({
	CodeIndexStateManager: vi.fn().mockImplementation(function () {
		return {}
	}),
}))

vi.mock("vscode", () => ({
	window: { activeTextEditor: undefined },
	workspace: { workspaceFolders: undefined, getWorkspaceFolder: vi.fn() },
	Uri: { file: vi.fn() },
}))

vi.mock("../manager", () => ({
	CodeIndexManager: vi.fn().mockImplementation(function () {
		return { dispose: vi.fn() }
	}),
}))

describe("CodeIndexManagerRegistry", () => {
	let context: vscode.ExtensionContext
	const first: vscode.WorkspaceFolder = { uri: makeUri("/first"), name: "first", index: 0 }
	const second: vscode.WorkspaceFolder = {
		uri: makeUri("/second", { scheme: "vscode-remote", authority: "ssh-remote+host" }),
		name: "second",
		index: 1,
	}

	beforeEach(() => {
		vi.clearAllMocks()
		context = makeExtensionContext()
		vi.mocked(vscode.Uri.file).mockImplementation((value) => makeUri(value))
		Object.defineProperty(vscode.window, "activeTextEditor", { value: undefined, configurable: true })
		Object.defineProperty(vscode.workspace, "workspaceFolders", {
			value: [first, second],
			configurable: true,
		})
		vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(undefined)
	})

	afterEach(() => CodeIndexManagerRegistry.disposeAll())

	it("retains the scope that owns the manager returned to consumers", () => {
		const scope = CodeIndexManagerRegistry.getScope(context)
		expect(scope).toBeInstanceOf(CodeIndexScope)
		expect(CodeIndexManagerRegistry.getScope(context, first.uri.fsPath)).toBe(scope)
		expect(CodeIndexManagerRegistry.getInstance(context)).toBe(scope?.codeIndexManager)
		expect(CodeIndexManagerRegistry.getAllScopes()).toEqual([scope])
	})

	it("disposes through the owning scope", () => {
		const scope = CodeIndexManagerRegistry.getScope(context)
		if (!scope) throw new Error("Expected a workspace scope")
		const dispose = vi.spyOn(scope, "dispose")
		CodeIndexManagerRegistry.disposeAll()
		expect(dispose).toHaveBeenCalledOnce()
		expect(CodeIndexManagerRegistry.getAllScopes()).toEqual([])
	})

	it("returns no manager without a workspace or explicit path", () => {
		Object.defineProperty(vscode.workspace, "workspaceFolders", { value: undefined })
		expect(CodeIndexManagerRegistry.getInstance(context)).toBeUndefined()
		expect(CodeIndexManager).not.toHaveBeenCalled()
	})

	it("defaults to the first workspace and reuses its manager", () => {
		const manager = CodeIndexManagerRegistry.getInstance(context)
		expect(CodeIndexManagerRegistry.getInstance(context, first.uri.fsPath)).toBe(manager)
		expect(CodeIndexManager).toHaveBeenCalledExactlyOnceWith(
			first.uri.fsPath,
			first.uri,
			context,
			expect.any(Object),
		)
	})

	it("uses the active editor workspace and preserves its remote URI", () => {
		const editor = makeTextEditor()
		Object.defineProperty(vscode.window, "activeTextEditor", { value: editor })
		vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(second)
		CodeIndexManagerRegistry.getInstance(context)
		expect(vscode.workspace.getWorkspaceFolder).toHaveBeenCalledWith(editor.document.uri)
		expect(CodeIndexManager).toHaveBeenCalledWith(second.uri.fsPath, second.uri, context, expect.any(Object))
	})

	it("falls back to the first workspace when the active editor is outside it", () => {
		Object.defineProperty(vscode.window, "activeTextEditor", { value: makeTextEditor() })
		CodeIndexManagerRegistry.getInstance(context)
		expect(CodeIndexManager).toHaveBeenCalledWith(first.uri.fsPath, first.uri, context, expect.any(Object))
	})

	it("prefers an explicit workspace over the active editor", () => {
		Object.defineProperty(vscode.window, "activeTextEditor", { value: makeTextEditor() })
		vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(first)
		CodeIndexManagerRegistry.getInstance(context, second.uri.fsPath)
		expect(CodeIndexManager).toHaveBeenCalledWith(second.uri.fsPath, second.uri, context, expect.any(Object))
		expect(vscode.workspace.getWorkspaceFolder).not.toHaveBeenCalled()
	})

	it("creates a file URI for an explicit path outside workspace folders", () => {
		Object.defineProperty(vscode.workspace, "workspaceFolders", { value: undefined })
		const uri = makeUri("/outside")
		vi.mocked(vscode.Uri.file).mockReturnValue(uri)
		CodeIndexManagerRegistry.getInstance(context, "/outside")
		expect(vscode.Uri.file).toHaveBeenCalledWith("/outside")
		expect(CodeIndexManager).toHaveBeenCalledWith("/outside", uri, context, expect.any(Object))
	})

	it("creates distinct managers for different workspaces", () => {
		const a = CodeIndexManagerRegistry.getInstance(context, first.uri.fsPath)!
		const b = CodeIndexManagerRegistry.getInstance(context, second.uri.fsPath)!
		expect(a).not.toBe(b)
	})

	it("lists all registered managers", () => {
		const a = CodeIndexManagerRegistry.getInstance(context, first.uri.fsPath)!
		const b = CodeIndexManagerRegistry.getInstance(context, second.uri.fsPath)!
		expect(CodeIndexManagerRegistry.getAllInstances()).toEqual([a, b])
	})

	it("disposes every registered manager", () => {
		const a = CodeIndexManagerRegistry.getInstance(context, first.uri.fsPath)!
		const b = CodeIndexManagerRegistry.getInstance(context, second.uri.fsPath)!
		CodeIndexManagerRegistry.disposeAll()
		expect(a.dispose).toHaveBeenCalledTimes(1)
		expect(b.dispose).toHaveBeenCalledTimes(1)
	})

	it("removes all managers from the registry on disposal", () => {
		CodeIndexManagerRegistry.getInstance(context, first.uri.fsPath)
		CodeIndexManagerRegistry.getInstance(context, second.uri.fsPath)
		CodeIndexManagerRegistry.disposeAll()
		expect(CodeIndexManagerRegistry.getAllInstances()).toEqual([])
	})

	it("does not dispose managers again when cleanup is repeated", () => {
		const manager = CodeIndexManagerRegistry.getInstance(context, first.uri.fsPath)!
		CodeIndexManagerRegistry.disposeAll()
		CodeIndexManagerRegistry.disposeAll()
		expect(manager.dispose).toHaveBeenCalledTimes(1)
	})

	it("creates a new manager for the same workspace after disposal", () => {
		const manager = CodeIndexManagerRegistry.getInstance(context, first.uri.fsPath)!
		CodeIndexManagerRegistry.disposeAll()
		expect(CodeIndexManagerRegistry.getInstance(context, first.uri.fsPath)).not.toBe(manager)
	})

	it("attempts every disposal and rethrows the first error", () => {
		const a = CodeIndexManagerRegistry.getInstance(context, first.uri.fsPath)!
		const b = CodeIndexManagerRegistry.getInstance(context, second.uri.fsPath)!
		const firstError = new Error("first cleanup failed")
		vi.mocked(a.dispose).mockImplementation(() => {
			throw firstError
		})
		vi.mocked(b.dispose).mockImplementation(() => {
			throw new Error("second cleanup failed")
		})
		expect(() => CodeIndexManagerRegistry.disposeAll()).toThrow(firstError)
		expect(b.dispose).toHaveBeenCalledTimes(1)
		expect(CodeIndexManagerRegistry.getAllInstances()).toEqual([])
	})

	it("clears the registry before disposal callbacks run", () => {
		const manager = CodeIndexManagerRegistry.getInstance(context, first.uri.fsPath)!
		vi.mocked(manager.dispose).mockImplementation(() => {
			expect(CodeIndexManagerRegistry.getAllInstances()).toEqual([])
		})
		CodeIndexManagerRegistry.disposeAll()
	})
})
