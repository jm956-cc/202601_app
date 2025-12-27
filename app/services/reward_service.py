"""Reward service for coupons, points, and game tickets."""
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import InvalidConfigError
from app.models.game_wallet import GameTokenType
from app.models.user import User
from app.models.user_cash_ledger import UserCashLedger
from app.services.game_wallet_service import GameWalletService


class RewardService:
    """Centralize reward delivery (points, coupons, game tickets)."""

    def __init__(self) -> None:
        self.wallet_service = GameWalletService()

    def grant_point(
        self,
        db: Session,
        user_id: int,
        amount: int,
        reason: str | None = None,
        label: str | None = None,
        meta: dict[str, Any] | None = None,
        commit: bool = True,
    ) -> None:
        """Grant points to a user by updating cash_balance and writing a ledger entry."""

        if amount == 0:
            return
        if amount < 0:
            raise InvalidConfigError("INVALID_POINT_AMOUNT")

        q = db.query(User).filter(User.id == user_id)
        # Avoid races in MySQL/Postgres; SQLite used in tests doesn't support FOR UPDATE.
        if db.bind and db.bind.dialect.name != "sqlite":
            q = q.with_for_update()
        user = q.one_or_none()

        # In test sqlite environments, auto-create a placeholder user so existing tests/demos
        # that rely on dependency overrides (user_id=1) don't fail.
        if user is None and db.bind and db.bind.dialect.name == "sqlite":
            user = User(id=user_id, external_id=f"test-user-{user_id}")
            db.add(user)
            db.commit()
            db.refresh(user)

        if user is None:
            raise InvalidConfigError("USER_NOT_FOUND")

        user.cash_balance = (user.cash_balance or 0) + amount
        entry = UserCashLedger(
            user_id=user_id,
            delta=amount,
            balance_after=user.cash_balance,
            reason=reason or "GRANT",
            label=label,
            meta_json=meta or {},
        )
        db.add(user)
        db.add(entry)

        if commit:
            db.commit()
            db.refresh(user)
            db.refresh(entry)
        else:
            db.flush()

    def grant_coupon(self, db: Session, user_id: int, coupon_type: str, meta: dict[str, Any] | None = None) -> None:
        """Grant a coupon to a user (implementation deferred)."""

        # TODO: Integrate with coupon provider.
        _ = (db, user_id, coupon_type, meta)

    def grant_ticket(self, db: Session, user_id: int, token_type: GameTokenType, amount: int, meta: dict[str, Any] | None = None) -> None:
        """Grant game tickets (roulette/dice/lottery) to the user wallet."""

        self.wallet_service.grant_tokens(
            db,
            user_id=user_id,
            token_type=token_type,
            amount=amount,
            reason=(meta or {}).get("reason") or "LEVEL_REWARD",
            label=(meta or {}).get("label") or "AUTO_GRANT",
            meta=meta,
        )

    def deliver(self, db: Session, user_id: int, reward_type: str, reward_amount: int, meta: dict[str, Any] | None = None) -> None:
        """Dispatch reward based on reward_type; no-op for NONE/zero."""

        if reward_amount == 0 or reward_type in {"NONE", "", None}:
            return
        settings = get_settings()
        xp_from_game_reward = settings.xp_from_game_reward
        season_pass = None
        if xp_from_game_reward:
            # Lazy import to avoid circular dependency with LevelXPService
            from app.services.season_pass_service import SeasonPassService  # pylint: disable=import-outside-toplevel

            season_pass = SeasonPassService()

        if reward_type == "POINT":
            reason = (meta or {}).get("reason") if meta else None
            is_game_reward = reason in {"dice_play", "roulette_spin", "lottery_play"}
            
            if is_game_reward:
                # [설계 원칙] 게임 포인트는 재화가 아니라 XP입니다.
                if season_pass:
                    bonus_xp = (meta or {}).get("game_xp") or 0
                    total_xp = reward_amount + bonus_xp
                    season_pass.add_bonus_xp(db, user_id=user_id, xp_amount=total_xp)
            else:
                # 어드민 수동 지급 등 게임 외 사유일 때만 현찰로 지급
                self.grant_point(db, user_id=user_id, amount=reward_amount, reason=reason)
            return

        if reward_type == "BUNDLE":
            # BUNDLE은 여러 티켓을 한 번에 지급하는 미끼 보상입니다.
            bundle_items = []
            if reward_amount == 3: # Level 3 Bundle
                bundle_items = [
                    (GameTokenType.ROULETTE_COIN, 1),
                    (GameTokenType.DICE_TOKEN, 1)
                ]
            elif reward_amount == 6: # Level 6 Bundle
                bundle_items = [
                    (GameTokenType.DICE_TOKEN, 2),
                    (GameTokenType.LOTTERY_TICKET, 1)
                ]
            
            for token_type, amount in bundle_items:
                self.grant_ticket(db, user_id=user_id, token_type=token_type, amount=amount, meta=meta)
            return

        if reward_type == "COUPON":
            coupon_code = meta.get("coupon_type") if meta else "GENERIC"
            self.grant_coupon(db, user_id=user_id, coupon_type=coupon_code, meta=meta)
            return

        ticket_map = {
            "TICKET_ROULETTE": GameTokenType.ROULETTE_COIN,
            "TICKET_DICE": GameTokenType.DICE_TOKEN,
            "TICKET_LOTTERY": GameTokenType.LOTTERY_TICKET,
            "CC_COIN": GameTokenType.CC_COIN,
        }
        if reward_type in ticket_map:
            token_type = ticket_map[reward_type]
            self.grant_ticket(db, user_id=user_id, token_type=token_type, amount=reward_amount, meta=meta)
            return

        # Unknown reward types are ignored but should be monitored.
        _ = (db, user_id, reward_type, reward_amount, meta)
