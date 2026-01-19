#!/usr/bin/env npx tsx
/**
 * Seed Data Script
 *
 * Populates the Convex database with sample data for development and testing.
 */

import { ConvexHttpClient } from "convex/browser";

// Configuration
const CONVEX_URL = process.env.CONVEX_URL || "https://your-deployment.convex.cloud";

const client = new ConvexHttpClient(CONVEX_URL);

// Sample Universities
const universities = [
  {
    universityId: "columbia",
    name: "Columbia University",
    annualSpend: 450000000,
    region: "Northeast",
    sharingEnabled: true,
  },
  {
    universityId: "stanford",
    name: "Stanford University",
    annualSpend: 520000000,
    region: "West",
    sharingEnabled: true,
  },
  {
    universityId: "mit",
    name: "Massachusetts Institute of Technology",
    annualSpend: 480000000,
    region: "Northeast",
    sharingEnabled: true,
  },
];

// Sample Vendors
const vendors = [
  {
    vendorId: "fisher-scientific",
    name: "Fisher Scientific",
    type: "distributor",
    diversityStatus: [],
    categories: ["lab-supplies", "chemicals", "scientific-instruments"],
    performanceScore: 4.5,
    riskScore: 15,
  },
  {
    vendorId: "vwr",
    name: "VWR International",
    type: "distributor",
    diversityStatus: [],
    categories: ["lab-supplies", "chemicals"],
    performanceScore: 4.3,
    riskScore: 18,
  },
  {
    vendorId: "staples",
    name: "Staples Business Advantage",
    type: "distributor",
    diversityStatus: [],
    categories: ["office-supplies", "furniture"],
    performanceScore: 4.2,
    riskScore: 12,
  },
  {
    vendorId: "cdw",
    name: "CDW Corporation",
    type: "reseller",
    diversityStatus: [],
    categories: ["it-equipment", "software"],
    performanceScore: 4.4,
    riskScore: 10,
  },
  {
    vendorId: "grainger",
    name: "W.W. Grainger",
    type: "distributor",
    diversityStatus: [],
    categories: ["facilities", "mro", "safety"],
    performanceScore: 4.6,
    riskScore: 8,
  },
  {
    vendorId: "diverse-lab-co",
    name: "Diverse Lab Supplies Co.",
    type: "distributor",
    diversityStatus: ["MWBE", "SBE"],
    categories: ["lab-supplies"],
    performanceScore: 4.0,
    riskScore: 25,
  },
];

// Sample Products
const products = [
  {
    canonicalId: "prod-pipette-1000",
    name: "Eppendorf Research Plus Pipette, 100-1000µL",
    description: "Single-channel adjustable volume pipette with 4-digit display",
    category: ["lab-supplies", "liquid-handling"],
    manufacturer: "Eppendorf",
    mpn: "3123000063",
    unspsc: "41104107",
  },
  {
    canonicalId: "prod-fbs-500",
    name: "Fetal Bovine Serum, 500mL",
    description: "Premium FBS, heat-inactivated, US origin",
    category: ["lab-supplies", "cell-culture"],
    manufacturer: "Gibco",
    mpn: "26140079",
    unspsc: "12352100",
  },
  {
    canonicalId: "prod-laptop-dell-5540",
    name: "Dell Latitude 5540 Laptop",
    description: "15.6\" FHD, Intel i7, 16GB RAM, 512GB SSD",
    category: ["it-equipment", "computers"],
    manufacturer: "Dell",
    mpn: "LAT5540-7890",
    unspsc: "43211503",
  },
  {
    canonicalId: "prod-paper-letter",
    name: "Copy Paper, Letter, 20lb, White, 10 Ream Case",
    description: "Multipurpose copy paper, 92 brightness",
    category: ["office-supplies", "paper"],
    manufacturer: "Staples",
    mpn: "135848",
    unspsc: "14111507",
  },
  {
    canonicalId: "prod-nitrile-gloves-m",
    name: "Nitrile Exam Gloves, Medium, 100/box",
    description: "Powder-free, textured fingertips, 4 mil",
    category: ["lab-supplies", "safety", "ppe"],
    manufacturer: "Kimberly-Clark",
    mpn: "55082",
    unspsc: "42132203",
  },
];

// Sample Vendor Listings (prices)
const vendorListings = [
  // Pipette listings
  {
    productCanonicalId: "prod-pipette-1000",
    vendorId: "fisher-scientific",
    vendorSku: "13-690-028",
    vendorProductName: "Eppendorf Research Plus Pipette 100-1000uL",
    price: 389.00,
    currency: "USD",
    unitOfMeasure: "EA",
    packSize: 1,
    availability: "in_stock",
    leadTimeDays: 2,
  },
  {
    productCanonicalId: "prod-pipette-1000",
    vendorId: "vwr",
    vendorSku: "89125-294",
    vendorProductName: "Eppendorf Research Plus Variable Volume Pipette",
    price: 395.50,
    currency: "USD",
    unitOfMeasure: "EA",
    packSize: 1,
    availability: "in_stock",
    leadTimeDays: 3,
  },
  // FBS listings
  {
    productCanonicalId: "prod-fbs-500",
    vendorId: "fisher-scientific",
    vendorSku: "26140079",
    vendorProductName: "Gibco FBS, Heat Inactivated, 500mL",
    price: 285.00,
    currency: "USD",
    unitOfMeasure: "EA",
    packSize: 1,
    availability: "in_stock",
    leadTimeDays: 1,
  },
  {
    productCanonicalId: "prod-fbs-500",
    vendorId: "vwr",
    vendorSku: "97068-085",
    vendorProductName: "Gibco Fetal Bovine Serum 500mL",
    price: 292.00,
    currency: "USD",
    unitOfMeasure: "EA",
    packSize: 1,
    availability: "limited",
    leadTimeDays: 5,
  },
  // Laptop listings
  {
    productCanonicalId: "prod-laptop-dell-5540",
    vendorId: "cdw",
    vendorSku: "7234567",
    vendorProductName: "Dell Latitude 5540 i7/16GB/512GB",
    price: 1299.00,
    currency: "USD",
    unitOfMeasure: "EA",
    packSize: 1,
    availability: "in_stock",
    leadTimeDays: 3,
  },
  // Paper listings
  {
    productCanonicalId: "prod-paper-letter",
    vendorId: "staples",
    vendorSku: "135848",
    vendorProductName: "Staples Copy Paper Letter 10-Ream Case",
    price: 54.99,
    currency: "USD",
    unitOfMeasure: "CS",
    packSize: 10,
    availability: "in_stock",
    leadTimeDays: 1,
  },
  // Gloves listings
  {
    productCanonicalId: "prod-nitrile-gloves-m",
    vendorId: "fisher-scientific",
    vendorSku: "19-130-2119",
    vendorProductName: "Kimberly-Clark Nitrile Gloves Medium 100/bx",
    price: 18.50,
    currency: "USD",
    unitOfMeasure: "BX",
    packSize: 100,
    availability: "in_stock",
    leadTimeDays: 2,
  },
  {
    productCanonicalId: "prod-nitrile-gloves-m",
    vendorId: "grainger",
    vendorSku: "2VLY6",
    vendorProductName: "Nitrile Exam Gloves, M, 100/Box",
    price: 16.95,
    currency: "USD",
    unitOfMeasure: "BX",
    packSize: 100,
    availability: "in_stock",
    leadTimeDays: 1,
  },
];

// Sample Users
const users = [
  {
    userId: "user-001",
    email: "jsmith@columbia.edu",
    name: "John Smith",
    department: "Chemistry",
    role: "requester",
    approvalLimit: 0,
  },
  {
    userId: "user-002",
    email: "mwilson@columbia.edu",
    name: "Mary Wilson",
    department: "Chemistry",
    role: "manager",
    approvalLimit: 5000,
  },
  {
    userId: "user-003",
    email: "rjohnson@columbia.edu",
    name: "Robert Johnson",
    department: "Procurement",
    role: "buyer",
    approvalLimit: 25000,
  },
  {
    userId: "user-004",
    email: "procurement@columbia.edu",
    name: "Procurement Admin",
    department: "Procurement",
    role: "admin",
    approvalLimit: 100000,
  },
];

async function seedData() {
  console.log("🌱 Seeding Talos database with sample data...\n");

  try {
    // Note: In a real implementation, you would call Convex mutations
    // This is a placeholder showing the data structure
    console.log("📚 Universities to seed:", universities.length);
    console.log("🏢 Vendors to seed:", vendors.length);
    console.log("📦 Products to seed:", products.length);
    console.log("💰 Price listings to seed:", vendorListings.length);
    console.log("👤 Users to seed:", users.length);

    console.log("\n⚠️  To actually seed data, implement Convex mutations");
    console.log("   and call them from this script.\n");

    // Example of how you would call a mutation:
    // await client.mutation("universities:create", universities[0]);

    console.log("✅ Seed data prepared successfully!");
    console.log("\nSample data includes:");
    console.log("  - 3 major research universities");
    console.log("  - 6 vendors (including 1 diverse supplier)");
    console.log("  - 5 common procurement products");
    console.log("  - Multiple price listings per product");
    console.log("  - 4 users with different roles");

  } catch (error) {
    console.error("❌ Error seeding data:", error);
    process.exit(1);
  }
}

// Run the seed
seedData();
