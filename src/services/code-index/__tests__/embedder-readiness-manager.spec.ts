import { EmbedderReadinessManager } from "../embedder-readiness-manager"
import type { IndexingState } from "../state-manager"
import type { CodeIndexServiceFactory } from "../service-factory"
import type { IEmbedder } from "../interfaces"

describe("EmbedderReadinessManager", () => {
	const setup = () => {
		const stateManager = {
			state: "Standby" as IndexingState,
			setSystemState: vi.fn(),
		}
		const embedder: IEmbedder = {
			embedderInfo: { name: "ollama" },
			createEmbeddings: vi.fn(),
			validateConfiguration: vi.fn(),
		}
		const serviceFactory = {
			validateEmbedder: vi.fn(),
		} as unknown as CodeIndexServiceFactory
		return { stateManager, manager: new EmbedderReadinessManager(stateManager), serviceFactory, embedder }
	}

	it("reports the latest validation failure while the manager remains in standby", async () => {
		const { stateManager, manager, serviceFactory, embedder } = setup()
		vi.mocked(serviceFactory.validateEmbedder).mockResolvedValue({
			valid: false,
			error: "Current validation failure",
		})

		void manager.validate(serviceFactory, embedder)
		await Promise.resolve()

		expect(stateManager.setSystemState).toHaveBeenCalledExactlyOnceWith("Error", "Current validation failure")
	})

	it.each([undefined, ""])("uses the fallback for a validation failure with message %j", async (error) => {
		const { stateManager, manager, serviceFactory, embedder } = setup()
		vi.mocked(serviceFactory.validateEmbedder).mockResolvedValue({ valid: false, error })

		await manager.validate(serviceFactory, embedder)

		expect(stateManager.setSystemState).toHaveBeenCalledExactlyOnceWith(
			"Error",
			"Embedder configuration validation failed",
		)
	})

	it("uses the fallback for a non-Error rejection", async () => {
		const { stateManager, manager, serviceFactory, embedder } = setup()
		vi.mocked(serviceFactory.validateEmbedder).mockRejectedValue("Unexpected rejection")

		await expect(manager.validate(serviceFactory, embedder)).resolves.toBeUndefined()

		expect(stateManager.setSystemState).toHaveBeenCalledExactlyOnceWith(
			"Error",
			"Embedder configuration validation failed",
		)
	})

	it("reports an unexpected validation rejection while the manager remains in standby", async () => {
		const { stateManager, manager, serviceFactory, embedder } = setup()
		vi.mocked(serviceFactory.validateEmbedder).mockRejectedValue(new Error("Validation crashed"))

		void manager.validate(serviceFactory, embedder)
		await Promise.resolve()
		await Promise.resolve()

		expect(stateManager.setSystemState).toHaveBeenCalledExactlyOnceWith("Error", "Validation crashed")
	})

	it("ignores validation results after another operation changes the status", async () => {
		const { stateManager, manager, serviceFactory, embedder } = setup()
		let finishValidation!: (result: { valid: boolean; error?: string }) => void
		vi.mocked(serviceFactory.validateEmbedder).mockReturnValue(
			new Promise((resolve) => {
				finishValidation = resolve
			}),
		)
		void manager.validate(serviceFactory, embedder)

		stateManager.state = "Indexed"
		finishValidation({ valid: false, error: "Stale validation failure" })
		await Promise.resolve()

		expect(stateManager.setSystemState).not.toHaveBeenCalled()
	})

	it("ignores an older result when a newer validation has started", async () => {
		const { stateManager, manager, serviceFactory, embedder } = setup()
		let finishFirstValidation!: (result: { valid: boolean; error?: string }) => void
		vi.mocked(serviceFactory.validateEmbedder)
			.mockReturnValueOnce(
				new Promise((resolve) => {
					finishFirstValidation = resolve
				}),
			)
			.mockResolvedValueOnce({ valid: true })
		void manager.validate(serviceFactory, embedder)
		void manager.validate(serviceFactory, embedder)
		await Promise.resolve()

		finishFirstValidation({ valid: false, error: "Older validation failure" })
		await Promise.resolve()

		expect(stateManager.setSystemState).not.toHaveBeenCalled()
	})

	it.each(["invalidation", "newer validation", "status change"] as const)(
		"ignores a pending rejection after %s",
		async (scenario) => {
			const { stateManager, manager, serviceFactory, embedder } = setup()
			let rejectValidation!: (error: Error) => void
			vi.mocked(serviceFactory.validateEmbedder).mockReturnValueOnce(
				new Promise((_, reject) => {
					rejectValidation = reject
				}),
			)
			const validation = manager.validate(serviceFactory, embedder)

			if (scenario === "invalidation") {
				manager.invalidate()
			} else if (scenario === "newer validation") {
				vi.mocked(serviceFactory.validateEmbedder).mockResolvedValueOnce({ valid: true })
				await manager.validate(serviceFactory, embedder)
			} else {
				stateManager.state = "Indexed"
			}

			rejectValidation(new Error("Stale rejection"))
			await expect(validation).resolves.toBeUndefined()
			expect(stateManager.setSystemState).not.toHaveBeenCalled()
		},
	)

	it("ignores a pending result after invalidation", async () => {
		const { stateManager, manager, serviceFactory, embedder } = setup()
		let finishValidation!: (result: { valid: boolean; error?: string }) => void
		vi.mocked(serviceFactory.validateEmbedder).mockReturnValue(
			new Promise((resolve) => {
				finishValidation = resolve
			}),
		)
		void manager.validate(serviceFactory, embedder)

		manager.invalidate()
		finishValidation({ valid: false, error: "Invalidated validation failure" })
		await Promise.resolve()

		expect(stateManager.setSystemState).not.toHaveBeenCalled()
	})
})
