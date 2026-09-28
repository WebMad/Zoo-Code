import type { Ignore } from "ignore"
import type { ICodeParser, IEmbedder } from "../interfaces"

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
