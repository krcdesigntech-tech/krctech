import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyWorkerSecret } from '@/lib/bot/auth'
import { generateBotAnswer } from '@/lib/bot/answer'

export const runtime = 'nodejs'
export const maxDuration = 60

const CLAIM_LEASE_MS = 10 * 60 * 1000

function badRequest(message = 'unknown action') {
  return NextResponse.json({ error: message }, { status: 400 })
}

function workerConflict(message = 'not found') {
  return NextResponse.json({ error: message }, { status: 409 })
}

function getWorkerId(body: { worker_id?: unknown }) {
  return typeof body.worker_id === 'string' && body.worker_id.trim()
    ? body.worker_id.trim().slice(0, 128)
    : null
}

async function releaseExpiredClaims(supabase: Awaited<ReturnType<typeof createServiceClient>>) {
  const now = new Date().toISOString()
  const legacyCutoff = new Date(Date.now() - CLAIM_LEASE_MS).toISOString()
  const releasePatch = {
    status: 'pending',
    worker_id: null,
    claimed_at: null,
    lease_expires_at: null,
    error: null,
  }

  await supabase
    .from('bot_questions')
    .update(releasePatch)
    .eq('status', 'processing')
    .lt('lease_expires_at', now)

  await supabase
    .from('bot_questions')
    .update(releasePatch)
    .eq('status', 'processing')
    .is('lease_expires_at', null)
    .lt('created_at', legacyCutoff)
}

export async function GET(request: NextRequest) {
  if (!verifyWorkerSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  await releaseExpiredClaims(supabase)

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

  let body: {
    action?: unknown
    id?: unknown
    worker_id?: unknown
    answer?: unknown
    rag_context?: unknown
    error?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return badRequest()
  }

  const { action, id } = body

  if (typeof action !== 'string' || typeof id !== 'string' || !id.trim()) {
    return badRequest()
  }

  if (action === 'claim') {
    const workerId = getWorkerId(body)
    if (!workerId) return badRequest('worker_id is required')

    const now = new Date()
    const leaseExpiresAt = new Date(now.getTime() + CLAIM_LEASE_MS).toISOString()
    const { data, error } = await supabase
      .from('bot_questions')
      .update({
        status: 'processing',
        worker_id: workerId,
        claimed_at: now.toISOString(),
        lease_expires_at: leaseExpiresAt,
        error: null,
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return workerConflict()

    return NextResponse.json({ ok: true, lease_expires_at: leaseExpiresAt })
  }

  if (action === 'answer') {
    const workerId = getWorkerId(body)
    if (!workerId) return badRequest('worker_id is required')

    const { data: question, error } = await supabase
      .from('bot_questions')
      .select('id, user_id, question')
      .eq('id', id)
      .eq('status', 'processing')
      .eq('worker_id', workerId)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!question) return workerConflict()

    try {
      const { answer, ragContext } = await generateBotAnswer(
        question.user_id as string,
        question.question as string
      )

      if (!answer) {
        throw new Error('empty answer generated')
      }

      const { data, error: updateError } = await supabase
        .from('bot_questions')
        .update({
          status: 'completed',
          answer,
          rag_context: ragContext || null,
          answered_at: new Date().toISOString(),
          lease_expires_at: null,
          error: null,
        })
        .eq('id', id)
        .eq('status', 'processing')
        .eq('worker_id', workerId)
        .select('id')
        .maybeSingle()

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
      if (!data) return workerConflict()

      return NextResponse.json({ ok: true, answer_length: answer.length })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'answer generation failed'
      await supabase
        .from('bot_questions')
        .update({
          status: 'failed',
          error: message.slice(0, 500),
          lease_expires_at: null,
        })
        .eq('id', id)
        .eq('status', 'processing')
        .eq('worker_id', workerId)

      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  if (action === 'complete') {
    const workerId = getWorkerId(body)
    if (!workerId) return badRequest('worker_id is required')
    if (typeof body.answer !== 'string' || !body.answer.trim()) {
      return badRequest('answer is required')
    }

    const ragContext = typeof body.rag_context === 'string' ? body.rag_context : null
    const { data, error } = await supabase
      .from('bot_questions')
      .update({
        status: 'completed',
        answer: body.answer,
        rag_context: ragContext,
        answered_at: new Date().toISOString(),
        lease_expires_at: null,
        error: null,
      })
      .eq('id', id)
      .eq('status', 'processing')
      .eq('worker_id', workerId)
      .select('id')
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return workerConflict()

    return NextResponse.json({ ok: true })
  }

  if (action === 'fail') {
    const workerId = getWorkerId(body)
    if (!workerId) return badRequest('worker_id is required')
    const workerError = typeof body.error === 'string' ? body.error.slice(0, 500) : 'worker failed'
    const { data, error } = await supabase
      .from('bot_questions')
      .update({ status: 'failed', error: workerError, lease_expires_at: null })
      .eq('id', id)
      .eq('status', 'processing')
      .eq('worker_id', workerId)
      .select('id')
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return workerConflict()

    return NextResponse.json({ ok: true })
  }

  return badRequest()
}
