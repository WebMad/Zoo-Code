import React from "react"

import { expect, test } from "../../../../../playwright/coverage-fixture"
import { OpenAICodexFixture } from "./OpenAICodex.visual.fixture"

test("renders the OpenAI Codex speed selector in the VS Code dark theme", async ({ mount }) => {
	const component = await mount(<OpenAICodexFixture />)
	const selector = component.getByTestId("openai-codex-service-tier")

	await selector.evaluate(async () => {
		await document.fonts.ready
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
	})

	await expect(selector).toHaveScreenshot("openai-codex-speed-selector-dark.png")
})
