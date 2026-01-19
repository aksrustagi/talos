/**
 * Tests for HMM Price Predictor
 */

import { describe, it, expect, beforeEach } from "vitest";
import { HMMPricePredictor, PriceState, type PriceObservation } from "../src/intelligence/hmm";

describe("HMMPricePredictor", () => {
  let predictor: HMMPricePredictor;

  beforeEach(() => {
    predictor = new HMMPricePredictor();
  });

  describe("initialization", () => {
    it("should initialize with default parameters", () => {
      expect(predictor).toBeDefined();
    });
  });

  describe("predict", () => {
    it("should predict STABLE state for constant prices", () => {
      const observations: PriceObservation[] = Array.from({ length: 30 }, (_, i) => ({
        date: new Date(2024, 0, i + 1).toISOString(),
        price: 100,
        volume: 10,
      }));

      const result = predictor.predict(observations, 100, 120);

      expect(result.currentState).toBe(PriceState.STABLE);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should predict RISING state for increasing prices", () => {
      const observations: PriceObservation[] = Array.from({ length: 30 }, (_, i) => ({
        date: new Date(2024, 0, i + 1).toISOString(),
        price: 100 + i * 2, // 2% daily increase
        volume: 10,
      }));

      const result = predictor.predict(observations, 158, 120);

      expect([PriceState.RISING, PriceState.PEAK]).toContain(result.currentState);
    });

    it("should predict DECLINING state for decreasing prices", () => {
      const observations: PriceObservation[] = Array.from({ length: 30 }, (_, i) => ({
        date: new Date(2024, 0, i + 1).toISOString(),
        price: 150 - i * 2, // 2% daily decrease
        volume: 10,
      }));

      const result = predictor.predict(observations, 92, 120);

      expect([PriceState.DECLINING, PriceState.TROUGH]).toContain(result.currentState);
    });

    it("should predict VOLATILE state for erratic prices", () => {
      const observations: PriceObservation[] = Array.from({ length: 30 }, (_, i) => ({
        date: new Date(2024, 0, i + 1).toISOString(),
        price: 100 + (i % 2 === 0 ? 20 : -20), // Oscillating wildly
        volume: 10,
      }));

      const result = predictor.predict(observations, 100, 120);

      expect(result.currentState).toBe(PriceState.VOLATILE);
    });

    it("should calculate annual impact correctly", () => {
      const observations: PriceObservation[] = Array.from({ length: 30 }, (_, i) => ({
        date: new Date(2024, 0, i + 1).toISOString(),
        price: 100,
        volume: 10,
      }));

      const result = predictor.predict(observations, 110, 100); // 10% increase

      // Annual impact = (110 - 100) * 100 = $1000
      expect(result.annualImpact).toBe(1000);
    });

    it("should provide purchase recommendation", () => {
      const observations: PriceObservation[] = Array.from({ length: 30 }, (_, i) => ({
        date: new Date(2024, 0, i + 1).toISOString(),
        price: 100,
        volume: 10,
      }));

      const result = predictor.predict(observations, 100, 120);

      expect(result.recommendation).toBeDefined();
      expect(["buy_now", "wait", "urgent_buy", "hold"]).toContain(result.recommendation);
    });

    it("should include state probabilities", () => {
      const observations: PriceObservation[] = Array.from({ length: 30 }, (_, i) => ({
        date: new Date(2024, 0, i + 1).toISOString(),
        price: 100,
        volume: 10,
      }));

      const result = predictor.predict(observations, 100, 120);

      expect(result.stateProbabilities).toBeDefined();
      expect(Object.keys(result.stateProbabilities)).toHaveLength(6);

      // Probabilities should sum to approximately 1
      const sum = Object.values(result.stateProbabilities).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 1);
    });
  });

  describe("edge cases", () => {
    it("should handle empty observations", () => {
      const result = predictor.predict([], 100, 120);

      expect(result.currentState).toBe(PriceState.STABLE);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it("should handle single observation", () => {
      const observations: PriceObservation[] = [
        { date: new Date().toISOString(), price: 100, volume: 10 },
      ];

      const result = predictor.predict(observations, 100, 120);

      expect(result).toBeDefined();
      expect(result.currentState).toBeDefined();
    });

    it("should handle zero volume", () => {
      const observations: PriceObservation[] = Array.from({ length: 10 }, (_, i) => ({
        date: new Date(2024, 0, i + 1).toISOString(),
        price: 100,
        volume: 10,
      }));

      const result = predictor.predict(observations, 100, 0);

      expect(result.annualImpact).toBe(0);
    });
  });
});
