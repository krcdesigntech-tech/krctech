/**
 * @deprecated 현재 스택은 HuggingFace `bge-m3`(1024차원, `@/lib/llm/hf-embeddings`)로 고정.
 * 이 모듈은 사용하지 않으며 이력 보존용으로만 남긴다. 신규 코드는 hf-embeddings를 쓸 것.
 *
 * Google Gemini embeddings (server-side only).
 *
 * 임베딩은 Gemini 전용 (`gemini-embedding-001`, 768차원).
 * 생성(답변)은 OpenRouter 전용 (`@/lib/llm/openrouter`).
 *
 * - `embedQuery`   : RETRIEVAL_QUERY    (검색 질의)
 * - `embedDocuments`: RETRIEVAL_DOCUMENT (코퍼스 적재)
 * - `embedText`/`embedTexts`: 기존 HuggingFace 모듈과의 호환 alias
 *
 * 모델/차원 변경은 DB 전체 재임베딩이 필요한 breaking change다 (계획 Part A 참고).
 */

const MODEL = 'gemini-embedding-001'
export const EMBEDDING_DIM = 768
const BATCH = 50
const BASE = 'https://generativelanguage.googleapis.com/v1beta'

type TaskType = 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT'

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY env var is not set')
  return key
}

/** 저장 전 차원 검증. 통과 못 하면 throw 하여 잘못된 임베딩 적재를 막는다. */
export function assertEmbeddingDim(embedding: number[], dim = EMBEDDING_DIM): number[] {
  if (!Array.isArray(embedding) || embedding.length !== dim) {
    throw new Error(`임베딩 차원 불일치: expected ${dim}, got ${embedding?.length}`)
  }
  return embedding
}

/** 768 축소 임베딩의 스코어 분포 안정화를 위한 L2 정규화 (env 플래그로 on/off). */
function maybeNormalize(vec: number[]): number[] {
  if (process.env.EMBEDDING_NORMALIZE === 'false') return vec
  let norm = 0
  for (const v of vec) norm += v * v
  norm = Math.sqrt(norm)
  if (norm === 0) return vec
  return vec.map((v) => v / norm)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function batchEmbed(texts: string[], taskType: TaskType): Promise<number[][]> {
  const url = `${BASE}/models/${MODEL}:batchEmbedContents?key=${getApiKey()}`
  const requests = texts.map((text) => ({
    model: `models/${MODEL}`,
    content: { parts: [{ text }] },
    taskType,
    outputDimensionality: EMBEDDING_DIM,
  }))

  let attempt = 0
  while (true) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      })
      if (!res.ok) {
        const body = await res.text()
        const retryable = res.status === 429 || res.status >= 500
        if (retryable && attempt < 5) {
          await sleep(Math.min(2000 * 2 ** attempt, 30000))
          attempt++
          continue
        }
        throw new Error(`Gemini embed HTTP ${res.status}: ${body.slice(0, 200)}`)
      }
      const json = await res.json()
      const embeddings = (json?.embeddings ?? []) as Array<{ values: number[] }>
      if (embeddings.length !== texts.length) {
        throw new Error(`Gemini embed 응답 수 불일치: ${embeddings.length} vs ${texts.length}`)
      }
      return embeddings.map((e) => maybeNormalize(assertEmbeddingDim(e.values)))
    } catch (e) {
      if (attempt < 5) {
        await sleep(Math.min(2000 * 2 ** attempt, 30000))
        attempt++
        continue
      }
      throw e
    }
  }
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await batchEmbed([text], 'RETRIEVAL_QUERY')
  return vec
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH)
    out.push(...(await batchEmbed(batch, 'RETRIEVAL_DOCUMENT')))
  }
  return out
}

// ── 기존 호출부 호환 alias ───────────────────────────────────────────────
export const embedText = embedQuery
export const embedTexts = embedDocuments
