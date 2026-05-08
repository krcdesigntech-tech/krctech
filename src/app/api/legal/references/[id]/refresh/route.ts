import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/law/auth'
import { resolveReferenceLatest } from '@/lib/law/resolver'
import type { LegalReference } from '@/types/law.types'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { data: ref, error } = await supabase
    .from('legal_references')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!ref) return NextResponse.json({ error: '참조를 찾을 수 없습니다.' }, { status: 404 })

  try {
    const result = await resolveReferenceLatest(ref as LegalReference, { force: true })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Refresh failed' },
      { status: 502 }
    )
  }
}
