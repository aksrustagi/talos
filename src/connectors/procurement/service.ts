/**
 * Procurement Connector Service
 *
 * Unified service layer for managing procurement system integrations.
 * Provides a single interface for all connector operations.
 */

import { ConnectorFactory, connectorFactory, connectorRegistry } from "./factory";
import { BaseProcurementConnector } from "./base/connector";
import type {
  ConnectorConfig,
  ProcurementSystem,
  ConnectorResponse,
  PaginatedResponse,
  CatalogItem,
  CatalogSyncRequest,
  CatalogSyncResult,
  PurchaseOrder,
  POStatus,
  Invoice,
  InvoiceStatus,
  Requisition,
  RequisitionStatus,
  Supplier,
  PunchoutSession,
  PunchoutCart,
} from "./base/types";

/**
 * Connection status
 */
export interface ConnectionStatus {
  connectorId: string;
  system: ProcurementSystem;
  universityId: string;
  status: "connected" | "disconnected" | "error";
  lastChecked: string;
  version?: string;
  error?: string;
}

/**
 * Unified operation result
 */
export interface OperationResult<T> {
  success: boolean;
  data?: T;
  connectorId: string;
  system: ProcurementSystem;
  error?: {
    code: string;
    message: string;
  };
  timing: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
}

/**
 * Procurement Connector Service
 */
export class ProcurementConnectorService {
  private factory: ConnectorFactory;
  private configs: Map<string, ConnectorConfig> = new Map();

  constructor(factory?: ConnectorFactory) {
    this.factory = factory || connectorFactory;
  }

  // ============================================================================
  // Configuration Management
  // ============================================================================

  /**
   * Register a connector configuration
   */
  registerConfig(config: ConnectorConfig): void {
    this.configs.set(config.id, config);
  }

  /**
   * Get a connector configuration
   */
  getConfig(connectorId: string): ConnectorConfig | undefined {
    return this.configs.get(connectorId);
  }

  /**
   * Get all configurations for a university
   */
  getConfigsForUniversity(universityId: string): ConnectorConfig[] {
    return Array.from(this.configs.values())
      .filter(config => config.universityId === universityId);
  }

  /**
   * Remove a configuration
   */
  removeConfig(connectorId: string): boolean {
    this.factory.remove(
      this.configs.get(connectorId)?.system as ProcurementSystem,
      connectorId
    );
    return this.configs.delete(connectorId);
  }

  // ============================================================================
  // Connector Management
  // ============================================================================

  /**
   * Get or create a connector instance
   */
  getConnector(connectorId: string): BaseProcurementConnector {
    const config = this.configs.get(connectorId);
    if (!config) {
      throw new Error(`Connector configuration not found: ${connectorId}`);
    }
    return this.factory.create(config);
  }

  /**
   * Get connector by university and system
   */
  getConnectorBySystem(universityId: string, system: ProcurementSystem): BaseProcurementConnector | undefined {
    const config = Array.from(this.configs.values())
      .find(c => c.universityId === universityId && c.system === system);

    if (config) {
      return this.factory.create(config);
    }

    return undefined;
  }

  /**
   * Test connection for a connector
   */
  async testConnection(connectorId: string): Promise<ConnectionStatus> {
    const connector = this.getConnector(connectorId);
    const config = this.configs.get(connectorId)!;

    try {
      const result = await connector.testConnection();

      return {
        connectorId,
        system: config.system,
        universityId: config.universityId,
        status: result.success ? "connected" : "error",
        lastChecked: new Date().toISOString(),
        version: result.data?.version,
        error: result.error?.message,
      };
    } catch (error) {
      return {
        connectorId,
        system: config.system,
        universityId: config.universityId,
        status: "error",
        lastChecked: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Test all connections for a university
   */
  async testAllConnections(universityId: string): Promise<ConnectionStatus[]> {
    const configs = this.getConfigsForUniversity(universityId);
    const results = await Promise.all(
      configs.map(config => this.testConnection(config.id))
    );
    return results;
  }

  // ============================================================================
  // Catalog Operations
  // ============================================================================

  /**
   * Sync catalog from a connector
   */
  async syncCatalog(
    connectorId: string,
    request: CatalogSyncRequest
  ): Promise<OperationResult<CatalogSyncResult>> {
    return this.executeOperation(connectorId, async (connector) => {
      return connector.syncCatalog(request);
    });
  }

  /**
   * Search catalog across connectors
   */
  async searchCatalog(
    universityId: string,
    query: string,
    options?: {
      systems?: ProcurementSystem[];
      category?: string;
      maxResultsPerSystem?: number;
    }
  ): Promise<{
    results: Array<CatalogItem & { connectorId: string; system: ProcurementSystem }>;
    bySystem: Record<ProcurementSystem, CatalogItem[]>;
  }> {
    const configs = this.getConfigsForUniversity(universityId)
      .filter(c => !options?.systems || options.systems.includes(c.system));

    const allResults: Array<CatalogItem & { connectorId: string; system: ProcurementSystem }> = [];
    const bySystem: Record<string, CatalogItem[]> = {};

    await Promise.all(
      configs.map(async (config) => {
        try {
          const connector = this.factory.create(config);
          const result = await connector.searchCatalog(query, {
            category: options?.category,
            maxResults: options?.maxResultsPerSystem || 10,
          });

          if (result.success && result.data) {
            bySystem[config.system] = result.data;
            result.data.forEach(item => {
              allResults.push({
                ...item,
                connectorId: config.id,
                system: config.system,
              });
            });
          }
        } catch (error) {
          console.error(`Catalog search failed for ${config.system}:`, error);
        }
      })
    );

    // Sort by price
    allResults.sort((a, b) => a.price - b.price);

    return { results: allResults, bySystem };
  }

  /**
   * Get catalog items from a connector
   */
  async getCatalogItems(
    connectorId: string,
    options: {
      page?: number;
      pageSize?: number;
      category?: string;
      supplierId?: string;
      search?: string;
    }
  ): Promise<OperationResult<PaginatedResponse<CatalogItem>>> {
    return this.executeOperation(connectorId, async (connector) => {
      return connector.getCatalogItems(options);
    });
  }

  // ============================================================================
  // Purchase Order Operations
  // ============================================================================

  /**
   * Create a purchase order
   */
  async createPurchaseOrder(
    connectorId: string,
    order: Omit<PurchaseOrder, "id" | "externalId" | "createdAt" | "updatedAt">
  ): Promise<OperationResult<PurchaseOrder>> {
    return this.executeOperation(connectorId, async (connector) => {
      return connector.createPurchaseOrder(order);
    });
  }

  /**
   * Get a purchase order
   */
  async getPurchaseOrder(
    connectorId: string,
    poNumber: string
  ): Promise<OperationResult<PurchaseOrder>> {
    return this.executeOperation(connectorId, async (connector) => {
      return connector.getPurchaseOrder(poNumber);
    });
  }

  /**
   * Update PO status
   */
  async updatePurchaseOrderStatus(
    connectorId: string,
    poNumber: string,
    status: POStatus,
    comments?: string
  ): Promise<OperationResult<PurchaseOrder>> {
    return this.executeOperation(connectorId, async (connector) => {
      return connector.updatePurchaseOrderStatus(poNumber, status, comments);
    });
  }

  /**
   * Send PO to supplier
   */
  async sendPurchaseOrder(
    connectorId: string,
    poNumber: string,
    method?: "cxml" | "edi" | "email"
  ): Promise<OperationResult<{ sent: boolean; confirmationId?: string }>> {
    return this.executeOperation(connectorId, async (connector) => {
      return connector.sendPurchaseOrder(poNumber, method);
    });
  }

  /**
   * List purchase orders
   */
  async listPurchaseOrders(
    connectorId: string,
    options: {
      page?: number;
      pageSize?: number;
      status?: POStatus;
      supplierId?: string;
      fromDate?: string;
      toDate?: string;
    }
  ): Promise<OperationResult<PaginatedResponse<PurchaseOrder>>> {
    return this.executeOperation(connectorId, async (connector) => {
      return connector.listPurchaseOrders(options);
    });
  }

  // ============================================================================
  // Invoice Operations
  // ============================================================================

  /**
   * Create an invoice
   */
  async createInvoice(
    connectorId: string,
    invoice: Omit<Invoice, "id" | "externalId" | "createdAt" | "updatedAt">
  ): Promise<OperationResult<Invoice>> {
    return this.executeOperation(connectorId, async (connector) => {
      return connector.createInvoice(invoice);
    });
  }

  /**
   * Get an invoice
   */
  async getInvoice(
    connectorId: string,
    invoiceNumber: string
  ): Promise<OperationResult<Invoice>> {
    return this.executeOperation(connectorId, async (connector) => {
      return connector.getInvoice(invoiceNumber);
    });
  }

  /**
   * Match invoice (3-way match)
   */
  async matchInvoice(
    connectorId: string,
    invoiceNumber: string
  ): Promise<OperationResult<Invoice>> {
    return this.executeOperation(connectorId, async (connector) => {
      return connector.matchInvoice(invoiceNumber);
    });
  }

  /**
   * List invoices
   */
  async listInvoices(
    connectorId: string,
    options: {
      page?: number;
      pageSize?: number;
      status?: InvoiceStatus;
      supplierId?: string;
      poNumber?: string;
      fromDate?: string;
      toDate?: string;
    }
  ): Promise<OperationResult<PaginatedResponse<Invoice>>> {
    return this.executeOperation(connectorId, async (connector) => {
      return connector.listInvoices(options);
    });
  }

  // ============================================================================
  // Requisition Operations
  // ============================================================================

  /**
   * Create a requisition
   */
  async createRequisition(
    connectorId: string,
    requisition: Omit<Requisition, "id" | "externalId" | "createdAt" | "updatedAt">
  ): Promise<OperationResult<Requisition>> {
    return this.executeOperation(connectorId, async (connector) => {
      return connector.createRequisition(requisition);
    });
  }

  /**
   * Submit requisition for approval
   */
  async submitRequisition(
    connectorId: string,
    requisitionNumber: string
  ): Promise<OperationResult<Requisition>> {
    return this.executeOperation(connectorId, async (connector) => {
      return connector.submitRequisition(requisitionNumber);
    });
  }

  /**
   * Process requisition approval
   */
  async processRequisitionApproval(
    connectorId: string,
    requisitionNumber: string,
    decision: "approve" | "reject",
    comments?: string
  ): Promise<OperationResult<Requisition>> {
    return this.executeOperation(connectorId, async (connector) => {
      return connector.processRequisitionApproval(requisitionNumber, decision, comments);
    });
  }

  /**
   * Convert requisition to PO
   */
  async convertRequisitionToPO(
    connectorId: string,
    requisitionNumber: string
  ): Promise<OperationResult<PurchaseOrder>> {
    return this.executeOperation(connectorId, async (connector) => {
      return connector.convertRequisitionToPO(requisitionNumber);
    });
  }

  // ============================================================================
  // Supplier Operations
  // ============================================================================

  /**
   * Get supplier
   */
  async getSupplier(
    connectorId: string,
    supplierIdOrCode: string
  ): Promise<OperationResult<Supplier>> {
    return this.executeOperation(connectorId, async (connector) => {
      return connector.getSupplier(supplierIdOrCode);
    });
  }

  /**
   * Search suppliers across connectors
   */
  async searchSuppliers(
    universityId: string,
    query: string,
    options?: {
      systems?: ProcurementSystem[];
      diversityCertification?: string;
      maxResultsPerSystem?: number;
    }
  ): Promise<Array<Supplier & { connectorId: string; system: ProcurementSystem }>> {
    const configs = this.getConfigsForUniversity(universityId)
      .filter(c => !options?.systems || options.systems.includes(c.system));

    const allResults: Array<Supplier & { connectorId: string; system: ProcurementSystem }> = [];

    await Promise.all(
      configs.map(async (config) => {
        try {
          const connector = this.factory.create(config);
          const result = await connector.searchSuppliers(query, {
            diversityCertification: options?.diversityCertification,
            maxResults: options?.maxResultsPerSystem || 10,
          });

          if (result.success && result.data) {
            result.data.forEach(supplier => {
              allResults.push({
                ...supplier,
                connectorId: config.id,
                system: config.system,
              });
            });
          }
        } catch (error) {
          console.error(`Supplier search failed for ${config.system}:`, error);
        }
      })
    );

    return allResults;
  }

  // ============================================================================
  // Punchout Operations
  // ============================================================================

  /**
   * Initiate punchout session
   */
  async initiatePunchout(
    connectorId: string,
    options: {
      supplierId: string;
      userId: string;
      userEmail: string;
      userName: string;
      returnUrl: string;
    }
  ): Promise<OperationResult<PunchoutSession>> {
    return this.executeOperation(connectorId, async (connector) => {
      return connector.initiatePunchout(options);
    });
  }

  /**
   * Process punchout cart
   */
  async processPunchoutCart(
    connectorId: string,
    sessionId: string,
    cartData: string
  ): Promise<OperationResult<PunchoutCart>> {
    return this.executeOperation(connectorId, async (connector) => {
      return connector.processPunchoutCart(sessionId, cartData);
    });
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get available procurement systems
   */
  getAvailableSystems(): Array<{
    system: ProcurementSystem;
    name: string;
    description: string;
    features: string[];
  }> {
    return connectorRegistry.getAll().map(entry => ({
      system: entry.system,
      name: entry.name,
      description: entry.description,
      features: entry.features,
    }));
  }

  /**
   * Get system features
   */
  getSystemFeatures(system: ProcurementSystem): string[] {
    return connectorRegistry.getFeatures(system);
  }

  /**
   * Check if a system supports a feature
   */
  systemSupportsFeature(system: ProcurementSystem, feature: string): boolean {
    return connectorRegistry.getFeatures(system).includes(feature);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Execute an operation with timing and error handling
   */
  private async executeOperation<T>(
    connectorId: string,
    operation: (connector: BaseProcurementConnector) => Promise<ConnectorResponse<T>>
  ): Promise<OperationResult<T>> {
    const config = this.configs.get(connectorId);
    if (!config) {
      return {
        success: false,
        connectorId,
        system: "jaggaer" as ProcurementSystem, // Default, will be overwritten
        error: { code: "CONFIG_NOT_FOUND", message: `Connector configuration not found: ${connectorId}` },
        timing: { startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 0 },
      };
    }

    const startedAt = new Date();
    try {
      const connector = this.factory.create(config);
      const result = await operation(connector);
      const completedAt = new Date();

      return {
        success: result.success,
        data: result.data,
        connectorId,
        system: config.system,
        error: result.error ? { code: result.error.code, message: result.error.message } : undefined,
        timing: {
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          durationMs: completedAt.getTime() - startedAt.getTime(),
        },
      };
    } catch (error) {
      const completedAt = new Date();
      return {
        success: false,
        connectorId,
        system: config.system,
        error: {
          code: "OPERATION_FAILED",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        timing: {
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          durationMs: completedAt.getTime() - startedAt.getTime(),
        },
      };
    }
  }
}

// Export singleton instance
export const procurementConnectorService = new ProcurementConnectorService();
