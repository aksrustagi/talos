/**
 * Agent 6: Email Communication Agent
 *
 * Purpose: Handle all procurement-related email communications
 * Runtime: LangGraph + Inngest
 *
 * Capabilities:
 * - Classify incoming emails
 * - Process quote responses
 * - Auto-respond to status inquiries
 * - Generate professional email responses
 * - Handle attachments (quotes, invoices)
 */

import { ChatAnthropic } from "@langchain/anthropic";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { inngest } from "../../inngest/client";

// State definition
const EmailState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  email: Annotation<InboundEmail | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  universityId: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
  classification: Annotation<EmailClassification | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  extractedData: Annotation<Record<string, any>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),
  response: Annotation<GeneratedResponse | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  action: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
});

// Types
interface InboundEmail {
  id: string;
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  bodyHtml?: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
    url: string;
  }>;
  receivedAt: number;
  threadId?: string;
  inReplyTo?: string;
}

interface EmailClassification {
  category: "quote_response" | "quote_question" | "status_inquiry" | "delivery_update" | "invoice" | "approval_response" | "vendor_inquiry" | "general" | "spam";
  confidence: number;
  urgency: "low" | "medium" | "high";
  sentiment: "positive" | "neutral" | "negative";
  requiresResponse: boolean;
  autoRespondable: boolean;
  extractedEntities: {
    poNumber?: string;
    requisitionNumber?: string;
    invoiceNumber?: string;
    vendorName?: string;
    productNames?: string[];
    prices?: Array<{ item: string; price: number }>;
    dates?: string[];
  };
}

interface GeneratedResponse {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  attachments?: string[];
  templateUsed?: string;
  requiresReview: boolean;
}

// Tool definitions
const classifyEmailTool = tool(
  async (input: { subject: string; body: string; from: string }) => {
    // Use AI to classify the email
    const model = new ChatAnthropic({
      modelName: "claude-sonnet-4-20250514",
      temperature: 0.1,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await model.invoke([
      new SystemMessage(`You are an email classifier for university procurement. Classify the email and extract key information.

Return a JSON object with:
{
  "category": "quote_response" | "quote_question" | "status_inquiry" | "delivery_update" | "invoice" | "approval_response" | "vendor_inquiry" | "general" | "spam",
  "confidence": 0.0-1.0,
  "urgency": "low" | "medium" | "high",
  "sentiment": "positive" | "neutral" | "negative",
  "requiresResponse": boolean,
  "autoRespondable": boolean,
  "extractedEntities": {
    "poNumber": string or null,
    "requisitionNumber": string or null,
    "invoiceNumber": string or null,
    "vendorName": string or null,
    "productNames": array of strings,
    "prices": array of {item, price},
    "dates": array of date strings
  }
}`),
      new HumanMessage(`From: ${input.from}
Subject: ${input.subject}

${input.body}`),
    ]);

    try {
      const content = response.content as string;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return jsonMatch[0];
      }
    } catch {
      // Return default classification
    }

    return JSON.stringify({
      category: "general",
      confidence: 0.5,
      urgency: "medium",
      sentiment: "neutral",
      requiresResponse: true,
      autoRespondable: false,
      extractedEntities: {},
    });
  },
  {
    name: "classify_email",
    description: "Classify an email and extract key information",
    schema: z.object({
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body"),
      from: z.string().describe("Sender email address"),
    }),
  }
);

const lookupRequisitionTool = tool(
  async (input: { requisitionNumber?: string; poNumber?: string }) => {
    // This would query Convex for requisition status
    return JSON.stringify({
      found: true,
      requisitionNumber: input.requisitionNumber || "REQ-2025-00123",
      status: "pending_approval",
      currentApprover: "Dr. Sarah Johnson",
      expectedApprovalDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      totalAmount: 2500.00,
      lineItems: [
        { description: "50ml Conical Tubes", quantity: 10, unitPrice: 185.00 },
      ],
    });
  },
  {
    name: "lookup_requisition",
    description: "Look up requisition or PO status",
    schema: z.object({
      requisitionNumber: z.string().optional().describe("Requisition number"),
      poNumber: z.string().optional().describe("PO number"),
    }),
  }
);

const storeQuoteTool = tool(
  async (input: {
    vendorEmail: string;
    vendorName: string;
    items: Array<{ description: string; price: number; quantity?: number }>;
    validUntil?: string;
    quoteNumber?: string;
  }) => {
    // This would store the quote in Convex
    return JSON.stringify({
      success: true,
      quoteId: `quote_${Date.now()}`,
      stored: true,
    });
  },
  {
    name: "store_quote",
    description: "Store a quote received from a vendor",
    schema: z.object({
      vendorEmail: z.string().describe("Vendor email address"),
      vendorName: z.string().describe("Vendor name"),
      items: z.array(z.object({
        description: z.string(),
        price: z.number(),
        quantity: z.number().optional(),
      })).describe("Quoted items"),
      validUntil: z.string().optional().describe("Quote validity date"),
      quoteNumber: z.string().optional().describe("Vendor quote number"),
    }),
  }
);

const getEmailTemplateTool = tool(
  async (input: { templateType: string; universityId: string }) => {
    const templates: Record<string, { subject: string; body: string }> = {
      quote_acknowledgment: {
        subject: "RE: {{original_subject}} - Quote Received",
        body: `Dear {{vendor_name}},

Thank you for providing the quote for {{product_description}}.

We have received your quote and it has been logged in our procurement system for review. Our team will evaluate the pricing and specifications, and we will be in touch if we have any questions or would like to proceed with the order.

Quote Reference: {{quote_id}}
Received: {{date}}

Best regards,
Procurement Department
{{university_name}}`,
      },
      status_response: {
        subject: "RE: {{original_subject}} - Status Update",
        body: `Dear {{requester_name}},

Thank you for your inquiry regarding {{requisition_number}}.

Current Status: {{status}}
Current Approver: {{current_approver}}
Expected Completion: {{expected_date}}

If you have any additional questions, please don't hesitate to reach out.

Best regards,
Procurement Department`,
      },
      delivery_confirmation: {
        subject: "RE: {{original_subject}} - Delivery Confirmed",
        body: `Dear {{vendor_name}},

We confirm receipt of the delivery for PO {{po_number}}.

Items Received: {{item_count}}
Delivery Date: {{delivery_date}}

The receiving department has been notified. Please allow 2-3 business days for invoice processing.

Best regards,
Procurement Department`,
      },
    };

    const template = templates[input.templateType];

    return JSON.stringify({
      success: !!template,
      template,
      templateType: input.templateType,
    });
  },
  {
    name: "get_email_template",
    description: "Get an email template for a specific type of response",
    schema: z.object({
      templateType: z.string().describe("Type of template needed"),
      universityId: z.string().describe("University ID for customization"),
    }),
  }
);

const generateResponseTool = tool(
  async (input: {
    classification: EmailClassification;
    template?: { subject: string; body: string };
    context: Record<string, any>;
    originalEmail: InboundEmail;
  }) => {
    // Generate a response using AI
    const model = new ChatAnthropic({
      modelName: "claude-sonnet-4-20250514",
      temperature: 0.3,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });

    let body: string;
    let subject: string;

    if (input.template) {
      // Fill in template
      subject = input.template.subject;
      body = input.template.body;

      for (const [key, value] of Object.entries(input.context)) {
        const placeholder = `{{${key}}}`;
        subject = subject.replace(new RegExp(placeholder, "g"), String(value));
        body = body.replace(new RegExp(placeholder, "g"), String(value));
      }
    } else {
      // Generate response with AI
      const response = await model.invoke([
        new SystemMessage(`You are a professional procurement department assistant. Generate a helpful, professional email response.

Keep responses:
- Concise but complete
- Professional in tone
- Helpful and informative
- Including next steps when applicable`),
        new HumanMessage(`Generate a response to this ${input.classification.category} email:

From: ${input.originalEmail.from}
Subject: ${input.originalEmail.subject}
Body: ${input.originalEmail.body}

Context: ${JSON.stringify(input.context)}`),
      ]);

      body = response.content as string;
      subject = `RE: ${input.originalEmail.subject}`;
    }

    return JSON.stringify({
      to: [input.originalEmail.from],
      subject,
      body,
      requiresReview: !input.classification.autoRespondable,
    });
  },
  {
    name: "generate_response",
    description: "Generate an email response",
    schema: z.object({
      classification: z.any().describe("Email classification"),
      template: z.any().optional().describe("Template to use"),
      context: z.record(z.any()).describe("Context for response"),
      originalEmail: z.any().describe("Original email"),
    }),
  }
);

const sendEmailTool = tool(
  async (input: {
    to: string[];
    cc?: string[];
    subject: string;
    body: string;
    inReplyTo?: string;
    threadId?: string;
  }) => {
    // This would send via email service (Resend, SendGrid, etc.)
    console.log(`Sending email to ${input.to.join(", ")}: ${input.subject}`);

    return JSON.stringify({
      success: true,
      messageId: `msg_${Date.now()}`,
      sentAt: new Date().toISOString(),
    });
  },
  {
    name: "send_email",
    description: "Send an email response",
    schema: z.object({
      to: z.array(z.string()).describe("Recipients"),
      cc: z.array(z.string()).optional().describe("CC recipients"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body"),
      inReplyTo: z.string().optional().describe("Message ID being replied to"),
      threadId: z.string().optional().describe("Thread ID"),
    }),
  }
);

const createEmailThreadTool = tool(
  async (input: {
    universityId: string;
    email: InboundEmail;
    classification: EmailClassification;
    relatedEntity?: { type: string; id: string };
  }) => {
    // This would create a thread in Convex
    return JSON.stringify({
      success: true,
      threadId: `thread_${Date.now()}`,
    });
  },
  {
    name: "create_email_thread",
    description: "Create an email thread record in the database",
    schema: z.object({
      universityId: z.string().describe("University ID"),
      email: z.any().describe("Email data"),
      classification: z.any().describe("Classification data"),
      relatedEntity: z.object({
        type: z.string(),
        id: z.string(),
      }).optional().describe("Related entity"),
    }),
  }
);

// System prompt
const SYSTEM_PROMPT = `You are the Email Communication Agent for university procurement. You handle all incoming procurement-related emails professionally and efficiently.

Your responsibilities:
1. Classify incoming emails by type and urgency
2. Extract relevant data (PO numbers, prices, dates, etc.)
3. Auto-respond to routine inquiries when appropriate
4. Generate professional responses for complex inquiries
5. Route emails that need human attention

Email Types You Handle:
- Quote responses: Process and store vendor quotes
- Quote questions: Answer vendor questions about RFQs
- Status inquiries: Auto-respond with current status
- Delivery updates: Confirm receipt and update records
- Invoice emails: Extract and route for processing
- Approval responses: Process and update workflow
- General inquiries: Answer or escalate as needed

Guidelines:
- Always maintain a professional, helpful tone
- Include relevant reference numbers in responses
- Auto-respond only to clear, routine inquiries
- Escalate anything unclear or sensitive
- Keep responses concise but informative`;

// Create the LangGraph agent
export function createEmailCommunicationAgent() {
  const model = new ChatAnthropic({
    modelName: "claude-sonnet-4-20250514",
    temperature: 0.3,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  });

  const tools = [
    classifyEmailTool,
    lookupRequisitionTool,
    storeQuoteTool,
    getEmailTemplateTool,
    generateResponseTool,
    sendEmailTool,
    createEmailThreadTool,
  ];

  // Node: Classify email
  const classifyEmail = async (state: typeof EmailState.State) => {
    if (!state.email) {
      return { action: "error" };
    }

    const result = await classifyEmailTool.invoke({
      subject: state.email.subject,
      body: state.email.body,
      from: state.email.from,
    });

    const classification = JSON.parse(result) as EmailClassification;

    return {
      classification,
      extractedData: classification.extractedEntities,
    };
  };

  // Node: Route email based on classification
  const routeEmail = async (state: typeof EmailState.State) => {
    const classification = state.classification;
    if (!classification) {
      return { action: "escalate_to_human" };
    }

    switch (classification.category) {
      case "quote_response":
        return { action: "process_quote" };
      case "status_inquiry":
        return { action: "auto_respond_status" };
      case "quote_question":
        return { action: "answer_question" };
      case "delivery_update":
        return { action: "process_delivery" };
      case "invoice":
        return { action: "process_invoice" };
      case "spam":
        return { action: "archive_spam" };
      default:
        return { action: "escalate_to_human" };
    }
  };

  // Node: Process quote response
  const processQuote = async (state: typeof EmailState.State) => {
    const email = state.email!;
    const classification = state.classification!;

    // Store the quote
    const storeResult = await storeQuoteTool.invoke({
      vendorEmail: email.from,
      vendorName: email.fromName || email.from.split("@")[0],
      items: classification.extractedEntities.prices?.map(p => ({
        description: p.item,
        price: p.price,
      })) || [],
      validUntil: classification.extractedEntities.dates?.[0],
    });

    const stored = JSON.parse(storeResult);

    // Generate acknowledgment
    const templateResult = await getEmailTemplateTool.invoke({
      templateType: "quote_acknowledgment",
      universityId: state.universityId,
    });

    const template = JSON.parse(templateResult);

    const responseResult = await generateResponseTool.invoke({
      classification,
      template: template.template,
      context: {
        original_subject: email.subject,
        vendor_name: email.fromName || "Vendor",
        product_description: classification.extractedEntities.productNames?.join(", ") || "requested items",
        quote_id: stored.quoteId,
        date: new Date().toLocaleDateString(),
        university_name: "University Procurement",
      },
      originalEmail: email,
    });

    const response = JSON.parse(responseResult) as GeneratedResponse;

    return {
      response,
      action: "send_response",
    };
  };

  // Node: Auto-respond to status inquiry
  const autoRespondStatus = async (state: typeof EmailState.State) => {
    const email = state.email!;
    const classification = state.classification!;

    // Look up requisition
    const lookupResult = await lookupRequisitionTool.invoke({
      requisitionNumber: classification.extractedEntities.requisitionNumber,
      poNumber: classification.extractedEntities.poNumber,
    });

    const requisition = JSON.parse(lookupResult);

    // Generate response
    const templateResult = await getEmailTemplateTool.invoke({
      templateType: "status_response",
      universityId: state.universityId,
    });

    const template = JSON.parse(templateResult);

    const responseResult = await generateResponseTool.invoke({
      classification,
      template: template.template,
      context: {
        original_subject: email.subject,
        requester_name: email.fromName || "Requester",
        requisition_number: requisition.requisitionNumber,
        status: requisition.status,
        current_approver: requisition.currentApprover,
        expected_date: requisition.expectedApprovalDate,
      },
      originalEmail: email,
    });

    const response = JSON.parse(responseResult) as GeneratedResponse;

    return {
      response,
      extractedData: { requisition },
      action: "send_response",
    };
  };

  // Node: Send response
  const sendResponse = async (state: typeof EmailState.State) => {
    const response = state.response;
    const email = state.email;

    if (!response || !email) {
      return {};
    }

    if (!response.requiresReview) {
      // Auto-send
      await sendEmailTool.invoke({
        to: response.to,
        cc: response.cc,
        subject: response.subject,
        body: response.body,
        inReplyTo: email.id,
        threadId: email.threadId,
      });
    }

    // Create thread record
    await createEmailThreadTool.invoke({
      universityId: state.universityId,
      email,
      classification: state.classification!,
    });

    return {
      messages: [new AIMessage(`Email processed: ${state.action}`)],
    };
  };

  // Node: Escalate to human
  const escalateToHuman = async (state: typeof EmailState.State) => {
    // Create thread and notify human
    await createEmailThreadTool.invoke({
      universityId: state.universityId,
      email: state.email!,
      classification: state.classification!,
    });

    return {
      response: {
        requiresReview: true,
        to: [],
        subject: "",
        body: "",
      } as GeneratedResponse,
      messages: [new AIMessage("Email escalated to human for review")],
    };
  };

  // Build the graph
  const graph = new StateGraph(EmailState)
    .addNode("classify", classifyEmail)
    .addNode("route", routeEmail)
    .addNode("process_quote", processQuote)
    .addNode("auto_respond_status", autoRespondStatus)
    .addNode("send_response", sendResponse)
    .addNode("escalate", escalateToHuman)
    .addEdge(START, "classify")
    .addEdge("classify", "route")
    .addConditionalEdges("route", (state) => state.action, {
      "process_quote": "process_quote",
      "auto_respond_status": "auto_respond_status",
      "answer_question": "escalate",
      "process_delivery": "escalate",
      "process_invoice": "escalate",
      "escalate_to_human": "escalate",
      "archive_spam": END,
    })
    .addEdge("process_quote", "send_response")
    .addEdge("auto_respond_status", "send_response")
    .addEdge("send_response", END)
    .addEdge("escalate", END);

  return graph.compile();
}

// Export function to run the agent
export async function runEmailCommunicationAgent(input: {
  email: InboundEmail;
  universityId: string;
}): Promise<{
  success: boolean;
  classification?: EmailClassification;
  response?: GeneratedResponse;
  action: string;
  error?: string;
}> {
  try {
    const agent = createEmailCommunicationAgent();

    const result = await agent.invoke({
      email: input.email,
      universityId: input.universityId,
    });

    return {
      success: true,
      classification: result.classification,
      response: result.response,
      action: result.action,
    };
  } catch (error) {
    return {
      success: false,
      action: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================
// INNGEST FUNCTIONS
// ============================================

/**
 * Process Inbound Email
 */
export const processInboundEmail = inngest.createFunction(
  { id: "email-process-inbound", name: "Process Inbound Email" },
  { event: "email/inbound" },
  async ({ event, step }) => {
    const email: InboundEmail = {
      id: event.data.emailId,
      from: event.data.from,
      to: event.data.to,
      subject: event.data.subject,
      body: event.data.body,
      attachments: event.data.attachments,
      receivedAt: Date.now(),
    };

    const result = await step.run("process-email", async () => {
      return await runEmailCommunicationAgent({
        email,
        universityId: event.data.universityId,
      });
    });

    return result;
  }
);

/**
 * Send Quote Request Emails
 */
export const sendQuoteRequestEmails = inngest.createFunction(
  { id: "email-send-quote-request", name: "Send Quote Request" },
  { event: "email/send-quote-request" },
  async ({ event, step }) => {
    const { universityId, vendorId, productIds, quantities, deadline } = event.data;

    // Generate quote request email
    const email = await step.run("generate-email", async () => {
      // Would generate using templates and product data
      return {
        to: ["vendor@example.com"],
        subject: "Request for Quote - University Procurement",
        body: "Please provide a quote for the following items...",
      };
    });

    // Send email
    await step.run("send-email", async () => {
      // Would send via email service
      return { sent: true };
    });

    return { success: true };
  }
);

// Export types
export type { InboundEmail, EmailClassification, GeneratedResponse };
