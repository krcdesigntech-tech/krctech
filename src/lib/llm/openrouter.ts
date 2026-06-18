/**
 * 답변 생성 (서버 전용) — OpenAI 호환 멀티 제공자 폴백.
 *
 * 제공자 순서: Groq(무료·고한도) → OpenRouter(무료 체인 + 유료 폴백).
 * 키가 없는 제공자는 자동 건너뛴다. 임베딩은 HuggingFace(`@/lib/llm/hf-embeddings`).
 *
 * 시그니처는 기존과 호환: `generateStream`, `generateText`, `LlmMessage`.
 * (파일명은 호환을 위해 유지)
 */

import {
  OPENROUTER_BASE,
  OPENROUTER_MODELS,
  OPENROUTER_PASSES,
  OPENROUTER_RETRY_WAIT_MS,
} from './openrouter-models'
import { GROQ_BASE, GROQ_MODELS } from './groq-models'

export type LlmMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/** 기존 HuggingFace 모듈과의 호환 alias. */
export type HfMessage = LlmMessage

interface Provider {
  name: string
  base: string
  apiKey: () => string | undefined
  models: string[]
}

/** 키가 설정된 제공자만 순서대로 사용. */
function providers(): Provider[] {
  return [
    { name: 'groq', base: GROQ_BASE, apiKey: () => process.env.GROQ_API_KEY, models: GROQ_MODELS },
    { name: 'openrouter', base: OPENROUTER_BASE, apiKey: () => process.env.OPENROUTER_API_KEY, models: OPENROUTER_MODELS },
  ].filter((p) => !!p.apiKey())
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface RequestOpts {
  stream: boolean
  maxTokens: number
}

async function chatRequest(p: Provider, model: string, messages: LlmMessage[], opts: RequestOpts) {
  return fetch(`${p.base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${p.apiKey()}`,
      'Content-Type': 'application/json',
      // OpenRouter 권장 헤더 (다른 제공자는 무시).
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'KRCTech Legal QA',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: opts.stream,
      temperature: 0.2,
      max_tokens: opts.maxTokens,
    }),
  })
}

/** (provider, model) 조합을 순회하는 평탄화 목록. */
function chain(): Array<{ p: Provider; model: string }> {
  const out: Array<{ p: Provider; model: string }> = []
  for (const p of providers()) for (const model of p.models) out.push({ p, model })
  return out
}

/**
 * 스트리밍 생성. Groq → OpenRouter 순서로 첫 토큰을 내보내는 모델에 확정.
 */
export async function* generateStream(
  messages: LlmMessage[],
  maxTokens = 1024
): AsyncGenerator<string> {
  const combos = chain()
  if (!combos.length) throw new Error('생성 제공자 키가 없습니다 (GROQ_API_KEY / OPENROUTER_API_KEY).')
  let lastErr = 'unknown'

  for (let pass = 0; pass < OPENROUTER_PASSES; pass++) {
    if (pass > 0) await sleep(OPENROUTER_RETRY_WAIT_MS)

    for (const { p, model } of combos) {
      let res: Response
      try {
        res = await chatRequest(p, model, messages, { stream: true, maxTokens })
      } catch (e) {
        lastErr = `${p.name}/${model} → ${(e as Error)?.message}`
        continue
      }
      if (!res.ok || !res.body) {
        lastErr = `${p.name}/${model} → HTTP ${res.status}`
        continue
      }

      let yieldedAny = false
      try {
        for await (const token of parseSseStream(res.body)) {
          yieldedAny = true
          yield token
        }
      } catch (e) {
        if (yieldedAny) return
        lastErr = `${p.name}/${model} → stream error: ${(e as Error)?.message}`
        continue
      }
      if (yieldedAny) return
      lastErr = `${p.name}/${model} → empty`
    }
  }

  throw new Error(`생성 실패(모든 제공자/모델 소진). 마지막 오류: ${lastErr}`)
}

/** SSE 본문 → delta content 토큰. comment/빈 라인 무시. */
async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const raw of lines) {
        const line = raw.trim()
        if (!line || line.startsWith(':')) continue
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try {
          const json = JSON.parse(data)
          const delta = json?.choices?.[0]?.delta?.content
          if (delta) yield delta as string
        } catch {
          /* 분할 JSON 조각 — 무시 */
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/** 비스트리밍 누적 텍스트. 동일 제공자 체인 사용. */
export async function generateText(messages: LlmMessage[], maxTokens = 1024): Promise<string> {
  const combos = chain()
  if (!combos.length) throw new Error('생성 제공자 키가 없습니다 (GROQ_API_KEY / OPENROUTER_API_KEY).')
  let lastErr = 'unknown'

  for (let pass = 0; pass < OPENROUTER_PASSES; pass++) {
    if (pass > 0) await sleep(OPENROUTER_RETRY_WAIT_MS)
    for (const { p, model } of combos) {
      try {
        const res = await chatRequest(p, model, messages, { stream: false, maxTokens })
        if (!res.ok) {
          lastErr = `${p.name}/${model} → HTTP ${res.status}`
          continue
        }
        const json = await res.json()
        const content = (json?.choices?.[0]?.message?.content ?? '').trim()
        if (content) return content
        lastErr = `${p.name}/${model} → empty`
      } catch (e) {
        lastErr = `${p.name}/${model} → ${(e as Error)?.message}`
      }
    }
  }
  throw new Error(`생성 실패(모든 제공자/모델 소진). 마지막 오류: ${lastErr}`)
}
