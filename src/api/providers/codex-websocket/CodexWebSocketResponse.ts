import { CodexWebSocketContinuation } from "./CodexWebSocketContinuation"
import type { PreparedCodexRequest } from "./PreparedCodexRequest"
import { asJsonObject, responseError, type CodexResponseEvent } from "./protocol"

/** Tracks response completion and the one safe cache-miss recovery, independently of socket IO. */
export class CodexWebSocketResponse {
	private received = false
	private recovered = false
	private readonly output: unknown[] = []
	private finished = false

	constructor(
		private readonly continuation: CodexWebSocketContinuation,
		private readonly prepared: PreparedCodexRequest,
	) {}

	get completed(): boolean {
		return this.finished
	}

	accept(event: CodexResponseEvent): "emit" | "retry" {
		if (event.type === "error") return this.handleError(event)
		if (event.type === "response.failed" || event.type === "response.incomplete") throw responseError(event)
		this.received = true
		if (event.type === "response.output_item.done") this.output.push(event.item)
		if (event.type === "response.completed" || event.type === "response.done") {
			this.continuation.record(this.prepared, asJsonObject(event.response), this.output)
			this.finished = true
		}
		return "emit"
	}

	private handleError(event: CodexResponseEvent): "retry" {
		const error = asJsonObject(event.error)
		const canRecover =
			error.code === "previous_response_not_found" &&
			this.prepared.fullContextReason === undefined &&
			!this.received &&
			!this.recovered
		if (!canRecover) throw responseError(event)
		this.recovered = true
		this.continuation.reset()
		return "retry"
	}
}
