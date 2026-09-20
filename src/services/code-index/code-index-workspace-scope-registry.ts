import * as vscode from "vscode"

import { CodeIndexWorkspaceScope } from "./code-index-workspace-scope"

/** Resolves workspaces and owns their cached code-index scopes. */
export class CodeIndexWorkspaceScopeRegistry {
	public static readonly instance = new CodeIndexWorkspaceScopeRegistry()

	private readonly scopes = new Map<string, CodeIndexWorkspaceScope>()
	private disposing = false

	private constructor() {}

	public getScope(
		context: vscode.ExtensionContext,
		workspace?: string | vscode.Uri | vscode.WorkspaceFolder,
	): CodeIndexWorkspaceScope | undefined {
		if (this.disposing) {
			return undefined
		}
		const folder = this.resolveWorkspaceFolder(typeof workspace === "string" ? workspace : undefined)
		const folderUri =
			typeof workspace === "string"
				? (folder?.uri ?? vscode.Uri.file(workspace))
				: workspace === undefined
					? folder?.uri
					: "uri" in workspace
						? workspace.uri
						: workspace
		const resolvedPath = typeof workspace === "string" ? workspace : folderUri?.fsPath
		if (!resolvedPath || !folderUri) {
			return undefined
		}

		const scopeKey = folderUri.toString(true)
		const existing = this.scopes.get(scopeKey)
		if (existing) {
			return existing
		}

		const scope = new CodeIndexWorkspaceScope(resolvedPath, folderUri, context)
		this.scopes.set(scopeKey, scope)
		return scope
	}

	public getAllScopes(): CodeIndexWorkspaceScope[] {
		return Array.from(this.scopes.values())
	}

	public disposeAll(): void {
		if (this.disposing) {
			return
		}
		this.disposing = true
		const scopes = this.getAllScopes()
		this.scopes.clear()
		const errors: unknown[] = []
		try {
			for (const scope of scopes) {
				try {
					scope.dispose()
				} catch (error) {
					errors.push(error)
				}
			}
		} finally {
			this.disposing = false
		}
		if (errors.length > 0) {
			throw new AggregateError(errors, "Failed to dispose code index workspace scopes")
		}
	}

	private resolveWorkspaceFolder(workspacePath?: string): vscode.WorkspaceFolder | undefined {
		if (workspacePath) {
			return vscode.workspace.workspaceFolders?.find((folder) => folder.uri.fsPath === workspacePath)
		}

		const activeEditor = vscode.window.activeTextEditor
		if (activeEditor) {
			const folder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri)
			if (folder) {
				return folder
			}
		}

		return vscode.workspace.workspaceFolders?.[0]
	}
}

/** Shared workspace scope registry used by the extension runtime. */
export const codeIndexWorkspaceScopeRegistry = CodeIndexWorkspaceScopeRegistry.instance
