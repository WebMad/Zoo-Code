import { z } from "zod"

import { providerIdentifiers } from "../provider-identifiers.js"
import {
	LM_STUDIO_MODEL_ID_FIELD,
	baseProviderSettingsShape,
	createModelIdAccessor,
	createProviderDefinition,
} from "./common.js"

export const lmStudioProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.lmstudio,
	modelIdKey: LM_STUDIO_MODEL_ID_FIELD,
	getModelId: createModelIdAccessor(LM_STUDIO_MODEL_ID_FIELD),
	schema: {
		...baseProviderSettingsShape,
		[LM_STUDIO_MODEL_ID_FIELD]: z.string().optional(),
		lmStudioBaseUrl: z.string().optional(),
		lmStudioDraftModelId: z.string().optional(),
		lmStudioSpeculativeDecodingEnabled: z.boolean().optional(),
	},
})
