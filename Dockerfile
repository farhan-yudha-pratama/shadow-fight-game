# ==========================================
# Dockerfile - Duel Bayangan (Production)
# Ready for Dokploy / Docker deployment
# ==========================================

FROM node:20-alpine AS base

# Install curl for container healthcheck
RUN apk add --no-cache curl

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy package manifests first for Docker layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev && npm cache clean --force

# Copy application source code
COPY server/ ./server/
COPY public/ ./public/

# Use non-root node user for container security
USER node

# Expose server port
EXPOSE 3000

# Container healthcheck for Dokploy monitoring
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/healthz || exit 1

# Start server
CMD ["node", "server/index.js"]
