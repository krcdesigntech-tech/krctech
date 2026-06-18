-- Law corpus for semantic search + Q&A.
-- 참고서(PDF 02.02 / HWPX 02.23)에서 추출한 법령·조문을 법제처 전문으로 보강해
-- Gemini 768 임베딩과 함께 저장한다. (참고 프로젝트 수자원법령 db/schema.sql 패턴 이식)
--
-- pg_trgm은 00010에서 이미 활성화됨(gin_trgm_ops 사용).

-- ── 1) 원본 참고서 감사 테이블 ────────────────────────────────────────────
CREATE TABLE public.law_source_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type       TEXT NOT NULL CHECK (source_type IN ('pdf', 'hwpx')),
  filename          TEXT NOT NULL,
  source_date       DATE,
  page_count        INT,
  text_hash         TEXT,
  extractor_version TEXT,
  raw_text_path     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2) 추출된 법령 후보 (전역) ─────────────────────────────────────────────
CREATE TABLE public.law_references (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id UUID REFERENCES public.law_source_documents(id) ON DELETE SET NULL,
  topic_id           UUID REFERENCES public.legal_topics(id) ON DELETE SET NULL,
  law_name           TEXT NOT NULL,
  canonical_law_name TEXT,
  article_ref        TEXT,
  api_target         TEXT NOT NULL DEFAULT 'law'
                      CHECK (api_target IN ('law', 'eflaw', 'admrul', 'external')),
  law_id             TEXT,
  mst                TEXT,
  source_anchor      JSONB,   -- { page, line, paragraph }
  confidence         NUMERIC NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  match_status       TEXT NOT NULL DEFAULT 'needs_review'
                      CHECK (match_status IN ('resolved', 'ambiguous', 'not_found', 'external', 'needs_review')),
  raw_context        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_law_references_status ON public.law_references (match_status);
CREATE INDEX idx_law_references_lawid ON public.law_references (law_id);
CREATE INDEX idx_law_references_name_trgm ON public.law_references USING gin (law_name gin_trgm_ops);

-- ── 3) 법령 (법제처 전문 보강) ─────────────────────────────────────────────
CREATE TABLE public.laws (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  law_key            TEXT NOT NULL UNIQUE,  -- 스크립트 생성: "<api_target>:<law_id|mst|canonical>"
  law_name           TEXT NOT NULL,
  canonical_law_name TEXT,
  law_id             TEXT,
  mst                TEXT,
  api_target         TEXT NOT NULL DEFAULT 'law'
                      CHECK (api_target IN ('law', 'eflaw', 'admrul', 'external')),
  doc_type           TEXT,
  ministry           TEXT,
  effective_date     DATE,
  source             TEXT NOT NULL DEFAULT 'lawgokr'
                      CHECK (source IN ('lawgokr', 'manual', 'source_only')),
  raw_text           TEXT,
  content_hash       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_laws_name_trgm ON public.laws USING gin (law_name gin_trgm_ops);
CREATE INDEX idx_laws_lawid ON public.laws (law_id);

-- ── 4) 법령 조문 청크 (임베딩) ─────────────────────────────────────────────
CREATE TABLE public.law_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  law_id        UUID NOT NULL REFERENCES public.laws(id) ON DELETE CASCADE,
  chunk_index   INT NOT NULL,
  article_no    TEXT,
  article_title TEXT,
  content       TEXT NOT NULL,
  embedding     extensions.vector(768),
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { kind: 'article'|'appendix', ... }
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (law_id, chunk_index)
);

CREATE INDEX idx_law_chunks_law ON public.law_chunks (law_id);
CREATE INDEX idx_law_chunks_article ON public.law_chunks (article_no);
CREATE INDEX idx_law_chunks_embedding ON public.law_chunks
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ── 5) 청크 ↔ 참고서 원본 역추적 ───────────────────────────────────────────
CREATE TABLE public.law_chunk_sources (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id           UUID NOT NULL REFERENCES public.law_chunks(id) ON DELETE CASCADE,
  source_document_id UUID REFERENCES public.law_source_documents(id) ON DELETE SET NULL,
  reference_id       UUID REFERENCES public.law_references(id) ON DELETE SET NULL,
  source_anchor      JSONB,
  matched_text       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_law_chunk_sources_chunk ON public.law_chunk_sources (chunk_id);

-- ── 6) 약칭 ↔ 정식명 별칭 ──────────────────────────────────────────────────
CREATE TABLE public.law_aliases (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias              TEXT NOT NULL UNIQUE,
  canonical_law_name TEXT NOT NULL,
  api_target         TEXT NOT NULL DEFAULT 'law',
  law_id             TEXT,
  mst                TEXT,
  confidence         NUMERIC NOT NULL DEFAULT 1.0,
  verified_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 7) 미매칭 검수 큐 ──────────────────────────────────────────────────────
CREATE TABLE public.law_match_failures (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  law_name           TEXT NOT NULL,
  article_ref        TEXT,
  api_target         TEXT,
  source_anchor      JSONB,
  reason             TEXT,
  candidate_hits     JSONB,
  resolved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_law_match_failures_open ON public.law_match_failures (created_at)
  WHERE resolved_at IS NULL;

-- ── 8) 인제스천 감사 로그 ─────────────────────────────────────────────────
CREATE TABLE public.law_ingestion_runs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at             TIMESTAMPTZ,
  source_pdf_candidates   INT DEFAULT 0,
  source_hwpx_candidates  INT DEFAULT 0,
  candidate_count         INT DEFAULT 0,
  resolved_count          INT DEFAULT 0,
  failure_count           INT DEFAULT 0,
  embedded_count          INT DEFAULT 0,
  duration_ms             INT,
  model                   TEXT,
  embedding_dim           INT,
  notes                   TEXT,
  errors                  JSONB
);

-- ── updated_at 자동 갱신 트리거 ────────────────────────────────────────────
CREATE TRIGGER trg_law_references_updated
  BEFORE UPDATE ON public.law_references
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_laws_updated
  BEFORE UPDATE ON public.laws
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── RLS: authenticated 읽기 전용, 쓰기는 service_role ───────────────────────
ALTER TABLE public.law_source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.law_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laws ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.law_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.law_chunk_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.law_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.law_match_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.law_ingestion_runs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'law_source_documents','law_references','laws','law_chunks',
    'law_chunk_sources','law_aliases','law_match_failures','law_ingestion_runs'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true);',
      t || '_read', t
    );
  END LOOP;
END $$;

-- ── 하이브리드 검색 RPC ────────────────────────────────────────────────────
-- 벡터 코사인 + 법령명 trigram + 조문번호 exact boost 합산.
CREATE OR REPLACE FUNCTION public.match_law_chunks(
  query_embedding   extensions.vector(768),
  match_count       INT DEFAULT 8,
  query_text        TEXT DEFAULT NULL,
  law_name_filter   TEXT DEFAULT NULL,
  article_filter    TEXT DEFAULT NULL
)
RETURNS TABLE (
  chunk_id           UUID,
  law_id             UUID,
  law_name           TEXT,
  canonical_law_name TEXT,
  article_no         TEXT,
  article_title      TEXT,
  content            TEXT,
  kind               TEXT,
  source             TEXT,
  similarity         FLOAT,
  score              FLOAT,
  source_anchor      JSONB
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    lc.id AS chunk_id,
    l.id AS law_id,
    l.law_name,
    l.canonical_law_name,
    lc.article_no,
    lc.article_title,
    lc.content,
    COALESCE(lc.metadata->>'kind', 'article') AS kind,
    l.source,
    (1 - (lc.embedding <=> query_embedding))::float AS similarity,
    (
      (1 - (lc.embedding <=> query_embedding))
      + CASE WHEN law_name_filter IS NOT NULL
             THEN 0.4 * GREATEST(
               similarity(l.law_name, law_name_filter),
               similarity(COALESCE(l.canonical_law_name, ''), law_name_filter))
             ELSE 0 END
      + CASE WHEN article_filter IS NOT NULL
                  AND lc.article_no IS NOT NULL
                  AND regexp_replace(lc.article_no, '\s', '', 'g')
                      = regexp_replace(article_filter, '\s', '', 'g')
             THEN 0.5 ELSE 0 END
    )::float AS score,
    (
      SELECT lcs.source_anchor FROM public.law_chunk_sources lcs
      WHERE lcs.chunk_id = lc.id
      ORDER BY lcs.created_at ASC LIMIT 1
    ) AS source_anchor
  FROM public.law_chunks lc
  JOIN public.laws l ON l.id = lc.law_id
  WHERE lc.embedding IS NOT NULL
  ORDER BY score DESC, similarity DESC
  LIMIT match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.match_law_chunks(
  extensions.vector, integer, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.match_law_chunks(
  extensions.vector, integer, text, text, text
) TO authenticated, service_role;
