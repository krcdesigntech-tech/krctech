/**
 * 법제처 국가법령정보 OPEN API 최소 클라이언트 (스크립트 공용).
 * ingest-laws / ingest-one-law 가 공유. OC = LAW_OPEN_API_OC.
 */
const LAW_BASE = 'https://www.law.go.kr/DRF'

function oc() {
  const v = process.env.LAW_OPEN_API_OC
  if (!v) throw new Error('LAW_OPEN_API_OC 필요')
  return v
}

async function lawFetch(endpoint, params) {
  const url = new URL(`${LAW_BASE}/${endpoint}`)
  url.searchParams.set('OC', oc())
  url.searchParams.set('type', 'JSON')
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v))
  }
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`law.go.kr ${endpoint} HTTP ${res.status}`)
  const t = await res.text()
  try {
    return JSON.parse(t)
  } catch {
    throw new Error(`law.go.kr ${endpoint} non-JSON: ${t.slice(0, 120)}`)
  }
}

export async function searchLaw(query) {
  const data = await lawFetch('lawSearch.do', { target: 'law', query, display: 10, page: 1 })
  const hits = data?.LawSearch?.law
  if (!hits) return []
  const arr = Array.isArray(hits) ? hits : [hits]
  return arr.map((h) => ({
    law_id: h.법령ID ?? '',
    mst: h.법령일련번호 ?? '',
    name: h.법령명한글 ?? '',
    short_name: h.법령약칭명 ?? null,
    ministry: h.소관부처명 ?? null,
  }))
}

export async function getWholeLaw(lawId, mst) {
  const data = await lawFetch('lawService.do', { target: 'law', ID: lawId, MST: mst })
  const base = data?.법령?.기본정보 ?? {}
  let node = data?.법령?.조문
  if (node && node.조문단위) node = node.조문단위
  const arr = Array.isArray(node) ? node : node ? [node] : []
  const articles = []
  for (const n of arr) {
    const no = (n.조문번호 ?? '').toString().trim()
    if (!no) continue
    const branch = (n.조문가지번호 ?? '').toString().trim()
    const ref = branch && branch !== '0' ? `제${no}조의${branch}` : `제${no}조`
    const title = (n.조문제목 ?? '').toString().trim() || null
    const head = Array.isArray(n.조문내용) ? n.조문내용.join('\n') : n.조문내용 ?? ''
    const paras = []
    if (n.항) {
      const items = Array.isArray(n.항) ? n.항 : [n.항]
      for (const it of items) {
        const b = Array.isArray(it.항내용) ? it.항내용.join('\n') : it.항내용
        if (b && String(b).trim()) paras.push(String(b).trim())
      }
    }
    const content = [String(head).trim(), ...paras].filter(Boolean).join('\n')
    if (content) articles.push({ article_ref: ref, article_no: no, title, content })
  }
  return {
    law_name: base.법령명_한글 ?? base.법령명한글 ?? '',
    ministry: typeof base.소관부처 === 'string' ? base.소관부처 : base.소관부처?.content ?? null,
    effective_date: parseDate(base.시행일자),
    articles,
  }
}

function parseDate(s) {
  if (!s) return null
  const d = String(s).replace(/\D/g, '')
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null
}

const normName = (s) => (s || '').replace(/\s+/g, '').replace(/[「」·ㆍ]/g, '')

/** 노이즈 문자열에서 끝의 법령명 토큰 추출. 예: "…이설공사비는 농어촌정비법" → "농어촌정비법". */
export function extractLawToken(name) {
  const n = (name || '').trim()
  const m = n.match(/([가-힣A-Za-z·ㆍ]{2,40}(?:법률|법|시행령|시행규칙))\s*$/)
  return m ? m[1].trim() : n
}

/** 검색 결과에서 정확일치(정규화) 우선, 없으면 4자 연속 겹침, 없으면 null. */
export function pickBestHit(hits, queryName) {
  if (!hits || !hits.length) return null
  const q = normName(queryName)
  const exact = hits.find((h) => normName(h.name) === q)
  if (exact) return exact
  const overlap = hits.find((h) => {
    const r = normName(h.name)
    for (let i = 0; i + 4 <= q.length; i++) if (r.includes(q.slice(i, i + 4))) return true
    return false
  })
  return overlap || null
}

export function splitArticle(content, maxChars = 1500) {
  if (content.length <= maxChars) return [content]
  const parts = []
  let buf = ''
  for (const line of content.split('\n')) {
    if (buf.length + line.length > maxChars && buf) { parts.push(buf); buf = '' }
    buf += (buf ? '\n' : '') + line
  }
  if (buf) parts.push(buf)
  return parts
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
