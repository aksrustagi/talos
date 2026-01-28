/**
 * Agent 1: Catalog Intelligence Agent
 *
 * Purpose: Index, search, and match products across internal catalogs and external sources
 * Runtime: LangGraph + Inngest
 *
 * Capabilities:
 * - Search internal indexed products
 * - Query vendor APIs
 * - Web-based product search
 * - Match products across sources
 * - Extract specs from product pages
 * - Normalize pricing (unit, quantity breaks)
 */

import { ChatAnthropic } from "@langchain/anthropic";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// State definition for the Catalog Intelligence Agent
const CatalogState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  query: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
  productType: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
  specifications: Annotation<Record<string, any>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),
  quantity: Annotation<number>({
    reducer: (_, b) => b,
    default: () => 1,
  }),
  budgetLimit: Annotation<number | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  urgencyLevel: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "standard",
  }),
  internalResults: Annotation<Product[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  externalResults: Annotation<Product[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  matchedProducts: Annotation<MatchedProduct[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  recommendation: Annotation<Recommendation | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  searchHistory: Annotation<SearchStep[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  universityId: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
});

// Types
interface Product {
  id: string;
  name: string;
  description: string;
  manufacturer: string;
  manufacturerPartNumber: string;
  vendorId: string;
  vendorName: string;
  vendorSku: string;
  price: number;
  listPrice: number;
  contractPrice?: number;
  pricePerUnit: number;
  unitOfMeasure: string;
  packSize: number;
  availability: string;
  leadTimeDays: number;
  category: string[];
  specifications: Record<string, any>;
  source: "internal" | "external";
  isContracted: boolean;
}

interface MatchedProduct {
  product: Product;
  matchScore: number;
  matchReasons: string[];
  specificationMatch: number;
  priceRank: number;
  totalCost: number;
  savingsVsListPrice: number;
  isDiverse: boolean;
  isSustainable: boolean;
}

interface Recommendation {
  primaryProduct: MatchedProduct;
  alternativeProducts: MatchedProduct[];
  justification: string;
  estimatedSavings: number;
  complianceNotes: string[];
  warnings: string[];
}

interface SearchStep {
  source: string;
  query: string;
  resultsCount: number;
  timestamp: number;
}

// Tool definitions
const catalogSearchTool = tool(
  async (input: {
    query: string;
    productType?: string;
    manufacturer?: string;
    category?: string;
    universityId: string;
  }) => {
    // This would connect to Convex to search the internal catalog
    // For now, return mock data structure
    const results: Product[] = [
      {
        id: "prod_001",
        name: "50ml Conical Centrifuge Tubes, Sterile",
        description: "Polypropylene conical tubes with screw caps, sterile, graduated",
        manufacturer: "Corning",
        manufacturerPartNumber: "430829",
        vendorId: "vendor_fisher",
        vendorName: "Fisher Scientific",
        vendorSku: "14-959-49A",
        price: 185.00,
        listPrice: 220.00,
        contractPrice: 185.00,
        pricePerUnit: 0.37,
        unitOfMeasure: "case",
        packSize: 500,
        availability: "in_stock",
        leadTimeDays: 2,
        category: ["Lab Supplies", "Plasticware", "Tubes"],
        specifications: {
          volume: "50ml",
          material: "Polypropylene",
          sterile: true,
          graduated: true,
          capType: "Screw cap",
        },
        source: "internal",
        isContracted: true,
      },
    ];

    return JSON.stringify({
      success: true,
      results,
      totalCount: results.length,
      searchParams: input,
    });
  },
  {
    name: "catalog_search",
    description: "Search the internal indexed product catalog for matching products",
    schema: z.object({
      query: z.string().describe("Search query for products"),
      productType: z.string().optional().describe("Type/category of product"),
      manufacturer: z.string().optional().describe("Filter by manufacturer"),
      category: z.string().optional().describe("Filter by category"),
      universityId: z.string().describe("University ID for contract pricing"),
    }),
  }
);

const vendorApiSearchTool = tool(
  async (input: {
    vendor: string;
    query: string;
    specifications?: Record<string, any>;
  }) => {
    // This would connect to vendor APIs (Fisher, VWR, CDW-G, etc.)
    const vendorResults: Record<string, Product[]> = {
      amazon_business: [
        {
          id: "amz_001",
          name: "50ml Centrifuge Tubes with Flat Top Caps",
          description: "Conical bottom, sterile, 500/case",
          manufacturer: "Generic",
          manufacturerPartNumber: "CT50-500",
          vendorId: "vendor_amazon",
          vendorName: "Amazon Business",
          vendorSku: "B07X9K2LM1",
          price: 165.00,
          listPrice: 165.00,
          pricePerUnit: 0.33,
          unitOfMeasure: "case",
          packSize: 500,
          availability: "in_stock",
          leadTimeDays: 1,
          category: ["Lab Supplies", "Tubes"],
          specifications: {
            volume: "50ml",
            sterile: true,
          },
          source: "external",
          isContracted: false,
        },
      ],
      grainger: [
        {
          id: "grg_001",
          name: "Centrifuge Tubes, 50mL, Sterile, PK500",
          description: "Polypropylene, conical bottom with screw caps",
          manufacturer: "Corning",
          manufacturerPartNumber: "430829",
          vendorId: "vendor_grainger",
          vendorName: "Grainger",
          vendorSku: "21HT82",
          price: 198.00,
          listPrice: 225.00,
          pricePerUnit: 0.396,
          unitOfMeasure: "pack",
          packSize: 500,
          availability: "in_stock",
          leadTimeDays: 3,
          category: ["Lab Supplies", "Plasticware"],
          specifications: {
            volume: "50ml",
            material: "Polypropylene",
            sterile: true,
          },
          source: "external",
          isContracted: false,
        },
      ],
      fisher_scientific: [],
      vwr: [],
      cdw_g: [],
      shi: [],
    };

    const results = vendorResults[input.vendor] || [];

    return JSON.stringify({
      success: true,
      vendor: input.vendor,
      results,
      totalCount: results.length,
    });
  },
  {
    name: "vendor_api_search",
    description: "Query vendor APIs for product information and pricing",
    schema: z.object({
      vendor: z.enum([
        "amazon_business",
        "grainger",
        "fisher_scientific",
        "vwr",
        "cdw_g",
        "shi",
      ]).describe("Vendor to search"),
      query: z.string().describe("Search query"),
      specifications: z.record(z.any()).optional().describe("Required specifications"),
    }),
  }
);

const webSearchTool = tool(
  async (input: { query: string; maxResults?: number }) => {
    // This would use a web search API for broader product discovery
    return JSON.stringify({
      success: true,
      results: [],
      message: "Web search would return additional product sources",
    });
  },
  {
    name: "web_search",
    description: "Search the web for product information and pricing",
    schema: z.object({
      query: z.string().describe("Search query"),
      maxResults: z.number().optional().describe("Maximum results to return"),
    }),
  }
);

const productMatcherTool = tool(
  async (input: {
    products: Product[];
    specifications: Record<string, any>;
    prioritize?: "price" | "delivery" | "contract" | "diversity";
  }) => {
    // Match and score products based on specifications
    const matchedProducts: MatchedProduct[] = input.products.map((product, index) => {
      // Calculate specification match score
      let specMatch = 0;
      let matchReasons: string[] = [];

      for (const [key, value] of Object.entries(input.specifications)) {
        if (product.specifications[key] === value) {
          specMatch += 20;
          matchReasons.push(`${key} matches`);
        }
      }

      // Normalize to 0-100
      specMatch = Math.min(100, specMatch);

      // Calculate total cost
      const totalCost = product.price;

      // Calculate savings
      const savingsVsListPrice = product.listPrice - product.price;

      return {
        product,
        matchScore: specMatch * 0.4 + (product.isContracted ? 30 : 0) + (100 - index * 10) * 0.3,
        matchReasons,
        specificationMatch: specMatch,
        priceRank: index + 1,
        totalCost,
        savingsVsListPrice,
        isDiverse: false, // Would check vendor diversity status
        isSustainable: false, // Would check sustainability rating
      };
    });

    // Sort by match score
    matchedProducts.sort((a, b) => b.matchScore - a.matchScore);

    return JSON.stringify({
      success: true,
      matchedProducts,
      totalMatched: matchedProducts.length,
    });
  },
  {
    name: "product_matcher",
    description: "Match and score products based on specifications and preferences",
    schema: z.object({
      products: z.array(z.any()).describe("Products to match"),
      specifications: z.record(z.any()).describe("Required specifications"),
      prioritize: z.enum(["price", "delivery", "contract", "diversity"]).optional()
        .describe("Factor to prioritize in matching"),
    }),
  }
);

const specExtractorTool = tool(
  async (input: { productUrl: string }) => {
    // Extract specifications from product pages
    return JSON.stringify({
      success: true,
      specifications: {},
      message: "Would extract specs from product page",
    });
  },
  {
    name: "spec_extractor",
    description: "Extract specifications from product pages",
    schema: z.object({
      productUrl: z.string().describe("URL of the product page"),
    }),
  }
);

const priceNormalizerTool = tool(
  async (input: {
    products: Product[];
    targetUnit: string;
  }) => {
    // Normalize pricing across different units and pack sizes
    const normalizedProducts = input.products.map(product => ({
      ...product,
      normalizedPrice: product.pricePerUnit,
      normalizedUnit: input.targetUnit,
    }));

    return JSON.stringify({
      success: true,
      products: normalizedProducts,
    });
  },
  {
    name: "price_normalizer",
    description: "Normalize pricing across different units and pack sizes",
    schema: z.object({
      products: z.array(z.any()).describe("Products to normalize"),
      targetUnit: z.string().describe("Target unit for normalization"),
    }),
  }
);

// System prompt for the Catalog Intelligence Agent
const SYSTEM_PROMPT = `You are the Catalog Intelligence Agent, a specialized AI for product discovery and matching in university procurement.

Your responsibilities:
1. Parse and understand product requests, extracting key specifications
2. Search internal contracted catalogs first (these have pre-negotiated pricing)
3. Search external vendor sources for additional options
4. Match products based on specifications, price, and availability
5. Recommend the best option with clear justification

Decision Framework:
1. ALWAYS prefer contracted vendors when specifications match
2. Consider total cost of ownership (price + shipping + handling)
3. Factor in delivery time for urgent requests
4. Note diversity supplier options when available
5. Flag compliance concerns (grant restrictions, budget limits)

When providing recommendations:
- Compare at least 3 options when available
- Calculate price per unit for fair comparison
- Note contract vs. market pricing differences
- Highlight potential savings
- Include lead time considerations for urgency

Format your final recommendation with:
- Primary recommendation with justification
- Alternative options ranked by suitability
- Cost comparison table
- Any compliance notes or warnings`;

// Create the LangGraph agent
export function createCatalogIntelligenceAgent() {
  const model = new ChatAnthropic({
    modelName: "claude-sonnet-4-20250514",
    temperature: 0.3,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  });

  const tools = [
    catalogSearchTool,
    vendorApiSearchTool,
    webSearchTool,
    productMatcherTool,
    specExtractorTool,
    priceNormalizerTool,
  ];

  const modelWithTools = model.bindTools(tools);

  // Node: Parse the request
  const parseRequest = async (state: typeof CatalogState.State) => {
    const parsePrompt = `Parse this procurement request and extract:
- Product type/category
- Required specifications
- Quantity needed
- Budget constraints (if any)
- Urgency level

Request: ${state.query}

Respond with a JSON object containing:
{
  "productType": "...",
  "specifications": {...},
  "quantity": number,
  "budgetLimit": number or null,
  "urgencyLevel": "standard" | "rush" | "emergency"
}`;

    const response = await model.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(parsePrompt),
    ]);

    // Extract JSON from response
    let parsed = {
      productType: "",
      specifications: {},
      quantity: 1,
      budgetLimit: undefined as number | undefined,
      urgencyLevel: "standard",
    };

    try {
      const content = response.content as string;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Use defaults if parsing fails
    }

    return {
      productType: parsed.productType,
      specifications: parsed.specifications,
      quantity: parsed.quantity || 1,
      budgetLimit: parsed.budgetLimit,
      urgencyLevel: parsed.urgencyLevel || "standard",
      messages: [response],
      searchHistory: [{
        source: "parse",
        query: state.query,
        resultsCount: 0,
        timestamp: Date.now(),
      }],
    };
  };

  // Node: Search internal catalog
  const searchInternal = async (state: typeof CatalogState.State) => {
    const result = await catalogSearchTool.invoke({
      query: state.query,
      productType: state.productType,
      universityId: state.universityId,
    });

    const parsed = JSON.parse(result);

    return {
      internalResults: parsed.results || [],
      searchHistory: [{
        source: "internal_catalog",
        query: state.query,
        resultsCount: parsed.totalCount || 0,
        timestamp: Date.now(),
      }],
    };
  };

  // Node: Search external sources
  const searchExternal = async (state: typeof CatalogState.State) => {
    const vendors = [
      "amazon_business",
      "grainger",
      "fisher_scientific",
      "vwr",
      "cdw_g",
    ];

    const allResults: Product[] = [];
    const searchSteps: SearchStep[] = [];

    for (const vendor of vendors) {
      try {
        const result = await vendorApiSearchTool.invoke({
          vendor: vendor as any,
          query: state.query,
          specifications: state.specifications,
        });

        const parsed = JSON.parse(result);
        if (parsed.results) {
          allResults.push(...parsed.results);
        }

        searchSteps.push({
          source: vendor,
          query: state.query,
          resultsCount: parsed.totalCount || 0,
          timestamp: Date.now(),
        });
      } catch (error) {
        // Continue with other vendors if one fails
      }
    }

    return {
      externalResults: allResults,
      searchHistory: searchSteps,
    };
  };

  // Node: Match products
  const matchProducts = async (state: typeof CatalogState.State) => {
    const allProducts = [...state.internalResults, ...state.externalResults];

    if (allProducts.length === 0) {
      return {
        matchedProducts: [],
        searchHistory: [{
          source: "matcher",
          query: "no products to match",
          resultsCount: 0,
          timestamp: Date.now(),
        }],
      };
    }

    const result = await productMatcherTool.invoke({
      products: allProducts,
      specifications: state.specifications,
      prioritize: state.urgencyLevel === "emergency" ? "delivery" : "contract",
    });

    const parsed = JSON.parse(result);

    return {
      matchedProducts: parsed.matchedProducts || [],
      searchHistory: [{
        source: "matcher",
        query: `matched ${allProducts.length} products`,
        resultsCount: parsed.totalMatched || 0,
        timestamp: Date.now(),
      }],
    };
  };

  // Node: Generate recommendation
  const generateRecommendation = async (state: typeof CatalogState.State) => {
    if (state.matchedProducts.length === 0) {
      return {
        recommendation: {
          primaryProduct: null,
          alternativeProducts: [],
          justification: "No matching products found. Please refine your search criteria.",
          estimatedSavings: 0,
          complianceNotes: [],
          warnings: ["No products matched the specified criteria"],
        } as any,
        messages: [new AIMessage("No matching products found.")],
      };
    }

    const recommendPrompt = `Based on these matched products, recommend the best option.

Query: ${state.query}
Quantity needed: ${state.quantity}
Budget limit: ${state.budgetLimit || "Not specified"}
Urgency: ${state.urgencyLevel}

Matched Products:
${JSON.stringify(state.matchedProducts.slice(0, 5), null, 2)}

Consider:
1. Contract pricing (prefer contracted vendors)
2. Specification match
3. Total cost of ownership
4. Delivery time
5. Vendor reliability

Provide your recommendation with clear justification.`;

    const response = await model.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(recommendPrompt),
    ]);

    const primaryProduct = state.matchedProducts[0];
    const alternativeProducts = state.matchedProducts.slice(1, 4);

    // Calculate estimated savings vs list price
    const estimatedSavings = primaryProduct
      ? primaryProduct.savingsVsListPrice * state.quantity
      : 0;

    const recommendation: Recommendation = {
      primaryProduct,
      alternativeProducts,
      justification: response.content as string,
      estimatedSavings,
      complianceNotes: primaryProduct?.product.isContracted
        ? ["Product is from contracted vendor - compliant with procurement policy"]
        : ["Product is from non-contracted vendor - may require additional approval"],
      warnings: state.budgetLimit && primaryProduct?.totalCost > state.budgetLimit
        ? [`Total cost ($${primaryProduct.totalCost}) exceeds budget limit ($${state.budgetLimit})`]
        : [],
    };

    return {
      recommendation,
      messages: [response],
    };
  };

  // Build the graph
  const graph = new StateGraph(CatalogState)
    .addNode("parse_request", parseRequest)
    .addNode("search_internal", searchInternal)
    .addNode("search_external", searchExternal)
    .addNode("match_products", matchProducts)
    .addNode("recommend", generateRecommendation)
    .addEdge(START, "parse_request")
    .addEdge("parse_request", "search_internal")
    .addEdge("search_internal", "search_external")
    .addEdge("search_external", "match_products")
    .addEdge("match_products", "recommend")
    .addEdge("recommend", END);

  return graph.compile();
}

// Export types for use in other modules
export type { Product, MatchedProduct, Recommendation, SearchStep };

// Export a function to run the agent
export async function runCatalogIntelligenceAgent(input: {
  query: string;
  universityId: string;
  budgetLimit?: number;
  urgencyLevel?: "standard" | "rush" | "emergency";
}): Promise<{
  success: boolean;
  recommendation: Recommendation | undefined;
  matchedProducts: MatchedProduct[];
  searchHistory: SearchStep[];
  error?: string;
}> {
  try {
    const agent = createCatalogIntelligenceAgent();

    const result = await agent.invoke({
      query: input.query,
      universityId: input.universityId,
      budgetLimit: input.budgetLimit,
      urgencyLevel: input.urgencyLevel || "standard",
    });

    return {
      success: true,
      recommendation: result.recommendation,
      matchedProducts: result.matchedProducts,
      searchHistory: result.searchHistory,
    };
  } catch (error) {
    return {
      success: false,
      recommendation: undefined,
      matchedProducts: [],
      searchHistory: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
