/**
 * 배포 전 LLM/DB 연결 헬스체크.
 *   - Gemini embed 1회 (768 차원 확인)
 *   - OpenRouter non-stream 1회
 *   - OpenRouter stream 1회
 *   - Supabase match_law_chunks RPC 1회
 *
 *   pnpm check:llm-env
 * env(.env.local): GEMINI_API_KEY, OPENROUTER_API_KEY,
 *                  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { embedQuery, EMBEDDING_DIM } from '../src/lib/llm/hf-embeddings.ts'
import { generateText, generateStream } from '../src/lib/llm/openrouter.ts'

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

async function step(name, fn) {
  try {
    const r = await fn()
    console.log(`✅ ${name}: ${r}`)
    return true
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`)
    return false
  }
}

async function main() {
  let pass = true

  pass &= await step('HF embed', async () => {
    const v = await embedQuery('환경영향평가법 제9조')
    if (v.length !== EMBEDDING_DIM) throw new Error(`dim ${v.length}`)
    return `${v.length}차원 OK`
  })

  pass &= await step('OpenRouter non-stream', async () => {
    const t = await generateText([{ role: 'user', content: '한 단어로만 답해: 테스트' }], 16)
    return t.slice(0, 40)
  })

  pass &= await step('OpenRouter stream', async () => {
    let out = ''
    for await (const tok of generateStream([{ role: 'user', content: '안녕이라고만 답해' }], 16)) {
      out += tok
      if (out.length > 20) break
    }
    return out.slice(0, 40) || '(빈 응답)'
  })

  pass &= await step('Supabase match_law_chunks', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Supabase env 누락')
    const db = createClient(url, key, { auth: { persistSession: false } })
    const v = await embedQuery('지표조사')
    const { data, error } = await db.rpc('match_law_chunks', { query_embedding: v, match_count: 3 })
    if (error) throw new Error(error.message)
    return `${data?.length ?? 0}건`
  })

  if (!pass) process.exit(1)
  console.log('\n모든 헬스체크 통과 ✅')
}

main().catch((e) => {
  console.error('[check-llm-env] FATAL', e)
  process.exit(1)
})
