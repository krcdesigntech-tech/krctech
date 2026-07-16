#!/usr/bin/env bash
# 기본 dry-run 권장. 실제 적용은 --all-approved (또는 --id) 명시.
cd "/Users/yun/Documents/krctech" && node scripts/agent/apply-proposal.mjs "$@"
