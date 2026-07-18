// Mocks must come first, before imports

vi.mock("fs/promises", () => ({
	readFile: vi.fn(),
}))

vi.mock("../../../utils/fs", () => ({
	fileExistsAtPath: vi.fn().mockResolvedValue(true),
}))

vi.mock("../languageParser", () => ({
	loadRequiredLanguageParsers: vi.fn(),
}))

import * as fs from "fs/promises"
import { loadRequiredLanguageParsers } from "../languageParser"
import { parseSourceCodeDefinitionsForFile } from "../index"

describe("Plain Text Integration Tests", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("returns undefined without loading a tree-sitter parser", async () => {
		const result = await parseSourceCodeDefinitionsForFile("manual.txt")

		expect(result).toBeUndefined()
		expect(loadRequiredLanguageParsers).not.toHaveBeenCalled()
		expect(fs.readFile).not.toHaveBeenCalled()
	})
})
