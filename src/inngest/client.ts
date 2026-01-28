/**
 * Inngest Client Configuration
 *
 * Inngest provides durable execution for AI agent functions with:
 * - Automatic retries and error handling
 * - Event-driven scheduling
 * - Cron-based scheduled jobs
 * - Step functions for complex workflows
 */

import { Inngest } from "inngest";

// Define event types for type safety
type ProcurementEvents = {
  // Catalog Intelligence Events
  "catalog/search-request": {
    data: {
      universityId: string;
      query: string;
      productType?: string;
      specifications?: Record<string, any>;
      budgetLimit?: number;
      urgencyLevel?: "standard" | "rush" | "emergency";
    };
  };
  "catalog/sync-scheduled": {
    data: {
      universityId: string;
      vendorId: string;
    };
  };

  // Price Discovery Events
  "price/check-scheduled": {
    data: {
      universityId: string;
    };
  };
  "price/opportunity-found": {
    data: {
      universityId: string;
      productId: string;
      vendorId: string;
      currentPrice: number;
      opportunityPrice: number;
      potentialSavings: number;
    };
  };
  "vendor/call-for-quote": {
    data: {
      universityId: string;
      opportunityId: string;
      vendorId: string;
      productId: string;
      vendorPhone?: string;
    };
  };

  // Vendor Intelligence Events
  "vendor/assessment-request": {
    data: {
      universityId: string;
      vendorId: string;
      assessmentType: "new" | "quarterly" | "risk" | "renewal";
    };
  };
  "vendor/risk-alert": {
    data: {
      universityId: string;
      vendorId: string;
      riskType: string;
      severity: "low" | "medium" | "high" | "critical";
    };
  };

  // Email Communication Events
  "email/inbound": {
    data: {
      universityId: string;
      emailId: string;
      from: string;
      to: string[];
      subject: string;
      body: string;
      attachments?: Array<{
        filename: string;
        contentType: string;
        url: string;
      }>;
    };
  };
  "email/send-quote-request": {
    data: {
      universityId: string;
      vendorId: string;
      productIds: string[];
      quantities: number[];
      deadline?: string;
    };
  };
  "email/send-reminder": {
    data: {
      universityId: string;
      type: "approval" | "quote" | "delivery";
      recipientId: string;
      entityId: string;
    };
  };

  // Software License Events
  "license/check-usage": {
    data: {
      universityId: string;
    };
  };
  "license/renewal-approaching": {
    data: {
      universityId: string;
      licenseId: string;
      renewalDate: string;
      daysUntilRenewal: number;
    };
  };
  "license/optimize": {
    data: {
      universityId: string;
      licenseId: string;
    };
  };

  // Generic workflow events
  "workflow/step-completed": {
    data: {
      workflowId: string;
      stepId: string;
      status: "success" | "failure";
      output?: any;
    };
  };
};

// Create the Inngest client
export const inngest = new Inngest({
  id: "talos-procurement-ai",
  schemas: new Map() as any, // Type assertion for event schemas
});

// Export typed event sender
export type InngestEvents = ProcurementEvents;
