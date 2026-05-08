import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/law/auth'
import { createServiceClient } from '@/lib/supabase/server'

const PatchSchema = z.object({
  canonical_law_name: z.string().nullable().optional(),
  law_id: z.string().nullable().optional(),
  mst: z.string().nullable().optional(),
  article_ref: z.string().nullable().optional(),
  ministry: z.string().nullable().optional(),
  api_target: z.enum(['law', 'eflaw', 'admrul', 'external']).optional(),
  confidence: z.number().min(0).max(1).optional(),
  verified: z.boolean().optional(),
  notes: z.string().nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.', details: parsed.error.format() }, { status: 400 })
  }

  const { verified, ...rest } = parsed.data
  const update: Record<string, unknown> = { ...rest }
  if (verified === true) update.verified_at = new Date().toISOString()
  if (verified === false) update.verified_at = null

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('legal_references')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Invalidate any cache rows that referenced the previous external_id.
  if (rest.law_id || rest.mst) {
    await supabase
      .from('law_api_cache')
      .delete()
      .eq('external_id', rest.law_id ?? rest.mst ?? '')
  }

  return NextResponse.json({ reference: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = await createServiceClient()
  const { error } = await supabase.from('legal_references').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
