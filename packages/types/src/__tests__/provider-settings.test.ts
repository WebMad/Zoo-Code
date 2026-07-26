import { ANTHROPIC_API_PROTOCOL, getApiProtocol, providerIdentifiers } from "../index.js"

describe("getApiProtocol", () => {
	describe("Anthropic-style providers", () => {
		it("should return 'anthropic' for anthropic provider", () => {
			expect(getApiProtocol(providerIdentifiers.anthropic)).toBe(ANTHROPIC_API_PROTOCOL)
			expect(getApiProtocol(providerIdentifiers.anthropic, "gpt-4")).toBe(ANTHROPIC_API_PROTOCOL)
		})

		it("should return 'anthropic' for bedrock provider", () => {
			expect(getApiProtocol(providerIdentifiers.bedrock)).toBe(ANTHROPIC_API_PROTOCOL)
			expect(getApiProtocol(providerIdentifiers.bedrock, "gpt-4")).toBe(ANTHROPIC_API_PROTOCOL)
			expect(getApiProtocol(providerIdentifiers.bedrock, "claude-3-opus")).toBe(ANTHROPIC_API_PROTOCOL)
		})
	})

	describe("Vertex provider with Claude models", () => {
		it("should return 'anthropic' for vertex provider with claude models", () => {
			expect(getApiProtocol(providerIdentifiers.vertex, "claude-3-opus")).toBe(ANTHROPIC_API_PROTOCOL)
			expect(getApiProtocol(providerIdentifiers.vertex, "Claude-3-Sonnet")).toBe(ANTHROPIC_API_PROTOCOL)
			expect(getApiProtocol(providerIdentifiers.vertex, "CLAUDE-instant")).toBe(ANTHROPIC_API_PROTOCOL)
			expect(getApiProtocol(providerIdentifiers.vertex, "anthropic/claude-3-haiku")).toBe(ANTHROPIC_API_PROTOCOL)
		})

		it("should return 'openai' for vertex provider with non-claude models", () => {
			expect(getApiProtocol(providerIdentifiers.vertex, "gpt-4")).toBe("openai")
			expect(getApiProtocol(providerIdentifiers.vertex, "gemini-pro")).toBe("openai")
			expect(getApiProtocol(providerIdentifiers.vertex, "llama-2")).toBe("openai")
		})

		it("should return 'openai' for vertex provider without model", () => {
			expect(getApiProtocol(providerIdentifiers.vertex)).toBe("openai")
		})
	})

	describe("Vercel AI Gateway provider", () => {
		it("uses canonical gateway identifiers for Anthropic model protocol selection", () => {
			expect(getApiProtocol(providerIdentifiers.vercelAiGateway, "anthropic/claude-3-opus")).toBe(
				ANTHROPIC_API_PROTOCOL,
			)
			expect(getApiProtocol(providerIdentifiers.zooGateway, "anthropic/claude-3-opus")).toBe(
				ANTHROPIC_API_PROTOCOL,
			)
		})

		it("should return 'anthropic' for vercel-ai-gateway provider with anthropic models", () => {
			expect(getApiProtocol(providerIdentifiers.vercelAiGateway, "anthropic/claude-3-opus")).toBe(
				ANTHROPIC_API_PROTOCOL,
			)
			expect(getApiProtocol(providerIdentifiers.vercelAiGateway, "anthropic/claude-3.5-sonnet")).toBe(
				ANTHROPIC_API_PROTOCOL,
			)
			expect(getApiProtocol(providerIdentifiers.vercelAiGateway, "ANTHROPIC/claude-sonnet-4")).toBe(
				ANTHROPIC_API_PROTOCOL,
			)
			expect(getApiProtocol(providerIdentifiers.vercelAiGateway, "anthropic/claude-opus-4.1")).toBe(
				ANTHROPIC_API_PROTOCOL,
			)
		})

		it("should return 'openai' for vercel-ai-gateway provider with non-anthropic models", () => {
			expect(getApiProtocol(providerIdentifiers.vercelAiGateway, "openai/gpt-4")).toBe("openai")
			expect(getApiProtocol(providerIdentifiers.vercelAiGateway, "google/gemini-pro")).toBe("openai")
			expect(getApiProtocol(providerIdentifiers.vercelAiGateway, "meta/llama-3")).toBe("openai")
			expect(getApiProtocol(providerIdentifiers.vercelAiGateway, "mistral/mixtral")).toBe("openai")
		})

		it("should return 'openai' for vercel-ai-gateway provider without model", () => {
			expect(getApiProtocol(providerIdentifiers.vercelAiGateway)).toBe("openai")
		})
	})

	describe("Opencode Go provider", () => {
		it("should return 'anthropic' for opencode-go Anthropic-format models (Qwen/MiniMax)", () => {
			expect(getApiProtocol(providerIdentifiers.opencodeGo, "qwen3.7-max")).toBe(ANTHROPIC_API_PROTOCOL)
			expect(getApiProtocol(providerIdentifiers.opencodeGo, "qwen3.7-plus")).toBe(ANTHROPIC_API_PROTOCOL)
			expect(getApiProtocol(providerIdentifiers.opencodeGo, "qwen3.6-plus")).toBe(ANTHROPIC_API_PROTOCOL)
			expect(getApiProtocol(providerIdentifiers.opencodeGo, "minimax-m3")).toBe(ANTHROPIC_API_PROTOCOL)
			expect(getApiProtocol(providerIdentifiers.opencodeGo, "minimax-m2.7")).toBe(ANTHROPIC_API_PROTOCOL)
			expect(getApiProtocol(providerIdentifiers.opencodeGo, "minimax-m2.5")).toBe(ANTHROPIC_API_PROTOCOL)
		})

		it("should return 'openai' for opencode-go OpenAI-format models (GLM/DeepSeek/etc.)", () => {
			expect(getApiProtocol(providerIdentifiers.opencodeGo, "glm-5.2")).toBe("openai")
			expect(getApiProtocol(providerIdentifiers.opencodeGo, "deepseek-v4-pro")).toBe("openai")
			expect(getApiProtocol(providerIdentifiers.opencodeGo, "kimi-k2.5")).toBe("openai")
			expect(getApiProtocol(providerIdentifiers.opencodeGo, "mimo-v2.5")).toBe("openai")
		})

		it("should return 'openai' for opencode-go without a model", () => {
			expect(getApiProtocol(providerIdentifiers.opencodeGo)).toBe("openai")
		})

		it("should return 'openai' for opencode-go with an unknown model id", () => {
			expect(getApiProtocol(providerIdentifiers.opencodeGo, "some-future-model")).toBe("openai")
		})
	})

	describe("Other providers", () => {
		it("should return 'openai' for non-anthropic providers regardless of model", () => {
			expect(getApiProtocol(providerIdentifiers.openrouter, "claude-3-opus")).toBe("openai")
			expect(getApiProtocol(providerIdentifiers.openai, "claude-3-sonnet")).toBe("openai")
			expect(getApiProtocol(providerIdentifiers.litellm, "claude-instant")).toBe("openai")
			expect(getApiProtocol(providerIdentifiers.ollama, "claude-model")).toBe("openai")
		})
	})

	describe("Edge cases", () => {
		it("should return 'openai' when provider is undefined", () => {
			expect(getApiProtocol(undefined)).toBe("openai")
			expect(getApiProtocol(undefined, "claude-3-opus")).toBe("openai")
		})

		it("should handle empty strings", () => {
			expect(getApiProtocol(providerIdentifiers.vertex, "")).toBe("openai")
		})

		it("should be case-insensitive for claude detection", () => {
			expect(getApiProtocol(providerIdentifiers.vertex, "CLAUDE-3-OPUS")).toBe(ANTHROPIC_API_PROTOCOL)
			expect(getApiProtocol(providerIdentifiers.vertex, "claude-3-opus")).toBe(ANTHROPIC_API_PROTOCOL)
			expect(getApiProtocol(providerIdentifiers.vertex, "ClAuDe-InStAnT")).toBe(ANTHROPIC_API_PROTOCOL)
		})
	})
})
