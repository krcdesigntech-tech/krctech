import { generateText } from '@/lib/huggingface/generation'
import { embedText } from '@/lib/huggingface/embeddings'
import { retrieveChunks } from '@/lib/rag/retriever'
import { buildMessages } from '@/lib/rag/prompt-builder'
import { buildLegalContext, formatLegalBlocksForPrompt, type LegalContextBlock } from '@/lib/law/rag-augmentor'
import type { MatchedChunk } from '@/types/database.types'

const BOT_MATCH_COUNT = 8
const BOT_MATCH_THRESHOLD = 0.25
const BOT_MAX_TOKENS = 1200

function formatDocumentContext(chunks: MatchedChunk[]): string {
  if (chunks.length === 0) return ''

  const parts = chunks.map((chunk, index) => {
    const page = chunk.page_number ? ` (p.${chunk.page_number})` : ''
    return `[${index + 1}] ${chunk.document_name}${page}\n${chunk.content}`
  })

  return `[관련 문서 컨텍스트]\n${parts.join('\n\n---\n\n')}`
}

export function formatBotRagContext(
  chunks: MatchedChunk[],
  legalBlocks: LegalContextBlock[]
): string {
  const documentContext = formatDocumentContext(chunks)
  const legalContext = formatLegalBlocksForPrompt(legalBlocks)
  return [documentContext, legalContext].filter(Boolean).join('\n\n===\n\n')
}

export async function generateBotAnswer(userId: string, question: string) {
  const queryEmbedding = await embedText(question)
  const chunks = await retrieveChunks(
    queryEmbedding,
    userId,
    undefined,
    BOT_MATCH_COUNT,
    BOT_MATCH_THRESHOLD
  )
  const legalBlocks = await buildLegalContext(chunks).catch(() => [] as LegalContextBlock[])
  const messages = buildMessages(question, chunks, [], legalBlocks)
  const answer = await generateText(messages, BOT_MAX_TOKENS)

  return {
    answer,
    ragContext: formatBotRagContext(chunks, legalBlocks),
  }
}
