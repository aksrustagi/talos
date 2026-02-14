"""
Talos Config — loads from .env, provides global settings.
"""
import os
import threading
from enum import Enum
from pydantic import BaseModel, field_validator

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


class ClientType(str, Enum):
    UNIVERSITY = "university"
    NYPA = "nypa"
    NORTHWELL = "northwell"


class Config(BaseModel):
    client_type: ClientType = ClientType.UNIVERSITY
    openrouter_api_key: str = ""
    db_path: str = "talos.db"
    log_level: str = "INFO"

    # Model tiers
    model_cheap: str = "deepseek/deepseek-chat-v3-0324:floor"
    model_smart: str = "anthropic/claude-sonnet-4"
    model_genius: str = "anthropic/claude-opus-4"

    # Notification hooks
    slack_webhook_url: str = ""
    notification_email: str = ""

    # Conversational mode
    enable_chat: bool = True

    # Security
    api_keys: list[str] = []  # Allowed API keys for auth; empty = no auth required
    cors_origins: list[str] = []  # Allowed CORS origins; empty = localhost only in prod
    rate_limit_rpm: int = 60  # Max requests per minute per key

    # Business
    revenue_share_pct: float = 0.33  # Talos share of verified savings (33%)
    max_llm_cost_per_pipeline: float = 5.0  # Circuit breaker: max $ per pipeline

    # Structured logging
    log_format: str = "text"  # "text" or "json"

    # SMTP for email notifications
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    # Temporal workflow orchestration (optional)
    enable_temporal: bool = False
    temporal_address: str = "localhost:7233"
    temporal_namespace: str = "default"
    temporal_task_queue: str = "talos-pipeline"

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        valid = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper = v.upper()
        if upper not in valid:
            return "INFO"
        return upper

    @classmethod
    def from_env(cls) -> "Config":
        api_keys_raw = os.getenv("TALOS_API_KEYS", "")
        api_keys = [k.strip() for k in api_keys_raw.split(",") if k.strip()]

        cors_raw = os.getenv("TALOS_CORS_ORIGINS", "")
        cors_origins = [o.strip() for o in cors_raw.split(",") if o.strip()]

        return cls(
            client_type=os.getenv("TALOS_CLIENT", "university"),
            openrouter_api_key=os.getenv("OPENROUTER_API_KEY", ""),
            db_path=os.getenv("TALOS_DB", "talos.db"),
            log_level=os.getenv("TALOS_LOG_LEVEL", "INFO"),
            model_cheap=os.getenv("TALOS_MODEL_CHEAP", "deepseek/deepseek-chat-v3-0324:floor"),
            model_smart=os.getenv("TALOS_MODEL_SMART", "anthropic/claude-sonnet-4"),
            model_genius=os.getenv("TALOS_MODEL_GENIUS", "anthropic/claude-opus-4"),
            slack_webhook_url=os.getenv("TALOS_SLACK_WEBHOOK", ""),
            notification_email=os.getenv("TALOS_NOTIFY_EMAIL", ""),
            api_keys=api_keys,
            cors_origins=cors_origins,
            rate_limit_rpm=int(os.getenv("TALOS_RATE_LIMIT_RPM", "60")),
            revenue_share_pct=float(os.getenv("TALOS_REVENUE_SHARE_PCT", "0.33")),
            max_llm_cost_per_pipeline=float(os.getenv("TALOS_MAX_LLM_COST_PER_PIPELINE", "5.0")),
            log_format=os.getenv("TALOS_LOG_FORMAT", "text"),
            smtp_host=os.getenv("TALOS_SMTP_HOST", ""),
            smtp_port=int(os.getenv("TALOS_SMTP_PORT", "587")),
            smtp_user=os.getenv("TALOS_SMTP_USER", ""),
            smtp_password=os.getenv("TALOS_SMTP_PASSWORD", ""),
            smtp_from=os.getenv("TALOS_SMTP_FROM", ""),
            enable_temporal=os.getenv("TALOS_ENABLE_TEMPORAL", "").lower() in ("1", "true", "yes"),
            temporal_address=os.getenv("TALOS_TEMPORAL_ADDRESS", "localhost:7233"),
            temporal_namespace=os.getenv("TALOS_TEMPORAL_NAMESPACE", "default"),
            temporal_task_queue=os.getenv("TALOS_TEMPORAL_TASK_QUEUE", "talos-pipeline"),
        )

    def get_model(self, tier: str) -> str:
        mapping = {"cheap": self.model_cheap, "smart": self.model_smart, "genius": self.model_genius}
        if tier not in mapping:
            raise ValueError(f"Unknown model tier: {tier!r}. Must be one of: {list(mapping)}")
        return mapping[tier]


# Thread-safe singleton
_cfg: Config | None = None
_cfg_lock = threading.Lock()


def get_config() -> Config:
    global _cfg
    if _cfg is None:
        with _cfg_lock:
            if _cfg is None:
                _cfg = Config.from_env()
    return _cfg


def reset_config():
    """Reset singleton for testing."""
    global _cfg
    with _cfg_lock:
        _cfg = None
