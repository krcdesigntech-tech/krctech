import { HfInference } from '@huggingface/inference'

const hf = new HfInference(process.env.HF_TOKEN)

const GENERATION_MODEL = 'Qwen/Qwen2.5-7B-Instruct'

export type HfMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function* generateStream(
  messages: HfMessage[],
  maxTokens = 1024
): AsyncGenerator<string> {
  let attempt = 0
  while (attempt < 3) {
    try {
      const stream = hf.chatCompletionStream({
        model: GENERATION_MODEL,
        messages: messages as any,
        max_tokens: maxTokens,
        temperature: 0.1,
        provider: 'auto',
      } as any)

      for await (const chunk of stream) {
        const delta = (chunk as any).choices?.[0]?.delta?.content
        if (delta) yield delta
      }
      return
    } catch (err: unknown) {
      const error = err as { status?: number }
      if (error?.status === 429 && attempt < 2) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 2000))
        attempt++
      } else {
        throw err
      }
    }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
