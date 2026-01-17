/**
 * Hidden Markov Model for Price State Prediction
 *
 * This module implements an HMM to predict price states and optimal purchase timing.
 * States: STABLE, RISING, PEAK, DECLINING, TROUGH, VOLATILE
 * Observations: Price changes, inventory levels, volume patterns, seasonal indicators
 */

// Price states
export enum PriceState {
  STABLE = "stable",
  RISING = "rising",
  PEAK = "peak",
  DECLINING = "declining",
  TROUGH = "trough",
  VOLATILE = "volatile",
}

// State indices for matrix operations
const STATE_INDEX: Record<PriceState, number> = {
  [PriceState.STABLE]: 0,
  [PriceState.RISING]: 1,
  [PriceState.PEAK]: 2,
  [PriceState.DECLINING]: 3,
  [PriceState.TROUGH]: 4,
  [PriceState.VOLATILE]: 5,
};

// Initial state probabilities (prior distribution)
const INITIAL_PROBS = [0.4, 0.15, 0.05, 0.15, 0.15, 0.1];

// Transition probability matrix P(state_t | state_t-1)
// Rows: from state, Columns: to state
const TRANSITION_MATRIX = [
  // STABLE  RISING   PEAK    DECLINING TROUGH  VOLATILE
  [0.7, 0.15, 0.02, 0.08, 0.02, 0.03], // From STABLE
  [0.1, 0.6, 0.25, 0.02, 0.01, 0.02], // From RISING
  [0.15, 0.05, 0.2, 0.55, 0.02, 0.03], // From PEAK
  [0.12, 0.03, 0.02, 0.58, 0.22, 0.03], // From DECLINING
  [0.4, 0.3, 0.02, 0.05, 0.18, 0.05], // From TROUGH
  [0.2, 0.15, 0.1, 0.15, 0.1, 0.3], // From VOLATILE
];

// Observation structure
export interface PriceObservation {
  priceChange: number; // Percentage change from previous period
  inventoryLevel: number; // 0-1, vendor inventory signal
  orderVolume: number; // 0-1, normalized order volume
  seasonalIndicator: number; // 0-1, seasonal position
  newsIndicator: number; // 0-1, supply chain news sentiment
}

// Emission probability parameters (Gaussian means and variances for each state)
const EMISSION_PARAMS: Record<
  PriceState,
  {
    priceChange: { mean: number; std: number };
    inventoryLevel: { mean: number; std: number };
    orderVolume: { mean: number; std: number };
    seasonalIndicator: { mean: number; std: number };
    newsIndicator: { mean: number; std: number };
  }
> = {
  [PriceState.STABLE]: {
    priceChange: { mean: 0, std: 0.02 },
    inventoryLevel: { mean: 0.6, std: 0.15 },
    orderVolume: { mean: 0.5, std: 0.15 },
    seasonalIndicator: { mean: 0.5, std: 0.2 },
    newsIndicator: { mean: 0.5, std: 0.15 },
  },
  [PriceState.RISING]: {
    priceChange: { mean: 0.05, std: 0.03 },
    inventoryLevel: { mean: 0.4, std: 0.15 },
    orderVolume: { mean: 0.7, std: 0.15 },
    seasonalIndicator: { mean: 0.6, std: 0.2 },
    newsIndicator: { mean: 0.4, std: 0.15 },
  },
  [PriceState.PEAK]: {
    priceChange: { mean: 0.02, std: 0.02 },
    inventoryLevel: { mean: 0.3, std: 0.1 },
    orderVolume: { mean: 0.8, std: 0.1 },
    seasonalIndicator: { mean: 0.7, std: 0.15 },
    newsIndicator: { mean: 0.3, std: 0.15 },
  },
  [PriceState.DECLINING]: {
    priceChange: { mean: -0.04, std: 0.03 },
    inventoryLevel: { mean: 0.7, std: 0.15 },
    orderVolume: { mean: 0.4, std: 0.15 },
    seasonalIndicator: { mean: 0.4, std: 0.2 },
    newsIndicator: { mean: 0.6, std: 0.15 },
  },
  [PriceState.TROUGH]: {
    priceChange: { mean: -0.01, std: 0.02 },
    inventoryLevel: { mean: 0.8, std: 0.1 },
    orderVolume: { mean: 0.3, std: 0.1 },
    seasonalIndicator: { mean: 0.3, std: 0.15 },
    newsIndicator: { mean: 0.7, std: 0.1 },
  },
  [PriceState.VOLATILE]: {
    priceChange: { mean: 0, std: 0.08 },
    inventoryLevel: { mean: 0.5, std: 0.25 },
    orderVolume: { mean: 0.5, std: 0.25 },
    seasonalIndicator: { mean: 0.5, std: 0.3 },
    newsIndicator: { mean: 0.3, std: 0.2 },
  },
};

// Gaussian probability density function
function gaussianPdf(x: number, mean: number, std: number): number {
  const coefficient = 1 / (std * Math.sqrt(2 * Math.PI));
  const exponent = -Math.pow(x - mean, 2) / (2 * Math.pow(std, 2));
  return coefficient * Math.exp(exponent);
}

// Calculate emission probability P(observation | state)
function emissionProbability(observation: PriceObservation, state: PriceState): number {
  const params = EMISSION_PARAMS[state];

  // Assume independence between observation dimensions (naive assumption)
  const priceProb = gaussianPdf(
    observation.priceChange,
    params.priceChange.mean,
    params.priceChange.std
  );
  const inventoryProb = gaussianPdf(
    observation.inventoryLevel,
    params.inventoryLevel.mean,
    params.inventoryLevel.std
  );
  const volumeProb = gaussianPdf(
    observation.orderVolume,
    params.orderVolume.mean,
    params.orderVolume.std
  );
  const seasonalProb = gaussianPdf(
    observation.seasonalIndicator,
    params.seasonalIndicator.mean,
    params.seasonalIndicator.std
  );
  const newsProb = gaussianPdf(
    observation.newsIndicator,
    params.newsIndicator.mean,
    params.newsIndicator.std
  );

  // Product of probabilities (log-space would be better for numerical stability)
  return priceProb * inventoryProb * volumeProb * seasonalProb * newsProb;
}

// State prediction result
export interface PriceStatePrediction {
  currentState: PriceState;
  stateProbability: number;
  stateProbabilities: Record<PriceState, number>;
  predictions: {
    day7: { price: number; confidence: number; state: PriceState };
    day30: { price: number; confidence: number; state: PriceState };
    day90: { price: number; confidence: number; state: PriceState };
  };
  recommendation: "buy_now" | "wait" | "urgent";
  waitUntil?: Date;
  expectedSavings?: number;
}

/**
 * HMM Price Predictor class
 */
export class HMMPricePredictor {
  private transitionMatrix: number[][];
  private initialProbs: number[];

  constructor(
    customTransitions?: number[][],
    customInitialProbs?: number[]
  ) {
    this.transitionMatrix = customTransitions || TRANSITION_MATRIX;
    this.initialProbs = customInitialProbs || INITIAL_PROBS;
  }

  /**
   * Forward algorithm to compute P(observations, state_t = s)
   */
  private forward(observations: PriceObservation[]): number[][] {
    const T = observations.length;
    const N = Object.keys(PriceState).length / 2; // Enum has both keys and values
    const alpha: number[][] = Array(T)
      .fill(null)
      .map(() => Array(N).fill(0));

    // Initialize
    const states = Object.values(PriceState).filter(
      (s) => typeof s === "string"
    ) as PriceState[];
    for (let i = 0; i < N; i++) {
      alpha[0][i] =
        this.initialProbs[i] * emissionProbability(observations[0], states[i]);
    }

    // Recursion
    for (let t = 1; t < T; t++) {
      for (let j = 0; j < N; j++) {
        let sum = 0;
        for (let i = 0; i < N; i++) {
          sum += alpha[t - 1][i] * this.transitionMatrix[i][j];
        }
        alpha[t][j] = sum * emissionProbability(observations[t], states[j]);
      }
    }

    return alpha;
  }

  /**
   * Backward algorithm to compute P(observations_t+1:T | state_t = s)
   */
  private backward(observations: PriceObservation[]): number[][] {
    const T = observations.length;
    const N = Object.keys(PriceState).length / 2;
    const beta: number[][] = Array(T)
      .fill(null)
      .map(() => Array(N).fill(0));

    const states = Object.values(PriceState).filter(
      (s) => typeof s === "string"
    ) as PriceState[];

    // Initialize
    for (let i = 0; i < N; i++) {
      beta[T - 1][i] = 1;
    }

    // Recursion
    for (let t = T - 2; t >= 0; t--) {
      for (let i = 0; i < N; i++) {
        let sum = 0;
        for (let j = 0; j < N; j++) {
          sum +=
            this.transitionMatrix[i][j] *
            emissionProbability(observations[t + 1], states[j]) *
            beta[t + 1][j];
        }
        beta[t][i] = sum;
      }
    }

    return beta;
  }

  /**
   * Compute state probabilities at time T given observations
   */
  private computeStateProbabilities(
    observations: PriceObservation[]
  ): Record<PriceState, number> {
    const alpha = this.forward(observations);
    const T = observations.length;
    const N = Object.keys(PriceState).length / 2;

    const states = Object.values(PriceState).filter(
      (s) => typeof s === "string"
    ) as PriceState[];

    // Normalize final alpha values to get state probabilities
    const totalProb = alpha[T - 1].reduce((sum, p) => sum + p, 0);
    const probs: Record<PriceState, number> = {} as Record<PriceState, number>;

    for (let i = 0; i < N; i++) {
      probs[states[i]] = totalProb > 0 ? alpha[T - 1][i] / totalProb : 1 / N;
    }

    return probs;
  }

  /**
   * Predict future state by multiplying transition matrix
   */
  private predictFutureState(
    currentProbs: Record<PriceState, number>,
    stepsAhead: number
  ): Record<PriceState, number> {
    const states = Object.values(PriceState).filter(
      (s) => typeof s === "string"
    ) as PriceState[];
    const N = states.length;

    // Convert to array
    let probs = states.map((s) => currentProbs[s]);

    // Matrix power via repeated multiplication
    for (let step = 0; step < stepsAhead; step++) {
      const newProbs = Array(N).fill(0);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          newProbs[j] += probs[i] * this.transitionMatrix[i][j];
        }
      }
      probs = newProbs;
    }

    // Convert back to record
    const result: Record<PriceState, number> = {} as Record<PriceState, number>;
    for (let i = 0; i < N; i++) {
      result[states[i]] = probs[i];
    }

    return result;
  }

  /**
   * Get most likely state from probability distribution
   */
  private getMostLikelyState(probs: Record<PriceState, number>): {
    state: PriceState;
    probability: number;
  } {
    let maxState = PriceState.STABLE;
    let maxProb = 0;

    for (const [state, prob] of Object.entries(probs)) {
      if (prob > maxProb) {
        maxProb = prob;
        maxState = state as PriceState;
      }
    }

    return { state: maxState, probability: maxProb };
  }

  /**
   * Generate purchase recommendation based on state
   */
  private generateRecommendation(
    currentState: PriceState,
    futureStates: {
      day7: Record<PriceState, number>;
      day30: Record<PriceState, number>;
      day90: Record<PriceState, number>;
    }
  ): { recommendation: "buy_now" | "wait" | "urgent"; waitUntil?: Date } {
    // Check if currently at trough - BUY NOW
    if (currentState === PriceState.TROUGH) {
      return { recommendation: "buy_now" };
    }

    // Check if price is declining - might want to wait
    if (
      currentState === PriceState.PEAK ||
      currentState === PriceState.DECLINING
    ) {
      const day30Trough = futureStates.day30[PriceState.TROUGH] || 0;
      const day30Declining = futureStates.day30[PriceState.DECLINING] || 0;

      if (day30Trough > 0.3 || day30Declining > 0.4) {
        const waitUntil = new Date();
        waitUntil.setDate(waitUntil.getDate() + 30);
        return { recommendation: "wait", waitUntil };
      }
    }

    // Check if price is rising rapidly - URGENT
    if (currentState === PriceState.RISING) {
      const day7Peak = futureStates.day7[PriceState.PEAK] || 0;
      if (day7Peak > 0.4) {
        return { recommendation: "urgent" };
      }
    }

    // Check 30-day outlook for troughs
    const day30Best = this.getMostLikelyState(futureStates.day30);
    if (
      day30Best.state === PriceState.TROUGH ||
      day30Best.state === PriceState.DECLINING
    ) {
      const waitUntil = new Date();
      waitUntil.setDate(waitUntil.getDate() + 30);
      return { recommendation: "wait", waitUntil };
    }

    // Default to buy now if no clear signal
    return { recommendation: "buy_now" };
  }

  /**
   * Main prediction method
   */
  predict(
    observations: PriceObservation[],
    currentPrice: number,
    annualVolume: number
  ): PriceStatePrediction {
    if (observations.length === 0) {
      throw new Error("At least one observation is required");
    }

    // Get current state probabilities
    const stateProbabilities = this.computeStateProbabilities(observations);
    const { state: currentState, probability: stateProbability } =
      this.getMostLikelyState(stateProbabilities);

    // Predict future states
    const futureStates = {
      day7: this.predictFutureState(stateProbabilities, 7),
      day30: this.predictFutureState(stateProbabilities, 30),
      day90: this.predictFutureState(stateProbabilities, 90),
    };

    // Generate recommendation
    const { recommendation, waitUntil } = this.generateRecommendation(
      currentState,
      futureStates
    );

    // Estimate price changes based on state expectations
    const stateExpectedChanges: Record<PriceState, number> = {
      [PriceState.STABLE]: 0,
      [PriceState.RISING]: 0.05,
      [PriceState.PEAK]: 0.02,
      [PriceState.DECLINING]: -0.04,
      [PriceState.TROUGH]: -0.01,
      [PriceState.VOLATILE]: 0,
    };

    // Calculate expected prices
    const day7MostLikely = this.getMostLikelyState(futureStates.day7);
    const day30MostLikely = this.getMostLikelyState(futureStates.day30);
    const day90MostLikely = this.getMostLikelyState(futureStates.day90);

    const predictions = {
      day7: {
        price: currentPrice * (1 + stateExpectedChanges[day7MostLikely.state]),
        confidence: day7MostLikely.probability,
        state: day7MostLikely.state,
      },
      day30: {
        price: currentPrice * (1 + stateExpectedChanges[day30MostLikely.state] * 4),
        confidence: day30MostLikely.probability * 0.9,
        state: day30MostLikely.state,
      },
      day90: {
        price:
          currentPrice * (1 + stateExpectedChanges[day90MostLikely.state] * 12),
        confidence: day90MostLikely.probability * 0.8,
        state: day90MostLikely.state,
      },
    };

    // Calculate expected savings
    let expectedSavings: number | undefined;
    if (recommendation === "wait" && waitUntil) {
      const expectedPriceReduction = currentPrice - predictions.day30.price;
      if (expectedPriceReduction > 0) {
        expectedSavings = expectedPriceReduction * annualVolume;
      }
    }

    return {
      currentState,
      stateProbability,
      stateProbabilities,
      predictions,
      recommendation,
      waitUntil,
      expectedSavings,
    };
  }

  /**
   * Batch prediction for multiple products
   */
  batchPredict(
    products: Array<{
      productId: string;
      observations: PriceObservation[];
      currentPrice: number;
      annualVolume: number;
    }>
  ): Array<{ productId: string } & PriceStatePrediction> {
    return products.map((product) => ({
      productId: product.productId,
      ...this.predict(
        product.observations,
        product.currentPrice,
        product.annualVolume
      ),
    }));
  }
}

// Export singleton instance
export const hmmPredictor = new HMMPricePredictor();

// Utility function to convert price history to observations
export function priceHistoryToObservations(
  priceHistory: Array<{ price: number; date: Date }>,
  additionalData?: {
    inventoryLevels?: number[];
    orderVolumes?: number[];
  }
): PriceObservation[] {
  const observations: PriceObservation[] = [];

  for (let i = 1; i < priceHistory.length; i++) {
    const priceChange =
      (priceHistory[i].price - priceHistory[i - 1].price) /
      priceHistory[i - 1].price;

    // Calculate seasonal indicator based on month
    const month = priceHistory[i].date.getMonth();
    const seasonalIndicator =
      month <= 2
        ? 0.8 // Q1 budget flush
        : month <= 5
          ? 0.3 // Q2 low season
          : month <= 8
            ? 0.6 // Back to school
            : 0.5; // Q4 moderate

    observations.push({
      priceChange,
      inventoryLevel: additionalData?.inventoryLevels?.[i] ?? 0.5,
      orderVolume: additionalData?.orderVolumes?.[i] ?? 0.5,
      seasonalIndicator,
      newsIndicator: 0.5, // Default to neutral
    });
  }

  return observations;
}
