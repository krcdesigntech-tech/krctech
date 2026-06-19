/**
 * 법령 단건 적재 (승인된 add_law 제안 적용용). idempotent.
 *   node scripts/agent/ingest-one-law.mjs --name "지하안전관리에 관한 특별법" [--law-id <ID>] [--dry-run]
 * 반환(JSON): { ok, law_id, law_name, chunks } 또는 { ok:false, reason }
 *
 * 기존 ingest-laws 의 단건 경로를 공용 모듈(scripts/lib/lawgokr)로 추출 재사용 +
 * HF 임베딩(hf-embeddings). 법제처 API 외 임의 텍스트는 저장하지 않는다.
 */
import { db, args, sleep } from './_shared.mjs'
import { searchLaw, getWholeLaw, splitArticle, sha256 } from '../lib/lawgokr.mjs'
import { embedDocuments } from '../../src/lib/llm/hf-embeddings.ts'

const A = args()
const DRY = !!A['dry-run']
const NAME = A.name
const LAW_ID = A['law-id'] || null

export async function ingestOneLaw(sb, { name, lawId }, dry = false) {
  if (!name && !lawId) return { ok: false, reason: 'name 또는 law-id 필요' }

  // 1) 법령 식별
  let top
  if (lawId) {
    top = { law_id: lawId, mst: '' }
  } else {
    const hits = await searchLaw(name)
    await sleep(150)
    if (!hits.length || (!hits[0].law_id && !hits[0].mst)) {
      return { ok: false, reason: '법제처 검색 결과 없음', candidate_hits: hits }
    }
    top = hits[0]
  }

  // 2) 전문 fetch
  const whole = await getWholeLaw(top.law_id, top.mst)
  await sleep(150)
  if (!whole.articles.length) return { ok: false, reason: '조문 0건' }

  const canonical = whole.law_name || name
  const rawText = whole.articles.map((a) => `${a.article_ref} ${a.title ?? ''}\n${a.content}`).join('\n\n')
  const contentHash = await sha256(rawText)
  const lawKey = `law:${top.law_id || top.mst || canonical}`

  if (dry) {
    return { ok: true, dry: true, law_name: canonical, law_id: top.law_id, articles: whole.articles.length }
  }

  // 3) laws upsert
  const { data: lawRow, error: lawErr } = await sb
    .from('laws')
    .upsert(
      {
        law_key: lawKey,
        law_name: canonical,
        canonical_law_name: canonical,
        law_id: top.law_id || null,
        mst: top.mst || null,
        api_target: 'law',
        ministry: whole.ministry,
        effective_date: whole.effective_date,
        source: 'lawgokr',
        raw_text: rawText,
        content_hash: contentHash,
      },
      { onConflict: 'law_key' }
    )
    .select('id')
    .single()
  if (lawErr || !lawRow) return { ok: false, reason: `laws upsert: ${lawErr?.message}` }

  // 4) 청크 + HF 임베딩
  const chunks = []
  let idx = 0
  for (const art of whole.articles) {
    for (const piece of splitArticle(art.content)) {
      chunks.push({
        chunk_index: idx++,
        article_no: art.article_ref,
        article_title: art.title,
        content: `${art.article_ref} ${art.title ?? ''}\n${piece}`.trim(),
      })
    }
  }
  const embeddings = await embedDocuments(chunks.map((c) => c.content))

  // 5) 교체 삽입
  await sb.from('law_chunks').delete().eq('law_id', lawRow.id)
  const rows = chunks.map((c, i) => ({
    law_id: lawRow.id,
    chunk_index: c.chunk_index,
    article_no: c.article_no,
    article_title: c.article_title,
    content: c.content,
    embedding: embeddings[i],
    metadata: { kind: 'article' },
  }))
  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await sb.from('law_chunks').insert(rows.slice(i, i + 50))
    if (error) return { ok: false, reason: `law_chunks insert: ${error.message}` }
  }

  return { ok: true, law_id: lawRow.id, law_name: canonical, chunks: rows.length }
}

// CLI 직접 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  const sb = db()
  ingestOneLaw(sb, { name: NAME, lawId: LAW_ID }, DRY)
    .then((r) => { console.log(JSON.stringify(r, null, 2)); if (!r.ok) process.exit(2) })
    .catch((e) => { console.error('[ingest-one-law] FATAL', e); process.exit(1) })
}
