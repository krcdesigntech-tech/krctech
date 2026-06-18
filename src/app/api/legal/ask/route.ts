import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { embedQuery } from '@/lib/llm/hf-embeddings'
import { generateStream, type LlmMessage } from '@/lib/llm/openrouter'
import { parseLegalQuery } from '@/lib/law/query-parser'

export const maxDuration = 60

interface LawMatch {
  chunk_id: string
  law_id: string
  law_name: string
  canonical_law_name: string | null
  article_no: string | null
  article_title: string | null
  content: string
  kind: string
  source: string
  similarity: number
  score: number
  source_anchor: Record<string, unknown> | null
}

const SYSTEM_PROMPT = `당신은 대한민국 토목 조사설계 관계법령 안내 AI입니다.
아래 '근거 조문'에 담긴 내용만 사용해 정확하게 답변합니다.

[규칙]
1. 반드시 제공된 근거 조문에 기반해 답변하세요.
2. 근거 조문에 없는 내용은 "근거 조문에서 해당 정보를 찾을 수 없습니다"라고 명시하고 추정하지 마세요.
3. 답변에는 인용한 법령명과 조문 번호를 함께 표기하세요. (예: 「환경영향평가법」 제9조)
4. 수치·기준·대상은 조문 그대로 정확하게 인용하세요.
5. 한국어로, 실무자가 이해하기 쉽게 답변하세요.
6. 본 답변은 법률 자문이 아니라 업무 참고용임을 끝에 한 줄로 덧붙이세요.`

function buildMessages(question: string, matches: LawMatch[]): LlmMessage[] {
  const context = matches.length
    ? matches
        .map((m, i) => {
          const label = `${m.law_name} ${m.article_no ?? ''}`.trim()
          return `[근거 ${i + 1}: ${label}]\n${m.content}`
        })
        .join('\n\n---\n\n')
    : '관련 근거 조문을 찾지 못했습니다.'

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `다음은 검색된 근거 조문입니다:\n\n${context}\n\n질문: ${question}` },
  ]
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { question } = await request.json()
  if (!question?.trim()) {
    return NextResponse.json({ error: '질문을 입력해 주세요.' }, { status: 400 })
  }
  const q = question.trim().slice(0, 2000)

  // 1) 질문 임베딩 + 법령명/조문 파싱
  let queryEmbedding: number[]
  try {
    queryEmbedding = await embedQuery(q)
  } catch (e) {
    return NextResponse.json(
      { error: `임베딩 오류(Gemini): ${(e as Error).message}` },
      { status: 502 }
    )
  }
  const parsed = parseLegalQuery(q)

  // 2) 하이브리드 법령 조문 검색
  const service = await createServiceClient()
  const { data, error } = await service.rpc('match_law_chunks', {
    query_embedding: queryEmbedding,
    match_count: 12,
    query_text: q,
    law_name_filter: parsed.lawName,
    article_filter: parsed.articleRef,
  })
  if (error) {
    return NextResponse.json({ error: `법령 검색 오류: ${error.message}` }, { status: 500 })
  }

  const matches = (data || []) as LawMatch[]
  const sources = matches.slice(0, 8).map((m) => ({
    law_name: m.law_name,
    article_no: m.article_no,
    similarity: m.similarity,
    score: m.score,
    source: m.source,
    snippet: m.content.slice(0, 160),
  }))

  // 3) 스트리밍 답변
  const encoder = new TextEncoder()
  const messages = buildMessages(q, matches.slice(0, 8))

  const readable = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`)
        )

        if (matches.length === 0) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'chunk',
                content:
                  '관련 근거 조문을 법령 코퍼스에서 찾지 못했습니다. 질문에 법령명이나 조문 번호를 포함하면 더 정확히 검색됩니다.',
              })}\n\n`
            )
          )
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
          controller.close()
          return
        }

        for await (const token of generateStream(messages)) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'chunk', content: token })}\n\n`)
          )
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
      } catch (err) {
        const msg = err instanceof Error ? err.message : '답변 생성 중 오류가 발생했습니다.'
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`)
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
