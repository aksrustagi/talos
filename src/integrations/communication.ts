/**
 * Multi-Channel Communication Integration
 *
 * Provides unified communication across four channels:
 * - Sendblue (iMessage/SMS/RCS) - https://docs.sendblue.com/
 * - Vapi AI (Voice) - https://vapi.ai/
 * - Resend (Outbound Email) - https://resend.com/
 * - AgentMail (Agent Email Inboxes) - https://docs.agentmail.to/
 *
 * Each channel is used for specific agent communication needs:
 * - Sendblue: Urgent alerts, mobile approvals, delivery tracking
 * - Vapi: Phone-based orders, executive voice approvals, vendor calls
 * - Resend: Reports, dashboards, formal notifications
 * - AgentMail: Vendor correspondence, RFQs, invoices, audit trails
 */

// ============================================
// Shared Types
// ============================================

export interface CommunicationMessage {
  channel: "sendblue" | "vapi" | "resend" | "agentmail" | "slack";
  direction: "inbound" | "outbound";
  recipient: string;
  content: string;
  timestamp: string;
  status: "pending" | "sent" | "delivered" | "failed" | "read";
  metadata?: Record<string, any>;
}

export interface ChannelSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface InboundWebhookPayload {
  channel: string;
  from: string;
  content: string;
  timestamp: string;
  metadata: Record<string, any>;
}

// ============================================
// Sendblue - iMessage/SMS/RCS Channel
// ============================================

export interface SendblueConfig {
  apiKey: string;
  apiSecret?: string;
  webhookUrl?: string;
}

export interface SendblueSendOptions {
  to: string;
  content: string;
  type: "imessage" | "sms" | "rcs";
  mediaUrl?: string;
  sendStyle?: "celebration" | "shooting_star" | "fireworks" | "lasers" | "love" | "spotlight";
  statusCallback?: string;
}

export class SendblueChannel {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl = "https://api.sendblue.co/api";
  private webhookUrl?: string;

  constructor(config: SendblueConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret || "";
    this.webhookUrl = config.webhookUrl;
  }

  /**
   * Send an iMessage/SMS to a phone number.
   * Sendblue automatically handles fallback: iMessage -> RCS -> SMS.
   */
  async send(options: SendblueSendOptions): Promise<ChannelSendResult> {
    try {
      const response = await fetch(`${this.baseUrl}/send-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "sb-api-key-id": this.apiKey,
          "sb-api-secret-key": this.apiSecret,
        },
        body: JSON.stringify({
          number: options.to,
          content: options.content,
          send_style: options.sendStyle,
          media_url: options.mediaUrl,
          status_callback: options.statusCallback || this.webhookUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        return { success: false, error: `Sendblue error: ${errorData}` };
      }

      const data = await response.json();
      return {
        success: true,
        messageId: data.message_id || data.accountEmail,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Sendblue send failed",
      };
    }
  }

  /**
   * Send a typing indicator (iMessage only)
   */
  async sendTypingIndicator(to: string): Promise<void> {
    await fetch(`${this.baseUrl}/send-typing-indicator`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sb-api-key-id": this.apiKey,
        "sb-api-secret-key": this.apiSecret,
      },
      body: JSON.stringify({ number: to }),
    });
  }

  /**
   * Send a group message
   */
  async sendGroup(
    numbers: string[],
    content: string
  ): Promise<ChannelSendResult> {
    try {
      const response = await fetch(`${this.baseUrl}/send-group-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "sb-api-key-id": this.apiKey,
          "sb-api-secret-key": this.apiSecret,
        },
        body: JSON.stringify({ numbers, content }),
      });

      if (!response.ok) {
        return { success: false, error: "Group send failed" };
      }

      const data = await response.json();
      return { success: true, messageId: data.group_id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Group send failed",
      };
    }
  }

  /**
   * Process an inbound webhook from Sendblue
   */
  parseWebhook(body: any): InboundWebhookPayload {
    return {
      channel: "sendblue",
      from: body.from_number || body.number,
      content: body.content || body.body || "",
      timestamp: body.date_sent || new Date().toISOString(),
      metadata: {
        messageId: body.message_id,
        accountEmail: body.accountEmail,
        mediaUrl: body.media_url,
        isIMessage: body.is_outbound === false,
      },
    };
  }

  /**
   * Send approval request via iMessage with quick-reply options
   */
  async sendApprovalRequest(
    to: string,
    requisitionId: string,
    summary: string,
    amount: number
  ): Promise<ChannelSendResult> {
    const message =
      `APPROVAL REQUEST [${requisitionId}]\n\n` +
      `${summary}\n\n` +
      `Amount: $${amount.toLocaleString()}\n\n` +
      `Reply APPROVE or DENY`;

    return this.send({ to, content: message, type: "imessage" });
  }

  /**
   * Send urgent price alert via SMS
   */
  async sendPriceAlert(
    to: string,
    productName: string,
    priceChange: number,
    alertLevel: string
  ): Promise<ChannelSendResult> {
    const emoji = alertLevel === "CRITICAL" ? "!!!" : "!";
    const message =
      `${emoji} PRICE ALERT [${alertLevel}]\n` +
      `${productName}\n` +
      `Change: ${priceChange > 0 ? "+" : ""}${priceChange}%\n` +
      `Action may be required.`;

    return this.send({ to, content: message, type: "sms" });
  }
}

// ============================================
// Vapi AI - Voice Channel
// ============================================

export interface VapiConfig {
  apiKey: string;
  assistantId?: string;
  phoneNumberId?: string;
}

export interface VapiCallOptions {
  to: string;
  assistantId?: string;
  firstMessage?: string;
  context?: Record<string, any>;
  tools?: VapiTool[];
  maxDurationMinutes?: number;
}

export interface VapiTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
  server?: { url: string };
}

export interface VapiCallResult {
  success: boolean;
  callId?: string;
  status?: string;
  transcript?: string;
  toolCalls?: Array<{ name: string; args: any; result: any }>;
  duration?: number;
  error?: string;
}

export class VapiChannel {
  private apiKey: string;
  private assistantId: string;
  private phoneNumberId: string;
  private baseUrl = "https://api.vapi.ai";

  constructor(config: VapiConfig) {
    this.apiKey = config.apiKey;
    this.assistantId = config.assistantId || "";
    this.phoneNumberId = config.phoneNumberId || "";
  }

  /**
   * Initiate an outbound voice call with an AI agent
   */
  async makeCall(options: VapiCallOptions): Promise<VapiCallResult> {
    try {
      const response = await fetch(`${this.baseUrl}/call`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          assistantId: options.assistantId || this.assistantId,
          phoneNumberId: this.phoneNumberId,
          customer: { number: options.to },
          firstMessage: options.firstMessage,
          assistantOverrides: {
            variableValues: options.context || {},
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        return { success: false, error: `Vapi error: ${errorData}` };
      }

      const data = await response.json();
      return {
        success: true,
        callId: data.id,
        status: data.status,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Vapi call failed",
      };
    }
  }

  /**
   * Get call details and transcript
   */
  async getCall(callId: string): Promise<VapiCallResult> {
    try {
      const response = await fetch(`${this.baseUrl}/call/${callId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!response.ok) {
        return { success: false, error: `Failed to get call: ${response.status}` };
      }

      const data = await response.json();
      return {
        success: true,
        callId: data.id,
        status: data.status,
        transcript: data.transcript,
        duration: data.duration,
        toolCalls: data.toolCalls,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get call",
      };
    }
  }

  /**
   * Create a Vapi assistant configured for procurement tasks
   */
  async createProcurementAssistant(config: {
    name: string;
    systemPrompt: string;
    tools: VapiTool[];
    voiceId?: string;
  }): Promise<{ assistantId: string }> {
    const response = await fetch(`${this.baseUrl}/assistant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        name: config.name,
        model: {
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
          systemMessage: config.systemPrompt,
          tools: config.tools,
        },
        voice: {
          provider: "11labs",
          voiceId: config.voiceId || "21m00Tcm4TlvDq8ikWAM", // Default professional voice
        },
        firstMessage: "Hello, this is Talos Procurement. How can I help you today?",
        endCallMessage: "Thank you. Your request has been logged and will be processed.",
        silenceTimeoutSeconds: 30,
        maxDurationSeconds: 600, // 10 min max
      }),
    });

    const data = await response.json();
    return { assistantId: data.id };
  }

  /**
   * Make a voice approval call to an executive
   */
  async callForApproval(
    to: string,
    requisitionId: string,
    summary: string,
    amount: number
  ): Promise<VapiCallResult> {
    return this.makeCall({
      to,
      firstMessage:
        `This is Talos Procurement calling about requisition ${requisitionId}. ` +
        `A purchase request for $${amount.toLocaleString()} needs your approval. ` +
        `${summary}. Do you approve or deny this request?`,
      context: { requisitionId, amount, summary },
      tools: [
        {
          type: "function",
          function: {
            name: "process_approval_decision",
            description: "Record the approver's decision on the requisition",
            parameters: {
              type: "object",
              properties: {
                decision: { type: "string", enum: ["approve", "deny", "defer"] },
                reason: { type: "string", description: "Optional reason for decision" },
              },
              required: ["decision"],
            },
          },
        },
      ],
    });
  }

  /**
   * Process an inbound Vapi webhook
   */
  parseWebhook(body: any): InboundWebhookPayload {
    return {
      channel: "vapi",
      from: body.customer?.number || "",
      content: body.transcript || body.message || "",
      timestamp: body.timestamp || new Date().toISOString(),
      metadata: {
        callId: body.call?.id,
        status: body.call?.status,
        duration: body.call?.duration,
        toolCalls: body.toolCalls,
        type: body.type, // e.g., "end-of-call-report", "function-call", "hang"
      },
    };
  }
}

// ============================================
// Resend - Outbound Email Channel
// ============================================

export interface ResendConfig {
  apiKey: string;
  fromEmail: string;
  fromName?: string;
}

export interface ResendEmailOptions {
  to: string | string[];
  subject: string;
  content: string;
  type: "email";
  html?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string; // Base64
    contentType: string;
  }>;
  tags?: Array<{ name: string; value: string }>;
}

export class ResendChannel {
  private apiKey: string;
  private fromEmail: string;
  private fromName: string;
  private baseUrl = "https://api.resend.com";

  constructor(config: ResendConfig) {
    this.apiKey = config.apiKey;
    this.fromEmail = config.fromEmail;
    this.fromName = config.fromName || "Talos Procurement AI";
  }

  /**
   * Send an email via Resend
   */
  async send(
    options: ResendEmailOptions
  ): Promise<ChannelSendResult> {
    try {
      const response = await fetch(`${this.baseUrl}/emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: `${this.fromName} <${this.fromEmail}>`,
          to: Array.isArray(options.to) ? options.to : [options.to],
          subject: options.subject,
          html: options.html || this.textToHtml(options.content),
          text: options.content,
          cc: options.cc,
          bcc: options.bcc,
          reply_to: options.replyTo,
          attachments: options.attachments?.map((a) => ({
            filename: a.filename,
            content: a.content,
            content_type: a.contentType,
          })),
          tags: options.tags,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        return { success: false, error: `Resend error: ${errorData}` };
      }

      const data = await response.json();
      return { success: true, messageId: data.id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Resend send failed",
      };
    }
  }

  /**
   * Send a procurement report email
   */
  async sendReport(
    to: string | string[],
    reportType: string,
    reportContent: string,
    attachmentData?: string
  ): Promise<ChannelSendResult> {
    const attachments = attachmentData
      ? [
          {
            filename: `${reportType.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`,
            content: attachmentData,
            contentType: "application/pdf",
          },
        ]
      : undefined;

    return this.send({
      to,
      subject: `Talos Procurement Report: ${reportType}`,
      content: reportContent,
      type: "email",
      html: this.buildReportHtml(reportType, reportContent),
      attachments,
      tags: [
        { name: "type", value: "report" },
        { name: "report_type", value: reportType },
      ],
    });
  }

  /**
   * Send a budget alert email
   */
  async sendBudgetAlert(
    to: string | string[],
    budgetCode: string,
    percentUsed: number,
    alertLevel: string
  ): Promise<ChannelSendResult> {
    const subject = `[${alertLevel}] Budget Alert: ${budgetCode} at ${percentUsed}%`;
    const content =
      `Budget ${budgetCode} has reached ${percentUsed}% utilization.\n\n` +
      `Alert Level: ${alertLevel}\n` +
      `Action may be required to prevent overspend.`;

    return this.send({
      to,
      subject,
      content,
      type: "email",
      tags: [
        { name: "type", value: "alert" },
        { name: "alert_level", value: alertLevel },
      ],
    });
  }

  /**
   * Process Resend webhook events (opens, clicks, bounces)
   */
  parseWebhook(body: any): {
    type: string;
    emailId: string;
    recipient: string;
    timestamp: string;
  } {
    return {
      type: body.type, // e.g., "email.delivered", "email.opened", "email.bounced"
      emailId: body.data?.email_id || "",
      recipient: body.data?.to?.[0] || "",
      timestamp: body.created_at || new Date().toISOString(),
    };
  }

  private textToHtml(text: string): string {
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px;">
          <h2 style="color: #1e40af; margin: 0;">Talos Procurement AI</h2>
          <p style="color: #6b7280; margin: 4px 0 0;">Columbia University</p>
        </div>
        <div style="white-space: pre-wrap; line-height: 1.6; color: #374151;">
          ${text.replace(/\n/g, "<br>")}
        </div>
        <div style="border-top: 1px solid #e5e7eb; margin-top: 20px; padding-top: 16px; color: #9ca3af; font-size: 12px;">
          This is an automated message from the Talos Procurement AI Platform.
        </div>
      </div>
    `;
  }

  private buildReportHtml(reportType: string, content: string): string {
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">Procurement Report</h1>
          <p style="margin: 8px 0 0; opacity: 0.9;">${reportType} | ${new Date().toLocaleDateString()}</p>
        </div>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <div style="white-space: pre-wrap; line-height: 1.6; color: #374151;">
            ${content.replace(/\n/g, "<br>")}
          </div>
        </div>
        <div style="text-align: center; margin-top: 16px; color: #9ca3af; font-size: 12px;">
          Talos Procurement AI Platform | Columbia University
        </div>
      </div>
    `;
  }
}

// ============================================
// AgentMail - Agent Email Inboxes
// ============================================

export interface AgentMailConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface AgentMailInbox {
  id: string;
  email: string;
  agentId: string;
  displayName: string;
  createdAt: string;
}

export interface AgentMailSendOptions {
  inboxId: string;
  to: string | string[];
  subject: string;
  body: string;
  html?: string;
  threadId?: string; // For continuing email threads
  attachments?: Array<{
    filename: string;
    content: string;
    contentType: string;
  }>;
}

export interface AgentMailThread {
  threadId: string;
  subject: string;
  messages: Array<{
    messageId: string;
    from: string;
    to: string[];
    subject: string;
    body: string;
    timestamp: string;
    direction: "inbound" | "outbound";
  }>;
}

export class AgentMailChannel {
  private apiKey: string;
  private baseUrl: string;
  private inboxCache: Map<string, AgentMailInbox> = new Map();

  constructor(config: AgentMailConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://api.agentmail.to/v1";
  }

  /**
   * Create a new inbox for a Talos agent
   */
  async createInbox(
    agentId: string,
    displayName: string
  ): Promise<AgentMailInbox> {
    const response = await fetch(`${this.baseUrl}/inboxes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        displayName: `${displayName} (Talos)`,
        metadata: { agentId, platform: "talos" },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create AgentMail inbox: ${response.status}`);
    }

    const data = await response.json();
    const inbox: AgentMailInbox = {
      id: data.id,
      email: data.email,
      agentId,
      displayName,
      createdAt: data.createdAt,
    };

    this.inboxCache.set(agentId, inbox);
    return inbox;
  }

  /**
   * Get or create an inbox for a specific agent
   */
  async getInboxForAgent(agentId: string): Promise<AgentMailInbox> {
    if (this.inboxCache.has(agentId)) {
      return this.inboxCache.get(agentId)!;
    }

    // Try to find existing inbox
    const response = await fetch(
      `${this.baseUrl}/inboxes?metadata.agentId=${encodeURIComponent(agentId)}`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.inboxes?.length > 0) {
        const existing = data.inboxes[0];
        const inbox: AgentMailInbox = {
          id: existing.id,
          email: existing.email,
          agentId,
          displayName: existing.displayName,
          createdAt: existing.createdAt,
        };
        this.inboxCache.set(agentId, inbox);
        return inbox;
      }
    }

    // Create new inbox
    return this.createInbox(agentId, agentId);
  }

  /**
   * Send an email from an agent's inbox
   */
  async send(options: AgentMailSendOptions): Promise<ChannelSendResult> {
    try {
      const response = await fetch(
        `${this.baseUrl}/inboxes/${options.inboxId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            to: Array.isArray(options.to) ? options.to : [options.to],
            subject: options.subject,
            body: options.body,
            html: options.html,
            threadId: options.threadId,
            attachments: options.attachments,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        return { success: false, error: `AgentMail error: ${errorData}` };
      }

      const data = await response.json();
      return { success: true, messageId: data.messageId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "AgentMail send failed",
      };
    }
  }

  /**
   * Get messages from an agent's inbox
   */
  async getMessages(
    inboxId: string,
    options?: { limit?: number; unreadOnly?: boolean }
  ): Promise<any[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.unreadOnly) params.set("unread", "true");

    const response = await fetch(
      `${this.baseUrl}/inboxes/${inboxId}/messages?${params}`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }
    );

    if (!response.ok) return [];
    const data = await response.json();
    return data.messages || [];
  }

  /**
   * Get a full email thread
   */
  async getThread(inboxId: string, threadId: string): Promise<AgentMailThread | null> {
    const response = await fetch(
      `${this.baseUrl}/inboxes/${inboxId}/threads/${threadId}`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }
    );

    if (!response.ok) return null;
    return response.json();
  }

  /**
   * Send an RFQ via email to multiple vendors
   */
  async sendRFQ(
    agentId: string,
    vendorEmails: string[],
    rfqDetails: {
      rfqId: string;
      title: string;
      items: Array<{ description: string; quantity: number; unit: string }>;
      deadline: string;
      instructions: string;
    }
  ): Promise<Map<string, ChannelSendResult>> {
    const inbox = await this.getInboxForAgent(agentId);
    const results = new Map<string, ChannelSendResult>();

    const itemsTable = rfqDetails.items
      .map((item, i) => `${i + 1}. ${item.description} - Qty: ${item.quantity} ${item.unit}`)
      .join("\n");

    for (const vendorEmail of vendorEmails) {
      const result = await this.send({
        inboxId: inbox.id,
        to: vendorEmail,
        subject: `RFQ ${rfqDetails.rfqId}: ${rfqDetails.title}`,
        body:
          `Request for Quotation\n\n` +
          `RFQ ID: ${rfqDetails.rfqId}\n` +
          `Title: ${rfqDetails.title}\n` +
          `Response Deadline: ${rfqDetails.deadline}\n\n` +
          `Items Requested:\n${itemsTable}\n\n` +
          `Instructions:\n${rfqDetails.instructions}\n\n` +
          `Please reply to this email with your quotation.\n\n` +
          `Talos Procurement AI\nColumbia University`,
      });
      results.set(vendorEmail, result);
    }

    return results;
  }

  /**
   * Process an inbound AgentMail webhook
   */
  parseWebhook(body: any): InboundWebhookPayload {
    return {
      channel: "agentmail",
      from: body.from || body.sender,
      content: body.body || body.text || "",
      timestamp: body.timestamp || body.receivedAt || new Date().toISOString(),
      metadata: {
        messageId: body.messageId,
        inboxId: body.inboxId,
        threadId: body.threadId,
        subject: body.subject,
        attachments: body.attachments,
        headers: body.headers,
      },
    };
  }
}

// ============================================
// Unified Communication Manager
// ============================================

export class CommunicationManager {
  private sendblue: SendblueChannel;
  private vapi: VapiChannel;
  private resend: ResendChannel;
  private agentmail: AgentMailChannel;

  constructor(config: {
    sendblue: SendblueConfig;
    vapi: VapiConfig;
    resend: ResendConfig;
    agentmail: AgentMailConfig;
  }) {
    this.sendblue = new SendblueChannel(config.sendblue);
    this.vapi = new VapiChannel(config.vapi);
    this.resend = new ResendChannel(config.resend);
    this.agentmail = new AgentMailChannel(config.agentmail);
  }

  /**
   * Send a message through the best available channel
   */
  async sendBestChannel(
    recipient: {
      phone?: string;
      email?: string;
      agentInbox?: string;
    },
    message: string,
    options?: {
      urgent?: boolean;
      requiresResponse?: boolean;
      agentId?: string;
      subject?: string;
    }
  ): Promise<ChannelSendResult> {
    // Urgent + phone -> Sendblue SMS
    if (options?.urgent && recipient.phone) {
      return this.sendblue.send({
        to: recipient.phone,
        content: message,
        type: "sms",
      });
    }

    // Requires vendor response -> AgentMail
    if (options?.requiresResponse && options?.agentId) {
      const inbox = await this.agentmail.getInboxForAgent(options.agentId);
      return this.agentmail.send({
        inboxId: inbox.id,
        to: recipient.email || "",
        subject: options.subject || "Talos Procurement",
        body: message,
      });
    }

    // Default -> Resend email
    if (recipient.email) {
      return this.resend.send({
        to: recipient.email,
        subject: options?.subject || "Talos Procurement Update",
        content: message,
        type: "email",
      });
    }

    // Fallback -> SMS
    if (recipient.phone) {
      return this.sendblue.send({
        to: recipient.phone,
        content: message,
        type: "sms",
      });
    }

    return { success: false, error: "No valid contact method for recipient" };
  }

  getChannels() {
    return {
      sendblue: this.sendblue,
      vapi: this.vapi,
      resend: this.resend,
      agentmail: this.agentmail,
    };
  }
}

export default CommunicationManager;
