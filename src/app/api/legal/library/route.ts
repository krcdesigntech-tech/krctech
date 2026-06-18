import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 적재된 오픈소스 법령(법제처 조문) 목록. RLS: authenticated read-only.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { data: laws, error } = await supabase
    .from('laws')
    .select('id, law_name, canonical_law_name, ministry, effective_date, source')
    .order('law_name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ laws: laws ?? [] })
}
