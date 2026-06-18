-- 옵션 C: 임베딩을 HuggingFace BAAI/bge-m3 (1024차원)로 전환.
-- Gemini(768)로 적재했던 법령 코퍼스는 임베딩 공간이 달라 무효이므로 비우고
-- HF로 재적재한다. document_chunks 는 현재 0행.

-- ── 1) 법령 코퍼스 비우기 (HF로 재인제스트) ──────────────────────────────
TRUNCATE TABLE public.laws RESTART IDENTITY CASCADE;            -- law_chunks, law_chunk_sources(CASCADE)
TRUNCATE TABLE public.law_references RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.law_source_documents RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.law_match_failures RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.law_ingestion_runs RESTART IDENTITY CASCADE;

-- ── 2) document_chunks.embedding → vector(1024) ──────────────────────────
DROP INDEX IF EXISTS public.idx_chunks_embedding;
ALTER TABLE public.document_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE public.document_chunks ADD COLUMN embedding extensions.vector(1024);
CREATE INDEX idx_chunks_embedding ON public.document_chunks
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ── 3) law_chunks.embedding → vector(1024) ───────────────────────────────
DROP INDEX IF EXISTS public.idx_law_chunks_embedding;
ALTER TABLE public.law_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE public.law_chunks ADD COLUMN embedding extensions.vector(1024);
CREATE INDEX idx_law_chunks_embedding ON public.law_chunks
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ── 4) match_document_chunks → vector(1024) ──────────────────────────────
DROP FUNCTION IF EXISTS public.match_document_chunks(
  extensions.vector, double precision, integer, uuid, uuid[]
);
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding   extensions.vector(1024),
  match_threshold   FLOAT DEFAULT 0.3,
  match_count       INT DEFAULT 8,
  filter_user_id    UUID DEFAULT NULL,
  filter_doc_ids    UUID[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID, document_id UUID, chunk_index INT, content TEXT, page_number INT,
  metadata JSONB, similarity FLOAT, document_name TEXT, document_category document_category
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE effective_user_id UUID;
BEGIN
  IF auth.role() = 'service_role' THEN
    effective_user_id := filter_user_id;
  ELSE
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
    IF filter_user_id IS NOT NULL AND filter_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'cannot search another user''s documents' USING ERRCODE='42501';
    END IF;
    effective_user_id := auth.uid();
  END IF;
  IF effective_user_id IS NULL THEN RAISE EXCEPTION 'filter_user_id is required' USING ERRCODE='22023'; END IF;

  RETURN QUERY
  SELECT dc.id, dc.document_id, dc.chunk_index, dc.content, dc.page_number, dc.metadata,
         1 - (dc.embedding <=> query_embedding) AS similarity,
         d.original_name, d.category
  FROM public.document_chunks dc
  JOIN public.documents d ON d.id = dc.document_id
  WHERE dc.user_id = effective_user_id
    AND (filter_doc_ids IS NULL OR dc.document_id = ANY(filter_doc_ids))
    AND d.status = 'ready'
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;
REVOKE ALL ON FUNCTION public.match_document_chunks(extensions.vector, double precision, integer, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(extensions.vector, double precision, integer, uuid, uuid[]) TO authenticated, service_role;

-- ── 5) match_law_chunks → vector(1024) ───────────────────────────────────
DROP FUNCTION IF EXISTS public.match_law_chunks(
  extensions.vector, integer, text, text, text
);
CREATE OR REPLACE FUNCTION public.match_law_chunks(
  query_embedding   extensions.vector(1024),
  match_count       INT DEFAULT 8,
  query_text        TEXT DEFAULT NULL,
  law_name_filter   TEXT DEFAULT NULL,
  article_filter    TEXT DEFAULT NULL
)
RETURNS TABLE (
  chunk_id UUID, law_id UUID, law_name TEXT, canonical_law_name TEXT,
  article_no TEXT, article_title TEXT, content TEXT, kind TEXT, source TEXT,
  similarity FLOAT, score FLOAT, source_anchor JSONB
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT lc.id, l.id, l.law_name, l.canonical_law_name, lc.article_no, lc.article_title,
         lc.content, COALESCE(lc.metadata->>'kind','article'), l.source,
         (1 - (lc.embedding <=> query_embedding))::float AS similarity,
         (
           (1 - (lc.embedding <=> query_embedding))
           + CASE WHEN law_name_filter IS NOT NULL
                  THEN 0.4 * GREATEST(similarity(l.law_name, law_name_filter),
                                      similarity(COALESCE(l.canonical_law_name,''), law_name_filter))
                  ELSE 0 END
           + CASE WHEN article_filter IS NOT NULL AND lc.article_no IS NOT NULL
                       AND regexp_replace(lc.article_no,'\s','','g') = regexp_replace(article_filter,'\s','','g')
                  THEN 0.5 ELSE 0 END
         )::float AS score,
         (SELECT lcs.source_anchor FROM public.law_chunk_sources lcs
           WHERE lcs.chunk_id = lc.id ORDER BY lcs.created_at ASC LIMIT 1)
  FROM public.law_chunks lc
  JOIN public.laws l ON l.id = lc.law_id
  WHERE lc.embedding IS NOT NULL
  ORDER BY score DESC, similarity DESC
  LIMIT match_count;
END;
$$;
REVOKE ALL ON FUNCTION public.match_law_chunks(extensions.vector, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_law_chunks(extensions.vector, integer, text, text, text) TO authenticated, service_role;
