import { HfInference } from '@huggingface/inference'

const hf = new HfInference(process.env.HF_TOKEN)

const EMBEDDING_MODEL = 'BAAI/bge-m3'
const BATCH_SIZE = 8

export async function embedText(text: string): Promise<number[]> {
  const result = await hf.featureExtraction({
    model: EMBEDDING_MODEL,
    inputs: text,
  })
  return Array.from(result as number[])
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)

    // Retry with exponential backoff for rate limiting
    let attempt = 0
    while (attempt < 4) {
      try {
        const results = await Promise.all(
          batch.map((text) =>
            hf.featureExtraction({ model: EMBEDDING_MODEL, inputs: text })
          )
        )
        embeddings.push(...results.map((r) => Array.from(r as number[])))
        break
      } catch (err: unknown) {
        const error = err as { status?: number; message?: string }
        if (error?.status === 429 && attempt < 3) {
          const delay = Math.pow(2, attempt) * 1000
          await new Promise((r) => setTimeout(r, delay))
          attempt++
        } else {
          throw err
        }
      }
    }
  }

  return embeddings
}
