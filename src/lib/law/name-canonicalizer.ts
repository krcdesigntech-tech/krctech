/**
 * Resolve PDF-style law abbreviations to the official 법제처 names.
 *
 * The reference PDF uses inconsistent spacing and common abbreviations
 * ("매장유산법", "건설기술진흥법") that don't match law.go.kr exactly.
 * We:
 *   1) normalize whitespace and middle dots,
 *   2) apply a hand-curated abbreviation map for the high-frequency cases
 *      we know appear in the PDF (extend as needed in `/admin/legal`).
 *
 * For names not covered here, callers should fall back to `searchLaw()`
 * and pick the top result.
 */

const ABBREV_MAP: Record<string, string> = {
  매장유산법: '매장유산 보호 및 조사에 관한 법률',
  건설기술진흥법: '건설기술 진흥법',
  공유수면법: '공유수면 관리 및 매립에 관한 법률',
  공익사업법: '공익사업을 위한 토지 등의 취득 및 보상에 관한 법률',
  국가계약법: '국가를 당사자로 하는 계약에 관한 법률',
  국토계획법: '국토의 계획 및 이용에 관한 법률',
  도시정비법: '도시 및 주거환경정비법',
  매장문화재법: '매장유산 보호 및 조사에 관한 법률',
  부동산공시법: '부동산 가격공시에 관한 법률',
  산림자원법: '산림자원의 조성 및 관리에 관한 법률',
  소규모공공사업법: '소규모 공공사업의 안전점검 및 시설관리에 관한 법률',
  송유관법: '송유관 안전관리법',
  시설물안전법: '시설물의 안전 및 유지관리에 관한 특별법',
  지하안전법: '지하안전관리에 관한 특별법',
  채취법: '골재채취법',
  해양환경법: '해양환경관리법',
  환경평가법: '환경영향평가법',
}

export function normalizeLawName(input: string): string {
  return input
    .replace(/\s+/g, '')
    .replace(/[ㆍ·∙]/g, '')
    .replace(/[「」『』《》]/g, '')
    .trim()
}

export function canonicalizeLawName(input: string): string {
  const trimmed = input.trim()
  const compact = normalizeLawName(trimmed)
  const mapped = ABBREV_MAP[compact]
  if (mapped) return mapped

  // Insert canonical spacing for common patterns: "건설기술진흥법" → "건설기술 진흥법"
  // Only applied if no mapping hit, as a best-effort hint for `searchLaw()`.
  return trimmed
}

export function lawNamesEquivalent(a: string, b: string): boolean {
  return normalizeLawName(a) === normalizeLawName(b)
}

/**
 * DB `law_aliases`까지 병합한 비동기 정식명 해석 (자가학습 별칭 활용).
 * 순서: ABBREV_MAP(코드) → law_aliases(학습된 별칭) → 원본.
 * client는 supabase client(서버/서비스). 실패해도 원본을 반환(검색 자체는 동작).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function resolveCanonicalName(client: any, input: string): Promise<string> {
  const trimmed = (input || '').trim()
  if (!trimmed) return trimmed
  const mapped = canonicalizeLawName(trimmed)
  if (mapped !== trimmed) return mapped // ABBREV_MAP 적중
  try {
    const norm = normalizeLawName(trimmed)
    const { data } = await client.from('law_aliases').select('alias, canonical_law_name')
    for (const row of data ?? []) {
      if (normalizeLawName(row.alias) === norm && row.canonical_law_name) {
        return row.canonical_law_name
      }
    }
  } catch {
    /* DB 조회 실패 시 원본 사용 */
  }
  return trimmed
}
/* eslint-enable @typescript-eslint/no-explicit-any */
