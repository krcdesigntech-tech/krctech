import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/law/auth'

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const category = url.searchParams.get('category')

  const supabase = await createClient()
  let q = supabase
    .from('legal_topics')
    .select('id, category, title, pdf_page, summary, ord')
    .order('category', { ascending: true })
    .order('ord', { ascending: true })

  if (category) q = q.eq('category', category)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Count references per topic so the index page can show "N개 법령" badge.
  const ids = (data ?? []).map((t) => t.id)
  let counts: Record<string, number> = {}
  if (ids.length) {
    const { data: refs } = await supabase
      .from('legal_references')
      .select('topic_id')
      .in('topic_id', ids)
    counts = (refs ?? []).reduce<Record<string, number>>((acc, r) => {
      acc[r.topic_id as string] = (acc[r.topic_id as string] ?? 0) + 1
      return acc
    }, {})
  }

  const topics = (data ?? []).map((t) => ({ ...t, reference_count: counts[t.id] ?? 0 }))
  return NextResponse.json({ topics })
}
