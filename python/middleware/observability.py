"""
Observability Middleware

Request tracing, metrics, and structured logging for every API call.
"""

import time
import uuid
from typing import Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
import structlog

logger = structlog.get_logger(__name__)


# ============================================
# In-memory metrics (production: use Prometheus)
# ============================================

class Metrics:
    """Simple in-memory metrics collector.

    In production, replace with prometheus_client or OpenTelemetry.
    """

    def __init__(self):
        self._request_count = 0
        self._error_count = 0
        self._latency_sum_ms = 0.0
        self._latency_count = 0
        self._active_requests = 0
        self._endpoint_counts: dict[str, int] = {}
        self._workflow_starts = 0
        self._workflow_completions = 0

    def record_request(self, method: str, path: str, status: int, latency_ms: float):
        self._request_count += 1
        self._latency_sum_ms += latency_ms
        self._latency_count += 1
        key = f"{method} {path}"
        self._endpoint_counts[key] = self._endpoint_counts.get(key, 0) + 1
        if status >= 400:
            self._error_count += 1

    def record_workflow_start(self):
        self._workflow_starts += 1

    def record_workflow_completion(self):
        self._workflow_completions += 1

    def snapshot(self) -> dict:
        avg = (self._latency_sum_ms / self._latency_count) if self._latency_count else 0
        return {
            "requests_total": self._request_count,
            "errors_total": self._error_count,
            "avg_latency_ms": round(avg, 2),
            "active_requests": self._active_requests,
            "workflows_started": self._workflow_starts,
            "workflows_completed": self._workflow_completions,
            "top_endpoints": dict(
                sorted(self._endpoint_counts.items(), key=lambda x: -x[1])[:10]
            ),
        }


# Global metrics instance
metrics = Metrics()


# ============================================
# Tracing middleware
# ============================================

class TracingMiddleware(BaseHTTPMiddleware):
    """Attaches a trace_id to every request, logs request/response, records metrics."""

    async def dispatch(self, request: Request, call_next):
        # Generate or propagate trace ID
        trace_id = request.headers.get("X-Trace-ID", str(uuid.uuid4()))
        request.state.trace_id = trace_id

        metrics._active_requests += 1
        start = time.monotonic()

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            trace_id=trace_id,
            method=request.method,
            path=request.url.path,
        )

        logger.info("request_started")

        try:
            response = await call_next(request)
        except Exception:
            elapsed = (time.monotonic() - start) * 1000
            metrics._active_requests -= 1
            metrics.record_request(request.method, request.url.path, 500, elapsed)
            logger.exception("request_failed", latency_ms=round(elapsed, 2))
            raise

        elapsed = (time.monotonic() - start) * 1000
        metrics._active_requests -= 1
        metrics.record_request(
            request.method, request.url.path, response.status_code, elapsed,
        )

        response.headers["X-Trace-ID"] = trace_id
        response.headers["X-Request-Duration-Ms"] = str(round(elapsed, 2))

        logger.info(
            "request_completed",
            status=response.status_code,
            latency_ms=round(elapsed, 2),
        )

        return response
