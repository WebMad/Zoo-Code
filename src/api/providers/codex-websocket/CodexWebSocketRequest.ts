import { on } from "node:events"
import type WebSocket from "ws"

import type { CodexWebSocketConnection } from "./CodexWebSocketConnection"
import type { CodexWebSocketOptions } from "./protocol"

/** Owns cancellation, the inactivity timer, and response subscriptions for a single request. */
export class CodexWebSocketRequest {
	private controller?: AbortController
	private requestSignal?: AbortSignal
	private _socket?: WebSocket
	private _events?: AsyncIterableIterator<unknown[]>
	private timeout?: NodeJS.Timeout
	private initialized = false
	private initializing = false

	constructor(
		private readonly options: CodexWebSocketOptions,
		private readonly onAbort: () => void,
	) {}

	get signal(): AbortSignal {
		return this.requestSignal ?? this.options.signal
	}

	get socket(): WebSocket {
		if (!this._socket) throw new Error("Codex WebSocket request scope is not initialized")
		return this._socket
	}

	get events(): AsyncIterableIterator<unknown[]> {
		if (!this._events) throw new Error("Codex WebSocket request scope is not initialized")
		return this._events
	}

	async init(connection: CodexWebSocketConnection): Promise<void> {
		if (this.initialized || this.initializing) {
			throw new Error("Codex WebSocket request scope is already initialized")
		}
		this.options.signal.throwIfAborted()
		this.initialized = true
		this.initializing = true
		this.controller = new AbortController()
		this.requestSignal = AbortSignal.any([this.options.signal, this.controller.signal])
		this.signal.addEventListener("abort", this.onAbort, { once: true })
		try {
			this._socket = await connection.acquire({ ...this.options, signal: this.signal })
			this.signal.throwIfAborted()
			// Register before sending so a fast reply cannot be lost.
			this._events = on(this._socket, "message", { signal: this.signal, close: ["close"] })
		} catch (error) {
			await this.disposeResources()
			throw error
		} finally {
			this.initializing = false
		}
	}

	refreshTimeout(): void {
		if (!this._events) throw new Error("Codex WebSocket request scope is not initialized")
		this.clearTimeout()
		this.timeout = setTimeout(
			() => this.controller?.abort(new Error("Codex WebSocket stream timed out")),
			this.options.timeoutMs,
		)
	}

	clearTimeout(): void {
		clearTimeout(this.timeout)
		this.timeout = undefined
	}

	async dispose(): Promise<void> {
		if (this.initializing) this.controller?.abort(new Error("Codex WebSocket request scope was disposed"))
		await this.disposeResources()
	}

	private async disposeResources(): Promise<void> {
		this.clearTimeout()
		this.signal.removeEventListener("abort", this.onAbort)
		const events = this._events
		this._events = undefined
		this._socket = undefined
		this.initialized = false
		await events?.return?.()
	}
}
