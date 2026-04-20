import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateUploadPresignedUrl, getR2Key } from '@/lib/r2/client'
import { getFileTypeFromMime, FILE_SIZE_LIMIT } from '@/lib/document-processor'
import { z } from 'zod'

const schema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().positive(),
  category: z.enum(['permit', 'standard', 'report', 'drawing', 'specification', 'contract', 'other']),
  description: z.string().optional(),
  projectCode: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.', details: parsed.error.flatten() }, { status: 400 })
  }

  const { filename, mimeType, fileSizeBytes, category, description, projectCode, tags } = parsed.data

  if (fileSizeBytes > FILE_SIZE_LIMIT) {
    return NextResponse.json({ error: '파일 크기는 100MB를 초과할 수 없습니다.' }, { status: 400 })
  }

  const fileType = getFileTypeFromMime(mimeType)
  if (!fileType) {
    return NextResponse.json({
      error: '지원하지 않는 파일 형식입니다. PDF, DOCX, XLSX, HWPX 파일만 업로드 가능합니다.',
    }, { status: 400 })
  }

  // Create document metadata record
  const documentId = crypto.randomUUID()
  const r2Key = getR2Key(user.id, documentId, filename)

  const { error: dbError } = await supabase.from('documents').insert({
    id: documentId,
    user_id: user.id,
    name: filename.split('.')[0],
    original_name: filename,
    category,
    status: 'uploading',
    file_type: fileType,
    file_size_bytes: fileSizeBytes,
    r2_key: r2Key,
    description: description || null,
    project_code: projectCode || null,
    tags: tags || [],
  })

  if (dbError) {
    return NextResponse.json({ error: '문서 등록 중 오류가 발생했습니다.' }, { status: 500 })
  }

  // Generate presigned PUT URL
  const uploadUrl = await generateUploadPresignedUrl(r2Key, mimeType)

  return NextResponse.json({
    uploadUrl,
    documentId,
    r2Key,
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  })
}
