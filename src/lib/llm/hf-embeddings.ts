/**
 * HuggingFace 임베딩 (BAAI/bge-m3, 1024차원) — 서버 전용.
 *
 * 옵션 C: Gemini 무료 할당량 이슈로 임베딩을 HuggingFace로 전환.
 * 생성(답변)은 OpenRouter 전용 (`@/lib/llm/openrouter`).
 *
 * - `embedQuery`/`embedText`     : 단건 (질의)
 * - `embedDocuments`/`embedTexts`: 배치 (적재)
 *
 * 적재(스크립트)와 질의(API)가 동일 모델/차원을 써야 검색이 동작한다.
 * 모델/차원 변경은 DB 전체 재임베딩이 필요한 breaking change.
 */

import { HfInference } from '@huggingface/inference'
import type { InferenceProviderOrPolicy } from '@huggingface/inference'

const EMBEDDING_MODEL = 'BAAI/bge-m3'
export const EMBEDDING_DIM = 1024
const BATCH_SIZE = 8
const DEFAULT_TIMEOUT_MS = 12_000
const QUERY_ATTEMPTS = 2
const BATCH_ATTEMPTS = 6

const hf = () => new HfInference(process.env.HF_TOKEN)
const provider = (): InferenceProviderOrPolicy =>
  (process.env.HF_EMBEDDING_PROVIDER || 'hf-inference') as InferenceProviderOrPolicy

/** 저장 전 차원 검증. */
export function assertEmbeddingDim(embedding: number[], dim = EMBEDDING_DIM): number[] {
  if (!Array.isArray(embedding) || embedding.length !== dim) {
    throw new Error(`임베딩 차원 불일치: expected ${dim}, got ${embedding?.length}`)
  }
  return embedding
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function timeoutMs(): number {
  const raw = Number(process.env.HF_EMBED_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS
}

async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const ms = timeoutMs()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await operation(controller.signal)
  } catch (err) {
    const e = err as { name?: string; message?: string }
    if (e?.name === 'AbortError') {
      throw new Error(`HF 임베딩 요청 타임아웃(${ms}ms)`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function isRetryable(err: unknown): boolean {
  const e = err as { status?: number; name?: string; message?: string }
  return (
    e?.status === 429 ||
    (e?.status ?? 0) >= 500 ||
    e?.name === 'AbortError' ||
    /rate|loading|timeout|timed out|abort/i.test(e?.message ?? '')
  )
}

async function featureExtraction(text: string): Promise<number[]> {
  const result = await withTimeout((signal) =>
    hf().featureExtraction(
      { model: EMBEDDING_MODEL, inputs: text, provider: provider() },
      { signal }
    )
  )
  return assertEmbeddingDim(Array.from(result as number[]))
}

export async function embedQuery(text: string): Promise<number[]> {
  for (let attempt = 0; attempt < QUERY_ATTEMPTS; attempt++) {
    try {
      return await featureExtraction(text)
    } catch (err) {
      if (!isRetryable(err) || attempt === QUERY_ATTEMPTS - 1) throw err
      await sleep(Math.min(1000 * 2 ** attempt, 5000))
    }
  }
  throw new Error('HF 임베딩 요청 실패')
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    let attempt = 0
    while (true) {
      try {
        const results = await Promise.all(batch.map((t) => featureExtraction(t)))
        out.push(...results)
        break
      } catch (err) {
        // 429/5xx/timeout 지수 백오프 (HF 무료 추론 throttle 대응)
        if (isRetryable(err) && attempt < BATCH_ATTEMPTS) {
          await sleep(Math.min(2000 * 2 ** attempt, 30000))
          attempt++
          continue
        }
        throw err
      }
    }
  }
  return out
}

// ── 기존 호출부 호환 alias ───────────────────────────────────────────────
export const embedText = embedQuery
export const embedTexts = embedDocuments
