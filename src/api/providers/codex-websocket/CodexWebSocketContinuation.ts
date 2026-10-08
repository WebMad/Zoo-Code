import type { CachedCodexResponse } from "./CachedCodexResponse"
import { CodexWebSocketItemSnapshot } from "./CodexWebSocketItemSnapshot"
import type { PreparedCodexRequest } from "./PreparedCodexRequest"
import { fingerprint, asJsonObject, type JsonObject } from "./protocol"

/** Compares the server output with the history Zoo can reconstruct, retaining only hashes. */
export class CodexWebSocketContinuation {
	private cached?: CachedCodexResponse

	reset(): void {
		this.cached = undefined
	}

	prepare(body: unknown): PreparedCodexRequest {
		const request = asJsonObject(body)
		if (!Array.isArray(request.input)) throw new Error("Codex WebSocket input must be an array")
		const { input: _input, ...settings } = request
		const settingsKey = fingerprint(settings)
		const snapshots = request.input.map((item) => CodexWebSocketItemSnapshot.create(item))
		return {
			request,
			input: request.input,
			snapshots,
			settings: settingsKey,
			previousResponseId: this.cached?.id,
			offset: this.cached?.input.length ?? 0,
			fullContextReason: this.getFullContextReason(settingsKey, snapshots),
		}
	}

	record(prepared: PreparedCodexRequest, response: JsonObject, streamedOutput: unknown[]): void {
		const output = Array.isArray(response.output) ? response.output : streamedOutput
		// Zoo replays only encrypted reasoning. Plain reasoning remains in the server cache,
		// but must not occupy a slot in the local history prefix.
		const replayable = output.filter((value) => {
			const item = asJsonObject(value)
			return item.type !== "reasoning" || Boolean(item.encrypted_content)
		})
		this.cached =
			typeof response.id === "string"
				? {
						id: response.id,
						settings: prepared.settings,
						input: [
							...prepared.snapshots,
							...replayable.map((item) => CodexWebSocketItemSnapshot.create(item)),
						],
					}
				: undefined
	}

	private getFullContextReason(settings: string, input: CodexWebSocketItemSnapshot[]): string | undefined {
		const previous = this.cached
		if (!previous) return "no cached response"
		if (previous.settings !== settings) return "request settings changed"
		if (previous.input.length > input.length) return "history shortened"
		const index = previous.input.findIndex((item, index) => item.hash !== input[index].hash)
		if (index !== -1) {
			const before = previous.input[index]
			const after = input[index]
			const fields = before.changedFields(after)
			return `history changed at item ${index}: ${before.type} -> ${after.type}; fields: ${fields.join(", ")}`
		}
		return undefined
	}
}
