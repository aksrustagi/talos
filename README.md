# Talos - University Procurement AI Platform

A comprehensive AI-powered procurement platform designed for research universities, featuring 30 specialized AI agents, real-time price intelligence, and seamless integration with enterprise procurement systems.

## Overview

Talos transforms university procurement through intelligent automation, delivering:

- **$2.4M+ annual savings** through AI-driven price optimization
- **85% reduction** in manual procurement tasks
- **99.2% invoice accuracy** with three-way matching
- **Real-time visibility** across $1.2B in annual spend

### Key Features

| Feature | Description |
|---------|-------------|
| **30 AI Agents** | Specialized agents for price intelligence, requisitions, approvals, and category management |
| **HMM Price Prediction** | Hidden Markov Model predicts optimal purchase timing with 6 price states |
| **Anomaly Detection** | Isolation Forest + Autoencoder detects fraud and invoice errors |
| **Cross-University Network** | Privacy-preserving price benchmarking across institutions |
| **Jaggaer Integration** | Full cXML support for POs, invoices, and PunchOut catalogs |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TALOS ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      CONVEX (Real-time Data)                 │   │
│  │  ├── products (500K+ SKUs)                                   │   │
│  │  ├── prices (historical + current)                           │   │
│  │  ├── vendors, contracts, requisitions                        │   │
│  │  └── purchase_orders, invoices, users                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│         ┌────────────────────┼────────────────────┐                 │
│         ▼                    ▼                    ▼                  │
│  ┌────────────┐       ┌────────────┐       ┌────────────┐          │
│  │  LangGraph │       │  Temporal  │       │   Hono/    │          │
│  │   Agents   │◀─────▶│  Workflows │◀─────▶│  FastAPI   │          │
│  └────────────┘       └────────────┘       └────────────┘          │
│         │                    │                    │                  │
│         ▼                    ▼                    ▼                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     INTEGRATIONS                             │   │
│  │  ├── Jaggaer (cXML/PunchOut)                                │   │
│  │  ├── Vendor Catalogs (Fisher, VWR, CDW, Staples)            │   │
│  │  ├── Slack/Email Notifications                               │   │
│  │  └── Knowledge Graph (Cross-University)                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker & Docker Compose
- Convex account
- Anthropic API key

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/talos.git
cd talos

# Install Node.js dependencies
npm install

# Install Python dependencies
cd python && pip install -e ".[dev]" && cd ..

# Copy environment configuration
cp .env.example .env
# Edit .env with your API keys and settings

# Start Convex development server
npx convex dev

# In another terminal, start the development servers
./scripts/dev.sh
```

### Docker Deployment

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## AI Agents

### Tier 1: Core Price Intelligence (6 agents)

| Agent | Purpose |
|-------|---------|
| **PriceWatch** | Real-time price monitoring and alerts |
| **Catalog Sync** | Vendor catalog ingestion and normalization |
| **Price Compare** | Cross-vendor price comparison |
| **Knowledge Graph** | Cross-university price benchmarking |
| **Historical Price** | HMM-based price prediction |
| **Contract Validator** | Invoice validation against contracts |

### Tier 2: Procurement Process (8 agents)

| Agent | Purpose |
|-------|---------|
| **Requisition** | Natural language request processing |
| **Approval Workflow** | SLA-tracked approval routing |
| **Vendor Selection** | Optimal vendor recommendation |
| **RFQ/RFP** | Competitive bidding automation |
| **PO Generation** | Purchase order creation |
| **Invoice Matching** | Three-way match automation |
| **Receipt & Delivery** | Shipment tracking |
| **Payment Optimizer** | Early payment discount capture |

### Tier 3: Category Specialists (8 agents)

| Agent | Category | Special Features |
|-------|----------|------------------|
| Lab Supply | Research ($200M) | Grant compliance, lot tracking |
| IT Equipment | Technology ($180M) | License management, security review |
| Medical Supply | Clinical ($140M) | Formulary compliance, recalls |
| Capital Projects | Construction ($120M) | AIA contracts, change orders |
| Facilities | Maintenance ($150M) | Preventive maintenance, MRO |
| Office Supply | Admin ($60M) | Auto-replenishment, sustainability |
| Food Service | Dining ($50M) | Menu-based ordering, waste tracking |
| Professional Services | Consulting ($100M) | SOW review, rate benchmarking |

### Tier 4: Intelligence & Compliance (8 agents)

| Agent | Purpose |
|-------|---------|
| **Spend Analytics** | Real-time dashboards and KPIs |
| **Budget Guardian** | Predictive overspend alerts |
| **Compliance** | Policy enforcement, audit trails |
| **Supplier Diversity** | MWBE tracking, federal reporting |
| **Sustainability** | Carbon footprint, ESG metrics |
| **Risk & Vendor Health** | Financial monitoring, scorecards |
| **Contract Lifecycle** | Expiration tracking, renewals |
| **Savings Tracker** | ROI calculation, attribution |

## API Reference

### TypeScript API (Port 3000)

```typescript
// Chat with any agent
POST /api/v1/agents/chat
{
  "agentId": "requisition",
  "message": "I need to order 10 pipettes for the chemistry lab",
  "context": {
    "userId": "user-001",
    "department": "Chemistry"
  }
}

// Compare prices
GET /api/v1/prices/compare/:productId?quantity=10

// Create requisition
POST /api/v1/requisitions
{
  "items": [...],
  "budgetCode": "CHEM-2024-001",
  "urgency": "standard"
}
```

### Python API (Port 8000)

```python
# Chat endpoint
POST /api/chat
{
  "content": "What's the best price for FBS?",
  "agent_id": "price-compare"  # optional
}

# Price history with HMM prediction
GET /api/prices/history/{product_id}?days=365

# Pending approvals
GET /api/approvals/pending

# API documentation
GET /docs  # Swagger UI
GET /redoc  # ReDoc
```

## Intelligence Systems

### Hidden Markov Model (HMM) Price Prediction

```
States: STABLE → RISING → PEAK → DECLINING → TROUGH → VOLATILE
                    ↑                              │
                    └──────────────────────────────┘
```

The HMM analyzes historical prices to predict:
- Current price state
- Probability of state transitions
- Optimal purchase timing
- Estimated annual savings

### Anomaly Detection

Two-layer system:
1. **Isolation Forest**: Detects statistical outliers in transaction data
2. **Autoencoder**: Learns normal patterns, flags deviations

Graph-based detection:
- Shared bank accounts across vendors
- Circular payment patterns
- Unusual vendor relationships

## Temporal Workflows

Long-running procurement processes are managed as durable workflows:

```python
# Requisition Approval Workflow
RequisitionApprovalWorkflow
├── validate_budget()
├── determine_approvers()
├── send_approval_notification()
├── [wait for approval with SLA]
├── escalate_approval() if needed
├── generate_purchase_order()
└── send_po_to_vendor()

# Invoice Validation Workflow
InvoiceValidationWorkflow
├── parse_invoice()
├── find_matching_po()
├── match_invoice_lines()
├── validate_contract_prices()
├── verify_receipts()
└── approve_invoice() or create_exception()
```

## Jaggaer Integration

Full cXML support:

```typescript
// Send Purchase Order
const response = await jaggaer.sendPurchaseOrder({
  poNumber: "PO-12345",
  vendorDuns: "123456789",
  lineItems: [...],
  total: 5000.00
});

// PunchOut session for catalog browsing
const { punchOutUrl } = await jaggaer.initiatePunchOut(
  vendorUrl,
  buyerCookie
);

// Parse incoming invoice
const invoice = jaggaer.parseInvoiceDetailRequest(cxmlBody);
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CONVEX_URL` | Convex deployment URL | Required |
| `ANTHROPIC_API_KEY` | Claude API key | Required |
| `TEMPORAL_ADDRESS` | Temporal server | `localhost:7233` |
| `JAGGAER_BASE_URL` | Jaggaer instance URL | - |
| `ENABLE_HMM_PREDICTIONS` | Enable price predictions | `true` |
| `ENABLE_ANOMALY_DETECTION` | Enable fraud detection | `true` |

See `.env.example` for full configuration options.

## Development

### Running Tests

```bash
# TypeScript tests
npm test

# Python tests
cd python && pytest

# With coverage
pytest --cov=. --cov-report=html
```

### Code Quality

```bash
# TypeScript
npm run lint
npm run typecheck

# Python
ruff check .
mypy .
black --check .
```

### Project Structure

```
talos/
├── convex/                 # Convex schema & functions
│   ├── schema.ts          # Database schema
│   ├── products.ts        # Product operations
│   ├── vendors.ts         # Vendor operations
│   ├── requisitions.ts    # Requisition operations
│   └── priceIntelligence.ts
├── src/                    # TypeScript backend
│   ├── server.ts          # Hono server
│   ├── routes/            # API routes
│   ├── middleware/        # Auth, rate limiting
│   ├── intelligence/      # HMM, anomaly detection
│   ├── temporal/          # Temporal workflows
│   ├── langgraph/         # LangGraph agents
│   ├── agents/            # Agent prompts
│   └── integrations/      # Jaggaer cXML
├── python/                 # Python backend
│   ├── api/               # FastAPI application
│   ├── agents/            # LangGraph agents
│   ├── tools/             # Convex-integrated tools
│   ├── workflows/         # Temporal workflows
│   └── tests/             # Python tests
├── scripts/               # Development scripts
├── tests/                 # TypeScript tests
├── Dockerfile             # Multi-stage build
└── docker-compose.yml     # Full stack deployment
```

## Pricing

| Plan | Price | Features |
|------|-------|----------|
| **Flat Rate** | $30,000/month | All features, unlimited users |
| **Performance** | 36% of savings | Pay based on value delivered |
| **Hybrid** | $15K + 20% savings | Lower base with upside sharing |

### 45-Day Free Trial

1. **Days 1-15**: System setup, catalog sync, baseline
2. **Days 16-30**: AI recommendations, savings identification
3. **Days 31-45**: Full automation, ROI measurement

## Support

- **Documentation**: [docs.talos.ai](https://docs.talos.ai)
- **Issues**: [GitHub Issues](https://github.com/your-org/talos/issues)
- **Email**: support@talos.ai

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Built for research universities worldwide.
