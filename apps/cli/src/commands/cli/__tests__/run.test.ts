import fs from "fs"
import path from "path"
import os from "os"

import { providerIdentifiers } from "@roo-code/types"
import { DEFAULT_FLAGS } from "@/types/index.js"
import {
	resolveLegacyRequireApproval,
	resolveModel,
	resolveProvider,
	resolveReasoningEffort,
	resolveWorkspacePath,
} from "../run.js"

describe("resolveModel", () => {
	it("uses the CLI flag before the settings model", () => {
		expect(resolveModel("flag-model", "settings-model")).toBe("flag-model")
	})

	it("uses the settings model when the CLI flag is absent", () => {
		expect(resolveModel(undefined, "settings-model")).toBe("settings-model")
	})

	it("uses the default model when neither the CLI flag nor settings provide one", () => {
		expect(resolveModel()).toBe(DEFAULT_FLAGS.model)
	})
})

describe("resolveReasoningEffort", () => {
	it("uses CLI, settings, and default values in priority order", () => {
		expect(resolveReasoningEffort("high", "low")).toBe("high")
		expect(resolveReasoningEffort(undefined, "low")).toBe("low")
		expect(resolveReasoningEffort()).toBe(DEFAULT_FLAGS.reasoningEffort)
	})
})

describe("resolveProvider", () => {
	it("uses CLI, settings, and openrouter values in priority order", () => {
		expect(resolveProvider(providerIdentifiers.anthropic, providerIdentifiers.gemini)).toBe(
			providerIdentifiers.anthropic,
		)
		expect(resolveProvider(undefined, providerIdentifiers.gemini)).toBe(providerIdentifiers.gemini)
		expect(resolveProvider()).toBe(providerIdentifiers.openrouter)
	})
})

describe("resolveWorkspacePath", () => {
	it("resolves the provided workspace path", () => {
		expect(resolveWorkspacePath("relative/workspace")).toBe(path.resolve("relative/workspace"))
	})

	it("uses the current working directory when workspace is absent", () => {
		expect(resolveWorkspacePath()).toBe(process.cwd())
	})
})

describe("resolveLegacyRequireApproval", () => {
	it.each([
		{ requireApproval: true, dangerouslySkipPermissions: true, expected: true },
		{ requireApproval: false, dangerouslySkipPermissions: false, expected: false },
		{ requireApproval: undefined, dangerouslySkipPermissions: false, expected: true },
		{ requireApproval: undefined, dangerouslySkipPermissions: true, expected: false },
		{ requireApproval: undefined, dangerouslySkipPermissions: undefined, expected: undefined },
	])(
		"resolves requireApproval=$requireApproval and dangerouslySkipPermissions=$dangerouslySkipPermissions",
		({ requireApproval, dangerouslySkipPermissions, expected }) => {
			expect(resolveLegacyRequireApproval(requireApproval, dangerouslySkipPermissions)).toBe(expected)
		},
	)
})

describe("run command --prompt-file option", () => {
	let tempDir: string
	let promptFilePath: string

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-test-"))
		promptFilePath = path.join(tempDir, "prompt.md")
	})

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true })
	})

	it("should read prompt from file when --prompt-file is provided", () => {
		const promptContent = `This is a test prompt with special characters:
- Quotes: "hello" and 'world'
- Backticks: \`code\`
- Newlines and tabs
- Unicode: 你好 🎉`

		fs.writeFileSync(promptFilePath, promptContent)

		// Verify the file was written correctly
		const readContent = fs.readFileSync(promptFilePath, "utf-8")
		expect(readContent).toBe(promptContent)
	})

	it("should handle multi-line prompts correctly", () => {
		const multiLinePrompt = `Line 1
Line 2
Line 3

Empty line above
\tTabbed line
  Indented line`

		fs.writeFileSync(promptFilePath, multiLinePrompt)
		const readContent = fs.readFileSync(promptFilePath, "utf-8")

		expect(readContent).toBe(multiLinePrompt)
		expect(readContent.split("\n")).toHaveLength(7)
	})

	it("should handle very long prompts that would exceed ARG_MAX", () => {
		// ARG_MAX is typically 128KB-2MB, so let's test with a 500KB prompt
		const longPrompt = "x".repeat(500 * 1024)

		fs.writeFileSync(promptFilePath, longPrompt)
		const readContent = fs.readFileSync(promptFilePath, "utf-8")

		expect(readContent.length).toBe(500 * 1024)
		expect(readContent).toBe(longPrompt)
	})

	it("should preserve shell-sensitive characters", () => {
		const shellSensitivePrompt = `
$HOME
$(echo dangerous)
\`rm -rf /\`
"quoted string"
'single quoted'
$((1+1))
&&
||
;
> /dev/null
< input.txt
| grep something
*
?
[abc]
{a,b}
~
!
#comment
%s
\n\t\r
`

		fs.writeFileSync(promptFilePath, shellSensitivePrompt)
		const readContent = fs.readFileSync(promptFilePath, "utf-8")

		// All shell-sensitive characters should be preserved exactly
		expect(readContent).toBe(shellSensitivePrompt)
		expect(readContent).toContain("$HOME")
		expect(readContent).toContain("$(echo dangerous)")
		expect(readContent).toContain("`rm -rf /`")
	})
})
