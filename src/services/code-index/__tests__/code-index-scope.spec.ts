import { makeExtensionContext, makeUri } from "../../../test-utils/vscode"
import { CodeIndexManager } from "../manager"
import { CodeIndexScope } from "../code-index-scope"
import { CodeIndexStateManager } from "../state-manager"

vi.mock("../state-manager", () => ({
	CodeIndexStateManager: vi.fn().mockImplementation(function () {
		return { dispose: vi.fn() }
	}),
}))

vi.mock("../manager", () => ({
	CodeIndexManager: vi.fn().mockImplementation(function () {
		return { initialize: vi.fn(), dispose: vi.fn() }
	}),
}))

describe("CodeIndexScope", () => {
	beforeEach(() => vi.clearAllMocks())

	function createScope() {
		const context = makeExtensionContext()
		const uri = makeUri("/workspace")
		const scope = new CodeIndexScope(uri.fsPath, uri, context)
		return { scope, context, uri }
	}

	function getManager(scope: CodeIndexScope) {
		const codeIndexManager = scope.codeIndexManager
		if (!codeIndexManager) throw new Error("Expected an initialized scope")
		return codeIndexManager
	}

	it("does not create resources before init", () => {
		const { scope } = createScope()
		expect(scope.codeIndexManager).toBeUndefined()
		expect(CodeIndexManager).not.toHaveBeenCalled()
		expect(CodeIndexStateManager).not.toHaveBeenCalled()
	})

	it("creates and injects dependencies without loading manager configuration", () => {
		const { scope, context, uri } = createScope()
		scope.init()
		expect(CodeIndexStateManager).toHaveBeenCalledExactlyOnceWith()
		const codeIndexStateManager = vi.mocked(CodeIndexStateManager).mock.results[0].value
		expect(CodeIndexManager).toHaveBeenCalledExactlyOnceWith(uri.fsPath, uri, context, codeIndexStateManager)
		expect(scope.codeIndexManager).toBe(vi.mocked(CodeIndexManager).mock.results[0].value)
		expect(getManager(scope).initialize).not.toHaveBeenCalled()
	})

	it("keeps existing resources on repeated init", () => {
		const { scope } = createScope()
		scope.init()
		const codeIndexManager = getManager(scope)
		scope.init()
		expect(scope.codeIndexManager).toBe(codeIndexManager)
		expect(CodeIndexManager).toHaveBeenCalledOnce()
		expect(CodeIndexStateManager).toHaveBeenCalledOnce()
	})

	it("creates a separate state manager for each scope", () => {
		createScope().scope.init()
		createScope().scope.init()
		const calls = vi.mocked(CodeIndexManager).mock.calls
		expect(CodeIndexStateManager).toHaveBeenCalledTimes(2)
		expect(calls[0][3]).not.toBe(calls[1][3])
	})

	it("allows disposal before init without creating resources", () => {
		const { scope } = createScope()
		scope.dispose()
		expect(scope.codeIndexManager).toBeUndefined()
		expect(CodeIndexManager).not.toHaveBeenCalled()
	})

	it("clears the reference before disposing its manager", () => {
		const { scope } = createScope()
		scope.init()
		const codeIndexManager = getManager(scope)
		vi.mocked(codeIndexManager.dispose).mockImplementation(() => {
			expect(scope.codeIndexManager).toBeUndefined()
		})
		scope.dispose()
		expect(codeIndexManager.dispose).toHaveBeenCalledExactlyOnceWith()
	})

	it("does not dispose the same manager twice", () => {
		const { scope } = createScope()
		scope.init()
		const codeIndexManager = getManager(scope)
		scope.dispose()
		scope.dispose()
		expect(codeIndexManager.dispose).toHaveBeenCalledOnce()
	})

	it("leaves the scope empty when disposal throws", () => {
		const { scope } = createScope()
		scope.init()
		const codeIndexManager = getManager(scope)
		const error = new Error("disposal failed")
		vi.mocked(codeIndexManager.dispose).mockImplementation(() => {
			throw error
		})
		expect(() => scope.dispose()).toThrow(error)
		expect(scope.codeIndexManager).toBeUndefined()
		scope.dispose()
		expect(codeIndexManager.dispose).toHaveBeenCalledOnce()
	})

	it("creates fresh resources when initialized after disposal", () => {
		const { scope } = createScope()
		scope.init()
		const previousManager = getManager(scope)
		scope.dispose()
		scope.init()
		expect(getManager(scope)).not.toBe(previousManager)
		const calls = vi.mocked(CodeIndexManager).mock.calls
		expect(calls[0][3]).not.toBe(calls[1][3])
	})

	it("releases the state manager if manager construction fails and permits retry", () => {
		const { scope } = createScope()
		const error = new Error("construction failed")
		vi.mocked(CodeIndexManager).mockImplementationOnce(function () {
			throw error
		})
		expect(() => scope.init()).toThrow(error)
		expect(scope.codeIndexManager).toBeUndefined()
		const codeIndexStateManager = vi.mocked(CodeIndexManager).mock.calls[0][3]
		expect(codeIndexStateManager.dispose).toHaveBeenCalledOnce()
		scope.init()
		expect(getManager(scope)).toBeDefined()
	})
})
