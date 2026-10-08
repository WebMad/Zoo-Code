import { once } from "node:events"
import WebSocket from "ws"

import { CodexWebSocketUnavailableError } from "./CodexWebSocketUnavailableError"
import { fingerprint, type CodexWebSocketOptions } from "./protocol"

const MAX_CONNECTION_AGE_MS = 55 * 60_000
const IDLE_CONNECTION_TIMEOUT_MS = 120_000
const HANDSHAKE_TIMEOUT_MS = 10_000
const UPGRADE_RETRY_DELAY_MS = 60_000

/** Owns a single authenticated connection and bounds its lifetime between requests. */
export class CodexWebSocketConnection {
	private socket?: WebSocket
	private key?: string
	private unavailableKey?: string
	private unavailableUntil = 0
	private connectedAt = 0
	private idleTimer?: NodeJS.Timeout

	constructor(
		private readonly url: string,
		private readonly resetContinuation: () => void,
	) {}

	async acquire(options: CodexWebSocketOptions): Promise<WebSocket> {
		options.signal.throwIfAborted()
		clearTimeout(this.idleTimer)
		const key = fingerprint(options.headers)
		if (this.unavailableKey === key && Date.now() < this.unavailableUntil) {
			throw new CodexWebSocketUnavailableError("Codex WebSocket unavailable; using HTTP")
		}
		if (
			this.key === key &&
			this.socket?.readyState === WebSocket.OPEN &&
			Date.now() - this.connectedAt < MAX_CONNECTION_AGE_MS
		) {
			return this.socket
		}
		this.close()
		const socket = new WebSocket(this.url, {
			headers: { ...options.headers, "OpenAI-Beta": "responses_websockets=2026-02-06" },
			handshakeTimeout: Math.min(options.timeoutMs, HANDSHAKE_TIMEOUT_MS),
		})
		this.socket = socket
		// Idle errors must never become uncaught EventEmitter errors; stale sockets cannot clear new state.
		socket.on("error", () => {
			if (this.socket === socket) this.resetContinuation()
		})
		socket.on("close", () => {
			if (this.socket === socket) this.close()
		})
		try {
			await once(socket, "open", { signal: options.signal })
		} catch (error) {
			options.signal.throwIfAborted()
			this.unavailableKey = key
			this.unavailableUntil = Date.now() + UPGRADE_RETRY_DELAY_MS
			console.warn("[Codex WebSocket] Upgrade failed; falling back to HTTP")
			throw new CodexWebSocketUnavailableError("Codex WebSocket upgrade failed", { cause: error })
		}
		this.key = key
		this.unavailableKey = undefined
		this.connectedAt = Date.now()
		console.info("[Codex WebSocket] Connected")
		return socket
	}

	release(): void {
		clearTimeout(this.idleTimer)
		this.idleTimer = setTimeout(() => this.close(), IDLE_CONNECTION_TIMEOUT_MS)
		this.idleTimer.unref()
	}

	close(): void {
		clearTimeout(this.idleTimer)
		const socket = this.socket
		this.socket = undefined
		this.key = undefined
		this.resetContinuation()
		socket?.terminate()
	}
}
