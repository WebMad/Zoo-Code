import * as vscode from "vscode"
import type { WebviewMessage } from "@roo-code/types"

import type { ClineProvider } from "./ClineProvider"

interface WebviewFocusSource {
	readonly webview: Pick<vscode.Webview, "onDidReceiveMessage">
	readonly onDidDispose: vscode.Event<void>
}

interface TrackedWebview extends vscode.Disposable {
	readonly provider: ClineProvider
	subscriptions?: vscode.Disposable
}

export class WebviewFocusTracker implements vscode.Disposable {
	private lastFocusedWebview?: TrackedWebview
	private readonly trackedWebviews = new Set<TrackedWebview>()

	public getLastActiveProvider(): ClineProvider | undefined {
		return this.lastFocusedWebview?.provider
	}

	public init(provider: ClineProvider, view: WebviewFocusSource): vscode.Disposable {
		const trackedWebview: TrackedWebview = {
			provider,
			dispose: () => this.untrackWebview(trackedWebview),
		}
		this.trackedWebviews.add(trackedWebview)

		trackedWebview.subscriptions = vscode.Disposable.from(
			view.webview.onDidReceiveMessage((message: WebviewMessage) => this.handleMessage(trackedWebview, message)),
			view.onDidDispose(() => trackedWebview.dispose()),
		)

		// An event source may dispose the view while its listeners are being registered.
		if (!this.trackedWebviews.has(trackedWebview)) {
			trackedWebview.subscriptions.dispose()
		}

		return trackedWebview
	}

	public dispose() {
		vscode.Disposable.from(...this.trackedWebviews).dispose()
		this.trackedWebviews.clear()
		this.lastFocusedWebview = undefined
	}

	private handleMessage(trackedWebview: TrackedWebview, message: WebviewMessage): void {
		if (message.type !== "webviewDidFocus" || !this.trackedWebviews.has(trackedWebview)) {
			return
		}

		this.lastFocusedWebview = trackedWebview
	}

	private untrackWebview(trackedWebview: TrackedWebview): void {
		if (!this.trackedWebviews.delete(trackedWebview)) {
			return
		}

		if (this.lastFocusedWebview === trackedWebview) {
			this.lastFocusedWebview = undefined
		}

		trackedWebview.subscriptions?.dispose()
	}
}
