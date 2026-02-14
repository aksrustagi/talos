"""
Talos AI — Agent Prompt Registry
Imports all agent system prompts and configurations for agents 01 through 23.
"""

from .agent_01_intake import AGENT_01_SYSTEM_PROMPT, AGENT_01_CONFIG
from .agent_02_compliance import AGENT_02_SYSTEM_PROMPT, AGENT_02_CONFIG
from .agent_03_aggregation import AGENT_03_SYSTEM_PROMPT, AGENT_03_CONFIG
from .agent_04_market_intel import AGENT_04_SYSTEM_PROMPT, AGENT_04_CONFIG
from .agent_05_sourcing import AGENT_05_SYSTEM_PROMPT, AGENT_05_CONFIG
from .agent_06_negotiation import AGENT_06_SYSTEM_PROMPT, AGENT_06_CONFIG
from .agent_07_vendor_onboarding import AGENT_07_SYSTEM_PROMPT, AGENT_07_CONFIG
from .agent_08_contract_lifecycle import AGENT_08_SYSTEM_PROMPT, AGENT_08_CONFIG
from .agent_09_approval import AGENT_09_SYSTEM_PROMPT, AGENT_09_CONFIG
from .agent_10_purchase_order import AGENT_10_SYSTEM_PROMPT, AGENT_10_CONFIG
from .agent_11_order_confirmation import AGENT_11_SYSTEM_PROMPT, AGENT_11_CONFIG
from .agent_12_invoice_matching import AGENT_12_SYSTEM_PROMPT, AGENT_12_CONFIG

__all__ = [
    "AGENT_01_SYSTEM_PROMPT",
    "AGENT_01_CONFIG",
    "AGENT_02_SYSTEM_PROMPT",
    "AGENT_02_CONFIG",
    "AGENT_03_SYSTEM_PROMPT",
    "AGENT_03_CONFIG",
    "AGENT_04_SYSTEM_PROMPT",
    "AGENT_04_CONFIG",
    "AGENT_05_SYSTEM_PROMPT",
    "AGENT_05_CONFIG",
    "AGENT_06_SYSTEM_PROMPT",
    "AGENT_06_CONFIG",
    "AGENT_07_SYSTEM_PROMPT",
    "AGENT_07_CONFIG",
    "AGENT_08_SYSTEM_PROMPT",
    "AGENT_08_CONFIG",
    "AGENT_09_SYSTEM_PROMPT",
    "AGENT_09_CONFIG",
    "AGENT_10_SYSTEM_PROMPT",
    "AGENT_10_CONFIG",
    "AGENT_11_SYSTEM_PROMPT",
    "AGENT_11_CONFIG",
    "AGENT_12_SYSTEM_PROMPT",
    "AGENT_12_CONFIG",
]
