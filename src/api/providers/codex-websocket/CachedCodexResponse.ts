import type { CodexWebSocketItemSnapshot } from "./CodexWebSocketItemSnapshot"

export interface CachedCodexResponse {
	id: string
	settings: string
	input: CodexWebSocketItemSnapshot[]
}
