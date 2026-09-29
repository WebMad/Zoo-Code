import type { FileWatcherEvent } from "../interfaces/file-watcher-event"

/** Owns pending filesystem events and their debounce timer, not in-flight batch work. */
export class FileEventAccumulator {
	private readonly events = new Map<string, FileWatcherEvent>()
	private timer?: ReturnType<typeof setTimeout>

	constructor(
		private readonly onBatch: (events: Map<string, FileWatcherEvent>) => void,
		private readonly debounceDelayMs = 500,
	) {}

	get hasPendingEvents(): boolean {
		return this.events.size > 0
	}

	add(event: FileWatcherEvent): void {
		this.events.set(event.uri.fsPath, event)
		if (this.timer !== undefined) clearTimeout(this.timer)
		this.timer = setTimeout(() => this.flush(), this.debounceDelayMs)
	}

	dispose(): void {
		if (this.timer !== undefined) clearTimeout(this.timer)
		this.timer = undefined
		this.events.clear()
	}

	private flush(): void {
		this.timer = undefined
		const batch = new Map(this.events)
		this.events.clear()
		// Detach pending events before delivery; do not serialize or await batch execution.
		this.onBatch(batch)
	}
}
