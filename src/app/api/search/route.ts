import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/huggingface/embeddings'
import { retrieveChunks } from '@/lib/rag/retriever'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { query, documentIds } = await request.json()

  if (!query?.trim()) {
    return NextResponse.json({ error: '검색어를 입력해 주세요.' }, { status: 400 })
  }

  const embedding = await embedText(query.trim())
  const chunks = await retrieveChunks(embedding, user.id, documentIds, 10, 0.25)

  return NextResponse.json({ results: chunks })
}
