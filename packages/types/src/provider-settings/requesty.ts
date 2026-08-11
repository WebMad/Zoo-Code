import { z } from "zod"

import { providerIdentifiers } from "../provider-identifiers.js"
import {
	REQUESTY_MODEL_ID_FIELD,
	baseProviderSettingsShape,
	createModelIdAccessor,
	createProviderDefinition,
} from "./common.js"

export const requestyProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.requesty,
	modelIdKey: REQUESTY_MODEL_ID_FIELD,
	getModelId: createModelIdAccessor(REQUESTY_MODEL_ID_FIELD),
	schema: {
		...baseProviderSettingsShape,
		requestyBaseUrl: z.string().optional(),
		requestyApiKey: z.string().optional(),
		[REQUESTY_MODEL_ID_FIELD]: z.string().optional(),
	},
})
