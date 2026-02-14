"""Tests for Talos client policies."""
import pytest
from talos.policies import get_policies, POLICIES


class TestPolicies:
    def test_university_policies(self):
        p = get_policies("university")
        assert p["name"] == "Ivy League University"
        assert "2 CFR 200" in p["regulations"]
        assert p["competitive_bid_threshold"] == 100000

    def test_nypa_policies(self):
        p = get_policies("nypa")
        assert p["name"] == "New York Power Authority"
        assert "NY State Finance Law" in p["regulations"]
        assert p["competitive_bid_threshold"] == 50000

    def test_northwell_policies(self):
        p = get_policies("northwell")
        assert p["name"] == "Northwell Health System"
        assert "FDA 510(k)" in p["regulations"]
        assert p["competitive_bid_threshold"] == 100000

    def test_unknown_client_defaults_to_university(self):
        p = get_policies("unknown_client")
        assert p["name"] == "Ivy League University"

    def test_all_clients_have_required_fields(self):
        required = ["name", "spend_profile", "approval_thresholds", "regulations",
                     "preferred_vendors", "competitive_bid_threshold", "procurement_system"]
        for client_type in ["university", "nypa", "northwell"]:
            p = get_policies(client_type)
            for field in required:
                assert field in p, f"{client_type} missing field: {field}"
