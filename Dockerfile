# Talos Procurement AI Platform - Multi-stage Docker Build
# Builds both TypeScript (Hono) and Python (FastAPI) services

# ===========================================
# Stage 1: Node.js Builder
# ===========================================
FROM node:20-alpine AS node-builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
COPY convex/ ./convex/

RUN npm run build

# ===========================================
# Stage 2: Python Builder
# ===========================================
FROM python:3.11-slim AS python-builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
COPY python/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# ===========================================
# Stage 3: TypeScript Runtime
# ===========================================
FROM node:20-alpine AS ts-runtime

WORKDIR /app

# Copy built artifacts
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/dist ./dist
COPY --from=node-builder /app/convex ./convex
COPY package.json ./

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "dist/server.js"]

# ===========================================
# Stage 4: Python Runtime
# ===========================================
FROM python:3.11-slim AS python-runtime

WORKDIR /app

# Copy virtual environment
COPY --from=python-builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy Python application
COPY python/ ./python/

# Set Python path
ENV PYTHONPATH=/app/python

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]

# ===========================================
# Stage 5: Combined Runtime (default)
# ===========================================
FROM python:3.11-slim AS combined

WORKDIR /app

# Install Node.js
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Copy Python virtual environment
COPY --from=python-builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy Node.js artifacts
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/dist ./dist
COPY --from=node-builder /app/convex ./convex
COPY package.json ./

# Copy Python application
COPY python/ ./python/

# Set Python path
ENV PYTHONPATH=/app/python

# Copy startup script
COPY scripts/start.sh ./start.sh
RUN chmod +x ./start.sh

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health && curl -f http://localhost:8000/api/health || exit 1

EXPOSE 3000 8000

CMD ["./start.sh"]
