-- 00015_create_notifications.sql
-- Notification system for user alerts and updates.

-- ─────────────────────────────────────────────────────────────────────────────
-- notifications: queue and history of user alerts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('inapp', 'email', 'kakao')),
  type            TEXT NOT NULL,             -- 'law_change' | 'rule_change' | 'system'
  payload         JSONB NOT NULL,            -- { project_id, event_id, headline, body, deeplink }
  status          TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'read')),
  scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, status)
  WHERE status IN ('queued', 'sent');
CREATE INDEX idx_notifications_scheduled ON public.notifications(scheduled_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own notifications"
  ON public.notifications FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- System/Admin can queue notifications for any user
CREATE POLICY "Admins manage all notifications"
  ON public.notifications FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
