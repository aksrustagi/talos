"""
Talos Workflows — Optional Temporal-based durable execution layer.

When TALOS_ENABLE_TEMPORAL=true, pipeline processing runs as durable Temporal
workflows with built-in retry, timeout, and signal-based approval support.

When disabled (default), the existing direct async pipeline is used unchanged.
"""
