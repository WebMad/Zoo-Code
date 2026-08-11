import { z } from "zod"

import { providerIdentifiers } from "../provider-identifiers.js"
import {
	VERCEL_AI_GATEWAY_MODEL_ID_FIELD,
	baseProviderSettingsShape,
	createModelIdAccessor,
	createProviderDefinition,
} from "./common.js"

export const vercelAiGatewayProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.vercelAiGateway,
	modelIdKey: VERCEL_AI_GATEWAY_MODEL_ID_FIELD,
	getModelId: createModelIdAccessor(VERCEL_AI_GATEWAY_MODEL_ID_FIELD),
	schema: {
		...baseProviderSettingsShape,
		vercelAiGatewayApiKey: z.string().optional(),
		[VERCEL_AI_GATEWAY_MODEL_ID_FIELD]: z.string().optional(),
	},
})
