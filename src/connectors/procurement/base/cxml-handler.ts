/**
 * cXML Handler
 *
 * Handles parsing and generation of cXML documents for procurement.
 * Supports:
 * - PunchOutSetupRequest/Response
 * - PunchOutOrderMessage
 * - OrderRequest
 * - InvoiceDetailRequest
 * - ConfirmationRequest
 */

import { XMLParser, XMLBuilder } from "fast-xml-parser";
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  Invoice,
  InvoiceLine,
  PunchoutSession,
  PunchoutCart,
  PunchoutCartItem,
  Address,
} from "./types";

/**
 * cXML credential info
 */
export interface CXMLCredential {
  identity: string;
  domain: string;
  sharedSecret: string;
}

/**
 * cXML message types
 */
export type CXMLMessageType =
  | "PunchOutSetupRequest"
  | "PunchOutSetupResponse"
  | "PunchOutOrderMessage"
  | "OrderRequest"
  | "OrderResponse"
  | "ConfirmationRequest"
  | "InvoiceDetailRequest"
  | "StatusUpdateRequest";

/**
 * cXML Handler for parsing and generating cXML documents
 */
export class CXMLHandler {
  private parser: XMLParser;
  private builder: XMLBuilder;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      parseTagValue: true,
      parseAttributeValue: true,
      trimValues: true,
    });

    this.builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      format: true,
      indentBy: "  ",
    });
  }

  // ============================================================================
  // Punchout cXML
  // ============================================================================

  /**
   * Generate PunchOutSetupRequest cXML
   */
  generatePunchoutSetupRequest(options: {
    fromCredential: CXMLCredential;
    toCredential: CXMLCredential;
    senderCredential: CXMLCredential;
    buyerCookie: string;
    browserFormPost: string;
    operation?: "create" | "edit" | "inspect";
    userId?: string;
    userEmail?: string;
    extrinsics?: Record<string, string>;
  }): string {
    const timestamp = new Date().toISOString();
    const payloadId = `${Date.now()}.${Math.random().toString(36).slice(2)}@talos.procurement`;

    const cxml = {
      "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
      "!DOCTYPE": {
        "@_cXML": "",
        "@_SYSTEM": "http://xml.cxml.org/schemas/cXML/1.2.050/cXML.dtd",
      },
      cXML: {
        "@_version": "1.2.050",
        "@_payloadID": payloadId,
        "@_timestamp": timestamp,
        Header: {
          From: {
            Credential: {
              "@_domain": options.fromCredential.domain,
              Identity: options.fromCredential.identity,
            },
          },
          To: {
            Credential: {
              "@_domain": options.toCredential.domain,
              Identity: options.toCredential.identity,
            },
          },
          Sender: {
            Credential: {
              "@_domain": options.senderCredential.domain,
              Identity: options.senderCredential.identity,
              SharedSecret: options.senderCredential.sharedSecret,
            },
            UserAgent: "Talos Procurement AI/1.0",
          },
        },
        Request: {
          PunchOutSetupRequest: {
            "@_operation": options.operation || "create",
            BuyerCookie: options.buyerCookie,
            Extrinsic: this.buildExtrinsics({
              User: options.userId,
              UserEmail: options.userEmail,
              ...options.extrinsics,
            }),
            BrowserFormPost: {
              URL: options.browserFormPost,
            },
            Contact: options.userEmail
              ? {
                  Email: options.userEmail,
                }
              : undefined,
          },
        },
      },
    };

    return this.builder.build(cxml);
  }

  /**
   * Parse PunchOutSetupResponse cXML
   */
  parsePunchoutSetupResponse(xml: string): {
    success: boolean;
    statusCode: string;
    statusText: string;
    startPageUrl?: string;
    error?: string;
  } {
    try {
      const parsed = this.parser.parse(xml);
      const cxml = parsed.cXML;

      if (!cxml) {
        return { success: false, statusCode: "500", statusText: "Invalid cXML" };
      }

      const response = cxml.Response;
      if (!response) {
        return { success: false, statusCode: "500", statusText: "No Response element" };
      }

      const status = response.Status;
      const statusCode = status?.["@_code"] || "500";
      const statusText = status?.["@_text"] || status?.["#text"] || "Unknown";

      if (statusCode !== "200") {
        return { success: false, statusCode, statusText };
      }

      const punchoutResponse = response.PunchOutSetupResponse;
      const startPageUrl = punchoutResponse?.StartPage?.URL;

      return {
        success: true,
        statusCode,
        statusText,
        startPageUrl,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: "500",
        statusText: "Parse error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Parse PunchOutOrderMessage (cart return) cXML
   */
  parsePunchoutOrderMessage(xml: string): PunchoutCart | null {
    try {
      const parsed = this.parser.parse(xml);
      const message = parsed.cXML?.Message?.PunchOutOrderMessage;

      if (!message) {
        return null;
      }

      const header = message.PunchOutOrderMessageHeader;
      const buyerCookie = message.BuyerCookie;

      const itemInArray = Array.isArray(message.ItemIn)
        ? message.ItemIn
        : [message.ItemIn];

      const items: PunchoutCartItem[] = itemInArray.map((item: any) => {
        const detail = item.ItemDetail;
        const id = item.ItemID;

        return {
          supplierItemId: id?.SupplierPartID || "",
          description: detail?.Description?.["#text"] || detail?.Description || "",
          quantity: parseFloat(item["@_quantity"]) || 1,
          unitOfMeasure: detail?.UnitOfMeasure || "EA",
          unitPrice: parseFloat(detail?.UnitPrice?.Money?.["#text"]) || 0,
          extendedPrice:
            (parseFloat(item["@_quantity"]) || 1) *
            (parseFloat(detail?.UnitPrice?.Money?.["#text"]) || 0),
          manufacturerPartNumber: detail?.ManufacturerPartID,
          manufacturer: detail?.ManufacturerName,
          classification: detail?.Classification
            ? {
                code: detail.Classification["#text"],
                domain: detail.Classification["@_domain"],
              }
            : undefined,
        };
      });

      const total = items.reduce((sum, item) => sum + item.extendedPrice, 0);

      return {
        sessionId: buyerCookie || "",
        items,
        total,
        currency: header?.Total?.Money?.["@_currency"] || "USD",
        receivedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Failed to parse PunchOutOrderMessage:", error);
      return null;
    }
  }

  // ============================================================================
  // Order cXML
  // ============================================================================

  /**
   * Generate OrderRequest cXML for sending PO to supplier
   */
  generateOrderRequest(options: {
    fromCredential: CXMLCredential;
    toCredential: CXMLCredential;
    senderCredential: CXMLCredential;
    order: PurchaseOrder;
  }): string {
    const timestamp = new Date().toISOString();
    const payloadId = `${options.order.poNumber}.${Date.now()}@talos.procurement`;

    const cxml = {
      "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
      "!DOCTYPE": {
        "@_cXML": "",
        "@_SYSTEM": "http://xml.cxml.org/schemas/cXML/1.2.050/cXML.dtd",
      },
      cXML: {
        "@_version": "1.2.050",
        "@_payloadID": payloadId,
        "@_timestamp": timestamp,
        Header: this.buildHeader(
          options.fromCredential,
          options.toCredential,
          options.senderCredential
        ),
        Request: {
          "@_deploymentMode": this.getDeploymentMode(),
          OrderRequest: {
            OrderRequestHeader: this.buildOrderRequestHeader(options.order),
            ItemOut: options.order.lineItems.map((line, index) =>
              this.buildItemOut(line, index + 1)
            ),
          },
        },
      },
    };

    return this.builder.build(cxml);
  }

  /**
   * Parse OrderResponse cXML
   */
  parseOrderResponse(xml: string): {
    success: boolean;
    statusCode: string;
    statusText: string;
    confirmationId?: string;
  } {
    try {
      const parsed = this.parser.parse(xml);
      const response = parsed.cXML?.Response;

      if (!response) {
        return { success: false, statusCode: "500", statusText: "No Response element" };
      }

      const status = response.Status;
      const statusCode = status?.["@_code"] || "500";
      const statusText = status?.["@_text"] || "Unknown";

      return {
        success: statusCode === "200",
        statusCode,
        statusText,
        confirmationId: response.OrderResponse?.OrderReference?.["@_orderID"],
      };
    } catch (error) {
      return {
        success: false,
        statusCode: "500",
        statusText: "Parse error",
      };
    }
  }

  // ============================================================================
  // Invoice cXML
  // ============================================================================

  /**
   * Parse InvoiceDetailRequest cXML (incoming invoice)
   */
  parseInvoiceDetailRequest(xml: string): Invoice | null {
    try {
      const parsed = this.parser.parse(xml);
      const request = parsed.cXML?.Request?.InvoiceDetailRequest;

      if (!request) {
        return null;
      }

      const header = request.InvoiceDetailRequestHeader;
      const order = request.InvoiceDetailOrder;

      const lineItems: InvoiceLine[] = [];
      const items = Array.isArray(order?.InvoiceDetailItem)
        ? order.InvoiceDetailItem
        : [order?.InvoiceDetailItem].filter(Boolean);

      items.forEach((item: any, index: number) => {
        lineItems.push({
          lineNumber: index + 1,
          poLineNumber: parseInt(item?.InvoiceDetailItemReference?.["@_lineNumber"]) || undefined,
          itemId: item?.ItemID?.SupplierPartID,
          description: item?.InvoiceDetailItemReference?.Description?.["#text"] || "",
          quantity: parseFloat(item?.["@_quantity"]) || 1,
          unitOfMeasure: item?.UnitOfMeasure || "EA",
          unitPrice: parseFloat(item?.UnitPrice?.Money?.["#text"]) || 0,
          extendedPrice: parseFloat(item?.SubtotalAmount?.Money?.["#text"]) || 0,
          matchStatus: "pending",
        });
      });

      const summary = request.InvoiceDetailSummary;

      return {
        id: `inv_${Date.now()}`,
        invoiceNumber: header?.["@_invoiceID"] || "",
        poNumbers: [header?.InvoiceDetailHeaderIndicator?.["@_orderID"]].filter(Boolean),
        supplier: {
          id: header?.InvoiceDetailSupplierInfo?.["@_supplierID"] || "",
          name: "", // Would be populated from supplier lookup
        },
        invoiceDate: header?.["@_invoiceDate"] || new Date().toISOString(),
        dueDate: header?.["@_dueDate"] || "",
        lineItems,
        subtotal: parseFloat(summary?.SubtotalAmount?.Money?.["#text"]) || 0,
        tax: parseFloat(summary?.Tax?.Money?.["#text"]) || 0,
        shipping: parseFloat(summary?.ShippingAmount?.Money?.["#text"]) || 0,
        discount: parseFloat(summary?.DiscountAmount?.Money?.["#text"]) || 0,
        total: parseFloat(summary?.InvoiceDetailSummaryTotal?.Money?.["#text"]) || 0,
        currency: summary?.SubtotalAmount?.Money?.["@_currency"] || "USD",
        status: "received",
        matchStatus: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Failed to parse InvoiceDetailRequest:", error);
      return null;
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private buildHeader(
    from: CXMLCredential,
    to: CXMLCredential,
    sender: CXMLCredential
  ): object {
    return {
      From: {
        Credential: {
          "@_domain": from.domain,
          Identity: from.identity,
        },
      },
      To: {
        Credential: {
          "@_domain": to.domain,
          Identity: to.identity,
        },
      },
      Sender: {
        Credential: {
          "@_domain": sender.domain,
          Identity: sender.identity,
          SharedSecret: sender.sharedSecret,
        },
        UserAgent: "Talos Procurement AI/1.0",
      },
    };
  }

  private buildOrderRequestHeader(order: PurchaseOrder): object {
    return {
      "@_orderID": order.poNumber,
      "@_orderDate": order.orderDate,
      "@_type": "new",
      Total: {
        Money: {
          "@_currency": order.currency,
          "#text": order.total.toFixed(2),
        },
      },
      ShipTo: this.buildAddress(order.shipTo, "ShipTo"),
      BillTo: this.buildAddress(order.billTo, "BillTo"),
      Shipping: order.shippingMethod
        ? {
            Money: {
              "@_currency": order.currency,
              "#text": order.shipping.toFixed(2),
            },
            Description: order.shippingMethod,
          }
        : undefined,
      Tax: {
        Money: {
          "@_currency": order.currency,
          "#text": order.tax.toFixed(2),
        },
        Description: "Tax",
      },
      Payment: order.paymentTerms
        ? {
            PCard: undefined, // Would add PCard info if applicable
          }
        : undefined,
      Comments: order.specialInstructions,
    };
  }

  private buildItemOut(line: PurchaseOrderLine, lineNumber: number): object {
    return {
      "@_quantity": line.quantity,
      "@_lineNumber": lineNumber,
      ItemID: {
        SupplierPartID: line.supplierItemId,
      },
      ItemDetail: {
        UnitPrice: {
          Money: {
            "@_currency": "USD",
            "#text": line.unitPrice.toFixed(2),
          },
        },
        Description: {
          "@_xml:lang": "en",
          "#text": line.description,
        },
        UnitOfMeasure: line.unitOfMeasure,
        Classification: {
          "@_domain": "UNSPSC",
          "#text": "", // Would add UNSPSC code
        },
      },
      ScheduleLine: line.requestedDeliveryDate
        ? {
            "@_quantity": line.quantity,
            "@_requestedDeliveryDate": line.requestedDeliveryDate,
          }
        : undefined,
      Distribution: line.accounting
        ? {
            Accounting: {
              "@_name": "default",
              Segment: this.buildAccountingSegments(line.accounting),
            },
          }
        : undefined,
    };
  }

  private buildAddress(address: Address, _type: string): object {
    return {
      Address: {
        Name: address.name,
        PostalAddress: {
          Street: [address.street1, address.street2].filter(Boolean),
          City: address.city,
          State: address.state,
          PostalCode: address.postalCode,
          Country: {
            "@_isoCountryCode": this.getCountryCode(address.country),
            "#text": address.country,
          },
        },
        Email: address.email,
        Phone: address.phone
          ? {
              TelephoneNumber: {
                Number: address.phone,
              },
            }
          : undefined,
      },
    };
  }

  private buildAccountingSegments(accounting: PurchaseOrderLine["accounting"]): object[] {
    if (!accounting) return [];

    const segments: object[] = [];

    if (accounting.fund) {
      segments.push({ "@_type": "Fund", "@_id": accounting.fund });
    }
    if (accounting.department) {
      segments.push({ "@_type": "Department", "@_id": accounting.department });
    }
    if (accounting.project) {
      segments.push({ "@_type": "Project", "@_id": accounting.project });
    }
    if (accounting.glAccount) {
      segments.push({ "@_type": "GLAccount", "@_id": accounting.glAccount });
    }
    if (accounting.costCenter) {
      segments.push({ "@_type": "CostCenter", "@_id": accounting.costCenter });
    }

    // Add custom segments
    if (accounting.segments) {
      for (const [type, id] of Object.entries(accounting.segments)) {
        segments.push({ "@_type": type, "@_id": id });
      }
    }

    return segments;
  }

  private buildExtrinsics(data: Record<string, string | undefined>): object[] {
    return Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([name, value]) => ({
        "@_name": name,
        "#text": value,
      }));
  }

  private getCountryCode(country: string): string {
    const codes: Record<string, string> = {
      "United States": "US",
      USA: "US",
      US: "US",
      Canada: "CA",
      CA: "CA",
      "United Kingdom": "GB",
      UK: "GB",
      GB: "GB",
    };
    return codes[country] || country.slice(0, 2).toUpperCase();
  }

  private getDeploymentMode(): string {
    return process.env.NODE_ENV === "production" ? "production" : "test";
  }

  /**
   * Generate a cXML response (for incoming requests)
   */
  generateResponse(statusCode: string, statusText: string): string {
    const timestamp = new Date().toISOString();
    const payloadId = `response.${Date.now()}@talos.procurement`;

    const cxml = {
      "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
      cXML: {
        "@_version": "1.2.050",
        "@_payloadID": payloadId,
        "@_timestamp": timestamp,
        Response: {
          Status: {
            "@_code": statusCode,
            "@_text": statusText,
          },
        },
      },
    };

    return this.builder.build(cxml);
  }
}

// Export singleton
export const cxmlHandler = new CXMLHandler();
