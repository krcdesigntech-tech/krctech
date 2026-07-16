-- Harden bot worker leasing and document chunk RPC access.

ALTER TABLE public.bot_questions
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bot_questions_processing_lease
  ON public.bot_questions (lease_expires_at)
  WHERE status = 'processing';

CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding   extensions.vector(1024),
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
  extensions.vector,
  double precision,
  integer,
  uuid,
  uuid[]
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.match_document_chunks(
  extensions.vector,
  double precision,
  integer,
  uuid,
  uuid[]
) TO authenticated, service_role;
