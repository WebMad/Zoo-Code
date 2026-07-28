import React from "react"

import type { ProviderSettings } from "@roo-code/types"

import { fireEvent, render, screen } from "@/utils/test-utils"

import { OpenAICodex } from "../OpenAICodex"

vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) =>
			({
				"settings:openAiCodexSpeed.label": "Speed",
				"settings:openAiCodexSpeed.tooltip":
					"Fast uses Codex priority processing for about 1.5x speed and consumes more subscription quota.",
				"settings:openAiCodexSpeed.standard": "Standard",
				"settings:openAiCodexSpeed.fast": "Fast (1.5x speed, increased usage)",
			})[key] ?? key,
	}),
}))

vi.mock("@src/components/ui", () => ({
	Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button {...props}>{children}</button>
	),
	Select: ({ children, value, onValueChange }: any) => (
		<select aria-label="Speed" value={value} onChange={(event) => onValueChange(event.target.value)}>
			{children}
		</select>
	),
	SelectContent: ({ children }: any) => <>{children}</>,
	SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
	SelectTrigger: ({ children }: any) => <>{children}</>,
	SelectValue: () => null,
	StandardTooltip: ({ children, content }: any) => <span title={content}>{children}</span>,
}))

vi.mock("../../ModelPicker", () => ({
	ModelPicker: () => <div data-testid="model-picker" />,
}))

vi.mock("../OpenAICodexRateLimitDashboard", () => ({
	OpenAICodexRateLimitDashboard: () => null,
}))

vi.mock("@src/utils/vscode", () => ({
	vscode: { postMessage: vi.fn() },
}))

describe("OpenAICodex speed selector", () => {
	const renderSelector = (apiConfiguration: ProviderSettings, setApiConfigurationField = vi.fn()) => {
		render(<OpenAICodex apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />)
		return { setApiConfigurationField, selector: screen.getByRole("combobox", { name: "Speed" }) }
	}

	it("defaults to Standard and clearly explains the Fast quota trade-off", () => {
		const { selector } = renderSelector({ apiProvider: "openai-codex" })

		expect(selector).toHaveValue("default")
		expect(screen.getByRole("option", { name: "Standard" })).toBeInTheDocument()
		expect(screen.getByRole("option", { name: "Fast (1.5x speed, increased usage)" })).toBeInTheDocument()
		expect(
			screen.getByTitle(
				"Fast uses Codex priority processing for about 1.5x speed and consumes more subscription quota.",
			),
		).toBeInTheDocument()
	})

	it("selects Fast from a saved preference and persists changes through the settings callback", () => {
		const { selector, setApiConfigurationField } = renderSelector({
			apiProvider: "openai-codex",
			openAiCodexServiceTier: "priority",
		})

		expect(selector).toHaveValue("priority")

		fireEvent.change(selector, { target: { value: "default" } })
		expect(setApiConfigurationField).toHaveBeenLastCalledWith("openAiCodexServiceTier", "default")

		fireEvent.change(selector, { target: { value: "priority" } })
		expect(setApiConfigurationField).toHaveBeenLastCalledWith("openAiCodexServiceTier", "priority")
	})
})
