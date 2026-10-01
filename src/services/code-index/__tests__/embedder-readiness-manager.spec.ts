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
