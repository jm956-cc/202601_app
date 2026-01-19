"""V2 game status schemas."""
from __future__ import annotations

from typing import Optional

from app.schemas.base import KstBaseModel as BaseModel
from app.v2.schemas.v2_game_action import LotteryPrizeV2, RouletteSegmentV2


class RouletteStatusResponseV2(BaseModel):
    config_id: int
    name: str
    max_daily_spins: int
    today_spins: int
    remaining_spins: int
    token_type: str
    token_balance: int
    segments: list[RouletteSegmentV2]
    feature_type: str


class DiceStatusResponseV2(BaseModel):
    config_id: int
    name: str
    max_daily_plays: int
    today_plays: int
    remaining_plays: int
    token_type: str
    token_balance: int
    feature_type: str
    event_active: bool = False
    event_plays_done: Optional[int] = None
    event_plays_max: Optional[int] = None
    event_ineligible_reason: Optional[str] = None


class LotteryStatusResponseV2(BaseModel):
    config_id: int
    name: str
    max_daily_tickets: int
    today_tickets: int
    remaining_tickets: int
    token_type: str
    token_balance: int
    prize_preview: list[LotteryPrizeV2]
    feature_type: str
    collection_progress: Optional[dict] = None


__all__ = [
    "RouletteStatusResponseV2",
    "DiceStatusResponseV2",
    "LotteryStatusResponseV2",
]