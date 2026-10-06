import * as vscode from "vscode"
import type { WebviewMessage } from "@roo-code/types"

import type { ClineProvider } from "../ClineProvider"
import { WebviewFocusTracker } from "../WebviewFocusTracker"
import { makeCompositeDisposable, makeEventEmitter } from "../../../test-utils/vscode"

vi.mock("vscode", () => ({ Disposable: { from: vi.fn() } }))

function createView() {
	const messages = makeEventEmitter<WebviewMessage>()
	const disposed = makeEventEmitter<void>()
	const view = {
		webview: { onDidReceiveMessage: vi.fn(messages.event) },
		onDidDispose: vi.fn(disposed.event),
	}
	return { view, messages, disposed }
}

describe("WebviewFocusTracker", () => {
	let tracker: WebviewFocusTracker
	let provider: ClineProvider

	beforeEach(() => {
		vi.mocked(vscode.Disposable.from).mockImplementation(makeCompositeDisposable)
		tracker = new WebviewFocusTracker()
		// The tracker only stores provider identity; no provider methods are needed.
		provider = {} as ClineProvider
	})

	afterEach(() => tracker.dispose())

	it("waits for a focus message and ignores other messages", () => {
		const { view, messages } = createView()
		tracker.init(provider, view)
		expect(tracker.getLastActiveProvider()).toBeUndefined()

		messages.fire({ type: "themeFixtureProbeResponse" })
		expect(tracker.getLastActiveProvider()).toBeUndefined()

		messages.fire({ type: "webviewDidFocus" })
		expect(tracker.getLastActiveProvider()).toBe(provider)
	})

	it("follows focus messages rather than registration order", () => {
		const first = createView()
		const second = createView()
		const secondProvider = {} as ClineProvider
		tracker.init(provider, first.view)
		tracker.init(secondProvider, second.view)

		first.messages.fire({ type: "webviewDidFocus" })
		expect(tracker.getLastActiveProvider()).toBe(provider)
		second.messages.fire({ type: "webviewDidFocus" })
		expect(tracker.getLastActiveProvider()).toBe(secondProvider)
		first.messages.fire({ type: "webviewDidFocus" })
		expect(tracker.getLastActiveProvider()).toBe(provider)
	})

	it("does not clear focus when another view using the same provider is disposed", () => {
		const first = createView()
		const second = createView()
		tracker.init(provider, first.view)
		tracker.init(provider, second.view)

		first.messages.fire({ type: "webviewDidFocus" })
		second.disposed.fire()
		expect(tracker.getLastActiveProvider()).toBe(provider)
		first.disposed.fire()
		expect(tracker.getLastActiveProvider()).toBeUndefined()
	})

	it("unsubscribes both listeners exactly once when a registration is disposed", () => {
		const { view, messages, disposed } = createView()
		const registration = tracker.init(provider, view)
		const disposeMessages = vi.spyOn(view.webview.onDidReceiveMessage.mock.results[0].value, "dispose")
		const disposeView = vi.spyOn(view.onDidDispose.mock.results[0].value, "dispose")
		messages.fire({ type: "webviewDidFocus" })

		registration.dispose()
		registration.dispose()
		disposed.fire()
		tracker.dispose()
		expect(tracker.getLastActiveProvider()).toBeUndefined()
		expect(disposeMessages).toHaveBeenCalledOnce()
		expect(disposeView).toHaveBeenCalledOnce()
		messages.fire({ type: "webviewDidFocus" })
		expect(tracker.getLastActiveProvider()).toBeUndefined()
	})

	it("ignores a queued focus callback from a disposed registration", () => {
		const first = createView()
		const second = createView()
		const secondProvider = {} as ClineProvider
		const registration = tracker.init(provider, first.view)
		const onMessage = first.view.webview.onDidReceiveMessage.mock.calls[0][0]
		tracker.init(secondProvider, second.view)
		second.messages.fire({ type: "webviewDidFocus" })

		registration.dispose()
		onMessage({ type: "webviewDidFocus" })
		expect(tracker.getLastActiveProvider()).toBe(secondProvider)
	})

	it("cleans up when the view is disposed while listeners are being registered", () => {
		const { view, messages } = createView()
		const disposeView = vi.fn()
		view.onDidDispose.mockImplementation((listener) => {
			listener()
			return { dispose: disposeView }
		})
		const registration = tracker.init(provider, view)
		const onMessage = view.webview.onDidReceiveMessage.mock.calls[0][0]
		messages.fire({ type: "webviewDidFocus" })
		onMessage({ type: "webviewDidFocus" })
		expect(tracker.getLastActiveProvider()).toBeUndefined()
		expect(disposeView).toHaveBeenCalledOnce()

		registration.dispose()
		tracker.dispose()
		expect(disposeView).toHaveBeenCalledOnce()
	})

	it("disposes all registrations and can track a new view afterward", () => {
		const first = createView()
		const second = createView()
		tracker.init(provider, first.view)
		tracker.init(provider, second.view)
		const listeners = [first, second].flatMap(({ view }) => [
			vi.spyOn(view.webview.onDidReceiveMessage.mock.results[0].value, "dispose"),
			vi.spyOn(view.onDidDispose.mock.results[0].value, "dispose"),
		])
		const queuedCallbacks = [first, second].map(({ view }) => view.webview.onDidReceiveMessage.mock.calls[0][0])
		first.messages.fire({ type: "webviewDidFocus" })

		tracker.dispose()
		tracker.dispose()
		for (const listener of listeners) {
			expect(listener).toHaveBeenCalledOnce()
		}
		first.messages.fire({ type: "webviewDidFocus" })
		second.messages.fire({ type: "webviewDidFocus" })
		for (const callback of queuedCallbacks) {
			callback({ type: "webviewDidFocus" })
		}
		expect(tracker.getLastActiveProvider()).toBeUndefined()

		const third = createView()
		const thirdProvider = {} as ClineProvider
		tracker.init(thirdProvider, third.view)
		third.messages.fire({ type: "webviewDidFocus" })
		for (const callback of queuedCallbacks) {
			callback({ type: "webviewDidFocus" })
		}
		expect(tracker.getLastActiveProvider()).toBe(thirdProvider)
	})

	it("keeps focus and disposal independent between trackers", () => {
		const otherTracker = new WebviewFocusTracker()
		const first = createView()
		const second = createView()
		tracker.init(provider, first.view)
		otherTracker.init(provider, second.view)
		first.messages.fire({ type: "webviewDidFocus" })
		second.messages.fire({ type: "webviewDidFocus" })

		tracker.dispose()
		expect(tracker.getLastActiveProvider()).toBeUndefined()
		expect(otherTracker.getLastActiveProvider()).toBe(provider)
		otherTracker.dispose()
		expect(otherTracker.getLastActiveProvider()).toBeUndefined()
	})
})
