import WebSocket from "ws"

import { CodexWebSocketConnection } from "../CodexWebSocketConnection"
import { CodexWebSocketConnectionScope } from "../CodexWebSocketConnectionScope"
import { CodexWebSocketRequestScope } from "../CodexWebSocketRequestScope"
import { CodexWebSocketUnavailableError } from "../CodexWebSocketUnavailableError"
import type { CodexWebSocketOptions } from "../protocol"

const { sockets } = vi.hoisted(() => ({ sockets: [] as WebSocket[] }))

vi.mock("ws", async () => {
	const { EventEmitter } = await import("node:events")
	class MockWebSocket extends EventEmitter {
		static readonly CONNECTING = 0
		static readonly OPEN = 1
		static readonly CLOSING = 2
		static readonly CLOSED = 3
		readyState = MockWebSocket.CONNECTING

		constructor() {
			super()
			// The mock implements the socket surface used by these scopes, not all of ws.
			sockets.push(this as unknown as WebSocket)
		}

		override emit(event: string | symbol, ...args: unknown[]): boolean {
			if (event === "open") this.readyState = MockWebSocket.OPEN
			if (event === "close") this.readyState = MockWebSocket.CLOSED
			return super.emit(event, ...args)
		}

		terminate = vi.fn(() => {
			const connecting = this.readyState === MockWebSocket.CONNECTING
			this.readyState = MockWebSocket.CLOSING
			queueMicrotask(() => {
				if (connecting) this.emit("error", new Error("WebSocket closed before the connection was established"))
				this.emit("close")
			})
		})
	}
	return { default: MockWebSocket }
})

describe("Codex WebSocket scopes", () => {
	const resources: { dispose(): void | Promise<void> }[] = []
	let controller: AbortController
	let options: CodexWebSocketOptions
	let reset = vi.fn<() => void>()
	let connection: CodexWebSocketConnection

	const own = <T extends { dispose(): void | Promise<void> }>(resource: T): T => {
		resources.push(resource)
		return resource
	}
	const lastSocket = (): WebSocket => {
		const socket = sockets.at(-1)
		if (!socket) throw new Error("No test socket was created")
		return socket
	}
	const expectNoListeners = (socket: WebSocket) => {
		expect(socket.eventNames()).toEqual([])
	}

	beforeEach(() => {
		sockets.length = 0
		controller = new AbortController()
		options = { headers: { Authorization: "Bearer test-token" }, signal: controller.signal, timeoutMs: 2_000 }
		reset = vi.fn()
		connection = own(new CodexWebSocketConnection("ws://test/responses", reset))
	})

	afterEach(async () => {
		for (const resource of resources.splice(0).reverse()) await resource.dispose()
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it("does not create sockets, subscriptions, or timers in constructors", async () => {
		vi.useFakeTimers()
		const addListener = vi.spyOn(AbortSignal.prototype, "addEventListener")
		const onAbort = vi.fn()
		const scope = own(new CodexWebSocketConnectionScope("ws://test/responses", vi.fn(), vi.fn()))
		const request = own(new CodexWebSocketRequestScope(options, onAbort))
		expect(sockets).toHaveLength(0)
		expect(addListener).not.toHaveBeenCalled()
		expect(vi.getTimerCount()).toBe(0)
		expect(() => scope.socket).toThrow("not initialized")
		expect(() => request.socket).toThrow("not initialized")
		expect(() => request.events).toThrow("not initialized")
		expect(() => request.refreshTimeout()).toThrow("not initialized")
		scope.dispose()
		await request.dispose()
		controller.abort()
		expect(onAbort).not.toHaveBeenCalled()
	})

	it("creates the connection on init and removes its subscriptions on disposal", async () => {
		const onError = vi.fn()
		const onClose = vi.fn()
		const scope = own(new CodexWebSocketConnectionScope("ws://test/responses", onError, onClose))
		const initialized = scope.init(options)
		const socket = lastSocket()
		socket.emit("open")
		await initialized
		expect(scope.socket).toBe(socket)
		await expect(scope.init(options)).rejects.toThrow("already initialized")
		socket.emit("error", new Error("Idle error"))
		expect(onError).toHaveBeenCalledOnce()
		scope.dispose()
		scope.dispose()
		expect(socket.terminate).toHaveBeenCalledOnce()
		expect(() => scope.socket).toThrow("not initialized")
		await Promise.resolve()
		expect(onClose).not.toHaveBeenCalled()
		expectNoListeners(socket)
	})

	it("safely disposes an in-flight upgrade without retaining listeners", async () => {
		const onError = vi.fn()
		const onClose = vi.fn()
		const scope = own(new CodexWebSocketConnectionScope("ws://test/responses", onError, onClose))
		const initialized = expect(scope.init(options)).rejects.toThrow("before the connection was established")
		const socket = lastSocket()
		scope.dispose()
		await initialized
		expect(onError).not.toHaveBeenCalled()
		expect(onClose).not.toHaveBeenCalled()
		expectNoListeners(socket)
	})

	it("removes subscriptions from an already-closed socket", async () => {
		const onClose = vi.fn()
		const scope = own(new CodexWebSocketConnectionScope("ws://test/responses", vi.fn(), onClose))
		const initialized = scope.init(options)
		const socket = lastSocket()
		socket.emit("open")
		await initialized
		socket.emit("close")
		expect(onClose).toHaveBeenCalledOnce()
		scope.dispose()
		expect(socket.terminate).not.toHaveBeenCalled()
		expectNoListeners(socket)
	})

	it("can initialize again after disposal without stale callbacks affecting the new socket", async () => {
		const onError = vi.fn()
		const onClose = vi.fn()
		const scope = own(new CodexWebSocketConnectionScope("ws://test/responses", onError, onClose))
		const firstInit = scope.init(options)
		const first = lastSocket()
		first.emit("open")
		await firstInit
		scope.dispose()
		const nextInit = scope.init(options)
		const next = lastSocket()
		first.emit("error", new Error("Stale error"))
		next.emit("open")
		await nextInit
		expectNoListeners(first)
		expect(onError).not.toHaveBeenCalled()
		expect(onClose).not.toHaveBeenCalled()
		expect(scope.socket).toBe(next)
	})

	it("does not open a connection for an already-aborted request", async () => {
		controller.abort(new Error("Stopped"))
		const scope = own(new CodexWebSocketConnectionScope("ws://test/responses", vi.fn(), vi.fn()))
		const request = own(new CodexWebSocketRequestScope(options, vi.fn()))
		await expect(scope.init(options)).rejects.toThrow("Stopped")
		await expect(request.init(connection)).rejects.toThrow("Stopped")
		expect(sockets).toHaveLength(0)
	})

	it("owns request subscriptions and deadlines without disposing the reusable connection", async () => {
		vi.useFakeTimers()
		const onAbort = vi.fn()
		const request = own(new CodexWebSocketRequestScope(options, onAbort))
		const initialized = request.init(connection)
		const socket = lastSocket()
		socket.emit("open")
		await initialized
		expect(request.socket).toBe(socket)
		expect(socket.listenerCount("message")).toBe(1)
		await expect(request.init(connection)).rejects.toThrow("already initialized")
		request.refreshTimeout()
		request.refreshTimeout()
		expect(vi.getTimerCount()).toBe(1)
		await request.dispose()
		await request.dispose()
		expect(vi.getTimerCount()).toBe(0)
		expect(socket.listenerCount("message")).toBe(0)
		expect(socket.listenerCount("error")).toBe(1)
		expect(socket.listenerCount("close")).toBe(1)
		expect(socket.terminate).not.toHaveBeenCalled()
		controller.abort()
		expect(onAbort).not.toHaveBeenCalled()
	})

	it("can reinitialize a disposed request on the same connection without duplicate listeners", async () => {
		const request = own(new CodexWebSocketRequestScope(options, () => connection.dispose()))
		const initialized = request.init(connection)
		const socket = lastSocket()
		socket.emit("open")
		await initialized
		await request.dispose()
		await request.init(connection)
		expect(sockets).toHaveLength(1)
		expect(socket.listenerCount("message")).toBe(1)
		const event = request.events.next()
		const reason = new Error("Stopped")
		controller.abort(reason)
		await expect(event).rejects.toThrow()
		expect(request.signal.reason).toBe(reason)
		await request.dispose()
		expectNoListeners(socket)
	})

	it("cleans up a rejected upgrade and preserves the safe HTTP fallback error", async () => {
		const onAbort = vi.fn()
		const request = own(new CodexWebSocketRequestScope(options, onAbort))
		const initialized = expect(request.init(connection)).rejects.toBeInstanceOf(CodexWebSocketUnavailableError)
		const socket = lastSocket()
		socket.emit("error", new Error("Upgrade rejected"))
		await initialized
		expect(request.signal.aborted).toBe(false)
		expectNoListeners(socket)
		controller.abort()
		expect(onAbort).not.toHaveBeenCalled()
	})

	it("cancels and cleans up a request disposed during initialization", async () => {
		const request = own(new CodexWebSocketRequestScope(options, () => connection.dispose()))
		const initialized = expect(request.init(connection)).rejects.toThrow()
		const socket = lastSocket()
		await request.dispose()
		await initialized
		expectNoListeners(socket)
		expect(() => request.socket).toThrow("not initialized")
		expect(() => request.events).toThrow("not initialized")
	})

	it("does not become initialized if disposed after acquiring a socket but before init resolves", async () => {
		const socket = new WebSocket("ws://test/responses")
		socket.emit("open")
		vi.spyOn(connection, "acquire").mockResolvedValue(socket)
		const request = own(new CodexWebSocketRequestScope(options, vi.fn()))
		const initialized = expect(request.init(connection)).rejects.toThrow("scope was disposed")
		await Promise.resolve()
		await request.dispose()
		await initialized
		expectNoListeners(socket)
		expect(() => request.socket).toThrow("not initialized")
		expect(() => request.events).toThrow("not initialized")
	})

	it("clears an idle connection timer on disposal and does not schedule one without a socket", async () => {
		vi.useFakeTimers()
		connection.release()
		expect(vi.getTimerCount()).toBe(0)
		const acquired = connection.acquire(options)
		const socket = lastSocket()
		socket.emit("open")
		await acquired
		connection.release()
		connection.release()
		expect(vi.getTimerCount()).toBe(1)
		connection.dispose()
		expect(vi.getTimerCount()).toBe(0)
		await Promise.resolve()
		expectNoListeners(socket)
	})
})
