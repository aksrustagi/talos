/**
 * Columbia University Spending Seed Data
 *
 * This file contains seed data for Columbia University's $1.2B annual procurement budget.
 * Use these functions to populate the database with realistic spending data for testing
 * and demonstration purposes.
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";

// Columbia University spending categories
export const COLUMBIA_SPENDING_CATEGORIES = [
  {
    code: "RESEARCH_LAB",
    name: "Research & Lab Supplies",
    description: "Scientific equipment, reagents, consumables, lab apparatus",
    annualBudget: 280_000_000,
    percentOfTotalTarget: 23.3,
    glCodePrefix: "61",
    unspscCodes: ["41100000", "41110000", "41120000"],
    diversityTargetPercent: 10,
    sustainabilityTargetPercent: 15,
  },
  {
    code: "IT_TECH",
    name: "IT & Technology",
    description: "Hardware, software licenses, cloud services, networking",
    annualBudget: 180_000_000,
    percentOfTotalTarget: 15.0,
    glCodePrefix: "62",
    unspscCodes: ["43200000", "43210000", "43230000"],
    diversityTargetPercent: 12,
    sustainabilityTargetPercent: 20,
  },
  {
    code: "FACILITIES",
    name: "Facilities & Maintenance",
    description: "Building maintenance, repairs, HVAC, custodial services",
    annualBudget: 150_000_000,
    percentOfTotalTarget: 12.5,
    glCodePrefix: "63",
    unspscCodes: ["72100000", "72150000", "47130000"],
    diversityTargetPercent: 20,
    sustainabilityTargetPercent: 25,
  },
  {
    code: "MEDICAL",
    name: "Medical/Clinical Supplies",
    description: "Medical devices, pharmaceuticals, clinical supplies",
    annualBudget: 140_000_000,
    percentOfTotalTarget: 11.7,
    glCodePrefix: "64",
    unspscCodes: ["42000000", "42130000", "42140000"],
    diversityTargetPercent: 8,
    sustainabilityTargetPercent: 10,
  },
  {
    code: "CONSTRUCTION",
    name: "Construction & Capital Projects",
    description: "New construction, major renovations, capital improvements",
    annualBudget: 120_000_000,
    percentOfTotalTarget: 10.0,
    glCodePrefix: "65",
    unspscCodes: ["72000000", "30100000", "30150000"],
    diversityTargetPercent: 25,
    sustainabilityTargetPercent: 30,
  },
  {
    code: "PROF_SERVICES",
    name: "Professional Services",
    description: "Consulting, legal, accounting, temporary staffing",
    annualBudget: 100_000_000,
    percentOfTotalTarget: 8.3,
    glCodePrefix: "66",
    unspscCodes: ["80100000", "80110000", "80120000"],
    diversityTargetPercent: 15,
    sustainabilityTargetPercent: 5,
  },
  {
    code: "OFFICE_ADMIN",
    name: "Office & Administrative",
    description: "Office supplies, furniture, printing, mail services",
    annualBudget: 60_000_000,
    percentOfTotalTarget: 5.0,
    glCodePrefix: "67",
    unspscCodes: ["44100000", "56100000", "82100000"],
    diversityTargetPercent: 20,
    sustainabilityTargetPercent: 35,
  },
  {
    code: "FOOD",
    name: "Food Services",
    description: "Dining services, catering, food supplies",
    annualBudget: 50_000_000,
    percentOfTotalTarget: 4.2,
    glCodePrefix: "68",
    unspscCodes: ["50000000", "90100000"],
    diversityTargetPercent: 18,
    sustainabilityTargetPercent: 40,
  },
  {
    code: "UTILITIES",
    name: "Utilities & Energy",
    description: "Electricity, gas, water, renewable energy",
    annualBudget: 45_000_000,
    percentOfTotalTarget: 3.75,
    glCodePrefix: "69",
    unspscCodes: ["15100000", "83100000"],
    diversityTargetPercent: 5,
    sustainabilityTargetPercent: 50,
  },
  {
    code: "TRANSPORT",
    name: "Transportation & Fleet",
    description: "Vehicle fleet, shuttles, logistics, freight",
    annualBudget: 35_000_000,
    percentOfTotalTarget: 2.9,
    glCodePrefix: "70",
    unspscCodes: ["25100000", "78100000"],
    diversityTargetPercent: 12,
    sustainabilityTargetPercent: 25,
  },
  {
    code: "MARKETING",
    name: "Marketing & Events",
    description: "Marketing materials, events, conferences, recruitment",
    annualBudget: 25_000_000,
    percentOfTotalTarget: 2.1,
    glCodePrefix: "71",
    unspscCodes: ["82100000", "80140000"],
    diversityTargetPercent: 20,
    sustainabilityTargetPercent: 15,
  },
  {
    code: "OTHER",
    name: "Other/Miscellaneous",
    description: "Miscellaneous purchases not in other categories",
    annualBudget: 15_000_000,
    percentOfTotalTarget: 1.25,
    glCodePrefix: "99",
    unspscCodes: ["99000000"],
    diversityTargetPercent: 15,
    sustainabilityTargetPercent: 10,
  },
];

// Columbia University cost centers (departments)
export const COLUMBIA_COST_CENTERS = [
  { code: "CC-CPMS-001", name: "College of Physicians & Surgeons", department: "CPMS", allocatedBudget: 180_000_000 },
  { code: "CC-SEAS-001", name: "Fu Foundation School of Engineering", department: "SEAS", allocatedBudget: 145_000_000 },
  { code: "CC-A&S-001", name: "Arts & Sciences", department: "A&S", allocatedBudget: 125_000_000 },
  { code: "CC-CBS-001", name: "Columbia Business School", department: "CBS", allocatedBudget: 95_000_000 },
  { code: "CC-MSPH-001", name: "Mailman School of Public Health", department: "MSPH", allocatedBudget: 85_000_000 },
  { code: "CC-LAW-001", name: "Law School", department: "LAW", allocatedBudget: 65_000_000 },
  { code: "CC-TC-001", name: "Teachers College", department: "TC", allocatedBudget: 55_000_000 },
  { code: "CC-GSAPP-001", name: "Graduate School of Architecture", department: "GSAPP", allocatedBudget: 45_000_000 },
  { code: "CC-SSW-001", name: "School of Social Work", department: "SSW", allocatedBudget: 35_000_000 },
  { code: "CC-JOUR-001", name: "Journalism School", department: "JOUR", allocatedBudget: 28_000_000 },
  { code: "CC-FACIL-001", name: "Facilities Management", department: "FACIL", allocatedBudget: 150_000_000 },
  { code: "CC-CUIT-001", name: "Columbia University IT", department: "CUIT", allocatedBudget: 98_000_000 },
  { code: "CC-FIN-001", name: "Finance & Administration", department: "FIN", allocatedBudget: 45_000_000 },
  { code: "CC-LIB-001", name: "University Libraries", department: "LIB", allocatedBudget: 35_000_000 },
  { code: "CC-ATH-001", name: "Athletics", department: "ATH", allocatedBudget: 25_000_000 },
];

// Top vendors for Columbia
export const COLUMBIA_TOP_VENDORS = [
  // Major distributors
  { name: "Fisher Scientific", code: "FISHER", type: "distributor", categories: ["Lab Supplies"], diversityStatus: [], annualSpend: 85_000_000 },
  { name: "VWR International", code: "VWR", type: "distributor", categories: ["Lab Supplies"], diversityStatus: [], annualSpend: 65_000_000 },
  { name: "Dell Technologies", code: "DELL", type: "manufacturer", categories: ["IT Equipment"], diversityStatus: [], annualSpend: 55_000_000 },
  { name: "Grainger", code: "GRAINGER", type: "distributor", categories: ["Facilities"], diversityStatus: [], annualSpend: 42_000_000 },
  { name: "CDW Government", code: "CDW", type: "reseller", categories: ["IT Equipment"], diversityStatus: [], annualSpend: 38_000_000 },
  { name: "Staples Business", code: "STAPLES", type: "distributor", categories: ["Office Supplies"], diversityStatus: [], annualSpend: 22_000_000 },
  { name: "McKesson", code: "MCKESSON", type: "distributor", categories: ["Medical Supplies"], diversityStatus: [], annualSpend: 48_000_000 },
  { name: "Johnson Controls", code: "JCI", type: "manufacturer", categories: ["Facilities"], diversityStatus: [], annualSpend: 35_000_000 },
  { name: "Aramark", code: "ARAMARK", type: "distributor", categories: ["Food Services"], diversityStatus: [], annualSpend: 28_000_000 },
  { name: "Turner Construction", code: "TURNER", type: "manufacturer", categories: ["Construction"], diversityStatus: [], annualSpend: 45_000_000 },

  // Diverse vendors
  { name: "Minority Business Solutions", code: "MBS", type: "distributor", categories: ["Office Supplies", "IT Equipment"], diversityStatus: ["MBE", "MWBE"], annualSpend: 8_500_000 },
  { name: "Women's Tech Supply", code: "WTS", type: "reseller", categories: ["IT Equipment"], diversityStatus: ["WBE"], annualSpend: 6_800_000 },
  { name: "Veteran Services Inc", code: "VSI", type: "distributor", categories: ["Facilities"], diversityStatus: ["SDVOSB"], annualSpend: 5_700_000 },
  { name: "EcoGreen Supplies", code: "ECOGREEN", type: "distributor", categories: ["Office Supplies"], diversityStatus: ["SBE"], annualSpend: 4_600_000 },
  { name: "Harlem Business Alliance", code: "HBA", type: "distributor", categories: ["Food Services"], diversityStatus: ["MBE", "SBE"], annualSpend: 3_500_000 },
  { name: "Pride Office Products", code: "PRIDE", type: "reseller", categories: ["Office Supplies"], diversityStatus: ["LGBT", "SBE"], annualSpend: 2_300_000 },
  { name: "NYC Women Contractors", code: "NYCWC", type: "manufacturer", categories: ["Construction"], diversityStatus: ["WBE"], annualSpend: 8_900_000 },
  { name: "Bronx Lab Equipment", code: "BLE", type: "distributor", categories: ["Lab Supplies"], diversityStatus: ["MBE", "SBE"], annualSpend: 4_200_000 },
];

// Diversity spend targets for Columbia
export const COLUMBIA_DIVERSITY_TARGETS = [
  { diversityType: "MWBE", targetPercent: 15, targetAmount: 180_000_000 },
  { diversityType: "WBE", targetPercent: 8, targetAmount: 96_000_000 },
  { diversityType: "MBE", targetPercent: 10, targetAmount: 120_000_000 },
  { diversityType: "SBE", targetPercent: 20, targetAmount: 240_000_000 },
  { diversityType: "SDVOSB", targetPercent: 3, targetAmount: 36_000_000 },
  { diversityType: "HUBZone", targetPercent: 3, targetAmount: 36_000_000 },
  { diversityType: "LGBT", targetPercent: 2, targetAmount: 24_000_000 },
  { diversityType: "total_diverse", targetPercent: 15, targetAmount: 180_000_000 },
];

// Sustainability spend targets for Columbia
export const COLUMBIA_SUSTAINABILITY_TARGETS = [
  { category: "renewable_energy", targetPercent: 25, targetAmount: 11_250_000 },
  { category: "recycled_materials", targetPercent: 30, targetAmount: 18_000_000 },
  { category: "carbon_neutral", targetPercent: 15, targetAmount: 180_000_000 },
  { category: "eco_certified", targetPercent: 35, targetAmount: 21_000_000 },
  { category: "local_sourcing", targetPercent: 20, targetAmount: 240_000_000 },
  { category: "total_sustainable", targetPercent: 20, targetAmount: 240_000_000 },
];

// Seed Columbia University
export const seedColumbiaUniversity = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Create Columbia University
    const universityId = await ctx.db.insert("universities", {
      name: "Columbia University",
      type: "R1",
      region: "Northeast",
      annualSpend: 1_200_000_000,
      settings: {
        diversityTarget: 15,
        sustainabilityTarget: 20,
        autoApprovalLimit: 2500,
        timezone: "America/New_York",
      },
      subscription: {
        plan: "performance",
        monthlyFee: 0,
        savingsSharePercent: 36,
        startDate: now,
        cap: 1_500_000,
      },
      integrations: {
        procurementSystem: "Jaggaer",
        erpSystem: "Workday",
        slackWorkspace: "columbia-procurement",
      },
      createdAt: now,
      updatedAt: now,
    });

    return {
      universityId,
      message: "Columbia University created successfully",
    };
  },
});

// Seed spending categories for a university
export const seedSpendingCategories = mutation({
  args: {
    universityId: v.id("universities"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const categoryIds = [];

    for (const cat of COLUMBIA_SPENDING_CATEGORIES) {
      const catId = await ctx.db.insert("spendingCategories", {
        universityId: args.universityId,
        code: cat.code,
        name: cat.name,
        description: cat.description,
        annualBudget: cat.annualBudget,
        percentOfTotalTarget: cat.percentOfTotalTarget,
        glCodePrefix: cat.glCodePrefix,
        unspscCodes: cat.unspscCodes,
        diversityTargetPercent: cat.diversityTargetPercent,
        sustainabilityTargetPercent: cat.sustainabilityTargetPercent,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      categoryIds.push(catId);
    }

    return {
      categoryIds,
      count: categoryIds.length,
      message: `Created ${categoryIds.length} spending categories`,
    };
  },
});

// Seed cost centers for a university
export const seedCostCenters = mutation({
  args: {
    universityId: v.id("universities"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const fiscalYear = new Date().getFullYear();
    const costCenterIds = [];

    for (const cc of COLUMBIA_COST_CENTERS) {
      // Calculate realistic spent amounts (60-85% of allocated)
      const spentPercent = 0.6 + Math.random() * 0.25;
      const committedPercent = 0.05 + Math.random() * 0.1;
      const spentAmount = Math.round(cc.allocatedBudget * spentPercent);
      const committedAmount = Math.round(cc.allocatedBudget * committedPercent);
      const availableAmount = cc.allocatedBudget - spentAmount - committedAmount;

      const ccId = await ctx.db.insert("costCenters", {
        universityId: args.universityId,
        code: cc.code,
        name: cc.name,
        department: cc.department,
        fiscalYear,
        allocatedBudget: cc.allocatedBudget,
        spentAmount,
        committedAmount,
        availableAmount,
        utilizationPercent: ((spentAmount + committedAmount) / cc.allocatedBudget) * 100,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      costCenterIds.push(ccId);
    }

    return {
      costCenterIds,
      count: costCenterIds.length,
      message: `Created ${costCenterIds.length} cost centers`,
    };
  },
});

// Seed vendors
export const seedVendors = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const vendorIds = [];

    for (const vendor of COLUMBIA_TOP_VENDORS) {
      const vendorId = await ctx.db.insert("vendors", {
        name: vendor.name,
        code: vendor.code,
        type: vendor.type as "distributor" | "manufacturer" | "reseller",
        categories: vendor.categories,
        diversityStatus: vendor.diversityStatus as any[],
        certifications: [],
        sustainability: {
          rating: vendor.diversityStatus.length > 0 ? "Good" : undefined,
          certifications: vendor.diversityStatus.includes("SBE") ? ["Green Business"] : [],
        },
        contact: {
          email: `sales@${vendor.code.toLowerCase()}.com`,
          phone: "1-800-555-0100",
          accountRep: "Account Manager",
        },
        integration: {
          type: "api",
          syncStatus: "active",
          lastSyncAt: now,
        },
        performance: {
          overallScore: 75 + Math.round(Math.random() * 20),
          priceScore: 70 + Math.round(Math.random() * 25),
          qualityScore: 75 + Math.round(Math.random() * 20),
          deliveryScore: 80 + Math.round(Math.random() * 15),
          serviceScore: 75 + Math.round(Math.random() * 20),
          complianceScore: 85 + Math.round(Math.random() * 12),
          onTimeRate: 0.9 + Math.random() * 0.08,
          defectRate: Math.random() * 0.03,
          invoiceAccuracy: 0.95 + Math.random() * 0.04,
        },
        riskScore: 10 + Math.round(Math.random() * 30),
        riskFactors: [],
        createdAt: now,
        updatedAt: now,
      });
      vendorIds.push(vendorId);
    }

    return {
      vendorIds,
      count: vendorIds.length,
      message: `Created ${vendorIds.length} vendors`,
    };
  },
});

// Seed diversity targets
export const seedDiversityTargets = mutation({
  args: {
    universityId: v.id("universities"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const fiscalYear = new Date().getFullYear();
    const targetIds = [];

    for (const target of COLUMBIA_DIVERSITY_TARGETS) {
      // Calculate current amounts (50-90% of target achieved)
      const achievedPercent = 0.5 + Math.random() * 0.4;
      const currentAmount = Math.round(target.targetAmount * achievedPercent);
      const currentPercent = target.targetPercent * achievedPercent;
      const gapPercent = Math.max(0, target.targetPercent - currentPercent);
      const gapAmount = Math.max(0, target.targetAmount - currentAmount);

      const targetId = await ctx.db.insert("diversitySpendTargets", {
        universityId: args.universityId,
        fiscalYear,
        diversityType: target.diversityType as any,
        targetPercent: target.targetPercent,
        targetAmount: target.targetAmount,
        currentPercent,
        currentAmount,
        gapPercent,
        gapAmount,
        meetsTarget: currentPercent >= target.targetPercent,
        lastCalculatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      targetIds.push(targetId);
    }

    return {
      targetIds,
      count: targetIds.length,
      message: `Created ${targetIds.length} diversity targets`,
    };
  },
});

// Seed sustainability targets
export const seedSustainabilityTargets = mutation({
  args: {
    universityId: v.id("universities"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const fiscalYear = new Date().getFullYear();
    const targetIds = [];

    for (const target of COLUMBIA_SUSTAINABILITY_TARGETS) {
      // Calculate current amounts
      const achievedPercent = 0.6 + Math.random() * 0.3;
      const currentAmount = Math.round(target.targetAmount * achievedPercent);
      const currentPercent = target.targetPercent * achievedPercent;
      const gapPercent = Math.max(0, target.targetPercent - currentPercent);
      const gapAmount = Math.max(0, target.targetAmount - currentAmount);

      const targetId = await ctx.db.insert("sustainabilitySpendTargets", {
        universityId: args.universityId,
        fiscalYear,
        category: target.category as any,
        targetPercent: target.targetPercent,
        targetAmount: target.targetAmount,
        currentPercent,
        currentAmount,
        gapPercent,
        gapAmount,
        meetsTarget: currentPercent >= target.targetPercent,
        carbonImpactKg: target.category === "carbon_neutral" ? 1_234_567 : undefined,
        lastCalculatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      targetIds.push(targetId);
    }

    return {
      targetIds,
      count: targetIds.length,
      message: `Created ${targetIds.length} sustainability targets`,
    };
  },
});

// Full seed for Columbia - runs all seed functions
export const seedAllColumbiaData = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // 1. Create Columbia University
    const universityId = await ctx.db.insert("universities", {
      name: "Columbia University",
      type: "R1",
      region: "Northeast",
      annualSpend: 1_200_000_000,
      settings: {
        diversityTarget: 15,
        sustainabilityTarget: 20,
        autoApprovalLimit: 2500,
        timezone: "America/New_York",
      },
      subscription: {
        plan: "performance",
        monthlyFee: 0,
        savingsSharePercent: 36,
        startDate: now,
        cap: 1_500_000,
      },
      integrations: {
        procurementSystem: "Jaggaer",
        erpSystem: "Workday",
        slackWorkspace: "columbia-procurement",
      },
      createdAt: now,
      updatedAt: now,
    });

    // Track created records
    const created = {
      universityId,
      spendingCategories: 0,
      costCenters: 0,
      vendors: 0,
      diversityTargets: 0,
      sustainabilityTargets: 0,
    };

    // 2. Create spending categories
    for (const cat of COLUMBIA_SPENDING_CATEGORIES) {
      await ctx.db.insert("spendingCategories", {
        universityId,
        code: cat.code,
        name: cat.name,
        description: cat.description,
        annualBudget: cat.annualBudget,
        percentOfTotalTarget: cat.percentOfTotalTarget,
        glCodePrefix: cat.glCodePrefix,
        unspscCodes: cat.unspscCodes,
        diversityTargetPercent: cat.diversityTargetPercent,
        sustainabilityTargetPercent: cat.sustainabilityTargetPercent,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      created.spendingCategories++;
    }

    // 3. Create cost centers
    const fiscalYear = new Date().getFullYear();
    for (const cc of COLUMBIA_COST_CENTERS) {
      const spentPercent = 0.6 + Math.random() * 0.25;
      const committedPercent = 0.05 + Math.random() * 0.1;
      const spentAmount = Math.round(cc.allocatedBudget * spentPercent);
      const committedAmount = Math.round(cc.allocatedBudget * committedPercent);

      await ctx.db.insert("costCenters", {
        universityId,
        code: cc.code,
        name: cc.name,
        department: cc.department,
        fiscalYear,
        allocatedBudget: cc.allocatedBudget,
        spentAmount,
        committedAmount,
        availableAmount: cc.allocatedBudget - spentAmount - committedAmount,
        utilizationPercent: ((spentAmount + committedAmount) / cc.allocatedBudget) * 100,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      created.costCenters++;
    }

    // 4. Create vendors
    for (const vendor of COLUMBIA_TOP_VENDORS) {
      await ctx.db.insert("vendors", {
        name: vendor.name,
        code: vendor.code,
        type: vendor.type as "distributor" | "manufacturer" | "reseller",
        categories: vendor.categories,
        diversityStatus: vendor.diversityStatus as any[],
        certifications: [],
        sustainability: {
          rating: vendor.diversityStatus.length > 0 ? "Good" : undefined,
          certifications: [],
        },
        contact: {
          email: `sales@${vendor.code.toLowerCase()}.com`,
        },
        integration: {
          type: "api",
          syncStatus: "active",
          lastSyncAt: now,
        },
        performance: {
          overallScore: 75 + Math.round(Math.random() * 20),
          priceScore: 70 + Math.round(Math.random() * 25),
          qualityScore: 75 + Math.round(Math.random() * 20),
          deliveryScore: 80 + Math.round(Math.random() * 15),
          serviceScore: 75 + Math.round(Math.random() * 20),
          complianceScore: 85 + Math.round(Math.random() * 12),
          onTimeRate: 0.9 + Math.random() * 0.08,
          defectRate: Math.random() * 0.03,
          invoiceAccuracy: 0.95 + Math.random() * 0.04,
        },
        riskScore: 10 + Math.round(Math.random() * 30),
        riskFactors: [],
        createdAt: now,
        updatedAt: now,
      });
      created.vendors++;
    }

    // 5. Create diversity targets
    for (const target of COLUMBIA_DIVERSITY_TARGETS) {
      const achievedPercent = 0.5 + Math.random() * 0.4;
      const currentAmount = Math.round(target.targetAmount * achievedPercent);
      const currentPercent = target.targetPercent * achievedPercent;

      await ctx.db.insert("diversitySpendTargets", {
        universityId,
        fiscalYear,
        diversityType: target.diversityType as any,
        targetPercent: target.targetPercent,
        targetAmount: target.targetAmount,
        currentPercent,
        currentAmount,
        gapPercent: Math.max(0, target.targetPercent - currentPercent),
        gapAmount: Math.max(0, target.targetAmount - currentAmount),
        meetsTarget: currentPercent >= target.targetPercent,
        lastCalculatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      created.diversityTargets++;
    }

    // 6. Create sustainability targets
    for (const target of COLUMBIA_SUSTAINABILITY_TARGETS) {
      const achievedPercent = 0.6 + Math.random() * 0.3;
      const currentAmount = Math.round(target.targetAmount * achievedPercent);
      const currentPercent = target.targetPercent * achievedPercent;

      await ctx.db.insert("sustainabilitySpendTargets", {
        universityId,
        fiscalYear,
        category: target.category as any,
        targetPercent: target.targetPercent,
        targetAmount: target.targetAmount,
        currentPercent,
        currentAmount,
        gapPercent: Math.max(0, target.targetPercent - currentPercent),
        gapAmount: Math.max(0, target.targetAmount - currentAmount),
        meetsTarget: currentPercent >= target.targetPercent,
        carbonImpactKg: target.category === "carbon_neutral" ? 1_234_567 : undefined,
        lastCalculatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      created.sustainabilityTargets++;
    }

    return {
      success: true,
      message: "Columbia University seed data created successfully",
      created,
    };
  },
});
