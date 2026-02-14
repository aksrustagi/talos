"""Tests for Talos configuration."""
import os
import pytest
from talos.config import Config, get_config, reset_config, ClientType


class TestConfig:
    def test_default_values(self):
        c = Config()
        assert c.client_type == ClientType.UNIVERSITY
        assert c.model_cheap == "deepseek/deepseek-chat-v3-0324:floor"
        assert c.model_smart == "anthropic/claude-sonnet-4"
        assert c.model_genius == "anthropic/claude-opus-4"
        assert c.rate_limit_rpm == 60

    def test_log_level_validation(self):
        c = Config(log_level="DEBUG")
        assert c.log_level == "DEBUG"

    def test_log_level_invalid_defaults_to_info(self):
        c = Config(log_level="INVALID")
        assert c.log_level == "INFO"

    def test_log_level_case_insensitive(self):
        c = Config(log_level="debug")
        assert c.log_level == "DEBUG"

    def test_get_model_cheap(self):
        c = Config()
        assert c.get_model("cheap") == c.model_cheap

    def test_get_model_smart(self):
        c = Config()
        assert c.get_model("smart") == c.model_smart

    def test_get_model_genius(self):
        c = Config()
        assert c.get_model("genius") == c.model_genius

    def test_get_model_invalid_tier(self):
        c = Config()
        with pytest.raises(ValueError, match="Unknown model tier"):
            c.get_model("nonexistent")

    def test_from_env(self):
        os.environ["TALOS_CLIENT"] = "nypa"
        os.environ["OPENROUTER_API_KEY"] = "test-key"
        reset_config()
        c = Config.from_env()
        assert c.client_type == ClientType.NYPA
        assert c.openrouter_api_key == "test-key"
        os.environ["TALOS_CLIENT"] = "university"

    def test_api_keys_parsing(self):
        os.environ["TALOS_API_KEYS"] = "key1,key2,key3"
        c = Config.from_env()
        assert c.api_keys == ["key1", "key2", "key3"]
        os.environ.pop("TALOS_API_KEYS", None)

    def test_cors_origins_parsing(self):
        os.environ["TALOS_CORS_ORIGINS"] = "http://localhost:3000,http://example.com"
        c = Config.from_env()
        assert len(c.cors_origins) == 2
        os.environ.pop("TALOS_CORS_ORIGINS", None)

    def test_empty_api_keys(self):
        os.environ.pop("TALOS_API_KEYS", None)
        c = Config.from_env()
        assert c.api_keys == []

    def test_smtp_config(self):
        c = Config(smtp_host="smtp.gmail.com", smtp_port=587, smtp_user="user@test.com")
        assert c.smtp_host == "smtp.gmail.com"
        assert c.smtp_port == 587


class TestConfigSingleton:
    def test_singleton_returns_same_instance(self):
        reset_config()
        c1 = get_config()
        c2 = get_config()
        assert c1 is c2

    def test_reset_clears_singleton(self):
        c1 = get_config()
        reset_config()
        c2 = get_config()
        assert c1 is not c2
