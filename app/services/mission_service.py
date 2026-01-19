from datetime import date, datetime, timedelta, timezone
import math
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from app.models.mission import Mission, UserMissionProgress, MissionCategory, MissionRewardType
from app.models.user import User
from app.models.season_pass import SeasonPassProgress
from app.models.game_wallet import UserGameWallet, GameTokenType
from app.models.feature import UserEventLog
from app.core.config import get_settings
from zoneinfo import ZoneInfo

class MissionService:
    def __init__(self, db: Session):
        self.db = db
        self.settings = get_settings()

    def _is_golden_hour_mission(self, mission: Mission) -> bool:
        logic_key = (mission.logic_key or "").lower()
        return "golden_hour" in logic_key

    def _now_tz(self) -> datetime:
        tz = ZoneInfo(self.settings.timezone or "Asia/Seoul")
        return datetime.now(tz)

    def _within_time_window(self, mission: Mission, now_tz: datetime) -> bool:
        if mission.start_time and mission.end_time:
            current_time = now_tz.time()
            return mission.start_time <= current_time <= mission.end_time
        return True

    def _operational_play_date(self, now_tz: datetime) -> date:
        """Return the operational play date (KST day with reset at configured hour)."""
        reset_hour_raw = getattr(self.settings, "streak_day_reset_hour_kst", 0)
        reset_hour = 0 if reset_hour_raw is None else int(reset_hour_raw)
        today = now_tz.date()
        if now_tz.hour < reset_hour:
            return today - timedelta(days=1)
        return today

    def sync_play_streak(self, user_id: int, now_tz: datetime) -> User:
        """Update user's play_streak/last_play_date with row-level lock; no commit here."""
        play_day = self._operational_play_date(now_tz)

        user = (
            self.db.query(User)
            .filter(User.id == user_id)
            .with_for_update()
            .one()
        )

        if user.last_play_date == play_day:
            return user

        prev_streak_days = int(getattr(user, "play_streak", 0) or 0)
        prev_last_play_date = getattr(user, "last_play_date", None)

        hot_threshold = int(getattr(self.settings, "streak_hot_threshold_days", 3) or 3)
        legend_threshold = int(getattr(self.settings, "streak_legend_threshold_days", 7) or 7)

        if user.last_play_date == play_day - timedelta(days=1):
            user.play_streak = int(user.play_streak or 0) + 1
        else:
            user.play_streak = 1

            # Observability: streak reset occurs when the user breaks continuity (excluding first-ever play).
            if prev_last_play_date is not None:
                self.db.add(
                    UserEventLog(
                        user_id=int(user.id),
                        feature_type="STREAK",
                        event_name="streak.reset",
                        meta_json={
                            "prev_streak_days": prev_streak_days,
                            "prev_last_play_date": prev_last_play_date.isoformat() if prev_last_play_date else None,
                            "play_day": play_day.isoformat(),
                        },
                    )
                )

        new_streak_days = int(getattr(user, "play_streak", 0) or 0)

        # Observability: promotions when crossing milestones.
        if prev_streak_days < hot_threshold <= new_streak_days:
            self.db.add(
                UserEventLog(
                    user_id=int(user.id),
                    feature_type="STREAK",
                    event_name="streak.promote",
                    meta_json={
                        "milestone": "HOT",
                        "from_days": prev_streak_days,
                        "to_days": new_streak_days,
                        "play_day": play_day.isoformat(),
                    },
                )
            )
        if prev_streak_days < legend_threshold <= new_streak_days:
            self.db.add(
                UserEventLog(
                    user_id=int(user.id),
                    feature_type="STREAK",
                    event_name="streak.promote",
                    meta_json={
                        "milestone": "LEGEND",
                        "from_days": prev_streak_days,
                        "to_days": new_streak_days,
                        "play_day": play_day.isoformat(),
                    },
                )
            )
        user.last_play_date = play_day
        self.db.add(user)

        # Day4~5 streak ticket bonus: grant once on the first play of the operational day.
        self._maybe_grant_streak_day_tickets(user=user, play_day=play_day)

        # Day3/Day7 streak milestone rewards (auto grants).
        self._maybe_grant_streak_milestone_rewards(
            user=user,
            play_day=play_day,
            prev_streak_days=prev_streak_days,
            new_streak_days=new_streak_days,
        )
        return user

    def _maybe_grant_streak_milestone_rewards(
        self,
        *,
        user: User,
        play_day: date,
        prev_streak_days: int,
        new_streak_days: int,
    ) -> None:
        # [REFACTOR] Phase 2: Do NOT auto-grant.
        # Just return. The user must claim manually via /api/mission/streak/claim.
        # We rely on 'get_streak_info' to detect if they have a pending reward.
        return

    def _maybe_grant_streak_day_tickets(self, *, user: User, play_day: date) -> None:
        # [REFACTOR] Phase 2: Do NOT auto-grant.
        # Included in manual claim flow if we want consistency, OR keep auto for minor tickets?
        # User said "Receive button". Let's disable auto here too.
        return

    def get_pending_streak_milestone(self, user_id: int) -> int | None:
        """Check if user has an unclaimed streak milestone reward."""
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            return None
            
        streak_days = int(user.play_streak or 0)
        
        # Load rules (duplicated logic, should refactor but keeping independent for now)
        # Phase 2 default (documented): milestone rewards are Day3 / Day7 unless overridden via UI config.
        from app.services.ui_config_service import UiConfigService
        row = UiConfigService.get(self.db, "streak_reward_rules")
        milestones: list[int] = []

        if row and row.value_json:
            try:
                value = row.value_json
                rules = value.get("rules", []) if isinstance(value, dict) else []
                if isinstance(rules, list):
                    for r in rules:
                        if not isinstance(r, dict):
                            continue
                        if not r.get("enabled", True):
                            continue
                        day = r.get("day")
                        if day is None:
                            continue
                        milestones.append(int(day))
            except Exception:
                milestones = []

        if not milestones:
            milestones = [3, 7]
        
        # Check active status
        # If I have streak 5, I might have missed claiming day 3?
        # Logic: Check the HIGHEST achieved milestone that is NOT claimed.
        # Or check all achieved milestones? Assuming linear progression, check the latest passed milestone.
        
        candidates = [m for m in milestones if streak_days >= m]
        if not candidates:
            return None
            
        # Sort desc to check highest first? Or lowest?
        # If I have streak 7, I should claim 7. (Assuming 3 was claimed or we only allow latest).
        # Let's check all candidates.
        candidates.sort(reverse=True)
        
        for m_day in candidates:
            # Check if claimed
            # Event name format: streak.reward_grant.{milestone_days}.{play_day}
            # Wait, play_day changes. 
            # If I hit day 3 on Monday (play_day=Mon), not claimed.
            # Tuesday (Streak 4), play_day=Tue. 
            # I should verify if I EVER claimed 'streak.reward_grant.3.%' within this streak cycle?
            # Hard to track "Current Streak Cycle" in logs.
            
            # Simple approach: Check if claimed TODAY or RECENTLY?
            # No. If I hit streak 3 today, I should claim "streak.reward_grant.3.{today}".
            
            # Let's derive `play_day` from `last_play_date`.
            # If `last_play_date` corresponds to `streak_days`.
            
            # If user.last_play_date is when they achieved streak_days.
            # We construct the event name using that date.
            
            if not user.last_play_date:
                continue
                
            play_day = user.last_play_date
            
            # Use a wildcard query or check strict match?
            # The requirement is "Claim ONCE per milestone achievement".
            # If I achieved Day 3 today, I should claim it today.
            # If I login tomorrow (Streak 4), can I still claim Day 3?
            # Probably yes (Late Claim).
            # But the 'play_day' in the log key was used for idempotency.
            
            # If we allow late claim, we need to know WHEN they hit Day 3. We don't verify that history easily.
            # Compromise: Users can only claim the milestone corresponding to their CURRENT streak (or recent).
            # If Streak is 7, they claim 7. If they missed 3, tough luck?
            # Or: allow claiming any M if streak >= M and not claimed for *recent time*?
            
            # Let's stick to: "Is there a pending reward for the most recent milestone?"
            # If streak is 3, 4, 5, 6 -> Check Milestone 3.
            # If streak is 7+ -> Check Milestone 7.
            
            # But we need to distinguish "Day 3 reward earned LAST week" vs "THIS week".
            # Logs store `play_day`.
            # We can check: Did we claim Milestone X since `user.last_play_date - (streak - M) days`?
            # This is complex.
            
            # SIMPLIFIED LOGIC:
            # Check if `streak.reward_grant.{m_day}.{approx_date}` exists.
            # If user has Streak 7 today. They hit Streak 7 today.
            # Claim key: `streak.reward_grant.7.{today}`.
            
            # If user has Streak 4 today. They hit Streak 3 yesterday.
            # Claim key: `streak.reward_grant.3.{yesterday}`.
            
            # We need to compute the `hit_date` for the milestone based on current streak.
            # hit_date = last_play_date - (streak_days - m_day)
            
            days_ago = streak_days - m_day
            if days_ago < 0: continue # Should not happen given candidates filter
            
            hit_date = user.last_play_date - timedelta(days=days_ago) # Approximately correct assuming daily play
            
            event_name = f"streak.reward_grant.{m_day}.{hit_date.isoformat()}"
            
            exists = self.db.query(UserEventLog).filter(
                UserEventLog.user_id == user_id,
                UserEventLog.event_name == event_name
            ).first()
            
            if not exists:
                return m_day
                
        return None

    def get_streak_info(self, user_id: int) -> dict:
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            return {
                "streak_days": 0,
                "current_multiplier": 1.0,
                "is_hot": False,
                "is_legend": False,
                "next_milestone": int(getattr(self.settings, "streak_hot_threshold_days", 3) or 3),
                "reward_promo": None # New field
            }

        streak_days = int(user.play_streak or 0)
        hot_threshold = int(getattr(self.settings, "streak_hot_threshold_days", 3) or 3)
        legend_threshold = int(getattr(self.settings, "streak_legend_threshold_days", 7) or 7)

        is_hot = streak_days >= hot_threshold
        is_legend = streak_days >= legend_threshold
        current_multiplier = self._active_streak_vault_bonus_multiplier(user=user)

        if streak_days < hot_threshold:
            next_milestone = hot_threshold - streak_days
        elif streak_days < legend_threshold:
            next_milestone = legend_threshold - streak_days
        else:
            next_milestone = 0
            
        # Check for claimable reward
        claimable_day = self.get_pending_streak_milestone(user_id)

        return {
            "streak_days": streak_days,
            "current_multiplier": current_multiplier,
            "is_hot": is_hot,
            "is_legend": is_legend,
            "next_milestone": next_milestone,
            "claimable_day": claimable_day 
        }

    def claim_streak_reward(self, user_id: int) -> dict:
        """Process manual claim of a pending streak reward."""
        target_day = self.get_pending_streak_milestone(user_id)
        if not target_day:
            return {"success": False, "message": "No claimable reward found."}
            
        user = self.db.query(User).filter(User.id == user_id).first()
        play_day = user.last_play_date # Should match logic in get_pending...
        
        # Calculate hit_date for consistency
        streak_days = int(user.play_streak or 0)
        hit_date = user.last_play_date - timedelta(days=(streak_days - target_day))
        
        event_name = f"streak.reward_grant.{target_day}.{hit_date.isoformat()}"
        
        # [Grant Logic Refactored from _maybe_grant...]
        # Load grants for target_day
        from app.services.ui_config_service import UiConfigService
        row = UiConfigService.get(self.db, "streak_reward_rules")
        
        grants = []
        # ... logic to fetch grants for 'target_day' ...
        # Simplified: Hardcode defaults if config missing (matching original logic)
        
        milestones = []
        if row and row.value_json:
             try:
                 rules = row.value_json.get("rules", [])
                 for r in rules:
                     if int(r["day"]) == target_day and r.get("enabled", True):
                         # Parse grants... (Need to duplicate grant parsing logic or extract it)
                         # Creating 'grants' list
                         for g in r.get("grants", []):
                             grants.append(g) # Raw dict
             except: pass
        
        if not grants:
             # Apply Defaults
             if target_day == 3:
                 grants = [
                     {"kind": "WALLET", "token_type": GameTokenType.ROULETTE_COIN, "amount": 1},
                     {"kind": "WALLET", "token_type": GameTokenType.DICE_TOKEN, "amount": 1},
                     {"kind": "WALLET", "token_type": GameTokenType.LOTTERY_TICKET, "amount": 1},
                 ]
             elif target_day == 7:
                 grants = [{"kind": "INVENTORY", "item_type": "DIAMOND", "amount": 1}]

        from app.services.game_wallet_service import GameWalletService
        from app.services.inventory_service import InventoryService
        wallet_service = GameWalletService()
        
        granted_payload = []
        meta = {
            "reason": "STREAK_MILESTONE_REWARD",
            "milestone_days": target_day,
            "streak_days": streak_days,
            "play_day": hit_date.isoformat(),
        }

        for grant in grants:
             # ... execute grant ... (Parsing kind/token_type from dict)
             try:
                 kind = grant.get("kind")
                 amount = int(grant.get("amount", 0))
                 if kind == "WALLET":
                     tt_str = grant.get("token_type")
                     # Convert str to Enum if needed
                     try:
                         token_type = GameTokenType(tt_str) if isinstance(tt_str, str) else tt_str
                     except: 
                        # Try mapping number to enum?
                        continue
                     
                     wallet_service.grant_tokens(
                        self.db, user_id=user_id, token_type=token_type, amount=amount,
                        reason="STREAK_MILESTONE_REWARD", label=f"STREAK_DAY_{target_day}", meta=meta, auto_commit=False
                     )
                     granted_payload.append({"token_type": str(token_type), "amount": amount})
                 elif kind == "INVENTORY":
                     item_type = grant.get("item_type")
                     InventoryService.grant_item(
                        self.db, user_id=user_id, item_type=item_type, amount=amount,
                        reason="STREAK_MILESTONE_REWARD", related_id=f"streak:{target_day}", auto_commit=False
                     )
                     granted_payload.append({"item_type": item_type, "amount": amount})
             except Exception as e:
                 print(f"Grant error: {e}")

        # Log event
        self.db.add(UserEventLog(
            user_id=user_id, feature_type="STREAK", event_name=event_name,
            meta_json={**meta, "grants": granted_payload}
        ))
        
        self.db.commit()
        return {"success": True, "day": target_day, "grants": granted_payload}

    def _active_streak_vault_bonus_multiplier(self, *, user: User) -> float:
        """Return the currently-active streak vault bonus multiplier.

        For time-windowed bonuses (e.g., 1h/4h), the bonus becomes active starting from
        the first eligible base-game play of the operational day.
        """
        if not bool(getattr(self.settings, "streak_vault_bonus_enabled", False)):
            return 1.0

        streak_days = int(getattr(user, "play_streak", 0) or 0)
        if streak_days == 2:
            multiplier, duration_hours = 1.2, 1
        elif streak_days == 3:
            multiplier, duration_hours = 1.2, 4
        elif streak_days == 6:
            multiplier, duration_hours = 1.5, 1
        elif streak_days >= 7:
            return 2.0
        else:
            return 1.0

        # Time-windowed bonuses depend on whether the daily window has started.
        op_date = self._operational_play_date(self._now_tz())
        if getattr(user, "streak_vault_bonus_date", None) != op_date:
            return 1.0

        start_at = getattr(user, "streak_vault_bonus_started_at", None)
        if start_at is None:
            return 1.0

        # `streak_vault_bonus_started_at` is stored as naive UTC.
        start_utc = start_at.replace(tzinfo=timezone.utc)
        now_utc = self._now_tz().astimezone(timezone.utc)
        if now_utc <= start_utc + timedelta(hours=int(duration_hours)):
            return float(multiplier)
        return 1.0

    def _streak_multiplier(self, user: User) -> float:
        if not bool(getattr(self.settings, "streak_multiplier_enabled", False)):
            return 1.0

        streak_days = int(user.play_streak or 0)
        legend_threshold = int(getattr(self.settings, "streak_legend_threshold_days", 7) or 7)
        hot_threshold = int(getattr(self.settings, "streak_hot_threshold_days", 3) or 3)

        if streak_days >= legend_threshold:
            return float(getattr(self.settings, "streak_legend_multiplier", 1.5) or 1.5)
        if streak_days >= hot_threshold:
            return float(getattr(self.settings, "streak_hot_multiplier", 1.2) or 1.2)
        return 1.0

    def get_reset_date_str(self, category: MissionCategory) -> str:
        """Returns the reset key string based on category and current KST time.
        
        Updated to use strict operational play date (default 9AM reset) to align with Vault/Streak logic.
        """
        now_tz = self._now_tz()
        
        if category == MissionCategory.DAILY:
            # STRICT ALIGNMENT: Use operational play date (e.g. 09:00 KST rollover)
            return self._operational_play_date(now_tz).strftime("%Y-%m-%d")
        
        elif category == MissionCategory.WEEKLY:
            # For Weekly, we can likely stick to ISO calendar or align with Op Date.
            # ISO Week implies Monday start.
            # If we want 9AM Monday reset, we should use operational date's isocalendar.
            year, week, _ = self._operational_play_date(now_tz).isocalendar()
            return f"{year}-W{week:02d}"
        else:
            return "STATIC"

    def get_user_missions(self, user_id: int) -> List[dict]:
        """
        Returns a list of missions with the user's current progress.
        Ideally returns a Pydantic schema list, but for now returning dicts for flexibility.
        """
        missions = self.db.query(Mission).filter(Mission.is_active == True).all()
        result = []
        now_tz = self._now_tz()

        for mission in missions:
            if self._is_golden_hour_mission(mission) and not self.settings.golden_hour_enabled:
                continue
            if not self._within_time_window(mission, now_tz):
                # Hide out-of-window missions from list
                continue
            reset_date = self.get_reset_date_str(mission.category)

            progress = self.db.query(UserMissionProgress).filter(
                UserMissionProgress.user_id == user_id,
                UserMissionProgress.mission_id == mission.id,
                UserMissionProgress.reset_date == reset_date
            ).first()

            if not progress:
                # Init virtual progress object for frontend
                progress_dict = {
                    "current_value": 0,
                    "is_completed": False,
                    "is_claimed": False,
                    "approval_status": "NONE"
                }
            else:
                progress_dict = {
                    "current_value": progress.current_value,
                    "is_completed": progress.is_completed,
                    "is_claimed": progress.is_claimed,
                    "approval_status": progress.approval_status
                }

            result.append({
                "mission": {
                    "id": mission.id,
                    "title": mission.title,
                    "description": mission.description,
                    "category": mission.category,
                    "logic_key": mission.logic_key,
                    "action_type": mission.action_type,
                    "target_value": mission.target_value,
                    "reward_type": mission.reward_type,
                    "reward_amount": mission.reward_amount,
                    "xp_reward": mission.xp_reward,
                    "requires_approval": mission.requires_approval,
                    "start_time": mission.start_time.isoformat(timespec="minutes") if mission.start_time else None,
                    "end_time": mission.end_time.isoformat(timespec="minutes") if mission.end_time else None,
                    "auto_claim": mission.auto_claim,
                    "is_active": mission.is_active,
                    "is_featured": (mission.logic_key or "") == "daily_login_gift"
                },
                "progress": progress_dict
            })

        return result

    def update_progress(self, user_id: int, action_type: str, delta: int = 1) -> List[UserMissionProgress]:
        """
        Updates progress for ALL active missions matching the action_type (e.g., 'PLAY_GAME').
        Also falls back to logic_key for legacy support.
        Returns list of updated progress objects.
        """
        # [COMPATIBILITY] Handle 'PLAY' as 'PLAY_GAME'
        query_action_types = [action_type]
        if action_type == "PLAY_GAME":
            query_action_types.append("PLAY")
        elif action_type == "PLAY":
            query_action_types.append("PLAY_GAME")

        missions = self.db.query(Mission).filter(
            or_(
                Mission.action_type.in_(query_action_types), 
                Mission.logic_key == action_type
            ),
            Mission.is_active == True
        ).all()

        updated_list = []

        now_tz = self._now_tz()

        # Play streak sync is tied to actual game play actions.
        if action_type in ["PLAY_GAME", "PLAY"] and delta > 0:
            try:
                self.sync_play_streak(user_id=user_id, now_tz=now_tz)
            except Exception:
                # Do not block mission progress updates if streak sync fails.
                pass

        for mission in missions:
            if self._is_golden_hour_mission(mission) and not self.settings.golden_hour_enabled:
                continue
            if not self._within_time_window(mission, now_tz):
                continue
            reset_date = self.get_reset_date_str(mission.category)

            progress = self.db.query(UserMissionProgress).filter(
                UserMissionProgress.user_id == user_id,
                UserMissionProgress.mission_id == mission.id,
                UserMissionProgress.reset_date == reset_date
            ).first()

            if not progress:
                progress = UserMissionProgress(
                    user_id=user_id,
                    mission_id=mission.id,
                    current_value=0,
                    reset_date=reset_date
                )
                self.db.add(progress)

            if not progress.is_completed:
                progress.current_value += delta

                # Check completion
                if progress.current_value >= mission.target_value:
                    progress.current_value = mission.target_value
                    progress.is_completed = True
                    progress.completed_at = datetime.utcnow()

                    # Auto-claim flow for eligible missions
                    # [Security] Do not auto-claim if manual approval is required.
                    if mission.auto_claim and not mission.requires_approval:
                        try:
                            self.claim_reward(user_id, mission.id)
                        except Exception:
                            # Do not block progress commit
                            pass

                # [Nudge] Intelligent Trigger: 1 step remaining
                elif progress.current_value == mission.target_value - 1 and mission.target_value >= 3:
                     # Check if user has telegram_id
                     if progress.user and progress.user.telegram_id:
                         try:
                             from app.services.notification_service import NotificationService
                             NotificationService().send_nudge_sync(
                                 chat_id=progress.user.telegram_id,
                                 mission_title=mission.title,
                                 remaining=1
                             )
                         except Exception as e:
                             # Fail silently for nudge; do not block game progress
                             pass

                updated_list.append(progress)

        self.db.commit()
        # Refresh all updated (optional, careful with performance if many)
        for p in updated_list:
            self.db.refresh(p)

        return updated_list

    def claim_reward(self, user_id: int, mission_id: int) -> Tuple[bool, str, int]:
        """
        Claim reward for a completed mission.
        Returns (Success, RewardType, Amount).
        """
        mission = self.db.query(Mission).filter(Mission.id == mission_id).first()
        if not mission:
            return False, "Mission not found", 0

        if self._is_golden_hour_mission(mission) and not self.settings.golden_hour_enabled:
            return False, "Mission disabled by feature flag", 0

        now_tz = self._now_tz()
        if not self._within_time_window(mission, now_tz):
            return False, "Mission not in active time window", 0

        reset_date = self.get_reset_date_str(mission.category)
        progress = self.db.query(UserMissionProgress).filter(
            UserMissionProgress.user_id == user_id,
            UserMissionProgress.mission_id == mission_id,
            UserMissionProgress.reset_date == reset_date
        ).with_for_update().first()

        if not progress or not progress.is_completed:
            return False, "Mission not completed", 0

        # [Security] Approval Check
        if mission.requires_approval:
            # Assuming 'APPROVED' is the string value for MissionApprovalStatus.APPROVED
            if str(progress.approval_status) != "APPROVED":
                 return False, "Approval Pending", 0

        if progress.is_claimed:
            return False, "Already claimed", 0

        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            return False, "User not found", 0

        # [REFACTORED V3] Unified Reward Delivery via RewardService
        # All rewards (including XP) are routed through RewardService.deliver with commit=False.
        
        target_reward_type = None
        target_amount = mission.reward_amount
        
        # 1. Map MissionRewardType to RewardService Types
        if mission.reward_type == MissionRewardType.CASH_UNLOCK:
             target_reward_type = "POINT" # Vault Accrual
        elif mission.reward_type == MissionRewardType.DIAMOND:
             target_reward_type = "DIAMOND"
        elif mission.reward_type == MissionRewardType.GOLD_KEY:
             target_reward_type = "GOLD_KEY"
        elif mission.reward_type == MissionRewardType.DIAMOND_KEY:
             target_reward_type = "DIAMOND_KEY"
        elif mission.reward_type == MissionRewardType.TICKET_BUNDLE:
             target_reward_type = "TICKET_BUNDLE"
        elif mission.reward_type == MissionRewardType.TICKET_ROULETTE:
             target_reward_type = "TICKET_ROULETTE"
        elif mission.reward_type == MissionRewardType.TICKET_DICE:
             target_reward_type = "TICKET_DICE"
        elif mission.reward_type == MissionRewardType.TICKET_LOTTERY:
             target_reward_type = "TICKET_LOTTERY"
        elif mission.reward_type == MissionRewardType.POINT:
             target_reward_type = "POINT"

        # 2. Deliver Main Asset Reward
        if target_reward_type and target_amount > 0:
             from app.services.reward_service import RewardService
             RewardService().deliver(
                  self.db,
                  user_id=user_id,
                  reward_type=target_reward_type,
                  reward_amount=target_amount,
                  meta={
                      "reason": "MISSION_REWARD",
                      "mission_id": mission_id,
                      "mission_title": mission.title
                  },
                  commit=False
             )

        # 3. Deliver XP Reward (if any)
        if mission.xp_reward > 0:
             from app.services.reward_service import RewardService
             RewardService().deliver(
                  self.db,
                  user_id=user_id,
                  reward_type="GAME_XP",
                  reward_amount=mission.xp_reward,
                  meta={"reason": "MISSION_REWARD_XP", "mission_id": mission_id},
                  commit=False
             )

        progress.is_claimed = True
        self.db.commit()

        # [Grinder Rule] Check All Clear
        try:
            self.check_all_daily_completed(user_id)
        except Exception:
            pass

        return True, mission.reward_type, target_amount

    
    def ensure_login_progress(self, user_id: int):
        """
        Ensures the user has the correct login mission progress.
        Typically called on login or user creation.
        For NEW_USER_LOGIN_DAY2, it should be 1 on Day 1, and 2 on Day 2+.
        """
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            return

        from app.models.mission import Mission, MissionCategory, UserMissionProgress
        missions = self.db.query(Mission).filter(
            Mission.action_type == "LOGIN",
            Mission.is_active == True
        ).all()

        now_tz = self._now_tz()
        
        for mission in missions:
            reset_date = self.get_reset_date_str(mission.category)
            
            # For Daily missions, we just use standard update_progress(delta=1) logic elsewhere,
            # but for NEW_USER missions, we want to ensure they aren't stuck.
            if mission.category == MissionCategory.NEW_USER:
                progress = self.db.query(UserMissionProgress).filter(
                    UserMissionProgress.user_id == user_id,
                    UserMissionProgress.mission_id == mission.id,
                    UserMissionProgress.reset_date == reset_date
                ).first()

                if not progress:
                    progress = UserMissionProgress(
                        user_id=user_id,
                        mission_id=mission.id,
                        current_value=1, # Day 1
                        reset_date=reset_date
                    )
                    self.db.add(progress)
                else:
                    # If it exists, check if we should increment based on time difference
                    # If joined on Day A, and now is Day B (B > A), and current_value < 2, set to 2.
                    if not progress.is_completed and progress.current_value < mission.target_value:
                        # Simple logic: if user.first_login_at exists and it's a different day, it's Day 2.
                        if user.first_login_at:
                            kst = ZoneInfo("Asia/Seoul")
                            first_kst = user.first_login_at.replace(tzinfo=timezone.utc).astimezone(kst).date()
                            now_kst = now_tz.date()
                            if now_kst > first_kst:
                                progress.current_value = mission.target_value # Reach 2
                                progress.is_completed = True
                                progress.completed_at = datetime.utcnow()
                                if mission.auto_claim:
                                    try: self.claim_reward(user_id, mission.id)
                                    except: pass

            elif mission.category == MissionCategory.DAILY:
                # For Daily missions, just ensure it exists for today if not already
                self.update_progress(user_id, "LOGIN", delta=1)

        self.db.commit()

    def claim_daily_gift(self, user_id: int) -> Tuple[bool, str, int]:
        """
        Special logic for 'Daily Login Gift'.
        Prioritizes 'daily_login_gift' (Admin set), falls back to 'daily_gift' (Legacy code).
        """
        from app.models.mission import Mission, MissionCategory, MissionRewardType
        # 1. Try to find the Admin-configured mission first
        mission = self.db.query(Mission).filter(Mission.logic_key == "daily_login_gift").first()
        
        # 2. If not found, look for legacy code-defined mission
        if not mission:
             mission = self.db.query(Mission).filter(Mission.logic_key == "daily_gift").first()

        # 3. If neither exists, create legacy default (Safety fallback)
        if not mission:
            mission = Mission(
                title="일일 출석 선물",
                description="매일 접속 시 드리는 선물입니다.",
                category=MissionCategory.DAILY,
                logic_key="daily_login_gift", # Create with the new standard key
                action_type="LOGIN", # Standard action
                target_value=1,
                reward_type=MissionRewardType.DIAMOND,
                reward_amount=1, # Default to 1 based on screenshot
                is_active=True
            )
            self.db.add(mission)
            self.db.commit()
            self.db.refresh(mission)

        # 2. Update progress to 1 (since they are calling this, they are logged in)
        # Fix: Ensure we update progress using the ACTUAL logic_key found
        self.update_progress(user_id, mission.logic_key, delta=1)

        # 3. Try to claim
        return self.claim_reward(user_id, mission.id)

    def check_all_daily_completed(self, user_id: int) -> bool:
        """Grinder Rule: Check if all daily missions are completed and grant team battle bonus."""
        from app.services.team_battle_service import TeamBattleService
        from app.models.mission import Mission, UserMissionProgress as UserMission, MissionCategory
        from app.models.team_battle import TeamEventLog
        from sqlalchemy import select

        now_kst = self._now_tz()
        today = self._operational_play_date(now_kst)
        
        tsvc = TeamBattleService()
        # Use TeamBattleService's day definition for consistency
        start, end = tsvc._day_bounds_for_date(today)
        
        # 1. Check if already rewarded today
        existing_log = self.db.execute(
            select(TeamEventLog).where(
                TeamEventLog.user_id == user_id,
                TeamEventLog.action == "MISSION_ALL_CLEAR",
                TeamEventLog.created_at >= start,
                TeamEventLog.created_at < end
            )
        ).scalar_one_or_none()
        
        if existing_log:
            return True
            
        # 2. Count Active Daily Missions
        total_daily = self.db.query(Mission).filter(
            Mission.category == MissionCategory.DAILY,
            Mission.is_active == True
        ).count()
        
        if total_daily == 0:
            return False
            
        # 3. Count Completed (reset_date must match today, or is_completed=True)
        # However, UserMission reset_date is critical.
        completed_daily = self.db.query(UserMission).join(Mission).filter(
            UserMission.user_id == user_id,
            Mission.category == MissionCategory.DAILY,
            Mission.is_active == True,
            UserMission.is_completed == True,
            UserMission.reset_date == today.isoformat()
        ).count()
        
        if completed_daily >= total_daily:
            # Grant Reward
            member = tsvc.get_membership(self.db, user_id)
            if member:
                points = self.settings.team_battle_all_clear_bonus
                tsvc.add_points(
                    self.db,
                    team_id=member.team_id,
                    delta=points,
                    action="MISSION_ALL_CLEAR",
                    user_id=user_id,
                    season_id=None,
                    meta={"date": today.isoformat()},
                    enforce_usage=False
                )
            return True
        return False


