import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { embedQuery } from '@/lib/llm/hf-embeddings'
import { generateStream, type LlmMessage } from '@/lib/llm/openrouter'
import { parseLegalQuery } from '@/lib/law/query-parser'
import { resolveCanonicalName } from '@/lib/law/name-canonicalizer'

export const maxDuration = 60

const PROMPT_VERSION = 'legal-ask-v1'
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

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
      { error: `임베딩 오류(HuggingFace): ${(e as Error).message}` },
      { status: 502 }
    )
  }
  const parsed = parseLegalQuery(q)

  // 2) 하이브리드 법령 조문 검색 (법령명은 학습된 별칭(law_aliases)으로 정식명 확장)
  const service = await createServiceClient()
  const lawNameFilter = parsed.lawName
    ? await resolveCanonicalName(service, parsed.lawName)
    : null
  const { data, error } = await service.rpc('match_law_chunks', {
    query_embedding: queryEmbedding,
    match_count: 12,
    query_text: q,
    law_name_filter: lawNameFilter,
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

  // 3) 스트리밍 답변 + 로깅
  const encoder = new TextEncoder()
  const messages = buildMessages(q, matches.slice(0, 8))
  const startedAt = Date.now()

  // qa_logs 기록 (자가학습 신호). 실패해도 응답에는 영향 없음.
  async function logQa(answer: string, status: 'success' | 'error' | 'empty', errorCode?: string) {
    try {
      const { data: row } = await service
        .from('qa_logs')
        .insert({
          user_id: user!.id,
          question: q,
          question_hash: sha(q.replace(/\s+/g, '')),
          parsed,
          sources,
          source_snapshot: matches.slice(0, 3).map((m) => ({
            law_name: m.law_name,
            article_no: m.article_no,
            content: m.content.slice(0, 400),
          })),
          top_score: matches[0]?.score ?? null,
          answer: answer || null,
          status,
          error_code: errorCode ?? null,
          embedding_provider: 'huggingface',
          embedding_model: 'BAAI/bge-m3',
          generation_provider: 'groq+openrouter',
          model_used: 'auto-chain',
          prompt_version: PROMPT_VERSION,
          prompt_hash: sha(SYSTEM_PROMPT),
          retrieval_count: matches.length,
          latency_ms: Date.now() - startedAt,
        })
        .select('id')
        .single()
      return row?.id ?? null
    } catch {
      return null
    }
  }

  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      try {
        send({ type: 'sources', sources })

        if (matches.length === 0) {
          const msg =
            '관련 근거 조문을 법령 코퍼스에서 찾지 못했습니다. 질문에 법령명이나 조문 번호를 포함하면 더 정확히 검색됩니다.'
          send({ type: 'chunk', content: msg })
          const qaLogId = await logQa(msg, 'empty')
          send({ type: 'done', qaLogId })
          controller.close()
          return
        }

        let fullAnswer = ''
        for await (const token of generateStream(messages)) {
          fullAnswer += token
          send({ type: 'chunk', content: token })
        }
        const qaLogId = await logQa(fullAnswer, 'success')
        send({ type: 'done', qaLogId })
      } catch (err) {
        const message = err instanceof Error ? err.message : '답변 생성 중 오류가 발생했습니다.'
        await logQa('', 'error', message.slice(0, 200))
        send({ type: 'error', message })
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
