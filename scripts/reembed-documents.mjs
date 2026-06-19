/**
 * 기존 document_chunks 를 HF bge-m3 1024 임베딩으로 재임베딩한다.
 * (00016 마이그레이션으로 embedding 컬럼이 1024로 재생성된 뒤 1회 실행)
 *
 *   pnpm reembed:documents            # 전체
 *   pnpm reembed:documents -- --limit 500
 *
 * env(.env.local): GEMINI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { embedDocuments } from '../src/lib/llm/hf-embeddings.ts'

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

const limitIdx = process.argv.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1], 10) : Infinity

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
const db = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  const PAGE = 200
  let from = 0
  let total = 0

  while (total < LIMIT) {
    const { data, error } = await db
      .from('document_chunks')
      .select('id, content')
      .is('embedding', null)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break

    const embeddings = await embedDocuments(data.map((d) => d.content))
    for (let i = 0; i < data.length; i++) {
      const { error: upErr } = await db
        .from('document_chunks')
        .update({ embedding: embeddings[i] })
        .eq('id', data[i].id)
      if (upErr) throw new Error(upErr.message)
    }
    total += data.length
    console.log(`[reembed] ${total} chunks done`)
    from += PAGE
  }

  console.log(`[reembed] complete: ${total} chunks`)
}

main().catch((e) => {
  console.error('[reembed] FATAL', e)
  process.exit(1)
})
