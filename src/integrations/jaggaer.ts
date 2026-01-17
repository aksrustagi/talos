/**
 * Jaggaer eProcurement Integration
 *
 * Implements cXML protocol for Purchase Orders, Invoices, and PunchOut sessions.
 * Supports standard cXML 1.2 specification for university procurement systems.
 */

import { XMLParser, XMLBuilder } from "fast-xml-parser";

// ============================================
// Configuration Types
// ============================================

export interface JaggaerConfig {
  baseUrl: string;
  username: string;
  password: string;
  senderId: string;
  senderDomain: string;
  sharedSecret: string;
  buyerCookie?: string;
}

export interface PurchaseOrderData {
  poNumber: string;
  orderDate: string;
  vendorDuns: string;
  vendorId: string;
  shipTo: {
    name: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    countryCode: string;
  };
  billTo: {
    name: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    countryCode: string;
  };
  lineItems: Array<{
    lineNumber: number;
    quantity: number;
    vendorSku: string;
    description: string;
    unitPrice: number;
    uom: string;
    currency?: string;
  }>;
  total: number;
  currency?: string;
  comments?: string;
}

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  currency: string;
  lineItems: Array<{
    lineNumber: number;
    poLineNumber?: number;
    quantity: number;
    vendorSku: string;
    description: string;
    unitPrice: number;
    amount: number;
    uom: string;
  }>;
  dueDate?: string;
  paymentTerms?: string;
}

export interface PunchOutItem {
  quantity: number;
  vendorSku: string;
  vendorProductName: string;
  description: string;
  unitPrice: number;
  uom: string;
  currency: string;
  manufacturerPartNumber?: string;
  manufacturerName?: string;
  unspsc?: string;
}

export interface CXMLResponse {
  success: boolean;
  statusCode: string;
  statusText: string;
  payloadId?: string;
  timestamp?: string;
  data?: Record<string, unknown>;
}

// ============================================
// Jaggaer Integration Class
// ============================================

export class JaggaerIntegration {
  private config: JaggaerConfig;
  private xmlParser: XMLParser;
  private xmlBuilder: XMLBuilder;

  constructor(config: JaggaerConfig) {
    this.config = config;
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
    });
    this.xmlBuilder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      format: true,
    });
  }

  // ============================================
  // cXML Header Generation
  // ============================================

  private generatePayloadId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${timestamp}.${random}@${this.config.senderDomain}`;
  }

  private buildCXMLHeader(toIdentity: string, toDomain: string = "DUNS"): object {
    return {
      Header: {
        From: {
          Credential: {
            "@_domain": this.config.senderDomain,
            Identity: this.config.senderId,
          },
        },
        To: {
          Credential: {
            "@_domain": toDomain,
            Identity: toIdentity,
          },
        },
        Sender: {
          Credential: {
            "@_domain": this.config.senderDomain,
            Identity: this.config.senderId,
            SharedSecret: this.config.sharedSecret,
          },
          UserAgent: "Talos Procurement Platform v1.0",
        },
      },
    };
  }

  // ============================================
  // Purchase Order Transmission
  // ============================================

  async sendPurchaseOrder(poData: PurchaseOrderData): Promise<CXMLResponse> {
    const payloadId = this.generatePayloadId();
    const timestamp = new Date().toISOString();

    const cxml = this.buildOrderRequest(poData, payloadId, timestamp);

    try {
      const response = await fetch(`${this.config.baseUrl}/cxml/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/xml",
        },
        body: cxml,
      });

      const responseText = await response.text();
      return this.parseCXMLResponse(responseText);
    } catch (error) {
      return {
        success: false,
        statusCode: "500",
        statusText: `Failed to send PO: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  private buildOrderRequest(
    poData: PurchaseOrderData,
    payloadId: string,
    timestamp: string
  ): string {
    const currency = poData.currency || "USD";

    const cxmlDocument = {
      "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
      "!DOCTYPE": "cXML SYSTEM \"http://xml.cXML.org/schemas/cXML/1.2.014/cXML.dtd\"",
      cXML: {
        "@_payloadID": payloadId,
        "@_timestamp": timestamp,
        "@_xml:lang": "en-US",
        ...this.buildCXMLHeader(poData.vendorDuns, "DUNS"),
        Request: {
          "@_deploymentMode": "production",
          OrderRequest: {
            OrderRequestHeader: {
              "@_orderID": poData.poNumber,
              "@_orderDate": poData.orderDate,
              "@_type": "new",
              Total: {
                Money: {
                  "@_currency": currency,
                  "#text": poData.total.toFixed(2),
                },
              },
              ShipTo: {
                Address: {
                  "@_isoCountryCode": poData.shipTo.countryCode,
                  "@_addressID": "ShipTo",
                  Name: { "@_xml:lang": "en", "#text": poData.shipTo.name },
                  PostalAddress: {
                    Street: poData.shipTo.street,
                    City: poData.shipTo.city,
                    State: poData.shipTo.state,
                    PostalCode: poData.shipTo.zip,
                    Country: {
                      "@_isoCountryCode": poData.shipTo.countryCode,
                      "#text": poData.shipTo.country,
                    },
                  },
                },
              },
              BillTo: {
                Address: {
                  "@_isoCountryCode": poData.billTo.countryCode,
                  "@_addressID": "BillTo",
                  Name: { "@_xml:lang": "en", "#text": poData.billTo.name },
                  PostalAddress: {
                    Street: poData.billTo.street,
                    City: poData.billTo.city,
                    State: poData.billTo.state,
                    PostalCode: poData.billTo.zip,
                    Country: {
                      "@_isoCountryCode": poData.billTo.countryCode,
                      "#text": poData.billTo.country,
                    },
                  },
                },
              },
              ...(poData.comments && {
                Comments: { "@_xml:lang": "en", "#text": poData.comments },
              }),
            },
            ItemOut: poData.lineItems.map((item) => ({
              "@_quantity": item.quantity.toString(),
              "@_lineNumber": item.lineNumber.toString(),
              ItemID: {
                SupplierPartID: item.vendorSku,
              },
              ItemDetail: {
                UnitPrice: {
                  Money: {
                    "@_currency": item.currency || currency,
                    "#text": item.unitPrice.toFixed(2),
                  },
                },
                Description: { "@_xml:lang": "en", "#text": item.description },
                UnitOfMeasure: item.uom,
                Classification: {
                  "@_domain": "UNSPSC",
                  "#text": "00000000",
                },
              },
            })),
          },
        },
      },
    };

    return this.xmlBuilder.build(cxmlDocument);
  }

  // ============================================
  // PunchOut Session Management
  // ============================================

  async initiatePunchOut(
    vendorUrl: string,
    buyerCookie: string,
    operation: "create" | "edit" | "inspect" = "create"
  ): Promise<{ success: boolean; punchOutUrl?: string; error?: string }> {
    const payloadId = this.generatePayloadId();
    const timestamp = new Date().toISOString();

    const cxml = this.buildPunchOutSetupRequest(
      vendorUrl,
      buyerCookie,
      operation,
      payloadId,
      timestamp
    );

    try {
      const response = await fetch(vendorUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/xml",
        },
        body: cxml,
      });

      const responseText = await response.text();
      const parsed = this.xmlParser.parse(responseText);

      // Extract PunchOut URL from response
      const punchOutUrl =
        parsed?.cXML?.Response?.PunchOutSetupResponse?.StartPage?.URL;

      if (punchOutUrl) {
        return { success: true, punchOutUrl };
      }

      return {
        success: false,
        error: "No PunchOut URL in response",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private buildPunchOutSetupRequest(
    _vendorUrl: string,
    buyerCookie: string,
    operation: string,
    payloadId: string,
    timestamp: string
  ): string {
    const cxmlDocument = {
      "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
      cXML: {
        "@_payloadID": payloadId,
        "@_timestamp": timestamp,
        ...this.buildCXMLHeader(this.config.senderId),
        Request: {
          PunchOutSetupRequest: {
            "@_operation": operation,
            BuyerCookie: buyerCookie,
            BrowserFormPost: {
              URL: `${this.config.baseUrl}/punchout/return`,
            },
            SupplierSetup: {
              URL: `${this.config.baseUrl}/punchout/setup`,
            },
          },
        },
      },
    };

    return this.xmlBuilder.build(cxmlDocument);
  }

  parsePunchOutOrderMessage(orderMessageXml: string): {
    success: boolean;
    items?: PunchOutItem[];
    subtotal?: number;
    error?: string;
  } {
    try {
      const parsed = this.xmlParser.parse(orderMessageXml);
      const itemsIn =
        parsed?.cXML?.Message?.PunchOutOrderMessage?.ItemIn || [];

      const items: PunchOutItem[] = (
        Array.isArray(itemsIn) ? itemsIn : [itemsIn]
      ).map((item: Record<string, unknown>) => {
        const itemDetail = item.ItemDetail as Record<string, unknown>;
        const unitPrice = itemDetail?.UnitPrice as Record<string, unknown>;
        const money = unitPrice?.Money as Record<string, unknown>;

        return {
          quantity: parseInt(item["@_quantity"] as string, 10),
          vendorSku: (item.ItemID as Record<string, unknown>)
            ?.SupplierPartID as string,
          vendorProductName: (itemDetail?.Description as Record<string, unknown>)?.[
            "#text"
          ] as string,
          description: (itemDetail?.Description as Record<string, unknown>)?.[
            "#text"
          ] as string,
          unitPrice: parseFloat(money?.["#text"] as string),
          uom: itemDetail?.UnitOfMeasure as string,
          currency: money?.["@_currency"] as string,
          manufacturerPartNumber: (itemDetail?.ManufacturerPartID as string) || undefined,
          manufacturerName: (itemDetail?.ManufacturerName as string) || undefined,
          unspsc:
            (
              itemDetail?.Classification as Record<string, unknown>
            )?.["#text"] as string || undefined,
        };
      });

      const totalMoney = parsed?.cXML?.Message?.PunchOutOrderMessage
        ?.PunchOutOrderMessageHeader?.Total?.Money as Record<string, unknown>;
      const subtotal = totalMoney
        ? parseFloat(totalMoney["#text"] as string)
        : items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

      return { success: true, items, subtotal };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to parse order message",
      };
    }
  }

  // ============================================
  // Invoice Processing
  // ============================================

  parseInvoiceDetailRequest(invoiceXml: string): {
    success: boolean;
    invoice?: InvoiceData;
    error?: string;
  } {
    try {
      const parsed = this.xmlParser.parse(invoiceXml);
      const request = parsed?.cXML?.Request?.InvoiceDetailRequest;

      if (!request) {
        return { success: false, error: "No InvoiceDetailRequest found" };
      }

      const header = request.InvoiceDetailRequestHeader;
      const summary = request.InvoiceDetailSummary;

      // Parse line items
      const orderItems = request.InvoiceDetailOrder?.InvoiceDetailItem || [];
      const lineItems = (Array.isArray(orderItems) ? orderItems : [orderItems]).map(
        (item: Record<string, unknown>, index: number) => {
          const unitPrice = item.UnitPrice as Record<string, unknown>;
          const money = unitPrice?.Money as Record<string, unknown>;

          return {
            lineNumber: index + 1,
            poLineNumber: item["@_invoiceLineNumber"]
              ? parseInt(item["@_invoiceLineNumber"] as string, 10)
              : undefined,
            quantity: parseInt(item["@_quantity"] as string, 10),
            vendorSku: (item.InvoiceDetailItemReference as Record<string, unknown>)
              ?.ItemID?.SupplierPartID as string,
            description: (
              (item.InvoiceDetailItemReference as Record<string, unknown>)
                ?.Description as Record<string, unknown>
            )?.["#text"] as string,
            unitPrice: parseFloat(money?.["#text"] as string),
            amount:
              parseFloat(money?.["#text"] as string) *
              parseInt(item["@_quantity"] as string, 10),
            uom: (item.UnitOfMeasure as string) || "EA",
          };
        }
      );

      // Extract totals
      const grossAmount = summary?.GrossAmount?.Money as Record<string, unknown>;
      const taxAmount = summary?.Tax?.Money as Record<string, unknown>;
      const shippingAmount = summary?.SpecialHandlingAmount?.Money as Record<
        string,
        unknown
      >;

      const invoice: InvoiceData = {
        invoiceNumber: header["@_invoiceID"],
        invoiceDate: header["@_invoiceDate"],
        poNumber:
          request.InvoiceDetailOrder?.InvoiceDetailOrderInfo?.OrderReference?.[
            "@_orderID"
          ],
        vendorId:
          request.InvoiceDetailRequestHeader?.InvoicePartner?.Contact?.[
            "@_addressID"
          ] || "",
        vendorName:
          request.InvoiceDetailRequestHeader?.InvoicePartner?.Contact?.Name?.[
            "#text"
          ] || "",
        subtotal: parseFloat(
          (summary?.SubtotalAmount?.Money?.["#text"] as string) || "0"
        ),
        tax: taxAmount ? parseFloat(taxAmount["#text"] as string) : 0,
        shipping: shippingAmount
          ? parseFloat(shippingAmount["#text"] as string)
          : 0,
        total: grossAmount ? parseFloat(grossAmount["#text"] as string) : 0,
        currency: (grossAmount?.["@_currency"] as string) || "USD",
        lineItems,
        dueDate: header?.PaymentTerm?.["@_payInNumberOfDays"]
          ? this.calculateDueDate(
              header["@_invoiceDate"],
              parseInt(header.PaymentTerm["@_payInNumberOfDays"], 10)
            )
          : undefined,
        paymentTerms: header?.PaymentTerm?.["@_payInNumberOfDays"]
          ? `Net ${header.PaymentTerm["@_payInNumberOfDays"]}`
          : undefined,
      };

      return { success: true, invoice };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to parse invoice",
      };
    }
  }

  private calculateDueDate(invoiceDate: string, daysToAdd: number): string {
    const date = new Date(invoiceDate);
    date.setDate(date.getDate() + daysToAdd);
    return date.toISOString().split("T")[0];
  }

  // ============================================
  // Order Status Updates
  // ============================================

  async getOrderStatus(poNumber: string): Promise<CXMLResponse> {
    const payloadId = this.generatePayloadId();
    const timestamp = new Date().toISOString();

    const cxml = this.buildStatusRequest(poNumber, payloadId, timestamp);

    try {
      const response = await fetch(`${this.config.baseUrl}/cxml/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/xml",
        },
        body: cxml,
      });

      const responseText = await response.text();
      return this.parseCXMLResponse(responseText);
    } catch (error) {
      return {
        success: false,
        statusCode: "500",
        statusText: `Failed to get status: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  private buildStatusRequest(
    poNumber: string,
    payloadId: string,
    timestamp: string
  ): string {
    const cxmlDocument = {
      "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
      cXML: {
        "@_payloadID": payloadId,
        "@_timestamp": timestamp,
        ...this.buildCXMLHeader(this.config.senderId),
        Request: {
          StatusUpdateRequest: {
            DocumentReference: {
              "@_payloadID": poNumber,
            },
          },
        },
      },
    };

    return this.xmlBuilder.build(cxmlDocument);
  }

  // ============================================
  // Response Parsing
  // ============================================

  private parseCXMLResponse(responseXml: string): CXMLResponse {
    try {
      const parsed = this.xmlParser.parse(responseXml);
      const response = parsed?.cXML?.Response;

      if (!response) {
        return {
          success: false,
          statusCode: "500",
          statusText: "Invalid cXML response format",
        };
      }

      const status = response.Status;
      const statusCode = status?.["@_code"] || "500";
      const statusText = status?.["@_text"] || status?.["#text"] || "Unknown";

      return {
        success: statusCode === "200",
        statusCode,
        statusText,
        payloadId: parsed?.cXML?.["@_payloadID"],
        timestamp: parsed?.cXML?.["@_timestamp"],
        data: response,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: "500",
        statusText: `Failed to parse response: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  // ============================================
  // Confirmation Response Builder
  // ============================================

  buildConfirmationResponse(
    payloadId: string,
    statusCode: string = "200",
    statusText: string = "OK"
  ): string {
    const cxmlDocument = {
      "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
      cXML: {
        "@_payloadID": this.generatePayloadId(),
        "@_timestamp": new Date().toISOString(),
        Response: {
          Status: {
            "@_code": statusCode,
            "@_text": statusText,
          },
        },
      },
    };

    return this.xmlBuilder.build(cxmlDocument);
  }

  // ============================================
  // Catalog Import via cXML
  // ============================================

  parseCatalogUpdate(catalogXml: string): {
    success: boolean;
    items?: Array<{
      vendorSku: string;
      name: string;
      description: string;
      price: number;
      currency: string;
      uom: string;
      category: string;
      manufacturer?: string;
      mpn?: string;
      leadTime?: number;
      availability: string;
    }>;
    error?: string;
  } {
    try {
      const parsed = this.xmlParser.parse(catalogXml);
      const catalog = parsed?.Index || parsed?.cXML?.Message?.ProductActivityMessage;

      if (!catalog) {
        return { success: false, error: "No catalog data found" };
      }

      // Handle different catalog formats
      const items = this.extractCatalogItems(catalog);

      return { success: true, items };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to parse catalog",
      };
    }
  }

  private extractCatalogItems(catalog: Record<string, unknown>): Array<{
    vendorSku: string;
    name: string;
    description: string;
    price: number;
    currency: string;
    uom: string;
    category: string;
    manufacturer?: string;
    mpn?: string;
    leadTime?: number;
    availability: string;
  }> {
    const indexItems = (catalog.IndexItem as Record<string, unknown>[]) || [];
    const items = Array.isArray(indexItems) ? indexItems : [indexItems];

    return items.map((item) => {
      const itemDetail = item.IndexItemDetail as Record<string, unknown>;
      const pricingDetail = item.IndexItemPricingDetail as Record<string, unknown>;
      const unitPrice = pricingDetail?.UnitPrice as Record<string, unknown>;
      const money = unitPrice?.Money as Record<string, unknown>;

      return {
        vendorSku: (item.ItemID as Record<string, unknown>)?.SupplierPartID as string,
        name: (itemDetail?.Description as Record<string, unknown>)?.ShortName as string || "",
        description: (itemDetail?.Description as Record<string, unknown>)?.["#text"] as string || "",
        price: money ? parseFloat(money["#text"] as string) : 0,
        currency: (money?.["@_currency"] as string) || "USD",
        uom: (itemDetail?.UnitOfMeasure as string) || "EA",
        category: (itemDetail?.Classification as Record<string, unknown>)?.["#text"] as string || "",
        manufacturer: itemDetail?.ManufacturerName as string,
        mpn: itemDetail?.ManufacturerPartID as string,
        leadTime: itemDetail?.LeadTime
          ? parseInt(itemDetail.LeadTime as string, 10)
          : undefined,
        availability: this.determineAvailability(item),
      };
    });
  }

  private determineAvailability(item: Record<string, unknown>): string {
    const availability = (item.IndexItemDetail as Record<string, unknown>)?.Availability as string;
    if (!availability) return "in_stock";

    const lower = availability.toLowerCase();
    if (lower.includes("out") || lower.includes("unavailable")) return "out_of_stock";
    if (lower.includes("limited")) return "limited";
    if (lower.includes("backorder")) return "backorder";
    if (lower.includes("discontinued")) return "discontinued";
    return "in_stock";
  }
}

// ============================================
// Export Factory Function
// ============================================

export function createJaggaerClient(config: JaggaerConfig): JaggaerIntegration {
  return new JaggaerIntegration(config);
}

export default JaggaerIntegration;
