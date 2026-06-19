---
name: krctech-self-learning
description: "krctech 법령AI 자가학습 루프 — 운영 신호 수집, 별칭 자동학습, 누락 법령 제안, 회귀 평가. 코퍼스는 직접 변경하지 않고 제안만 한다."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [krctech, legal, self-learning, rag]
---

# krctech 자가학습 스킬

krctech(법령AI) 백엔드의 자가개선 루프를 구동한다. **모델 제약: 판정/추론은 OpenRouter만, 임베딩은 HuggingFace만. 로컬·OAuth 금지.**

## 혼합 자율 규칙 (반드시 준수)
- **저위험 = 자동 실행 허용**: 별칭 학습(`learn_aliases`), 회귀 평가(`eval`), 신호 수집(`collect`).
- **고위험 = 제안만**: 코퍼스 법령 추가/정식명 변경은 절대 직접 적용하지 말 것. `propose`로 `agent_proposals`에만 기록한다. 실제 적용(`apply`)은 **관리자 승인 후**에만, 그리고 idempotent 스크립트로만 수행한다.
- DB를 직접 조작하지 말고 아래 도구(npm 스크립트)만 호출한다.

## 도구 (scripts/)
- `collect.sh` — 부정 피드백·0결과·저점수 질문·미해결 매칭실패 신호를 JSON으로 수집 (읽기 전용)
- `improve.sh` — 별칭 자동학습 + 미해결 실패큐에서 누락 법령 `add_law` 제안 생성 + agent_runs 기록
- `eval.sh` — 평가셋으로 검색 품질 측정, eval_runs 기록, 회귀 시 note 제안
- `propose.sh` — 단건 제안 직접 생성 (`--kind ... --payload '{...}' --rationale ...`)
- `apply_proposal.sh` — **승인된** 제안만 적용 (`--all-approved` 또는 `--id <uuid>`; 기본 `--dry-run` 권장)

## 권장 야간 절차
1. `collect.sh` 로 신호 파악
2. `improve.sh` 로 저위험 자동개선 + 고위험 제안 생성
3. `eval.sh` 로 회귀 측정
4. 결과를 한국어로 요약 (개선/제안/회귀). 코퍼스 적용은 관리자 승인 후 별도.
