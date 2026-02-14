"""Tests for Talos Temporal workflow integration."""
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure test env is set
os.environ.setdefault("OPENROUTER_API_KEY", "test-key-for-testing")
os.environ.setdefault("TALOS_CLIENT", "university")
os.environ.setdefault("TALOS_DB", ":memory:")

from talos.config import get_config, reset_config
from talos.schemas import (
    RequisitionPipeline, ParsedRequisition, ComplianceResult,
    LineItem, FundingSource, PolicyViolation, ApprovalStep,
    PriceTrackingResult, PricingDataPoint, SavingsRecord,
    AggregationOpportunity,
)


# Helper to check if Temporal test server is available
def _can_start_temporal_test_server():
    """Check if Temporal test server can be downloaded/started."""
    try:
        import asyncio
        from temporalio.testing import WorkflowEnvironment

        async def _check():
            async with await WorkflowEnvironment.start_time_skipping():
                pass
        asyncio.get_event_loop().run_until_complete(_check())
        return True
    except Exception:
        return False


# Cache the result so we only check once
_TEMPORAL_TEST_SERVER_AVAILABLE = None


def temporal_test_server_available():
    global _TEMPORAL_TEST_SERVER_AVAILABLE
    if _TEMPORAL_TEST_SERVER_AVAILABLE is None:
        _TEMPORAL_TEST_SERVER_AVAILABLE = _can_start_temporal_test_server()
    return _TEMPORAL_TEST_SERVER_AVAILABLE


skip_no_temporal_server = pytest.mark.skipif(
    not temporal_test_server_available(),
    reason="Temporal test server not available (requires network download)",
)


# ---- Config Tests ----

class TestTemporalConfig:
    def test_temporal_defaults(self):
        """Temporal is disabled by default."""
        reset_config()
        config = get_config()
        assert config.enable_temporal is False
        assert config.temporal_address == "localhost:7233"
        assert config.temporal_namespace == "default"
        assert config.temporal_task_queue == "talos-pipeline"

    def test_temporal_enable_from_env(self):
        """Temporal can be enabled via env var."""
        reset_config()
        with patch.dict(os.environ, {"TALOS_ENABLE_TEMPORAL": "true"}):
            reset_config()
            config = get_config()
            assert config.enable_temporal is True

    def test_temporal_custom_address(self):
        """Temporal address can be customized."""
        reset_config()
        with patch.dict(os.environ, {
            "TALOS_ENABLE_TEMPORAL": "1",
            "TALOS_TEMPORAL_ADDRESS": "temporal.example.com:7233",
            "TALOS_TEMPORAL_NAMESPACE": "talos-prod",
            "TALOS_TEMPORAL_TASK_QUEUE": "prod-pipeline",
        }):
            reset_config()
            config = get_config()
            assert config.enable_temporal is True
            assert config.temporal_address == "temporal.example.com:7233"
            assert config.temporal_namespace == "talos-prod"
            assert config.temporal_task_queue == "prod-pipeline"


# ---- Schema Tests ----

class TestWorkflowSchema:
    def test_pipeline_has_workflow_fields(self):
        """RequisitionPipeline has workflow_id and workflow_run_id."""
        pipe = RequisitionPipeline()
        assert pipe.workflow_id is None
        assert pipe.workflow_run_id is None

    def test_pipeline_workflow_fields_populated(self):
        """Workflow fields can be set."""
        pipe = RequisitionPipeline(
            workflow_id="talos-pipeline-PIPE-12345678",
            workflow_run_id="run-abc123",
        )
        assert pipe.workflow_id == "talos-pipeline-PIPE-12345678"
        assert pipe.workflow_run_id == "run-abc123"

    def test_pipeline_roundtrip_with_workflow_fields(self):
        """Pipeline with workflow fields serializes/deserializes correctly."""
        pipe = RequisitionPipeline(
            id="PIPE-WF-TEST",
            workflow_id="wf-123",
            workflow_run_id="run-456",
            status="workflow_started",
        )
        data = pipe.model_dump()
        restored = RequisitionPipeline.model_validate(data)
        assert restored.workflow_id == "wf-123"
        assert restored.workflow_run_id == "run-456"
        assert restored.status == "workflow_started"

    def test_pipeline_json_roundtrip(self):
        """JSON serialization includes workflow fields."""
        pipe = RequisitionPipeline(workflow_id="wf-test", workflow_run_id="run-test")
        json_str = pipe.model_dump_json()
        assert "wf-test" in json_str
        assert "run-test" in json_str

        restored = RequisitionPipeline.model_validate_json(json_str)
        assert restored.workflow_id == "wf-test"


# ---- Activities Tests (unit-level, mocked agents) ----

class TestActivities:
    def test_set_shared_agents(self):
        """set_shared_agents stores agents for activity use."""
        from talos.workflows.activities import set_shared_agents, _get_agents

        mock_agents = MagicMock()
        set_shared_agents(mock_agents)
        assert _get_agents() is mock_agents

        # Cleanup
        set_shared_agents(None)

    def test_get_agents_raises_without_init(self):
        """_get_agents raises RuntimeError if not initialized."""
        from talos.workflows.activities import set_shared_agents, _get_agents

        set_shared_agents(None)
        with pytest.raises(RuntimeError, match="Activity agents not initialized"):
            _get_agents()

    def test_activity_functions_are_defined(self):
        """All activity functions are properly decorated with @activity.defn."""
        from talos.workflows import activities
        from temporalio import activity

        # Check that activities are registered as Temporal activities
        activity_fns = [
            activities.parse_requisition,
            activities.check_compliance,
            activities.check_aggregation,
            activities.track_prices,
            activities.generate_purchase_order,
            activities.drain_llm_history,
        ]
        for fn in activity_fns:
            # Temporal @activity.defn marks functions with __temporal_activity_definition
            assert hasattr(fn, "__temporal_activity_definition"), (
                f"{fn.__name__} is not decorated with @activity.defn"
            )

    def test_activity_agent_integration(self):
        """Activities use the shared agents instance correctly."""
        from talos.workflows.activities import set_shared_agents, _get_agents

        mock_agents = MagicMock()
        mock_agents.router.drain_history.return_value = []

        set_shared_agents(mock_agents)
        agents = _get_agents()

        # Verify the agents instance is the one we set
        assert agents is mock_agents
        assert agents.router.drain_history() == []

        set_shared_agents(None)


# ---- Workflow Input/State Tests ----

class TestWorkflowDataclasses:
    def test_workflow_input_defaults(self):
        """RequisitionWorkflowInput has sensible defaults."""
        from talos.workflows.requisition_workflow import RequisitionWorkflowInput

        inp = RequisitionWorkflowInput(raw_text="Test request")
        assert inp.raw_text == "Test request"
        assert inp.requester_name == ""
        assert inp.channel == "portal"
        assert inp.auto_generate_po is False
        assert inp.recent_orders is None

    def test_workflow_input_full(self):
        """RequisitionWorkflowInput accepts all parameters."""
        from talos.workflows.requisition_workflow import RequisitionWorkflowInput

        inp = RequisitionWorkflowInput(
            raw_text="Need gloves",
            requester_name="Dr. Chen",
            department="Chemistry",
            channel="email",
            auto_generate_po=True,
            pipeline_id="PIPE-123",
            recent_orders=[{"id": "REQ-OLD"}],
        )
        assert inp.requester_name == "Dr. Chen"
        assert inp.auto_generate_po is True
        assert inp.pipeline_id == "PIPE-123"

    def test_workflow_state_defaults(self):
        """WorkflowState initializes with correct defaults."""
        from talos.workflows.requisition_workflow import WorkflowState

        state = WorkflowState()
        assert state.status == "received"
        assert state.current_step == ""
        assert state.parsed_json is None
        assert state.compliance_json is None
        assert state.approval_decision is None
        assert state.errors == []
        assert state.total_llm_cost == 0.0

    def test_workflow_state_mutation(self):
        """WorkflowState fields can be updated."""
        from talos.workflows.requisition_workflow import WorkflowState

        state = WorkflowState(pipeline_id="PIPE-MUT")
        state.status = "parsed"
        state.current_step = "compliance"
        state.parsed_json = {"req_id": "REQ-TEST"}
        state.approval_decision = "approved"

        assert state.status == "parsed"
        assert state.parsed_json["req_id"] == "REQ-TEST"
        assert state.approval_decision == "approved"


# ---- Workflow Class Tests ----

class TestWorkflowClass:
    def test_workflow_is_registered(self):
        """RequisitionWorkflow is a valid Temporal workflow."""
        from talos.workflows.requisition_workflow import RequisitionWorkflow

        assert hasattr(RequisitionWorkflow, "__temporal_workflow_definition")

    def test_workflow_has_signals(self):
        """Workflow has approve and reject signal handlers."""
        from talos.workflows.requisition_workflow import RequisitionWorkflow

        wf = RequisitionWorkflow()
        assert hasattr(wf, "approve")
        assert hasattr(wf, "reject")

    def test_workflow_has_query(self):
        """Workflow has get_status query handler."""
        from talos.workflows.requisition_workflow import RequisitionWorkflow

        wf = RequisitionWorkflow()
        assert hasattr(wf, "get_status")

    def test_workflow_initial_state(self):
        """Workflow starts with correct initial state."""
        from talos.workflows.requisition_workflow import RequisitionWorkflow

        wf = RequisitionWorkflow()
        status = wf.get_status()
        assert status["status"] == "received"
        assert status["current_step"] == ""
        assert status["has_parsed"] is False
        assert status["has_compliance"] is False
        assert status["errors"] == []

    def test_workflow_build_result(self):
        """Workflow _build_result returns correct dict shape."""
        from talos.workflows.requisition_workflow import RequisitionWorkflow

        wf = RequisitionWorkflow()
        wf.state.pipeline_id = "PIPE-RESULT"
        wf.state.status = "priced"
        wf.state.parsed_json = {"req_id": "REQ-1"}
        wf.state.total_llm_cost = 0.05

        result = wf._build_result()
        assert result["pipeline_id"] == "PIPE-RESULT"
        assert result["status"] == "priced"
        assert result["parsed"]["req_id"] == "REQ-1"
        assert result["total_llm_cost"] == 0.05
        assert result["errors"] == []
        assert result["compliance"] is None
        assert result["purchase_order"] is None


# ---- Pipeline Dispatch Tests ----

class TestPipelineDispatch:
    @pytest.mark.asyncio
    async def test_dispatch_uses_direct_when_temporal_disabled(self):
        """dispatch() uses direct process() when Temporal is disabled."""
        from talos.agents.pipeline import RequisitionPipelineRunner

        runner = RequisitionPipelineRunner("university")
        runner.process = AsyncMock(return_value=RequisitionPipeline(id="PIPE-DIRECT"))

        with patch("talos.agents.pipeline.get_config") as mock_config:
            mock_config.return_value = MagicMock(enable_temporal=False)
            result = await runner.dispatch(raw_text="Test request")

        assert result.id == "PIPE-DIRECT"
        runner.process.assert_called_once()

    @pytest.mark.asyncio
    async def test_dispatch_uses_temporal_when_enabled(self):
        """dispatch() uses Temporal when enabled."""
        from talos.agents.pipeline import RequisitionPipelineRunner

        runner = RequisitionPipelineRunner("university")
        runner.start_temporal_workflow = AsyncMock(
            return_value=RequisitionPipeline(id="PIPE-TEMPORAL", status="workflow_started")
        )

        with patch("talos.agents.pipeline.get_config") as mock_config:
            mock_config.return_value = MagicMock(enable_temporal=True)
            result = await runner.dispatch(raw_text="Test request")

        assert result.id == "PIPE-TEMPORAL"
        assert result.status == "workflow_started"
        runner.start_temporal_workflow.assert_called_once()

    @pytest.mark.asyncio
    async def test_dispatch_passes_all_params(self):
        """dispatch() forwards all parameters to the chosen backend."""
        from talos.agents.pipeline import RequisitionPipelineRunner

        runner = RequisitionPipelineRunner("university")
        runner.process = AsyncMock(return_value=RequisitionPipeline())

        with patch("talos.agents.pipeline.get_config") as mock_config:
            mock_config.return_value = MagicMock(enable_temporal=False)
            await runner.dispatch(
                raw_text="Test",
                requester_name="Dr. Test",
                department="Testing",
                channel="email",
                auto_generate_po=True,
            )

        runner.process.assert_called_once_with(
            raw_text="Test",
            requester_name="Dr. Test",
            department="Testing",
            channel="email",
            recent_orders=None,
            auto_generate_po=True,
        )


# ---- API Endpoint Tests ----

class TestWorkflowAPIEndpoints:
    @pytest.fixture
    def client(self):
        """Test client for workflow API tests."""
        from talos.api import server
        from talos.db import TalosDB
        from fastapi.testclient import TestClient

        test_db = TalosDB(":memory:")
        server.db = test_db
        server.notifier = MagicMock()
        server.notifier.close = AsyncMock()
        server.agents = MagicMock()
        server.agents.router = MagicMock()
        server.agents.router.drain_history = MagicMock(return_value=[])
        server.chat_engine = MagicMock()
        server.chat_engine.sessions = {}
        server.pipeline_runner = MagicMock()
        server.savings_analyzer = MagicMock()

        with TestClient(server.app, raise_server_exceptions=False) as c:
            yield c

        test_db.close()

    def test_workflow_approve_when_disabled(self, client):
        """Workflow approve returns 400 when Temporal disabled."""
        resp = client.post("/workflows/approve", json={"pipeline_id": "PIPE-TEST"})
        assert resp.status_code == 400
        assert "not enabled" in resp.json()["detail"]

    def test_workflow_reject_when_disabled(self, client):
        """Workflow reject returns 400 when Temporal disabled."""
        resp = client.post("/workflows/reject", json={"pipeline_id": "PIPE-TEST"})
        assert resp.status_code == 400

    def test_workflow_status_when_disabled(self, client):
        """Workflow status returns 400 when Temporal disabled."""
        resp = client.get("/workflows/PIPE-TEST/status")
        assert resp.status_code == 400

    def test_health_includes_temporal(self, client):
        """Health endpoint includes Temporal status."""
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "temporal_enabled" in data
        assert data["temporal_enabled"] is False
        assert data["temporal_address"] is None  # Not shown when disabled

    def test_workflow_approve_validation(self, client):
        """Workflow approve validates input."""
        resp = client.post("/workflows/approve", json={})
        assert resp.status_code == 422  # Missing pipeline_id

    def test_workflow_reject_validation(self, client):
        """Workflow reject validates input."""
        resp = client.post("/workflows/reject", json={})
        assert resp.status_code == 422


# ---- CLI Tests ----

class TestWorkerCLI:
    def test_worker_command_when_disabled(self, capsys):
        """Worker command shows helpful message when Temporal disabled."""
        reset_config()
        with patch.dict(os.environ, {"TALOS_ENABLE_TEMPORAL": ""}):
            reset_config()
            from talos.cli import run_temporal_worker
            run_temporal_worker()
            captured = capsys.readouterr()
            assert "not enabled" in captured.out

    def test_info_shows_temporal_section(self, capsys):
        """Info command shows Temporal configuration."""
        reset_config()
        from talos.cli import show_info
        show_info()
        captured = capsys.readouterr()
        assert "Temporal Workflows" in captured.out
        assert "NO" in captured.out  # disabled by default

    def test_info_shows_temporal_enabled(self, capsys):
        """Info command shows Temporal details when enabled."""
        reset_config()
        with patch.dict(os.environ, {
            "TALOS_ENABLE_TEMPORAL": "true",
            "TALOS_TEMPORAL_ADDRESS": "my-temporal:7233",
        }):
            reset_config()
            from talos.cli import show_info
            show_info()
            captured = capsys.readouterr()
            assert "YES" in captured.out
            assert "my-temporal:7233" in captured.out


# ---- Worker Module Tests ----

class TestWorkerModule:
    def test_all_activities_list(self):
        """Worker module exports all activities."""
        from talos.workflows.worker import ALL_ACTIVITIES

        assert len(ALL_ACTIVITIES) == 6
        activity_names = [a.__name__ for a in ALL_ACTIVITIES]
        assert "parse_requisition" in activity_names
        assert "check_compliance" in activity_names
        assert "check_aggregation" in activity_names
        assert "track_prices" in activity_names
        assert "generate_purchase_order" in activity_names
        assert "drain_llm_history" in activity_names

    @pytest.mark.asyncio
    async def test_worker_refuses_when_disabled(self):
        """Worker run_worker exits if Temporal not enabled."""
        from talos.workflows.worker import run_worker

        reset_config()
        with patch.dict(os.environ, {"TALOS_ENABLE_TEMPORAL": ""}):
            reset_config()
            # Should return without error when temporal is disabled
            await run_worker()


# ---- Integration Tests (require Temporal test server) ----

@skip_no_temporal_server
class TestWorkflowIntegration:
    """
    Integration tests using Temporal's built-in test environment.
    Skipped when the test server cannot be downloaded (e.g., CI without network).
    """

    @pytest.mark.asyncio
    async def test_full_workflow_with_test_env(self):
        """Run a full workflow through Temporal test environment."""
        from temporalio.testing import WorkflowEnvironment
        from temporalio.worker import Worker
        import talos.workflows.activities as activities_mod
        from talos.workflows.requisition_workflow import (
            RequisitionWorkflow, RequisitionWorkflowInput,
        )
        from talos.workflows.activities import set_shared_agents

        mock_agents = MagicMock()
        sample_parsed = ParsedRequisition(
            req_id="REQ-WF-INT",
            items=[LineItem(description="Test gloves", quantity=50, estimated_unit_price=12.50)],
            estimated_total=625.0,
            category="Lab Supplies",
            confidence_score=0.95,
        )
        sample_compliance = ComplianceResult(
            requisition_id="REQ-WF-INT", is_compliant=True,
        )
        sample_agg = AggregationOpportunity(
            requisition_id="REQ-WF-INT", recommended_action="proceed_solo",
        )
        sample_pricing = PriceTrackingResult(
            item_description="Test gloves",
            recommended_vendor="Fisher",
            recommended_price=11.0,
            lowest_price=11.0,
            highest_price=15.0,
            median_price=13.0,
            sources_checked=["Fisher", "VWR"],
        )

        mock_agents.intake_parser = AsyncMock(return_value=sample_parsed)
        mock_agents.policy_compliance = AsyncMock(return_value=sample_compliance)
        mock_agents.demand_aggregation = AsyncMock(return_value=sample_agg)
        mock_agents.price_tracker = AsyncMock(return_value=sample_pricing)
        mock_agents.router.drain_history.return_value = []
        set_shared_agents(mock_agents)

        try:
            async with await WorkflowEnvironment.start_time_skipping() as env:
                async with Worker(
                    env.client,
                    task_queue="test-queue",
                    workflows=[RequisitionWorkflow],
                    activities=[
                        activities_mod.parse_requisition,
                        activities_mod.check_compliance,
                        activities_mod.check_aggregation,
                        activities_mod.track_prices,
                        activities_mod.generate_purchase_order,
                        activities_mod.drain_llm_history,
                    ],
                ):
                    result = await env.client.execute_workflow(
                        RequisitionWorkflow.run,
                        RequisitionWorkflowInput(
                            raw_text="I need 50 boxes of gloves",
                            requester_name="Dr. Test",
                            department="Testing",
                            pipeline_id="PIPE-INT-TEST",
                        ),
                        id="test-workflow-1",
                        task_queue="test-queue",
                    )

                    assert result["pipeline_id"] == "PIPE-INT-TEST"
                    assert result["parsed"] is not None
                    assert result["compliance"] is not None
        finally:
            set_shared_agents(None)

    @pytest.mark.asyncio
    async def test_workflow_with_approval_signal(self):
        """Workflow pauses for approval and resumes on signal."""
        import asyncio
        from temporalio.testing import WorkflowEnvironment
        from temporalio.worker import Worker
        import talos.workflows.activities as activities_mod
        from talos.workflows.requisition_workflow import (
            RequisitionWorkflow, RequisitionWorkflowInput,
        )
        from talos.workflows.activities import set_shared_agents

        mock_agents = MagicMock()
        sample_parsed = ParsedRequisition(
            req_id="REQ-APPROVE",
            items=[LineItem(description="Equipment", quantity=1, estimated_unit_price=50000)],
            estimated_total=50000.0,
            category="Lab Equipment",
        )
        sample_compliance = ComplianceResult(
            requisition_id="REQ-APPROVE",
            is_compliant=True,
            required_approvals=[
                ApprovalStep(approver_role="VP", threshold_reason="Over $25K"),
            ],
        )
        sample_pricing = PriceTrackingResult(
            item_description="Equipment",
            recommended_vendor="Vendor A",
            recommended_price=48000.0,
            lowest_price=48000.0,
            highest_price=55000.0,
            median_price=50000.0,
        )

        mock_agents.intake_parser = AsyncMock(return_value=sample_parsed)
        mock_agents.policy_compliance = AsyncMock(return_value=sample_compliance)
        mock_agents.demand_aggregation = AsyncMock(return_value=AggregationOpportunity(requisition_id="REQ-APPROVE"))
        mock_agents.price_tracker = AsyncMock(return_value=sample_pricing)
        mock_agents.generate_po = AsyncMock(return_value=MagicMock(
            model_dump=MagicMock(return_value={
                "po_number": "PO-TEST", "total": 48000.0, "status": "draft",
                "requisition_id": "REQ-APPROVE", "vendor_name": "Vendor A",
                "items": [], "payment_terms": "Net 30", "delivery_date": None,
                "ship_to": "", "gl_code": "",
            })
        ))
        mock_agents.router.drain_history.return_value = []
        set_shared_agents(mock_agents)

        try:
            async with await WorkflowEnvironment.start_time_skipping() as env:
                async with Worker(
                    env.client,
                    task_queue="test-approval-queue",
                    workflows=[RequisitionWorkflow],
                    activities=[
                        activities_mod.parse_requisition,
                        activities_mod.check_compliance,
                        activities_mod.check_aggregation,
                        activities_mod.track_prices,
                        activities_mod.generate_purchase_order,
                        activities_mod.drain_llm_history,
                    ],
                ):
                    handle = await env.client.start_workflow(
                        RequisitionWorkflow.run,
                        RequisitionWorkflowInput(
                            raw_text="I need expensive equipment",
                            requester_name="Dr. Test",
                            department="Testing",
                            pipeline_id="PIPE-APPROVE",
                            auto_generate_po=True,
                        ),
                        id="test-approval-workflow",
                        task_queue="test-approval-queue",
                    )

                    await asyncio.sleep(0.5)

                    status = await handle.query(RequisitionWorkflow.get_status)
                    assert status["status"] == "awaiting_approval"

                    await handle.signal(RequisitionWorkflow.approve)

                    result = await handle.result()
                    assert result["status"] == "po_generated"
        finally:
            set_shared_agents(None)
