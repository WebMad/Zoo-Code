import { act, fireEvent, render, screen, within } from "@/utils/test-utils"
import { bedrockDefaultModelId, providerIdentifiers, type ProviderSettings } from "@roo-code/types"
import type { ChangeEventHandler, InputHTMLAttributes, ReactNode } from "react"

import { requestLmStudioModels } from "@src/components/ui/hooks/useLmStudioModels"
import type { useOpenRouterModelProviders } from "@src/components/ui/hooks/useOpenRouterModelProviders"
import { vscode } from "@src/utils/vscode"

import ApiOptions, { type ApiOptionsProps } from "../ApiOptions"

type OpenRouterModelProvidersQueryResult = Pick<ReturnType<typeof useOpenRouterModelProviders>, "data">

const { useOpenRouterModelProvidersMock } = vi.hoisted(() => ({
	useOpenRouterModelProvidersMock: vi.fn<() => OpenRouterModelProvidersQueryResult>(() => ({ data: undefined })),
}))

type ChildrenProps = { children?: ReactNode }

type VSCodeTextFieldMockProps = ChildrenProps &
	Pick<InputHTMLAttributes<HTMLInputElement>, "value" | "placeholder"> & {
		onInput?: ChangeEventHandler<HTMLInputElement>
	}

type SearchableSelectMockProps = {
	value?: string
	onValueChange: (value: string) => void
	options: Array<{ value: string; label: string }>
	"data-testid"?: string
}

vi.mock("@src/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		organizationAllowList: { allowAll: true, providers: {} },
		openAiCodexIsAuthenticated: false,
		kimiCodeIsAuthenticated: false,
		kimiCodeOAuthState: undefined,
	}),
}))

vi.mock("@src/components/ui/hooks/useRouterModels", () => ({
	useRouterModels: () => ({ data: {}, refetch: vi.fn() }),
}))

vi.mock("@src/components/ui/hooks/useZooGatewayRouterModelsSync", () => ({
	useZooGatewayRouterModelsSync: vi.fn(),
}))

vi.mock("@src/components/ui/hooks/useOpenRouterModelProviders", () => ({
	useOpenRouterModelProviders: useOpenRouterModelProvidersMock,
	OPENROUTER_DEFAULT_PROVIDER_NAME: "Auto",
}))

vi.mock("@src/components/ui/hooks/useSelectedModel", () => ({
	useSelectedModel: (configuration: ProviderSettings) => ({
		provider: configuration.apiProvider,
		id: configuration.apiModelId,
		info: {},
	}),
}))

vi.mock("@src/components/ui/hooks/useLmStudioModels", () => ({
	requestLmStudioModels: vi.fn(),
}))

vi.mock("../providers", () => {
	const Provider = () => null
	return {
		Anthropic: Provider,
		Baseten: Provider,
		Bedrock: Provider,
		DeepSeek: Provider,
		Gemini: Provider,
		LMStudio: Provider,
		LiteLLM: Provider,
		Mistral: Provider,
		Moonshot: Provider,
		KimiCode: Provider,
		Ollama: Provider,
		OpenAI: Provider,
		OpenAICompatible: Provider,
		OpenAICodex: Provider,
		OpenRouter: Provider,
		Poe: Provider,
		QwenCode: Provider,
		Requesty: Provider,
		SambaNova: Provider,
		Unbound: Provider,
		Vertex: Provider,
		VSCodeLM: Provider,
		XAI: Provider,
		ZAi: Provider,
		Fireworks: Provider,
		Friendli: Provider,
		VercelAiGateway: Provider,
		OpenCodeGo: Provider,
		Kenari: Provider,
		ZooGateway: Provider,
		MiniMax: Provider,
		Mimo: Provider,
	}
})

vi.mock("../providers/BedrockCustomArn", () => ({
	BedrockCustomArn: () => <div data-testid="bedrock-custom-arn" />,
}))
vi.mock("../ModelPicker", () => ({ ModelPicker: () => null }))
vi.mock("../ApiErrorMessage", () => ({ ApiErrorMessage: () => null }))
vi.mock("../ThinkingBudget", () => ({ ThinkingBudget: () => null }))
vi.mock("../Verbosity", () => ({ Verbosity: () => null }))
vi.mock("../TodoListSettingsControl", () => ({ TodoListSettingsControl: () => null }))
vi.mock("../TemperatureControl", () => ({ TemperatureControl: () => null }))
vi.mock("../RateLimitSecondsControl", () => ({ RateLimitSecondsControl: () => null }))
vi.mock("../ConsecutiveMistakeLimitControl", () => ({
	ConsecutiveMistakeLimitControl: ({ value, onChange }: { value: number; onChange: (value: number) => void }) => (
		<div data-testid="consecutive-mistake-limit-control">
			<input type="range" value={value} onChange={(event) => onChange(Number(event.target.value))} />
		</div>
	),
}))

vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeTextField: ({ children, value, onInput, placeholder }: VSCodeTextFieldMockProps) => (
		<label>
			{children}
			<input value={value} placeholder={placeholder} onChange={onInput} />
		</label>
	),
	VSCodeLink: ({ children }: ChildrenProps) => <span>{children}</span>,
}))

vi.mock("@/components/ui", () => ({
	SearchableSelect: ({ value, onValueChange, options, "data-testid": testId }: SearchableSelectMockProps) => (
		<div data-testid={testId}>
			<select value={value} onChange={(event) => onValueChange(event.target.value)}>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</div>
	),
	Collapsible: ({ children }: ChildrenProps) => <div>{children}</div>,
	CollapsibleTrigger: ({ children }: ChildrenProps) => <div>{children}</div>,
	CollapsibleContent: ({ children }: ChildrenProps) => <div>{children}</div>,
	Select: ({ children }: ChildrenProps) => <div>{children}</div>,
	SelectTrigger: ({ children }: ChildrenProps) => <div>{children}</div>,
	SelectValue: () => null,
	SelectContent: ({ children }: ChildrenProps) => <div>{children}</div>,
	SelectItem: ({ children }: ChildrenProps) => <div>{children}</div>,
}))

const renderApiOptions = (props: Partial<ApiOptionsProps> = {}) =>
	render(
		<ApiOptions
			errorMessage={undefined}
			setErrorMessage={() => undefined}
			uriScheme={undefined}
			apiConfiguration={{}}
			setApiConfigurationField={() => undefined}
			{...props}
		/>,
	)

describe("ApiOptions interactions", () => {
	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	describe("debounced provider model refresh", () => {
		it.each([
			{
				provider: providerIdentifiers.openai,
				configuration: {
					openAiBaseUrl: "https://openai.example/v1",
					openAiApiKey: "openai-key",
					openAiHeaders: { "X-Custom": "header-value" },
				},
				expectedMessage: {
					type: "requestOpenAiModels",
					values: {
						baseUrl: "https://openai.example/v1",
						apiKey: "openai-key",
						customHeaders: {},
						openAiHeaders: { "X-Custom": "header-value" },
					},
				},
			},
			{
				provider: providerIdentifiers.ollama,
				configuration: { ollamaBaseUrl: "http://ollama:11434", ollamaApiKey: "ollama-key" },
				expectedMessage: {
					type: "requestOllamaModels",
					values: { baseUrl: "http://ollama:11434", apiKey: "ollama-key" },
				},
			},
			{
				provider: providerIdentifiers.vscodeLm,
				configuration: {},
				expectedMessage: { type: "requestVsCodeLmModels" },
			},
			{
				provider: providerIdentifiers.litellm,
				configuration: { litellmBaseUrl: "http://litellm:4000", litellmApiKey: "litellm-key" },
				expectedMessage: {
					type: "requestRouterModels",
					values: { litellmApiKey: "litellm-key", litellmBaseUrl: "http://litellm:4000" },
				},
			},
			{
				provider: providerIdentifiers.poe,
				configuration: { poeApiKey: "poe-key", poeBaseUrl: "https://api.poe.example/v1" },
				expectedMessage: { type: "requestRouterModels" },
			},
		])("requests models for $provider", ({ provider, configuration, expectedMessage }) => {
			vi.useFakeTimers()
			const postMessage = vi.spyOn(vscode, "postMessage").mockImplementation(() => undefined)

			renderApiOptions({ apiConfiguration: { apiProvider: provider, ...configuration } })
			act(() => vi.advanceTimersByTime(249))
			expect(postMessage).not.toHaveBeenCalledWith(expectedMessage)

			act(() => vi.advanceTimersByTime(1))
			expect(postMessage).toHaveBeenCalledTimes(1)
			expect(postMessage).toHaveBeenCalledWith(expectedMessage)
		})

		it("requests LM Studio models using its configured base URL", () => {
			vi.useFakeTimers()
			renderApiOptions({
				apiConfiguration: {
					apiProvider: providerIdentifiers.lmstudio,
					lmStudioBaseUrl: "http://lmstudio:1234",
				},
			})

			act(() => vi.advanceTimersByTime(249))
			expect(requestLmStudioModels).not.toHaveBeenCalledWith("http://lmstudio:1234")

			act(() => vi.advanceTimersByTime(1))
			expect(requestLmStudioModels).toHaveBeenCalledTimes(1)
			expect(requestLmStudioModels).toHaveBeenCalledWith("http://lmstudio:1234")
		})

		it("does not request dynamic models for a static provider", () => {
			vi.useFakeTimers()
			const postMessage = vi.spyOn(vscode, "postMessage").mockImplementation(() => undefined)

			renderApiOptions({ apiConfiguration: { apiProvider: providerIdentifiers.anthropic } })
			act(() => vi.advanceTimersByTime(250))

			expect(postMessage).not.toHaveBeenCalled()
		})
	})

	it.each([
		providerIdentifiers.requesty,
		providerIdentifiers.unbound,
		providerIdentifiers.anthropic,
		providerIdentifiers.openaiCodex,
		providerIdentifiers.openaiNative,
		providerIdentifiers.mistral,
		providerIdentifiers.baseten,
		providerIdentifiers.bedrock,
		providerIdentifiers.gemini,
		providerIdentifiers.lmstudio,
		providerIdentifiers.deepseek,
		providerIdentifiers.qwenCode,
		providerIdentifiers.moonshot,
		providerIdentifiers.kimiCode,
		providerIdentifiers.minimax,
		providerIdentifiers.mimo,
		providerIdentifiers.ollama,
		providerIdentifiers.litellm,
		providerIdentifiers.sambanova,
		providerIdentifiers.zai,
		providerIdentifiers.xai,
		providerIdentifiers.fireworks,
		providerIdentifiers.friendli,
		providerIdentifiers.vercelAiGateway,
		providerIdentifiers.opencodeGo,
	])("renders the canonical %s provider branch", (apiProvider) => {
		const { unmount } = renderApiOptions({ apiConfiguration: { apiProvider } })
		unmount()
	})

	it("clears parent validation errors for Zoo Gateway", () => {
		const setErrorMessage = vi.fn()
		renderApiOptions({ apiConfiguration: { apiProvider: providerIdentifiers.zooGateway }, setErrorMessage })

		expect(setErrorMessage).toHaveBeenCalledWith(undefined)
	})

	it("renders OpenRouter provider routing when provider metadata is available", () => {
		useOpenRouterModelProvidersMock.mockReturnValue({
			data: { preferred: { label: "Preferred", contextWindow: 1, supportsPromptCache: false } },
		})

		renderApiOptions({
			apiConfiguration: {
				apiProvider: providerIdentifiers.openrouter,
				openRouterModelId: "anthropic/claude-sonnet-4.5",
			},
		})

		expect(screen.getByText("settings:providers.openRouter.providerRouting.title")).toBeInTheDocument()
	})

	it("preserves the Bedrock custom ARN pseudo-model when switching to Bedrock", () => {
		const setApiConfigurationField = vi.fn()
		renderApiOptions({
			apiConfiguration: { apiProvider: providerIdentifiers.anthropic, apiModelId: "custom-arn" },
			setApiConfigurationField,
		})

		const providerSelect = screen.getByTestId("provider-select").querySelector("select") as HTMLSelectElement
		fireEvent.change(providerSelect, { target: { value: providerIdentifiers.bedrock } })

		expect(setApiConfigurationField).toHaveBeenCalledWith("apiProvider", providerIdentifiers.bedrock)
		expect(setApiConfigurationField.mock.calls.filter(([field]) => field === "apiModelId")).toEqual([])
	})

	it("resets an invalid ordinary model to the Bedrock default when switching providers", () => {
		const setApiConfigurationField = vi.fn()
		renderApiOptions({
			apiConfiguration: { apiProvider: providerIdentifiers.anthropic, apiModelId: "not-a-bedrock-model" },
			setApiConfigurationField,
		})

		const providerSelect = screen.getByTestId("provider-select").querySelector("select") as HTMLSelectElement
		fireEvent.change(providerSelect, { target: { value: providerIdentifiers.bedrock } })

		expect(setApiConfigurationField).toHaveBeenCalledWith("apiProvider", providerIdentifiers.bedrock)
		expect(setApiConfigurationField).toHaveBeenCalledWith("apiModelId", bedrockDefaultModelId, false)
	})

	it("renders the custom ARN settings only for Bedrock's custom ARN pseudo-model", () => {
		const { rerender } = render(
			<ApiOptions
				errorMessage={undefined}
				setErrorMessage={() => undefined}
				uriScheme={undefined}
				apiConfiguration={{ apiProvider: providerIdentifiers.bedrock, apiModelId: "custom-arn" }}
				setApiConfigurationField={() => undefined}
			/>,
		)

		expect(screen.getByTestId("bedrock-custom-arn")).toBeInTheDocument()

		rerender(
			<ApiOptions
				errorMessage={undefined}
				setErrorMessage={() => undefined}
				uriScheme={undefined}
				apiConfiguration={{ apiProvider: providerIdentifiers.bedrock, apiModelId: bedrockDefaultModelId }}
				setApiConfigurationField={() => undefined}
			/>,
		)

		expect(screen.queryByTestId("bedrock-custom-arn")).not.toBeInTheDocument()
	})

	it("updates the consecutive mistake limit from advanced settings", () => {
		const setApiConfigurationField = vi.fn()
		renderApiOptions({ apiConfiguration: {}, setApiConfigurationField })

		fireEvent.change(within(screen.getByTestId("consecutive-mistake-limit-control")).getByRole("slider"), {
			target: { value: "7" },
		})

		expect(setApiConfigurationField).toHaveBeenCalledWith("consecutiveMistakeLimit", 7)
	})

	it("renders and updates the Poe base URL in advanced settings", () => {
		const setApiConfigurationField = vi.fn()
		renderApiOptions({
			apiConfiguration: { apiProvider: providerIdentifiers.poe, poeBaseUrl: "https://api.poe.example/v1" },
			setApiConfigurationField,
		})

		const poeBaseUrl = screen.getByPlaceholderText("https://api.poe.com/v1")
		expect(poeBaseUrl).toHaveValue("https://api.poe.example/v1")

		fireEvent.change(poeBaseUrl, { target: { value: "https://new.poe.example/v1" } })
		expect(setApiConfigurationField).toHaveBeenCalledWith("poeBaseUrl", "https://new.poe.example/v1")
	})
})
