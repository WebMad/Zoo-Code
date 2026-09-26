import * as vscode from "vscode"
import * as path from "path"
import { CodeIndexConfigManager } from "./config-manager"
import { CodeIndexStateManager, IndexingState } from "./state-manager"
import { IFileWatcher, IVectorStore, BatchProcessingSummary } from "./interfaces"
import { DirectoryScanner } from "./processors"
import { CacheManager } from "./cache-manager"
import { CodeIndexScanExecutor } from "./code-index-scan-executor"
import { TelemetryService } from "@roo-code/telemetry"
import { TelemetryEventName } from "@roo-code/types"
import { t } from "../../i18n"

/**
 * Manages the code indexing workflow, coordinating between different services and managers.
 */
export class CodeIndexOrchestrator {
	private _fileWatcherSubscriptions: vscode.Disposable[] = []
	private _isProcessing = false
	private _abortController: AbortController | null = null
	private _indexingFinished: Promise<void> | undefined
	private _isClearing = false
	private readonly scanExecutor: CodeIndexScanExecutor

	constructor(
		private readonly configManager: CodeIndexConfigManager,
		private readonly stateManager: CodeIndexStateManager,
		workspacePath: string,
		private readonly cacheManager: CacheManager,
		private readonly vectorStore: IVectorStore,
		scanner: DirectoryScanner,
		private readonly fileWatcher: IFileWatcher,
	) {
		this.scanExecutor = new CodeIndexScanExecutor(workspacePath, scanner, vectorStore, stateManager)
	}

	/**
	 * Starts the file watcher if not already running.
	 */
	private async _startWatcher(signal: AbortSignal): Promise<void> {
		signal.throwIfAborted()
		if (!this.configManager.isFeatureConfigured) {
			throw new Error("Cannot start watcher: Service not configured.")
		}
		if (this._fileWatcherSubscriptions.length > 0) return

		this.stateManager.setSystemState("Indexing", "Initializing file watcher...")

		try {
			await this.fileWatcher.initialize()
			signal.throwIfAborted()

			this._fileWatcherSubscriptions = [
				this.fileWatcher.onBatchProgressUpdate((progress) => this._handleBatchProgress(progress)),
				this.fileWatcher.onDidFinishBatchProcessing((summary) => this._handleBatchFinished(summary)),
			]
		} catch (error) {
			if (this._isCancellation(error, signal)) {
				throw error
			}
			this._reportError("[CodeIndexOrchestrator] Failed to start file watcher:", error, "_startWatcher")
			throw error
		}
	}

	private _handleBatchProgress({
		processedInBatch,
		totalInBatch,
		currentFile,
	}: {
		processedInBatch: number
		totalInBatch: number
		currentFile?: string
	}): void {
		if (processedInBatch < totalInBatch && this.stateManager.state !== "Indexing") {
			this.stateManager.setSystemState("Indexing", "Processing file changes...")
		}
		this.stateManager.reportFileQueueProgress(
			processedInBatch,
			totalInBatch,
			currentFile ? path.basename(currentFile) : undefined,
		)
	}

	private _handleBatchFinished(summary: BatchProcessingSummary): void {
		if (summary.batchError) {
			console.error("[CodeIndexOrchestrator] Batch processing failed:", summary.batchError)
			this.stateManager.setSystemState("Error", summary.batchError.message)
			return
		}
		const failedFile = summary.processedFiles.find(
			(file) => file.status === "error" || file.status === "local_error",
		)
		if (failedFile) {
			this.stateManager.setSystemState(
				"Error",
				failedFile.error?.message ?? `Failed to index file: ${failedFile.path}`,
			)
			return
		}
		this.stateManager.setSystemState("Indexed", "File changes processed. Index up-to-date.")
	}

	/**
	 * Checks start preconditions and reports why a request was rejected.
	 */
	private _canStartIndexing(): boolean {
		if (this._isClearing) {
			return false
		}

		// Check if workspace is available first
		if (!vscode.workspace.workspaceFolders?.length) {
			this.stateManager.setSystemState("Error", t("embeddings:orchestrator.indexingRequiresWorkspace"))
			console.warn("[CodeIndexOrchestrator] Start rejected: No workspace folder open.")
			return false
		}

		if (!this.configManager.isFeatureConfigured) {
			this.stateManager.setSystemState("Standby", "Missing configuration. Save your settings to start indexing.")
			console.warn("[CodeIndexOrchestrator] Start rejected: Missing configuration.")
			return false
		}

		if (this._isProcessing || !["Standby", "Error", "Indexed"].includes(this.stateManager.state)) {
			console.warn(
				`[CodeIndexOrchestrator] Start rejected: Already processing or in state ${this.stateManager.state}.`,
			)
			return false
		}

		return true
	}

	/** Runs a scan and starts watching files, retaining ownership until cleanup finishes. */
	public async startIndexing(): Promise<void> {
		if (!this._canStartIndexing()) return

		this._isProcessing = true
		let finishIndexing!: () => void
		this._indexingFinished = new Promise<void>((resolve) => {
			finishIndexing = resolve
		})
		this._abortController = new AbortController()
		const signal = this._abortController.signal
		this.stateManager.setSystemState("Indexing", "Initializing services...")

		// Destructive cleanup is only allowed after selecting a full scan.
		let fullScanStarted = false

		try {
			const collectionCreated = await this.vectorStore.initialize()

			if (collectionCreated) {
				await this.cacheManager.clearCacheFile()
			}

			// Existing data can be updated incrementally using the cache.
			const hasExistingData = await this.vectorStore.hasIndexedData()

			if (hasExistingData && !collectionCreated) {
				await this.scanExecutor.runIncrementalScan(signal)
			} else {
				fullScanStarted = true
				await this.scanExecutor.runFullScan(signal)
			}
			await this._completeIndexing(signal)
		} catch (error) {
			await this._handleIndexingError(error, signal, fullScanStarted)
		} finally {
			this._isProcessing = false
			this._abortController = null
			this._indexingFinished = undefined
			finishIndexing()
		}
	}

	private async _handleIndexingError(error: unknown, signal: AbortSignal, clearIndexOnError: boolean): Promise<void> {
		if (this._isCancellation(error, signal)) {
			await this._finishCancellation()
			return
		}

		this._reportError("[CodeIndexOrchestrator] Error during indexing:", error, "startIndexing")
		if (clearIndexOnError) {
			await this._cleanupFailedFullScan()
		} else {
			console.log("[CodeIndexOrchestrator] Preserving existing index and cache for a future incremental scan.")
		}

		const errorMessage =
			typeof error === "object" && error !== null && "message" in error && error.message
				? error.message
				: t("embeddings:orchestrator.unknownError")
		this.stateManager.setSystemState(
			"Error",
			t("embeddings:orchestrator.failedDuringInitialScan", { errorMessage }),
		)
		this.stopWatcher()
	}

	private _reportError(message: string, error: unknown, location: string): void {
		console.error(message, error)
		TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
			location,
		})
	}

	private _isCancellation(error: unknown, signal: AbortSignal): boolean {
		return (
			signal.aborted ||
			(typeof error === "object" && error !== null && "name" in error && error.name === "AbortError")
		)
	}

	private async _finishCancellation(): Promise<void> {
		console.log("[CodeIndexOrchestrator] Indexing aborted by user.")
		try {
			await this.cacheManager.flush()
		} catch (flushError) {
			console.error("[CodeIndexOrchestrator] Failed to flush cache after cancellation:", flushError)
		}
		this.stopWatcher()
		this.stateManager.setSystemState("Standby", t("embeddings:orchestrator.indexingStopped"))
	}

	private async _cleanupFailedFullScan(): Promise<void> {
		try {
			await this.vectorStore.clearCollection()
		} catch (cleanupError) {
			this._reportError(
				"[CodeIndexOrchestrator] Failed to clean up after error:",
				cleanupError,
				"startIndexing.cleanup",
			)
		}
		try {
			await this.cacheManager.clearCacheFile()
		} catch (cleanupError) {
			console.error("[CodeIndexOrchestrator] Failed to clear cache after indexing error:", cleanupError)
		}
		console.log("[CodeIndexOrchestrator] Indexing failed after starting. Clearing cache to avoid inconsistency.")
	}

	private async _completeIndexing(signal: AbortSignal): Promise<void> {
		await this._startWatcher(signal)
		signal.throwIfAborted()
		await this.vectorStore.markIndexingComplete()
		if (signal.aborted) {
			await this.vectorStore.markIndexingIncomplete()
		}
		signal.throwIfAborted()

		this.stateManager.setSystemState("Indexed", t("embeddings:orchestrator.fileWatcherStarted"))
	}

	/**
	 * Stops any in-progress indexing by aborting the scan and stopping the file watcher.
	 */
	public stopIndexing(): void {
		if (this._abortController) {
			this.stateManager.setSystemState("Stopping", t("embeddings:orchestrator.indexingStoppedPartial"))
			this._abortController.abort()
			this._abortController = null
		}
		this.stopWatcher()
	}

	/**
	 * Stops the file watcher and cleans up resources.
	 */
	public stopWatcher(): void {
		this.fileWatcher.dispose()
		this._fileWatcherSubscriptions.forEach((sub) => sub.dispose())
		this._fileWatcherSubscriptions = []

		if (!["Error", "Stopping"].includes(this.stateManager.state)) {
			this.stateManager.setSystemState("Standby", t("embeddings:orchestrator.fileWatcherStopped"))
		}
	}

	/**
	 * Clears all index data by stopping indexing, clearing the vector store,
	 * and resetting the cache file.
	 */
	public async clearIndexData(): Promise<void> {
		if (this._isClearing) {
			return
		}
		this._isClearing = true

		try {
			this.stopIndexing()
			await this._indexingFinished
			// A scan may have been starting the watcher when cancellation was requested.
			this.stopWatcher()

			if (this.configManager.isFeatureConfigured) {
				await this.vectorStore.deleteCollection()
			} else {
				console.warn("[CodeIndexOrchestrator] Service not configured, skipping vector collection clear.")
			}

			await this.cacheManager.clearCacheFile()
			this.stateManager.setSystemState("Standby", "Index data cleared successfully.")
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			this._reportError("[CodeIndexOrchestrator] Failed to clear index data:", error, "clearIndexData")
			this.stateManager.setSystemState("Error", `Failed to clear index data: ${message}`)
		} finally {
			this._isClearing = false
		}
	}

	/**
	 * Gets the current state of the indexing system.
	 */
	public get state(): IndexingState {
		return this.stateManager.state
	}
}
