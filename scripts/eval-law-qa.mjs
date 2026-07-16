/**
 * 법령 검색 품질 평가. fixtures/law-qa-eval.json 의 각 문항을 임베딩 →
 * match_law_chunks 로 검색해 top-k 안에 기대 법령/조문이 들어오는지 측정한다.
 * (web 서버 없이 직접 RPC 호출)
 *
 *   pnpm eval:law-qa            # top-5 기본
 *   pnpm eval:law-qa -- --k 8
 *
 * env(.env.local): GEMINI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { embedQuery } from '../src/lib/llm/hf-embeddings.ts'
import { parseLegalQuery } from '../src/lib/law/query-parser.ts'

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

const kIdx = process.argv.indexOf('--k')
const K = kIdx >= 0 ? parseInt(process.argv[kIdx + 1], 10) : 5

const norm = (s) => (s || '').replace(/\s+/g, '').replace(/[「」]/g, '')

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env 누락')
  const db = createClient(url, key, { auth: { persistSession: false } })

  const fixture = JSON.parse(readFileSync(resolve('fixtures/law-qa-eval.json'), 'utf8'))
  const items = fixture.items || []

  let lawHit = 0
  let articleHit = 0
  let articleTotal = 0

  for (const it of items) {
    const parsed = parseLegalQuery(it.question)
    const v = await embedQuery(it.question)
    const { data, error } = await db.rpc('match_law_chunks', {
      query_embedding: v,
      match_count: K,
      query_text: it.question,
      law_name_filter: parsed.lawName,
      article_filter: parsed.articleRef,
    })
    if (error) throw new Error(error.message)
    const rows = data || []

    const lawNames = rows.map((r) => norm(r.law_name) + norm(r.canonical_law_name))
    const expected = norm(it.expected_law)
    const law = lawNames.some((n) => n.includes(expected) || expected.includes(norm(it.expected_law)))
    if (law) lawHit++

    let art = true
    if (it.expected_article) {
      articleTotal++
      art = rows.some((r) => norm(r.article_no) === norm(it.expected_article))
      if (art) articleHit++
    }

    console.log(`${law ? '✅' : '❌'} ${it.question}  →  ${rows[0] ? rows[0].law_name + ' ' + (rows[0].article_no || '') : '(no hit)'}`)
  }

  const n = items.length
  console.log(`\n법령 top-${K} hit: ${lawHit}/${n} (${Math.round((lawHit / n) * 100)}%)`)
  if (articleTotal) console.log(`조문 exact hit: ${articleHit}/${articleTotal} (${Math.round((articleHit / articleTotal) * 100)}%)`)
}

main().catch((e) => {
  console.error('[eval-law-qa] FATAL', e)
  process.exit(1)
})
