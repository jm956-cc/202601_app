"""Season pass domain service implementation aligned with design docs."""
from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Iterable

from fastapi import HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.models.season_pass import (
    SeasonPassConfig,
    SeasonPassLevel,
    SeasonPassProgress,
    SeasonPassRewardLog,
    SeasonPassStampLog,
)
from app.models.user import User
from app.schemas.season_pass import SeasonPassStatusResponse
from app.services.reward_service import RewardService


class SeasonPassService:
    """Encapsulates season pass workflows (status, stamp, claim)."""

    def __init__(self) -> None:
        self.reward_service = RewardService()
        self.logger = logging.getLogger(__name__)

    def get_current_season(self, db: Session, now: date | datetime) -> SeasonPassConfig | None:
        """Return the active season for the given date or None if not found."""

        today = now.date() if isinstance(now, datetime) else now
        stmt = select(SeasonPassConfig).where(
            and_(SeasonPassConfig.start_date <= today, SeasonPassConfig.end_date >= today)
        )
        seasons = db.execute(stmt).scalars().all()
        if not seasons:
            return None
        if len(seasons) > 1:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="NO_ACTIVE_SEASON_CONFLICT",
            )
        return seasons[0]

    def get_or_create_progress(self, db: Session, user_id: int, season_id: int) -> SeasonPassProgress:
        """Fetch existing progress or create an initial record."""

        stmt = select(SeasonPassProgress).where(
            SeasonPassProgress.user_id == user_id, SeasonPassProgress.season_id == season_id
        )
        progress = db.execute(stmt).scalar_one_or_none()
        if progress:
            return progress

        progress = SeasonPassProgress(
            user_id=user_id,
            season_id=season_id,
            current_level=1,
            current_xp=0,
            total_stamps=0,
        )
        db.add(progress)
        db.commit()
        db.refresh(progress)
        self._auto_claim_initial_level(db, progress)
        return progress

    def get_status(self, db: Session, user_id: int, now: date | datetime) -> dict:
        """Return active season info, progress, levels, and today's stamp flag."""

        season = self.get_current_season(db, now)
        if season is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NO_ACTIVE_SEASON")

        progress = self.get_or_create_progress(db, user_id=user_id, season_id=season.id)
        levels = (
            db.execute(
                select(SeasonPassLevel).where(SeasonPassLevel.season_id == season.id).order_by(SeasonPassLevel.level)
            )
            .scalars()
            .all()
        )
        reward_logs = db.execute(
            select(SeasonPassRewardLog).where(
                SeasonPassRewardLog.season_id == season.id, SeasonPassRewardLog.user_id == user_id
            )
        ).scalars().all()
        claimed_levels = {log.level for log in reward_logs}

        today = now.date() if isinstance(now, datetime) else now
        # "오늘 스탬프"는 일일 체크인(오늘 날짜 period_key)만 인정합니다.
        daily_key = today.isoformat()
        stamped_today = (
            db.execute(
                select(SeasonPassStampLog).where(
                    SeasonPassStampLog.user_id == user_id,
                    SeasonPassStampLog.season_id == season.id,
                    SeasonPassStampLog.period_key == daily_key,
                    SeasonPassStampLog.date == today,
                )
            )
            .scalars()
            .first()
        )

        max_required = max((lvl.required_xp for lvl in levels), default=0)
        next_level_req = next((lvl.required_xp for lvl in levels if lvl.required_xp > progress.current_xp), max_required)

        reward_labels = {
            1: "룰렛 티켓 1장",
            2: "주사위 티켓 1장",
            3: "룰렛 1장 + 주사위 1장",
            4: "복권 티켓 1장",
            5: "룰렛 티켓 2장",
            6: "주사위 2장 + 복권 1장",
            7: "CC 코인 2개 (수동)",
            8: "배민깁콘 1만 (수동)",
            9: "CC 포인트 2만 (수동)",
            10: "CC 포인트 5만 (수동)",
        }

        level_payload = []
        for level in levels:
            is_unlocked = progress.current_xp >= level.required_xp
            is_claimed = level.level in claimed_levels
            reward_label = reward_labels.get(level.level, f"{level.reward_type} {level.reward_amount}")
            level_payload.append(
                {
                    "level": level.level,
                    "required_xp": level.required_xp,
                    "reward_type": level.reward_type,
                    "reward_amount": level.reward_amount,
                    "auto_claim": level.auto_claim,
                    "is_unlocked": is_unlocked,
                    "is_claimed": is_claimed,
                    "reward_label": reward_label,
                }
            )

        return {
            "season": {
                "id": season.id,
                "season_name": season.season_name,
                "start_date": season.start_date,
                "end_date": season.end_date,
                "max_level": season.max_level,
                "base_xp_per_stamp": season.base_xp_per_stamp,
            },
            "progress": {
                "current_level": progress.current_level,
                "current_xp": progress.current_xp,
                "total_stamps": progress.total_stamps,
                "last_stamp_date": progress.last_stamp_date,
                "next_level_xp": next_level_req,
            },
            "levels": level_payload,
            "today": {"date": today, "stamped": stamped_today is not None},
        }

    def add_stamp(
        self,
        db: Session,
        user_id: int,
        source_feature_type: str,
        xp_bonus: int = 0,
        now: date | datetime | None = None,
        stamp_count: int = 1,
        period_key: str | None = None,
    ) -> dict:
        """Apply stamp(s): prevent duplicates, update XP, level-up, and log rewards."""

        today = (now or date.today())
        if isinstance(today, datetime):
            today = today.date()

        if stamp_count < 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="INVALID_STAMP_COUNT")

        season = self.get_current_season(db, today)
        if season is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NO_ACTIVE_SEASON")

        progress = self.get_or_create_progress(db, user_id=user_id, season_id=season.id)

        xp_to_add = season.base_xp_per_stamp * stamp_count + xp_bonus
        key = period_key or today.isoformat()

        # 일일 체크인(period_key=today.isoformat())은 하루 1회만 허용합니다.
        if key == today.isoformat():
            already = db.execute(
                select(SeasonPassStampLog).where(
                    SeasonPassStampLog.user_id == user_id,
                    SeasonPassStampLog.season_id == season.id,
                    SeasonPassStampLog.period_key == key,
                )
            ).scalar_one_or_none()
            if already:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ALREADY_STAMPED_TODAY")
        previous_level = progress.current_level
        # Level 1 is the initial state; it should not be treated as a reward level.
        reward_baseline_level = max(previous_level, 1)
        progress.current_xp += xp_to_add
        progress.total_stamps += stamp_count
        progress.last_stamp_date = today

        achieved_levels = self._eligible_levels(db, season.id, progress.current_xp)
        new_levels = [level for level in achieved_levels if level.level > reward_baseline_level]
        rewards: list[dict] = []

        for level in new_levels:
            reward_logged = db.execute(
                select(SeasonPassRewardLog).where(
                    SeasonPassRewardLog.user_id == user_id,
                    SeasonPassRewardLog.season_id == season.id,
                    SeasonPassRewardLog.level == level.level,
                )
            ).scalar_one_or_none()
            if reward_logged:
                continue

            if level.auto_claim:
                reward_log = SeasonPassRewardLog(
                    user_id=user_id,
                    season_id=season.id,
                    progress_id=progress.id,
                    level=level.level,
                    reward_type=level.reward_type,
                    reward_amount=level.reward_amount,
                    claimed_at=datetime.utcnow(),
                )
                db.add(reward_log)
                reward_meta = {
                    "season_id": season.id,
                    "level": level.level,
                    "source": "SEASON_PASS_AUTO_CLAIM",
                    "trigger": "STAMP",
                    "stamp_count": stamp_count,
                    "xp_added": xp_to_add,
                    "feature": source_feature_type,
                }
                try:
                    self.reward_service.deliver(
                        db,
                        user_id=user_id,
                        reward_type=level.reward_type,
                        reward_amount=level.reward_amount,
                        meta=reward_meta,
                    )
                except Exception:
                    # Reward delivery failure should not block stamp flow; log for retry visibility.
                    self.logger.warning(
                        "Season pass auto-claim failed",
                        extra={
                            "user_id": user_id,
                            "season_id": season.id,
                            "level": level.level,
                            "source": "STAMP",
                            "stamp_count": stamp_count,
                            "xp_added": xp_to_add,
                        },
                        exc_info=True,
                    )
                rewards.append(
                    {
                        "level": level.level,
                        "reward_type": level.reward_type,
                        "reward_amount": level.reward_amount,
                        "auto_claim": level.auto_claim,
                        "claimed_at": reward_log.claimed_at,
                    }
                )

        progress.current_level = max(progress.current_level, previous_level)
        if achieved_levels:
            progress.current_level = max(progress.current_level, max(level.level for level in achieved_levels))

        existing_stamp = db.execute(
            select(SeasonPassStampLog).where(
                SeasonPassStampLog.user_id == user_id,
                SeasonPassStampLog.season_id == season.id,
                SeasonPassStampLog.source_feature_type == source_feature_type,
                SeasonPassStampLog.period_key == key,
            )
        ).scalar_one_or_none()

        if existing_stamp:
            existing_stamp.stamp_count += stamp_count
            existing_stamp.xp_earned += xp_to_add
            existing_stamp.date = today
            stamp_log = existing_stamp
        else:
            stamp_log = SeasonPassStampLog(
                user_id=user_id,
                season_id=season.id,
                progress_id=progress.id,
                date=today,
                period_key=key,
                stamp_count=stamp_count,
                source_feature_type=source_feature_type,
                xp_earned=xp_to_add,
                reward_type="XP",
                reward_amount=xp_to_add,
            )
            db.add(stamp_log)

        db.commit()
        db.refresh(progress)

        # [Level Unification] Sync season level to global user level
        user = db.get(User, user_id)
        if user and user.level != progress.current_level:
            user.level = progress.current_level
            db.add(user)
            db.commit()

        leveled_up = progress.current_level > previous_level
        return {
            "added_stamp": stamp_count,
            "xp_added": xp_to_add,
            "current_level": progress.current_level,
            "leveled_up": leveled_up,
            "rewards": rewards,
        }

    def maybe_add_stamp(
        self,
        db: Session,
        user_id: int,
        source_feature_type: str,
        xp_bonus: int = 0,
        now: date | datetime | None = None,
        stamp_count: int = 1,
        period_key: str | None = None,
    ) -> dict | None:
        """Best-effort stamp: ignore no-season or already-stamped errors."""

        try:
            return self.add_stamp(
                db,
                user_id=user_id,
                source_feature_type=source_feature_type,
                xp_bonus=xp_bonus,
                now=now,
                stamp_count=stamp_count,
                period_key=period_key,
            )
        except HTTPException as exc:
            if exc.detail in {"ALREADY_STAMPED_TODAY", "NO_ACTIVE_SEASON"}:
                return None
            raise

    def maybe_add_internal_win_stamp(
        self,
        db: Session,
        user_id: int,
        threshold: int = 50,
        now: date | datetime | None = None,
    ) -> dict | None:
        """Award one stamp when total internal 게임 승리 횟수 >= threshold (once per season)."""

        today = (now or date.today())
        if isinstance(today, datetime):
            today = today.date()

        progress = self.get_internal_win_progress(db, user_id=user_id, threshold=threshold, now=today)
        if progress["total_wins"] < threshold:
            return None

        existing = db.execute(
            select(SeasonPassStampLog).where(
                SeasonPassStampLog.user_id == user_id,
                SeasonPassStampLog.source_feature_type == "INTERNAL_WIN_50",
                SeasonPassStampLog.period_key == "INTERNAL_WIN_50",
            )
        ).scalar_one_or_none()
        if existing:
            return None

        return self.maybe_add_stamp(
            db,
            user_id=user_id,
            source_feature_type="INTERNAL_WIN_50",
            xp_bonus=0,
            now=today,
            stamp_count=1,
            period_key="INTERNAL_WIN_50",
        )

    def get_internal_win_progress(
        self, db: Session, user_id: int, threshold: int = 50, now: date | datetime | None = None
    ) -> dict:
        """Return current internal win count and remaining to threshold."""

        from sqlalchemy import func
        from app.models.dice import DiceLog
        from app.models.roulette import RouletteLog
        from app.models.lottery import LotteryLog

        today = (now or date.today())
        if isinstance(today, datetime):
            today = today.date()

        dice_wins = db.execute(
            select(func.count()).select_from(DiceLog).where(DiceLog.user_id == user_id, DiceLog.result == "WIN")
        ).scalar_one()
        roulette_wins = db.execute(
            select(func.count()).select_from(RouletteLog).where(
                RouletteLog.user_id == user_id, RouletteLog.reward_amount > 0
            )
        ).scalar_one()
        lottery_wins = db.execute(
            select(func.count()).select_from(LotteryLog).where(
                LotteryLog.user_id == user_id, LotteryLog.reward_amount > 0
            )
        ).scalar_one()
        total_wins = dice_wins + roulette_wins + lottery_wins
        remaining = max(threshold - total_wins, 0)
        return {"total_wins": total_wins, "threshold": threshold, "remaining": remaining}

    def claim_reward(self, db: Session, user_id: int, level: int, now: date | datetime | None = None) -> dict:
        """Manually claim a non-auto reward for a reached level."""

        today = now.date() if isinstance(now, datetime) else now or date.today()
        season = self.get_current_season(db, today)
        if season is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NO_ACTIVE_SEASON")

        progress = self.get_or_create_progress(db, user_id=user_id, season_id=season.id)
        if progress.current_level < level:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="LEVEL_NOT_REACHED")

        level_row = db.execute(
            select(SeasonPassLevel).where(
                SeasonPassLevel.season_id == season.id, SeasonPassLevel.level == level
            )
        ).scalar_one_or_none()
        if level_row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="LEVEL_NOT_FOUND")
        if level_row.auto_claim:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="AUTO_CLAIM_LEVEL")

        existing_log = db.execute(
            select(SeasonPassRewardLog).where(
                SeasonPassRewardLog.user_id == user_id,
                SeasonPassRewardLog.season_id == season.id,
                SeasonPassRewardLog.level == level,
            )
        ).scalar_one_or_none()
        if existing_log:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="REWARD_ALREADY_CLAIMED")

        reward_log = SeasonPassRewardLog(
            user_id=user_id,
            season_id=season.id,
            level=level,
            reward_type=level_row.reward_type,
            reward_amount=level_row.reward_amount,
            claimed_at=datetime.utcnow(),
            progress_id=progress.id,
        )
        db.add(reward_log)
        reward_meta = {
            "season_id": season.id,
            "level": level,
            "source": "SEASON_PASS_MANUAL_CLAIM",
        }
        try:
            self.reward_service.deliver(
                db,
                user_id=user_id,
                reward_type=level_row.reward_type,
                reward_amount=level_row.reward_amount,
                meta=reward_meta,
            )
        except Exception:
            # Manual claim should still record the claim even if delivery fails; retry externally.
            pass
        db.commit()
        db.refresh(reward_log)

        return {
            "level": reward_log.level,
            "reward_type": level_row.reward_type,
            "reward_amount": level_row.reward_amount,
            "claimed_at": reward_log.claimed_at,
        }

    def _eligible_levels(self, db: Session, season_id: int, current_xp: int) -> Iterable[SeasonPassLevel]:
        """Return levels whose required XP is met."""

        return db.execute(
            select(SeasonPassLevel)
            .where(SeasonPassLevel.season_id == season_id, SeasonPassLevel.required_xp <= current_xp)
            .order_by(SeasonPassLevel.level)
        ).scalars().all()

    def _auto_claim_initial_level(self, db: Session, progress: SeasonPassProgress) -> None:
        """Auto-claim level 1 reward on first season-pass creation (if configured as auto_claim)."""

        level_row = db.execute(
            select(SeasonPassLevel).where(
                SeasonPassLevel.season_id == progress.season_id,
                SeasonPassLevel.level == 1,
            )
        ).scalar_one_or_none()

        if not level_row or not level_row.auto_claim:
            return

        existing_log = db.execute(
            select(SeasonPassRewardLog).where(
                SeasonPassRewardLog.user_id == progress.user_id,
                SeasonPassRewardLog.season_id == progress.season_id,
                SeasonPassRewardLog.level == 1,
            )
        ).scalar_one_or_none()

        if existing_log:
            return

        reward_log = SeasonPassRewardLog(
            user_id=progress.user_id,
            season_id=progress.season_id,
            progress_id=progress.id,
            level=1,
            reward_type=level_row.reward_type,
            reward_amount=level_row.reward_amount,
            claimed_at=datetime.utcnow(),
        )
        db.add(reward_log)
        reward_meta = {
            "season_id": progress.season_id,
            "level": 1,
            "source": "SEASON_PASS_AUTO_CLAIM_INIT",
        }
        try:
            self.reward_service.deliver(
                db,
                user_id=progress.user_id,
                reward_type=level_row.reward_type,
                reward_amount=level_row.reward_amount,
                meta=reward_meta,
            )
        except Exception:
            # Do not block creation on delivery failure; rely on logs for retry.
            self.logger.warning(
                "Season pass init auto-claim failed", extra={"user_id": progress.user_id, "season_id": progress.season_id, "level": 1}, exc_info=True
            )
        db.commit()
        db.refresh(reward_log)

    def add_bonus_xp(
        self,
        db: Session,
        user_id: int,
        xp_amount: int,
        now: date | datetime | None = None,
    ) -> dict:
        """Add raw XP without stamping (used for game 보상 포인트 → XP)."""

        if xp_amount <= 0:
            return {"added_xp": 0, "leveled_up": False, "rewards": []}

        today = (now or date.today())
        if isinstance(today, datetime):
            today = today.date()

        season = self.get_current_season(db, today)
        if season is None:
            return {"added_xp": 0, "leveled_up": False, "rewards": []}

        progress = self.get_or_create_progress(db, user_id=user_id, season_id=season.id)
        previous_level = progress.current_level
        # Level 1 is the initial state; it should not be treated as a reward level.
        reward_baseline_level = max(previous_level, 1)
        progress.current_xp += xp_amount
        db.add(progress)

        # Do not mirror to global LevelXP here; external/bonus XP would double-grant game tokens
        # via LevelXPService auto rewards, causing overpayment.

        achieved_levels = self._eligible_levels(db, season.id, progress.current_xp)
        new_levels = [level for level in achieved_levels if level.level > reward_baseline_level]
        rewards: list[dict] = []

        for level in new_levels:
            reward_logged = db.execute(
                select(SeasonPassRewardLog).where(
                    SeasonPassRewardLog.user_id == user_id,
                    SeasonPassRewardLog.season_id == season.id,
                    SeasonPassRewardLog.level == level.level,
                )
            ).scalar_one_or_none()
            if reward_logged:
                continue

            if level.auto_claim:
                reward_log = SeasonPassRewardLog(
                    user_id=user_id,
                    season_id=season.id,
                    progress_id=progress.id,
                    level=level.level,
                    reward_type=level.reward_type,
                    reward_amount=level.reward_amount,
                    claimed_at=datetime.utcnow(),
                )
                db.add(reward_log)
                reward_meta = {
                    "season_id": season.id,
                    "level": level.level,
                    "source": "SEASON_PASS_AUTO_CLAIM",
                    "trigger": "BONUS_XP",
                    "xp_added": xp_amount,
                }
                try:
                    self.reward_service.deliver(
                        db,
                        user_id=user_id,
                        reward_type=level.reward_type,
                        reward_amount=level.reward_amount,
                        meta=reward_meta,
                    )
                except Exception:
                    # Reward delivery failure should not block XP flow; log for retry visibility.
                    self.logger.warning(
                        "Season pass auto-claim failed",
                        extra={
                            "user_id": user_id,
                            "season_id": season.id,
                            "level": level.level,
                            "source": "BONUS_XP",
                            "xp_added": xp_amount,
                        },
                        exc_info=True,
                    )
                rewards.append(
                    {
                        "level": level.level,
                        "reward_type": level.reward_type,
                        "reward_amount": level.reward_amount,
                        "auto_claim": level.auto_claim,
                        "claimed_at": reward_log.claimed_at,
                    }
                )

        progress.current_level = max(progress.current_level, previous_level)
        if achieved_levels:
            progress.current_level = max(progress.current_level, max(level.level for level in achieved_levels))

        db.commit()
        db.refresh(progress)

        # [Level Unification] Sync season level to global user level
        user = db.get(User, user_id)
        if user and user.level != progress.current_level:
            user.level = progress.current_level
            db.add(user)
            db.commit()

        leveled_up = progress.current_level > previous_level
        return {
            "added_xp": xp_amount,
            "leveled_up": leveled_up,
            "current_level": progress.current_level,
            "rewards": rewards,
        }
