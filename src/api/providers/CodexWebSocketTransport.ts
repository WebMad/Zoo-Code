import { on } from "node:events"
import type WebSocket from "ws"

import { CodexWebSocketConnection } from "./codex-websocket/CodexWebSocketConnection"
import { CodexWebSocketContinuation } from "./codex-websocket/CodexWebSocketContinuation"
import type { PreparedCodexRequest } from "./codex-websocket/PreparedCodexRequest"
import {
	asJsonObject,
	parseResponseEvent,
	type CodexResponseEvent,
	type CodexWebSocketOptions,
} from "./codex-websocket/protocol"
import { CodexWebSocketRequestScope } from "./codex-websocket/CodexWebSocketRequestScope"
import { CodexWebSocketResponse } from "./codex-websocket/CodexWebSocketResponse"

export { CodexWebSocketUnavailableError } from "./codex-websocket/CodexWebSocketUnavailableError"

const CODEX_WEBSOCKET_URL = "wss://chatgpt.com/backend-api/codex/responses"

/** Task-local Responses transport. Connection and history management are independent of provider event handling. */
export class CodexWebSocketTransport {
	private busy = false

	constructor(
		private readonly connection: CodexWebSocketConnection,
		private readonly continuation: CodexWebSocketContinuation,
	) {}

	static create(url = CODEX_WEBSOCKET_URL): CodexWebSocketTransport {
		const continuation = new CodexWebSocketContinuation()
		const connection = new CodexWebSocketConnection(url, () => continuation.reset())
		return new CodexWebSocketTransport(connection, continuation)
	}

	resetContinuation(): void {
		this.continuation.reset()
	}
	close(): void {
		this.connection.close()
	}

	async *stream(body: unknown, options: CodexWebSocketOptions): AsyncGenerator<CodexResponseEvent> {
		if (this.busy) throw new Error("Concurrent requests on a Codex WebSocket are not supported")
		options.signal.throwIfAborted()
		const scope = new CodexWebSocketRequestScope(options, () => this.close())
		let response: CodexWebSocketResponse | undefined
		this.busy = true
		try {
			const socket = await this.connection.acquire({ ...options, signal: scope.signal })
			const prepared = this.continuation.prepare(body)
			response = new CodexWebSocketResponse(this.continuation, prepared)
			yield* this.readResponse(socket, prepared, options.headers, scope, response)
		} catch (error) {
			if (scope.signal.aborted) throw scope.signal.reason
			throw error
		} finally {
			scope.dispose()
			this.busy = false
			if (!response?.completed || scope.signal.aborted) this.close()
			else this.connection.release()
		}
	}

	private async *readResponse(
		socket: WebSocket,
		prepared: PreparedCodexRequest,
		headers: Record<string, string>,
		scope: CodexWebSocketRequestScope,
		response: CodexWebSocketResponse,
	): AsyncGenerator<CodexResponseEvent> {
		// Register before sending so a fast reply cannot be lost.
		const events = on(socket, "message", { signal: scope.signal, close: ["close"] })
		try {
			scope.refreshTimeout()
			this.send(socket, prepared, headers, prepared.fullContextReason === undefined)
			for await (const [data] of events) {
				scope.refreshTimeout()
				const event = parseResponseEvent(String(data))
				if (response.accept(event) === "retry") {
					this.send(socket, prepared, headers, false, "server cache miss")
					continue
				}
				if (response.completed) scope.clearTimeout()
				yield event
				if (response.completed) return
			}
			throw new Error("Codex WebSocket closed before response completed; retry the request")
		} finally {
			await events.return?.()
		}
	}

	private send(
		socket: WebSocket,
		prepared: PreparedCodexRequest,
		headers: Record<string, string>,
		incremental: boolean,
		reason = prepared.fullContextReason,
	): void {
		const { request, input, previousResponseId, offset } = prepared
		const nextInput = incremental ? input.slice(offset) : input
		const clientMetadata = {
			...(request.client_metadata ? asJsonObject(request.client_metadata) : {}),
			...(headers["x-openai-internal-codex-responses-lite"] === "true"
				? { ws_request_header_x_openai_internal_codex_responses_lite: "true" }
				: {}),
		}
		console.info(
			`[Codex WebSocket] Sending ${incremental ? "incremental" : "full"} context` +
				` (${nextInput.length}/${input.length} input items${incremental ? "" : `; reason: ${reason}`})`,
		)
		socket.send(
			JSON.stringify({
				...request,
				type: "response.create",
				client_metadata: clientMetadata,
				previous_response_id: incremental ? previousResponseId : undefined,
				input: nextInput,
			}),
		)
	}
}
