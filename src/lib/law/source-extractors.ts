/**
 * 원본 참고서(PDF 02.02 / HWPX 02.23)에서 텍스트와 법령 후보를 추출한다.
 *
 * - `extractPdfSource`  : pdf-parse 텍스트 + 라인 anchor 기반 후보
 * - `extractHwpxSource` : Contents/section*.xml raw `<hp:t>`를 단락(`<hp:p>`)
 *                          경계를 보존해 추출 (rhwp dump 대비 누락 최소화)
 * - `extractLawCandidates`(reference-extractor)로 두 결과를 같은 타입으로 정규화
 *
 * 상위 의존성이 없도록 상대 경로만 사용 → ingestion 스크립트(tsx)에서도 재사용 가능.
 */

import JSZip from 'jszip'
import { parsePdf } from '../document-processor/pdf-parser'
import { extractLawCandidates, RELATED_LAW_LINE, type LawCandidate } from './reference-extractor'

export interface SourceExtraction {
  source_type: 'pdf' | 'hwpx'
  text: string
  page_count: number | null
  candidates: LawCandidate[]
  stats: {
    related_law_lines: number
    article_matches: number
    bracket_matches: number
    candidate_count: number
  }
}

function countMatches(text: string, re: RegExp): number {
  const m = text.match(re)
  return m ? m.length : 0
}

function computeStats(text: string): SourceExtraction['stats'] {
  // 토픽별 "관련법 :" 마커 발생 횟수 (라인 분할에 흔들리지 않도록 전체 텍스트 기준).
  const relatedLines = countMatches(text, new RegExp(RELATED_LAW_LINE.source, 'g'))
  return {
    related_law_lines: relatedLines,
    article_matches: countMatches(text, /제\s*\d+\s*조(?:의\s*\d+)?/g),
    bracket_matches: countMatches(text, /「[^」]{2,80}」/g),
    candidate_count: 0,
  }
}

/** PDF: 라인 단위로 anchor(line)를 부여하면서 후보를 추출. */
export async function extractPdfSource(buffer: Buffer): Promise<SourceExtraction> {
  const { text, pageCount } = await parsePdf(buffer)
  const candidates = extractLawCandidates(text)
  const stats = computeStats(text)
  stats.candidate_count = candidates.length
  return {
    source_type: 'pdf',
    text,
    page_count: pageCount ?? null,
    candidates,
    stats,
  }
}

/**
 * HWPX: ZIP 내 Contents/section*.xml 을 직접 읽어 `<hp:p>`(단락) 경계를 보존하며
 * `<hp:t>` 텍스트를 모은다. 표(`<hp:tbl>`/`<hp:tc>`) 내부 텍스트도 포함된다.
 */
export async function extractHwpxSource(buffer: Buffer): Promise<SourceExtraction> {
  const zip = await JSZip.loadAsync(buffer)
  const sectionNames = Object.keys(zip.files)
    .filter((n) => /^Contents\/section\d+\.xml$/.test(n))
    .sort()

  const paragraphs: string[] = []
  for (const name of sectionNames) {
    const xml = await zip.files[name].async('string')
    // 단락 경계 보존: <hp:p ...> ... </hp:p> 단위로 분할
    const paraChunks = xml.split(/<hp:p[\s>]/)
    for (const chunk of paraChunks) {
      const tMatches = chunk.match(/<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g) || []
      if (!tMatches.length) continue
      const line = tMatches
        .map((m) => m.replace(/<[^>]+>/g, ''))
        .join('')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .trim()
      if (line) paragraphs.push(line)
    }
  }

  const text = paragraphs.join('\n')
  const candidates = extractLawCandidates(text)
  const stats = computeStats(text)
  stats.candidate_count = candidates.length

  return {
    source_type: 'hwpx',
    text,
    page_count: null,
    candidates,
    stats,
  }
}

/**
 * 두 원본 후보를 병합한다. 같은 (정식명, 조문, target) 후보가 양쪽에 있으면
 * confidence를 가산하고, 한쪽에만 있으면 source_only로 표시한다.
 */
export interface MergedCandidate extends LawCandidate {
  in_pdf: boolean
  in_hwpx: boolean
  source_only: boolean
}

export function mergeCandidates(
  pdf: LawCandidate[],
  hwpx: LawCandidate[]
): MergedCandidate[] {
  const norm = (c: LawCandidate) =>
    `${c.canonical_law_name.replace(/\s+/g, '')}::${c.article_ref ?? ''}::${c.api_target}`

  const map = new Map<string, MergedCandidate>()

  const ingest = (list: LawCandidate[], which: 'pdf' | 'hwpx') => {
    for (const c of list) {
      const key = norm(c)
      const existing = map.get(key)
      if (existing) {
        if (which === 'pdf') existing.in_pdf = true
        else existing.in_hwpx = true
      } else {
        map.set(key, {
          ...c,
          in_pdf: which === 'pdf',
          in_hwpx: which === 'hwpx',
          source_only: true,
        })
      }
    }
  }

  ingest(pdf, 'pdf')
  ingest(hwpx, 'hwpx')

  const result = Array.from(map.values())
  for (const c of result) {
    c.source_only = !(c.in_pdf && c.in_hwpx)
    if (!c.source_only) c.confidence = Math.min(1, c.confidence + 0.1)
  }

  return result
}
