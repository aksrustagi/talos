"""Tests for authentication and observability middleware."""

import os
import time
from unittest.mock import patch

import pytest
from fastapi import FastAPI, Request, Depends
from fastapi.testclient import TestClient
from starlette.responses import JSONResponse

from middleware.auth import AuthMiddleware, AuthUser, get_auth_user
from middleware.observability import TracingMiddleware, Metrics, metrics


def _jwt_available() -> bool:
    """Check if PyJWT + cryptography can be imported without crashing."""
    try:
        import jwt  # noqa: F401
        return True
    except BaseException:
        return False


# ============================================
# Metrics
# ============================================


class TestMetrics:
    def test_initial_state(self):
        m = Metrics()
        snap = m.snapshot()
        assert snap["requests_total"] == 0
        assert snap["errors_total"] == 0
        assert snap["avg_latency_ms"] == 0

    def test_record_request(self):
        m = Metrics()
        m.record_request("GET", "/api/health", 200, 15.5)
        m.record_request("POST", "/api/chat", 200, 30.0)
        m.record_request("GET", "/api/health", 500, 5.0)

        snap = m.snapshot()
        assert snap["requests_total"] == 3
        assert snap["errors_total"] == 1
        assert snap["avg_latency_ms"] == pytest.approx((15.5 + 30.0 + 5.0) / 3, rel=0.01)
        assert "GET /api/health" in snap["top_endpoints"]
        assert snap["top_endpoints"]["GET /api/health"] == 2

    def test_workflow_tracking(self):
        m = Metrics()
        m.record_workflow_start()
        m.record_workflow_start()
        m.record_workflow_completion()

        snap = m.snapshot()
        assert snap["workflows_started"] == 2
        assert snap["workflows_completed"] == 1


# ============================================
# Auth middleware
# ============================================


class TestAuthMiddlewareUnit:
    def _make_app(self):
        app = FastAPI()
        app.add_middleware(AuthMiddleware)

        @app.get("/api/health")
        async def health():
            return {"status": "ok"}

        @app.get("/protected")
        async def protected(request: Request):
            user = get_auth_user(request)
            return {"user": user.user_id}

        return app

    def test_public_path_passthrough(self):
        client = TestClient(self._make_app())
        resp = client.get("/api/health")
        assert resp.status_code == 200

    def test_missing_auth_returns_401(self):
        client = TestClient(self._make_app(), raise_server_exceptions=False)
        resp = client.get("/protected")
        assert resp.status_code == 401

    def test_header_auth_works(self):
        client = TestClient(self._make_app())
        resp = client.get("/protected", headers={"X-User-ID": "user123"})
        assert resp.status_code == 200

    @patch.dict(os.environ, {"TALOS_JWT_SECRET": "test-secret"})
    def test_jwt_required_when_secret_set(self):
        """When JWT secret is set, header auth is not sufficient."""
        # Reimport to pick up new env var
        import importlib
        import middleware.auth as auth_mod
        old_secret = auth_mod.JWT_SECRET
        auth_mod.JWT_SECRET = "test-secret"
        try:
            client = TestClient(self._make_app(), raise_server_exceptions=False)
            resp = client.get("/protected", headers={"X-User-ID": "user123"})
            assert resp.status_code == 401
            assert "Authorization" in resp.json()["detail"]
        finally:
            auth_mod.JWT_SECRET = old_secret

    @pytest.mark.skipif(
        not _jwt_available(),
        reason="PyJWT/cryptography not available in this environment",
    )
    @patch.dict(os.environ, {"TALOS_JWT_SECRET": "test-secret"})
    def test_jwt_valid_token(self):
        import jwt
        import middleware.auth as auth_mod
        old_secret = auth_mod.JWT_SECRET
        auth_mod.JWT_SECRET = "test-secret"
        try:
            token = jwt.encode(
                {"sub": "user123", "university_id": "univ1", "email": "user@test.edu"},
                "test-secret",
                algorithm="HS256",
            )
            client = TestClient(self._make_app())
            resp = client.get(
                "/protected",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 200
        finally:
            auth_mod.JWT_SECRET = old_secret


# ============================================
# Tracing middleware
# ============================================


class TestTracingMiddleware:
    def _make_app(self):
        app = FastAPI()
        app.add_middleware(TracingMiddleware)

        @app.get("/test")
        async def test_endpoint():
            return {"ok": True}

        return app

    def test_adds_trace_id_header(self):
        client = TestClient(self._make_app())
        resp = client.get("/test")
        assert resp.status_code == 200
        assert "X-Trace-ID" in resp.headers
        assert "X-Request-Duration-Ms" in resp.headers

    def test_propagates_trace_id(self):
        client = TestClient(self._make_app())
        custom_trace = "my-custom-trace-id"
        resp = client.get("/test", headers={"X-Trace-ID": custom_trace})
        assert resp.headers["X-Trace-ID"] == custom_trace
