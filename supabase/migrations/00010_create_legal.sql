-- Legal reference tables: PDF business topics, mappings to laws, and law.go.kr API cache
-- Enables real-time integration with the 법제처 OPEN API while keeping the PDF as the
-- authoritative business-topic index.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────────────────────────────────────────────────────────────────────────
-- legal_topics: business topics extracted from the reference PDF table of contents
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.legal_topics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT NOT NULL
                CHECK (category IN ('비용', '계획', '문화유산', '환경', '재해', '개발', '안전', '군사', '건축', '해양', '참고')),
  title       TEXT NOT NULL,
  pdf_page    INT,
  summary     TEXT,
  ord         INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_legal_topics_category ON public.legal_topics (category, ord);
CREATE INDEX idx_legal_topics_title_trgm ON public.legal_topics USING GIN (title gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- legal_references: mapping from a topic to a specific law / article on law.go.kr
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.legal_references (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id            UUID NOT NULL REFERENCES public.legal_topics(id) ON DELETE CASCADE,
  law_name            TEXT NOT NULL,                       -- as written in the PDF
  canonical_law_name  TEXT,                                -- official name resolved via lawSearch
  article_ref         TEXT,                                -- e.g. "제9조", "제33조 제2항"
  api_target          TEXT NOT NULL DEFAULT 'law'
                        CHECK (api_target IN ('law', 'eflaw', 'admrul', 'external')),
  law_id              TEXT,                                -- 법령ID
  mst                 TEXT,                                -- 법령일련번호
  ministry            TEXT,                                -- 소관부처
  confidence          NUMERIC NOT NULL DEFAULT 1.0
                        CHECK (confidence >= 0 AND confidence <= 1),
  verified_at         TIMESTAMPTZ,                          -- set when an admin verifies the mapping
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_legal_references_topic ON public.legal_references (topic_id);
CREATE INDEX idx_legal_references_law_id ON public.legal_references (law_id);
CREATE INDEX idx_legal_references_confidence ON public.legal_references (confidence)
  WHERE verified_at IS NULL;
CREATE INDEX idx_legal_references_law_name_trgm ON public.legal_references USING GIN (law_name gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- law_api_cache: cached law.go.kr responses (per law/article)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.law_api_cache (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_target          TEXT NOT NULL CHECK (api_target IN ('law', 'eflaw', 'admrul')),
  external_id         TEXT NOT NULL,                       -- 법령ID or MST or admrul ID
  article_ref         TEXT,                                -- nullable; null = whole-law payload
  payload             JSONB NOT NULL,                      -- normalized response
  effective_date      DATE,                                -- 시행일자
  promulgation_date   DATE,                                -- 공포일자
  revision_type       TEXT,                                -- 제정/일부개정/전부개정/타법개정
  fetched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL,
  CONSTRAINT law_api_cache_unique UNIQUE (api_target, external_id, article_ref)
);

CREATE INDEX idx_law_api_cache_expires ON public.law_api_cache (expires_at);
CREATE INDEX idx_law_api_cache_lookup ON public.law_api_cache (api_target, external_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at triggers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_legal_topics_updated_at
  BEFORE UPDATE ON public.legal_topics
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_legal_references_updated_at
  BEFORE UPDATE ON public.legal_references
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — read for any authenticated user, writes only via service role
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.legal_topics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_references  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.law_api_cache     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read legal_topics"
  ON public.legal_topics FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users read legal_references"
  ON public.legal_references FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users read law_api_cache"
  ON public.law_api_cache FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admin-only edit policies (in addition to service-role bypass)
CREATE POLICY "Admins manage legal_topics"
  ON public.legal_topics FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins manage legal_references"
  ON public.legal_references FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
