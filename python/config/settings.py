"""
Talos AI — Application Settings

Centralized configuration using Pydantic BaseSettings.
Reads from environment variables and .env files.
"""

from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # --- LLM Configuration ---
    llm_provider: str = Field(default="openrouter", description="LLM provider: openrouter or bedrock")
    openrouter_api_key: str = Field(default="", description="OpenRouter API key")
    aws_region: str = Field(default="us-east-1", description="AWS region for Bedrock")

    # --- Temporal Configuration ---
    temporal_address: str = Field(default="localhost:7233", description="Temporal server address")
    temporal_namespace: str = Field(default="default", description="Temporal namespace")
    temporal_task_queue: str = Field(default="talos-procurement", description="Primary task queue")
    temporal_heavy_queue: str = Field(default="talos-heavy", description="Heavy/genius task queue")

    # --- Procurement Platform ---
    procurement_platform: str = Field(default="jaggaer", description="Active procurement platform")
    procurement_base_url: str = Field(default="", description="Procurement platform base URL")
    procurement_api_key: Optional[str] = Field(default=None, description="Procurement platform API key")
    procurement_client_id: Optional[str] = Field(default=None, description="OAuth client ID")
    procurement_client_secret: Optional[str] = Field(default=None, description="OAuth client secret")
    procurement_tenant_id: Optional[str] = Field(default=None, description="Platform tenant ID")
    procurement_environment: str = Field(default="production", description="Platform environment")

    # --- Client Mode ---
    client_mode: str = Field(default="university", description="Client type: university, nypa, northwell")
    client_name: str = Field(default="", description="Client organization name")

    # --- API Configuration ---
    api_host: str = Field(default="0.0.0.0", description="API server host")
    api_port: int = Field(default=8000, description="API server port")
    api_debug: bool = Field(default=False, description="Enable debug mode")

    # --- Database ---
    database_url: str = Field(default="", description="Database connection URL")

    # --- Notifications ---
    slack_webhook_url: Optional[str] = Field(default=None, description="Slack webhook for notifications")
    sendgrid_api_key: Optional[str] = Field(default=None, description="SendGrid API key for email")
    email_from: str = Field(default="procurement@talos.ai", description="From address for emails")

    # --- Logging ---
    log_level: str = Field(default="INFO", description="Logging level")

    model_config = {
        "env_prefix": "",
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
