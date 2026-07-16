# KRCTech DocAI — 차별화 업그레이드 계획

> 작성일: 2026-05-09
> 직전 베이스: `f866813 feat: 조사설계 관계법령 실시간 연동 기능 추가`

## 1. 포지셔닝 재정의

### Before (현재 구축물 기준)
> "토목설계 문서 + 법제처 실시간 법령 통합 RAG 챗봇"

→ 검색 한 번 하고 떠나는 사이트. 일반 LLM·국가법령정보센터·찾기쉬운 생활법령과 정면 충돌.

### After (제안)
> **"조사설계 인허가와 사업비 반영사항을 한 번에 검토하는 실무형 검토 시스템"**

타깃을 좁히고, 사용자의 진짜 고통을 정조준한다:
- **누구**: 농업기반정비 조사설계 실무자(KRC 직원, 위탁 설계사 엔지니어)
- **언제**: 기본·세부 설계 단계에서 인허가/사업비를 누락 없이 반영해야 할 때
- **왜**: 113개 관계법령을 머리로 다 챙길 수 없고, PDF 참고서는 시간이 지나면 낡고, 부처 가이드는 흩어져 있고, 일반 LLM은 출처를 못 댐
- **대안 슬로건**: "설계 단계에서 빠뜨리기 쉬운 인허가·협의·사업비 항목을 자동 점검합니다."

핵심 인사이트: **사용자는 법령 원문이 보고 싶어서 오는 게 아니라, "내 사업에서 무엇을 빠뜨리면 안 되는가"를 확인하러 와야 한다.** 이 한 문장이 모든 화면 설계의 기준이 된다.

---

## 2. 경쟁 지형 — 빈 자리 찾기

| 대안 | 강점 | 사용자 입장의 한계 |
| --- | --- | --- |
| 국가법령정보센터(law.go.kr) | 원문·신구법 비교가 가장 정확 | "내 사업에 무엇이 필요한지"를 답해주지 않음. 병렬로 113개 법을 다 뒤져야 함 |
| 찾기쉬운 생활법령정보 | 일반인 친화 설명 | 산업·인허가 실무 깊이 없음. 농업기반정비 사업은 다루지 않음 |
| 부처별 인허가 가이드 (환경부·산림청·농식품부 등) | 공식 절차·서식 | 분산되어 있어 한 사업당 4–10개 사이트를 돌아다녀야 함 |
| 일반 LLM (ChatGPT, 클로드) | 자연스러운 대화 | 출처 부정확·환각·법령 개정 미반영. 인허가 업무에서는 신뢰 불가 |
| 신규 건축 법규 검토 AI | 건축 분야는 강해짐 | 농업기반·산지·하천·문화유산이 얽힌 농어촌 사업은 미커버 |

**빈 자리**: "농업기반·조사설계 + 인허가 누락 방지 + 사업비 반영 근거"라는 좁고 깊은 영역. 일반 검색·일반 LLM이 만족시킬 수 없는 도메인 지식의 묶음.

---

## 3. 현재 자산 (이미 가진 카드)

직전 커밋에서 다음을 완료해 둠 — **MVP는 이 위에 쌓는다**:

- `legal_topics` (33+개 업무 항목, 카테고리: 비용/계획/문화유산/환경/재해/개발/안전/군사/건축/해양/참고)
- `legal_references` (항목 ↔ 법령·조문 매핑, `verified_at` 검증 플래그)
- `law_api_cache` (법제처 OPEN API 응답 24h 캐시 + 미시행 개정 시 단축)
- 법제처 OPEN API 클라이언트 (lawSearch / lawService / eflaw / admrul)
- `amended_after_pdf` 플래그(PDF 작성 이후 개정 자동 감지)
- 매일 03시 KST `refresh-all` cron
- RAG 파이프라인이 청크 내 법령 표기 감지 시 현행 조문 자동 주입
- 관리자 매핑 검증 패널, 항목 상세 페이지, 검색 페이지

→ 즉 **데이터 백본은 80% 완성.** 이제 그 위에 사용자 가치 레이어를 얹으면 된다.

---

## 4. MVP 3종 (우선순위 1, 1차 출시 목표)

### 4.1 사업 조건 → 인허가 자동 체크리스트 ★ 메인 후크

#### 사용자 시나리오
> 박 과장이 새로 맡은 `XX저수지 둑 높임 보강 설계` 사업의 첫 미팅 1시간 전. "새 사업" 버튼을 누르고 5분간 가이드형 폼을 채우면, **즉시 33개 인허가 항목 중 이 사업에 해당하는 12개만 추려진 체크리스트가 출력된다.** 각 항목엔 근거 법령·조문, 담당기관, 예상 제출서류, 평균 처리기간, 설계비 반영 여부가 붙는다.

#### 입력(검토형 AI 인테이크 폼)
- 사업 유형: 저수지/양배수장/용수로/배수개선/경지정리/농어촌도로/저수지 둑높임 …
- 위치: 시·도, 시·군·구, 좌표(선택), 행정구역 코드
- 부지 특성 체크: 산지 편입 / 농지 편입 / 하천구역 통과·인접 / 공유수면 / 문화유산 가능지역 / 군사기지·시설보호구역 / 자연공원·습지보전지역 / 매장문화재 분포지구
- 사업 규모: 부지면적(㎡), 사업비(억원), 굴착깊이(m), 도로 신설·확장 길이(m), 양수량(㎥/일)
- 일정: 착수예정일, 준공목표일

가이드 AI는 사용자가 입력 안 한 결정적 변수에 대해 **능동 질문**:
> "굴착 깊이가 10m를 넘으면 지하안전영향평가 대상입니다. 본 사업의 최대 굴착 깊이를 입력해 주세요."

#### 룰 엔진 데이터 모델

새 테이블 `permit_rules`:
```sql
CREATE TABLE public.permit_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id        UUID NOT NULL REFERENCES legal_topics(id) ON DELETE CASCADE,
  rule_key        TEXT NOT NULL,           -- e.g. 'forest_conversion_required'
  condition       JSONB NOT NULL,          -- { all: [...], any: [...] } predicate tree
  triggers        TEXT NOT NULL CHECK (triggers IN ('mandatory', 'recommended', 'review_needed')),
  rationale       TEXT NOT NULL,           -- "산지 편입이 있으면 산지전용허가 대상"
  reference_ids   UUID[] NOT NULL DEFAULT '{}', -- legal_references[]
  authored_by     UUID REFERENCES auth.users(id),
  reviewed_by     UUID REFERENCES auth.users(id),
  reviewed_at     TIMESTAMPTZ,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_permit_rules_topic ON permit_rules(topic_id) WHERE active;
```

`condition` JSONB 예시:
```json
{ "all": [
  { "field": "land_types", "op": "contains", "value": "forest" },
  { "field": "forest_area_ha", "op": ">=", "value": 0.05 }
]}
```

룰 평가는 순수 함수(`src/lib/permit-engine/evaluate.ts`)로 구현 → 결정성·테스트 용이성 확보.

#### 출력 카드(체크리스트 항목)
- 항목 제목 (예: "산지전용허가")
- 트리거 사유 ("산지 편입 0.5ha — 산지관리법 제14조 대상")
- 필수/권장/검토 필요 배지
- 근거 법령·조문 + 시행일 + ⚠ 개정 배지(있으면)
- 담당기관 + 신청 시스템 링크
- 예상 제출서류 목록
- 평균 처리기간
- 사업비 반영 항목(있으면 4.2와 연결)
- "보고서 인용 문구 복사" 버튼(4.5와 연결)

#### 신규 라우트
- `POST /api/projects` — 프로젝트 생성
- `POST /api/projects/[id]/conditions` — 사업 조건 업데이트
- `POST /api/projects/[id]/evaluate` — 룰 평가 트리거(서버에서 `permit_rules` 전체 적용)
- `GET /api/projects/[id]/checklist` — 평가 결과(체크리스트 + 누락 위험)
- `GET/PATCH /admin/permit-rules/...` — 관리자 룰 편집

#### 신규 페이지
- `/projects` — 내 사업 목록(SaaS 스타일 대시보드)
- `/projects/new` — 가이드 인테이크 마법사(스텝 5단계)
- `/projects/[id]` — 사업별 통합 화면(체크리스트 + 사업비 + 타임라인 + 알림)
- `/admin/permit-rules` — 룰 작성·검증·시뮬레이터(가짜 입력으로 매칭 미리보기)

#### 핵심 차별점
- 33개 항목 중 정확히 **이 사업에 해당하는 항목만** 솎아냄 → 사용자가 빠뜨릴 일이 없음
- 룰의 근거가 항상 `legal_references` 검증된 매핑에 묶여 있음 → "왜 이게 떴는지" 항상 추적 가능
- 한 화면에 인허가·사업비·일정·근거가 모임 → 다른 사이트 4–10개를 안 돌아다녀도 됨

---

### 4.2 사업비 반영 항목 누락 체크 + 자동 산정 ★ 즉시 가치 체감

#### 사용자 시나리오
> 김 차장이 사업비 견적표를 PDF로 받았다. "사업비 항목 점검" 버튼을 누르면, 26개 비용 항목 중 **본 사업이 반영해야 할 항목 14개**가 자동 추출되고, 그중 9개는 사업 조건만으로 추정 금액까지 계산된다. 견적표를 비교하니 "스마트 안전장비 비용"이 빠져 있다.

#### 데이터 모델

PDF Ⅱ장 26개 항목은 이미 `legal_topics where category='비용'`에 들어 있음. 추가:

```sql
CREATE TABLE public.cost_calculators (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id        UUID NOT NULL REFERENCES legal_topics(id) ON DELETE CASCADE,
  applies_when    JSONB NOT NULL,             -- 'permit_rules.condition'와 동일 문법
  formula_kind    TEXT NOT NULL CHECK (formula_kind IN ('fixed', 'rate', 'piecewise', 'lookup', 'manual')),
  formula         JSONB NOT NULL,
  unit            TEXT NOT NULL DEFAULT 'KRW',
  reference_ids   UUID[] NOT NULL DEFAULT '{}',
  notes           TEXT,
  reviewed_by     UUID REFERENCES auth.users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`formula_kind` 사용 예:
- `fixed`: 정액 (예: 일부 행정수수료)
- `rate`: 사업비·면적·길이에 비율 (예: 안전관리비 = 공사비 × 요율)
- `piecewise`: 구간별(공사규모별 요율 변화) — PDF 표 그대로 옮김
- `lookup`: 별표 lookup (예: 환경영향평가 협의비 표)
- `manual`: 자동 산정 불가, "필요" 표시만

#### 출력
- 표: 26개 항목 × (해당 여부, 추정금액, 산정 근거, 근거 법령, 비고)
- "이 사업비 견적표가 빠뜨린 항목" 자동 비교(엑셀 업로드 → 항목명 매핑)
- 엑셀로 다운로드(원안 양식 그대로)

#### 신규 라우트/페이지
- `GET /api/projects/[id]/cost-checklist`
- `POST /api/projects/[id]/cost-checklist/compare` (사용자 엑셀 업로드 → diff)
- `/projects/[id]/costs` 페이지

#### 차별점
- PDF의 26개 항목이 **계산기로 살아남** — 다른 사이트는 그저 PDF 텍스트만 보여줌
- 법령·고시 개정 시 산정 공식도 함께 갱신(`reference_ids`로 자동 invalidation)
- 견적표 비교가 가능해 "왜 우리 회사는 이 항목을 빼고 있었지?"라는 깨달음을 한 번에 줌

---

### 4.3 PDF 기준 vs 현행 법령 차이 + 개정 알림 (재방문 핵심 후크)

#### 사용자 시나리오
> 이 부장이 4개월 전 등록한 사업 `△△양수장 신설`. 오늘 카카오톡 알림: **"하천법 제33조가 2026-04-15부터 시행됩니다 — 본 사업의 '하천점용허가' 항목에 영향. 변경사항 보기"**

#### 메커니즘
1. `law_api_cache.effective_date`가 매일 cron으로 갱신
2. PDF 작성일(2026-02-02) 이후 새 시행일 발견 → `law_change_events` 행 생성
3. 해당 법령에 묶인 `legal_references` → 그 reference를 사용하는 `permit_rules` → 그 룰을 트리거 중인 사용자 `projects` 역추적
4. 영향받는 사용자에게 알림 (이메일·인앱·선택적 카카오톡 알림톡)

#### 데이터 모델

```sql
CREATE TABLE public.law_change_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id    UUID REFERENCES legal_references(id) ON DELETE CASCADE,
  law_id          TEXT,
  article_ref     TEXT,
  change_type     TEXT NOT NULL CHECK (change_type IN ('promulgated', 'enforced', 'pending', 'repealed')),
  effective_date  DATE,
  prev_summary    TEXT,
  curr_summary    TEXT,
  diff            JSONB,                     -- structured diff (article-level)
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('inapp', 'email', 'kakao')),
  type            TEXT NOT NULL,             -- 'law_change' | 'rule_change' | ...
  payload         JSONB NOT NULL,            -- { project_id, event_id, headline, body, deeplink }
  status          TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'read')),
  scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, status) WHERE status IN ('queued', 'sent');
```

#### 신규 라우트
- `GET /api/notifications` — 인앱 알림 목록
- `POST /api/notifications/[id]/read`
- `POST /api/cron/detect-law-changes` — Vercel Cron (이미 있는 `refresh-all`에 후처리로 추가)
- `POST /api/cron/send-notifications` — 큐된 알림 발송 (이메일은 Supabase functions 또는 Resend, 카카오는 알림톡 API)

#### 사용자 설정
- `/settings/notifications` 페이지
  - 채널 선택(이메일/카카오/사이트 알림)
  - 주제 선택(내 사업 영향 / 즐겨찾기 법령 / 모든 법령)
  - 다이제스트 vs 즉시

#### PDF vs 현행 차이 시각화
- `/legal/[topicId]` 항목 상세에 **diff 뷰** 추가
- 좌: PDF 인용(`legal_topics.summary`)
- 우: 현행 조문(법제처 API)
- 변경 부분 하이라이트(라이브러리: `diff-match-patch`)
- "PDF 기준 / 현재 시행 / 시행 예정 개정" 3개 탭

#### 차별점
- 사용자가 사이트에 안 들어와도 우리가 사용자에게 감 → **재방문이 운명적이 됨**
- 단순 "법 바뀜" 알림이 아니라 **"이 사업의 X 항목에 영향"** 까지 짚어줌 (다른 알림 서비스는 못 함)

---

## 5. 확장 기능 (우선순위 2, 2–3차 출시)

### 5.1 인허가 절차 타임라인 / 흐름도
- 체크리스트의 12개 항목을 **순서·동시성**으로 재구성
- 노드: 항목 / 엣지: 선행관계
- 사업 일정 입력 시 "지금 시작해야 하는 절차" 자동 강조
- 라이브러리: `reactflow` 또는 단순 d3-dag
- 데이터: 새 컬럼 `legal_topics.depends_on UUID[]` + admin 입력

### 5.2 보고서 인용 문구 자동 생성
- 체크리스트 각 항목에 "보고서 문구 복사" 버튼
- 결과 예시:
  > 본 사업은 「산지관리법」 제14조(2026-04-15 시행)에 따라 산지전용허가 대상이며, 편입 산림면적 0.5ha에 대해 산림청장의 협의가 필요함. (출처: 법제처 OPEN API, 조회일 2026-05-09)
- 자동으로 시행일·조회일 명시 → 감사·내부검토 대응 안전
- LLM 호출 1번 + 검증 룰 적용

### 5.3 프로젝트별 리스크 대시보드
- 각 사업 상단에 4개 KPI:
  - 미검토 인허가 항목 N개
  - PDF 작성 이후 개정된 근거법 N건
  - 누락 가능 사업비 항목 N건
  - 제출서류 준비율 X%
- 색상 신호등(녹/황/적)
- 팀 모드: 매니저는 부서 내 모든 사업의 KPI를 한 화면에서 모니터

### 5.4 담당기관 / 서식 / 신청시스템 연결
- `agencies` 테이블 + `submission_forms` 테이블
- 항목별로 담당기관, 신청 URL, 표준 서식 PDF, 처리기간
- 깨진 링크 검증 cron(주 1회 fetch)
- KRC 본·지사별 담당자(내선/메일) 추가 옵션

### 5.5 검토형 AI 인테이크(가이드 챗봇)
- 4.1 체크리스트의 입력 폼을 **챗봇 모드**로도 제공
- 시스템 프롬프트가 113개 법령에서 결정적 변수만 추출하도록 학습
- 사용자 발화: "저수지 둑 높임이고 인근에 작은 하천이 있어"
  → AI: "둑 높임 폭, 산지 편입 여부, 굴착 최대 깊이 알려주실 수 있을까요? 이 세 가지가 환경영향평가·산지전용·지하안전영향평가 적용 여부를 결정합니다."
- 입력 슬롯 채워지면 4.1 평가 자동 트리거

### 5.6 익명 사례 데이터베이스(장기, 네트워크 효과)
- 완료된 프로젝트 익명화 → "비슷한 규모 사업의 평균 인허가 소요일", "반려 사유 통계"
- 사용자 인센티브: 본인 사례 1건 등록 시 타인 사례 N건 열람권
- 후발주자가 못 따라오는 데이터 해자

---

## 6. 데이터 모델 추가 (요약)

신규 테이블 7개:

| 테이블 | 책임 | 우선순위 |
| --- | --- | --- |
| `projects` | 사용자 사업 단위 컨테이너 | MVP |
| `project_conditions` | 사업 조건(JSONB, 변경 이력 포함) | MVP |
| `permit_rules` | 사업 조건 → 인허가 매핑 룰 | MVP |
| `cost_calculators` | 항목별 사업비 산정 공식 | MVP |
| `law_change_events` | 법령 개정 이벤트 로그 | MVP |
| `notifications` | 사용자 알림 큐 | MVP |
| `agencies` / `submission_forms` | 담당기관·서식 | Phase 2 |

기존 테이블 확장:
- `legal_topics.depends_on UUID[]` — 5.1 타임라인용
- `legal_references` 인덱스에 `verified_at` 빠른 필터(이미 일부 있음)

마이그레이션 파일:
- `supabase/migrations/00019_create_projects.sql`
- `supabase/migrations/00020_create_permit_rules.sql`
- `supabase/migrations/00021_create_cost_calculators.sql`
- `supabase/migrations/00022_create_law_change_events.sql`
- `supabase/migrations/00023_create_notifications.sql`

---

## 7. 라이브러리·코드 구조

신규 모듈:
```
src/lib/permit-engine/
  ├── condition-language.ts   # JSONB DSL parser/validator (zod)
  ├── evaluate.ts             # pure rule evaluation (입력+룰셋 → matched topics)
  ├── explain.ts              # "왜 이 항목이 떴는가" trace 생성
  └── tests/                  # MVP는 unit 테스트 추가 권장
src/lib/cost-engine/
  ├── formulas.ts             # formula_kind별 evaluator
  ├── compare.ts              # 사용자 견적표 vs 자동 산출 diff
  └── tests/
src/lib/notifications/
  ├── dispatcher.ts           # 채널별 fan-out (email/kakao/inapp)
  ├── digest.ts               # 일·주간 다이제스트 빌더
  └── kakao.ts                # 카카오 알림톡 템플릿
src/lib/law/diff.ts            # 조문 단위 diff (PDF 인용 vs 현행)
```

기존 모듈 활용:
- `src/lib/law/resolver.ts` — 알림 detector가 호출
- `src/lib/law/cache.ts` — 변경 감지의 1차 신호
- `src/lib/rag/pipeline.ts` — 검토형 AI 채팅에서 부족한 슬롯 질문 생성

---

## 8. 화면 목록

신규 페이지(우선순위 1):
- `/projects` — 내 사업 목록 + KPI 카드
- `/projects/new` — 인테이크 마법사(5스텝)
- `/projects/[id]` — 통합 사업 화면 (탭: 체크리스트 / 사업비 / 일정 / 알림 / 메모)
- `/projects/[id]/checklist` (또는 단일 페이지 내 탭)
- `/projects/[id]/costs`
- `/projects/[id]/timeline` (Phase 2)
- `/notifications`
- `/settings/notifications`
- `/admin/permit-rules` — 룰 작성·시뮬레이터
- `/admin/cost-calculators`
- `/admin/agencies`

기존 페이지 변경:
- `/dashboard` — KPI 카드를 "내 사업 N건 / 미처리 알림 N건 / 영향받는 개정 N건"으로 교체
- `/legal/[topicId]` — diff 뷰 추가
- `Sidebar` — `내 사업` 메뉴를 최상단에 (관계법령은 부가 도구로 격하)

---

## 9. 보안·법적 면책·신뢰

이 영역은 잘못 알려주면 **인허가 누락으로 사용자에게 실손**이 발생할 수 있어 처음부터 단단히 한다.

- **면책 고지**: 모든 체크리스트·산정 결과 하단에 "본 결과는 참고용이며 최종 판단·책임은 사용자에게 있습니다. 인허가 신청 전 담당기관 사전협의를 권장합니다." 명시
- **검증 매핑만 사용**: 룰 평가 시 `legal_references.verified_at IS NOT NULL`인 매핑만 활성. 미검증 매핑은 "검토 필요"로 격하 표시
- **룰 더블 사인오프**: `permit_rules.authored_by` ≠ `reviewed_by` 강제(같은 사람이 작성·검증 못 함)
- **룰 변경 이력 보존**: 룰 수정 시 이전 버전 보존(audit 테이블 또는 `pg_temporal_tables`)
- **데이터 민감도**: 사업 위치는 시·군·구 + 좌표(선택) 만 저장. 정밀 좌표·예산은 사용자 명시 동의 시에만
- **RLS**: `projects.*`는 `user_id = auth.uid()`만 접근. 팀 모드 도입 시 `team_id` 추가
- **법제처 API 사용 약관 준수**: 출처 명시("출처: 법제처 OPEN API, 조회일 YYYY-MM-DD"), 상업적 재배포 X
- **알림 옵트인**: 카카오톡 알림톡은 별도 동의 + 발송 로그

---

## 10. 단계별 로드맵

### Phase 0 — 가설 검증 (2주)
- KRC 직원·위탁 설계사 엔지니어 5–8명 인터뷰
- "지난 사업에서 인허가/사업비 누락이나 지연 사례" 기록
- 인테이크 폼 항목·룰 우선순위 결정
- 산출물: 인터뷰 노트, 핵심 룰 30개 후보 리스트

### Phase 1 — MVP (6주)
- W1–2: 데이터모델·마이그레이션, 룰 엔진 코어, 인테이크 폼
- W3: 체크리스트 결과 UI + 사업비 자동 산정
- W4: 알림 시스템 + diff 뷰
- W5: 관리자 룰 편집·시뮬레이터, 핵심 30개 룰 입력·검증
- W6: 베타 사용자 5명 온보딩, 버그픽스

목표 메트릭(베타 6주 후):
- 신규 사용자 중 1주차 재방문률 ≥ 50%
- 사업당 평균 체크리스트 완료율 ≥ 70%
- 개정 알림 클릭률 ≥ 30%

### Phase 2 — 확장 (4주)
- 타임라인 흐름도
- 보고서 인용 문구 생성
- 담당기관·서식 연결
- 견적표 비교(엑셀 업로드)
- 카카오 알림톡 채널

### Phase 3 — 네트워크 효과 (8주~)
- 검토형 AI 챗봇
- 익명 사례 DB
- 팀/조직 모드(SSO, 권한, 부서 KPI)
- 외부 API 공개(타사 PMIS 연동)

---

## 11. 메트릭 / KPI

제품 차별화가 실제 가치로 변환되는지 측정:

- **활성도**: WAU/MAU, 사업당 평균 세션 수, 1주차/4주차 재방문률
- **완성도**: 체크리스트 완료율, 사업비 누락 발견 수, 알림 → 사업 수정 전환율
- **신뢰**: 개정 알림 클릭률, "보고서 인용 문구" 복사 횟수
- **확산**: 사용자당 초대 수, 조직 가입률
- **품질(가장 중요)**: 잘못된 매핑·룰로 인한 클레임 0건 유지

---

## 12. 리스크 & 대응

| 리스크 | 영향 | 대응 |
| --- | --- | --- |
| 잘못된 인허가 안내로 사용자 손해 | 신뢰 붕괴, 법적 리스크 | 검증 매핑만 사용 + 더블 사인오프 + 면책 고지 + 베타 단계 KRC 법무 검토 |
| 113개 법령 매핑 정확도 부족 | 체크리스트 누락 | 핵심 30개부터 admin 패널에서 100% 검증 후 활성화. 비검증은 "검토 필요"로 표시 |
| 법제처 API 한도 초과 | 사이트 다운 | 캐시 우선 + 야간 분산 갱신(이미 구현). 알림 cron은 변경 감지에만 호출 |
| 카카오 알림톡 비용 | 운영비 증가 | 무료 인앱·이메일 우선, 알림톡은 사용자 명시 옵트인 + 다이제스트 모드 권장 |
| 사용자 사업 정보 유출 | 신뢰 붕괴 | RLS 엄격, 정밀 좌표·금액은 옵션, 감사 로그, KRC 보안 정책 준수 |
| 부처 서식·시스템 URL 변동 | 깨진 링크 | 주 1회 fetch 검증 cron, 깨진 링크는 자동 비활성 + admin 알림 |
| 검토형 AI의 환각 | 잘못된 근거 | 챗봇은 슬롯 채우기 + RAG 인용만 허용. 자유 답변은 출처 없으면 표시 X |

---

## 13. 슬로건 / 메시지 후보

내부 합의용:
- 메인: **"설계 단계에서 빠뜨리기 쉬운 인허가·협의·사업비 항목을 자동 점검합니다."**
- 보조: "조사설계 인허가와 사업비 반영사항을 한 번에 검토하는 실무형 시스템"
- 짧은 카피: "사업 조건 5분 입력 → 인허가 체크리스트 즉시 발행"
- 가치 카피: "법령 검색이 아니라 누락 방지"

홈 히어로 영역(예시 카피 디자인):
> 농업기반정비 조사설계, 인허가와 사업비 반영을 누락 없이.
> 사업 조건만 입력하시면 113개 관계법령에 비추어 필요한 협의·허가·사업비 항목을 즉시 정리해 드립니다.
> [사업 시작하기] [샘플 보고서]

---

## 14. 다음 액션 (오늘 정리할 것)

1. **인터뷰 5명 섭외** — 베타 인터뷰 일정 확보(2주 내)
2. **핵심 30개 룰 후보 작성** — 산지전용·환경영향평가·하천점용·매장유산 등 최빈출 항목부터
3. **마이그레이션 5개 작성** — 데이터모델 확정(Phase 1 W1) ✅ (2026-05-09 완료)
4. **인테이크 폼 와이어프레임** — 5스텝 마법사 화면 설계(Figma 또는 v0)
5. **법무 검토 사전 의뢰** — KRC 법무팀에 면책 고지·데이터 처리 방침 초안 검토 의뢰

---

## 부록 A. 인테이크 폼 항목 초안 (Phase 1)

```
[Step 1 / 사업 기본정보]
- 사업명 *
- 사업 유형 (drop): 저수지 신설 / 저수지 보수·둑높임 / 양배수장 / 용수로 정비 / 배수개선 / 경지정리 / 농어촌도로 / 기타
- 위치 (시·도, 시·군·구) *
- 좌표 (선택)
- 착수예정일 / 준공목표일

[Step 2 / 부지 특성]
- [ ] 산지 편입  → 면적(ha) ▢
- [ ] 농지 편입  → 면적(ha) ▢
- [ ] 하천구역 통과·인접  → 거리(m) ▢
- [ ] 공유수면 (해안·호소)
- [ ] 자연공원 / 습지보전지역
- [ ] 군사기지·시설보호구역
- [ ] 매장유산 분포지구 / 문화유산 가능지역
- [ ] 개발제한구역
- [ ] 도시·군관리계획구역

[Step 3 / 규모·구조]
- 부지면적(㎡) *
- 사업비(억원) *
- 굴착 최대깊이(m)
- 도로 신설·확장 길이(m)
- 양수량(㎥/일)
- 구조물 종류(체크): 댐 / 보 / 양배수장 / 농수로 / 도로 / 교량 / 기타

[Step 4 / 환경·안전 조건]
- 폐기물 발생량(t)
- 평균 종사자 수
- [ ] 위험물 취급
- [ ] 도시가스·송유관 인접

[Step 5 / 검토 옵션]
- [ ] 사업비 견적표 업로드 (선택, 누락 비교용)
- [ ] 알림 받기 (이메일·카톡·인앱)
```

---

## 부록 B. 룰 예시 (Phase 1 시드용)

```
RULE: forest_conversion_required
조건: land_types contains 'forest' AND forest_area_ha >= 0.0001
트리거: mandatory
연결 항목: 산지전용허가 (legal_topics.title)
근거: 산지관리법 제14조 → legal_references 검증된 매핑
설명: 산지 편입이 있는 모든 사업은 산림청장(또는 시·도지사) 협의 대상.

RULE: small_environmental_impact_assessment
조건: any of:
  - project_type='저수지 신설' AND site_area_ha >= 1
  - project_type='도로 신설' AND road_length_m >= 4000
  - 사업유형·규모표 lookup
트리거: mandatory
연결 항목: 소규모환경영향평가
근거: 환경영향평가법 시행령 별표4

RULE: heritage_pre_review
조건: in_heritage_distribution_area = true OR site_area_m2 >= 30000
트리거: mandatory
연결 항목: 사전영향협의 / 매장유산 표본·시굴조사
근거: 매장유산 보호 및 조사에 관한 법률 제8조, 제13조

RULE: underground_safety_impact
조건: max_excavation_depth_m >= 10
트리거: mandatory
연결 항목: 지하안전영향평가
근거: 지하안전관리에 관한 특별법 제14조

RULE: military_protection_area
조건: in_military_protection_zone = true
트리거: mandatory
연결 항목: 군작전성검토
근거: 군사기지 및 군사시설 보호법 제13조
```

룰 30개 시드는 Phase 0 인터뷰 후 KRC 실무자 검증을 거쳐 admin 패널에서 입력한다.

---

## 부록 C. 회피한 것 / 안 하는 것

명확히 빼는 결정:

- **법령 원문 데이터를 통째로 미리 수집하지 않는다** — 법제처 API의 캐시·온디맨드 모델을 유지(계약·저작권·관리비 측면)
- **일반 LLM 챗봇 모드는 메인 노출 X** — 출처 없는 답변은 본 제품의 정체성과 충돌. AI는 슬롯 채우기·근거 문구 생성·diff 요약에만 한정 사용
- **건축·플랜트 등 다른 분야 확장은 Phase 4 이후** — 농업기반정비라는 좁고 깊은 해자를 먼저 끝까지 판다
- **법무 자문(legal advice) 제공 X** — 본 서비스는 검토 보조 도구이며 최종 판단 책임은 사용자에게 있음을 일관되게 표시
