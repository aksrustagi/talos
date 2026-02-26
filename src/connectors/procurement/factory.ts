/**
 * Connector Factory
 *
 * Factory pattern for creating and managing procurement connectors.
 * Supports dynamic connector registration and instantiation.
 */

import { BaseProcurementConnector } from "./base/connector";
import type { ConnectorConfig, ProcurementSystem } from "./base/types";
import { JaggaerConnector, type JaggaerConfig } from "./jaggaer";
import { OracleConnector, type OracleConfig } from "./oracle";
import { UnimarketConnector, type UnimarketConfig } from "./unimarket";
import { SciQuestConnector, type SciQuestConfig } from "./sciquest";
import { WorkdayConnector, type WorkdayConfig } from "./workday";
import { AribaConnector, type AribaConfig } from "./ariba";
import { CoupaConnector, type CoupaConfig } from "./coupa";

/**
 * Connector constructor type
 */
type ConnectorConstructor<T extends ConnectorConfig = ConnectorConfig> = new (config: T) => BaseProcurementConnector;

/**
 * Connector registry entry
 */
interface ConnectorRegistryEntry {
  system: ProcurementSystem;
  name: string;
  description: string;
  constructor: ConnectorConstructor<any>;
  features: string[];
}

/**
 * Connector Registry
 */
class ConnectorRegistry {
  private connectors: Map<ProcurementSystem, ConnectorRegistryEntry> = new Map();

  constructor() {
    // Register built-in connectors
    this.register({
      system: "jaggaer",
      name: "Jaggaer",
      description: "Leading eProcurement platform for higher education. Full cXML and punchout support.",
      constructor: JaggaerConnector,
      features: ["cxml", "punchout", "catalog", "po", "invoice", "requisition", "supplier"],
    });

    this.register({
      system: "oracle",
      name: "Oracle Procurement Cloud",
      description: "Enterprise procurement with Oracle Fusion Cloud. REST API and FBDI integration.",
      constructor: OracleConnector,
      features: ["catalog", "po", "invoice", "requisition", "supplier", "contracts"],
    });

    this.register({
      system: "unimarket",
      name: "Unimarket",
      description: "Cloud procurement designed for higher education. Guided buying and punchout.",
      constructor: UnimarketConnector,
      features: ["cxml", "punchout", "catalog", "po", "invoice", "requisition", "supplier", "guidedBuying"],
    });

    this.register({
      system: "sciquest",
      name: "SciQuest / JAGGAER ONE",
      description: "Research and scientific procurement platform. cXML and catalog integration.",
      constructor: SciQuestConnector,
      features: ["cxml", "punchout", "catalog", "po", "invoice", "requisition", "supplier", "research", "analytics"],
    });

    this.register({
      system: "workday",
      name: "Workday Strategic Sourcing",
      description: "Modern cloud procurement with Workday HCM/Finance integration.",
      constructor: WorkdayConnector,
      features: ["catalog", "po", "invoice", "requisition", "supplier", "sourcing", "contracts"],
    });

    this.register({
      system: "ariba",
      name: "SAP Ariba",
      description: "Enterprise procurement network with supplier collaboration.",
      constructor: AribaConnector,
      features: ["cxml", "punchout", "catalog", "po", "invoice", "requisition", "supplier", "network", "sourcing"],
    });

    this.register({
      system: "coupa",
      name: "Coupa",
      description: "Cloud spend management platform with AI-powered insights.",
      constructor: CoupaConnector,
      features: ["cxml", "punchout", "catalog", "po", "invoice", "requisition", "supplier", "spend", "contracts"],
    });
  }

  /**
   * Register a new connector
   */
  register(entry: ConnectorRegistryEntry): void {
    this.connectors.set(entry.system, entry);
  }

  /**
   * Get a registered connector entry
   */
  get(system: ProcurementSystem): ConnectorRegistryEntry | undefined {
    return this.connectors.get(system);
  }

  /**
   * Get all registered connectors
   */
  getAll(): ConnectorRegistryEntry[] {
    return Array.from(this.connectors.values());
  }

  /**
   * Check if a connector is registered
   */
  has(system: ProcurementSystem): boolean {
    return this.connectors.has(system);
  }

  /**
   * Get connector features
   */
  getFeatures(system: ProcurementSystem): string[] {
    return this.connectors.get(system)?.features || [];
  }
}

/**
 * Singleton connector registry
 */
export const connectorRegistry = new ConnectorRegistry();

/**
 * Connector Factory
 */
export class ConnectorFactory {
  private instances: Map<string, BaseProcurementConnector> = new Map();

  /**
   * Create or get a connector instance
   */
  create(config: ConnectorConfig): BaseProcurementConnector {
    const cacheKey = `${config.system}:${config.id}`;

    // Return cached instance if available
    if (this.instances.has(cacheKey)) {
      return this.instances.get(cacheKey)!;
    }

    // Get connector constructor from registry
    const entry = connectorRegistry.get(config.system);
    if (!entry) {
      throw new Error(`Unknown procurement system: ${config.system}`);
    }

    // Create instance
    const connector = new entry.constructor(config);
    this.instances.set(cacheKey, connector);

    return connector;
  }

  /**
   * Create a Jaggaer connector
   */
  createJaggaer(config: JaggaerConfig): JaggaerConnector {
    return this.create(config) as JaggaerConnector;
  }

  /**
   * Create an Oracle connector
   */
  createOracle(config: OracleConfig): OracleConnector {
    return this.create(config) as OracleConnector;
  }

  /**
   * Create a Unimarket connector
   */
  createUnimarket(config: UnimarketConfig): UnimarketConnector {
    return this.create(config) as UnimarketConnector;
  }

  /**
   * Create a SciQuest connector
   */
  createSciQuest(config: SciQuestConfig): SciQuestConnector {
    return this.create(config) as SciQuestConnector;
  }

  /**
   * Create a Workday connector
   */
  createWorkday(config: WorkdayConfig): WorkdayConnector {
    return this.create(config) as WorkdayConnector;
  }

  /**
   * Create an Ariba connector
   */
  createAriba(config: AribaConfig): AribaConnector {
    return this.create(config) as AribaConnector;
  }

  /**
   * Create a Coupa connector
   */
  createCoupa(config: CoupaConfig): CoupaConnector {
    return this.create(config) as CoupaConnector;
  }

  /**
   * Get an existing connector instance
   */
  get(system: ProcurementSystem, id: string): BaseProcurementConnector | undefined {
    return this.instances.get(`${system}:${id}`);
  }

  /**
   * Remove a connector instance
   */
  remove(system: ProcurementSystem, id: string): boolean {
    return this.instances.delete(`${system}:${id}`);
  }

  /**
   * Get all active connectors
   */
  getAll(): BaseProcurementConnector[] {
    return Array.from(this.instances.values());
  }

  /**
   * Clear all instances
   */
  clear(): void {
    this.instances.clear();
  }

  /**
   * Get available systems
   */
  static getAvailableSystems(): ProcurementSystem[] {
    return connectorRegistry.getAll().map(e => e.system);
  }

  /**
   * Get system info
   */
  static getSystemInfo(system: ProcurementSystem): ConnectorRegistryEntry | undefined {
    return connectorRegistry.get(system);
  }

  /**
   * Get all system info
   */
  static getAllSystemInfo(): ConnectorRegistryEntry[] {
    return connectorRegistry.getAll();
  }
}

// Export singleton factory instance
export const connectorFactory = new ConnectorFactory();
