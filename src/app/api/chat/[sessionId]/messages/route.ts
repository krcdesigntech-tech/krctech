import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { runRagPipeline } from '@/lib/rag/pipeline'
import type { MatchedChunk } from '@/types/database.types'

export const maxDuration = 60

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  // Verify session ownership
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 })

  const { content, documentIds } = await request.json()

  if (!content?.trim()) {
    return NextResponse.json({ error: '질문 내용을 입력해 주세요.' }, { status: 400 })
  }

  const serviceClient = await createServiceClient()

  // Save user message
  await serviceClient.from('chat_messages').insert({
    session_id: sessionId,
    user_id: user.id,
    role: 'user',
    content: content.trim(),
  })

  // Get recent chat history
  const { data: historyRows } = await serviceClient
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(7)

  const chatHistory = (historyRows || [])
    .reverse()
    .slice(0, -1)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const effectiveDocIds = documentIds?.length > 0
    ? documentIds
    : (session.document_ids?.length > 0 ? session.document_ids : undefined)

  // Run RAG pipeline
  const startTime = Date.now()
  let retrievedChunks: MatchedChunk[] = []
  let fullResponse = ''

  try {
    const { stream, chunks } = await runRagPipeline({
      userId: user.id,
      question: content.trim(),
      documentIds: effectiveDocIds,
      chatHistory,
    })
    retrievedChunks = chunks

    // Stream SSE response
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Send retrieved chunks metadata first
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'sources', chunks: retrievedChunks })}\n\n`
            )
          )

          // Stream generation
          for await (const token of stream) {
            fullResponse += token
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'chunk', content: token })}\n\n`)
            )
          }

          // Save assistant message
          const latency = Date.now() - startTime
          const { data: savedMsg } = await serviceClient
            .from('chat_messages')
            .insert({
              session_id: sessionId,
              user_id: user.id,
              role: 'assistant',
              content: fullResponse,
              source_chunks: retrievedChunks,
              model_used: 'Qwen/Qwen2.5-7B-Instruct',
              latency_ms: latency,
            })
            .select('id')
            .single()

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'done', messageId: savedMsg?.id })}\n\n`
            )
          )

          // Update session title if first message
          if (session.message_count === 0) {
            const title = content.trim().slice(0, 40) + (content.length > 40 ? '...' : '')
            await serviceClient
              .from('chat_sessions')
              .update({ title, document_ids: effectiveDocIds || [] })
              .eq('id', sessionId)
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'AI 응답 생성 중 오류가 발생했습니다.'
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`)
          )
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'RAG 파이프라인 오류'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ messages: data })
}
