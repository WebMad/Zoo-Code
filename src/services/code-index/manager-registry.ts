import * as vscode from "vscode"
import type { CodeIndexManager } from "./manager"
import { CodeIndexScope } from "./code-index-scope"

/** Creates and retains one code index scope per workspace path. */
export class CodeIndexManagerRegistry {
	private static scopesByWorkspacePath = new Map<string, CodeIndexScope>()

	public static getInstance(context: vscode.ExtensionContext, workspacePath?: string): CodeIndexManager | undefined {
		return this.getScope(context, workspacePath)?.codeIndexManager
	}

	public static getScope(context: vscode.ExtensionContext, workspacePath?: string): CodeIndexScope | undefined {
		const folder = this.resolveWorkspaceFolder(workspacePath)
		workspacePath = workspacePath || folder?.uri.fsPath
		if (!workspacePath) {
			return undefined
		}

		const scopesByWorkspacePath = CodeIndexManagerRegistry.scopesByWorkspacePath
		const existingScope = scopesByWorkspacePath.get(workspacePath)
		if (existingScope) {
			return existingScope
		}

		// folder may be undefined when workspacePath was provided but doesn't match
		// any workspace folder (e.g. cwd passed from a tool). Fall back to file:// URI.
		const folderUri = folder?.uri ?? vscode.Uri.file(workspacePath)
		const scope = new CodeIndexScope(workspacePath, folderUri, context)
		scope.init()
		scopesByWorkspacePath.set(workspacePath, scope)
		return scope
	}

	private static resolveWorkspaceFolder(workspacePath?: string): vscode.WorkspaceFolder | undefined {
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

	private static get instances() {
		return CodeIndexManagerRegistry.scopesByWorkspacePath.values()
	}

	public static getAllInstances(): CodeIndexManager[] {
		return this.getAllScopes()
			.map((scope) => scope.codeIndexManager)
			.filter((codeIndexManager) => codeIndexManager !== undefined)
	}

	public static getAllScopes(): CodeIndexScope[] {
		return Array.from(this.instances)
	}

	public static disposeAll(): void {
		const instances = this.getAllScopes()
		CodeIndexManagerRegistry.scopesByWorkspacePath.clear()
		const errors: unknown[] = []
		for (const instance of instances) {
			try {
				instance.dispose()
			} catch (error) {
				errors.push(error)
			}
		}
		if (errors.length > 0) {
			throw errors[0]
		}
	}
}
