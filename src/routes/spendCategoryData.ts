/**
 * Columbia University Spending Categories
 *
 * $1.2B Annual Procurement Budget Breakdown
 * Based on typical R1 research university spending patterns
 */

export const SPENDING_CATEGORIES = {
  RESEARCH_LAB_SUPPLIES: {
    code: "RESEARCH_LAB",
    name: "Research & Lab Supplies",
    annualBudget: 280_000_000,
    percentOfTotal: 23.3,
    description: "Scientific equipment, reagents, consumables, lab apparatus",
    unspscCodes: ["41100000", "41110000", "41120000"],
    typicalVendors: ["Fisher Scientific", "VWR", "Sigma-Aldrich", "Thermo Fisher"],
  },
  IT_TECHNOLOGY: {
    code: "IT_TECH",
    name: "IT & Technology",
    annualBudget: 180_000_000,
    percentOfTotal: 15.0,
    description: "Hardware, software licenses, cloud services, networking",
    unspscCodes: ["43200000", "43210000", "43230000"],
    typicalVendors: ["Dell", "Apple", "CDW", "Microsoft", "AWS"],
  },
  FACILITIES_MAINTENANCE: {
    code: "FACILITIES",
    name: "Facilities & Maintenance",
    annualBudget: 150_000_000,
    percentOfTotal: 12.5,
    description: "Building maintenance, repairs, HVAC, custodial services",
    unspscCodes: ["72100000", "72150000", "47130000"],
    typicalVendors: ["Grainger", "Johnson Controls", "Siemens", "ABM"],
  },
  MEDICAL_CLINICAL: {
    code: "MEDICAL",
    name: "Medical/Clinical Supplies",
    annualBudget: 140_000_000,
    percentOfTotal: 11.7,
    description: "Medical devices, pharmaceuticals, clinical supplies",
    unspscCodes: ["42000000", "42130000", "42140000"],
    typicalVendors: ["McKesson", "Cardinal Health", "Henry Schein"],
  },
  CONSTRUCTION_CAPITAL: {
    code: "CONSTRUCTION",
    name: "Construction & Capital Projects",
    annualBudget: 120_000_000,
    percentOfTotal: 10.0,
    description: "New construction, major renovations, capital improvements",
    unspscCodes: ["72000000", "30100000", "30150000"],
    typicalVendors: ["Turner Construction", "Skanska", "Lendlease"],
  },
  PROFESSIONAL_SERVICES: {
    code: "PROF_SERVICES",
    name: "Professional Services",
    annualBudget: 100_000_000,
    percentOfTotal: 8.3,
    description: "Consulting, legal, accounting, temporary staffing",
    unspscCodes: ["80100000", "80110000", "80120000"],
    typicalVendors: ["Deloitte", "McKinsey", "PwC", "Baker McKenzie"],
  },
  OFFICE_ADMINISTRATIVE: {
    code: "OFFICE_ADMIN",
    name: "Office & Administrative",
    annualBudget: 60_000_000,
    percentOfTotal: 5.0,
    description: "Office supplies, furniture, printing, mail services",
    unspscCodes: ["44100000", "56100000", "82100000"],
    typicalVendors: ["Staples", "Office Depot", "Amazon Business"],
  },
  FOOD_SERVICES: {
    code: "FOOD",
    name: "Food Services",
    annualBudget: 50_000_000,
    percentOfTotal: 4.2,
    description: "Dining services, catering, food supplies",
    unspscCodes: ["50000000", "90100000"],
    typicalVendors: ["Aramark", "Sodexo", "Compass Group"],
  },
  UTILITIES_ENERGY: {
    code: "UTILITIES",
    name: "Utilities & Energy",
    annualBudget: 45_000_000,
    percentOfTotal: 3.75,
    description: "Electricity, gas, water, renewable energy",
    unspscCodes: ["15100000", "83100000"],
    typicalVendors: ["ConEdison", "National Grid", "Green Power"],
  },
  TRANSPORTATION_FLEET: {
    code: "TRANSPORT",
    name: "Transportation & Fleet",
    annualBudget: 35_000_000,
    percentOfTotal: 2.9,
    description: "Vehicle fleet, shuttles, logistics, freight",
    unspscCodes: ["25100000", "78100000"],
    typicalVendors: ["Enterprise", "FedEx", "UPS", "Hertz"],
  },
  MARKETING_EVENTS: {
    code: "MARKETING",
    name: "Marketing & Events",
    annualBudget: 25_000_000,
    percentOfTotal: 2.1,
    description: "Marketing materials, events, conferences, recruitment",
    unspscCodes: ["82100000", "80140000"],
    typicalVendors: ["Omnicom", "WPP", "Local Events Co"],
  },
  OTHER: {
    code: "OTHER",
    name: "Other/Miscellaneous",
    annualBudget: 15_000_000,
    percentOfTotal: 1.25,
    description: "Miscellaneous purchases not in other categories",
    unspscCodes: ["99000000"],
    typicalVendors: ["Various"],
  },
} as const;

export const TOTAL_ANNUAL_SPEND = 1_200_000_000; // $1.2B

export type SpendingCategoryCode = keyof typeof SPENDING_CATEGORIES;
export type SpendingCategory = typeof SPENDING_CATEGORIES[SpendingCategoryCode];

/**
 * Columbia University Cost Centers
 * Mapped to academic and administrative units
 */
export const COST_CENTERS = {
  // Academic Units
  CPMS: { code: "CC-CPMS", name: "College of Physicians & Surgeons", type: "academic" },
  SEAS: { code: "CC-SEAS", name: "Fu Foundation School of Engineering", type: "academic" },
  ARTS_SCIENCES: { code: "CC-A&S", name: "Arts & Sciences", type: "academic" },
  CBS: { code: "CC-CBS", name: "Columbia Business School", type: "academic" },
  MSPH: { code: "CC-MSPH", name: "Mailman School of Public Health", type: "academic" },
  LAW: { code: "CC-LAW", name: "Law School", type: "academic" },
  TC: { code: "CC-TC", name: "Teachers College", type: "academic" },
  GSAPP: { code: "CC-GSAPP", name: "Graduate School of Architecture", type: "academic" },
  SSW: { code: "CC-SSW", name: "School of Social Work", type: "academic" },
  JOURNALISM: { code: "CC-JOUR", name: "Journalism School", type: "academic" },

  // Administrative Units
  FACILITIES: { code: "CC-FACIL", name: "Facilities Management", type: "administrative" },
  IT: { code: "CC-CUIT", name: "Columbia University IT", type: "administrative" },
  FINANCE: { code: "CC-FIN", name: "Finance & Administration", type: "administrative" },
  HR: { code: "CC-HR", name: "Human Resources", type: "administrative" },
  LIBRARY: { code: "CC-LIB", name: "University Libraries", type: "administrative" },
  ATHLETICS: { code: "CC-ATH", name: "Athletics", type: "administrative" },
  HOUSING: { code: "CC-HOUS", name: "Housing & Dining", type: "administrative" },
  PUBLIC_SAFETY: { code: "CC-PS", name: "Public Safety", type: "administrative" },
} as const;

/**
 * Diversity certification types
 */
export const DIVERSITY_TYPES = {
  MWBE: { code: "MWBE", name: "Minority/Women Business Enterprise", targetPercent: 15 },
  WBE: { code: "WBE", name: "Women Business Enterprise", targetPercent: 8 },
  MBE: { code: "MBE", name: "Minority Business Enterprise", targetPercent: 10 },
  SBE: { code: "SBE", name: "Small Business Enterprise", targetPercent: 20 },
  SDVOSB: { code: "SDVOSB", name: "Service-Disabled Veteran-Owned Small Business", targetPercent: 3 },
  HUBZone: { code: "HUBZone", name: "Historically Underutilized Business Zone", targetPercent: 3 },
  LGBT: { code: "LGBT", name: "LGBTQ+-Owned Business", targetPercent: 2 },
} as const;

/**
 * Sustainability certifications
 */
export const SUSTAINABILITY_CERTIFICATIONS = {
  ENERGY_STAR: { code: "ENERGY_STAR", name: "Energy Star", category: "energy_efficiency" },
  EPEAT: { code: "EPEAT", name: "EPEAT Certified", category: "electronics" },
  FSC: { code: "FSC", name: "FSC Certified", category: "sustainable_forestry" },
  GREEN_SEAL: { code: "GREEN_SEAL", name: "Green Seal", category: "cleaning_products" },
  CARBON_NEUTRAL: { code: "CARBON_NEUTRAL", name: "Carbon Neutral Certified", category: "emissions" },
  B_CORP: { code: "B_CORP", name: "B Corporation", category: "social_environmental" },
  LEED: { code: "LEED", name: "LEED Certified", category: "buildings" },
  CRADLE_TO_CRADLE: { code: "C2C", name: "Cradle to Cradle", category: "product_design" },
} as const;
