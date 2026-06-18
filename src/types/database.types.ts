export type DocumentCategory =
  | 'permit'
  | 'standard'
  | 'report'
  | 'drawing'
  | 'specification'
  | 'contract'
  | 'other'

export type DocumentStatus = 'uploading' | 'processing' | 'ready' | 'error'

export type MessageRole = 'user' | 'assistant' | 'system'

export type UserRole = 'engineer' | 'manager' | 'admin'

export interface Profile {
  id: string
  full_name: string | null
  email: string
  role: UserRole
  department: string | null
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  user_id: string
  name: string
  original_name: string
  category: DocumentCategory
  status: DocumentStatus
  file_type: string
  file_size_bytes: number
  r2_key: string
  r2_bucket: string
  page_count: number | null
  chunk_count: number | null
  error_message: string | null
  tags: string[]
  description: string | null
  project_code: string | null
  created_at: string
  updated_at: string
}

export interface DocumentChunk {
  id: string
  document_id: string
  user_id: string
  chunk_index: number
  content: string
  token_count: number | null
  page_number: number | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface MatchedChunk {
  id: string
  document_id: string
  chunk_index: number
  content: string
  page_number: number | null
  metadata: Record<string, unknown>
  similarity: number
  document_name: string
  document_category: DocumentCategory
}

export interface ChatSession {
  id: string
  user_id: string
  title: string
  document_ids: string[]
  message_count: number
  last_message_at: string | null
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  session_id: string
  user_id: string
  role: MessageRole
  content: string
  source_chunks: MatchedChunk[]
  token_count: number | null
  model_used: string | null
  latency_ms: number | null
  created_at: string
}
