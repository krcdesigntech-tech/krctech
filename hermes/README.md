# Hermes 자가학습 통합 (krctech 법령AI)

이 폴더는 로컬 **Hermes Agent**(`~/.hermes`)에 설치되는 자가학습 통합의 **버전관리 사본**이다.
실제 동작 사본은 `~/.hermes/skills/...`, `~/.hermes/scripts/...`에 위치한다.

## 구성
- `skills/krctech-self-learning/` — Hermes 스킬(SKILL.md + 프로젝트 위임 래퍼). 에이전트가 도구로 호출.
- `scripts/krctech_nightly.sh` — 야간 결정형 루프(improve+eval, LLM 불요). `--no-agent` cron이 실행.

## 모델 제약
- 임베딩 = HuggingFace `bge-m3`(1024). 추론/판정 = OpenRouter만. **로컬·GPT-OAuth·Groq 미사용**(에이전트 경로).
- Hermes 프로파일 `openrouter`(provider=openrouter)로 에이전트 모드 실행 시에도 OpenRouter만 사용.

## 설치 (요약)
```bash
# 1) 스킬/스크립트 배치
cp -R hermes/skills/krctech-self-learning ~/.hermes/skills/
cp hermes/scripts/krctech_nightly.sh ~/.hermes/scripts/

# 2) OpenRouter 키 (에이전트 모드용)
#   ~/.hermes/.env 에 OPENROUTER_API_KEY=... (또는 hermes login openrouter)

# 3) 야간 자가학습 cron (실행 중인 기본 게이트웨이 사용, 결정형/안정)
hermes cron create "0 3 * * *" --script krctech_nightly.sh --no-agent \
  --name krctech-self-learning --deliver telegram:<chat_id>
hermes gateway status   # 게이트웨이 실행 확인 (미실행 시 hermes gateway install)
```

## 두 가지 실행 모드
- **결정형(권장·기본)**: `--no-agent --script krctech_nightly.sh`. LLM 불요 → OpenRouter 일일한도와 무관, 항상 동작.
  저위험(별칭 자동학습·회귀평가) 실행 + 누락 법령은 `agent_proposals` 제안만 생성 + Telegram 요약.
- **에이전트형(선택)**: OpenRouter 크레딧이 있을 때. 프로파일 `openrouter`로
  `hermes -p openrouter -z "..." --skills krctech-self-learning` 또는 `--profile openrouter` cron.
  (무료 키는 일일 한도가 낮아 캡 초과 시 실패할 수 있음 → 크레딧 권장.)

## 안전
- 코퍼스(`laws`/`law_chunks`)는 에이전트가 직접 변경하지 않는다. 고위험 변경은 `agent_proposals` 제안만.
- 적용은 **관리자 승인(`/admin/legal`) 후** `npm run agent:apply -- --all-approved`(idempotent)로만.
- 프로젝트 npm 스크립트: `agent:collect | agent:improve | agent:apply | agent:eval | agent:grow-eval`.
