import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/law/auth'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()

  const { data: topic, error: topicErr } = await supabase
    .from('legal_topics')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (topicErr) return NextResponse.json({ error: topicErr.message }, { status: 500 })
  if (!topic) return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 })

  const { data: references, error: refsErr } = await supabase
    .from('legal_references')
    .select('*')
    .eq('topic_id', id)
    .order('confidence', { ascending: false })

  if (refsErr) return NextResponse.json({ error: refsErr.message }, { status: 500 })

  return NextResponse.json({ topic, references: references ?? [] })
}
