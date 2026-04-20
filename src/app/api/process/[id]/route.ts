import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getR2ObjectBuffer } from '@/lib/r2/client'
import { parseDocument, getFileTypeFromExtension, SupportedFileType } from '@/lib/document-processor'
import { chunkText } from '@/lib/document-processor/chunker'
import { embedTexts } from '@/lib/huggingface/embeddings'

export const maxDuration = 60

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  // Get document metadata
  const { data: doc } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!doc) return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })
  if (doc.status === 'ready') return NextResponse.json({ message: '이미 처리된 문서입니다.' })

  const serviceClient = await createServiceClient()

  // Update status to processing
  await serviceClient
    .from('documents')
    .update({ status: 'processing' })
    .eq('id', id)

  try {
    // 1. Download from R2
    const buffer = await getR2ObjectBuffer(doc.r2_key)

    // 2. Parse document
    const fileType = (doc.file_type as SupportedFileType) ||
      getFileTypeFromExtension(doc.original_name) ||
      'pdf'

    const { text, pageCount } = await parseDocument(buffer, fileType)

    if (!text.trim()) {
      throw new Error('문서에서 텍스트를 추출할 수 없습니다.')
    }

    // 3. Chunk text
    const chunks = chunkText(text)

    if (chunks.length === 0) {
      throw new Error('문서 내용이 너무 짧습니다.')
    }

    // 4. Embed chunks
    const chunkTexts = chunks.map((c) => c.content)
    const embeddings = await embedTexts(chunkTexts)

    // 5. Insert chunks into DB
    const chunkRows = chunks.map((chunk, i) => ({
      document_id: id,
      user_id: user.id,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      embedding: embeddings[i],
      token_count: chunk.tokenCount,
      page_number: chunk.pageNumber || null,
      metadata: chunk.metadata,
    }))

    // Delete old chunks if re-processing
    await serviceClient.from('document_chunks').delete().eq('document_id', id)

    // Insert in batches of 50
    for (let i = 0; i < chunkRows.length; i += 50) {
      const batch = chunkRows.slice(i, i + 50)
      const { error } = await serviceClient.from('document_chunks').insert(batch)
      if (error) throw new Error(`청크 저장 오류: ${error.message}`)
    }

    // 6. Update document status to ready
    await serviceClient.from('documents').update({
      status: 'ready',
      page_count: pageCount || null,
      chunk_count: chunks.length,
      error_message: null,
    }).eq('id', id)

    return NextResponse.json({
      success: true,
      chunkCount: chunks.length,
      pageCount: pageCount || null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '처리 중 오류가 발생했습니다.'

    await serviceClient.from('documents').update({
      status: 'error',
      error_message: message,
    }).eq('id', id)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
