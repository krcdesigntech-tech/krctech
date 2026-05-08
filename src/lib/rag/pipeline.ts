import { embedText } from '@/lib/huggingface/embeddings'
import { generateStream } from '@/lib/huggingface/generation'
import { retrieveChunks } from './retriever'
import { buildMessages } from './prompt-builder'
import { buildLegalContext, type LegalContextBlock } from '@/lib/law/rag-augmentor'
import type { MatchedChunk } from '@/types/database.types'

interface RagOptions {
  userId: string
  question: string
  documentIds?: string[]
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface RagResult {
  stream: AsyncGenerator<string>
  chunks: MatchedChunk[]
  legalBlocks: LegalContextBlock[]
}

export async function runRagPipeline(options: RagOptions): Promise<RagResult> {
  const { userId, question, documentIds, chatHistory = [] } = options

  // 1. Embed the question
  const queryEmbedding = await embedText(question)

  // 2. Retrieve relevant chunks
  const chunks = await retrieveChunks(queryEmbedding, userId, documentIds)

  // 3. Augment with current law articles for any laws referenced in the chunks
  const legalBlocks = await buildLegalContext(chunks).catch(() => [] as LegalContextBlock[])

  // 4. Build messages with both document and legal context
  const messages = buildMessages(question, chunks, chatHistory, legalBlocks)

  // 5. Generate response (streaming)
  const stream = generateStream(messages)

  return { stream, chunks, legalBlocks }
}
