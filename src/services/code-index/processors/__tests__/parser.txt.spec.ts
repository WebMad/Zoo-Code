import { CodeParser } from "../parser"
import { scannerExtensions, shouldUseFallbackChunking } from "../../shared/supported-extensions"

vi.mock("../../../../../packages/telemetry/src/TelemetryService", () => ({
	TelemetryService: {
		instance: {
			captureEvent: vi.fn(),
		},
	},
}))

describe("CodeParser - plain text support", () => {
	it("supports .txt files through fallback chunking", async () => {
		expect(scannerExtensions).toContain(".txt")
		expect(shouldUseFallbackChunking(".txt")).toBe(true)

		const content = [
			"Zoo Code plain text indexing regression test.",
			"This sentence contains searchable content that only exists in the text file.",
			"The fallback parser should preserve every line while creating an indexable chunk.",
		].join("\n")

		const blocks = await new CodeParser().parseFile("manual.txt", {
			content,
			fileHash: "txt-file-hash",
		})

		expect(blocks).toHaveLength(1)
		expect(blocks[0]).toMatchObject({
			file_path: "manual.txt",
			type: "fallback_chunk",
			start_line: 1,
			end_line: 3,
			content,
			fileHash: "txt-file-hash",
		})
	})

	it("matches uppercase .TXT extensions", () => {
		expect(shouldUseFallbackChunking(".TXT")).toBe(true)
	})
})
