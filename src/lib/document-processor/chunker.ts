// Korean civil engineering document chunker
// Preserves section headers and table structures

const TARGET_CHUNK_TOKENS = 500
const OVERLAP_TOKENS = 100
const CHARS_PER_TOKEN = 2.5 // Korean chars average ~1.5-2 bytes, rough estimate

// Korean/civil engineering section patterns
const SECTION_PATTERNS = [
  /^제\s*\d+\s*장/m,          // 제1장, 제 2 장
  /^\d+\.\s+[^\d]/m,          // 1. 개요
  /^\d+\.\d+\s+/m,            // 1.1 목적
  /^[가-힣]+\.\s+/m,          // 가. 나. 다.
  /^별\s*표\s*\d+/m,          // 별표1
  /^붙\s*임\s*\d*/m,          // 붙임1
  /^〔.*〕$/m,                 // 〔별표〕
]

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function isSectionHeader(line: string): boolean {
  return SECTION_PATTERNS.some((p) => p.test(line.trim()))
}

export interface Chunk {
  content: string
  chunkIndex: number
  pageNumber?: number
  tokenCount: number
  metadata: {
    sectionTitle?: string
    startChar: number
    endChar: number
  }
}

export function chunkText(text: string): Chunk[] {
  // Split into paragraphs first
  const paragraphs = text.split(/\n\n+/)
  const chunks: Chunk[] = []
  let currentChunk = ''
  let currentSection = ''
  let charOffset = 0
  let chunkStartOffset = 0

  function flushChunk() {
    const trimmed = currentChunk.trim()
    if (trimmed.length < 20) return
    const tokenCount = estimateTokenCount(trimmed)
    if (tokenCount < 10) return

    chunks.push({
      content: trimmed,
      chunkIndex: chunks.length,
      tokenCount,
      metadata: {
        sectionTitle: currentSection || undefined,
        startChar: chunkStartOffset,
        endChar: charOffset,
      },
    })
  }

  for (const para of paragraphs) {
    const trimmedPara = para.trim()
    if (!trimmedPara) {
      charOffset += para.length + 2
      continue
    }

    // Detect section headers
    if (isSectionHeader(trimmedPara) && trimmedPara.length < 100) {
      currentSection = trimmedPara
    }

    const paraTokens = estimateTokenCount(trimmedPara)
    const currentTokens = estimateTokenCount(currentChunk)

    if (currentTokens + paraTokens > TARGET_CHUNK_TOKENS && currentChunk.length > 0) {
      flushChunk()

      // Overlap: keep last OVERLAP_TOKENS worth of text
      const overlapChars = OVERLAP_TOKENS * CHARS_PER_TOKEN
      currentChunk = currentChunk.slice(-overlapChars) + '\n\n' + trimmedPara
      chunkStartOffset = charOffset
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara
    }

    charOffset += para.length + 2
  }

  if (currentChunk.trim()) {
    flushChunk()
  }

  return chunks
}
