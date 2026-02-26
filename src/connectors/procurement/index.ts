/**
 * Procurement Connectors
 *
 * Unified connector architecture for university procurement systems:
 * - Jaggaer (eProcurement leader for higher ed)
 * - Oracle Procurement Cloud (Enterprise ERP)
 * - Unimarket (Cloud procurement for universities)
 * - SciQuest/JAGGAER ONE (Research procurement)
 * - Workday Strategic Sourcing (Modern cloud)
 * - SAP Ariba (Enterprise network)
 * - Coupa (Spend management)
 *
 * Features:
 * - Unified interface for all connectors
 * - cXML support for catalog/punchout
 * - Real-time sync capabilities
 * - Multi-tenant configuration
 */

// Base connector interface and types
export * from "./base/types";
export * from "./base/connector";
export * from "./base/cxml-handler";

// Individual connectors
export { JaggaerConnector } from "./jaggaer";
export { OracleConnector } from "./oracle";
export { UnimarketConnector } from "./unimarket";
export { SciQuestConnector } from "./sciquest";
export { WorkdayConnector } from "./workday";
export { AribaConnector } from "./ariba";
export { CoupaConnector } from "./coupa";

// Connector factory and registry
export { ConnectorFactory, connectorRegistry } from "./factory";

// Unified service layer
export { ProcurementConnectorService, procurementConnectorService } from "./service";
