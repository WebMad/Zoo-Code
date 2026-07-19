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

describe("Fallback Extension Integration Tests", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it.each(["manual.txt", "legacy.vb", "service.scala", "client.swift"])(
		"returns undefined for %s without loading a tree-sitter parser",
		async (filePath) => {
			const result = await parseSourceCodeDefinitionsForFile(filePath)

			expect(result).toBeUndefined()
		},
	)

	afterEach(() => {
		expect(loadRequiredLanguageParsers).not.toHaveBeenCalled()
		expect(fs.readFile).not.toHaveBeenCalled()
	})
})
