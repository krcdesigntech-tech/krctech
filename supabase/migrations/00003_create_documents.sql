-- Document categories
CREATE TYPE document_category AS ENUM (
  'permit',        -- 인허가 절차
  'standard',      -- 설계기준
  'report',        -- 보고서
  'drawing',       -- 도면
  'specification', -- 시방서
  'contract',      -- 계약서
  'other'          -- 기타
);

-- Document processing status
CREATE TYPE document_status AS ENUM (
  'uploading',   -- 업로드 중
  'processing',  -- 처리 중
  'ready',       -- 준비 완료
  'error'        -- 오류
);

-- Documents table
CREATE TABLE public.documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  original_name    TEXT NOT NULL,
  category         document_category NOT NULL DEFAULT 'other',
  status           document_status NOT NULL DEFAULT 'uploading',
  file_type        TEXT NOT NULL,
  file_size_bytes  BIGINT NOT NULL,
  r2_key           TEXT NOT NULL UNIQUE,
  r2_bucket        TEXT NOT NULL DEFAULT 'krctech-documents',
  page_count       INT,
  chunk_count      INT,
  error_message    TEXT,
  tags             TEXT[] DEFAULT '{}',
  description      TEXT,
  project_code     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_documents_user_id ON public.documents(user_id);
CREATE INDEX idx_documents_category ON public.documents(category);
CREATE INDEX idx_documents_status ON public.documents(status);
CREATE INDEX idx_documents_project_code ON public.documents(project_code) WHERE project_code IS NOT NULL;
CREATE INDEX idx_documents_created_at ON public.documents(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS policies
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own documents"
  ON public.documents FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all documents"
  ON public.documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
