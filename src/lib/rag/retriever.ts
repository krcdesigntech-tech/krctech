import type { MatchedChunk } from '@/types/database.types'
import { createServiceClient } from '@/lib/supabase/server'

export async function retrieveChunks(
  queryEmbedding: number[],
  userId: string,
  documentIds?: string[],
  matchCount = 8,
  threshold = 0.3
): Promise<MatchedChunk[]> {
  const supabase = await createServiceClient()

  const { data, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: matchCount,
    filter_user_id: userId,
    filter_doc_ids: documentIds && documentIds.length > 0 ? documentIds : null,
  })

  if (error) throw new Error(`벡터 검색 오류: ${error.message}`)

  return (data || []) as MatchedChunk[]
}
