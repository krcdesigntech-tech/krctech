/**
 * Groq 무료 모델 체인 (OpenAI 호환 API).
 * 무료·고한도(예: llama-3.3-70b 30RPM·1,000/일, llama-3.1-8b 14,400/일).
 * 생성의 1순위 제공자. 실패/한도 시 OpenRouter 무료 체인으로 폴백.
 */

export const GROQ_BASE = 'https://api.groq.com/openai/v1'

export const GROQ_MODELS: string[] = [
  'llama-3.3-70b-versatile', // 고품질, 1,000회/일
  'llama-3.1-8b-instant',    // 빠름, 14,400회/일 (폴백)
  'gemma2-9b-it',
]
