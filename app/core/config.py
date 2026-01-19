"""Application configuration settings."""

from datetime import date
from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Base application settings loaded from environment variables."""

    # Required settings
    database_url: str = Field(..., validation_alias=AliasChoices("DATABASE_URL", "database_url"))
    jwt_secret: str = Field(..., validation_alias=AliasChoices("JWT_SECRET", "jwt_secret"))

    # Optional settings with defaults
    jwt_algorithm: str = Field("HS256", validation_alias=AliasChoices("JWT_ALGORITHM", "jwt_algorithm"))
    jwt_expire_minutes: int = Field(1440, validation_alias=AliasChoices("JWT_EXPIRE_MINUTES", "jwt_expire_minutes"))
    env: str = Field("local", validation_alias=AliasChoices("ENV", "env"))
    cors_origins: list[str] = Field(default_factory=list, validation_alias=AliasChoices("CORS_ORIGINS", "cors_origins"))
    log_level: str = Field("INFO", validation_alias=AliasChoices("LOG_LEVEL", "log_level"))
    timezone: str = Field("Asia/Seoul", validation_alias=AliasChoices("TIMEZONE", "timezone"))

    # Test mode: bypasses feature_schedule validation (all games accessible)
    test_mode: bool = Field(False, validation_alias=AliasChoices("TEST_MODE", "test_mode"))

    # MySQL credentials (used by Docker Compose)
    mysql_root_password: str | None = Field(None, validation_alias=AliasChoices("MYSQL_ROOT_PASSWORD", "mysql_root_password"))
    mysql_database: str | None = Field(None, validation_alias=AliasChoices("MYSQL_DATABASE", "mysql_database"))
    mysql_user: str | None = Field(None, validation_alias=AliasChoices("MYSQL_USER", "mysql_user"))
    mysql_password: str | None = Field(None, validation_alias=AliasChoices("MYSQL_PASSWORD", "mysql_password"))

    # Feature flags
    xp_from_game_reward: bool = Field(False, validation_alias=AliasChoices("XP_FROM_GAME_REWARD", "xp_from_game_reward"))
    feature_gate_enabled: bool = Field(
        False, validation_alias=AliasChoices("FEATURE_GATE_ENABLED", "feature_gate_enabled")
    )
    golden_hour_enabled: bool = Field(
        False,
        validation_alias=AliasChoices(
            "GOLDEN_HOUR_ENABLED",
            "golden_hour_enabled",
        ),
    )
    golden_hour_claim_rate_rps: int = Field(
        1000,
        validation_alias=AliasChoices(
            "GOLDEN_HOUR_CLAIM_RATE_RPS",
            "golden_hour_claim_rate_rps",
        ),
    )
    golden_hour_claim_rate_burst: int = Field(
        2000,
        validation_alias=AliasChoices(
            "GOLDEN_HOUR_CLAIM_RATE_BURST",
            "golden_hour_claim_rate_burst",
        ),
    )
    golden_hour_idempotency_ttl_sec: int = Field(
        600,
        validation_alias=AliasChoices(
            "GOLDEN_HOUR_IDEMPOTENCY_TTL_SEC",
            "golden_hour_idempotency_ttl_sec",
        ),
    )

    # Streak multiplier event (mission reward multiplier based on play streak)
    streak_multiplier_enabled: bool = Field(
        False,
        validation_alias=AliasChoices(
            "STREAK_MULTIPLIER_ENABLED",
            "streak_multiplier_enabled",
        ),
    )
    streak_day_reset_hour_kst: int = Field(
        9,
        validation_alias=AliasChoices(
            "STREAK_DAY_RESET_HOUR_KST",
            "streak_day_reset_hour_kst",
        ),
    )
    streak_hot_threshold_days: int = Field(
        3,
        validation_alias=AliasChoices(
            "STREAK_HOT_THRESHOLD_DAYS",
            "streak_hot_threshold_days",
        ),
    )
    streak_legend_threshold_days: int = Field(
        7,
        validation_alias=AliasChoices(
            "STREAK_LEGEND_THRESHOLD_DAYS",
            "streak_legend_threshold_days",
        ),
    )
    streak_hot_multiplier: float = Field(
        1.2,
        validation_alias=AliasChoices(
            "STREAK_HOT_MULTIPLIER",
            "streak_hot_multiplier",
        ),
    )
    streak_legend_multiplier: float = Field(
        1.5,
        validation_alias=AliasChoices(
            "STREAK_LEGEND_MULTIPLIER",
            "streak_legend_multiplier",
        ),
    )

    # Streak vault bonus (vault accrual multiplier based on play streak)
    # Default OFF for safe rollout.
    streak_vault_bonus_enabled: bool = Field(
        False,
        validation_alias=AliasChoices(
            "STREAK_VAULT_BONUS_ENABLED",
            "streak_vault_bonus_enabled",
        ),
    )

    # Streak ticket bonus (Day4~5 ticket grants based on play streak)
    # Default OFF for safe rollout.
    streak_ticket_bonus_enabled: bool = Field(
        False,
        validation_alias=AliasChoices(
            "STREAK_TICKET_BONUS_ENABLED",
            "streak_ticket_bonus_enabled",
        ),
    )

    # Streak milestone rewards (Day3/Day7 auto grants based on play streak)
    # Default OFF for safe rollout.
    streak_milestone_rewards_enabled: bool = Field(
        False,
        validation_alias=AliasChoices(
            "STREAK_MILESTONE_REWARDS_ENABLED",
            "streak_milestone_rewards_enabled",
        ),
    )

    # Golden / ch25 internal stream (ticket-value based)
    ch25_internal_stream_enabled: bool = Field(
        True,
        validation_alias=AliasChoices(
            "CH25_INTERNAL_STREAM_ENABLED",
            "ch25_internal_stream_enabled",
        ),
    )
    roulette_bet_value: int = Field(
        1000,
        validation_alias=AliasChoices(
            "ROULETTE_BET_VALUE",
            "roulette_bet_value",
        ),
    )
    dice_bet_value: int = Field(
        1000,
        validation_alias=AliasChoices(
            "DICE_BET_VALUE",
            "dice_bet_value",
        ),
    )
    lottery_bet_value: int = Field(
        2000,
        validation_alias=AliasChoices(
            "LOTTERY_BET_VALUE",
            "lottery_bet_value",
        ),
    )
    ticket_reward_min: int = Field(
        2000,
        validation_alias=AliasChoices(
            "TICKET_REWARD_MIN",
            "ticket_reward_min",
        ),
    )

    # Golden intervention feature flags
    ch25_intervention_enabled: bool = Field(
        False,
        validation_alias=AliasChoices(
            "CH25_INTERVENTION_ENABLED",
            "ch25_intervention_enabled",
        ),
    )
    ch25_intervention_rollout_pct: int = Field(
        100,
        validation_alias=AliasChoices(
            "CH25_INTERVENTION_ROLLOUT_PCT",
            "ch25_intervention_rollout_pct",
        ),
    )
    ch25_intervention_seed: str = Field(
        "golden_v1",
        validation_alias=AliasChoices(
            "CH25_INTERVENTION_SEED",
            "ch25_intervention_seed",
        ),
    )

    # DDA controls
    ch25_dda_enabled: bool = Field(
        False,
        validation_alias=AliasChoices(
            "CH25_DDA_ENABLED",
            "ch25_dda_enabled",
        ),
    )
    ch25_dda_loss_streak_threshold: int = Field(
        5,
        validation_alias=AliasChoices(
            "CH25_DDA_LOSS_STREAK_THRESHOLD",
            "ch25_dda_loss_streak_threshold",
        ),
    )
    ch25_dda_win_boost: float = Field(
        0.05,
        validation_alias=AliasChoices(
            "CH25_DDA_WIN_BOOST",
            "ch25_dda_win_boost",
        ),
    )
    ch25_dda_max_consecutive: int = Field(
        3,
        validation_alias=AliasChoices(
            "CH25_DDA_MAX_CONSECUTIVE",
            "ch25_dda_max_consecutive",
        ),
    )

    # Admin-only destructive operations (dangerous).
    # Keep disabled by default; enable explicitly in controlled environments.
    allow_admin_user_purge: bool = Field(
        False,
        validation_alias=AliasChoices(
            "ALLOW_ADMIN_USER_PURGE",
            "allow_admin_user_purge",
        ),
    )

    # Time sync / NTP sanity
    ntp_allowed_drift_ms: int = Field(
        1000,
        validation_alias=AliasChoices(
            "NTP_ALLOWED_DRIFT_MS",
            "ntp_allowed_drift_ms",
        ),
    )
    ntp_check_timeout: float = Field(
        1.5,
        validation_alias=AliasChoices(
            "NTP_CHECK_TIMEOUT",
            "ntp_check_timeout",
        ),
    )
    ntp_providers: list[str] = Field(
        default_factory=lambda: [
            "https://worldtimeapi.org/api/timezone/Asia/Seoul",
            "https://timeapi.io/api/Time/current/zone?timeZone=Asia/Seoul",
        ],
        validation_alias=AliasChoices(
            "NTP_PROVIDERS",
            "ntp_providers",
        ),
    )

    # External ranking anti-abuse (deposit -> XP)
    external_ranking_deposit_step_amount: int = Field(
        100_000, validation_alias=AliasChoices("EXTERNAL_RANKING_DEPOSIT_STEP_AMOUNT", "external_ranking_deposit_step_amount")
    )
    external_ranking_deposit_xp_per_step: int = Field(
        20, validation_alias=AliasChoices("EXTERNAL_RANKING_DEPOSIT_XP_PER_STEP", "external_ranking_deposit_xp_per_step")
    )
    external_ranking_deposit_max_steps_per_day: int = Field(
        50, validation_alias=AliasChoices("EXTERNAL_RANKING_DEPOSIT_MAX_STEPS_PER_DAY", "external_ranking_deposit_max_steps_per_day")
    )
    external_ranking_deposit_cooldown_minutes: int = Field(
        0, validation_alias=AliasChoices("EXTERNAL_RANKING_DEPOSIT_COOLDOWN_MINUTES", "external_ranking_deposit_cooldown_minutes")
    )

    # Vault event flags
    # Disabled by default so local dev/tests are deterministic.
    vault_accrual_multiplier_enabled: bool = Field(
        False,
        validation_alias=AliasChoices(
            "VAULT_ACCRUAL_MULTIPLIER_ENABLED",
            "vault_accrual_multiplier_enabled",
        ),
    )
    vault_accrual_multiplier_value: float = Field(
        2.0,
        validation_alias=AliasChoices(
            "VAULT_ACCRUAL_MULTIPLIER_VALUE",
            "vault_accrual_multiplier_value",
        ),
    )
    vault_accrual_multiplier_start_kst: date | None = Field(
        None,
        validation_alias=AliasChoices(
            "VAULT_ACCRUAL_MULTIPLIER_START_KST",
            "vault_accrual_multiplier_start_kst",
        ),
    )
    vault_accrual_multiplier_end_kst: date | None = Field(
        None,
        validation_alias=AliasChoices(
            "VAULT_ACCRUAL_MULTIPLIER_END_KST",
            "vault_accrual_multiplier_end_kst",
        ),
    )

    # Trial (ticket-zero) controls
    enable_trial_grant_auto: bool = Field(
        True,
        validation_alias=AliasChoices(
            "ENABLE_TRIAL_GRANT_AUTO",
            "enable_trial_grant_auto",
        ),
    )
    trial_daily_cap: int = Field(
        1,
        validation_alias=AliasChoices(
            "TRIAL_DAILY_CAP",
            "trial_daily_cap",
        ),
    )
    # 0 means "no weekly cap" (keep legacy behavior unless configured).
    trial_weekly_cap: int = Field(
        0,
        validation_alias=AliasChoices(
            "TRIAL_WEEKLY_CAP",
            "trial_weekly_cap",
        ),
    )

    # Optional: probabilistic trial grants after the first-ever grant (funnel split).
    # 1.0 keeps legacy behavior (always grant when eligible).
    trial_grant_prob_after_first: float = Field(
        1.0,
        validation_alias=AliasChoices(
            "TRIAL_GRANT_PROB_AFTER_FIRST",
            "trial_grant_prob_after_first",
        ),
    )
    # If True, the first-ever trial grant is always granted even when prob_after_first is low.
    trial_grant_first_time_guarantee: bool = Field(
        True,
        validation_alias=AliasChoices(
            "TRIAL_GRANT_FIRST_TIME_GUARANTEE",
            "trial_grant_first_time_guarantee",
        ),
    )
    tiered_grant_enabled: bool = Field(
        False,
        validation_alias=AliasChoices(
            "TIERED_GRANT_ENABLED",
            "tiered_grant_enabled",
        ),
    )

    # If enabled, trial rewards can be routed into Vault rather than direct token grants.
    # Default OFF to avoid behavior changes.
    enable_trial_payout_to_vault: bool = Field(
        False,
        validation_alias=AliasChoices(
            "ENABLE_TRIAL_PAYOUT_TO_VAULT",
            "enable_trial_payout_to_vault",
        ),
    )
    # Optional: valuation map for trial rewards (operational tuning).
    trial_reward_valuation: dict[str, int] = Field(
        default_factory=dict,
        validation_alias=AliasChoices(
            "TRIAL_REWARD_VALUATION",
            "trial_reward_valuation",
        ),
    )

    # Vault earn events (game accrual)
    # Default OFF for safe rollout (no behavior change unless explicitly enabled).
    enable_vault_game_earn_events: bool = Field(
        False,
        validation_alias=AliasChoices(
            "ENABLE_VAULT_GAME_EARN_EVENTS",
            "enable_vault_game_earn_events",
        ),
    )

    # Telegram Bot Configuration
    telegram_bot_token: str | None = Field(
        None,
        validation_alias=AliasChoices(
            "TELEGRAM_BOT_TOKEN",
            "telegram_bot_token",
        ),
    )

    telegram_bot_username: str | None = Field(
        None,
        validation_alias=AliasChoices(
            "TELEGRAM_BOT_USERNAME",
            "telegram_bot_username",
        ),
    )

    telegram_webapp_short_name: str | None = Field(
        None,
        validation_alias=AliasChoices(
            "TELEGRAM_WEBAPP_SHORT_NAME",
            "telegram_webapp_short_name",
        ),
    )

    telegram_link_token_expire_minutes: int = Field(
        10,
        validation_alias=AliasChoices(
            "TELEGRAM_LINK_TOKEN_EXPIRE_MINUTES",
            "telegram_link_token_expire_minutes",
        ),
    )

    telegram_mini_app_url: str = Field(
        "http://localhost:3000",
        validation_alias=AliasChoices(
            "TELEGRAM_MINI_APP_URL",
            "telegram_mini_app_url",
        ),
    )

    telegram_channel_username: str | None = Field(
        None,
        validation_alias=AliasChoices(
            "TELEGRAM_CHANNEL_USERNAME",
            "telegram_channel_username",
        ),
    )

    # Redis (Optional - for caching)
    redis_url: str | None = Field(None, validation_alias=AliasChoices("REDIS_URL", "redis_url"))

    # Ops Outbox Worker
    ops_outbox_max_retries: int = Field(
        5,
        validation_alias=AliasChoices("OPS_OUTBOX_MAX_RETRIES", "ops_outbox_max_retries"),
    )
    ops_outbox_backoff_base_seconds: float = Field(
        1.0,
        validation_alias=AliasChoices(
            "OPS_OUTBOX_BACKOFF_BASE_SECONDS",
            "ops_outbox_backoff_base_seconds",
        ),
    )
    ops_outbox_dlq_key: str = Field(
        "ops:outbox:dlq",
        validation_alias=AliasChoices("OPS_OUTBOX_DLQ_KEY", "ops_outbox_dlq_key"),
    )

    # Telegram webhook mode (Optional)
    telegram_use_webhook: bool = Field(
        False,
        validation_alias=AliasChoices(
            "TELEGRAM_USE_WEBHOOK",
            "telegram_use_webhook",
        ),
    )
    telegram_webhook_url: str | None = Field(
        None,
        validation_alias=AliasChoices(
            "TELEGRAM_WEBHOOK_URL",
            "telegram_webhook_url",
        ),
    )
    telegram_webhook_path: str = Field(
        "/telegram/webhook",
        validation_alias=AliasChoices(
            "TELEGRAM_WEBHOOK_PATH",
            "telegram_webhook_path",
        ),
    )
    telegram_webhook_listen: str = Field(
        "0.0.0.0",
        validation_alias=AliasChoices(
            "TELEGRAM_WEBHOOK_LISTEN",
            "telegram_webhook_listen",
        ),
    )
    telegram_webhook_port: int = Field(
        8080,
        validation_alias=AliasChoices(
            "TELEGRAM_WEBHOOK_PORT",
            "telegram_webhook_port",
        ),
    )
    telegram_webhook_secret_token: str | None = Field(
        None,
        validation_alias=AliasChoices(
            "TELEGRAM_WEBHOOK_SECRET_TOKEN",
            "telegram_webhook_secret_token",
        ),
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # Ignore extra fields not defined in the model
    )

    # Team Battle Grinder Rule
    team_battle_points_per_play: int = Field(10, validation_alias=AliasChoices("TEAM_BATTLE_POINTS_PER_PLAY", "team_battle_points_per_play"))
    team_battle_daily_play_cap: int = Field(500, validation_alias=AliasChoices("TEAM_BATTLE_DAILY_PLAY_CAP", "team_battle_daily_play_cap"))
    team_battle_streak_3d_bonus: int = Field(10, validation_alias=AliasChoices("TEAM_BATTLE_STREAK_3D_BONUS", "team_battle_streak_3d_bonus"))
    team_battle_streak_7d_bonus: int = Field(30, validation_alias=AliasChoices("TEAM_BATTLE_STREAK_7D_BONUS", "team_battle_streak_7d_bonus"))
    team_battle_all_clear_bonus: int = Field(50, validation_alias=AliasChoices("TEAM_BATTLE_ALL_CLEAR_BONUS", "team_battle_all_clear_bonus"))


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings instance."""

    return Settings()
