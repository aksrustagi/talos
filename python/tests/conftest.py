"""Shared test fixtures."""

import os
import sys
import tempfile

import pytest

# Ensure the python/ directory is on the path so imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def tmp_audit_db(tmp_path):
    """Provide a temporary SQLite audit database path."""
    return str(tmp_path / "test_audit.db")
