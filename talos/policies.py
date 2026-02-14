"""
Talos Client Policies — Injected into agent prompts per client.

Game-changing decision #1: MULTI-CLIENT FROM DAY ONE
- Three real client profiles with actual regulations
- Same agents, different behavior via policy injection
- No code changes needed to onboard a new client vertical
"""

POLICIES = {

"university": {
    "name": "Ivy League University",
    "spend_profile": "$6B+ total operating spend, 17 schools, 200+ research labs",
    "approval_thresholds": """
- $0-$10,000: Auto-approve if on-contract and within budget
- $10,001-$50,000: Department head approval
- $50,001-$100,000: Dean/VP approval
- $100,001-$500,000: VP Finance + Provost
- $500,001-$1,000,000: CFO
- >$1,000,000: Board of Trustees""",

    "regulations": """
- Federal grants: 2 CFR 200 (Uniform Guidance)
  - Equipment >$5,000 on grants = capital asset, needs inventory tracking + prior approval
  - Must use federal per diem rates for travel
  - NO alcohol on federal grants ever
  - Prior approval needed for: foreign travel, equipment >$5K, participant support costs
  - Sole source on federal grants requires documented justification with 3 quotes or explanation
  - Cost-sharing commitments must be tracked and reported
- Export controls: ITAR/EAR screening for dual-use items (lasers, encryption hardware, certain chemicals, drones, high-performance computing)
- Tax-exempt institution — all purchases must be tax-free (provide tax-exempt certificate)
- Conflict of interest: Cannot purchase from companies where faculty/staff have financial interest without disclosure
- Environmental Health & Safety review for hazardous materials
- IACUC approval for animal research supplies
- IRB approval for human subjects research supplies""",

    "preferred_vendors": """
- Office supplies: Staples (cooperative contract, 20-40% off list)
- Lab supplies: Fisher Scientific, VWR/Avantor (E&I Cooperative pricing)
- IT hardware: Dell (institutional agreement), Apple (education pricing), CDW-G
- Furniture: Steelcase (institutional contract)
- Scientific equipment: Check E&I Cooperative Services catalog first
- Software: Check institutional site licenses before purchasing new
- Printing: University Print Services (internal)
- Catering: Approved caterer list only
- Travel: Contracted travel agency, preferred airline/hotel programs""",

    "competitive_bid_threshold": 100000,
    "procurement_system": "Jaggaer (procurement) + PeopleSoft (ERP/finance)",
},

"nypa": {
    "name": "New York Power Authority",
    "spend_profile": "$3B+ operations, 16 generating facilities, 1,400+ circuit-miles transmission",
    "approval_thresholds": """
- $0-$25,000: Manager approval
- $25,001-$100,000: Director approval
- $100,001-$500,000: VP + Procurement Director
- $500,001-$2,000,000: EVP + CFO
- >$2,000,000: Board of Trustees""",

    "regulations": """
- NY State Finance Law Section 163 governs all procurement
- Public Authority Accountability Act compliance required
- MWBE goals: 30% of applicable procurement to Minority/Women-Owned Business Enterprises
- SDVOB goals: 6% to Service-Disabled Veteran-Owned Business
- Wicks Law: Public construction >$50K requires separate electrical, plumbing, HVAC bids
- Davis-Bacon prevailing wage for federally funded construction
- NERC CIP compliance for cyber-related procurement (Critical Infrastructure Protection)
- FERC compliance for transmission-related procurement
- Environmental review (SEQRA) required for generation/transmission equipment
- Bond covenant compliance for capital projects
- Prevailing wage requirements for service contracts
- NYS Vendor Responsibility Questionnaire required for all vendors""",

    "preferred_vendors": """
- Check NYS OGS (Office of General Services) contracts first
- MRO supplies: Grainger, MSC Industrial (statewide contracts)
- Fleet vehicles: NYS vehicle contracts
- IT: NYS OGS IT umbrella contracts
- Engineering services: Pre-qualified vendor list
- Transformer equipment: ABB, Siemens, GE (qualified vendor list)
- Safety equipment: Pre-approved safety vendor list
- Fuel: State fuel contracts""",

    "competitive_bid_threshold": 50000,
    "procurement_system": "SAP Ariba + SAP S/4HANA",
},

"northwell": {
    "name": "Northwell Health System",
    "spend_profile": "$18.6B revenue, 21 hospitals, 900+ ambulatory sites, 90,000 employees",
    "approval_thresholds": """
- $0-$5,000: Auto-approve if on GPO contract
- $5,001-$25,000: Department manager
- $25,001-$100,000: Service line VP
- $100,001-$500,000: VP Supply Chain + CFO
- $500,001-$2,000,000: C-suite committee
- >$2,000,000: Board approval""",

    "regulations": """
- FDA 510(k) clearance verification required for all Class II/III medical devices before purchase
- 340B Drug Pricing Program compliance — split billing verification, eligible entity tracking
- GPO contract compliance — MUST use Vizient (primary) or Premier (secondary) pricing when available
- Joint Commission standards for clinical supplies and equipment
- CMS Conditions of Participation for equipment affecting patient care
- HIPAA Business Associate Agreement required for ANY vendor accessing Protected Health Information
- Infection Control Committee review required for items entering sterile environments
- Controlled substance chain-of-custody requirements (DEA Schedule tracking)
- Medical device serial number, lot number, and expiration date tracking (UDI compliance)
- Physician Sunshine Act reporting for vendor relationships
- Anti-kickback statute compliance
- Stark Law compliance for physician self-referral
- Blood-borne pathogen standard compliance for safety devices
- Latex-free alternatives required when available""",

    "preferred_vendors": """
- Clinical supplies: Vizient GPO contracts (primary), Premier (secondary)
- Pharma distribution: McKesson (primary), Cardinal Health (secondary)
- 340B-eligible drugs: Check 340B pricing first, split billing verification
- Medical devices: Check GPO committed contracts first, Value Analysis Committee approval for new devices
- IT: Enterprise agreements, Epic-compatible vendors preferred
- Facilities: Pre-qualified contractor list
- Lab: Quest Diagnostics (reference lab), Fisher Scientific (supplies)
- Food services: Contracted food service provider
- Linen: Contracted linen service""",

    "competitive_bid_threshold": 100000,
    "procurement_system": "Coupa (procurement) + Epic (clinical/supply chain)",
},

}


def get_policies(client_type: str) -> dict:
    return POLICIES.get(client_type, POLICIES["university"])
