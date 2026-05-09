#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""KRCTech Q&A 봇 워커.
회원이 /ask 페이지에 제출한 질문을 폴링해서 서버 RAG 파이프라인으로 처리한다.

환경변수 (bot/.env 에서 로드):
  KRCTECH_API_BASE        - krctech 서버 URL (예: https://krcglobal.vercel.app/api)
  WORKER_SECRET           - 워커 인증 토큰 (krctech의 WORKER_SECRET과 동일값)
  QA_WORKER_IDLE_SEC      - 폴링 대기 초 (기본: 60)
  QA_WORKER_CONCURRENCY   - 동시 처리 수 (기본: 2)
"""

import fcntl
import logging
import os
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
    resp = requests.get(
        f"{KRCTECH_BASE}{path}",
        headers=_headers(),
        params=params,
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def _post(path: str, timeout: int = 60, **kwargs) -> dict:
    resp = requests.post(
        f"{KRCTECH_BASE}{path}",
        headers=_headers(),
        timeout=timeout,
        **kwargs,
    )
    resp.raise_for_status()
    return resp.json()


def _run_one(q: dict) -> bool:
    qid = q["id"]
    question = q["question"]

    # 1. claim
    try:
        claim_resp = _post(
            "/bot/worker",
            json={"action": "claim", "id": qid, "worker_id": WORKER_ID},
        )
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else "unknown"
        if status in (404, 409):
            logger.info(f"[{qid}] 다른 워커가 이미 처리 중입니다.")
        else:
            logger.warning(f"[{qid}] claim 요청 실패: {e}")
        return False

    if "ok" not in claim_resp:
        logger.warning(f"[{qid}] claim 실패: {claim_resp}")
        return False

    try:
        logger.info(f"[{qid}] 서버 RAG 답변 생성 요청: {question[:80]!r}")
        answer_resp = _post(
            "/bot/worker",
            timeout=180,
            json={
                "action": "answer",
                "id": qid,
                "worker_id": WORKER_ID,
            },
        )
        logger.info(f"[{qid}] 답변 생성 완료: {answer_resp}")
        return True
    except Exception as e:
        logger.error(f"[{qid}] 처리 실패: {e}")
        try:
            _post(
                "/bot/worker",
                json={
                    "action": "fail",
                    "id": qid,
                    "error": str(e)[:500],
                    "worker_id": WORKER_ID,
                },
            )
        except Exception:
            pass
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
        "mode=server-rag"
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
