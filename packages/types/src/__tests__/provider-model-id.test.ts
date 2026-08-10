import { getModelId, providerIdentifiers, type ProviderSettings } from "../index.js"

describe("getModelId", () => {
	it("uses the provider-specific model ID field", () => {
		const settings: ProviderSettings = {
			apiProvider: providerIdentifiers.openrouter,
			apiModelId: "unrelated-model",
			openRouterModelId: "openrouter-model",
		}

		expect(getModelId(settings)).toBe("openrouter-model")
	})

	it("uses the active provider when other model ID fields are present", () => {
		const settings: ProviderSettings = {
			apiProvider: providerIdentifiers.ollama,
			apiModelId: "anthropic-model",
			ollamaModelId: "ollama-model",
		}

		expect(getModelId(settings)).toBe("ollama-model")
	})

	it("uses the nested model selector for VS Code LM", () => {
		const settings: ProviderSettings = {
			apiProvider: providerIdentifiers.vscodeLm,
			vsCodeLmModelSelector: { vendor: "copilot", family: "gpt-4o", id: "vscode-model", version: "1" },
		}

		expect(getModelId(settings)).toBe("vscode-model")
	})

	it("uses openAiModelId for OpenAI Compatible", () => {
		const settings: ProviderSettings = {
			apiProvider: providerIdentifiers.openai,
			apiModelId: "unrelated-model",
			openAiModelId: "openai-compatible-model",
		}

		expect(getModelId(settings)).toBe("openai-compatible-model")
	})

	it.each([providerIdentifiers.openaiNative, providerIdentifiers.fakeAi])("uses apiModelId for %s", (apiProvider) => {
		const settings: ProviderSettings = { apiProvider, apiModelId: "shared-model" }

		expect(getModelId(settings)).toBe("shared-model")
	})

	it("returns undefined when no provider is selected", () => {
		expect(getModelId({})).toBeUndefined()
	})

	it("resolves a model ID for every provider definition without throwing", () => {
		for (const apiProvider of Object.values(providerIdentifiers)) {
			expect(() => getModelId({ apiProvider })).not.toThrow()
		}
	})
})
