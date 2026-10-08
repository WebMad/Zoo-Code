import WebSocket from "ws"

import { CodexWebSocketConnectionScope } from "./CodexWebSocketConnectionScope"
import { CodexWebSocketUnavailableError } from "./CodexWebSocketUnavailableError"
import { fingerprint, type CodexWebSocketOptions } from "./protocol"

const MAX_CONNECTION_AGE_MS = 55 * 60_000
const IDLE_CONNECTION_TIMEOUT_MS = 120_000
const UPGRADE_RETRY_DELAY_MS = 60_000

/** Owns a single authenticated connection and bounds its lifetime between requests. */
export class CodexWebSocketConnection {
	private scope?: CodexWebSocketConnectionScope
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
		this.idleTimer = undefined
		const key = fingerprint(options.headers)
		if (this.unavailableKey === key && Date.now() < this.unavailableUntil) {
			throw new CodexWebSocketUnavailableError("Codex WebSocket unavailable; using HTTP")
		}
		if (
			this.key === key &&
			this.scope?.socket.readyState === WebSocket.OPEN &&
			Date.now() - this.connectedAt < MAX_CONNECTION_AGE_MS
		) {
			return this.scope.socket
		}
		this.dispose()
		const scope = new CodexWebSocketConnectionScope(
			this.url,
			() => {
				if (this.scope === scope) this.resetContinuation()
			},
			() => {
				if (this.scope === scope) this.dispose()
			},
		)
		this.scope = scope
		try {
			await scope.init(options)
		} catch (error) {
			if (this.scope === scope) this.dispose()
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
		return scope.socket
	}

	release(): void {
		if (!this.scope) return
		clearTimeout(this.idleTimer)
		this.idleTimer = setTimeout(() => this.dispose(), IDLE_CONNECTION_TIMEOUT_MS)
		this.idleTimer.unref()
	}

	dispose(): void {
		clearTimeout(this.idleTimer)
		this.idleTimer = undefined
		const scope = this.scope
		this.scope = undefined
		this.key = undefined
		this.resetContinuation()
		scope?.dispose()
	}
}
