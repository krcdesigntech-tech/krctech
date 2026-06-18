/**
 * Extract business topics + law references from the reference PDF
 * "조사설계 관계법령 및 행정처리 실무 참고서".
 *
 * The PDF is split into three top-level chapters:
 *   Ⅱ. 비용 관련                → category "비용"
 *   Ⅲ. 행정절차 관련법령          → categories detected from "<...>" markers
 *      <계 획> <문화유산> <환 경> <재 해> <개 발> <안 전> <군 사> <건 축> <해 양>
 *   Ⅳ. 참고사항                  → category "참고"
 *
 * Two passes:
 *   1) Parse the table of contents (pages 2-5) to seed
 *      `legal_topics` (category, title, pdf_page, ord).
 *   2) Walk page-by-page through the body, locate each topic by its
 *      "<topic-no>." header, capture the next ~2 pages of body text
 *      as `summary`, and extract law references via regex
 *      ("「...법…」" + "제○조" patterns).
 */

import { parsePdf } from '@/lib/document-processor/pdf-parser'
import { canonicalizeLawName, normalizeLawName } from './name-canonicalizer'
import { LAW_BRACKET, ARTICLE_REF, classifyApiTarget } from './reference-extractor'
import type { LegalCategory } from '@/types/law.types'

export interface TopicSeed {
  chapter: 'Ⅱ' | 'Ⅲ' | 'Ⅳ'
  category: LegalCategory
  title: string
  topicNumber: number
  pdf_page: number | null
  summary: string
  ord: number
}

export interface ReferenceSeed {
  topicTitle: string
  topicNumber: number
  chapter: TopicSeed['chapter']
  law_name: string
  canonical_law_name: string
  article_ref: string | null
  api_target: 'law' | 'eflaw' | 'admrul' | 'external'
  confidence: number
}

export interface ExtractionResult {
  topics: TopicSeed[]
  references: ReferenceSeed[]
  warnings: string[]
}

// ── Category detection ──────────────────────────────────────────────────────

const CATEGORY_HEADERS: Array<{ marker: RegExp; category: LegalCategory }> = [
  { marker: /<\s*비\s*용\s*관\s*련\s*>/, category: '비용' },
  { marker: /<\s*계\s+획\s*>/, category: '계획' },
  { marker: /<\s*문\s*화\s*유\s*산\s*>/, category: '문화유산' },
  { marker: /<\s*환\s+경\s*>/, category: '환경' },
  { marker: /<\s*재\s+해\s*>/, category: '재해' },
  { marker: /<\s*개\s+발\s*>/, category: '개발' },
  { marker: /<\s*안\s+전\s*>/, category: '안전' },
  { marker: /<\s*군\s+사\s*>/, category: '군사' },
  { marker: /<\s*건\s+축\s*>/, category: '건축' },
  { marker: /<\s*해\s+양\s*>/, category: '해양' },
]

// ── Phase 1: TOC parser ─────────────────────────────────────────────────────

/**
 * The TOC entries look like:
 *   "1.문화유산지표조사비,표본조사비,시굴조사비 등·············4"
 * Captures: number, title (trimmed of leading dots), page.
 */
const TOC_ENTRY = /(\d+)\.\s*([^·]+?)·+(\d+)/g

function parseTOC(rawTOC: string): TopicSeed[] {
  // Walk line by line, tracking the current chapter and category from
  // headers we hit before the entry.
  const topics: TopicSeed[] = []
  let chapter: TopicSeed['chapter'] = 'Ⅱ'
  let category: LegalCategory = '비용'
  let ord = 0

  // Normalize the TOC by inserting newlines around chapter/category markers
  const lines = rawTOC
    .replace(/\s*Ⅱ\./g, '\nⅡ.')
    .replace(/\s*Ⅲ\./g, '\nⅢ.')
    .replace(/\s*Ⅳ\./g, '\nⅣ.')
    .replace(/(<\s*[^>]+\s*>)/g, '\n$1\n')
    .split('\n')

  for (const lineRaw of lines) {
    const line = lineRaw.trim()
    if (!line) continue

    if (/^Ⅱ\./.test(line)) {
      chapter = 'Ⅱ'
      category = '비용'
      continue
    }
    if (/^Ⅲ\./.test(line)) {
      chapter = 'Ⅲ'
      // category will be set when we hit a "<...>" marker
      continue
    }
    if (/^Ⅳ\./.test(line)) {
      chapter = 'Ⅳ'
      category = '참고'
      continue
    }

    const catHit = CATEGORY_HEADERS.find((c) => c.marker.test(line))
    if (catHit) {
      category = catHit.category
      continue
    }

    let m: RegExpExecArray | null
    TOC_ENTRY.lastIndex = 0
    while ((m = TOC_ENTRY.exec(line)) !== null) {
      const number = parseInt(m[1], 10)
      const title = m[2].trim().replace(/\s+/g, ' ')
      const page = parseInt(m[3], 10)
      if (!title || Number.isNaN(number) || Number.isNaN(page)) continue
      topics.push({
        chapter,
        category,
        title,
        topicNumber: number,
        pdf_page: page,
        summary: '',
        ord: ord++,
      })
    }
  }

  return topics
}

// ── Phase 2: Body scanner ───────────────────────────────────────────────────
// LAW_BRACKET / ARTICLE_REF / classifyApiTarget 는 reference-extractor 공통 헬퍼 사용.

function buildReferences(
  topic: TopicSeed,
  body: string,
  warnings: string[]
): ReferenceSeed[] {
  const seen = new Map<string, ReferenceSeed>()
  let match: RegExpExecArray | null

  LAW_BRACKET.lastIndex = 0
  while ((match = LAW_BRACKET.exec(body)) !== null) {
    const lawName = match[1].trim().replace(/\s+/g, ' ')
    if (!lawName || !/[법령규칙고시예규훈령지침요령기준]/.test(lawName)) continue

    // Look for an article reference in the next 60 chars (often "제○조" follows the bracket).
    const tail = body.slice(match.index + match[0].length, match.index + match[0].length + 60)
    const articleMatch = ARTICLE_REF.exec(tail)
    ARTICLE_REF.lastIndex = 0
    const articleRef = articleMatch ? articleMatch[0].replace(/\s+/g, '') : null

    const apiTarget = classifyApiTarget(lawName)
    const canonical = canonicalizeLawName(lawName)
    const key = `${normalizeLawName(canonical)}::${articleRef ?? ''}::${apiTarget}`

    if (!seen.has(key)) {
      seen.set(key, {
        topicTitle: topic.title,
        topicNumber: topic.topicNumber,
        chapter: topic.chapter,
        law_name: lawName,
        canonical_law_name: canonical,
        article_ref: articleRef,
        // Confidence: lower for admin-rule/external since name resolution is fuzzier.
        confidence: apiTarget === 'law' ? 0.85 : 0.55,
        api_target: apiTarget,
      })
    }
  }

  if (seen.size === 0) {
    warnings.push(`No law references found for topic "${topic.title}" (page ${topic.pdf_page}).`)
  }
  return Array.from(seen.values())
}

/**
 * Find the body section for each topic by locating its
 * "<chapter-marker><number>." header and capturing text up to the
 * next topic's header.
 *
 * We rely on `pdf-parse` which gives the entire text in reading order;
 * we don't need page-level granularity for this pass.
 */
function sliceTopicBodies(text: string, topics: TopicSeed[]): Map<string, string> {
  // Build markers like "1.문화유산지표조사비,표본조사비".
  // To find the body header (not the TOC), match the start of a line where
  // a topic number is followed by its title fragment.
  const result = new Map<string, string>()
  if (!topics.length) return result

  // Compute start indices in `text` for each topic by searching for the
  // topic title. Skip the first occurrence (TOC) by requiring the match
  // to occur after a designated body offset.
  const tocCutoff = approximateTocEnd(text)

  type Marker = { topic: TopicSeed; start: number }
  const markers: Marker[] = []

  for (const topic of topics) {
    // Build a fuzzy probe: first 8 hangul chars of the title, ignoring spaces.
    const probe = topic.title.replace(/\s+/g, '').slice(0, 8)
    if (!probe) continue
    const idx = text.indexOf(probe, tocCutoff)
    if (idx === -1) continue
    markers.push({ topic, start: idx })
  }

  markers.sort((a, b) => a.start - b.start)

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].start
    const end = i + 1 < markers.length ? markers[i + 1].start : Math.min(text.length, start + 6000)
    result.set(keyFor(markers[i].topic), text.slice(start, end))
  }

  return result
}

function approximateTocEnd(text: string): number {
  // The body chapter Ⅱ begins with "검 토 요 지" or "Ⅰ 검토개요".
  // We look for the first occurrence after the TOC.
  const idx1 = text.indexOf('검 토 요 지')
  const idx2 = text.indexOf('검토개요')
  const candidates = [idx1, idx2].filter((i) => i > 0)
  if (!candidates.length) return 2000
  return Math.min(...candidates)
}

function keyFor(t: TopicSeed): string {
  return `${t.chapter}-${t.topicNumber}-${t.title}`
}

// ── Public entry point ──────────────────────────────────────────────────────

export async function extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  const { text } = await parsePdf(buffer)
  const warnings: string[] = []

  // Phase 1: TOC. The TOC sits between "목  차" and "검 토 요 지" / "검토개요".
  const tocStart = text.indexOf('목')
  const tocEnd = approximateTocEnd(text)
  const tocText = tocEnd > tocStart ? text.slice(tocStart, tocEnd) : text.slice(0, 8000)
  const topics = parseTOC(tocText)
  if (!topics.length) warnings.push('TOC parser produced no topics — check separator pattern.')

  // Phase 2: per-topic body slicing + reference extraction.
  const bodies = sliceTopicBodies(text, topics)
  const references: ReferenceSeed[] = []
  for (const topic of topics) {
    const body = bodies.get(keyFor(topic)) ?? ''
    if (body) {
      // Take first 600 chars as a rough summary.
      topic.summary = body.replace(/\s+/g, ' ').slice(0, 600)
    }
    references.push(...buildReferences(topic, body, warnings))
  }

  return { topics, references, warnings }
}
