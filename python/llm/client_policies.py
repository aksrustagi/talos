"""
Talos AI — Client-Specific Policy Templates

Policy blocks injected into agent system prompts based on client type.
Each client has distinct approval thresholds, regulations, preferred vendors,
and procurement system integrations.
"""

CLIENT_POLICIES: dict[str, dict] = {
    "university": {
        "name": "Ivy League University",
        "approval_thresholds": """
APPROVAL THRESHOLDS:
- $0-$10,000: Auto-approve if on-contract and within budget
- $10,001-$50,000: Department head approval
- $50,001-$100,000: Dean/VP approval
- $100,001-$500,000: VP Finance + Provost
- $500,001-$1,000,000: CFO
- >$1,000,000: Board of Trustees""",
        "regulations": """
REGULATIONS:
- Federal grants: 2 CFR 200 (Uniform Guidance) — equipment >$5K = capital asset
- Must use federal per diem for travel on grants
- No alcohol on federal grants
- Prior approval needed for: foreign travel, equipment >$5K, participant support
- Sole source on federal grants requires documented justification
- Export controls: ITAR/EAR screening for dual-use items (lasers, encryption, drones, certain chemicals)
- Tax-exempt institution — all purchases must be tax-free
- E&I Cooperative and GSA Schedule pricing preferred""",
        "preferred_vendors": """
PREFERRED VENDORS:
- Office supplies: Staples (cooperative contract)
- Lab supplies: Fisher Scientific, VWR (E&I cooperative)
- IT hardware: Dell, Apple, CDW-G (institutional agreements)
- Furniture: Steelcase (institutional contract)
- Scientific equipment: Check E&I Cooperative catalog first
- Software: Check institutional site licenses before purchasing""",
        "procurement_system": "Jaggaer + PeopleSoft",
    },
    "nypa": {
        "name": "NY Power Authority",
        "approval_thresholds": """
APPROVAL THRESHOLDS:
- $0-$25,000: Manager approval
- $25,001-$100,000: Director approval
- $100,001-$500,000: VP + Procurement Director
- $500,001-$2,000,000: EVP + CFO
- >$2,000,000: Board of Trustees""",
        "regulations": """
REGULATIONS:
- NY State Finance Law Section 163 governs all procurement
- Public Authority Accountability Act compliance required
- MWBE goals: 30% of applicable procurement to M/WBE vendors
- SDVOB goals: 6% to Service-Disabled Veteran-Owned Business
- Wicks Law: Construction >$50K requires separate electrical, plumbing, HVAC bids
- Davis-Bacon prevailing wage for federally funded construction
- NERC CIP compliance for cyber-related procurement
- Environmental review required for generation/transmission equipment
- Bond covenant compliance for capital projects""",
        "preferred_vendors": """
PREFERRED VENDORS:
- Check NYS OGS contracts first
- MRO supplies: Grainger, MSC Industrial (statewide contracts)
- Fleet: NYS vehicle contracts
- IT: NYS OGS IT umbrella contracts
- Engineering services: Pre-qualified vendor list""",
        "procurement_system": "SAP Ariba / SAP S/4HANA",
    },
    "northwell": {
        "name": "Northwell Health System",
        "approval_thresholds": """
APPROVAL THRESHOLDS:
- $0-$5,000: Auto-approve if on GPO contract
- $5,001-$25,000: Department manager
- $25,001-$100,000: Service line VP
- $100,001-$500,000: VP Supply Chain + CFO
- $500,001-$2,000,000: C-suite committee
- >$2,000,000: Board approval""",
        "regulations": """
REGULATIONS:
- FDA 510(k) clearance verification for Class II/III medical devices
- 340B Drug Pricing Program compliance and split billing
- GPO contract compliance — MUST use Vizient/Premier pricing when available
- Joint Commission standards for clinical supplies
- CMS Conditions of Participation for equipment affecting patient care
- HIPAA Business Associate Agreement required for ANY vendor accessing PHI
- Infection Control Committee review for items entering sterile environments
- Controlled substance chain-of-custody requirements
- Medical device serial/lot/expiration tracking""",
        "preferred_vendors": """
PREFERRED VENDORS:
- Clinical supplies: Vizient GPO contracts (primary), Premier (secondary)
- Pharma: McKesson, Cardinal Health (distribution), 340B-eligible manufacturers
- Medical devices: Check GPO committed contracts first
- IT: Enterprise agreements (Epic-compatible vendors preferred)
- Facilities: Pre-qualified contractor list""",
        "procurement_system": "Coupa + Epic (clinical)",
    },
}


def build_agent_prompt(agent_name: str, base_prompt: str, client_type: str) -> str:
    """Inject client-specific policies into agent prompt template.

    Replaces {client_name}, {approval_thresholds}, {regulations},
    {preferred_vendors}, and {procurement_system} placeholders.
    """
    policies = CLIENT_POLICIES.get(client_type, CLIENT_POLICIES["university"])
    return base_prompt.format(
        client_name=policies["name"],
        approval_thresholds=policies.get("approval_thresholds", ""),
        regulations=policies.get("regulations", ""),
        preferred_vendors=policies.get("preferred_vendors", ""),
        procurement_system=policies.get("procurement_system", ""),
    )
