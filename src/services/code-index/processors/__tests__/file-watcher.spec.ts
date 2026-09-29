// npx vitest services/code-index/processors/__tests__/file-watcher.spec.ts

import * as vscode from "vscode"

import { FileWatcher } from "../file-watcher"
import { FilePreparation } from "../file-preparation"

import { clearAllMocks } from "../../../../test-utils/reset"

// Mock TelemetryService
vi.mock("../../../../../packages/telemetry/src/TelemetryService", () => ({
	TelemetryService: {
		instance: {
			captureEvent: vi.fn(),
		},
	},
}))

// Mock dependencies
vi.mock("../../cache-manager")
vi.mock("../../../core/ignore/RooIgnoreController", () => ({
	RooIgnoreController: vi.fn().mockImplementation(function () {
		return {
			validateAccess: vi.fn().mockReturnValue(true),
		}
	}),
}))
vi.mock("ignore")
vi.mock("../parser", () => ({
	codeParser: {
		parseFile: vi.fn().mockImplementation(async (filePath: string) => [
			{
				file_path: filePath,
				content: "test content",
				start_line: 1,
				end_line: 1,
			},
		]),
	},
}))

const createMockEventEmitter = () => {
	const listeners = new Set<(event: any) => void>()

	return {
		event: vi.fn((listener: (event: any) => void) => {
			listeners.add(listener)
			return {
				dispose: () => listeners.delete(listener),
			}
		}),
		fire: vi.fn((event: any) => {
			for (const listener of listeners) {
				listener(event)
			}
		}),
		dispose: vi.fn(() => {
			listeners.clear()
		}),
	}
}

// Mock vscode module
vi.mock("vscode", () => ({
	workspace: {
		createFileSystemWatcher: vi.fn(),
		workspaceFolders: [
			{
				uri: {
					fsPath: "/mock/workspace",
				},
			},
		],
		fs: {
			stat: vi.fn().mockResolvedValue({ size: 1000 }),
			readFile: vi.fn().mockResolvedValue(Buffer.from("test content")),
		},
	},
	RelativePattern: vi.fn().mockImplementation(function (base, pattern) {
		return { base, pattern }
	}),
	Uri: {
		file: vi.fn().mockImplementation((path) => ({ fsPath: path })),
	},
	EventEmitter: vi.fn().mockImplementation(function () {
		return createMockEventEmitter()
	}),
	ExtensionContext: vi.fn(),
}))

describe("FileWatcher", () => {
	let fileWatcher: FileWatcher
	let mockWatcher: any
	let mockOnDidCreate: any
	let mockOnDidChange: any
	let mockOnDidDelete: any
	let mockContext: any
	let mockCacheManager: any
	let mockEmbedder: any
	let mockVectorStore: any
	let mockIgnoreInstance: any

	const waitForNextBatch = () =>
		new Promise<any>((resolve) => {
			const disposable = fileWatcher.onDidFinishBatchProcessing((summary) => {
				disposable.dispose()
				resolve(summary)
			})
		})

	const flushBatch = async () => {
		await vi.advanceTimersByTimeAsync(500)
	}

	beforeEach(() => {
		// Reset all mocks
		clearAllMocks()
		vi.useFakeTimers()

		// Create mock event handlers
		mockOnDidCreate = vi.fn()
		mockOnDidChange = vi.fn()
		mockOnDidDelete = vi.fn()

		// Create mock watcher
		mockWatcher = {
			onDidCreate: vi.fn().mockImplementation((handler) => {
				mockOnDidCreate = handler
				return { dispose: vi.fn() }
			}),
			onDidChange: vi.fn().mockImplementation((handler) => {
				mockOnDidChange = handler
				return { dispose: vi.fn() }
			}),
			onDidDelete: vi.fn().mockImplementation((handler) => {
				mockOnDidDelete = handler
				return { dispose: vi.fn() }
			}),
			dispose: vi.fn(),
		}

		// Mock createFileSystemWatcher to return our mock watcher
		vi.mocked(vscode.workspace.createFileSystemWatcher).mockReturnValue(mockWatcher)

		// Create mock dependencies
		mockContext = {
			subscriptions: [],
		}

		mockCacheManager = {
			getHash: vi.fn(),
			updateHash: vi.fn(),
			deleteHash: vi.fn(),
		}

		mockEmbedder = {
			createEmbeddings: vi.fn().mockResolvedValue({ embeddings: [[0.1, 0.2, 0.3]] }),
		}

		mockVectorStore = {
			upsertPoints: vi.fn().mockResolvedValue(undefined),
			deletePointsByFilePath: vi.fn().mockResolvedValue(undefined),
			deletePointsByMultipleFilePaths: vi.fn().mockResolvedValue(undefined),
		}

		mockIgnoreInstance = {
			ignores: vi.fn().mockReturnValue(false),
		}

		fileWatcher = new FileWatcher(
			"/mock/workspace",
			mockContext,
			mockCacheManager,
			mockEmbedder,
			mockVectorStore,
			mockIgnoreInstance,
		)
	})

	afterEach(async () => {
		fileWatcher?.dispose()
		await vi.runOnlyPendingTimersAsync()
		vi.useRealTimers()
	})

	it("reuses constructor-created preparation for public processFile without writing points or cache", async () => {
		const prepare = vi.spyOn(FilePreparation.prototype, "prepareFile")
		try {
			const preparation = fileWatcher["filePreparation"]
			expect(preparation).toBeInstanceOf(FilePreparation)
			expect(preparation["dependencies"].fileSystem).toBe(vscode.workspace.fs)
			expect(preparation["dependencies"].cacheManager).toBe(mockCacheManager)
			expect(preparation["dependencies"].ignoreController).toBe(fileWatcher["ignoreController"])
			const path = "/mock/workspace/src/file.ts"
			const result = await fileWatcher.processFile(path)
			expect(prepare).toHaveBeenNthCalledWith(1, path)
			expect(result).toBe(await prepare.mock.results[0].value)
			expect(result.status).toBe("processed_for_batching")
			expect(result.pointsToUpsert).toHaveLength(1)
			expect(vscode.workspace.fs.stat).toHaveBeenCalledWith(vscode.Uri.file(path))
			expect(vscode.workspace.fs.readFile).toHaveBeenCalledWith(vscode.Uri.file(path))
			const secondPath = "/mock/workspace/src/second.ts"
			const secondResult = await fileWatcher.processFile(secondPath)
			expect(prepare).toHaveBeenCalledTimes(2)
			expect(prepare).toHaveBeenNthCalledWith(2, secondPath)
			expect(prepare.mock.contexts[0]).toBe(preparation)
			expect(prepare.mock.contexts[1]).toBe(preparation)
			expect(secondResult).toBe(await prepare.mock.results[1].value)
			expect(secondResult.status).toBe("processed_for_batching")
			expect(mockVectorStore.upsertPoints).not.toHaveBeenCalled()
			expect(mockCacheManager.updateHash).not.toHaveBeenCalled()
			expect(mockCacheManager.deleteHash).not.toHaveBeenCalled()
		} finally {
			prepare.mockRestore()
		}
	})

	describe("event batching", () => {
		it("cancels pending work when disposed before the debounce window ends", async () => {
			await fileWatcher.initialize()
			const started = vi.fn()
			const progress = vi.fn()
			const finished = vi.fn()
			fileWatcher.onDidStartBatchProcessing(started)
			fileWatcher.onBatchProgressUpdate(progress)
			fileWatcher.onDidFinishBatchProcessing(finished)

			await mockOnDidCreate(vscode.Uri.file("/mock/workspace/src/created.ts"))
			await mockOnDidDelete(vscode.Uri.file("/mock/workspace/src/deleted.ts"))
			await vi.advanceTimersByTimeAsync(499)
			fileWatcher.dispose()
			await vi.advanceTimersByTimeAsync(1000)

			expect(mockWatcher.dispose).toHaveBeenCalledTimes(1)
			expect(started).not.toHaveBeenCalled()
			expect(progress).not.toHaveBeenCalled()
			expect(finished).not.toHaveBeenCalled()
			expect(vscode.workspace.fs.readFile).not.toHaveBeenCalled()
			expect(mockVectorStore.deletePointsByMultipleFilePaths).not.toHaveBeenCalled()
			expect(mockVectorStore.upsertPoints).not.toHaveBeenCalled()
			expect(mockCacheManager.deleteHash).not.toHaveBeenCalled()
			expect(mockCacheManager.updateHash).not.toHaveBeenCalled()
		})

		it("keeps events received during processing in a separate batch without replaying the first batch", async () => {
			await fileWatcher.initialize()
			const firstPath = "/mock/workspace/src/first.ts"
			const nextPath = "/mock/workspace/src/next.ts"
			let releaseDeletion!: () => void
			mockVectorStore.deletePointsByMultipleFilePaths.mockImplementationOnce(
				() =>
					new Promise<void>((resolve) => {
						releaseDeletion = resolve
					}),
			)
			const started = vi.fn()
			const finished = vi.fn()
			fileWatcher.onDidStartBatchProcessing(started)
			fileWatcher.onDidFinishBatchProcessing(finished)
			const firstSummary = waitForNextBatch()

			await mockOnDidDelete(vscode.Uri.file(firstPath))
			await flushBatch()
			expect(started).toHaveBeenCalledExactlyOnceWith([firstPath])
			expect(finished).not.toHaveBeenCalled()

			await mockOnDidDelete(vscode.Uri.file(nextPath))
			releaseDeletion()
			expect(await firstSummary).toEqual({
				processedFiles: [{ path: firstPath, status: "success" }],
				batchError: undefined,
			})
			expect(started).toHaveBeenCalledTimes(1)

			await flushBatch()
			expect(started.mock.calls).toEqual([[[firstPath]], [[nextPath]]])
			expect(finished).toHaveBeenCalledTimes(2)
			expect(finished).toHaveBeenLastCalledWith({
				processedFiles: [{ path: nextPath, status: "success" }],
				batchError: undefined,
			})
			expect(mockVectorStore.deletePointsByMultipleFilePaths.mock.calls).toEqual([[[firstPath]], [[nextPath]]])
			await flushBatch()
			expect(started).toHaveBeenCalledTimes(2)
		})

		it("waits 500 ms after the latest event and includes distinct paths in one batch", async () => {
			await fileWatcher.initialize()
			const firstPath = "/mock/workspace/src/first.ts"
			const secondPath = "/mock/workspace/src/second.ts"
			const started = vi.fn()
			const finished = vi.fn()
			fileWatcher.onDidStartBatchProcessing(started)
			fileWatcher.onDidFinishBatchProcessing(finished)

			await mockOnDidDelete(vscode.Uri.file(firstPath))
			await vi.advanceTimersByTimeAsync(400)
			await mockOnDidDelete(vscode.Uri.file(secondPath))
			await vi.advanceTimersByTimeAsync(499)
			expect(started).not.toHaveBeenCalled()
			expect(finished).not.toHaveBeenCalled()
			expect(mockVectorStore.deletePointsByMultipleFilePaths).not.toHaveBeenCalled()

			await vi.advanceTimersByTimeAsync(1)
			expect(started).toHaveBeenCalledExactlyOnceWith([firstPath, secondPath])
			expect(mockVectorStore.deletePointsByMultipleFilePaths).toHaveBeenCalledExactlyOnceWith([
				firstPath,
				secondPath,
			])
			expect(finished).toHaveBeenCalledExactlyOnceWith({
				processedFiles: [
					{ path: firstPath, status: "success" },
					{ path: secondPath, status: "success" },
				],
				batchError: undefined,
			})
		})

		it("keeps only the final delete when a path is created, changed and deleted within the debounce window", async () => {
			await fileWatcher.initialize()
			const path = "/mock/workspace/src/file.ts"
			const uri = vscode.Uri.file(path)
			const started = vi.fn()
			fileWatcher.onDidStartBatchProcessing(started)
			const summary = waitForNextBatch()

			await mockOnDidCreate(uri)
			await mockOnDidChange(uri)
			await mockOnDidDelete(uri)
			await flushBatch()

			expect(started).toHaveBeenCalledExactlyOnceWith([path])
			expect(await summary).toEqual({ processedFiles: [{ path, status: "success" }], batchError: undefined })
			expect(mockVectorStore.deletePointsByMultipleFilePaths).toHaveBeenCalledExactlyOnceWith([path])
			expect(mockCacheManager.deleteHash).toHaveBeenCalledExactlyOnceWith(path)
			expect(vscode.workspace.fs.readFile).not.toHaveBeenCalled()
			expect(mockVectorStore.upsertPoints).not.toHaveBeenCalled()
		})
	})

	describe("file filtering", () => {
		it("should ignore files in hidden directories on create events", async () => {
			// Initialize the file watcher
			await fileWatcher.initialize()

			const batchPromise = waitForNextBatch()

			// Simulate file creation events
			const testCases = [
				{ path: "/mock/workspace/src/file.ts", shouldProcess: true },
				{ path: "/mock/workspace/.git/config", shouldProcess: false },
				{ path: "/mock/workspace/.hidden/file.ts", shouldProcess: false },
				{ path: "/mock/workspace/src/.next/static/file.js", shouldProcess: false },
				{ path: "/mock/workspace/node_modules/package/index.js", shouldProcess: false },
				{ path: "/mock/workspace/normal/file.js", shouldProcess: true },
			]

			// Trigger file creation events
			for (const { path } of testCases) {
				await mockOnDidCreate({ fsPath: path })
			}

			await flushBatch()

			const batchSummary = await batchPromise
			const successPaths = batchSummary.processedFiles
				.filter((result: any) => result.status === "success")
				.map((result: any) => result.path)
			const skippedPaths = batchSummary.processedFiles
				.filter((result: any) => result.status === "skipped")
				.map((result: any) => result.path)

			// Check that files in hidden directories were not processed
			expect(successPaths).toContain("/mock/workspace/src/file.ts")
			expect(successPaths).toContain("/mock/workspace/normal/file.js")
			expect(skippedPaths).toContain("/mock/workspace/.git/config")
			expect(skippedPaths).toContain("/mock/workspace/.hidden/file.ts")
			expect(skippedPaths).toContain("/mock/workspace/src/.next/static/file.js")
			expect(skippedPaths).toContain("/mock/workspace/node_modules/package/index.js")
		})

		it("should ignore files in hidden directories on change events", async () => {
			// Initialize the file watcher
			await fileWatcher.initialize()

			const batchPromise = waitForNextBatch()

			// Simulate file change events
			const testCases = [
				{ path: "/mock/workspace/src/file.ts", shouldProcess: true },
				{ path: "/mock/workspace/.vscode/settings.json", shouldProcess: false },
				{ path: "/mock/workspace/src/.cache/data.json", shouldProcess: false },
				{ path: "/mock/workspace/dist/bundle.js", shouldProcess: false },
			]

			// Trigger file change events
			for (const { path } of testCases) {
				await mockOnDidChange({ fsPath: path })
			}

			await flushBatch()

			const batchSummary = await batchPromise
			const successPaths = batchSummary.processedFiles
				.filter((result: any) => result.status === "success")
				.map((result: any) => result.path)
			const skippedPaths = batchSummary.processedFiles
				.filter((result: any) => result.status === "skipped")
				.map((result: any) => result.path)

			// Check that files in hidden directories were not processed
			expect(successPaths).toContain("/mock/workspace/src/file.ts")
			expect(skippedPaths).toContain("/mock/workspace/.vscode/settings.json")
			expect(skippedPaths).toContain("/mock/workspace/src/.cache/data.json")
			expect(skippedPaths).toContain("/mock/workspace/dist/bundle.js")
		})

		it("should batch delete events after the debounce window", async () => {
			// Initialize the file watcher
			await fileWatcher.initialize()

			const deletedFiles: string[] = []
			mockVectorStore.deletePointsByMultipleFilePaths.mockImplementation(async (filePaths: string[]) => {
				deletedFiles.push(...filePaths)
			})
			const batchPromise = waitForNextBatch()

			// Simulate file deletion events
			const testCases = [
				{ path: "/mock/workspace/src/file.ts", shouldProcess: true },
				{ path: "/mock/workspace/.git/objects/abc123", shouldProcess: false },
				{ path: "/mock/workspace/.DS_Store", shouldProcess: false },
				{ path: "/mock/workspace/build/.cache/temp.js", shouldProcess: false },
			]

			// Trigger file deletion events
			for (const { path } of testCases) {
				await mockOnDidDelete({ fsPath: path })
			}

			await flushBatch()
			await batchPromise

			expect(deletedFiles).toEqual(testCases.map(({ path }) => path))
		})

		it("should handle nested hidden directories correctly", async () => {
			// Initialize the file watcher
			await fileWatcher.initialize()

			const batchPromise = waitForNextBatch()

			// Test deeply nested hidden directories
			const testCases = [
				{ path: "/mock/workspace/src/components/Button.tsx", shouldProcess: true },
				{ path: "/mock/workspace/src/.hidden/components/Button.tsx", shouldProcess: false },
				{ path: "/mock/workspace/.hidden/src/components/Button.tsx", shouldProcess: false },
				{ path: "/mock/workspace/src/components/.hidden/Button.tsx", shouldProcess: false },
			]

			// Trigger file creation events
			for (const { path } of testCases) {
				await mockOnDidCreate({ fsPath: path })
			}

			await flushBatch()

			const batchSummary = await batchPromise
			const successPaths = batchSummary.processedFiles
				.filter((result: any) => result.status === "success")
				.map((result: any) => result.path)
			const skippedPaths = batchSummary.processedFiles
				.filter((result: any) => result.status === "skipped")
				.map((result: any) => result.path)

			// Check that files in hidden directories were not processed
			expect(successPaths).toContain("/mock/workspace/src/components/Button.tsx")
			expect(skippedPaths).toContain("/mock/workspace/src/.hidden/components/Button.tsx")
			expect(skippedPaths).toContain("/mock/workspace/.hidden/src/components/Button.tsx")
			expect(skippedPaths).toContain("/mock/workspace/src/components/.hidden/Button.tsx")
		})
	})

	describe("dispose", () => {
		it("should dispose of the watcher when disposed", async () => {
			await fileWatcher.initialize()
			fileWatcher.dispose()

			expect(mockWatcher.dispose).toHaveBeenCalled()
		})
	})
})
