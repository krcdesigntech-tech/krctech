-- Switch document embeddings from bge-m3 (1024) to Gemini gemini-embedding-001 (768).
-- 기존 1024 임베딩은 임베딩 공간이 달라 무효이므로 컬럼을 재생성한다 (재임베딩 전제).
-- 운영 절차: 이 마이그레이션 적용 후 scripts/reembed-documents.mjs 또는
-- 각 문서 재처리(/api/process/[id])로 document_chunks.embedding을 다시 채운다.

-- 1) HNSW 인덱스 제거 → 컬럼 재생성 → 인덱스 재생성
DROP INDEX IF EXISTS public.idx_chunks_embedding;

ALTER TABLE public.document_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE public.document_chunks ADD COLUMN embedding extensions.vector(768);

CREATE INDEX idx_chunks_embedding ON public.document_chunks
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 2) match_document_chunks를 768 시그니처로 재정의 (00012의 권한/인증 하드닝 유지)
DROP FUNCTION IF EXISTS public.match_document_chunks(
  extensions.vector, double precision, integer, uuid, uuid[]
);

CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding   extensions.vector(768),
  match_threshold   FLOAT DEFAULT 0.3,
  match_count       INT DEFAULT 8,
  filter_user_id    UUID DEFAULT NULL,
  filter_doc_ids    UUID[] DEFAULT NULL
)
RETURNS TABLE (
  id                UUID,
  document_id       UUID,
  chunk_index       INT,
  content           TEXT,
  page_number       INT,
  metadata          JSONB,
  similarity        FLOAT,
  document_name     TEXT,
  document_category document_category
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  effective_user_id UUID;
BEGIN
  IF auth.role() = 'service_role' THEN
    effective_user_id := filter_user_id;
  ELSE
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;

    IF filter_user_id IS NOT NULL AND filter_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'cannot search another user''s documents' USING ERRCODE = '42501';
    END IF;

    effective_user_id := auth.uid();
  END IF;

  IF effective_user_id IS NULL THEN
    RAISE EXCEPTION 'filter_user_id is required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.content,
    dc.page_number,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    d.original_name AS document_name,
    d.category AS document_category
  FROM public.document_chunks dc
  JOIN public.documents d ON d.id = dc.document_id
  WHERE
    dc.user_id = effective_user_id
    AND (filter_doc_ids IS NULL OR dc.document_id = ANY(filter_doc_ids))
    AND d.status = 'ready'
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.match_document_chunks(
  extensions.vector, double precision, integer, uuid, uuid[]
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.match_document_chunks(
  extensions.vector, double precision, integer, uuid, uuid[]
) TO authenticated, service_role;
