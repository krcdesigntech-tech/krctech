import type { HfMessage } from '@/lib/huggingface/generation'
import type { MatchedChunk } from '@/types/database.types'

const SYSTEM_PROMPT = `당신은 대한민국 토목설계 전문가 AI입니다.
업로드된 설계 문서를 기반으로 정확하고 전문적인 답변을 제공합니다.

[규칙]
1. 반드시 제공된 문서 내용에 근거하여 답변하세요.
2. 문서에 없는 내용은 "제공된 문서에서 해당 정보를 찾을 수 없습니다"라고 명시하세요.
3. 관련 조항이나 기준을 인용할 때 출처 문서명과 페이지를 명시하세요.
4. 수치, 규격, 기준값은 정확하게 인용하세요.
5. 한국어로 답변하세요.`

export function buildMessages(
  userQuestion: string,
  retrievedChunks: MatchedChunk[],
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): HfMessage[] {
  // Build context from retrieved chunks
  const contextParts = retrievedChunks.map((chunk, i) => {
    const source = chunk.document_name
    const page = chunk.page_number ? ` (p.${chunk.page_number})` : ''
    return `[출처 ${i + 1}: ${source}${page}]\n${chunk.content}`
  })

  const contextText = contextParts.length
    ? `다음은 관련 문서 내용입니다:\n\n${contextParts.join('\n\n---\n\n')}`
    : '관련 문서를 찾을 수 없습니다.'

  const messages: HfMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ]

  // Add recent chat history (last 6 messages)
  const recentHistory = chatHistory.slice(-6)
  messages.push(...recentHistory)

  // Add current question with context
  messages.push({
    role: 'user',
    content: `${contextText}\n\n질문: ${userQuestion}`,
  })

  return messages
}
