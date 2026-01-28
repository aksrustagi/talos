/**
 * Inngest Functions Index
 *
 * All Inngest functions for the procurement AI system.
 */

// Price Discovery Functions
export {
  dailyPriceDiscovery,
  vendorCallForQuote,
} from "../agents/phase1/price-discovery";

// Vendor Intelligence Functions
export {
  quarterlyVendorReview,
  newVendorAssessment,
} from "../agents/phase1/vendor-intelligence";

// Email Communication Functions
export {
  processInboundEmail,
  sendQuoteRequestEmails,
} from "../agents/phase1/email-communication";

// Software License Functions
export {
  dailyLicenseUsageCheck,
  licenseRenewalApproaching,
  weeklyLicenseOptimization,
} from "../agents/phase1/software-license";

/**
 * All Inngest functions for registration with the Inngest client
 */
import {
  dailyPriceDiscovery,
  vendorCallForQuote,
} from "../agents/phase1/price-discovery";

import {
  quarterlyVendorReview,
  newVendorAssessment,
} from "../agents/phase1/vendor-intelligence";

import {
  processInboundEmail,
  sendQuoteRequestEmails,
} from "../agents/phase1/email-communication";

import {
  dailyLicenseUsageCheck,
  licenseRenewalApproaching,
  weeklyLicenseOptimization,
} from "../agents/phase1/software-license";

export const allFunctions = [
  // Price Discovery
  dailyPriceDiscovery,
  vendorCallForQuote,

  // Vendor Intelligence
  quarterlyVendorReview,
  newVendorAssessment,

  // Email Communication
  processInboundEmail,
  sendQuoteRequestEmails,

  // Software License
  dailyLicenseUsageCheck,
  licenseRenewalApproaching,
  weeklyLicenseOptimization,
];
