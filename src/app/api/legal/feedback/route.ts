import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 법령 Q&A 사용자 피드백. 본인 피드백만(RLS), qa_log당 1건 upsert.
const RATINGS = ['up', 'down', 'insufficient'] as const

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { qaLogId, rating, note } = await request.json()
  if (!qaLogId || !RATINGS.includes(rating)) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const { error } = await supabase.from('qa_feedback').upsert(
    {
      qa_log_id: qaLogId,
      user_id: user.id,
      rating,
      note: typeof note === 'string' ? note.slice(0, 1000) : null,
    },
    { onConflict: 'qa_log_id,user_id' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
