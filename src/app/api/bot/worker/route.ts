import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyWorkerSecret } from '@/lib/bot/auth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  if (!verifyWorkerSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('bot_questions')
    .select('id, question, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(10)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ questions: data })
}

export async function POST(request: NextRequest) {
  if (!verifyWorkerSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  let body: { action?: string; id?: string; worker_id?: string; answer?: string; rag_context?: string; error?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  }

  const { action, id } = body

  if (!action || !id) {
    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  }

  if (action === 'claim') {
    const { worker_id } = body
    const { data, error } = await supabase
      .from('bot_questions')
      .update({ status: 'processing', worker_id })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })

    return NextResponse.json({ ok: true })
  }

  if (action === 'complete') {
    const { answer, rag_context } = body
    const { data, error } = await supabase
      .from('bot_questions')
      .update({
        status: 'completed',
        answer,
        rag_context: rag_context ?? null,
        answered_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })

    return NextResponse.json({ ok: true })
  }

  if (action === 'fail') {
    const { error: workerError } = body
    const { data, error } = await supabase
      .from('bot_questions')
      .update({ status: 'failed', error: workerError })
      .eq('id', id)
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
