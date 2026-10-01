import type { CodeIndexStateManager } from "./state-manager"
import type { IEmbedder } from "./interfaces"
import type { CodeIndexServiceFactory } from "./service-factory"

type ValidationResult = { valid: boolean; error?: string }

/** Tracks embedder readiness without blocking initialization and discards stale results. */
export class EmbedderReadinessManager {
	private generation = 0

	public constructor(private readonly stateManager: Pick<CodeIndexStateManager, "state" | "setSystemState">) {}

	public async validate(serviceFactory: CodeIndexServiceFactory, embedder: IEmbedder): Promise<void> {
		const generation = ++this.generation
		try {
			const result: ValidationResult = await serviceFactory.validateEmbedder(embedder)
			if (!this.canApply(generation) || result.valid) return
			this.stateManager.setSystemState("Error", result.error || "Embedder configuration validation failed")
		} catch (error) {
			if (!this.canApply(generation)) return
			this.stateManager.setSystemState(
				"Error",
				error instanceof Error ? error.message : "Embedder configuration validation failed",
			)
		}
	}

	public invalidate(): void {
		this.generation++
	}

	private canApply(generation: number): boolean {
		return generation === this.generation && this.stateManager.state === "Standby"
	}
}
