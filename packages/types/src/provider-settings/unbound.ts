import { z } from "zod"

import { providerIdentifiers } from "../provider-identifiers.js"
import {
	UNBOUND_MODEL_ID_FIELD,
	baseProviderSettingsShape,
	createModelIdAccessor,
	createProviderDefinition,
} from "./common.js"

export const unboundProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.unbound,
	modelIdKey: UNBOUND_MODEL_ID_FIELD,
	getModelId: createModelIdAccessor(UNBOUND_MODEL_ID_FIELD),
	schema: {
		...baseProviderSettingsShape,
		unboundApiKey: z.string().optional(),
		[UNBOUND_MODEL_ID_FIELD]: z.string().optional(),
	},
})
