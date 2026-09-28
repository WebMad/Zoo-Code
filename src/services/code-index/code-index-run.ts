import { StateHolder, StateStream } from "../../utils/StateHolder"

export type CodeIndexScanMode = "incremental" | "full"
export type CodeIndexRunState = "running" | "cancelling" | "finished"

/** Owns cancellation and completion for one indexing attempt, including its cleanup. */
export class CodeIndexRun {
	private startedScanMode: CodeIndexScanMode | undefined

	constructor(
		private readonly controller: AbortController,
		private readonly codeIndexRunStateHolder: StateHolder<CodeIndexRunState>,
	) {}

	get state(): StateStream<CodeIndexRunState> {
		return this.codeIndexRunStateHolder
	}

	get signal(): AbortSignal {
		return this.controller.signal
	}

	get fullScanStarted(): boolean {
		return this.startedScanMode === "full"
	}

	/** Record this immediately before invoking the scanner, not during preparation. */
	markScanStarted(mode: CodeIndexScanMode): void {
		this.startedScanMode = mode
	}

	/** Cancellation does not notify completion listeners; cleanup still belongs to this run. */
	cancel(): void {
		if (this.codeIndexRunStateHolder.value !== "running") return
		this.codeIndexRunStateHolder.set("cancelling")
		this.controller.abort()
	}

	async waitUntilFinished(): Promise<void> {
		await this.codeIndexRunStateHolder.waitFor((state) => state === "finished")
	}

	finish(): void {
		this.codeIndexRunStateHolder.set("finished")
	}
}
