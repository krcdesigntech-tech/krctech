-- Vector similarity search function (used by RAG pipeline)
CREATE OR REPLACE FUNCTION match_document_chunks(
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
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
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
    (filter_user_id IS NULL OR dc.user_id = filter_user_id)
    AND (filter_doc_ids IS NULL OR dc.document_id = ANY(filter_doc_ids))
    AND d.status = 'ready'
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;
