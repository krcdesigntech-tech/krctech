-- 00014_create_law_change_events.sql
-- Logging and tracking changes in laws linked to the system.

-- ─────────────────────────────────────────────────────────────────────────────
-- law_change_events: records detected changes in legal references
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.law_change_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id    UUID REFERENCES public.legal_references(id) ON DELETE CASCADE,
  law_id          TEXT,
  article_ref     TEXT,
  change_type     TEXT NOT NULL CHECK (change_type IN ('promulgated', 'enforced', 'pending', 'repealed')),
  effective_date  DATE,
  prev_summary    TEXT,
  curr_summary    TEXT,
  diff            JSONB,                     -- structured diff of the payload
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_law_change_events_reference ON public.law_change_events(reference_id);
CREATE INDEX idx_law_change_events_law_id ON public.law_change_events(law_id);
CREATE INDEX idx_law_change_events_date ON public.law_change_events(effective_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.law_change_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read law_change_events"
  ON public.law_change_events FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Changes are created by the system/cron
CREATE POLICY "Admins manage law_change_events"
  ON public.law_change_events FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
