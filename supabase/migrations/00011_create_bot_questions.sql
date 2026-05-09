-- Bot questions table for tracking user questions and AI responses
CREATE TABLE public.bot_questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  rag_context TEXT,
  answer      TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  worker_id   TEXT,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ
);

-- Indexes for efficient queries
CREATE INDEX idx_bot_questions_user_id ON public.bot_questions (user_id, created_at DESC);
CREATE INDEX idx_bot_questions_status ON public.bot_questions (status, created_at ASC);

-- Row Level Security
ALTER TABLE public.bot_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own questions"
  ON public.bot_questions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can select all questions"
  ON public.bot_questions FOR SELECT
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can insert own questions"
  ON public.bot_questions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can update all questions"
  ON public.bot_questions FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can delete all questions"
  ON public.bot_questions FOR DELETE
  USING (auth.role() = 'service_role');
