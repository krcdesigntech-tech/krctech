-- 00013_create_cost_calculators.sql
-- Cost estimation engine for civil engineering projects.

-- ─────────────────────────────────────────────────────────────────────────────
-- cost_calculators: definition of formulas for specific cost topics
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.cost_calculators (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id        UUID NOT NULL REFERENCES public.legal_topics(id) ON DELETE CASCADE,
  applies_when    JSONB NOT NULL,                      -- 'permit_rules.condition' logic
  formula_kind    TEXT NOT NULL CHECK (formula_kind IN ('fixed', 'rate', 'piecewise', 'lookup', 'manual')),
  formula         JSONB NOT NULL,                      -- parameters for the formula
  unit            TEXT NOT NULL DEFAULT 'KRW',
  reference_ids   UUID[] NOT NULL DEFAULT '{}',
  notes           TEXT,
  reviewed_by     UUID REFERENCES auth.users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cost_calculators_topic ON public.cost_calculators(topic_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- project_costs: calculated or manually entered costs for a project
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.project_costs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  topic_id            UUID NOT NULL REFERENCES public.legal_topics(id) ON DELETE CASCADE,
  calculator_id       UUID REFERENCES public.cost_calculators(id) ON DELETE SET NULL,
  is_applicable       BOOLEAN NOT NULL DEFAULT TRUE,
  estimated_amount    NUMERIC,
  actual_amount       NUMERIC,                         -- from user's quote/estimate
  currency            TEXT NOT NULL DEFAULT 'KRW',
  calculation_log     JSONB,                           -- how the estimate was derived
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_cost_unique UNIQUE (project_id, topic_id)
);

CREATE INDEX idx_project_costs_project ON public.project_costs(project_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- triggers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_cost_calculators_updated_at
  BEFORE UPDATE ON public.cost_calculators
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_project_costs_updated_at
  BEFORE UPDATE ON public.project_costs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.cost_calculators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read cost_calculators"
  ON public.cost_calculators FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage cost_calculators"
  ON public.cost_calculators FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Users can manage costs for their projects"
  ON public.project_costs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
