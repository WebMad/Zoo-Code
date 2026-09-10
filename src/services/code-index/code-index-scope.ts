import type * as vscode from "vscode"
import { CodeIndexManager } from "./manager"
import { CodeIndexStateManager } from "./state-manager"

/** Owns a workspace manager. Internal service ownership remains in the manager for now. */
export class CodeIndexScope {
	public codeIndexManager: CodeIndexManager | undefined

	public constructor(
		private readonly workspacePath: string,
		private readonly folderUri: vscode.Uri,
		private readonly context: vscode.ExtensionContext,
	) {}

	public init(): void {
		if (this.codeIndexManager) {
			return
		}
		const codeIndexStateManager = new CodeIndexStateManager()
		try {
			this.codeIndexManager = new CodeIndexManager(
				this.workspacePath,
				this.folderUri,
				this.context,
				codeIndexStateManager,
			)
		} catch (error) {
			codeIndexStateManager.dispose()
			throw error
		}
	}

	public dispose(): void {
		const codeIndexManager = this.codeIndexManager
		this.codeIndexManager = undefined
		codeIndexManager?.dispose()
	}
}
