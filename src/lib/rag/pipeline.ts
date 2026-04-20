import { embedText } from '@/lib/huggingface/embeddings'
import { generateStream } from '@/lib/huggingface/generation'
import { retrieveChunks } from './retriever'
import { buildMessages } from './prompt-builder'
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
}

export async function runRagPipeline(options: RagOptions): Promise<RagResult> {
  const { userId, question, documentIds, chatHistory = [] } = options

  // 1. Embed the question
  const queryEmbedding = await embedText(question)

  // 2. Retrieve relevant chunks
  const chunks = await retrieveChunks(queryEmbedding, userId, documentIds)

  // 3. Build messages
  const messages = buildMessages(question, chunks, chatHistory)

  // 4. Generate response (streaming)
  const stream = generateStream(messages)

  return { stream, chunks }
}
