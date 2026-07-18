import { dartQuery } from "../queries"
import { testParseSourceCodeDefinitions } from "./helpers"
import sampleDartContent from "./fixtures/sample-dart"

const dartOptions = {
	language: "dart",
	wasmFile: "tree-sitter-dart.wasm",
	queryString: dartQuery,
	extKey: "dart",
}

describe("parseSourceCodeDefinitionsForFile with Dart", () => {
	it("should capture common Dart declarations", async () => {
		const result = await testParseSourceCodeDefinitions("/test/file.dart", sampleDartContent, dartOptions)

		expect(result).toMatch(/abstract class Animal/)
		expect(result).toMatch(/class Point/)
		expect(result).toMatch(/const Point\(\)/)
		expect(result).toMatch(/Point\.named\(\)/)
		expect(result).toMatch(/factory Point\.origin\(\)/)
		expect(result).toMatch(/int get x/)
		expect(result).toMatch(/set x\(int value\)/)
		expect(result).toMatch(/Point operator \+/)
		expect(result).toMatch(/mixin Runner/)
		expect(result).toMatch(/enum Status/)
		expect(result).toMatch(/const Status\(\)/)
		expect(result).toMatch(/class Dog extends Animal with Runner/)
		expect(result).toMatch(/extension StringTools on String/)
		expect(result).toMatch(/extension type UserId/)
		expect(result).toMatch(/typedef Operation/)
		expect(result).toMatch(/int get answer/)
		expect(result).toMatch(/set answer\(int value\)/)
		expect(result).toMatch(/String speak\(\)/)
		expect(result).toMatch(/int add\(int left, int right\)/)
	})
})
