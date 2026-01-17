import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a product
export const create = mutation({
  args: {
    canonicalId: v.string(),
    name: v.string(),
    description: v.string(),
    categoryPath: v.array(v.string()),
    manufacturer: v.string(),
    manufacturerPartNumber: v.string(),
    unspscCode: v.optional(v.string()),
    specifications: v.any(),
    compliance: v.optional(
      v.object({
        diversityCertified: v.boolean(),
        sustainabilityRating: v.optional(v.string()),
        grantEligible: v.boolean(),
        hazardClass: v.optional(v.string()),
        exportControlled: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const normalizedName = args.name.toLowerCase().trim();

    const productId = await ctx.db.insert("products", {
      canonicalId: args.canonicalId,
      name: args.name,
      normalizedName,
      description: args.description,
      categoryPath: args.categoryPath,
      unspscCode: args.unspscCode,
      manufacturer: args.manufacturer,
      manufacturerPartNumber: args.manufacturerPartNumber,
      specifications: args.specifications || {},
      equivalentProducts: [],
      substituteProducts: [],
      compliance: args.compliance || {
        diversityCertified: false,
        sustainabilityRating: undefined,
        grantEligible: true,
        hazardClass: undefined,
        exportControlled: false,
      },
      metadata: {
        lastUpdated: now,
        dataSource: "manual",
        matchConfidence: 1.0,
      },
      createdAt: now,
      updatedAt: now,
    });

    return productId;
  },
});

// Get product by ID
export const get = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get product by canonical ID
export const getByCanonicalId = query({
  args: { canonicalId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("products")
      .withIndex("by_canonical_id", (q) => q.eq("canonicalId", args.canonicalId))
      .first();
  },
});

// Search products
export const search = query({
  args: {
    query: v.string(),
    manufacturer: v.optional(v.string()),
    category: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;

    // Use search index
    let results = await ctx.db
      .query("products")
      .withSearchIndex("search_products", (q) => {
        let search = q.search("name", args.query);
        if (args.manufacturer) {
          search = search.eq("manufacturer", args.manufacturer);
        }
        return search;
      })
      .take(limit);

    return results;
  },
});

// List products by category
export const listByCategory = query({
  args: {
    categoryPath: v.array(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    return await ctx.db
      .query("products")
      .withIndex("by_category", (q) => q.eq("categoryPath", args.categoryPath))
      .take(limit);
  },
});

// Get products by manufacturer
export const listByManufacturer = query({
  args: {
    manufacturer: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    return await ctx.db
      .query("products")
      .withIndex("by_manufacturer", (q) => q.eq("manufacturer", args.manufacturer))
      .take(limit);
  },
});

// Add equivalent products
export const addEquivalent = mutation({
  args: {
    productId: v.id("products"),
    equivalentCanonicalId: v.string(),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found");

    const equivalents = [...product.equivalentProducts];
    if (!equivalents.includes(args.equivalentCanonicalId)) {
      equivalents.push(args.equivalentCanonicalId);
    }

    await ctx.db.patch(args.productId, {
      equivalentProducts: equivalents,
      updatedAt: Date.now(),
    });

    return args.productId;
  },
});

// Get product with all vendor listings
export const getWithListings = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) return null;

    const listings = await ctx.db
      .query("vendorListings")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();

    // Get vendor details for each listing
    const listingsWithVendors = await Promise.all(
      listings.map(async (listing) => {
        const vendor = await ctx.db.get(listing.vendorId);
        return { ...listing, vendor };
      })
    );

    // Sort by price per unit
    listingsWithVendors.sort((a, b) => a.pricePerUnit - b.pricePerUnit);

    return { ...product, listings: listingsWithVendors };
  },
});

// Get equivalent products with listings (for comparison)
export const getEquivalentsWithListings = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) return null;

    const equivalentIds = [product.canonicalId, ...product.equivalentProducts];

    const equivalentProducts = await Promise.all(
      equivalentIds.map(async (canonicalId) => {
        const prod = await ctx.db
          .query("products")
          .withIndex("by_canonical_id", (q) => q.eq("canonicalId", canonicalId))
          .first();

        if (!prod) return null;

        const listings = await ctx.db
          .query("vendorListings")
          .withIndex("by_product", (q) => q.eq("productId", prod._id))
          .collect();

        const listingsWithVendors = await Promise.all(
          listings.map(async (listing) => {
            const vendor = await ctx.db.get(listing.vendorId);
            return { ...listing, vendor };
          })
        );

        return { ...prod, listings: listingsWithVendors };
      })
    );

    return equivalentProducts.filter(Boolean);
  },
});

// Bulk create products (for catalog import)
export const bulkCreate = mutation({
  args: {
    products: v.array(
      v.object({
        canonicalId: v.string(),
        name: v.string(),
        description: v.string(),
        categoryPath: v.array(v.string()),
        manufacturer: v.string(),
        manufacturerPartNumber: v.string(),
        specifications: v.any(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids = [];

    for (const product of args.products) {
      const id = await ctx.db.insert("products", {
        canonicalId: product.canonicalId,
        name: product.name,
        normalizedName: product.name.toLowerCase().trim(),
        description: product.description,
        categoryPath: product.categoryPath,
        manufacturer: product.manufacturer,
        manufacturerPartNumber: product.manufacturerPartNumber,
        specifications: product.specifications,
        equivalentProducts: [],
        substituteProducts: [],
        compliance: {
          diversityCertified: false,
          sustainabilityRating: undefined,
          grantEligible: true,
          hazardClass: undefined,
          exportControlled: false,
        },
        metadata: {
          lastUpdated: now,
          dataSource: "bulk_import",
          matchConfidence: 0.9,
        },
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }

    return ids;
  },
});

// Update product compliance info
export const updateCompliance = mutation({
  args: {
    productId: v.id("products"),
    compliance: v.object({
      diversityCertified: v.boolean(),
      sustainabilityRating: v.optional(v.string()),
      grantEligible: v.boolean(),
      hazardClass: v.optional(v.string()),
      exportControlled: v.boolean(),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.productId, {
      compliance: args.compliance,
      updatedAt: Date.now(),
    });
    return args.productId;
  },
});
