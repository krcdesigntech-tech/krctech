import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteR2Object } from '@/lib/r2/client'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })

  return NextResponse.json({ document: data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { data: doc } = await supabase
    .from('documents')
    .select('r2_key')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!doc) return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })

  // Delete R2 object
  try {
    await deleteR2Object(doc.r2_key)
  } catch {
    // Continue even if R2 delete fails
  }

  // Delete from DB (cascades to chunks)
  const { error } = await supabase.from('documents').delete().eq('id', id).eq('user_id', user.id)

  if (error) return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 })

  return NextResponse.json({ success: true })
}
