/**
 * 에이전트 판정용 LLM 호출 — **OpenRouter 전용** (Groq·로컬·OAuth 미사용).
 *
 * 자가학습 루프의 판정(groundedness, 법령 후보 선택 등)은 모델 제약상 OpenRouter만 쓴다.
 * 온라인 Q&A 생성(`@/lib/llm/openrouter`의 generateText)은 Groq 우선이라 별도.
 */

import {
  OPENROUTER_BASE,
  OPENROUTER_MODELS,
  OPENROUTER_PASSES,
  OPENROUTER_RETRY_WAIT_MS,
} from './openrouter-models'
import type { LlmMessage } from './openrouter'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function key(): string {
  const k = process.env.OPENROUTER_API_KEY
  if (!k) throw new Error('OPENROUTER_API_KEY 미설정 (judge는 OpenRouter 전용)')
  return k
}

/** OpenRouter 체인만으로 비스트리밍 생성. */
export async function judgeText(messages: LlmMessage[], maxTokens = 512): Promise<string> {
  let lastErr = 'unknown'
  for (let pass = 0; pass < OPENROUTER_PASSES; pass++) {
    if (pass > 0) await sleep(OPENROUTER_RETRY_WAIT_MS)
    for (const model of OPENROUTER_MODELS) {
      try {
        const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key()}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
            'X-Title': 'KRCTech Hermes Agent',
          },
          body: JSON.stringify({ model, messages, stream: false, temperature: 0.1, max_tokens: maxTokens }),
        })
        if (!res.ok) {
          lastErr = `${model} → HTTP ${res.status}`
          continue
        }
        const json = await res.json()
        const content = (json?.choices?.[0]?.message?.content ?? '').trim()
        if (content) return content
        lastErr = `${model} → empty`
      } catch (e) {
        lastErr = `${model} → ${(e as Error)?.message}`
      }
    }
  }
  throw new Error(`judge(OpenRouter) 실패. 마지막 오류: ${lastErr}`)
}

/** JSON만 반환하도록 강제하고 파싱. 실패 시 null. */
export async function judgeJson<T = unknown>(messages: LlmMessage[], maxTokens = 512): Promise<T | null> {
  const raw = await judgeText(
    [...messages, { role: 'system', content: 'JSON 객체 하나만 출력. 코드펜스·설명 금지.' }],
    maxTokens
  )
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0]) as T
  } catch {
    return null
  }
}

/** 답변이 근거 조문에 기반했는지 판정 (환각 평가셋 승격 방지용). */
export async function scoreGroundedness(input: {
  question: string
  answer: string
  sources: Array<{ law_name: string; article_no: string | null; content?: string }>
}): Promise<{ grounded: boolean; score: number; reason: string }> {
  const ctx = input.sources
    .map((s, i) => `[${i + 1}] ${s.law_name} ${s.article_no ?? ''}\n${(s.content ?? '').slice(0, 400)}`)
    .join('\n---\n')
  const out = await judgeJson<{ grounded: boolean; score: number; reason: string }>([
    {
      role: 'system',
      content:
        '너는 한국 법령 답변의 근거 적합성을 평가한다. 답변이 제공된 근거 조문에만 기반하고 인용이 정확하면 grounded=true. ' +
        '{ "grounded": boolean, "score": 0~1, "reason": "..." } 형식으로만 답하라.',
    },
    { role: 'user', content: `질문: ${input.question}\n\n근거 조문:\n${ctx}\n\n답변:\n${input.answer}` },
  ])
  if (!out) return { grounded: false, score: 0, reason: 'judge 응답 파싱 실패' }
  return { grounded: !!out.grounded, score: Number(out.score) || 0, reason: out.reason ?? '' }
}
