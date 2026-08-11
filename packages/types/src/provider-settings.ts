import { z } from "zod"

import {
	modelInfoSchema,
	openAiCodexServiceTierSchema,
	reasoningEffortSettingSchema,
	verbosityLevelsSchema,
	serviceTierSchema,
} from "./model.js"
import { codebaseIndexProviderSchema } from "./codebase-index.js"
import type { UnionToIntersection } from "./type-fu.js"
import {
	providerIdentifiers,
	retiredProviderIdentifiers,
	type ProviderIdentifier,
	type RetiredProviderIdentifier,
} from "./provider-identifiers.js"
import {
	anthropicModels,
	basetenModels,
	bedrockModels,
	deepSeekModels,
	fireworksModels,
	friendliModels,
	geminiModels,
	mistralModels,
	moonshotModels,
	openAiCodexModels,
	openAiNativeModels,
	qwenCodeModels,
	sambaNovaModels,
	vertexModels,
	vscodeLlmModels,
	xaiModels,
	internationalZAiModels,
	minimaxModels,
	mimoModels,
	isOpencodeGoAnthropicFormatModel,
	ANTHROPIC_API_PROTOCOL,
	OPENAI_API_PROTOCOL,
} from "./providers/index.js"

/**
 * constants
 */

export const DEFAULT_CONSECUTIVE_MISTAKE_LIMIT = 3
export const OPEN_AI_CODEX_SERVICE_TIER_KEY = "openAiCodexServiceTier"

/**
 * DynamicProvider
 *
 * Dynamic provider requires external API calls in order to get the model list.
 */

export const dynamicProviders = [
	providerIdentifiers.openrouter,
	providerIdentifiers.vercelAiGateway,
	providerIdentifiers.zooGateway,
	providerIdentifiers.litellm,
	providerIdentifiers.requesty,
	providerIdentifiers.unbound,
	providerIdentifiers.poe,
	providerIdentifiers.deepseek,
	providerIdentifiers.moonshot,
	providerIdentifiers.opencodeGo,
	providerIdentifiers.kenari,
	providerIdentifiers.kimiCode,
] as const

export type DynamicProvider = (typeof dynamicProviders)[number]

export const isDynamicProvider = (key: string): key is DynamicProvider =>
	dynamicProviders.includes(key as DynamicProvider)

/**
 * LocalProvider
 *
 * Local providers require localhost API calls in order to get the model list.
 */

export const localProviders = [providerIdentifiers.ollama, providerIdentifiers.lmstudio] as const

export type LocalProvider = (typeof localProviders)[number]

export const isLocalProvider = (key: string): key is LocalProvider => localProviders.includes(key as LocalProvider)

/**
 * InternalProvider
 *
 * Internal providers require internal VSCode API calls in order to get the
 * model list.
 */

export const internalProviders = [providerIdentifiers.vscodeLm] as const

export type InternalProvider = (typeof internalProviders)[number]

export const isInternalProvider = (key: string): key is InternalProvider =>
	internalProviders.includes(key as InternalProvider)

/**
 * CustomProvider
 *
 * Custom providers are completely configurable within Roo Code settings.
 */

export const customProviders = [providerIdentifiers.openai] as const

export type CustomProvider = (typeof customProviders)[number]

export const isCustomProvider = (key: string): key is CustomProvider => customProviders.includes(key as CustomProvider)

/**
 * FauxProvider
 *
 * Faux providers do not make external inference calls and therefore do not have
 * model lists.
 */

export const fauxProviders = [providerIdentifiers.fakeAi] as const

export type FauxProvider = (typeof fauxProviders)[number]

export const isFauxProvider = (key: string): key is FauxProvider => fauxProviders.includes(key as FauxProvider)

/**
 * ProviderName
 */

export const providerNames = Object.values(providerIdentifiers) as [ProviderIdentifier, ...ProviderIdentifier[]]

export const providerNamesSchema = z.enum(providerNames)

export type ProviderName = z.infer<typeof providerNamesSchema>

export const isProviderName = (key: unknown): key is ProviderName =>
	typeof key === "string" && providerNames.includes(key as ProviderName)

/**
 * RetiredProviderName
 */

export const retiredProviderNames = Object.values(retiredProviderIdentifiers) as [
	RetiredProviderIdentifier,
	...RetiredProviderIdentifier[],
]

export const retiredProviderNamesSchema = z.enum(retiredProviderNames)

export type RetiredProviderName = z.infer<typeof retiredProviderNamesSchema>

export const isRetiredProvider = (value: string): value is RetiredProviderName =>
	retiredProviderNames.includes(value as RetiredProviderName)

export const providerNamesWithRetiredSchema = z.union([providerNamesSchema, retiredProviderNamesSchema])

export type ProviderNameWithRetired = z.infer<typeof providerNamesWithRetiredSchema>

/**
 * ProviderSettingsEntry
 */

const API_PROVIDER_FIELD = "apiProvider"
const SETTINGS_SHAPE_FIELD = "settingsShape"

export const providerSettingsEntrySchema = z.object({
	id: z.string(),
	name: z.string(),
	[API_PROVIDER_FIELD]: providerNamesWithRetiredSchema.optional(),
	modelId: z.string().optional(),
})

export type ProviderSettingsEntry = z.infer<typeof providerSettingsEntrySchema>

/**
 * ProviderSettings
 */

const baseProviderSettingsShape = {
	includeMaxTokens: z.boolean().optional(),
	todoListEnabled: z.boolean().optional(),
	modelTemperature: z.number().nullish(),
	rateLimitSeconds: z.number().optional(),
	consecutiveMistakeLimit: z.number().min(0).optional(),

	// Model reasoning.
	enableReasoningEffort: z.boolean().optional(),
	reasoningEffort: reasoningEffortSettingSchema.optional(),
	modelMaxTokens: z.number().optional(),
	modelMaxThinkingTokens: z.number().optional(),

	// Model verbosity.
	verbosity: verbosityLevelsSchema.optional(),
}

type ProviderModelIdAccessor = (settings: Record<string, unknown>) => string | undefined

type TypedProviderModelIdAccessor<S extends z.ZodRawShape> = (settings: z.infer<z.ZodObject<S>>) => string | undefined

const createProviderDefinition = <P extends ProviderName, S extends z.ZodRawShape>({
	apiProvider,
	schema,
	getModelId,
}: {
	apiProvider: P
	schema: S
	getModelId: TypedProviderModelIdAccessor<S>
}) => ({
	apiProvider,
	settingsShape: schema,
	schema: z.object({
		...schema,
		[API_PROVIDER_FIELD]: z.literal(apiProvider),
	}),
	getModelId: ((settings) => getModelId(settings as z.infer<z.ZodObject<S>>)) satisfies ProviderModelIdAccessor,
})

// Several of the providers share common model config properties.
const apiModelIdProviderModelShape = {
	...baseProviderSettingsShape,
	apiModelId: z.string().optional(),
}

const anthropicProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.anthropic,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		apiKey: z.string().optional(),
		anthropicBaseUrl: z.string().optional(),
		anthropicUseAuthToken: z.boolean().optional(),
		anthropicBeta1MContext: z.boolean().optional(), // Enable 'context-1m-2025-08-07' beta for 1M context window.
	},
})

const openRouterProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.openrouter,
	getModelId: (settings) => settings.openRouterModelId,
	schema: {
		...baseProviderSettingsShape,
		openRouterApiKey: z.string().optional(),
		openRouterModelId: z.string().optional(),
		openRouterBaseUrl: z.string().optional(),
		openRouterSpecificProvider: z.string().optional(),
	},
})

const bedrockProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.bedrock,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		awsAccessKey: z.string().optional(),
		awsSecretKey: z.string().optional(),
		awsSessionToken: z.string().optional(),
		awsRegion: z.string().optional(),
		awsUseCrossRegionInference: z.boolean().optional(),
		awsUseGlobalInference: z.boolean().optional(), // Enable Global Inference profile routing when supported
		awsUsePromptCache: z.boolean().optional(),
		awsProfile: z.string().optional(),
		awsUseProfile: z.boolean().optional(),
		awsApiKey: z.string().optional(),
		awsUseApiKey: z.boolean().optional(),
		awsCustomArn: z.string().optional(),
		awsModelContextWindow: z.number().optional(),
		awsBedrockEndpointEnabled: z.boolean().optional(),
		awsBedrockEndpoint: z.string().optional(),
		awsBedrock1MContext: z.boolean().optional(), // Enable 'context-1m-2025-08-07' beta for 1M context window.
		awsBedrockServiceTier: z.enum(["STANDARD", "FLEX", "PRIORITY"]).optional(), // AWS Bedrock service tier selection
	},
})

const vertexProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.vertex,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		vertexKeyFile: z.string().optional(),
		vertexJsonCredentials: z.string().optional(),
		vertexProjectId: z.string().optional(),
		vertexRegion: z.string().optional(),
		vertex1MContext: z.boolean().optional(), // Enable 'context-1m-2025-08-07' beta for 1M context window.
	},
})

const openAiProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.openai,
	getModelId: (settings) => settings.openAiModelId,
	schema: {
		...baseProviderSettingsShape,
		openAiBaseUrl: z.string().optional(),
		openAiApiKey: z.string().optional(),
		openAiR1FormatEnabled: z.boolean().optional(),
		openAiModelId: z.string().optional(),
		openAiCustomModelInfo: modelInfoSchema.nullish(),
		openAiUseAzure: z.boolean().optional(),
		azureApiVersion: z.string().optional(),
		openAiStreamingEnabled: z.boolean().optional(),
		openAiHostHeader: z.string().optional(), // Keep temporarily for backward compatibility during migration.
		openAiHeaders: z.record(z.string(), z.string()).optional(),
	},
})

const ollamaProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.ollama,
	getModelId: (settings) => settings.ollamaModelId,
	schema: {
		...baseProviderSettingsShape,
		ollamaModelId: z.string().optional(),
		ollamaBaseUrl: z.string().optional(),
		ollamaApiKey: z.string().optional(),
		ollamaNumCtx: z.number().int().min(128).optional(),
	},
})

const vsCodeLmProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.vscodeLm,
	getModelId: (settings) => settings.vsCodeLmModelSelector?.id,
	schema: {
		...baseProviderSettingsShape,
		vsCodeLmModelSelector: z
			.object({
				vendor: z.string().optional(),
				family: z.string().optional(),
				version: z.string().optional(),
				id: z.string().optional(),
			})
			.optional(),
	},
})

const lmStudioProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.lmstudio,
	getModelId: (settings) => settings.lmStudioModelId,
	schema: {
		...baseProviderSettingsShape,
		lmStudioModelId: z.string().optional(),
		lmStudioBaseUrl: z.string().optional(),
		lmStudioDraftModelId: z.string().optional(),
		lmStudioSpeculativeDecodingEnabled: z.boolean().optional(),
	},
})

const geminiProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.gemini,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		geminiApiKey: z.string().optional(),
		googleGeminiBaseUrl: z.string().optional(),
	},
})

const geminiCliProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.geminiCli,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		geminiCliOAuthPath: z.string().optional(),
		geminiCliProjectId: z.string().optional(),
	},
})

const openAiCodexProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.openaiCodex,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		// Codex "Fast" mode maps to the Responses API priority service tier.
		[OPEN_AI_CODEX_SERVICE_TIER_KEY]: openAiCodexServiceTierSchema.optional(),
	},
})

const openAiNativeProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.openaiNative,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		openAiNativeApiKey: z.string().optional(),
		openAiNativeBaseUrl: z.string().optional(),
		// OpenAI Responses API service tier for openai-native provider only.
		// UI should only expose this when the selected model supports flex/priority.
		openAiNativeServiceTier: serviceTierSchema.optional(),
	},
})

const mistralProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.mistral,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		mistralApiKey: z.string().optional(),
		mistralCodestralUrl: z.string().optional(),
	},
})

const deepSeekProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.deepseek,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		deepSeekBaseUrl: z.string().optional(),
		deepSeekApiKey: z.string().optional(),
	},
})

const poeProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.poe,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		poeApiKey: z.string().optional(),
		poeBaseUrl: z.string().optional(),
	},
})

const moonshotProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.moonshot,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		moonshotBaseUrl: z
			.union([z.literal("https://api.moonshot.ai/v1"), z.literal("https://api.moonshot.cn/v1")])
			.optional(),
		moonshotApiKey: z.string().optional(),
	},
})

export const kimiCodeAuthMethodSchema = z.enum(["oauth", "api-key"])
export type KimiCodeAuthMethod = z.infer<typeof kimiCodeAuthMethodSchema>

const kimiCodeProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.kimiCode,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		kimiCodeAuthMethod: kimiCodeAuthMethodSchema.optional(),
		kimiCodeApiKey: z.string().optional(),
	},
})

const minimaxProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.minimax,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		minimaxBaseUrl: z
			.union([z.literal("https://api.minimax.io/v1"), z.literal("https://api.minimaxi.com/v1")])
			.optional(),
		minimaxApiKey: z.string().optional(),
	},
})

const mimoProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.mimo,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		mimoBaseUrl: z
			.union([
				z.literal("https://api.xiaomimimo.com/v1"),
				z.literal("https://token-plan-cn.xiaomimimo.com/v1"),
				z.literal("https://token-plan-sgp.xiaomimimo.com/v1"),
				z.literal("https://token-plan-ams.xiaomimimo.com/v1"),
			])
			.optional(),
		mimoApiKey: z.string().optional(),
	},
})

const requestyProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.requesty,
	getModelId: (settings) => settings.requestyModelId,
	schema: {
		...baseProviderSettingsShape,
		requestyBaseUrl: z.string().optional(),
		requestyApiKey: z.string().optional(),
		requestyModelId: z.string().optional(),
	},
})

const unboundProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.unbound,
	getModelId: (settings) => settings.unboundModelId,
	schema: {
		...baseProviderSettingsShape,
		unboundApiKey: z.string().optional(),
		unboundModelId: z.string().optional(),
	},
})

const fakeAiProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.fakeAi,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		fakeAi: z.unknown().optional(),
	},
})

const xaiProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.xai,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		xaiApiKey: z.string().optional(),
	},
})

const litellmProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.litellm,
	getModelId: (settings) => settings.litellmModelId,
	schema: {
		...baseProviderSettingsShape,
		litellmBaseUrl: z.string().optional(),
		litellmApiKey: z.string().optional(),
		litellmModelId: z.string().optional(),
		litellmUsePromptCache: z.boolean().optional(),
	},
})

const sambaNovaProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.sambanova,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		sambaNovaApiKey: z.string().optional(),
	},
})

export const zaiApiLineSchema = z.enum(["international_coding", "china_coding", "international_api", "china_api"])

export type ZaiApiLine = z.infer<typeof zaiApiLineSchema>

const zaiProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.zai,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		zaiApiKey: z.string().optional(),
		zaiApiLine: zaiApiLineSchema.optional(),
	},
})

const fireworksProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.fireworks,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		fireworksApiKey: z.string().optional(),
	},
})

const friendliProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.friendli,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		friendliApiKey: z.string().optional(),
	},
})

const qwenCodeProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.qwenCode,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		qwenCodeOauthPath: z.string().optional(),
	},
})

const vercelAiGatewayProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.vercelAiGateway,
	getModelId: (settings) => settings.vercelAiGatewayModelId,
	schema: {
		...baseProviderSettingsShape,
		vercelAiGatewayApiKey: z.string().optional(),
		vercelAiGatewayModelId: z.string().optional(),
	},
})

const opencodeGoProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.opencodeGo,
	getModelId: (settings) => settings.opencodeGoModelId,
	schema: {
		...baseProviderSettingsShape,
		opencodeGoApiKey: z.string().optional(),
		opencodeGoModelId: z.string().optional(),
	},
})

const kenariProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.kenari,
	getModelId: (settings) => settings.kenariModelId,
	schema: {
		...baseProviderSettingsShape,
		kenariApiKey: z.string().optional(),
		kenariModelId: z.string().optional(),
	},
})

const zooGatewayProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.zooGateway,
	getModelId: (settings) => settings.zooGatewayModelId,
	schema: {
		...baseProviderSettingsShape,
		zooSessionToken: z.string().optional(),
		zooGatewayModelId: z.string().optional(),
		zooGatewayBaseUrl: z.string().optional(),
	},
})

const basetenProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.baseten,
	getModelId: (settings) => settings.apiModelId,
	schema: {
		...apiModelIdProviderModelShape,
		basetenApiKey: z.string().optional(),
	},
})

type ProviderDefinition = {
	apiProvider: ProviderName
	settingsShape: z.ZodRawShape
	schema: z.ZodDiscriminatedUnionOption<typeof API_PROVIDER_FIELD>
	getModelId: ProviderModelIdAccessor
}

const providerDefinitionList = [
	anthropicProviderDefinition,
	openRouterProviderDefinition,
	bedrockProviderDefinition,
	vertexProviderDefinition,
	openAiProviderDefinition,
	ollamaProviderDefinition,
	vsCodeLmProviderDefinition,
	lmStudioProviderDefinition,
	geminiProviderDefinition,
	geminiCliProviderDefinition,
	openAiCodexProviderDefinition,
	openAiNativeProviderDefinition,
	mistralProviderDefinition,
	deepSeekProviderDefinition,
	poeProviderDefinition,
	moonshotProviderDefinition,
	kimiCodeProviderDefinition,
	minimaxProviderDefinition,
	mimoProviderDefinition,
	requestyProviderDefinition,
	unboundProviderDefinition,
	fakeAiProviderDefinition,
	xaiProviderDefinition,
	basetenProviderDefinition,
	litellmProviderDefinition,
	sambaNovaProviderDefinition,
	zaiProviderDefinition,
	fireworksProviderDefinition,
	friendliProviderDefinition,
	qwenCodeProviderDefinition,
	vercelAiGatewayProviderDefinition,
	opencodeGoProviderDefinition,
	kenariProviderDefinition,
	zooGatewayProviderDefinition,
] as const satisfies readonly ProviderDefinition[]

type ListedProvider = (typeof providerDefinitionList)[number][typeof API_PROVIDER_FIELD]
const allProvidersAreDefined: Exclude<ProviderName, ListedProvider> extends never ? true : never = true
void allProvidersAreDefined

const indexProviderDefinitions = (
	definitions: readonly ProviderDefinition[],
): Partial<Record<ProviderName, ProviderDefinition>> => {
	const indexedDefinitions: Partial<Record<ProviderName, ProviderDefinition>> = {}

	for (const definition of definitions) {
		if (indexedDefinitions[definition.apiProvider]) {
			console.warn(`Duplicate provider definition ignored: ${definition.apiProvider}`)
		}

		indexedDefinitions[definition.apiProvider] ??= definition
	}

	for (const provider of providerNames) {
		if (!indexedDefinitions[provider]) {
			console.warn(`Missing provider definition: ${provider}`)
		}
	}

	return indexedDefinitions
}

const providerDefinitions = indexProviderDefinitions(providerDefinitionList)

const defaultSchema = z.object({
	[API_PROVIDER_FIELD]: z.undefined(),
})

type ProviderDefinitionSchemas<D extends readonly ProviderDefinition[]> = {
	[K in keyof D]: D[K]["schema"]
}

const getDiscriminatedSchemas = <const D extends readonly [ProviderDefinition, ...ProviderDefinition[]]>(
	definitions: D,
): ProviderDefinitionSchemas<D> => {
	const [firstDefinition, ...remainingDefinitions] = definitions
	return [
		firstDefinition.schema,
		...remainingDefinitions.map((definition) => definition.schema),
	] as ProviderDefinitionSchemas<D>
}

const providerDiscriminatedSchemas = getDiscriminatedSchemas(providerDefinitionList)

export const providerSettingsSchemaDiscriminated = z.discriminatedUnion(API_PROVIDER_FIELD, [
	...providerDiscriminatedSchemas,
	defaultSchema,
])

type ProviderSettingsShape = UnionToIntersection<(typeof providerDefinitionList)[number][typeof SETTINGS_SHAPE_FIELD]>

const providerSettingsObjectSchema = providerDefinitionList.reduce<z.AnyZodObject>(
	(schema, definition) => schema.merge(z.object(definition[SETTINGS_SHAPE_FIELD])),
	z.object({}),
)

const providerSettingsShape = providerSettingsObjectSchema.shape as ProviderSettingsShape

export const providerSettingsSchema = z.object({
	[API_PROVIDER_FIELD]: providerNamesWithRetiredSchema.optional(),
	...providerSettingsShape,
	...codebaseIndexProviderSchema.shape,
})

export type ProviderSettings = z.infer<typeof providerSettingsSchema>

export const providerSettingsWithIdSchema = providerSettingsSchema.extend({ id: z.string().optional() })

export const discriminatedProviderSettingsWithIdSchema = providerSettingsSchemaDiscriminated.and(
	z.object({ id: z.string().optional() }),
)

export type ProviderSettingsWithId = z.infer<typeof providerSettingsWithIdSchema>

export const PROVIDER_SETTINGS_KEYS = providerSettingsSchema.keyof().options

/**
 * @deprecated Use `getModelId()` to resolve the model ID for the active provider.
 */
export const modelIdKeys = [
	"apiModelId",
	"openRouterModelId",
	"openAiModelId",
	"ollamaModelId",
	"lmStudioModelId",
	"lmStudioDraftModelId",
	"requestyModelId",
	"unboundModelId",
	"litellmModelId",
	"vercelAiGatewayModelId",
	"opencodeGoModelId",
	"kenariModelId",
	"zooGatewayModelId",
] as const satisfies readonly (keyof ProviderSettings)[]

/**
 * @deprecated Use `getModelId()` to resolve the model ID for the active provider.
 */
export type ModelIdKey = (typeof modelIdKeys)[number]

/**
 * @deprecated Provider categories should use the specific provider type guards.
 */
export type TypicalProvider = Exclude<ProviderName, InternalProvider | CustomProvider | FauxProvider>

/**
 * @deprecated Use the specific provider type guards instead.
 */
export const isTypicalProvider = (key: unknown): key is TypicalProvider =>
	isProviderName(key) && !isInternalProvider(key) && !isCustomProvider(key) && !isFauxProvider(key)

/**
 * @deprecated Use `getModelId()` instead. This map is retained for API compatibility.
 */
export const modelIdKeysByProvider: Record<TypicalProvider, ModelIdKey> = {
	[providerIdentifiers.anthropic]: "apiModelId",
	[providerIdentifiers.openrouter]: "openRouterModelId",
	[providerIdentifiers.bedrock]: "apiModelId",
	[providerIdentifiers.vertex]: "apiModelId",
	[providerIdentifiers.openaiCodex]: "apiModelId",
	[providerIdentifiers.openaiNative]: "apiModelId",
	[providerIdentifiers.ollama]: "ollamaModelId",
	[providerIdentifiers.lmstudio]: "lmStudioModelId",
	[providerIdentifiers.gemini]: "apiModelId",
	[providerIdentifiers.geminiCli]: "apiModelId",
	[providerIdentifiers.mistral]: "apiModelId",
	[providerIdentifiers.moonshot]: "apiModelId",
	[providerIdentifiers.kimiCode]: "apiModelId",
	[providerIdentifiers.minimax]: "apiModelId",
	[providerIdentifiers.mimo]: "apiModelId",
	[providerIdentifiers.deepseek]: "apiModelId",
	[providerIdentifiers.poe]: "apiModelId",
	[providerIdentifiers.qwenCode]: "apiModelId",
	[providerIdentifiers.requesty]: "requestyModelId",
	[providerIdentifiers.unbound]: "unboundModelId",
	[providerIdentifiers.xai]: "apiModelId",
	[providerIdentifiers.baseten]: "apiModelId",
	[providerIdentifiers.litellm]: "litellmModelId",
	[providerIdentifiers.sambanova]: "apiModelId",
	[providerIdentifiers.zai]: "apiModelId",
	[providerIdentifiers.fireworks]: "apiModelId",
	[providerIdentifiers.friendli]: "apiModelId",
	[providerIdentifiers.vercelAiGateway]: "vercelAiGatewayModelId",
	[providerIdentifiers.opencodeGo]: "opencodeGoModelId",
	[providerIdentifiers.kenari]: "kenariModelId",
	[providerIdentifiers.zooGateway]: "zooGatewayModelId",
}

export function getModelId(settings: ProviderSettings): string | undefined {
	if (isProviderName(settings.apiProvider)) {
		return providerDefinitions[settings.apiProvider]?.getModelId(settings)
	}

	if (typeof settings.apiProvider === "string" && isRetiredProvider(settings.apiProvider)) {
		const modelIdKey = modelIdKeys.find((key) => settings[key])
		return modelIdKey ? settings[modelIdKey] : undefined
	}

	return undefined
}

/**
 * ANTHROPIC_STYLE_PROVIDERS
 */

// Providers that use Anthropic-style API protocol.
export const ANTHROPIC_STYLE_PROVIDERS: ProviderName[] = [
	providerIdentifiers.anthropic,
	providerIdentifiers.bedrock,
	providerIdentifiers.minimax,
]

const ANTHROPIC_MODEL_GATEWAY_PROVIDERS: ProviderName[] = [
	providerIdentifiers.vercelAiGateway,
	providerIdentifiers.zooGateway,
]

const ANTHROPIC_MODEL_ID_PREFIX = "anthropic/"
const CLAUDE_MODEL_ID_FRAGMENT = "claude"

export const getApiProtocol = (provider: ProviderName | undefined, modelId?: string): "anthropic" | "openai" => {
	if (provider && ANTHROPIC_STYLE_PROVIDERS.includes(provider)) {
		return ANTHROPIC_API_PROTOCOL
	}

	if (
		provider &&
		provider === providerIdentifiers.vertex &&
		modelId &&
		modelId.toLowerCase().includes(CLAUDE_MODEL_ID_FRAGMENT)
	) {
		return ANTHROPIC_API_PROTOCOL
	}

	// Vercel AI Gateway and Zoo Gateway use the anthropic protocol for anthropic models.
	if (
		provider &&
		ANTHROPIC_MODEL_GATEWAY_PROVIDERS.includes(provider) &&
		modelId &&
		modelId.toLowerCase().startsWith(ANTHROPIC_MODEL_ID_PREFIX)
	) {
		return ANTHROPIC_API_PROTOCOL
	}

	// Opencode Go routes a subset of its models (Qwen, MiniMax) through the
	// Anthropic Messages wire format (`/v1/messages`), which reports usage in
	// Anthropic style: `input_tokens` excludes cache tokens, with separate
	// `cache_creation_input_tokens` / `cache_read_input_tokens` fields. These
	// models must use the anthropic protocol so token/cost aggregation adds the
	// cache tokens back into the input total — otherwise the cached prefix is
	// dropped from `contextTokens`, undercounting context-window usage.
	if (
		provider &&
		provider === providerIdentifiers.opencodeGo &&
		modelId &&
		isOpencodeGoAnthropicFormatModel(modelId)
	) {
		return ANTHROPIC_API_PROTOCOL
	}

	return OPENAI_API_PROTOCOL
}

/**
 * MODELS_BY_PROVIDER
 */

export const MODELS_BY_PROVIDER: Record<
	Exclude<
		ProviderName,
		typeof providerIdentifiers.fakeAi | typeof providerIdentifiers.geminiCli | typeof providerIdentifiers.openai
	>,
	{ id: ProviderName; label: string; models: string[] }
> = {
	[providerIdentifiers.anthropic]: {
		id: providerIdentifiers.anthropic,
		label: "Anthropic",
		models: Object.keys(anthropicModels),
	},
	[providerIdentifiers.bedrock]: {
		id: providerIdentifiers.bedrock,
		label: "Amazon Bedrock",
		models: Object.keys(bedrockModels),
	},
	[providerIdentifiers.deepseek]: {
		id: providerIdentifiers.deepseek,
		label: "DeepSeek",
		models: Object.keys(deepSeekModels),
	},
	[providerIdentifiers.fireworks]: {
		id: providerIdentifiers.fireworks,
		label: "Fireworks",
		models: Object.keys(fireworksModels),
	},
	[providerIdentifiers.friendli]: {
		id: providerIdentifiers.friendli,
		label: "Friendli",
		models: Object.keys(friendliModels),
	},
	[providerIdentifiers.gemini]: {
		id: providerIdentifiers.gemini,
		label: "Google Gemini",
		models: Object.keys(geminiModels),
	},
	[providerIdentifiers.mistral]: {
		id: providerIdentifiers.mistral,
		label: "Mistral",
		models: Object.keys(mistralModels),
	},
	[providerIdentifiers.moonshot]: {
		id: providerIdentifiers.moonshot,
		label: "Moonshot",
		models: Object.keys(moonshotModels),
	},
	[providerIdentifiers.kimiCode]: {
		id: providerIdentifiers.kimiCode,
		label: "Kimi Code",
		models: [],
	},
	[providerIdentifiers.minimax]: {
		id: providerIdentifiers.minimax,
		label: "MiniMax",
		models: Object.keys(minimaxModels),
	},
	[providerIdentifiers.mimo]: {
		id: providerIdentifiers.mimo,
		label: "Xiaomi MiMo",
		models: Object.keys(mimoModels),
	},
	[providerIdentifiers.openaiCodex]: {
		id: providerIdentifiers.openaiCodex,
		label: "OpenAI - ChatGPT Plus/Pro",
		models: Object.keys(openAiCodexModels),
	},
	[providerIdentifiers.openaiNative]: {
		id: providerIdentifiers.openaiNative,
		label: "OpenAI",
		models: Object.keys(openAiNativeModels),
	},
	[providerIdentifiers.qwenCode]: {
		id: providerIdentifiers.qwenCode,
		label: "Qwen Code",
		models: Object.keys(qwenCodeModels),
	},
	[providerIdentifiers.sambanova]: {
		id: providerIdentifiers.sambanova,
		label: "SambaNova",
		models: Object.keys(sambaNovaModels),
	},
	[providerIdentifiers.vertex]: {
		id: providerIdentifiers.vertex,
		label: "GCP Vertex AI",
		models: Object.keys(vertexModels),
	},
	[providerIdentifiers.vscodeLm]: {
		id: providerIdentifiers.vscodeLm,
		label: "VS Code LM API",
		models: Object.keys(vscodeLlmModels),
	},
	[providerIdentifiers.xai]: { id: providerIdentifiers.xai, label: "xAI (Grok)", models: Object.keys(xaiModels) },
	[providerIdentifiers.zai]: {
		id: providerIdentifiers.zai,
		label: "Z.ai",
		models: Object.keys(internationalZAiModels),
	},
	[providerIdentifiers.baseten]: {
		id: providerIdentifiers.baseten,
		label: "Baseten",
		models: Object.keys(basetenModels),
	},

	// Dynamic providers; models pulled from remote APIs.
	[providerIdentifiers.poe]: { id: providerIdentifiers.poe, label: "Poe", models: [] },
	[providerIdentifiers.litellm]: { id: providerIdentifiers.litellm, label: "LiteLLM", models: [] },
	[providerIdentifiers.openrouter]: { id: providerIdentifiers.openrouter, label: "OpenRouter", models: [] },
	[providerIdentifiers.requesty]: { id: providerIdentifiers.requesty, label: "Requesty", models: [] },
	[providerIdentifiers.unbound]: { id: providerIdentifiers.unbound, label: "Unbound", models: [] },
	[providerIdentifiers.vercelAiGateway]: {
		id: providerIdentifiers.vercelAiGateway,
		label: "Vercel AI Gateway",
		models: [],
	},
	[providerIdentifiers.opencodeGo]: { id: providerIdentifiers.opencodeGo, label: "Opencode Go", models: [] },
	[providerIdentifiers.kenari]: { id: providerIdentifiers.kenari, label: "Kenari", models: [] },
	[providerIdentifiers.zooGateway]: { id: providerIdentifiers.zooGateway, label: "Zoo Gateway", models: [] },

	// Local providers; models discovered from localhost endpoints.
	[providerIdentifiers.lmstudio]: { id: providerIdentifiers.lmstudio, label: "LM Studio", models: [] },
	[providerIdentifiers.ollama]: { id: providerIdentifiers.ollama, label: "Ollama", models: [] },
}
