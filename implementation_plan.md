# Legalize-KR 연동 및 좌우비교형 신구대조표 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `legalize-kr`의 Git/Markdown 법령 이력을 현재 법제처 OPEN API 기반 법령 조회와 RAG 파이프라인에 보강하여, PDF 기준일(`2026-02-02`) 전후의 조문 차이를 UI와 프롬프트에 일관되게 제공한다.

**Architecture:** 현재 `law.go.kr` OPEN API는 법령 식별과 최신 본문 조회의 1차 소스로 유지한다. `legalize-kr`는 Git 커밋 이력과 Markdown 원문을 이용한 변경 이력 보강 소스로 붙이고, 실패해도 기존 법령 조회는 계속 동작하도록 resolver에서 선택적 enrich 단계로 실행한다. 캐시는 기존 `law_api_cache`에 `legalize_payload` 계열 컬럼을 추가해 같은 법령/조문 키로 관리한다.

**Tech Stack:** Next.js 14 App Router, TypeScript strict mode, Supabase/PostgreSQL, `react-markdown`, `remark-gfm`, `diff`, Vitest.

---

## 보강이 필요한 점

기존 계획은 방향은 맞지만 구현자가 바로 작업하기에는 다음 항목이 부족했다.

- `legalize-kr`의 실제 경로 규칙이 반영되지 않았다. 법령 저장소는 `kr/{띄어쓰기 제거 법령명}/{법령구분}.md` 구조이고, 행정규칙 저장소는 `{기관경로}/{행정규칙종류}/{행정규칙명}/본문.md` 구조라서 `lawName` 하나만으로는 항상 경로를 만들 수 없다.
- GitHub commit hash는 `legalize-kr`의 force-push 공지 때문에 영구 식별자로 쓰면 안 된다. 캐시는 `repo + path + 기준일 + sha`를 저장하되, 만료 시 `path + 기준일`로 다시 sha를 해석해야 한다.
- `law_api_cache`에 Markdown, 과거 snapshot, diff를 저장할 스키마 변경이 빠져 있다.
- `LegalReferenceLatest`, `LawApiCacheRow`, `LegalReference` 타입 확장이 정의되지 않았다.
- `react-markdown`만으로는 Markdown table(GFM)이 안정적으로 렌더링되지 않는다. `remark-gfm` 의존성이 필요하다.
- diff 반환 타입이 `added/removed/unchanged` 단일 배열이라 좌우 대조 UI에 바로 쓰기 어렵다. 좌측/우측 행을 맞춘 `SideBySideDiffRow[]`가 필요하다.
- GitHub API rate limit, `GITHUB_PAT`, 403/404 fallback, 기존 law.go.kr 조회 유지 전략이 명확하지 않다.
- 테스트 러너가 없어 parser/diff/path 해석을 검증할 방법이 없다. 최소 Vitest를 추가한다.

## 외부 레퍼런스 확인

- `legalize-kr/legalize-kr` README 기준, 법령은 Markdown 파일이며 각 개정은 실제 공포일자를 가진 Git commit이다. 기본 구조는 `kr/{법령명}/{법령구분}.md`이고, 디렉토리명은 법령명에서 띄어쓰기를 제거한다. 관련 법령은 같은 디렉토리 안의 `법률.md`, `시행령.md`, `시행규칙.md` 등으로 분리된다. 참고: https://github.com/legalize-kr/legalize-kr
- 같은 README는 파이프라인 개선 시 전체 히스토리 재구성을 위해 force-push가 발생할 수 있다고 공지한다. 따라서 저장된 sha는 캐시 최적화 값이지 장기 식별자가 아니다.
- `legalize-kr/admrule-kr` README 기준, 행정규칙은 `{기관경로}/{행정규칙종류}/{행정규칙명}/본문.md` 구조이며 Markdown frontmatter에 행정규칙 ID, 발령일자, 시행일자, 제개정구분 등이 포함된다. 참고: https://github.com/legalize-kr/admrule-kr

## 범위

- 포함: 법령(`law`, `eflaw`)과 행정규칙(`admrul`)의 Legalize-KR Markdown snapshot 조회, PDF 기준일 전후 조문 추출, 좌우 비교 diff, UI 렌더링, RAG 프롬프트 보강, 캐시와 테스트.
- 제외: 자치법규(`ordinance-kr`), 판례(`precedent-kr`), 법령 전문 전체 diff 화면, 관리자용 수동 path 편집 UI의 대규모 개편.
- 실패 정책: Legalize-KR 조회 실패는 `legalize_payload.status = "error"`로 기록하고 기존 law.go.kr payload는 정상 반환한다.
- 행정규칙(`admrul`) 제약: 행정규칙은 `legalize-kr/admrule-kr`의 경로 구조가 부처/기관/종류에 의존해 `lawName`만으로 자동 생성할 수 없다. 따라서 `legal_references.legalize_repo`/`legalize_path`가 사람에 의해 채워진 경우에만 신구대조가 활성화되고, 그 전까지는 `status = "skipped"`로 처리되어 기존 law.go.kr 본문만 표시된다(의도된 제약). path를 채우는 관리자 UI는 본 계획 범위 밖이다.

## 파일 구조

- Modify: `package.json` - `diff`, `remark-gfm`, `p-limit`, `vitest`, `@types/diff`, `test`, `typecheck` 추가.
- Create: `vitest.config.ts` - `@/` alias 해석과 테스트 include 패턴 설정.
- Create: `supabase/migrations/00013_add_legalize_cache.sql` - reference path와 Legalize-KR cache 컬럼 추가.
- Modify: `src/types/law.types.ts` - Legalize-KR snapshot/diff 타입 추가.
- Create: `src/lib/law/legalize-path.ts` - 법령명과 `LegalReference`에서 Legalize-KR repo/path 후보 생성.
- Create: `src/lib/law/markdown-article.ts` - frontmatter 제거와 조문 단위 Markdown 추출.
- Create: `src/lib/law/side-by-side-diff.ts` - 좌우 비교형 diff row 생성.
- Create: `src/lib/law/legalize-client.ts` - GitHub API/raw Markdown 조회, commit 선택, snapshot 구성.
- Modify: `src/lib/law/cache.ts` - `legalize_payload` 읽기/쓰기 helper 추가.
- Modify: `src/lib/law/resolver.ts` - law.go.kr payload 조회 후 Legalize-KR enrich 실행.
- Modify: `src/app/api/legal/references/[id]/latest/route.ts` - 확장 타입 반환 확인.
- Modify: `src/app/api/legal/references/[id]/refresh/route.ts` - force refresh 시 Legalize-KR cache도 갱신.
- Create: `src/app/(dashboard)/legal/[topicId]/LegalizeMarkdown.tsx` - Markdown 표시 전용 컴포넌트.
- Create: `src/app/(dashboard)/legal/[topicId]/SideBySideLawDiff.tsx` - 좌우 diff UI.
- Modify: `src/app/(dashboard)/legal/[topicId]/ReferenceCard.tsx` - Markdown 렌더링과 신구대조 토글 연결.
- Modify: `src/app/globals.css` - `prose-law`, diff highlight 스타일 추가.
- Modify: `src/lib/law/rag-augmentor.ts` - PDF 기준/최신/변경 요약 context block 추가.
- Modify: `src/lib/rag/prompt-builder.ts` - 법령 변경 context 안내 문구 정리.
- Create: `src/lib/law/__tests__/legalize-path.test.ts`
- Create: `src/lib/law/__tests__/markdown-article.test.ts`
- Create: `src/lib/law/__tests__/side-by-side-diff.test.ts`
- Create: `src/lib/law/__tests__/legalize-client.test.ts`

## 데이터 모델

`legal_references`에는 사람이 검증한 Legalize-KR 경로를 저장할 수 있게 한다. 법령은 자동 후보 생성으로 대부분 처리하지만, 행정규칙은 경로 구조가 부처/기관/종류에 의존하므로 저장 컬럼이 필요하다.

```sql
-- supabase/migrations/00013_add_legalize_cache.sql
ALTER TABLE public.legal_references
  ADD COLUMN IF NOT EXISTS legalize_repo TEXT
    CHECK (legalize_repo IS NULL OR legalize_repo IN ('legalize-kr/legalize-kr', 'legalize-kr/admrule-kr')),
  ADD COLUMN IF NOT EXISTS legalize_path TEXT,
  ADD COLUMN IF NOT EXISTS legalize_path_verified_at TIMESTAMPTZ;

ALTER TABLE public.law_api_cache
  ADD COLUMN IF NOT EXISTS legalize_payload JSONB,
  ADD COLUMN IF NOT EXISTS legalize_fetched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS legalize_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS legalize_error TEXT;

CREATE INDEX IF NOT EXISTS idx_law_api_cache_legalize_expires
  ON public.law_api_cache (legalize_expires_at)
  WHERE legalize_payload IS NOT NULL;
```

TypeScript 타입은 API payload의 명시적 계약으로 둔다.

```ts
export type LegalizeRepo = 'legalize-kr/legalize-kr' | 'legalize-kr/admrule-kr'

export interface LegalizeSource {
  repo: LegalizeRepo
  path: string
}

export interface DiffSegment {
  text: string
  changed: boolean
  kind: 'unchanged' | 'added' | 'removed'
}

export interface SideBySideDiffRow {
  id: string
  kind: 'unchanged' | 'added' | 'removed' | 'changed'
  left: DiffSegment[]
  right: DiffSegment[]
}

export interface LegalizeSnapshot {
  status: 'available' | 'skipped' | 'not_found' | 'error'
  source: LegalizeSource | null
  current_sha: string | null
  historic_sha: string | null
  current_commit_date: string | null
  historic_commit_date: string | null
  current_markdown: string | null
  historic_markdown: string | null
  current_article_markdown: string | null
  historic_article_markdown: string | null
  side_by_side_diff: SideBySideDiffRow[]
  diff_summary: string[]
  fetched_at: string
  error?: string
}

export interface LegalReferenceLatest {
  reference: LegalReference
  payload: LawPayload | AdminRulePayload | null
  legalize: LegalizeSnapshot | null
  cache: {
    fetched_at: string
    expires_at: string
    stale: boolean
    legalize_fetched_at?: string | null
    legalize_expires_at?: string | null
  } | null
  amended_after_pdf: boolean
}
```

## Task 1: 의존성, 스크립트, 타입 기반 준비

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 의존성 설치**

```bash
npm install diff remark-gfm p-limit
npm install -D vitest @types/diff
```

Expected: `package.json`에 runtime dependency `diff`, `remark-gfm`, `p-limit`이 추가되고 dev dependency에 `vitest`, `@types/diff`가 추가된다. (`p-limit`은 Task 6의 GitHub 호출 동시성 제한에 쓰인다.)

- [ ] **Step 2: 스크립트 추가**

`package.json`의 `scripts`를 다음 형태로 정리한다.

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

- [ ] **Step 3: `vitest.config.ts` 생성**

테스트 파일들이 `@/types/law.types`, `@/lib/law/...` 형태의 alias import를 사용한다. `@/` alias는 `tsconfig.json`의 `paths`에만 정의돼 있어 vitest가 자동으로 해석하지 못하므로, config에서 직접 alias를 지정한다. (`vite-tsconfig-paths` 플러그인을 추가로 설치하는 대안도 있으나, 아래처럼 추가 의존성 없이 `resolve.alias`만 지정하는 방식을 기본으로 한다.)

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
```

- [ ] **Step 4: 기본 검증**

```bash
npm run typecheck
npm run test
```

Expected: `typecheck`는 기존 코드 기준 type error가 없거나 기존 오류만 확인된다. `test`는 아직 테스트 파일이 없으므로 "no test files found"로 끝나되, config를 정상 인식해 부팅돼야 한다(alias resolve 에러로 죽지 않는다).

## Task 2: DB migration과 타입 확장

**Files:**
- Create: `supabase/migrations/00013_add_legalize_cache.sql`
- Modify: `src/types/law.types.ts`

- [ ] **Step 1: migration 작성**

위 `데이터 모델` 섹션의 SQL을 그대로 `supabase/migrations/00013_add_legalize_cache.sql`에 추가한다.

- [ ] **Step 2: 타입 확장**

`src/types/law.types.ts`에 `LegalizeRepo`, `LegalizeSource`, `DiffSegment`, `SideBySideDiffRow`, `LegalizeSnapshot`을 추가하고 기존 interface에 아래 필드를 추가한다.

```ts
// Add to LegalReference
legalize_repo: LegalizeRepo | null
legalize_path: string | null
legalize_path_verified_at: string | null

// Change in LawApiCacheRow
payload: LawPayload | AdminRulePayload

// Add to LawApiCacheRow
legalize_payload: LegalizeSnapshot | null
legalize_fetched_at: string | null
legalize_expires_at: string | null
legalize_error: string | null
```

- [ ] **Step 3: 타입 검증**

```bash
npm run typecheck
```

Expected: 새 필드 참조 전이므로 `LegalReference` fixture/cast에서 오류가 발생하지 않는다. Supabase row cast가 구조적 타입을 강제하지 않는 지점을 확인한다.

## Task 3: Legalize-KR path 해석

**Files:**
- Create: `src/lib/law/legalize-path.ts`
- Create: `src/lib/law/__tests__/legalize-path.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, expect, it } from 'vitest'
import { buildLegalizePathCandidates } from '../legalize-path'
import type { LegalReference } from '@/types/law.types'

const baseRef = {
  id: 'ref-1',
  topic_id: 'topic-1',
  law_name: '건설기술 진흥법',
  canonical_law_name: '건설기술 진흥법',
  article_ref: '제9조',
  api_target: 'law',
  law_id: '001234',
  mst: null,
  ministry: '국토교통부',
  confidence: 1,
  verified_at: null,
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  legalize_repo: null,
  legalize_path: null,
  legalize_path_verified_at: null,
} satisfies LegalReference

describe('buildLegalizePathCandidates', () => {
  it('builds law candidates with compact Korean directory names', () => {
    expect(buildLegalizePathCandidates(baseRef)).toContainEqual({
      repo: 'legalize-kr/legalize-kr',
      path: 'kr/건설기술진흥법/법률.md',
    })
  })

  it('builds enforcement decree path from 시행령 suffix', () => {
    const ref = { ...baseRef, law_name: '건설기술 진흥법 시행령', canonical_law_name: '건설기술 진흥법 시행령' }
    expect(buildLegalizePathCandidates(ref)[0]).toEqual({
      repo: 'legalize-kr/legalize-kr',
      path: 'kr/건설기술진흥법/시행령.md',
    })
  })

  it('uses verified legalize_path before generated candidates', () => {
    const ref = {
      ...baseRef,
      api_target: 'admrul',
      legalize_repo: 'legalize-kr/admrule-kr',
      legalize_path: '국토교통부/_본부/고시/건설공사 안전관리 업무수행 지침/본문.md',
    } satisfies LegalReference
    expect(buildLegalizePathCandidates(ref)[0]).toEqual({
      repo: 'legalize-kr/admrule-kr',
      path: '국토교통부/_본부/고시/건설공사 안전관리 업무수행 지침/본문.md',
    })
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm run test -- src/lib/law/__tests__/legalize-path.test.ts
```

Expected: module not found 또는 function not found로 실패한다.

- [ ] **Step 3: 구현**

`buildLegalizePathCandidates(ref)`는 다음 규칙을 적용한다.

```ts
import type { LegalReference, LegalizeSource } from '@/types/law.types'

export function buildLegalizePathCandidates(ref: LegalReference): LegalizeSource[] {
  if (ref.legalize_repo && ref.legalize_path) {
    return [{ repo: ref.legalize_repo, path: ref.legalize_path }]
  }

  if (ref.api_target === 'admrul') return []
  if (ref.api_target === 'external') return []

  const officialName = ref.canonical_law_name ?? ref.law_name
  const { directoryName, preferredFiles } = splitLawNameForLegalize(officialName)
  return preferredFiles.map((file) => ({
    repo: 'legalize-kr/legalize-kr' as const,
    path: `kr/${directoryName}/${file}`,
  }))
}

function splitLawNameForLegalize(name: string): { directoryName: string; preferredFiles: string[] } {
  const normalized = normalizeLegalizeName(name)
  if (normalized.endsWith('시행규칙')) {
    return { directoryName: normalized.slice(0, -4), preferredFiles: ['시행규칙.md'] }
  }
  if (normalized.endsWith('시행령')) {
    return { directoryName: normalized.slice(0, -3), preferredFiles: ['시행령.md'] }
  }
  return {
    directoryName: normalized,
    preferredFiles: ['법률.md', '대통령령.md', '총리령.md', '부령.md'],
  }
}

function normalizeLegalizeName(name: string): string {
  return name.normalize('NFC').replace(/\s+/g, '').replace(/·/g, 'ㆍ').trim()
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm run test -- src/lib/law/__tests__/legalize-path.test.ts
```

Expected: all tests pass.

## Task 4: Markdown frontmatter 제거와 조문 추출

**Files:**
- Create: `src/lib/law/markdown-article.ts`
- Create: `src/lib/law/__tests__/markdown-article.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, expect, it } from 'vitest'
import { extractArticleFromMarkdown, stripFrontmatter } from '../markdown-article'

const markdown = `---
제목: 건설기술 진흥법
시행일자: 2026-03-01
---

# 건설기술 진흥법

## 제8조 (다른 조문)
이 조문은 제외된다.

## 제9조 (건설기술심의위원회)
① 중앙심의위원회를 둔다.

② 필요한 사항은 대통령령으로 정한다.

### 제9조의2 (소위원회)
소위원회를 둘 수 있다.

## 제10조 (다음 조문)
다음 조문이다.
`

describe('markdown article extraction', () => {
  it('strips YAML frontmatter', () => {
    expect(stripFrontmatter(markdown)).not.toContain('제목: 건설기술 진흥법')
  })

  it('extracts the requested article only', () => {
    const article = extractArticleFromMarkdown(markdown, '제9조')
    expect(article).toContain('## 제9조 (건설기술심의위원회)')
    expect(article).toContain('중앙심의위원회를 둔다')
    expect(article).not.toContain('제8조')
    expect(article).not.toContain('제9조의2')
  })

  it('extracts branch articles', () => {
    const article = extractArticleFromMarkdown(markdown, '제9조의2')
    expect(article).toContain('### 제9조의2 (소위원회)')
    expect(article).not.toContain('제10조')
  })

  it('returns stripped body when article_ref is null', () => {
    const body = extractArticleFromMarkdown(markdown, null)
    expect(body).toContain('# 건설기술 진흥법')
    expect(body).not.toContain('---')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm run test -- src/lib/law/__tests__/markdown-article.test.ts
```

Expected: module not found 또는 function not found로 실패한다.

- [ ] **Step 3: 구현**

`extractArticleFromMarkdown`는 frontmatter 제거 후 `## 제9조`, `## 제9조 (제목)`, `### 제9조의2` 형식을 스캔한다. 비교는 기존 `parseArticleRef`를 사용해 공백과 `의2` 표기를 정규화한다.

```ts
import { parseArticleRef } from './article-code'

const ARTICLE_HEADING = /^#{2,4}\s*(제\s*\d+\s*조(?:의\s*\d+)?)\b[^\n]*$/gm

export function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim()
}

export function extractArticleFromMarkdown(markdown: string, articleRef: string | null | undefined): string {
  const body = stripFrontmatter(markdown)
  if (!articleRef) return body

  const requested = parseArticleRef(articleRef)
  if (!requested) return body

  const matches = Array.from(body.matchAll(ARTICLE_HEADING))
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i]
    const found = parseArticleRef(match[1])
    if (!found) continue
    if (found.article !== requested.article || found.branch !== requested.branch) continue

    const start = match.index ?? 0
    const end = matches[i + 1]?.index ?? body.length
    return body.slice(start, end).trim()
  }

  return ''
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm run test -- src/lib/law/__tests__/markdown-article.test.ts
```

Expected: all tests pass.

## Task 5: 좌우비교형 diff 생성

**Files:**
- Create: `src/lib/law/side-by-side-diff.ts`
- Create: `src/lib/law/__tests__/side-by-side-diff.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, expect, it } from 'vitest'
import { computeSideBySideDiff, summarizeDiffRows } from '../side-by-side-diff'

describe('computeSideBySideDiff', () => {
  it('aligns changed lines as left/right rows', () => {
    const rows = computeSideBySideDiff('제9조\n기존 문장입니다.', '제9조\n새 문장입니다.')
    expect(rows).toEqual([
      {
        id: 'row-0',
        kind: 'unchanged',
        left: [{ text: '제9조', changed: false, kind: 'unchanged' }],
        right: [{ text: '제9조', changed: false, kind: 'unchanged' }],
      },
      expect.objectContaining({ id: 'row-1', kind: 'changed' }),
    ])
    expect(rows[1].left.some((s) => s.kind === 'removed')).toBe(true)
    expect(rows[1].right.some((s) => s.kind === 'added')).toBe(true)
  })

  it('summarizes added and removed text', () => {
    const rows = computeSideBySideDiff('기존 조항', '신규 조항')
    expect(summarizeDiffRows(rows)).toEqual(['삭제: 기존', '추가: 신규'])
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm run test -- src/lib/law/__tests__/side-by-side-diff.test.ts
```

Expected: module not found 또는 function not found로 실패한다.

- [ ] **Step 3: 구현**

`diffLines`로 줄 단위 alignment를 만들고, 삭제 블록 다음에 추가 블록이 이어지면 같은 row의 `changed`로 묶는다. `changed` row 내부는 `diffWordsWithSpace`로 단어 단위 highlight segment를 만든다.

```ts
import { diffLines, diffWordsWithSpace } from 'diff'
import type { DiffSegment, SideBySideDiffRow } from '@/types/law.types'

export function computeSideBySideDiff(oldText: string, newText: string): SideBySideDiffRow[] {
  const lineParts = diffLines(oldText.trim(), newText.trim())
  const rows: SideBySideDiffRow[] = []

  for (let i = 0; i < lineParts.length; i += 1) {
    const part = lineParts[i]
    const lines = splitLines(part.value)

    if (!part.added && !part.removed) {
      for (const line of lines) {
        rows.push(row(rows.length, 'unchanged', [segment(line, 'unchanged')], [segment(line, 'unchanged')]))
      }
      continue
    }

    if (part.removed && lineParts[i + 1]?.added) {
      const oldLines = lines
      const newLines = splitLines(lineParts[i + 1].value)
      const max = Math.max(oldLines.length, newLines.length)
      for (let j = 0; j < max; j += 1) {
        rows.push(buildChangedRow(rows.length, oldLines[j] ?? '', newLines[j] ?? ''))
      }
      i += 1
      continue
    }

    for (const line of lines) {
      if (part.removed) rows.push(row(rows.length, 'removed', [segment(line, 'removed')], []))
      if (part.added) rows.push(row(rows.length, 'added', [], [segment(line, 'added')]))
    }
  }

  return rows
}

function splitLines(value: string): string[] {
  if (!value) return []
  return value.replace(/\n$/, '').split('\n')
}

function segment(text: string, kind: DiffSegment['kind']): DiffSegment {
  return { text, changed: kind !== 'unchanged', kind }
}

function row(
  index: number,
  kind: SideBySideDiffRow['kind'],
  left: DiffSegment[],
  right: DiffSegment[]
): SideBySideDiffRow {
  return { id: `row-${index}`, kind, left, right }
}

function buildChangedRow(index: number, oldLine: string, newLine: string): SideBySideDiffRow {
  if (!oldLine) return row(index, 'added', [], [segment(newLine, 'added')])
  if (!newLine) return row(index, 'removed', [segment(oldLine, 'removed')], [])

  const parts = diffWordsWithSpace(oldLine, newLine)
  return row(
    index,
    'changed',
    parts
      .filter((part) => !part.added)
      .map((part) => segment(part.value, part.removed ? 'removed' : 'unchanged')),
    parts
      .filter((part) => !part.removed)
      .map((part) => segment(part.value, part.added ? 'added' : 'unchanged'))
  )
}
```

- [ ] **Step 4: 요약 함수 구현**

`summarizeDiffRows(rows)`는 변경된 segment를 최대 8개까지 뽑고 각 항목을 80자 이내로 자른다.

```ts
export function summarizeDiffRows(rows: SideBySideDiffRow[]): string[] {
  const summary: string[] = []
  for (const r of rows) {
    const removed = r.left.filter((s) => s.kind === 'removed').map((s) => s.text.trim()).join('')
    const added = r.right.filter((s) => s.kind === 'added').map((s) => s.text.trim()).join('')
    if (removed) summary.push(`삭제: ${truncate(removed)}`)
    if (added) summary.push(`추가: ${truncate(added)}`)
    if (summary.length >= 8) break
  }
  return summary
}

function truncate(value: string): string {
  return value.length > 80 ? `${value.slice(0, 77)}...` : value
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npm run test -- src/lib/law/__tests__/side-by-side-diff.test.ts
```

Expected: all tests pass.

## Task 6: GitHub 기반 Legalize-KR client

**Files:**
- Create: `src/lib/law/legalize-client.ts`
- Create: `src/lib/law/__tests__/legalize-client.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`fetchLegalizeSnapshot`은 fetch를 mock해서 다음을 검증한다.

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchLegalizeSnapshot } from '../legalize-client'
import type { LegalReference } from '@/types/law.types'

afterEach(() => vi.unstubAllGlobals())

describe('fetchLegalizeSnapshot', () => {
  it('returns available snapshot with current and historic article markdown', async () => {
    const ref = makeRef()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/commits?') && !url.includes('until=')) {
        // author date 우선 읽기를 검증하기 위해 author/committer 날짜를 다르게 둔다.
        return jsonResponse([
          { sha: 'current-sha', commit: { author: { date: '2026-03-01T00:00:00Z' }, committer: { date: '2026-05-01T00:00:00Z' } } },
        ])
      }
      if (url.includes('/commits?') && url.includes('until=')) {
        return jsonResponse([
          { sha: 'historic-sha', commit: { author: { date: '2026-01-30T00:00:00Z' }, committer: { date: '2026-05-01T00:00:00Z' } } },
        ])
      }
      if (url.includes('/historic-sha/')) return textResponse('## 제9조\n기존 조문')
      if (url.includes('/current-sha/')) return textResponse('## 제9조\n최신 조문')
      return textResponse('', 404)
    }))

    const snapshot = await fetchLegalizeSnapshot(ref, { pdfReferenceDate: '2026-02-02' })
    expect(snapshot.status).toBe('available')
    expect(snapshot.historic_article_markdown).toContain('기존 조문')
    expect(snapshot.current_article_markdown).toContain('최신 조문')
    expect(snapshot.side_by_side_diff.length).toBeGreaterThan(0)
    // committer date(2026-05-01)가 아닌 author date를 사용해야 한다.
    expect(snapshot.current_commit_date).toBe('2026-03-01T00:00:00Z')
  })
})

function makeRef(): LegalReference {
  return {
    id: 'ref-1',
    topic_id: 'topic-1',
    law_name: '건설기술 진흥법',
    canonical_law_name: '건설기술 진흥법',
    article_ref: '제9조',
    api_target: 'law',
    law_id: '001234',
    mst: null,
    ministry: '국토교통부',
    confidence: 1,
    verified_at: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    legalize_repo: null,
    legalize_path: null,
    legalize_path_verified_at: null,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status })
}
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm run test -- src/lib/law/__tests__/legalize-client.test.ts
```

Expected: module not found 또는 function not found로 실패한다.

- [ ] **Step 3: client 구현**

`legalize-client.ts`는 서버 전용 fetch 함수만 둔다.

```ts
import { buildLegalizePathCandidates } from './legalize-path'
import { extractArticleFromMarkdown } from './markdown-article'
import { computeSideBySideDiff, summarizeDiffRows } from './side-by-side-diff'
import type { LegalReference, LegalizeSnapshot, LegalizeSource } from '@/types/law.types'

interface FetchLegalizeSnapshotOptions {
  pdfReferenceDate: string
  force?: boolean
}

export async function fetchLegalizeSnapshot(
  ref: LegalReference,
  opts: FetchLegalizeSnapshotOptions
): Promise<LegalizeSnapshot> {
  const candidates = buildLegalizePathCandidates(ref)
  if (!candidates.length) return skipped('Legalize-KR path is not resolvable for this reference')

  for (const source of candidates) {
    try {
      const current = await fetchCurrentSha(source)
      if (!current) continue
      const historic = await fetchHistoricSha(source, opts.pdfReferenceDate)
      if (!historic) return notFound(source, 'No commit exists before PDF reference date')

      const [currentMarkdown, historicMarkdown] = await Promise.all([
        fetchRawMarkdown(source, current.sha),
        fetchRawMarkdown(source, historic.sha),
      ])
      if (!currentMarkdown || !historicMarkdown) continue

      const currentArticle = extractArticleFromMarkdown(currentMarkdown, ref.article_ref)
      const historicArticle = extractArticleFromMarkdown(historicMarkdown, ref.article_ref)
      if (!currentArticle.trim() || !historicArticle.trim()) {
        return notFound(source, 'Requested article was not found in Legalize-KR Markdown')
      }

      const diff = computeSideBySideDiff(historicArticle, currentArticle)

      return {
        status: 'available',
        source,
        current_sha: current.sha,
        historic_sha: historic.sha,
        current_commit_date: current.date,
        historic_commit_date: historic.date,
        current_markdown: currentMarkdown,
        historic_markdown: historicMarkdown,
        current_article_markdown: currentArticle,
        historic_article_markdown: historicArticle,
        side_by_side_diff: diff,
        diff_summary: summarizeDiffRows(diff),
        fetched_at: new Date().toISOString(),
      }
    } catch (e) {
      return errorSnapshot(source, e)
    }
  }

  return notFound(null, 'No Legalize-KR path candidate returned a Markdown file')
}
```

HTTP 세부 규칙:

- `fetchCurrentSha(source)`는 GitHub commits API를 사용한다: `https://api.github.com/repos/${repo}/commits?path=${path}&per_page=1`.
- `fetchHistoricSha(source, date)`는 commits API를 사용한다: `https://api.github.com/repos/${repo}/commits?path=${path}&until=${date}T23:59:59+09:00&per_page=1`.
- Markdown 본문은 raw URL을 사용한다: `https://raw.githubusercontent.com/${repo}/${sha}/${path}`.
- `GITHUB_PAT`가 있으면 `Authorization: Bearer ${process.env.GITHUB_PAT}`를 붙인다.
- 404는 다음 candidate로 넘어간다.
- 403이고 `X-RateLimit-Remaining: 0`이면 `status: "error"`와 rate-limit 메시지를 반환한다.
- raw Markdown이 비어 있거나 조문 추출 결과가 빈 문자열이면 `status: "not_found"`를 반환한다.

> **⚠️ commit date 주의:** `until` 필터와 표시용 날짜는 동일 필드를 써야 PDF 기준일 전후 경계가 정확하다. legalize-kr의 실제 커밋 1건을 직접 확인해 공포일자가 **author date**에 들어가는지 검증한 뒤, `fetchCommit`이 `commit.author?.date`를 우선 읽도록 한다(committer date는 force-push/파이프라인 재구성 시 재작성될 수 있어 신뢰도가 낮다). 만약 legalize-kr이 공포일을 committer date에 넣는 것으로 확인되면 우선순위를 뒤집는다.

> **⚠️ 동시성:** 개정 reference 1개당 GitHub 호출이 3~4회(current commit, historic commit, raw ×2)다. 인증 없는 commits API 한도는 60req/hr이므로, 카드가 여러 개인 페이지의 동시 로드에서 한도가 빠르게 소진될 수 있다. 모든 GitHub 호출을 모듈 레벨 싱글톤 `p-limit`(동일 서버 인스턴스 전체 공유)으로 감싼다:

```ts
import pLimit from 'p-limit'

// GitHub 호출 전역 동시성 제한 (인스턴스 단위). raw/commits 호출이 모두 이 limiter를 통과한다.
const githubLimit = pLimit(3)

function githubFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  return githubLimit(() => fetch(url, init))
}
```

  아래 helper의 `githubJson`과 `fetchRawMarkdown`은 `fetch` 대신 `githubFetch`를 사용한다.

같은 파일에 helper를 함께 둔다.

```ts
interface GitCommitRef {
  sha: string
  date: string | null
}

async function fetchCurrentSha(source: LegalizeSource): Promise<GitCommitRef | null> {
  return fetchCommit(source)
}

async function fetchHistoricSha(source: LegalizeSource, pdfReferenceDate: string): Promise<GitCommitRef | null> {
  return fetchCommit(source, `${pdfReferenceDate}T23:59:59+09:00`)
}

async function fetchCommit(source: LegalizeSource, until?: string): Promise<GitCommitRef | null> {
  const url = new URL(`https://api.github.com/repos/${source.repo}/commits`)
  url.searchParams.set('path', source.path)
  url.searchParams.set('per_page', '1')
  if (until) url.searchParams.set('until', until)

  const commits = await githubJson<
    Array<{ sha: string; commit?: { author?: { date?: string }; committer?: { date?: string } } }>
  >(url)
  const first = commits?.[0]
  // author date를 우선한다. committer date는 force-push/파이프라인 재구성 시 재작성될 수 있다.
  return first ? { sha: first.sha, date: first.commit?.author?.date ?? first.commit?.committer?.date ?? null } : null
}

async function fetchRawMarkdown(source: LegalizeSource, sha: string): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${source.repo}/${sha}/${encodePath(source.path)}`
  const res = await githubFetch(url, { headers: githubHeaders() })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Legalize-KR raw fetch failed: HTTP ${res.status}`)
  return res.text()
}

async function githubJson<T>(url: URL): Promise<T | null> {
  const res = await githubFetch(url, { headers: githubHeaders() })
  if (res.status === 404) return null
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
    throw new Error('GitHub API rate limit exceeded while fetching Legalize-KR history')
  }
  if (!res.ok) throw new Error(`GitHub API failed: HTTP ${res.status}`)
  return (await res.json()) as T
}

function githubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'krctech-legalize-client',
  }
  if (process.env.GITHUB_PAT) headers.authorization = `Bearer ${process.env.GITHUB_PAT}`
  return headers
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

function skipped(reason: string): LegalizeSnapshot {
  return emptySnapshot('skipped', null, reason)
}

function notFound(source: LegalizeSource | null, reason: string): LegalizeSnapshot {
  return emptySnapshot('not_found', source, reason)
}

function errorSnapshot(source: LegalizeSource | null, error: unknown): LegalizeSnapshot {
  return emptySnapshot('error', source, error instanceof Error ? error.message : String(error))
}

function emptySnapshot(
  status: LegalizeSnapshot['status'],
  source: LegalizeSource | null,
  error: string
): LegalizeSnapshot {
  return {
    status,
    source,
    current_sha: null,
    historic_sha: null,
    current_commit_date: null,
    historic_commit_date: null,
    current_markdown: null,
    historic_markdown: null,
    current_article_markdown: null,
    historic_article_markdown: null,
    side_by_side_diff: [],
    diff_summary: [],
    fetched_at: new Date().toISOString(),
    error,
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm run test -- src/lib/law/__tests__/legalize-client.test.ts
```

Expected: all tests pass.

## Task 7: cache layer 확장

**Files:**
- Modify: `src/lib/law/cache.ts`

- [ ] **Step 1: helper 추가**

```ts
import type { LegalizeSnapshot } from '@/types/law.types'

const LEGALIZE_DAY_MS = 24 * 60 * 60 * 1000

export function isLegalizeCacheFresh(row: LawApiCacheRow | null): boolean {
  if (!row?.legalize_payload || !row.legalize_expires_at) return false
  return new Date(row.legalize_expires_at).getTime() >= Date.now()
}

export async function writeLegalizeCache(
  key: CacheKey,
  snapshot: LegalizeSnapshot
): Promise<LawApiCacheRow | null> {
  const supabase = await createServiceClient()
  const expiresAt = new Date(Date.now() + LEGALIZE_DAY_MS).toISOString()
  let q = supabase
    .from('law_api_cache')
    .update({
      legalize_payload: snapshot,
      legalize_fetched_at: snapshot.fetched_at,
      legalize_expires_at: expiresAt,
      legalize_error: snapshot.status === 'error' ? snapshot.error ?? 'Legalize-KR fetch failed' : null,
    })
    .eq('api_target', key.api_target)
    .eq('external_id', key.external_id)

  q = key.article_ref === null ? q.is('article_ref', null) : q.eq('article_ref', key.article_ref)

  const { data, error } = await q
    .select('*')
    .maybeSingle()
  if (error) throw error
  // 매칭되는 law.go.kr cache row가 아직 없거나(race) 삭제된 경우 data는 null이다.
  // 이때 throw하면 Legalize-KR 캐시 쓰기 실패가 enrich 전체를 막으므로, null을 반환해 호출자가 snapshot을 그대로 쓰게 한다.
  return (data as LawApiCacheRow | null) ?? null
}
```

> `.single()`은 0행 매칭 시 예외를 던진다. `writeLegalizeCache`는 `writeCache`(law.go.kr payload row 생성) 직후에 호출되므로 보통 row가 존재하지만, cache-hit 경로나 동시 요청에서 row가 없을 수 있어 `.maybeSingle()` + null 가드를 쓴다. 반환 타입은 `Promise<LawApiCacheRow | null>`로 둔다.

- [ ] **Step 2: nullable article_ref 처리 보정**

`writeLegalizeCache`에서 `article_ref`가 `null`이면 `.is('article_ref', null)`을 사용한다. `writeCache`와 같은 패턴으로 query builder를 분기한다.

- [ ] **Step 3: 타입 검증**

```bash
npm run typecheck
```

Expected: `cache.ts` type error가 없다.

## Task 8: resolver 통합

**Files:**
- Modify: `src/lib/law/resolver.ts`

- [ ] **Step 1: 기존 반환에 `legalize: null` 추가**

`external` 또는 `externalId` 미해결 반환에도 `legalize: null`을 추가한다.

- [ ] **Step 2: fresh cache hit에서 Legalize-KR cache 반환**

```ts
if (row && !stale) {
  const legalize =
    !opts.force && isLegalizeCacheFresh(row)
      ? row.legalize_payload
      : await resolveLegalizeForCacheKey(ref, cacheKey, row)

  return {
    reference: ref,
    payload: row.payload as LawPayload | AdminRulePayload,
    legalize,
    cache: {
      fetched_at: row.fetched_at,
      expires_at: row.expires_at,
      stale: false,
      legalize_fetched_at: row.legalize_fetched_at,
      legalize_expires_at: row.legalize_expires_at,
    },
    amended_after_pdf: isAmendedAfterPdf(row.effective_date),
  }
}
```

- [ ] **Step 3: fresh law.go.kr fetch 후 Legalize-KR enrich**

`writeCache` 이후 `fetchLegalizeSnapshot`을 호출하고 `writeLegalizeCache`로 저장한다. 이 단계는 `try/catch`로 감싸 Legalize-KR 실패가 law.go.kr payload 반환을 막지 않게 한다.

```ts
async function resolveLegalizeForCacheKey(
  ref: LegalReference,
  cacheKey: CacheKey,
  row: LawApiCacheRow
): Promise<LegalizeSnapshot | null> {
  if (!isAmendedAfterPdf(row.effective_date)) return row.legalize_payload ?? null

  try {
    const snapshot = await fetchLegalizeSnapshot(ref, { pdfReferenceDate: PDF_REFERENCE_DATE })
    await writeLegalizeCache(cacheKey, snapshot)
    return snapshot
  } catch (e) {
    return {
      status: 'error',
      source: null,
      current_sha: null,
      historic_sha: null,
      current_commit_date: null,
      historic_commit_date: null,
      current_markdown: null,
      historic_markdown: null,
      current_article_markdown: null,
      historic_article_markdown: null,
      side_by_side_diff: [],
      diff_summary: [],
      fetched_at: new Date().toISOString(),
      error: e instanceof Error ? e.message : String(e),
    }
  }
}
```

- [ ] **Step 4: 타입 검증**

```bash
npm run typecheck
```

Expected: resolver 반환 타입이 `LegalReferenceLatest`와 일치한다.

## Task 9: API route 반환 형태 확인

**Files:**
- Modify: `src/app/api/legal/references/[id]/latest/route.ts`
- Modify: `src/app/api/legal/references/[id]/refresh/route.ts`

- [ ] **Step 1: route 수정 최소화**

두 route는 이미 `resolveReferenceLatest` 결과를 그대로 JSON으로 반환한다. 타입이 확장되면 runtime 수정은 거의 없다. error 응답에는 `legalize`를 넣지 않는다.

- [ ] **Step 2: refresh semantics 확인**

`refresh/route.ts`는 `resolveReferenceLatest(ref, { force: true })`를 계속 사용한다. resolver에서 `force`일 때 law.go.kr와 Legalize-KR cache를 모두 갱신한다.

- [ ] **Step 3: 타입 검증**

```bash
npm run typecheck
```

Expected: route type error가 없다.

## Task 10: Markdown 렌더링과 좌우비교 UI

**Files:**
- Create: `src/app/(dashboard)/legal/[topicId]/LegalizeMarkdown.tsx`
- Create: `src/app/(dashboard)/legal/[topicId]/SideBySideLawDiff.tsx`
- Modify: `src/app/(dashboard)/legal/[topicId]/ReferenceCard.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Markdown 컴포넌트 작성**

```tsx
'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function LegalizeMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="prose-law">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  )
}
```

> 보안: react-markdown은 기본적으로 raw HTML을 렌더링하지 않으므로(`rehype-raw` 미사용) legalize-kr Markdown에 섞인 HTML로 인한 XSS가 차단된다. 표 렌더링을 위해 `rehype-raw`를 추가하지 말 것 — GFM 표는 `remark-gfm`만으로 처리된다.

- [ ] **Step 2: diff 컴포넌트 작성**

`SideBySideLawDiff`는 `SideBySideDiffRow[]`를 받아 모바일에서는 세로, `md` 이상에서는 좌우 2열로 표시한다. `removed` segment는 좌측에서 연한 빨강 배경과 취소선, `added` segment는 우측에서 연한 초록 배경을 적용한다.

```tsx
import type { SideBySideDiffRow } from '@/types/law.types'

export function SideBySideLawDiff({ rows }: { rows: SideBySideDiffRow[] }) {
  return (
    <div className="overflow-x-auto rounded-btn border border-gray-200">
      <div className="grid min-w-[720px] grid-cols-2 bg-gray-50 text-xs font-semibold text-gray-600">
        <div className="border-r border-gray-200 px-3 py-2">개정 전 (2026-02-02 기준)</div>
        <div className="px-3 py-2">개정 후 (최신)</div>
      </div>
      <div className="min-w-[720px] divide-y divide-gray-100">
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-2 text-sm leading-relaxed">
            <div className="border-r border-gray-100 px-3 py-2 whitespace-pre-wrap">
              {row.left.map((s, i) => (
                <span key={i} className={s.kind === 'removed' ? 'diff-removed' : undefined}>
                  {s.text}
                </span>
              ))}
            </div>
            <div className="px-3 py-2 whitespace-pre-wrap">
              {row.right.map((s, i) => (
                <span key={i} className={s.kind === 'added' ? 'diff-added' : undefined}>
                  {s.text}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: CSS 추가**

```css
.prose-law {
  color: #374151;
  font-size: 0.875rem;
  line-height: 1.75;
}
.prose-law h1,
.prose-law h2,
.prose-law h3 {
  color: #111827;
  font-weight: 700;
  margin: 0.75rem 0 0.375rem;
}
.prose-law table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.75rem 0;
  font-size: 0.8125rem;
}
.prose-law th,
.prose-law td {
  border: 1px solid #e5e7eb;
  padding: 0.5rem 0.625rem;
  vertical-align: top;
}
.prose-law th {
  background: #f9fafb;
  font-weight: 600;
}
.diff-removed {
  background: #fee2e2;
  color: #991b1b;
  text-decoration: line-through;
}
.diff-added {
  background: #dcfce7;
  color: #166534;
}
```

- [ ] **Step 4: `ReferenceCard.tsx` 연결**

상태를 하나 추가한다.

```tsx
const [showDiff, setShowDiff] = useState(false)
```

법령 본문 표시 우선순위:

1. `data.legalize?.current_article_markdown`
2. 기존 `payload.articles` 또는 `adminRule.body`

> legalize snapshot은 resolver가 `amended_after_pdf`인 reference에 대해서만 채운다(`resolveLegalizeForCacheKey`에서 미개정 시 `null` 반환). 따라서 미개정 법령·행정규칙은 `current_article_markdown`이 항상 없어 자연히 기존 payload 렌더 경로(2번)를 탄다. 우선순위 분기는 단순 null 체크로 충분하다.

개정 후 배지와 토글 버튼 표시 조건:

```tsx
const hasSideBySideDiff =
  data?.legalize?.status === 'available' &&
  data.legalize.side_by_side_diff.length > 0 &&
  data.amended_after_pdf
```

토글 버튼:

```tsx
{hasSideBySideDiff && (
  <button
    type="button"
    onClick={() => setShowDiff((v) => !v)}
    className="inline-flex items-center gap-1 px-2 py-1 rounded-btn border border-gray-200 hover:bg-gray-50 transition-colors"
  >
    {showDiff ? '최신 조문 보기' : '개정 사항 확인'}
  </button>
)}
```

본문 영역:

```tsx
{showDiff && hasSideBySideDiff ? (
  <SideBySideLawDiff rows={data.legalize.side_by_side_diff} />
) : data.legalize?.current_article_markdown ? (
  <LegalizeMarkdown markdown={data.legalize.current_article_markdown} />
) : (
  renderOpenLawPayload()
)}
```

`renderOpenLawPayload()`는 현재 `ReferenceCard.tsx` 안에 있는 `lawSummary && articles.length > 0`, `lawSummary && articles.length === 0`, `adminRule` 렌더링 블록을 함수로 옮긴다.

- [ ] **Step 5: 시각 검증**

```bash
npm run dev
```

Open: `http://localhost:3000/legal/[topicId]`

Expected: 기존 카드 레이아웃이 유지되고, 개정 후 법령에서만 `개정 사항 확인` 버튼이 나타난다. 버튼 클릭 시 좌측 개정 전, 우측 최신 조문이 같은 행 단위로 맞춰 보인다.

## Task 11: RAG context 보강

**Files:**
- Modify: `src/lib/law/rag-augmentor.ts`
- Modify: `src/lib/rag/prompt-builder.ts`

- [ ] **Step 1: `LegalContextBlock` 확장**

```ts
export interface LegalContextBlock {
  reference_id: string
  law_name: string
  article_ref: string | null
  enforcement_date: string | null
  amended_after_pdf: boolean
  body: string
  historic_body: string | null
  diff_summary: string[]
  detail_link?: string
}
```

- [ ] **Step 2: resolver 결과 반영**

`buildLegalContext`에서 `result.legalize?.status === 'available'`이면 다음 값을 우선 사용한다.

```ts
body = result.legalize.current_article_markdown ?? body
historicBody = result.legalize.historic_article_markdown
diffSummary = result.legalize.diff_summary
```

법령 context block은 최대 5개 유지, 각 block의 `body + historic_body + diff_summary` 합산 길이는 8,000자 이하로 자른다.

- [ ] **Step 3: 프롬프트 포맷 변경**

```ts
if (b.amended_after_pdf && b.historic_body) {
  return `${header}

[PDF 기준 조문: ${PDF_REFERENCE_DATE}]
${b.historic_body}

[최신 조문]
${b.body}

[변경 요약]
${b.diff_summary.length ? b.diff_summary.map((s) => `- ${s}`).join('\n') : '- 조문 텍스트 변경이 감지되었으나 요약 가능한 단어 변경은 제한적입니다.'}`
}
```

- [ ] **Step 4: 타입 검증**

```bash
npm run typecheck
```

Expected: prompt builder와 RAG pipeline type error가 없다.

## Task 12: 운영 환경 변수와 장애 처리

**Files:**
- Modify: `README.md`
- Modify: `vercel.json` only if cron/env documentation needs a comment-free config change.

- [ ] **Step 1: README에 환경 변수 추가**

```md
### Legalize-KR GitHub cache

- `GITHUB_PAT` (optional): GitHub public API rate limit 완화용 Personal Access Token. Legalize-KR commit 조회에 사용한다. 미설정 시 commits API 한도는 60req/hr, 설정 시 5,000req/hr이다.
- Rate limit 방어: GitHub 호출은 모듈 레벨 `p-limit(3)` 동시성 제한 + Legalize-KR 1일 캐시(`legalize_expires_at`)로 완화한다. resolver는 `amended_after_pdf`인 reference에 대해서만 enrich를 시도하므로 미개정 법령은 GitHub를 호출하지 않는다.
- 응답 지연 주의: enrich는 resolver 내부에서 동기로 실행되므로, cache miss + 개정 reference의 첫 `latest` 호출은 GitHub 왕복(최대 3~4회)만큼 느려진다. 이후 호출은 캐시로 빠르게 반환된다. (본 계획은 lazy 로딩으로 분리하지 않는다.)
- Legalize-KR 조회 실패는 법제처 OPEN API 조회 실패로 처리하지 않는다. UI에는 기존 최신 조문을 보여주고, 신구대조표만 숨긴다.
```

- [ ] **Step 2: 장애 정책 확인**

Resolver catch 정책:

- GitHub 404: `legalize.status = "not_found"`
- GitHub 403 rate limit: `legalize.status = "error"`와 `error` 메시지 저장
- 조문 추출 실패: `legalize.status = "not_found"`
- law.go.kr 실패: 기존처럼 route에서 502 반환

## Task 13: 최종 검증

**Files:**
- All modified files

- [ ] **Step 1: 단위 테스트**

```bash
npm run test
```

Expected: `legalize-path`, `markdown-article`, `side-by-side-diff`, `legalize-client` tests pass.

- [ ] **Step 2: 타입 체크**

```bash
npm run typecheck
```

Expected: TypeScript strict mode passes.

- [ ] **Step 3: 린트**

```bash
npm run lint
```

Expected: Next lint passes.

- [ ] **Step 4: production build**

```bash
npm run build
```

Expected: Next.js production build succeeds.

- [ ] **Step 5: 수동 QA**

1. `/legal/[topicId]`에서 개정 전후가 있는 법령 카드를 연다.
2. 첫 로딩에서 기존 law.go.kr 본문이 표시되는지 확인한다.
3. Legalize-KR snapshot이 available이면 Markdown table/list가 깨지지 않는지 확인한다.
4. `개정 사항 확인` 버튼을 눌러 좌측 `개정 전 (2026-02-02 기준)`, 우측 `개정 후 (최신)`을 확인한다.
5. 삭제 텍스트는 빨강 배경과 취소선, 추가 텍스트는 초록 배경으로 표시되는지 확인한다.
6. GitHub rate limit을 유도하거나 `GITHUB_PAT` 없이 테스트해도 기존 최신 조문 조회가 유지되는지 확인한다.
7. 행정규칙(`admrul`) reference는 `legalize_path` 미설정 시 `개정 사항 확인` 버튼이 나타나지 않고 기존 본문만 보이는지 확인한다(의도된 skipped 동작).
8. 개정 법령이 포함된 질문을 `/chat` 또는 `/ask`에서 실행하고, 답변이 PDF 기준 조문과 최신 조문 차이를 언급하는지 확인한다.

## 구현 순서

1. Task 1-2로 의존성과 타입/DB 기반을 먼저 맞춘다.
2. Task 3-5의 순수 함수 테스트를 통과시킨다.
3. Task 6-8로 외부 조회와 resolver 통합을 완료한다.
4. Task 9-10으로 API/UI를 연결한다.
5. Task 11-12로 RAG와 운영 문서를 보강한다.
6. Task 13 검증을 통과시킨다.

## Self-Review

- Spec coverage: Legalize-KR Markdown 조회, PDF 기준일 전후 snapshot, 좌우비교 UI, RAG 보강, GitHub cache/rate-limit 대응, 테스트가 모두 task에 매핑되어 있다.
- 보강 반영: (1) `vitest.config.ts` 생성과 `@/` alias 해석(Task 1), (2) `p-limit` 동시성 제한(Task 1 의존성 + Task 6 client), (3) commit author date 우선과 검증 메모(Task 6), (4) admrul skipped 제약 명시(범위 + Task 13), (5) `writeLegalizeCache`의 `.maybeSingle()` + null 가드(Task 7), (6) react-markdown XSS 차단·본문 우선순위 일관성 메모(Task 10).
- Placeholder scan: 빈 작업 지시나 미정 항목 없이 각 task의 산출물과 검증 명령을 명시했다.
- Type consistency: `LegalizeSnapshot`, `SideBySideDiffRow`, `LegalReferenceLatest.legalize`, `law_api_cache.legalize_payload` 명칭을 전 task에서 동일하게 사용한다. `writeLegalizeCache` 반환 타입은 `Promise<LawApiCacheRow | null>`로 통일했다.
