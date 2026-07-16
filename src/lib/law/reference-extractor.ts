/**
 * 참고서(PDF/HWPX) 본문에서 법령 후보를 추출하는 공통 헬퍼.
 *
 * `pdf-extractor.ts`(토픽/TOC 추출)와 `source-extractors.ts`(원본별 후보 추출)가
 * 공유한다. 정규식/분류 로직을 한 곳에 모아 중복을 막는다.
 */

import { canonicalizeLawName, normalizeLawName } from './name-canonicalizer'

export type ApiTarget = 'law' | 'eflaw' | 'admrul' | 'external'

export interface SourceAnchor {
  page?: number | null
  line?: number | null
  paragraph?: number | null
}

export interface LawCandidate {
  law_name: string
  canonical_law_name: string
  article_ref: string | null
  api_target: ApiTarget
  confidence: number
  raw_context: string
  source_anchor: SourceAnchor
}

/** "「<법령명>」" — 참고서는 법령명을 낫표로 감싼다. */
export const LAW_BRACKET = /「([^」]{2,80})」/g

/** "관련법 : 「...」, ..." 줄 — 참고서 토픽 헤더의 관련법 라인. (자간 "관 련 법" 허용) */
export const RELATED_LAW_LINE = /관\s*련\s*법\s*령?\s*[:：]/

/** 조문 참조: "제9조", "제33조의2", "제33조 제2항". */
export const ARTICLE_REF = /제\s*\d+\s*조(?:의\s*\d+)?(?:\s*제\s*\d+\s*항)?/g

/** 법령명 뒤에 곧바로 붙는 시행령/시행규칙/법 + 조문 패턴. */
export const NAME_WITH_ARTICLE =
  /([가-힣A-Za-z·\s]{2,40}?(?:법|법률|시행령|시행규칙|기준|고시|예규|훈령|지침|요령|규정))\s*(제\s*\d+\s*조(?:의\s*\d+)?)/g

/** 이름을 법률/행정규칙/기타로 분류. */
export function classifyApiTarget(name: string): Exclude<ApiTarget, 'eflaw'> {
  const compact = normalizeLawName(name)
  if (/(법|법률|시행령|시행규칙)$/.test(compact)) return 'law'
  if (/(고시|예규|훈령|지침|요령|기준|규정)$/.test(compact)) return 'admrul'
  return 'external'
}

function isLikelyLawName(name: string): boolean {
  return /[법령규칙고시예규훈령지침요령기준규정]/.test(name)
}

function makeKey(canonical: string, articleRef: string | null, target: ApiTarget): string {
  return `${normalizeLawName(canonical)}::${articleRef ?? ''}::${target}`
}

/**
 * 본문 텍스트에서 법령 후보를 추출한다.
 * - 낫표(「…」) 법령명 + 직후 60자 내 조문
 * - "법령명 + 제○조" 인접 패턴
 * 같은 (정식명, 조문, target) 후보는 중복 제거하되, anchor/context는 첫 등장 기준.
 */
export function extractLawCandidates(text: string, anchorBase: SourceAnchor = {}): LawCandidate[] {
  const seen = new Map<string, LawCandidate>()

  const add = (
    rawName: string,
    articleRef: string | null,
    context: string,
    anchor: SourceAnchor
  ) => {
    const lawName = rawName.trim().replace(/\s+/g, ' ')
    if (!lawName || !isLikelyLawName(lawName)) return
    const apiTarget = classifyApiTarget(lawName)
    const canonical = canonicalizeLawName(lawName)
    const key = makeKey(canonical, articleRef, apiTarget)
    if (seen.has(key)) return
    seen.set(key, {
      law_name: lawName,
      canonical_law_name: canonical,
      article_ref: articleRef,
      api_target: apiTarget,
      confidence: apiTarget === 'law' ? 0.85 : 0.55,
      raw_context: context.slice(0, 300),
      source_anchor: { ...anchorBase, ...anchor },
    })
  }

  // 1) 낫표 법령명 + 직후 조문
  let m: RegExpExecArray | null
  LAW_BRACKET.lastIndex = 0
  while ((m = LAW_BRACKET.exec(text)) !== null) {
    const lawName = m[1]
    const tailStart = m.index + m[0].length
    const tail = text.slice(tailStart, tailStart + 60)
    ARTICLE_REF.lastIndex = 0
    const am = ARTICLE_REF.exec(tail)
    const articleRef = am ? am[0].replace(/\s+/g, '') : null
    const context = text.slice(Math.max(0, m.index - 40), tailStart + 60)
    add(lawName, articleRef, context, {})
  }

  // 2) "법령명 + 제○조" 인접 패턴 (낫표 없이 등장하는 경우)
  NAME_WITH_ARTICLE.lastIndex = 0
  while ((m = NAME_WITH_ARTICLE.exec(text)) !== null) {
    const lawName = m[1].trim()
    const articleRef = m[2].replace(/\s+/g, '')
    const context = text.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20)
    add(lawName, articleRef, context, {})
  }

  return Array.from(seen.values())
}
