"""
Talos Notifications — Approval workflow with Slack/email hooks.

Game-changing decision #7: PROACTIVE NOTIFICATIONS
- Slack webhook for instant approval requests
- Email fallback for approvers not on Slack
- Auto-escalation when SLA expires
- No more "where's my approval?" — it comes to you
"""
from __future__ import annotations

import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import httpx

from .config import get_config
from .schemas import RequisitionPipeline, ComplianceResult

log = logging.getLogger("talos.notifications")


class NotificationService:
    """Send approval requests and status updates via Slack and email."""

    def __init__(self):
        self.config = get_config()
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def notify_approval_needed(self, pipeline: RequisitionPipeline):
        """Send approval request notifications for a pipeline."""
        if not pipeline.compliance or not pipeline.compliance.required_approvals:
            return

        for step in pipeline.compliance.required_approvals:
            message = self._build_approval_message(pipeline, step)

            if self.config.slack_webhook_url:
                await self._send_slack(message)

            if self.config.notification_email and self.config.smtp_host:
                subject = f"Approval needed: {pipeline.parsed.category if pipeline.parsed else 'Requisition'} (${(pipeline.parsed.estimated_total if pipeline.parsed else 0):,.2f})"
                body = self._build_email_body(pipeline, step)
                self._send_email(subject, body)

            log.info(f"Approval notification sent for {pipeline.id} to {step.approver_role}")

    async def notify_savings_found(self, pipeline_id: str, amount: float, vendor: str):
        """Notify when savings are discovered."""
        message = {
            "text": f"Talos found ${amount:,.2f} in savings!",
            "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": (
                            f"*Savings Alert*\n"
                            f"Pipeline: `{pipeline_id}`\n"
                            f"Amount: *${amount:,.2f}*\n"
                            f"Vendor: {vendor}\n"
                            f"Talos share (33%): ${amount * 0.33:,.2f}"
                        ),
                    },
                },
            ],
        }

        if self.config.slack_webhook_url:
            await self._send_slack(message)

        if self.config.notification_email and self.config.smtp_host:
            self._send_email(
                f"Talos Savings Alert: ${amount:,.2f} found",
                f"Pipeline: {pipeline_id}\nAmount: ${amount:,.2f}\nVendor: {vendor}\nTalos share (33%): ${amount * 0.33:,.2f}",
            )

    async def notify_compliance_block(self, pipeline: RequisitionPipeline):
        """Notify when a requisition is blocked by compliance."""
        if not pipeline.compliance:
            return

        blocks = [v for v in pipeline.compliance.violations if v.severity == "block"]
        if not blocks:
            return

        violation_text = "\n".join([f"- {v.policy_name}: {v.description[:100]}" for v in blocks[:5]])
        message = {
            "text": f"Requisition {pipeline.id} blocked by compliance",
            "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": (
                            f"*Compliance Block*\n"
                            f"Pipeline: `{pipeline.id}`\n"
                            f"Requester: {pipeline.requester_name}\n"
                            f"Department: {pipeline.department}\n"
                            f"Total: ${(pipeline.parsed.estimated_total if pipeline.parsed else 0):,.2f}\n\n"
                            f"*Violations:*\n{violation_text}"
                        ),
                    },
                },
            ],
        }

        if self.config.slack_webhook_url:
            await self._send_slack(message)

        if self.config.notification_email and self.config.smtp_host:
            self._send_email(
                f"Compliance Block: {pipeline.id}",
                f"Pipeline: {pipeline.id}\nRequester: {pipeline.requester_name}\n\nViolations:\n{violation_text}",
            )

    def _build_approval_message(self, pipeline: RequisitionPipeline, step) -> dict:
        """Build Slack Block Kit message for approval request."""
        parsed = pipeline.parsed
        return {
            "text": f"Approval needed: {parsed.category if parsed else 'Unknown'} (${(parsed.estimated_total if parsed else 0):,.2f})",
            "blocks": [
                {
                    "type": "header",
                    "text": {"type": "plain_text", "text": "Approval Request"},
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": (
                            f"*Pipeline:* `{pipeline.id}`\n"
                            f"*Requester:* {pipeline.requester_name}\n"
                            f"*Department:* {pipeline.department}\n"
                            f"*Category:* {parsed.category if parsed else 'N/A'}\n"
                            f"*Total:* ${(parsed.estimated_total if parsed else 0):,.2f}\n"
                            f"*Approver:* {step.approver_role}\n"
                            f"*Reason:* {step.threshold_reason}"
                        ),
                    },
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Items:*\n" + "\n".join(
                            [f"- {i.description} x {i.quantity}" for i in (parsed.items[:5] if parsed else [])]
                        ),
                    },
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": {"type": "plain_text", "text": "Approve"},
                            "style": "primary",
                            "value": f"approve_{pipeline.id}",
                        },
                        {
                            "type": "button",
                            "text": {"type": "plain_text", "text": "Reject"},
                            "style": "danger",
                            "value": f"reject_{pipeline.id}",
                        },
                        {
                            "type": "button",
                            "text": {"type": "plain_text", "text": "View Details"},
                            "value": f"view_{pipeline.id}",
                        },
                    ],
                },
            ],
        }

    def _build_email_body(self, pipeline: RequisitionPipeline, step) -> str:
        """Build email body for approval request."""
        parsed = pipeline.parsed
        items_text = ""
        if parsed and parsed.items:
            items_text = "\n".join([f"  - {i.description} x {i.quantity}" for i in parsed.items[:10]])

        return (
            f"Approval Request\n"
            f"{'=' * 40}\n\n"
            f"Pipeline: {pipeline.id}\n"
            f"Requester: {pipeline.requester_name}\n"
            f"Department: {pipeline.department}\n"
            f"Category: {parsed.category if parsed else 'N/A'}\n"
            f"Total: ${(parsed.estimated_total if parsed else 0):,.2f}\n"
            f"Approver: {step.approver_role}\n"
            f"Reason: {step.threshold_reason}\n\n"
            f"Items:\n{items_text}\n\n"
            f"Please log in to approve or reject this requisition."
        )

    async def _send_slack(self, message: dict):
        """Send a message to Slack via webhook."""
        if not self.config.slack_webhook_url:
            log.debug("Slack webhook not configured, skipping notification")
            return

        try:
            client = await self._get_client()
            resp = await client.post(
                self.config.slack_webhook_url,
                json=message,
            )
            if resp.status_code != 200:
                log.warning(f"Slack webhook returned {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            log.warning(f"Failed to send Slack notification: {e}")

    def _send_email(self, subject: str, body: str):
        """Send an email via SMTP."""
        if not self.config.smtp_host or not self.config.notification_email:
            log.debug("Email not configured, skipping")
            return

        try:
            msg = MIMEMultipart()
            msg["From"] = self.config.smtp_from or self.config.smtp_user
            msg["To"] = self.config.notification_email
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain"))

            with smtplib.SMTP(self.config.smtp_host, self.config.smtp_port) as server:
                server.ehlo()
                if self.config.smtp_port != 25:
                    server.starttls()
                if self.config.smtp_user and self.config.smtp_password:
                    server.login(self.config.smtp_user, self.config.smtp_password)
                server.send_message(msg)

            log.info(f"Email sent to {self.config.notification_email}: {subject}")
        except Exception as e:
            log.warning(f"Failed to send email: {e}")

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()
