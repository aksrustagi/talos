/**
 * Anomaly Detection System
 *
 * Multi-layer anomaly detection combining:
 * 1. Isolation Forest - Fast statistical outlier detection
 * 2. Autoencoder - Deep pattern detection for complex fraud
 * 3. Graph Anomaly Detection - Network analysis across entities
 */

// Anomaly types
export enum AnomalyType {
  PRICE_ANOMALY = "price_anomaly",
  VOLUME_ANOMALY = "volume_anomaly",
  TIMING_ANOMALY = "timing_anomaly",
  PATTERN_ANOMALY = "pattern_anomaly",
  FRAUD_INDICATOR = "fraud_indicator",
  POLICY_VIOLATION = "policy_violation",
}

// Severity levels
export enum Severity {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

// Detection methods
export enum DetectionMethod {
  ISOLATION_FOREST = "isolation_forest",
  AUTOENCODER = "autoencoder",
  GRAPH_ANOMALY = "graph_anomaly",
  RULE_BASED = "rule_based",
}

// Entity types for anomaly detection
export type EntityType = "invoice" | "order" | "vendor" | "user" | "price";

// Anomaly detection result
export interface AnomalyResult {
  id: string;
  entityType: EntityType;
  entityId: string;
  anomalyType: AnomalyType;
  severity: Severity;
  confidence: number;
  detectionMethod: DetectionMethod;
  description: string;
  details: Record<string, any>;
  recommendedActions: string[];
  timestamp: Date;
}

// Feature vector for anomaly detection
export interface AnomalyFeatures {
  // Price-related features
  priceDeviation?: number; // Standard deviations from mean
  pricePercentile?: number; // Percentile rank
  priceVsContract?: number; // Ratio to contract price

  // Volume-related features
  orderQuantity?: number;
  quantityDeviation?: number;
  quantityVsHistorical?: number;

  // Timing-related features
  hourOfDay?: number;
  dayOfWeek?: number;
  isBusinessHours?: boolean;
  daysSinceLastOrder?: number;

  // Vendor-related features
  vendorRelationshipDays?: number;
  vendorOrderFrequency?: number;
  vendorDiversityScore?: number;

  // Pattern-related features
  orderSplitIndicator?: number;
  approvalThresholdProximity?: number;
  roundNumberIndicator?: number;

  // User-related features
  userOrderFrequency?: number;
  userVendorConcentration?: number;
  userApprovalRate?: number;
}

/**
 * Isolation Forest Implementation
 * Detects anomalies by isolating observations
 */
class IsolationForest {
  private trees: IsolationTree[] = [];
  private numTrees: number;
  private sampleSize: number;

  constructor(numTrees = 100, sampleSize = 256) {
    this.numTrees = numTrees;
    this.sampleSize = sampleSize;
  }

  /**
   * Build isolation forest from training data
   */
  fit(data: number[][]): void {
    this.trees = [];
    const heightLimit = Math.ceil(Math.log2(this.sampleSize));

    for (let i = 0; i < this.numTrees; i++) {
      // Sample data
      const sample = this.subsample(data, this.sampleSize);
      // Build tree
      const tree = new IsolationTree(heightLimit);
      tree.build(sample);
      this.trees.push(tree);
    }
  }

  /**
   * Calculate anomaly score for a single point
   * Returns score between 0 and 1 (higher = more anomalous)
   */
  score(point: number[]): number {
    const avgPathLength =
      this.trees.reduce((sum, tree) => sum + tree.pathLength(point), 0) /
      this.trees.length;

    // Normalize using expected path length in a balanced BST
    const c = this.expectedPathLength(this.sampleSize);
    const score = Math.pow(2, -avgPathLength / c);

    return score;
  }

  /**
   * Predict if point is anomaly based on threshold
   */
  predict(point: number[], threshold = 0.6): boolean {
    return this.score(point) > threshold;
  }

  /**
   * Get anomaly scores for all points
   */
  scoreAll(data: number[][]): number[] {
    return data.map((point) => this.score(point));
  }

  private subsample(data: number[][], size: number): number[][] {
    if (data.length <= size) return [...data];

    const indices = new Set<number>();
    while (indices.size < size) {
      indices.add(Math.floor(Math.random() * data.length));
    }

    return Array.from(indices).map((i) => data[i]);
  }

  private expectedPathLength(n: number): number {
    if (n <= 1) return 0;
    if (n === 2) return 1;
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;
  }
}

/**
 * Single isolation tree
 */
class IsolationTree {
  private root: IsolationNode | null = null;
  private heightLimit: number;

  constructor(heightLimit: number) {
    this.heightLimit = heightLimit;
  }

  build(data: number[][]): void {
    this.root = this.buildNode(data, 0);
  }

  private buildNode(data: number[][], height: number): IsolationNode | null {
    if (data.length === 0) return null;
    if (height >= this.heightLimit || data.length <= 1) {
      return { type: "external", size: data.length };
    }

    // Randomly select feature
    const numFeatures = data[0].length;
    const splitFeature = Math.floor(Math.random() * numFeatures);

    // Get min and max for selected feature
    const values = data.map((point) => point[splitFeature]);
    const min = Math.min(...values);
    const max = Math.max(...values);

    if (min === max) {
      return { type: "external", size: data.length };
    }

    // Random split value
    const splitValue = min + Math.random() * (max - min);

    // Split data
    const left = data.filter((point) => point[splitFeature] < splitValue);
    const right = data.filter((point) => point[splitFeature] >= splitValue);

    return {
      type: "internal",
      splitFeature,
      splitValue,
      left: this.buildNode(left, height + 1),
      right: this.buildNode(right, height + 1),
    };
  }

  pathLength(point: number[]): number {
    return this.pathLengthNode(point, this.root, 0);
  }

  private pathLengthNode(
    point: number[],
    node: IsolationNode | null,
    currentLength: number
  ): number {
    if (!node) return currentLength;

    if (node.type === "external") {
      return currentLength + this.expectedPathLength(node.size);
    }

    if (point[node.splitFeature] < node.splitValue) {
      return this.pathLengthNode(point, node.left!, currentLength + 1);
    } else {
      return this.pathLengthNode(point, node.right!, currentLength + 1);
    }
  }

  private expectedPathLength(n: number): number {
    if (n <= 1) return 0;
    if (n === 2) return 1;
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;
  }
}

type IsolationNode =
  | { type: "external"; size: number }
  | {
      type: "internal";
      splitFeature: number;
      splitValue: number;
      left: IsolationNode | null;
      right: IsolationNode | null;
    };

/**
 * Simple Autoencoder-inspired anomaly detector
 * Uses reconstruction error as anomaly score
 */
class AutoencoderDetector {
  private mean: number[] = [];
  private std: number[] = [];
  private correlationMatrix: number[][] = [];
  private eigenvalues: number[] = [];
  private eigenvectors: number[][] = [];
  private numComponents: number;

  constructor(numComponents = 5) {
    this.numComponents = numComponents;
  }

  /**
   * Fit the model to training data
   * Uses PCA for dimensionality reduction (simplified autoencoder)
   */
  fit(data: number[][]): void {
    if (data.length === 0) return;

    const numFeatures = data[0].length;

    // Calculate mean and std for normalization
    this.mean = Array(numFeatures).fill(0);
    this.std = Array(numFeatures).fill(0);

    for (const point of data) {
      for (let i = 0; i < numFeatures; i++) {
        this.mean[i] += point[i];
      }
    }
    this.mean = this.mean.map((m) => m / data.length);

    for (const point of data) {
      for (let i = 0; i < numFeatures; i++) {
        this.std[i] += Math.pow(point[i] - this.mean[i], 2);
      }
    }
    this.std = this.std.map((s) => Math.sqrt(s / data.length) || 1);

    // Normalize data
    const normalized = data.map((point) =>
      point.map((val, i) => (val - this.mean[i]) / this.std[i])
    );

    // Calculate covariance matrix
    this.correlationMatrix = this.computeCorrelationMatrix(normalized);

    // Simplified: Use correlation thresholds for pattern detection
    // Full implementation would use proper SVD/eigendecomposition
  }

  /**
   * Compute reconstruction error as anomaly score
   */
  score(point: number[]): number {
    if (this.mean.length === 0) return 0;

    // Normalize point
    const normalized = point.map(
      (val, i) => (val - this.mean[i]) / this.std[i]
    );

    // Calculate Mahalanobis-like distance
    let anomalyScore = 0;
    for (let i = 0; i < normalized.length; i++) {
      // Higher weight for features with strong correlations
      const weight = this.getFeatureWeight(i);
      anomalyScore += Math.pow(normalized[i], 2) * weight;
    }

    // Normalize to 0-1 range using sigmoid
    return 1 / (1 + Math.exp(-anomalyScore / normalized.length + 2));
  }

  private computeCorrelationMatrix(data: number[][]): number[][] {
    const n = data[0]?.length || 0;
    const matrix: number[][] = Array(n)
      .fill(null)
      .map(() => Array(n).fill(0));

    if (data.length < 2) return matrix;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (const point of data) {
          sum += point[i] * point[j];
        }
        matrix[i][j] = sum / data.length;
      }
    }

    return matrix;
  }

  private getFeatureWeight(featureIndex: number): number {
    if (!this.correlationMatrix[featureIndex]) return 1;

    // Sum of absolute correlations with other features
    const sumCorr = this.correlationMatrix[featureIndex].reduce(
      (sum, corr, i) => (i !== featureIndex ? sum + Math.abs(corr) : sum),
      0
    );

    return 1 + sumCorr * 0.5;
  }
}

/**
 * Graph-based anomaly detection
 * Detects unusual relationships between entities
 */
class GraphAnomalyDetector {
  private edges: Map<string, Set<string>> = new Map();
  private edgeAttributes: Map<string, Record<string, any>> = new Map();
  private nodeAttributes: Map<string, Record<string, any>> = new Map();

  /**
   * Add an edge between entities
   */
  addEdge(
    from: string,
    to: string,
    attributes?: Record<string, any>
  ): void {
    if (!this.edges.has(from)) {
      this.edges.set(from, new Set());
    }
    this.edges.get(from)!.add(to);

    if (attributes) {
      this.edgeAttributes.set(`${from}->${to}`, attributes);
    }
  }

  /**
   * Set node attributes
   */
  setNodeAttributes(nodeId: string, attributes: Record<string, any>): void {
    this.nodeAttributes.set(nodeId, attributes);
  }

  /**
   * Detect shared attributes between nodes (e.g., shared bank accounts)
   */
  detectSharedAttributes(
    attributeName: string
  ): Array<{ nodes: string[]; sharedValue: any }> {
    const attributeMap = new Map<any, string[]>();

    for (const [nodeId, attrs] of this.nodeAttributes) {
      const value = attrs[attributeName];
      if (value !== undefined) {
        if (!attributeMap.has(value)) {
          attributeMap.set(value, []);
        }
        attributeMap.get(value)!.push(nodeId);
      }
    }

    // Return groups with more than one node sharing the attribute
    const shared: Array<{ nodes: string[]; sharedValue: any }> = [];
    for (const [value, nodes] of attributeMap) {
      if (nodes.length > 1) {
        shared.push({ nodes, sharedValue: value });
      }
    }

    return shared;
  }

  /**
   * Detect circular payment patterns
   */
  detectCircles(maxLength = 4): string[][] {
    const circles: string[][] = [];

    for (const startNode of this.edges.keys()) {
      this.dfsCircle(startNode, [startNode], maxLength, circles);
    }

    return circles;
  }

  private dfsCircle(
    startNode: string,
    path: string[],
    maxLength: number,
    circles: string[][]
  ): void {
    if (path.length > maxLength) return;

    const currentNode = path[path.length - 1];
    const neighbors = this.edges.get(currentNode) || new Set();

    for (const neighbor of neighbors) {
      if (neighbor === startNode && path.length > 2) {
        // Found a circle
        circles.push([...path]);
      } else if (!path.includes(neighbor)) {
        this.dfsCircle(startNode, [...path, neighbor], maxLength, circles);
      }
    }
  }

  /**
   * Calculate node centrality (simplified degree centrality)
   */
  getNodeCentrality(nodeId: string): number {
    const outDegree = this.edges.get(nodeId)?.size || 0;

    let inDegree = 0;
    for (const neighbors of this.edges.values()) {
      if (neighbors.has(nodeId)) inDegree++;
    }

    const totalNodes = this.edges.size;
    return totalNodes > 1 ? (outDegree + inDegree) / (2 * (totalNodes - 1)) : 0;
  }

  /**
   * Detect unusually connected nodes (high centrality outliers)
   */
  detectCentralityOutliers(threshold = 2): string[] {
    const centralities: number[] = [];
    const nodeIds: string[] = [];

    for (const nodeId of this.edges.keys()) {
      nodeIds.push(nodeId);
      centralities.push(this.getNodeCentrality(nodeId));
    }

    if (centralities.length < 2) return [];

    const mean = centralities.reduce((a, b) => a + b) / centralities.length;
    const std = Math.sqrt(
      centralities.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) /
        centralities.length
    );

    return nodeIds.filter(
      (_, i) => Math.abs(centralities[i] - mean) > threshold * std
    );
  }
}

/**
 * Main Anomaly Detection System
 * Combines all detection methods
 */
export class AnomalyDetectionSystem {
  private isolationForest: IsolationForest;
  private autoencoder: AutoencoderDetector;
  private graphDetector: GraphAnomalyDetector;
  private ruleThresholds: Record<string, number>;

  constructor() {
    this.isolationForest = new IsolationForest(100, 256);
    this.autoencoder = new AutoencoderDetector(5);
    this.graphDetector = new GraphAnomalyDetector();
    this.ruleThresholds = {
      priceDeviationCritical: 3, // std deviations
      priceDeviationHigh: 2,
      priceDeviationMedium: 1.5,
      splitOrderThreshold: 0.9, // proximity to approval limit
      unusualHoursStart: 22, // 10 PM
      unusualHoursEnd: 6, // 6 AM
    };
  }

  /**
   * Train the system on historical data
   */
  train(data: { features: number[][]; graph?: { edges: Array<[string, string]> } }): void {
    if (data.features.length > 0) {
      this.isolationForest.fit(data.features);
      this.autoencoder.fit(data.features);
    }

    if (data.graph?.edges) {
      for (const [from, to] of data.graph.edges) {
        this.graphDetector.addEdge(from, to);
      }
    }
  }

  /**
   * Detect anomalies in a single entity
   */
  detect(
    entityType: EntityType,
    entityId: string,
    features: AnomalyFeatures
  ): AnomalyResult[] {
    const results: AnomalyResult[] = [];
    const featureVector = this.featuresToVector(features);

    // Layer 1: Isolation Forest
    const isoScore = this.isolationForest.score(featureVector);
    if (isoScore > 0.6) {
      results.push(this.createAnomalyResult(
        entityType,
        entityId,
        this.classifyAnomalyType(features),
        this.scoreSeverity(isoScore),
        isoScore,
        DetectionMethod.ISOLATION_FOREST,
        this.generateDescription(features, "statistical outlier"),
        features
      ));
    }

    // Layer 2: Autoencoder (pattern detection)
    const aeScore = this.autoencoder.score(featureVector);
    if (aeScore > 0.65) {
      results.push(this.createAnomalyResult(
        entityType,
        entityId,
        this.classifyPatternAnomaly(features),
        this.scoreSeverity(aeScore),
        aeScore,
        DetectionMethod.AUTOENCODER,
        this.generateDescription(features, "unusual pattern"),
        features
      ));
    }

    // Layer 3: Rule-based checks
    const ruleAnomalies = this.applyRules(entityType, entityId, features);
    results.push(...ruleAnomalies);

    return results;
  }

  /**
   * Detect graph anomalies
   */
  detectGraphAnomalies(): AnomalyResult[] {
    const results: AnomalyResult[] = [];

    // Check for shared bank accounts
    const sharedBankAccounts = this.graphDetector.detectSharedAttributes("bankAccount");
    for (const { nodes, sharedValue } of sharedBankAccounts) {
      results.push(this.createAnomalyResult(
        "vendor",
        nodes.join(","),
        AnomalyType.FRAUD_INDICATOR,
        Severity.CRITICAL,
        0.95,
        DetectionMethod.GRAPH_ANOMALY,
        `${nodes.length} vendors share the same bank account`,
        { vendors: nodes, sharedBankAccount: sharedValue }
      ));
    }

    // Check for circular payments
    const circles = this.graphDetector.detectCircles(4);
    for (const circle of circles) {
      results.push(this.createAnomalyResult(
        "vendor",
        circle.join("->"),
        AnomalyType.FRAUD_INDICATOR,
        Severity.HIGH,
        0.85,
        DetectionMethod.GRAPH_ANOMALY,
        `Circular payment pattern detected: ${circle.join(" -> ")}`,
        { circularPath: circle }
      ));
    }

    return results;
  }

  /**
   * Add vendor to graph
   */
  addVendorToGraph(
    vendorId: string,
    attributes: Record<string, any>,
    relationships: Array<{ targetVendor: string; type: string }>
  ): void {
    this.graphDetector.setNodeAttributes(vendorId, attributes);
    for (const rel of relationships) {
      this.graphDetector.addEdge(vendorId, rel.targetVendor, { type: rel.type });
    }
  }

  private featuresToVector(features: AnomalyFeatures): number[] {
    return [
      features.priceDeviation ?? 0,
      features.pricePercentile ?? 0.5,
      features.priceVsContract ?? 1,
      features.orderQuantity ?? 0,
      features.quantityDeviation ?? 0,
      features.hourOfDay ? features.hourOfDay / 24 : 0.5,
      features.dayOfWeek ? features.dayOfWeek / 7 : 0.5,
      features.isBusinessHours ? 1 : 0,
      features.vendorOrderFrequency ?? 0.5,
      features.orderSplitIndicator ?? 0,
      features.approvalThresholdProximity ?? 0,
      features.userOrderFrequency ?? 0.5,
      features.userVendorConcentration ?? 0.5,
    ];
  }

  private classifyAnomalyType(features: AnomalyFeatures): AnomalyType {
    if (features.priceDeviation && Math.abs(features.priceDeviation) > 2) {
      return AnomalyType.PRICE_ANOMALY;
    }
    if (features.quantityDeviation && Math.abs(features.quantityDeviation) > 2) {
      return AnomalyType.VOLUME_ANOMALY;
    }
    if (features.isBusinessHours === false) {
      return AnomalyType.TIMING_ANOMALY;
    }
    if (features.approvalThresholdProximity && features.approvalThresholdProximity > 0.9) {
      return AnomalyType.POLICY_VIOLATION;
    }
    return AnomalyType.PATTERN_ANOMALY;
  }

  private classifyPatternAnomaly(features: AnomalyFeatures): AnomalyType {
    if (features.orderSplitIndicator && features.orderSplitIndicator > 0.8) {
      return AnomalyType.FRAUD_INDICATOR;
    }
    if (features.userVendorConcentration && features.userVendorConcentration > 0.8) {
      return AnomalyType.FRAUD_INDICATOR;
    }
    return AnomalyType.PATTERN_ANOMALY;
  }

  private scoreSeverity(score: number): Severity {
    if (score > 0.9) return Severity.CRITICAL;
    if (score > 0.8) return Severity.HIGH;
    if (score > 0.7) return Severity.MEDIUM;
    return Severity.LOW;
  }

  private generateDescription(features: AnomalyFeatures, context: string): string {
    const issues: string[] = [];

    if (features.priceDeviation && Math.abs(features.priceDeviation) > 1.5) {
      issues.push(
        `price ${features.priceDeviation > 0 ? "above" : "below"} normal by ${Math.abs(features.priceDeviation).toFixed(1)} std deviations`
      );
    }
    if (features.approvalThresholdProximity && features.approvalThresholdProximity > 0.9) {
      issues.push("order amount suspiciously close to approval threshold");
    }
    if (features.isBusinessHours === false) {
      issues.push("transaction outside business hours");
    }

    return issues.length > 0
      ? `Detected ${context}: ${issues.join(", ")}`
      : `Detected ${context} based on combined factors`;
  }

  private applyRules(
    entityType: EntityType,
    entityId: string,
    features: AnomalyFeatures
  ): AnomalyResult[] {
    const results: AnomalyResult[] = [];

    // Rule: Split order detection
    if (
      features.approvalThresholdProximity !== undefined &&
      features.approvalThresholdProximity > this.ruleThresholds.splitOrderThreshold
    ) {
      results.push(this.createAnomalyResult(
        entityType,
        entityId,
        AnomalyType.POLICY_VIOLATION,
        Severity.MEDIUM,
        0.8,
        DetectionMethod.RULE_BASED,
        "Order amount is suspiciously close to approval threshold - possible split order",
        { proximityToThreshold: features.approvalThresholdProximity }
      ));
    }

    // Rule: After-hours transaction
    if (
      features.hourOfDay !== undefined &&
      (features.hourOfDay >= this.ruleThresholds.unusualHoursStart ||
        features.hourOfDay < this.ruleThresholds.unusualHoursEnd)
    ) {
      results.push(this.createAnomalyResult(
        entityType,
        entityId,
        AnomalyType.TIMING_ANOMALY,
        Severity.LOW,
        0.6,
        DetectionMethod.RULE_BASED,
        "Transaction occurred outside normal business hours",
        { hourOfDay: features.hourOfDay }
      ));
    }

    return results;
  }

  private createAnomalyResult(
    entityType: EntityType,
    entityId: string,
    anomalyType: AnomalyType,
    severity: Severity,
    confidence: number,
    detectionMethod: DetectionMethod,
    description: string,
    details: Record<string, any>
  ): AnomalyResult {
    return {
      id: `anom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      entityType,
      entityId,
      anomalyType,
      severity,
      confidence,
      detectionMethod,
      description,
      details,
      recommendedActions: this.generateRecommendedActions(anomalyType, severity),
      timestamp: new Date(),
    };
  }

  private generateRecommendedActions(
    anomalyType: AnomalyType,
    severity: Severity
  ): string[] {
    const actions: string[] = [];

    switch (anomalyType) {
      case AnomalyType.PRICE_ANOMALY:
        actions.push("Compare with contract pricing");
        actions.push("Request vendor explanation");
        if (severity === Severity.HIGH || severity === Severity.CRITICAL) {
          actions.push("Consider filing dispute");
        }
        break;
      case AnomalyType.FRAUD_INDICATOR:
        actions.push("Immediately flag for investigation");
        actions.push("Review all recent transactions");
        actions.push("Escalate to compliance team");
        break;
      case AnomalyType.POLICY_VIOLATION:
        actions.push("Review requester's order history");
        actions.push("Check for policy compliance");
        if (severity !== Severity.LOW) {
          actions.push("Schedule compliance training");
        }
        break;
      default:
        actions.push("Review transaction details");
        actions.push("Monitor for repeat occurrences");
    }

    return actions;
  }
}

// Export singleton instance
export const anomalyDetector = new AnomalyDetectionSystem();
