import type WebSocket from "ws"

import type { CodexWebSocketConnection } from "./CodexWebSocketConnection"
import { CodexWebSocketRequest } from "./CodexWebSocketRequest"
import type { CodexWebSocketOptions } from "./protocol"

/** Assembles and owns request-local services without owning the reusable connection. */
export class CodexWebSocketRequestScope {
	private request?: CodexWebSocketRequest
	private requestSignal?: AbortSignal
	private initializing = false

	constructor(
		private readonly options: CodexWebSocketOptions,
		private readonly onAbort: () => void,
	) {}

	get signal(): AbortSignal {
		return this.request?.signal ?? this.requestSignal ?? this.options.signal
	}

	get socket(): WebSocket {
		return this.getRequest().socket
	}

	get events(): AsyncIterableIterator<unknown[]> {
		return this.getRequest().events
	}

	async init(connection: CodexWebSocketConnection): Promise<void> {
		if (this.request || this.initializing) {
			throw new Error("Codex WebSocket request scope is already initialized")
		}
		const request = new CodexWebSocketRequest(this.options, this.onAbort)
		this.request = request
		this.initializing = true
		try {
			await request.init(connection)
			if (this.request !== request) throw new Error("Codex WebSocket request scope was disposed")
		} catch (error) {
			if (this.request === request) await this.dispose()
			throw error
		} finally {
			this.initializing = false
		}
	}

	refreshTimeout(): void {
		this.getRequest().refreshTimeout()
	}

	clearTimeout(): void {
		this.request?.clearTimeout()
	}

	async dispose(): Promise<void> {
		const request = this.request
		this.request = undefined
		if (request) this.requestSignal = request.signal
		await request?.dispose()
	}

	private getRequest(): CodexWebSocketRequest {
		if (this.initializing || !this.request) throw new Error("Codex WebSocket request scope is not initialized")
		return this.request
	}
}
