import type WebSocket from "ws"

import { CodexWebSocketSocket } from "./CodexWebSocketSocket"
import type { CodexWebSocketOptions } from "./protocol"

/** Assembles and owns the services for one authenticated socket. */
export class CodexWebSocketConnectionScope {
	private socketService?: CodexWebSocketSocket

	constructor(
		private readonly url: string,
		private readonly onError: () => void,
		private readonly onClose: () => void,
	) {}

	get socket(): WebSocket {
		if (!this.socketService) throw new Error("Codex WebSocket connection scope is not initialized")
		return this.socketService.socket
	}

	async init(options: CodexWebSocketOptions): Promise<void> {
		if (this.socketService) throw new Error("Codex WebSocket connection scope is already initialized")
		const socketService = new CodexWebSocketSocket(this.url, this.onError, this.onClose)
		this.socketService = socketService
		try {
			await socketService.init(options)
			if (this.socketService !== socketService) throw new Error("Codex WebSocket connection scope was disposed")
		} catch (error) {
			if (this.socketService === socketService) this.dispose()
			throw error
		}
	}

	dispose(): void {
		const socketService = this.socketService
		this.socketService = undefined
		socketService?.dispose()
	}
}
