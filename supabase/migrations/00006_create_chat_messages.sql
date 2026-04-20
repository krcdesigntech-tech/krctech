-- Message roles
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');

-- Chat messages
CREATE TABLE public.chat_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          message_role NOT NULL,
  content       TEXT NOT NULL,
  source_chunks JSONB DEFAULT '[]'::jsonb,
  token_count   INT,
  model_used    TEXT,
  latency_ms    INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_session_id ON public.chat_messages(session_id);
CREATE INDEX idx_messages_user_id ON public.chat_messages(user_id);
CREATE INDEX idx_messages_created_at ON public.chat_messages(session_id, created_at);

-- Increment session message count on new message
CREATE OR REPLACE FUNCTION increment_session_message_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.chat_sessions
  SET
    message_count = message_count + 1,
    last_message_at = NOW(),
    updated_at = NOW()
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_message_created
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION increment_session_message_count();

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own messages"
  ON public.chat_messages FOR ALL
  USING (auth.uid() = user_id);
