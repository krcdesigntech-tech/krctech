import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/law/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { extractFromPdf } from '@/lib/law/pdf-extractor'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/legal/admin/sync-pdf
 *
 * Body: multipart/form-data with `file` field (the reference PDF).
 *
 * Re-extracts topics + references from the PDF and **upserts** into
 * `legal_topics` / `legal_references`. Existing manually-verified
 * references (`verified_at IS NOT NULL`) are preserved unchanged; only
 * unverified rows are replaced for the matching topic.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file 필드(PDF)가 필요합니다.' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const extraction = await extractFromPdf(buffer)
  if (!extraction.topics.length) {
    return NextResponse.json(
      { error: 'PDF에서 항목을 추출하지 못했습니다.', warnings: extraction.warnings },
      { status: 422 }
    )
  }

  const supabase = await createServiceClient()
  const summary = { topics_upserted: 0, references_upserted: 0, references_preserved: 0 }

  // Upsert topics keyed on (chapter, topic_number, title) — represented as a
  // synthetic external key in `notes` would be heavy; instead we match on
  // (category, title). This matches the human-readable design and lets us
  // handle title edits gracefully.
  for (const t of extraction.topics) {
    const { data: existing } = await supabase
      .from('legal_topics')
      .select('id')
      .eq('category', t.category)
      .eq('title', t.title)
      .maybeSingle()

    let topicId = existing?.id as string | undefined
    if (!topicId) {
      const { data: inserted, error } = await supabase
        .from('legal_topics')
        .insert({
          category: t.category,
          title: t.title,
          pdf_page: t.pdf_page,
          summary: t.summary || null,
          ord: t.ord,
        })
        .select('id')
        .single()
      if (error) {
        return NextResponse.json({ error: error.message, stage: 'topic-insert', topic: t }, { status: 500 })
      }
      topicId = inserted.id as string
    } else {
      await supabase
        .from('legal_topics')
        .update({
          pdf_page: t.pdf_page,
          summary: t.summary || null,
          ord: t.ord,
        })
        .eq('id', topicId)
    }
    summary.topics_upserted++

    // Replace unverified references for this topic.
    const { count: preserved } = await supabase
      .from('legal_references')
      .select('id', { count: 'exact', head: true })
      .eq('topic_id', topicId)
      .not('verified_at', 'is', null)
    summary.references_preserved += preserved ?? 0

    await supabase
      .from('legal_references')
      .delete()
      .eq('topic_id', topicId)
      .is('verified_at', null)

    const refsForTopic = extraction.references.filter(
      (r) => r.topicTitle === t.title && r.topicNumber === t.topicNumber && r.chapter === t.chapter
    )
    if (refsForTopic.length) {
      const rows = refsForTopic.map((r) => ({
        topic_id: topicId!,
        law_name: r.law_name,
        canonical_law_name: r.canonical_law_name,
        article_ref: r.article_ref,
        api_target: r.api_target,
        confidence: r.confidence,
      }))
      const { error } = await supabase.from('legal_references').insert(rows)
      if (error) {
        return NextResponse.json({ error: error.message, stage: 'ref-insert', topicId }, { status: 500 })
      }
      summary.references_upserted += rows.length
    }
  }

  return NextResponse.json({
    ok: true,
    summary,
    warnings: extraction.warnings,
  })
}
