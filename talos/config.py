"""
Talos Config — loads from .env, provides global settings.

Game-changing decision #1: MULTI-CLIENT FROM DAY ONE
- Every deployment is client-aware
- Policies, thresholds, vendors auto-configure per client
- No more "Columbia-only" hardcoding
"""
import os
from enum import Enum
from pydantic import BaseModel

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

    # Model tiers — change these to test cost/quality tradeoffs
    model_cheap: str = "deepseek/deepseek-chat-v3-0324:floor"
    model_smart: str = "anthropic/claude-sonnet-4"
    model_genius: str = "anthropic/claude-opus-4"

    # Notification hooks (Decision #7: approval workflows)
    slack_webhook_url: str = ""
    notification_email: str = ""

    # Conversational mode (Decision #2: doanything-style UX)
    enable_chat: bool = True

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            client_type=os.getenv("TALOS_CLIENT", "university"),
            openrouter_api_key=os.getenv("OPENROUTER_API_KEY", ""),
            db_path=os.getenv("TALOS_DB", "talos.db"),
            model_cheap=os.getenv("TALOS_MODEL_CHEAP", "deepseek/deepseek-chat-v3-0324:floor"),
            model_smart=os.getenv("TALOS_MODEL_SMART", "anthropic/claude-sonnet-4"),
            model_genius=os.getenv("TALOS_MODEL_GENIUS", "anthropic/claude-opus-4"),
            slack_webhook_url=os.getenv("TALOS_SLACK_WEBHOOK", ""),
            notification_email=os.getenv("TALOS_NOTIFY_EMAIL", ""),
        )

    def get_model(self, tier: str) -> str:
        return {"cheap": self.model_cheap, "smart": self.model_smart, "genius": self.model_genius}[tier]


# Singleton
_cfg: Config | None = None

def get_config() -> Config:
    global _cfg
    if _cfg is None:
        _cfg = Config.from_env()
    return _cfg
