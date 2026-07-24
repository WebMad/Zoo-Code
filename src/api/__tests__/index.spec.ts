// npx vitest run src/api/__tests__/index.spec.ts

import fs from "node:fs"

// Mock vscode first to avoid import errors
vitest.mock("vscode", () => ({
	workspace: {
		getConfiguration: () => ({
			get: (_key: string, defaultValue?: unknown) => defaultValue,
		}),
	},
}))

import {
	providerIdentifiers,
	retiredProviderIdentifiers,
	type ProviderSettings,
	type ProviderNameWithRetired,
} from "@roo-code/types"

import { buildApiHandler } from "../index"
import { AnthropicHandler } from "../providers/anthropic"
import { KenariHandler } from "../providers/kenari"
import { OpenRouterHandler } from "../providers/openrouter"

describe("buildApiHandler", () => {
	it("returns a KenariHandler for the kenari provider", () => {
		const configuration: ProviderSettings = {
			apiProvider: providerIdentifiers.kenari,
			kenariApiKey: "test-key",
			kenariModelId: "glm-5-2",
		}

		const handler = buildApiHandler(configuration)

		expect(handler).toBeInstanceOf(KenariHandler)
	})

	it.each([
		[providerIdentifiers.anthropic, AnthropicHandler],
		[providerIdentifiers.openrouter, OpenRouterHandler],
	] as const)("returns the expected handler for %s", (apiProvider, Handler) => {
		const handler = buildApiHandler({ apiProvider })

		expect(handler).toBeInstanceOf(Handler)
	})

	it("preserves the dedicated removal error for the retired Roo provider", () => {
		expect(() =>
			buildApiHandler({
				apiProvider: retiredProviderIdentifiers.roo,
			}),
		).toThrow("Roo Code Router has been removed")
	})

	it("rejects other retired providers", () => {
		expect(() =>
			buildApiHandler({
				apiProvider: retiredProviderIdentifiers.cerebras,
			}),
		).toThrow("this provider is no longer supported")
	})

	it("falls back to Anthropic for an unsupported provider value", () => {
		const handler = buildApiHandler({
			apiProvider: "unsupported-provider" as ProviderNameWithRetired,
		})

		expect(handler).toBeInstanceOf(AnthropicHandler)
	})

	it("uses canonical identifiers instead of provider literals in the handler factory", () => {
		const factorySource = fs.readFileSync(new URL("../index.ts", import.meta.url), "utf8")

		expect(factorySource).toContain("providerIdentifiers.anthropic")
		expect(factorySource).toContain("retiredProviderIdentifiers.roo")
		expect(factorySource).not.toMatch(/case\s+["']/)
	})
})
