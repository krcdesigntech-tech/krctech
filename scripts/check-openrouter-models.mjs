/**
 * OpenRouter 무료 모델 체인이 실제로 존재하는지 배포 전 점검.
 *   pnpm check:openrouter-models
 * env(.env.local): OPENROUTER_API_KEY
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { OPENROUTER_MODELS, OPENROUTER_BASE } from '../src/lib/llm/openrouter-models.ts'

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = resolve(process.cwd(), f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}
loadEnv()

async function main() {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY 필요')

  const res = await fetch(`${OPENROUTER_BASE}/models`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`models 조회 실패 HTTP ${res.status}`)
  const json = await res.json()
  const available = new Set((json.data || []).map((m) => m.id))

  let ok = 0
  for (const model of OPENROUTER_MODELS) {
    const present = available.has(model)
    console.log(`${present ? '✅' : '❌'} ${model}`)
    if (present) ok++
  }
  console.log(`\n${ok}/${OPENROUTER_MODELS.length} 모델 사용 가능`)
  if (ok === 0) process.exit(1)
}

main().catch((e) => {
  console.error('[check-openrouter-models] FATAL', e)
  process.exit(1)
})
