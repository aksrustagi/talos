"""
Talos AI — Configuration

Application settings, client configs, and model assignments.
"""

try:
    from config.settings import Settings, get_settings
except ImportError:
    Settings = None
    get_settings = None

__all__ = ["Settings", "get_settings"]
