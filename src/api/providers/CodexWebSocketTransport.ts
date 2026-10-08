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
	private requestScope?: CodexWebSocketRequestScope

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
	async dispose(): Promise<void> {
		const scope = this.requestScope
		this.requestScope = undefined
		this.connection.dispose()
		await scope?.dispose()
	}

	async *stream(body: unknown, options: CodexWebSocketOptions): AsyncGenerator<CodexResponseEvent> {
		if (this.busy) throw new Error("Concurrent requests on a Codex WebSocket are not supported")
		options.signal.throwIfAborted()
		const scope = new CodexWebSocketRequestScope(options, () => {
			void this.dispose()
		})
		let response: CodexWebSocketResponse | undefined
		this.busy = true
		this.requestScope = scope
		try {
			await scope.init(this.connection)
			const prepared = this.continuation.prepare(body)
			response = new CodexWebSocketResponse(this.continuation, prepared)
			yield* this.readResponse(prepared, options.headers, scope, response)
		} catch (error) {
			if (scope.signal.aborted) throw scope.signal.reason
			throw error
		} finally {
			await scope.dispose()
			if (this.requestScope === scope) this.requestScope = undefined
			this.busy = false
			if (!response?.completed || scope.signal.aborted) await this.dispose()
			else this.connection.release()
		}
	}

	private async *readResponse(
		prepared: PreparedCodexRequest,
		headers: Record<string, string>,
		scope: CodexWebSocketRequestScope,
		response: CodexWebSocketResponse,
	): AsyncGenerator<CodexResponseEvent> {
		scope.refreshTimeout()
		this.send(scope.socket, prepared, headers, prepared.fullContextReason === undefined)
		for await (const [data] of scope.events) {
			scope.refreshTimeout()
			const event = parseResponseEvent(String(data))
			if (response.accept(event) === "retry") {
				this.send(scope.socket, prepared, headers, false, "server cache miss")
				continue
			}
			if (response.completed) scope.clearTimeout()
			yield event
			if (response.completed) return
		}
		throw new Error("Codex WebSocket closed before response completed; retry the request")
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
