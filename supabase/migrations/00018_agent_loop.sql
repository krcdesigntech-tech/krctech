-- Hermes 자가학습 에이전트 운영 테이블 (제안/실행감사/평가/락).
-- 안전: 에이전트는 코퍼스를 직접 변경하지 않고 agent_proposals에 '제안'만 기록한다.
--       실제 적용은 관리자 승인 후 idempotent 스크립트로만 수행.

CREATE TABLE public.agent_proposals (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                   TEXT NOT NULL CHECK (kind IN ('add_law', 'add_alias', 'recanonicalize', 'reembed_law', 'note')),
  payload                JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_schema_version TEXT NOT NULL DEFAULT 'v1',
  rationale              TEXT,
  evidence               JSONB,            -- { qa_log_ids:[], failure_ids:[] }
  risk_level             TEXT NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
  status                 TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'failed')),
  created_by             TEXT NOT NULL DEFAULT 'hermes',
  reviewed_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at            TIMESTAMPTZ,
  applied_at             TIMESTAMPTZ,
  result                 JSONB,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_proposals_status ON public.agent_proposals (status, created_at DESC);
CREATE INDEX idx_agent_proposals_kind ON public.agent_proposals (kind);
-- 동일 제안 중복 방지(같은 종류·동일 payload 해시는 한 번만 열림)
CREATE UNIQUE INDEX idx_agent_proposals_dedupe
  ON public.agent_proposals (kind, md5(payload::text))
  WHERE status = 'pending';

CREATE TABLE public.agent_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  kind              TEXT NOT NULL DEFAULT 'improve' CHECK (kind IN ('collect', 'improve', 'eval')),
  status            TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  provider          TEXT,
  model             TEXT,
  prompt_version    TEXT,
  token_budget      INT,
  signals           JSONB,
  auto_actions      JSONB,
  proposals_created INT DEFAULT 0,
  summary           TEXT,
  errors            JSONB
);

CREATE INDEX idx_agent_runs_started ON public.agent_runs (started_at DESC);

CREATE TABLE public.eval_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total            INT,
  law_hit          INT,
  article_hit      INT,
  law_hit_rate     DOUBLE PRECISION,
  article_hit_rate DOUBLE PRECISION,
  k                INT,
  notes            TEXT
);

CREATE INDEX idx_eval_runs_created ON public.eval_runs (created_at DESC);

-- 야간 cron 중복 실행 방지 락
CREATE TABLE public.agent_locks (
  name        TEXT PRIMARY KEY,
  locked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  owner       TEXT,
  run_id      UUID
);

-- ── RLS: authenticated read, 쓰기는 service role ──
ALTER TABLE public.agent_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eval_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_proposals_read ON public.agent_proposals FOR SELECT TO authenticated USING (true);
CREATE POLICY agent_runs_read ON public.agent_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY eval_runs_read ON public.eval_runs FOR SELECT TO authenticated USING (true);
-- agent_locks: service role 전용(정책 없음 → authenticated 접근 불가, service는 RLS 우회)
