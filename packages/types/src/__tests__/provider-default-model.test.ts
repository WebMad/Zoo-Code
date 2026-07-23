import type { ProviderName } from "../provider-settings.js"

vi.mock("../provider-identifiers.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../provider-identifiers.js")>()

	return {
		...actual,
		providerIdentifiers: {
			...actual.providerIdentifiers,
			openrouter: "canonical-openrouter-test-value",
		},
	}
})

import { providerIdentifiers } from "../provider-identifiers.js"
import {
	anthropicDefaultModelId,
	getProviderDefaultModelId,
	mainlandZAiDefaultModelId,
	openRouterDefaultModelId,
	vscodeLlmDefaultModelId,
} from "../providers/index.js"

describe("getProviderDefaultModelId", () => {
	it("selects a static default through the canonical provider identifier", () => {
		expect(getProviderDefaultModelId(providerIdentifiers.openrouter as ProviderName)).toBe(openRouterDefaultModelId)
	})

	it("triangulates static selection with another provider category", () => {
		expect(getProviderDefaultModelId(providerIdentifiers.vscodeLm)).toBe(vscodeLlmDefaultModelId)
	})

	it("preserves region-dependent defaults", () => {
		expect(getProviderDefaultModelId(providerIdentifiers.zai, { isChina: true })).toBe(mainlandZAiDefaultModelId)
	})

	it.each([providerIdentifiers.openai, providerIdentifiers.ollama, providerIdentifiers.lmstudio])(
		"returns an empty default for custom or locally selected models from %s",
		(provider) => {
			expect(getProviderDefaultModelId(provider)).toBe("")
		},
	)

	it.each([providerIdentifiers.anthropic, providerIdentifiers.geminiCli, providerIdentifiers.fakeAi])(
		"preserves the Anthropic fallback for %s",
		(provider) => {
			expect(getProviderDefaultModelId(provider)).toBe(anthropicDefaultModelId)
		},
	)
})
