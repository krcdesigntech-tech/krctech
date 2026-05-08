/**
 * law.go.kr `JO` parameter encoding.
 *
 * The OPEN API encodes a target article as a 6-digit string: 4-digit article
 * number + 2-digit branch number. Branch 00 is the bare article ("제9조"),
 * branch 02+ is "의2/의3..." (e.g. 제9조의2 → "000902").
 *
 * Examples:
 *   "제9조"        → "000900"
 *   "제33조"       → "003300"
 *   "제33조 제2항" → "003300"  (paragraphs are not part of JO; filter client-side)
 *   "제9조의2"     → "000902"
 */

const ARTICLE_PATTERN = /제\s*(\d+)\s*조(?:의\s*(\d+))?/

export interface ParsedArticleRef {
  article: number
  branch: number
  paragraph: number | null
  raw: string
}

export function parseArticleRef(input: string | null | undefined): ParsedArticleRef | null {
  if (!input) return null
  const match = ARTICLE_PATTERN.exec(input)
  if (!match) return null

  const article = parseInt(match[1], 10)
  const branch = match[2] ? parseInt(match[2], 10) : 0
  if (Number.isNaN(article)) return null

  const paragraphMatch = /제\s*(\d+)\s*항/.exec(input)
  const paragraph = paragraphMatch ? parseInt(paragraphMatch[1], 10) : null

  return { article, branch, paragraph, raw: input.trim() }
}

export function articleRefToJo(input: string | null | undefined): string | null {
  const parsed = parseArticleRef(input)
  if (!parsed) return null
  return `${String(parsed.article).padStart(4, '0')}${String(parsed.branch).padStart(2, '0')}`
}

export function joToArticleRef(jo: string): string | null {
  if (!/^\d{6}$/.test(jo)) return null
  const article = parseInt(jo.slice(0, 4), 10)
  const branch = parseInt(jo.slice(4), 10)
  if (Number.isNaN(article) || article === 0) return null
  return branch > 0 ? `제${article}조의${branch}` : `제${article}조`
}
