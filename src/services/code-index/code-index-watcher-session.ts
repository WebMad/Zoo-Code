import * as path from "path"
import type { Disposable, Event } from "vscode"
import type { BatchProcessingSummary, IFileWatcher } from "./interfaces"
import type { CodeIndexStateManager } from "./state-manager"

interface Session {
	watcher: IFileWatcher
	stopped: boolean
	subscriptions: Disposable[]
	ready: Promise<void>
}

/** Owns watcher startup and subscriptions; only batch summaries publish final outcomes. */
export class WatcherSession {
	private session?: Session

	constructor(
		private readonly createWatcher: () => IFileWatcher,
		private readonly stateManager: Pick<
			CodeIndexStateManager,
			"state" | "setSystemState" | "reportFileQueueProgress"
		>,
	) {}

	start(): Promise<void> {
		if (this.session) return this.session.ready

		const session: Session = {
			watcher: this.createWatcher(),
			stopped: false,
			subscriptions: [],
			ready: Promise.resolve(),
		}
		this.session = session
		session.ready = this.initialize(session)
		return session.ready
	}

	stop(): void {
		const session = this.session
		if (!session) return
		this.session = undefined
		session.stopped = true
		this.disposeSubscriptions(session)
		session.watcher.dispose()
	}

	private disposeSubscriptions(session: Session): void {
		for (const subscription of session.subscriptions.splice(0)) subscription.dispose()
	}

	private async initialize(session: Session): Promise<void> {
		try {
			await session.watcher.initialize()
			if (session.stopped) throw new DOMException("Watcher startup stopped", "AbortError")

			this.subscribeToWatcher(session)
		} catch (error) {
			if (this.session === session) this.session = undefined
			session.stopped = true
			this.disposeSubscriptions(session)
			// Initialization may have allocated resources after stop() disposed the watcher.
			session.watcher.dispose()
			throw error
		}
	}

	private subscribeToWatcher(session: Session): void {
		this.subscribe(session, session.watcher.onDidStartBatchProcessing, (files) => this.handleBatchStarted(files))
		this.subscribe(
			session,
			session.watcher.onBatchProgressUpdate,
			({ processedInBatch, totalInBatch, currentFile }) =>
				this.handleBatchProgress(processedInBatch, totalInBatch, currentFile),
		)
		this.subscribe(session, session.watcher.onDidFinishBatchProcessing, (summary) =>
			this.handleBatchFinished(summary),
		)
	}

	private subscribe<T>(session: Session, event: Event<T>, handler: (value: T) => void): void {
		// Record each subscription immediately so a later registration failure cannot leak it.
		const subscription = event((value) => {
			if (session.stopped || this.stateManager.state === "Stopping") return
			handler(value)
		})
		session.subscriptions.push(subscription)
	}

	private handleBatchStarted(files: string[]): void {
		if (files.length === 0) return
		this.stateManager.setSystemState("Indexing", "Processing file changes...")
	}

	private handleBatchProgress(processed: number, total: number, currentFile?: string): void {
		// Terminal progress can follow the summary; reporting it would erase the final outcome.
		if (total === 0 || processed >= total) return
		this.stateManager.reportFileQueueProgress(
			processed,
			total,
			currentFile ? path.basename(currentFile) : undefined,
		)
	}

	private handleBatchFinished(summary: BatchProcessingSummary): void {
		const errors = summary.processedFiles.filter((file) => file.status === "error" || file.status === "local_error")
		if (!summary.batchError && errors.length === 0) {
			this.stateManager.setSystemState("Indexed", "File changes processed. Index up-to-date.")
			return
		}

		const detail = summary.batchError?.message ?? errors.find((file) => file.error)?.error?.message
		this.stateManager.setSystemState(
			"Error",
			`File changes failed (${errors.length} file errors).${detail ? ` ${detail}` : ""}`,
		)
	}
}
