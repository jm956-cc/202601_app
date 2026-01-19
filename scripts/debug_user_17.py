import sys
import os
sys.path.append(os.getcwd())

from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.user import User
from app.models.dice import DiceLog
from app.models.roulette import RouletteLog
from app.models.lottery import LotteryLog
from app.models.mission import UserMissionProgress, Mission
from datetime import datetime, timedelta

def analyze_user_activity(user_id: int):
    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            print(f"User {user_id} not found.")
            return

        print(f"=== User {user.id} ({user.nickname}) State ===")
        print(f"Play Streak: {user.play_streak}")
        print(f"Last Play Date: {user.last_play_date}")
        print(f"Total Charge: {user.total_charge_amount}")
        print("-" * 30)

        # Recent Gameplay (Last 48h)
        since = datetime.utcnow() - timedelta(hours=48)
        
        dice_logs = db.query(DiceLog).filter(DiceLog.user_id == user_id, DiceLog.created_at >= since).all()
        roulette_logs = db.query(RouletteLog).filter(RouletteLog.user_id == user_id, RouletteLog.created_at >= since).all()
        lottery_logs = db.query(LotteryLog).filter(LotteryLog.user_id == user_id, LotteryLog.created_at >= since).all()

        combined_logs = []
        for l in dice_logs: combined_logs.append({"time": l.created_at, "type": "DICE", "outcome": l.result})
        for l in roulette_logs: combined_logs.append({"time": l.created_at, "type": "ROULETTE", "outcome": f"{l.reward_type}:{l.reward_amount}"})
        for l in lottery_logs: combined_logs.append({"time": l.created_at, "type": "LOTTERY", "outcome": f"{l.reward_type}:{l.reward_amount}"})

        combined_logs.sort(key=lambda x: x["time"], reverse=True)

        print(f"=== Recent Gameplay (Last 48h) - Count: {len(combined_logs)} ===")
        for log in combined_logs:
            # Convert UTC to KST roughly for display
            kst_time = log["time"] + timedelta(hours=9)
            print(f"[{kst_time.strftime('%Y-%m-%d %H:%M:%S')} KST] {log['type']} - {log['outcome']}")

        # Mission Progress
        print("-" * 30)
        print("=== Mission Progress (Active) ===")
        missions = db.query(UserMissionProgress).filter(
            UserMissionProgress.user_id == user_id
        ).all()
        
        for mp in missions:
            m = db.query(Mission).filter(Mission.id == mp.mission_id).first()
            if m:
                print(f"Mission: {m.title} (ID: {m.id}, Cat: {m.category})")
                print(f"  Reset Date: {mp.reset_date}")
                print(f"  Current: {mp.current_value} / {m.target_value}")
                print(f"  Completed: {mp.is_completed}, Claimed: {mp.is_claimed}")
                print(f"  Updated At: {mp.updated_at}")
    
    finally:
        db.close()

if __name__ == "__main__":
    analyze_user_activity(17)
