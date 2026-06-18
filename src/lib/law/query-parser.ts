/**
 * 사용자 질문에서 법령명/조문번호/키워드를 추출한다.
 * match_law_chunks 하이브리드 검색의 law_name_filter / article_filter 로 쓰인다.
 */

export interface ParsedLegalQuery {
  lawName: string | null
  articleRef: string | null
  keywords: string
}

const ARTICLE = /제\s*\d+\s*조(?:의\s*\d+)?(?:\s*제\s*\d+\s*항)?/
/** "○○법", "○○시행령", "○○에 관한 법률" 등 법령명 토큰. */
const LAW_NAME =
  /([가-힣A-Za-z·\s]{2,40}?(?:에\s*관한\s*법률|법률|법|시행령|시행규칙|특별법|기준|고시|예규|훈령|지침|요령|규정))/

export function parseLegalQuery(question: string): ParsedLegalQuery {
  const q = question.trim()

  const articleMatch = q.match(ARTICLE)
  const articleRef = articleMatch ? articleMatch[0].replace(/\s+/g, '') : null

  // 낫표 우선, 없으면 법령명 패턴
  const bracket = q.match(/「([^」]{2,40})」/)
  let lawName: string | null = bracket ? bracket[1].trim() : null
  if (!lawName) {
    const nameMatch = q.match(LAW_NAME)
    lawName = nameMatch ? nameMatch[1].trim().replace(/\s+/g, ' ') : null
  }

  return { lawName, articleRef, keywords: q }
}
