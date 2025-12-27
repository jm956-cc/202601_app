
import pytest
from sqlalchemy.orm import Session
from datetime import date, datetime

from app.models.user import User
from app.models.season_pass import SeasonPassConfig, SeasonPassLevel, SeasonPassProgress, SeasonPassRewardLog
from app.models.game_wallet import GameTokenType, UserGameWallet
from app.services.reward_service import RewardService
from app.services.season_pass_service import SeasonPassService
from app.core.config import get_settings

def test_bait_and_trap_logic(session_factory):
    db: Session = session_factory()
    
    # 1. Setup: Enable XP from game reward in settings
    settings = get_settings()
    original_xp_flag = settings.xp_from_game_reward
    settings.xp_from_game_reward = True

    try:
        # 2. Setup: Create test user
        user = User(id=10, external_id="trap-user", cash_balance=0)
        db.add(user)
        db.flush()

        # 3. Setup: Create active season and levels
        season = SeasonPassConfig(
            id=3,
            season_name="Bait & Trap Season",
            start_date=date(2025, 12, 1),
            end_date=date(2025, 12, 31),
            max_level=10,
            base_xp_per_stamp=50,
            is_active=True
        )
        db.add(season)
        db.flush()

        # Level 2: 100 XP -> TICKET_DICE (Auto)
        lv2 = SeasonPassLevel(
            season_id=season.id,
            level=2,
            required_xp=100,
            reward_type="TICKET_DICE",
            reward_amount=1,
            auto_claim=True
        )
        # Level 9: 20000 XP -> POINT (Manual)
        lv9 = SeasonPassLevel(
            season_id=season.id,
            level=9,
            required_xp=20000,
            reward_type="POINT",
            reward_amount=20000,
            auto_claim=False
        )
        db.add(lv2)
        db.add(lv9)
        db.flush()

        reward_service = RewardService()
        
        # --- SCENARIO 1: Game win grants POINT reward ---
        # User wins 500 POINT in dice. 
        # Expected: cash_balance stays 0, XP increases by 500.
        reward_service.deliver(
            db, 
            user_id=user.id, 
            reward_type="POINT", 
            reward_amount=500, 
            meta={"reason": "dice_play", "game_xp": 3}
        )
        db.flush()

        # Check XP and Cash
        db.refresh(user)
        progress = db.query(SeasonPassProgress).filter_by(user_id=user.id, season_id=season.id).one()
        
        assert user.cash_balance == 0, "Game point reward should NOT increase cash_balance"
        assert progress.current_xp == 503, "XP should be reward_amount (500) + basic game_xp (3)"
        assert progress.current_level >= 2, "User should have leveled up automatically"

        # Check Ticket Reward (Lv 2 Auto Claim)
        wallet = db.query(UserGameWallet).filter_by(user_id=user.id, token_type=GameTokenType.DICE_TOKEN).one_or_none()
        assert wallet is not None, "Auto-claim reward (ticket) should create a wallet entry"
        assert wallet.balance == 1, "Auto-claim reward should grant the ticket amount"

        # --- SCENARIO 2: Reaching Manual Payout Level ---
        # Grant enough XP to reach Level 9 (Manual POINT)
        # Expected: RewardLog created, but RewardService.deliver (cash) NOT called automatically.
        season_pass = SeasonPassService()
        season_pass.add_bonus_xp(db, user_id=user.id, xp_amount=20000)
        db.flush()

        db.refresh(user)
        progress = db.query(SeasonPassProgress).filter_by(user_id=user.id, season_id=season_id=season.id).one()
        assert progress.current_level >= 9
        
        reward_log = db.query(SeasonPassRewardLog).filter_by(user_id=user.id, level=9).one_or_none()
        assert reward_log is None or reward_log.claimed_at is None, "Manual reward should NOT be auto-claimed"
        assert user.cash_balance == 0, "Manual payout reward should NOT increase cash balance automatically"

    finally:
        # Restore settings
        settings.xp_from_game_reward = original_xp_flag
