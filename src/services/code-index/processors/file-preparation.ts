import { createHash } from "crypto"
import { v5 as uuidv5 } from "uuid"
import type { Ignore } from "ignore"
import type { FileProcessingResult, ICodeParser, IEmbedder, PointStruct } from "../interfaces"
import { MAX_FILE_SIZE_BYTES, QDRANT_CODE_BLOCK_NAMESPACE } from "../constants"
import { generateNormalizedAbsolutePath, generateRelativeFilePath } from "../shared/get-relative-path"
import { isPathInIgnoredDirectory } from "../../glob/ignore-utils"

export interface FilePreparationDependencies {
	workspacePath: string
	validateAccess: (filePath: string) => boolean
	ignoreInstance?: Pick<Ignore, "ignores">
	stat: (filePath: string) => PromiseLike<{ size: number }>
	readFile: (filePath: string) => PromiseLike<Uint8Array>
	getHash: (filePath: string) => string | undefined
	parser: ICodeParser
	embedder?: Pick<IEmbedder, "createEmbeddings">
}

/** Prepares one file for batching without writing points or mutating the hash cache. */
export class FilePreparation {
	constructor(private readonly dependencies: FilePreparationDependencies) {}

	public async prepareFile(filePath: string): Promise<FileProcessingResult> {
		const dependencies = this.dependencies
		try {
			// Get relative path for ignore checks
			const relativeFilePath = generateRelativeFilePath(filePath, dependencies.workspacePath)

			// Check if file is in an ignored directory
			// Use relative path to avoid matching parent directories outside the workspace
			if (isPathInIgnoredDirectory(relativeFilePath)) {
				return {
					path: filePath,
					status: "skipped" as const,
					reason: "File is in an ignored directory",
				}
			}

			// Check if file should be ignored
			if (
				!dependencies.validateAccess(filePath) ||
				(dependencies.ignoreInstance && dependencies.ignoreInstance.ignores(relativeFilePath))
			) {
				return {
					path: filePath,
					status: "skipped" as const,
					reason: "File is ignored by .rooignore or .gitignore",
				}
			}

			// Check file size
			const fileStat = await dependencies.stat(filePath)
			if (fileStat.size > MAX_FILE_SIZE_BYTES) {
				return {
					path: filePath,
					status: "skipped" as const,
					reason: "File is too large",
				}
			}

			// Read file content
			const fileContent = await dependencies.readFile(filePath)
			const content = fileContent.toString()

			// Calculate hash
			const newHash = createHash("sha256").update(content).digest("hex")

			// Check if file has changed
			if (dependencies.getHash(filePath) === newHash) {
				return {
					path: filePath,
					status: "skipped" as const,
					reason: "File has not changed",
				}
			}

			// Parse file
			const blocks = await dependencies.parser.parseFile(filePath, { content, fileHash: newHash })

			// Prepare points for batch processing
			let pointsToUpsert: PointStruct[] = []
			if (dependencies.embedder && blocks.length > 0) {
				const texts = blocks.map((block) => block.content)
				const { embeddings } = await dependencies.embedder.createEmbeddings(texts)

				pointsToUpsert = blocks.map((block, index) => {
					const normalizedAbsolutePath = generateNormalizedAbsolutePath(
						block.file_path,
						dependencies.workspacePath,
					)
					const stableName = `${normalizedAbsolutePath}:${block.start_line}`
					const pointId = uuidv5(stableName, QDRANT_CODE_BLOCK_NAMESPACE)

					return {
						id: pointId,
						vector: embeddings[index],
						payload: {
							filePath: generateRelativeFilePath(normalizedAbsolutePath, dependencies.workspacePath),
							codeChunk: block.content,
							startLine: block.start_line,
							endLine: block.end_line,
						},
					}
				})
			}

			return {
				path: filePath,
				status: "processed_for_batching" as const,
				newHash,
				pointsToUpsert,
			}
		} catch (error) {
			return {
				path: filePath,
				status: "local_error" as const,
				error: error as Error,
			}
		}
	}
}
