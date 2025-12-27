"""Backfill missing season-pass auto-claim rewards for existing users.

Usage (inside backend container):
  python scripts/backfill_season_pass_auto_claims.py --season-id 3
  python scripts/backfill_season_pass_auto_claims.py --user-id 123
  python scripts/backfill_season_pass_auto_claims.py --dry-run

This script is idempotent: it only processes auto_claim levels without an existing reward log.
"""
from __future__ import annotations

import argparse
import logging
from datetime import datetime
from typing import Iterable

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.season_pass import SeasonPassLevel, SeasonPassProgress, SeasonPassRewardLog
from app.services.season_pass_service import SeasonPassService


logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def _eligible_auto_claim_levels(db, season_id: int, current_xp: int) -> Iterable[SeasonPassLevel]:
    stmt = (
        select(SeasonPassLevel)
        .where(
            SeasonPassLevel.season_id == season_id,
            SeasonPassLevel.required_xp <= current_xp,
            SeasonPassLevel.auto_claim.is_(True),
        )
        .order_by(SeasonPassLevel.level)
    )
    return db.execute(stmt).scalars().all()


def backfill(season_id: int | None, user_id: int | None, dry_run: bool = False) -> None:
    svc = SeasonPassService()
    with SessionLocal() as db:
        q = select(SeasonPassProgress)
        if season_id:
            q = q.where(SeasonPassProgress.season_id == season_id)
        if user_id:
            q = q.where(SeasonPassProgress.user_id == user_id)

        progresses = db.execute(q).scalars().all()
        logger.info("Progress rows to scan: %s", len(progresses))

        processed = 0
        granted = 0
        for progress in progresses:
            levels = _eligible_auto_claim_levels(db, progress.season_id, progress.current_xp)
            for level in levels:
                exists = db.execute(
                    select(SeasonPassRewardLog).where(
                        SeasonPassRewardLog.user_id == progress.user_id,
                        SeasonPassRewardLog.season_id == progress.season_id,
                        SeasonPassRewardLog.level == level.level,
                    )
                ).scalar_one_or_none()
                if exists:
                    continue

                processed += 1
                logger.info(
                    "Granting missing auto-claim",
                    extra={
                        "user_id": progress.user_id,
                        "season_id": progress.season_id,
                        "level": level.level,
                        "reward_type": level.reward_type,
                        "reward_amount": level.reward_amount,
                    },
                )

                if dry_run:
                    continue

                reward_log = SeasonPassRewardLog(
                    user_id=progress.user_id,
                    season_id=progress.season_id,
                    progress_id=progress.id,
                    level=level.level,
                    reward_type=level.reward_type,
                    reward_amount=level.reward_amount,
                    claimed_at=datetime.utcnow(),
                )
                db.add(reward_log)

                meta = {
                    "season_id": progress.season_id,
                    "level": level.level,
                    "source": "SEASON_PASS_BACKFILL",
                }
                try:
                    svc.reward_service.deliver(
                        db,
                        user_id=progress.user_id,
                        reward_type=level.reward_type,
                        reward_amount=level.reward_amount,
                        meta=meta,
                    )
                except Exception:
                    logger.warning(
                        "Backfill delivery failed",
                        extra={
                            "user_id": progress.user_id,
                            "season_id": progress.season_id,
                            "level": level.level,
                        },
                        exc_info=True,
                    )
                granted += 1

            if not dry_run:
                db.commit()

        logger.info("Backfill done. processed_missing=%s granted=%s", processed, granted)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill missing season-pass auto-claim rewards")
    parser.add_argument("--season-id", type=int, default=None, help="Limit to a specific season_id")
    parser.add_argument("--user-id", type=int, default=None, help="Limit to a specific user_id")
    parser.add_argument("--dry-run", action="store_true", help="Scan only; do not write or deliver")
    args = parser.parse_args()

    backfill(season_id=args.season_id, user_id=args.user_id, dry_run=args.dry_run)
