import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/law/auth'
import { getLaw } from '@/lib/law/open-law-client'
import { readCache, writeCache } from '@/lib/law/cache'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lawId: string }> }
) {
  const { lawId } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const article = url.searchParams.get('article')
  const articleRef = article ? (article.includes('조') ? article : `제${article}조`) : null

  const cacheKey = {
    api_target: 'law' as const,
    external_id: lawId,
    article_ref: articleRef,
  }
  const { row, stale } = await readCache(cacheKey)
  if (row && !stale) {
    return NextResponse.json({ payload: row.payload, cache: { fetched_at: row.fetched_at, expires_at: row.expires_at } })
  }

  try {
    const isMst = /^\d+$/.test(lawId)
    const payload = await getLaw({
      lawId: isMst ? undefined : lawId,
      mst: isMst ? lawId : undefined,
      articleRef: articleRef ?? undefined,
    })
    const cacheRow = await writeCache({
      ...cacheKey,
      payload,
      effective_date: payload.law.enforcement_date,
      promulgation_date: payload.law.promulgation_date,
      revision_type: payload.law.revision_type,
    })
    return NextResponse.json({
      payload,
      cache: { fetched_at: cacheRow.fetched_at, expires_at: cacheRow.expires_at },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Law fetch failed' },
      { status: 502 }
    )
  }
}
