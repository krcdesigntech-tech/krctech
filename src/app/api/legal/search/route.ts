import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/law/auth'
import { searchLaw } from '@/lib/law/open-law-client'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const query = url.searchParams.get('query')?.trim()
  if (!query) return NextResponse.json({ error: 'query is required' }, { status: 400 })

  const supabase = await createClient()
  // Local search across topic titles and reference law names (trigram).
  const [topicsResult, refsResult] = await Promise.all([
    supabase
      .from('legal_topics')
      .select('id, category, title, pdf_page')
      .ilike('title', `%${query}%`)
      .limit(20),
    supabase
      .from('legal_references')
      .select('id, topic_id, law_name, canonical_law_name, article_ref')
      .or(`law_name.ilike.%${query}%,canonical_law_name.ilike.%${query}%`)
      .limit(20),
  ])

  // Live remote search.
  let remote: Awaited<ReturnType<typeof searchLaw>> = []
  try {
    remote = await searchLaw(query, { display: 10 })
  } catch (e) {
    return NextResponse.json({
      query,
      topics: topicsResult.data ?? [],
      references: refsResult.data ?? [],
      remote: [],
      remote_error: e instanceof Error ? e.message : 'remote search failed',
    })
  }

  return NextResponse.json({
    query,
    topics: topicsResult.data ?? [],
    references: refsResult.data ?? [],
    remote,
  })
}
