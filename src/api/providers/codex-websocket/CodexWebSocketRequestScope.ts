import type { CodexWebSocketOptions } from "./protocol"

/** Owns cancellation and the inactivity timer for a single request. */
export class CodexWebSocketRequestScope {
	readonly signal: AbortSignal
	private readonly controller = new AbortController()
	private timeout?: NodeJS.Timeout

	constructor(
		private readonly options: CodexWebSocketOptions,
		private readonly onAbort: () => void,
	) {
		this.signal = AbortSignal.any([options.signal, this.controller.signal])
		this.signal.addEventListener("abort", onAbort, { once: true })
	}

	refreshTimeout(): void {
		this.clearTimeout()
		this.timeout = setTimeout(
			() => this.controller.abort(new Error("Codex WebSocket stream timed out")),
			this.options.timeoutMs,
		)
	}

	clearTimeout(): void {
		clearTimeout(this.timeout)
		this.timeout = undefined
	}

	dispose(): void {
		this.clearTimeout()
		this.signal.removeEventListener("abort", this.onAbort)
	}
}
