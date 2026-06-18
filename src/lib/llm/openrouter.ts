/**
 * OpenRouter chat-completions client (server-side only).
 *
 * 생성(답변)은 OpenRouter 무료 모델 폴백 체인으로만 한다 (참고: 수자원법령 ask.ts).
 * Gemini는 임베딩 전용 (`@/lib/llm/gemini-embeddings`).
 *
 * 시그니처는 기존 `@/lib/huggingface/generation`과 호환된다
 * (`generateStream`, `generateText`, `LlmMessage`).
 */

import {
  OPENROUTER_BASE,
  OPENROUTER_MODELS,
  OPENROUTER_PASSES,
  OPENROUTER_RETRY_WAIT_MS,
} from './openrouter-models'

export type LlmMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/** 기존 HuggingFace 모듈과의 호환 alias. */
export type HfMessage = LlmMessage

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY env var is not set')
  return key
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface RequestOpts {
  stream: boolean
  maxTokens: number
}

async function openChatRequest(model: string, messages: LlmMessage[], opts: RequestOpts) {
  return fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
      // OpenRouter 권장 식별 헤더 (선택).
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

/**
 * 스트리밍 생성. 모델 체인을 순회하며 첫 토큰을 내보내는 모델로 확정한다.
 * 어떤 모델도 토큰을 내보내지 못하면 마지막 오류를 throw 한다.
 */
export async function* generateStream(
  messages: LlmMessage[],
  maxTokens = 1024
): AsyncGenerator<string> {
  let lastErr = 'unknown'

  for (let pass = 0; pass < OPENROUTER_PASSES; pass++) {
    if (pass > 0) await sleep(OPENROUTER_RETRY_WAIT_MS)

    for (const model of OPENROUTER_MODELS) {
      let res: Response
      try {
        res = await openChatRequest(model, messages, { stream: true, maxTokens })
      } catch (e) {
        lastErr = `${model} → ${(e as Error)?.message}`
        continue
      }

      if (!res.ok || !res.body) {
        lastErr = `${model} → HTTP ${res.status}`
        continue
      }

      let yieldedAny = false
      try {
        for await (const token of parseSseStream(res.body)) {
          yieldedAny = true
          yield token
        }
      } catch (e) {
        // 토큰을 이미 내보낸 뒤 끊기면 폴백이 불가능하므로 종료한다.
        if (yieldedAny) return
        lastErr = `${model} → stream error: ${(e as Error)?.message}`
        continue
      }

      if (yieldedAny) return
      lastErr = `${model} → empty`
    }
  }

  throw new Error(`OpenRouter 무료 모델 응답 실패. 마지막 오류: ${lastErr}`)
}

/** SSE 본문을 파싱해 delta content 토큰을 순차 방출. comment/빈 라인은 무시. */
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
        if (!line) continue
        if (line.startsWith(':')) continue // OpenRouter keep-alive comment
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try {
          const json = JSON.parse(data)
          const delta = json?.choices?.[0]?.delta?.content
          if (delta) yield delta as string
        } catch {
          // 분할된 JSON 조각 — 무시 (다음 청크에서 이어짐)
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/** 비스트리밍 누적 텍스트. 스트림과 동일 폴백 체인을 사용한다. */
export async function generateText(messages: LlmMessage[], maxTokens = 1024): Promise<string> {
  let lastErr = 'unknown'

  for (let pass = 0; pass < OPENROUTER_PASSES; pass++) {
    if (pass > 0) await sleep(OPENROUTER_RETRY_WAIT_MS)

    for (const model of OPENROUTER_MODELS) {
      try {
        const res = await openChatRequest(model, messages, { stream: false, maxTokens })
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

  throw new Error(`OpenRouter 무료 모델 응답 실패. 마지막 오류: ${lastErr}`)
}
