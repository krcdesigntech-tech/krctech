#!/usr/bin/env bash
# krctech 법령AI 야간 자가학습 (결정형, LLM 불요). 저위험 자동 + 고위험 제안만.
cd /Users/yun/Documents/krctech || exit 1
ts="$(date '+%Y-%m-%d %H:%M')"
imp="$(npm run -s agent:improve 2>&1 | grep -E '^\[improve\]' | tail -1)"
evl="$(npm run -s agent:eval 2>&1 | grep -E 'hit:' | tr '\n' ' ')"
echo "🤖 krctech 자가학습 ($ts)"
echo "- ${imp:-improve 결과 없음}"
echo "- ${evl:-eval 결과 없음}"
echo "- 코퍼스 변경은 제안만(관리자 승인 필요): /admin/legal"
