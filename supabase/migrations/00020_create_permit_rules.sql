-- 00012_create_permit_rules.sql
-- Rules engine for matching project conditions to legal permits.

-- ─────────────────────────────────────────────────────────────────────────────
-- permit_rules: definition of conditions that trigger a permit/topic
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.permit_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id        UUID NOT NULL REFERENCES public.legal_topics(id) ON DELETE CASCADE,
  rule_key        TEXT NOT NULL,                       -- e.g. 'forest_conversion_required'
  condition       JSONB NOT NULL,                      -- { all: [...], any: [...] } predicate tree
  triggers        TEXT NOT NULL CHECK (triggers IN ('mandatory', 'recommended', 'review_needed')),
  rationale       TEXT NOT NULL,                       -- "산지 편입이 있으면 산지전용허가 대상"
  reference_ids   UUID[] NOT NULL DEFAULT '{}',        -- linked legal_references
  authored_by     UUID REFERENCES auth.users(id),
  reviewed_by     UUID REFERENCES auth.users(id),
  reviewed_at     TIMESTAMPTZ,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_permit_rules_topic ON public.permit_rules(topic_id) WHERE active;
CREATE INDEX idx_permit_rules_active ON public.permit_rules(active);

-- ─────────────────────────────────────────────────────────────────────────────
-- project_permits: the actual checklist items generated for a project
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.project_permits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  topic_id        UUID NOT NULL REFERENCES public.legal_topics(id) ON DELETE CASCADE,
  rule_id         UUID REFERENCES public.permit_rules(id) ON DELETE SET NULL,
  triggers        TEXT NOT NULL CHECK (triggers IN ('mandatory', 'recommended', 'review_needed')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'not_applicable')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_permit_unique UNIQUE (project_id, topic_id)
);

CREATE INDEX idx_project_permits_project ON public.project_permits(project_id);
CREATE INDEX idx_project_permits_status ON public.project_permits(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- triggers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_permit_rules_updated_at
  BEFORE UPDATE ON public.permit_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_project_permits_updated_at
  BEFORE UPDATE ON public.project_permits
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.permit_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_permits ENABLE ROW LEVEL SECURITY;

-- Rules are readable by authenticated users (to understand why they matched)
CREATE POLICY "Authenticated users read active permit_rules"
  ON public.permit_rules FOR SELECT
  USING (active = true AND auth.uid() IS NOT NULL);

-- Only admins manage rules
CREATE POLICY "Admins manage permit_rules"
  ON public.permit_rules FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Users can manage permits for their projects"
  ON public.project_permits FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
