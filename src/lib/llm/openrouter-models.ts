/**
 * OpenRouter free-model fallback chain.
 *
 * 무료 모델명은 자주 바뀌므로 모든 모델 목록을 이 파일 한 곳에서 관리한다.
 * `scripts/check-openrouter-models.mjs`가 `/api/v1/models`로 존재 여부를 점검한다.
 *
 * 참고 프로젝트(수자원법령) `web/src/pages/api/ask.ts`의 체인을 이식했다.
 */

export const OPENROUTER_MODELS: string[] = [
  // 무료 모델 우선 (무크레딧 계정은 일일 ~50회 캡, 크레딧 $10+ 시 1000회/일)
  'google/gemma-4-31b-it:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'qwen/qwen3-coder:free',
  'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
  // 유료 폴백 (저렴·안정) — OpenRouter 크레딧 필요. 무료 모델이 429일 때 답변 보장.
  'google/gemini-2.5-flash',
  'openai/gpt-4o-mini',
]

/** 전체 체인을 몇 번 반복 재시도할지. */
export const OPENROUTER_PASSES = 2

/** 패스 사이 대기 (ms). */
export const OPENROUTER_RETRY_WAIT_MS = 1500

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
