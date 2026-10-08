import WebSocket from "ws"

import { CodexWebSocketConnectionScope } from "../scopes/CodexWebSocketConnectionScope"
import { CodexWebSocketUnavailableError } from "../errors/CodexWebSocketUnavailableError"
import type { CodexWebSocketConnectionStateHolder } from "../state-holders/CodexWebSocketConnectionStateHolder"
import type { CodexWebSocketOptions } from "../models/protocol"
import { fingerprint } from "../utils/protocol"

const MAX_CONNECTION_AGE_MS = 55 * 60_000
const IDLE_CONNECTION_TIMEOUT_MS = 120_000
const UPGRADE_RETRY_DELAY_MS = 60_000

/** Owns a single authenticated connection and bounds its lifetime between requests. */
export class CodexWebSocketConnectionManager {
	constructor(
		private readonly url: string,
		private readonly resetContinuation: () => void,
		private readonly stateHolder: CodexWebSocketConnectionStateHolder,
	) {}

	private get state() {
		return this.stateHolder.state
	}

	async acquire(options: CodexWebSocketOptions): Promise<WebSocket> {
		options.signal.throwIfAborted()
		const key = fingerprint(options.headers)
		const state = this.state
		if (state.status === "connecting")
			throw new Error("Concurrent Codex WebSocket connection attempts are not supported")
		if (state.status === "unavailable" && state.key === key && Date.now() < state.retryAt) {
			throw new CodexWebSocketUnavailableError("Codex WebSocket unavailable; using HTTP")
		}
		if (
			(state.status === "active" || state.status === "idle") &&
			state.key === key &&
			state.scope.socketRemoteDataSource.socket.readyState === WebSocket.OPEN &&
			Date.now() - state.connectedAt < MAX_CONNECTION_AGE_MS
		) {
			if (state.status === "idle") clearTimeout(state.idleTimer)
			this.stateHolder.activate(state)
			return state.scope.socketRemoteDataSource.socket
		}
		this.dispose()
		const scope = new CodexWebSocketConnectionScope(
			this.url,
			() => {
				if (this.stateHolder.ownsScope(scope)) this.resetContinuation()
			},
			() => {
				if (!this.stateHolder.ownsScope(scope)) return
				// A connecting attempt publishes its own outcome after init settles.
				if (this.state.status === "connecting") scope.dispose()
				else this.dispose()
			},
		)
		const attempt = this.stateHolder.beginConnection(key, scope)
		try {
			await scope.init(options)
			options.signal.throwIfAborted()
			if (!this.stateHolder.isCurrent(attempt)) throw new Error("Codex WebSocket connection attempt was disposed")
		} catch (error) {
			const current = this.stateHolder.isCurrent(attempt)
			if (current) this.dispose()
			options.signal.throwIfAborted()
			if (!current) throw error
			this.stateHolder.markUnavailable(key, Date.now() + UPGRADE_RETRY_DELAY_MS)
			console.warn("[Codex WebSocket] Upgrade failed; falling back to HTTP")
			throw new CodexWebSocketUnavailableError("Codex WebSocket upgrade failed", { cause: error })
		}
		this.stateHolder.connect(attempt, Date.now())
		console.info("[Codex WebSocket] Connected")
		return scope.socketRemoteDataSource.socket
	}

	release(): void {
		const state = this.state
		if (state.status !== "active" && state.status !== "idle") return
		if (state.status === "idle") clearTimeout(state.idleTimer)
		const idleTimer = setTimeout(() => {
			if (this.stateHolder.isCurrent(idleState)) this.dispose()
		}, IDLE_CONNECTION_TIMEOUT_MS)
		const idleState = this.stateHolder.idle(state, idleTimer)
		idleTimer.unref()
	}

	dispose(): void {
		// Request cleanup must not erase the safe-upgrade-failure cooldown.
		const state = this.stateHolder.disconnect()
		if (state.status === "idle") clearTimeout(state.idleTimer)
		this.resetContinuation()
		if ("scope" in state) state.scope.dispose()
	}
}
