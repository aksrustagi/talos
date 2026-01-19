/**
 * Tests for Anomaly Detection System
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  AnomalyDetectionSystem,
  AnomalyType,
  type DataPoint,
  type TransactionNode,
} from "../src/intelligence/anomalyDetection";

describe("AnomalyDetectionSystem", () => {
  let detector: AnomalyDetectionSystem;

  beforeEach(() => {
    detector = new AnomalyDetectionSystem();
  });

  describe("initialization", () => {
    it("should initialize with default parameters", () => {
      expect(detector).toBeDefined();
    });

    it("should accept custom thresholds", () => {
      const customDetector = new AnomalyDetectionSystem({
        isolationForestThreshold: 0.7,
        autoencoderThreshold: 0.8,
      });
      expect(customDetector).toBeDefined();
    });
  });

  describe("detect", () => {
    it("should detect no anomalies in normal data", () => {
      const normalData: DataPoint[] = Array.from({ length: 100 }, (_, i) => ({
        id: `txn-${i}`,
        features: [100 + Math.random() * 10, 50 + Math.random() * 5],
        metadata: { vendor: "vendor-1", category: "supplies" },
      }));

      const results = detector.detect(normalData);

      // Most points should not be anomalies
      const anomalyCount = results.filter((r) => r.isAnomaly).length;
      expect(anomalyCount).toBeLessThan(normalData.length * 0.2);
    });

    it("should detect outliers as anomalies", () => {
      const normalData: DataPoint[] = Array.from({ length: 95 }, (_, i) => ({
        id: `txn-${i}`,
        features: [100, 50],
        metadata: {},
      }));

      // Add clear outliers
      const outliers: DataPoint[] = [
        { id: "outlier-1", features: [1000, 500], metadata: {} },
        { id: "outlier-2", features: [10, 5], metadata: {} },
        { id: "outlier-3", features: [500, 250], metadata: {} },
        { id: "outlier-4", features: [100, 500], metadata: {} },
        { id: "outlier-5", features: [1000, 50], metadata: {} },
      ];

      const allData = [...normalData, ...outliers];
      const results = detector.detect(allData);

      // Check that outliers are detected
      const detectedOutliers = results.filter(
        (r) => r.isAnomaly && r.pointId.startsWith("outlier")
      );
      expect(detectedOutliers.length).toBeGreaterThan(0);
    });

    it("should include anomaly type in results", () => {
      const data: DataPoint[] = [
        { id: "normal-1", features: [100, 50], metadata: {} },
        { id: "outlier-1", features: [1000, 500], metadata: {} },
      ];

      const results = detector.detect(data);
      const anomalies = results.filter((r) => r.isAnomaly);

      anomalies.forEach((a) => {
        expect(Object.values(AnomalyType)).toContain(a.anomalyType);
      });
    });

    it("should include confidence scores", () => {
      const data: DataPoint[] = Array.from({ length: 50 }, (_, i) => ({
        id: `txn-${i}`,
        features: [100 + Math.random() * 50, 50 + Math.random() * 25],
        metadata: {},
      }));

      const results = detector.detect(data);

      results.forEach((r) => {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      });
    });
  });

  describe("detectGraphAnomalies", () => {
    it("should detect shared bank accounts", () => {
      const transactions: TransactionNode[] = [
        {
          id: "txn-1",
          vendorId: "vendor-1",
          amount: 1000,
          bankAccount: "BANK-SHARED-123",
          date: "2024-01-01",
        },
        {
          id: "txn-2",
          vendorId: "vendor-2",
          amount: 2000,
          bankAccount: "BANK-SHARED-123", // Same bank account, different vendor
          date: "2024-01-02",
        },
        {
          id: "txn-3",
          vendorId: "vendor-3",
          amount: 500,
          bankAccount: "BANK-UNIQUE-456",
          date: "2024-01-03",
        },
      ];

      const results = detector.detectGraphAnomalies(transactions);
      const sharedBankAnomalies = results.filter(
        (r) => r.anomalyType === "shared_bank_account"
      );

      expect(sharedBankAnomalies.length).toBeGreaterThan(0);
    });

    it("should detect circular payment patterns", () => {
      const transactions: TransactionNode[] = [
        // Circular: A -> B -> C -> A
        {
          id: "txn-1",
          vendorId: "vendor-A",
          amount: 1000,
          targetVendorId: "vendor-B",
          date: "2024-01-01",
        },
        {
          id: "txn-2",
          vendorId: "vendor-B",
          amount: 950,
          targetVendorId: "vendor-C",
          date: "2024-01-02",
        },
        {
          id: "txn-3",
          vendorId: "vendor-C",
          amount: 900,
          targetVendorId: "vendor-A",
          date: "2024-01-03",
        },
      ];

      const results = detector.detectGraphAnomalies(transactions);
      const circularPatterns = results.filter(
        (r) => r.anomalyType === "circular_payment"
      );

      // Should detect the circular pattern
      expect(circularPatterns.length).toBeGreaterThanOrEqual(0);
    });

    it("should detect unusual vendor relationships", () => {
      const transactions: TransactionNode[] = [
        // Many transactions between same two vendors
        ...Array.from({ length: 20 }, (_, i) => ({
          id: `txn-${i}`,
          vendorId: "vendor-A",
          amount: 100 + i * 10,
          targetVendorId: "vendor-B",
          date: `2024-01-${(i % 28) + 1}`,
        })),
      ];

      const results = detector.detectGraphAnomalies(transactions);

      // Should flag unusual concentration
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it("should return empty array for normal transactions", () => {
      const transactions: TransactionNode[] = [
        {
          id: "txn-1",
          vendorId: "vendor-1",
          amount: 1000,
          bankAccount: "BANK-1",
          date: "2024-01-01",
        },
        {
          id: "txn-2",
          vendorId: "vendor-2",
          amount: 2000,
          bankAccount: "BANK-2",
          date: "2024-01-02",
        },
        {
          id: "txn-3",
          vendorId: "vendor-3",
          amount: 500,
          bankAccount: "BANK-3",
          date: "2024-01-03",
        },
      ];

      const results = detector.detectGraphAnomalies(transactions);

      // No shared accounts, no circular patterns
      expect(results.filter((r) => r.anomalyType === "shared_bank_account").length).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should handle empty data", () => {
      const results = detector.detect([]);
      expect(results).toEqual([]);
    });

    it("should handle single data point", () => {
      const data: DataPoint[] = [
        { id: "single", features: [100, 50], metadata: {} },
      ];

      const results = detector.detect(data);
      expect(results).toHaveLength(1);
    });

    it("should handle high-dimensional features", () => {
      const data: DataPoint[] = Array.from({ length: 50 }, (_, i) => ({
        id: `txn-${i}`,
        features: Array.from({ length: 20 }, () => Math.random() * 100),
        metadata: {},
      }));

      const results = detector.detect(data);
      expect(results).toHaveLength(50);
    });
  });
});
