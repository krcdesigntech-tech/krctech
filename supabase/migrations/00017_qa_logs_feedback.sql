-- 법령 Q&A 로깅 + 사용자 피드백 (자가학습 신호의 원천).
-- 개인정보: question/answer 원문은 보존기간 후 마스킹/삭제 대상. RLS로 본인만 조회.

CREATE TABLE public.qa_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id           UUID,
  question             TEXT NOT NULL,
  question_hash        TEXT,                        -- 정규화 질문의 sha256 (집계/보존용)
  parsed               JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { lawName, articleRef }
  sources              JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{law_id, law_name, article_no, score, chunk_id}]
  source_snapshot      JSONB,                       -- 상위 근거 조문 일부 스냅샷(재현용)
  top_score            DOUBLE PRECISION,
  answer               TEXT,
  status               TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'empty')),
  error_code           TEXT,
  embedding_provider   TEXT,
  embedding_model      TEXT,
  generation_provider  TEXT,
  model_used           TEXT,
  prompt_version       TEXT,
  prompt_hash          TEXT,
  retrieval_count      INT,
  latency_ms           INT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_qa_logs_created_at ON public.qa_logs (created_at DESC);
CREATE INDEX idx_qa_logs_top_score ON public.qa_logs (top_score);
CREATE INDEX idx_qa_logs_status ON public.qa_logs (status, created_at DESC);
CREATE INDEX idx_qa_logs_question_hash ON public.qa_logs (question_hash);
CREATE INDEX idx_qa_logs_user ON public.qa_logs (user_id, created_at DESC);

CREATE TABLE public.qa_feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_log_id   UUID NOT NULL REFERENCES public.qa_logs(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating      TEXT NOT NULL CHECK (rating IN ('up', 'down', 'insufficient')),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (qa_log_id, user_id)
);

CREATE INDEX idx_qa_feedback_log ON public.qa_feedback (qa_log_id);
CREATE INDEX idx_qa_feedback_rating ON public.qa_feedback (rating, created_at DESC);

-- ── RLS: 본인 조회/피드백만, 쓰기는 service role (관리자 집계는 service-backed API) ──
ALTER TABLE public.qa_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY qa_logs_select_own ON public.qa_logs
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY qa_feedback_select_own ON public.qa_feedback
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY qa_feedback_insert_own ON public.qa_feedback
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY qa_feedback_update_own ON public.qa_feedback
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
