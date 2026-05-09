#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""KRCTech Q&A 봇 워커.
회원이 /ask 페이지에 제출한 질문을 폴링해서 Codex CLI로 처리한다.

환경변수 (bot/.env 에서 로드):
  KRCTECH_API_BASE        - krctech 서버 URL (예: https://krcglobal.vercel.app/api)
  WORKER_SECRET           - 워커 인증 토큰 (krctech의 WORKER_SECRET과 동일값)
  CODEX_CLI               - codex CLI 경로 (없으면 자동 탐색)
  QA_WORKER_IDLE_SEC      - 폴링 대기 초 (기본: 60)
  QA_WORKER_CONCURRENCY   - 동시 처리 수 (기본: 2)
"""

import fcntl
import logging
import os
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path

import requests
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# 경로 설정
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# ---------------------------------------------------------------------------
# 설정
# ---------------------------------------------------------------------------
KRCTECH_BASE: str = os.environ.get("KRCTECH_API_BASE", "").rstrip("/")
WORKER_SECRET: str = os.environ.get("WORKER_SECRET", "")
IDLE_SLEEP_SEC: int = int(os.environ.get("QA_WORKER_IDLE_SEC", "60"))
CONCURRENCY: int = int(os.environ.get("QA_WORKER_CONCURRENCY", "2"))
WORKER_ID: str = "krctech-qa-worker"

# ---------------------------------------------------------------------------
# Codex CLI 탐색
# ---------------------------------------------------------------------------
def _find_codex() -> str | None:
    if _env := os.environ.get("CODEX_CLI", "").strip():
        return _env if Path(_env).is_file() else None
    candidates = [
        shutil.which("codex"),
        str(Path.home() / ".npm-global" / "bin" / "codex"),
        str(Path.home() / ".npm" / "bin" / "codex"),
    ]
    for c in candidates:
        if c and Path(c).is_file():
            return c
    return None

CODEX_CLI: str | None = _find_codex()

# ---------------------------------------------------------------------------
# 로깅
# ---------------------------------------------------------------------------
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)
today = datetime.now().strftime("%Y-%m-%d")
log_file = LOG_DIR / f"qa-worker-{today}.log"

logger = logging.getLogger("krctech_qa_worker")
logger.setLevel(logging.DEBUG)

_fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")

_fh = RotatingFileHandler(log_file, maxBytes=10 * 1024 * 1024, backupCount=7, encoding="utf-8")
_fh.setLevel(logging.DEBUG)
_fh.setFormatter(_fmt)

_sh = logging.StreamHandler(sys.stdout)
_sh.setLevel(logging.INFO)
_sh.setFormatter(_fmt)

logger.addHandler(_fh)
logger.addHandler(_sh)

# ---------------------------------------------------------------------------
# HTTP 헬퍼
# ---------------------------------------------------------------------------
def _headers() -> dict:
    return {"Authorization": f"Bearer {WORKER_SECRET}"}


def _get(path: str, **params) -> dict:
    return requests.get(
        f"{KRCTECH_BASE}{path}",
        headers=_headers(),
        params=params,
        timeout=15,
    ).json()


def _post(path: str, **kwargs) -> dict:
    return requests.post(
        f"{KRCTECH_BASE}{path}",
        headers=_headers(),
        timeout=60,
        **kwargs,
    ).json()


# ---------------------------------------------------------------------------
# Codex 실행
# ---------------------------------------------------------------------------
def run_codex(prompt: str, timeout: int = 300) -> str:
    if not CODEX_CLI:
        raise RuntimeError("codex CLI를 찾을 수 없습니다.")
    result = subprocess.run(
        [CODEX_CLI, "exec", "--sandbox", "workspace-write", "--skip-git-repo-check", prompt],
        capture_output=True,
        text=True,
        timeout=timeout,
        stdin=subprocess.DEVNULL,
        cwd=str(BASE_DIR),
    )
    if result.returncode != 0:
        stderr = result.stderr.strip()[:500]
        raise RuntimeError(
            f"codex 실행 실패 (rc={result.returncode}): {stderr or '(stderr 없음)'}"
        )
    return result.stdout.strip()


# ---------------------------------------------------------------------------
# RAG 컨텍스트 조회
# ---------------------------------------------------------------------------
def fetch_rag_context(question: str) -> str:
    try:
        data = requests.get(
            f"{KRCTECH_BASE}/search",
            params={"q": question},
            headers=_headers(),
            timeout=15,
        ).json()
        chunks = data.get("chunks", [])
        if not chunks:
            return ""
        lines = ["[관련 문서 컨텍스트]"]
        for i, c in enumerate(chunks[:5], 1):
            content = c.get("content", "").strip()[:500]
            source = c.get("document_name", "")
            lines.append(f"\n[{i}] {source}\n{content}")
        return "\n".join(lines)
    except Exception as e:
        logger.warning(f"RAG 컨텍스트 조회 실패: {e}")
        return ""


# ---------------------------------------------------------------------------
# 질문 처리
# ---------------------------------------------------------------------------
def handle_question(qid: str, question: str) -> str:
    logger.info(f"[{qid}] 질문 처리 시작: {question[:80]!r}")
    rag_context = fetch_rag_context(question)

    rag_section = f"\n{rag_context}\n" if rag_context else ""
    prompt = (
        "너는 KRC(한국농어촌공사) 해외사업 관련 전문 AI 어시스턴트다.\n"
        "아래 질문에 친절하고 정확하게 답변해줘.\n"
        f"{rag_section}\n"
        f"질문: {question}\n\n"
        "답변 (한국어로):"
    )

    answer = run_codex(prompt)
    logger.info(f"[{qid}] 답변 생성 완료 ({len(answer)}자)")
    return answer


def _run_one(q: dict) -> bool:
    qid = q["id"]
    question = q["question"]

    # 1. claim
    claim_resp = _post(
        "/bot/worker",
        json={"action": "claim", "id": qid, "worker_id": WORKER_ID},
    )
    if "ok" not in claim_resp:
        logger.warning(f"[{qid}] claim 실패: {claim_resp}")
        return False

    rag_context = fetch_rag_context(question)

    try:
        answer = handle_question(qid, question)
        _post(
            "/bot/worker",
            json={
                "action": "complete",
                "id": qid,
                "answer": answer,
                "rag_context": rag_context,
            },
        )
        logger.info(f"[{qid}] complete 전송 완료")
        return True
    except Exception as e:
        logger.error(f"[{qid}] 처리 실패: {e}")
        _post(
            "/bot/worker",
            json={"action": "fail", "id": qid, "error": str(e)[:500]},
        )
        return False


# ---------------------------------------------------------------------------
# 메인 폴링 루프
# ---------------------------------------------------------------------------
def process_pending() -> int:
    if not KRCTECH_BASE:
        logger.error("KRCTECH_API_BASE 환경변수가 설정되지 않았습니다.")
        return 0
    if not WORKER_SECRET:
        logger.error("WORKER_SECRET 환경변수가 설정되지 않았습니다.")
        return 0

    data = _get("/bot/worker")
    questions = data.get("questions", [])
    if not questions:
        return 0

    logger.info(f"처리할 질문 {len(questions)}개 발견")
    success = 0
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        futures = {executor.submit(_run_one, q): q["id"] for q in questions}
        for fut in as_completed(futures):
            qid = futures[fut]
            try:
                if fut.result():
                    success += 1
            except Exception as e:
                logger.error(f"[{qid}] 예외 발생: {e}")

    return success


def main() -> None:
    lock_path = BASE_DIR / ".krctech_qa_worker.lock"
    lock_file = open(lock_path, "w")
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("다른 krctech_qa_worker 인스턴스가 이미 실행 중입니다. 종료합니다.", file=sys.stderr)
        sys.exit(1)

    logger.info(
        f"KRCTech QA Worker 시작 — base={KRCTECH_BASE}, "
        f"idle={IDLE_SLEEP_SEC}s, concurrency={CONCURRENCY}, "
        f"codex={CODEX_CLI or '(없음)'}"
    )

    try:
        while True:
            try:
                count = process_pending()
                if count == 0:
                    logger.debug(f"대기 중... {IDLE_SLEEP_SEC}초 후 재폴링")
                    time.sleep(IDLE_SLEEP_SEC)
                else:
                    logger.info(f"이번 사이클 완료: {count}개 처리")
                    # 바로 다음 사이클 진행
            except Exception as e:
                logger.exception(f"폴링 루프 오류: {e}")
                time.sleep(10)
    finally:
        fcntl.flock(lock_file, fcntl.LOCK_UN)
        lock_file.close()
        try:
            lock_path.unlink()
        except FileNotFoundError:
            pass


if __name__ == "__main__":
    main()
