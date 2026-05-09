import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { question?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'question is required' }, { status: 400 })
  }

  const question = body?.question
  if (!question || typeof question !== 'string' || question.trim() === '') {
    return NextResponse.json({ error: 'question is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('bot_questions')
    .insert({ user_id: user.id, question: question.trim(), status: 'pending' })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ id: data.id }, { status: 201 })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('bot_questions')
    .select('id, question, answer, status, error, rag_context, created_at, answered_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ questions: data })
}
