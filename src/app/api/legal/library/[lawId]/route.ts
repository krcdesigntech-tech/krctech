import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 적재된 법령 한 건의 조문 전문(코퍼스 law_chunks 기준).
export async function GET(_request: Request, { params }: { params: Promise<{ lawId: string }> }) {
  const { lawId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { data: law, error: lawErr } = await supabase
    .from('laws')
    .select('id, law_name, canonical_law_name, ministry, effective_date, source, law_id, mst')
    .eq('id', lawId)
    .single()
  if (lawErr || !law) return NextResponse.json({ error: '법령을 찾을 수 없습니다.' }, { status: 404 })

  const { data: chunks, error } = await supabase
    .from('law_chunks')
    .select('chunk_index, article_no, article_title, content, metadata')
    .eq('law_id', lawId)
    .order('chunk_index', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const detailLink = law.law_id
    ? `https://www.law.go.kr/법령/${encodeURIComponent(law.law_name)}`
    : undefined

  return NextResponse.json({ law: { ...law, detail_link: detailLink }, articles: chunks ?? [] })
}
