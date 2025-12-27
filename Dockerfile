# ============================================
# Stage 1: Build with all dependencies
# ============================================
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for TypeScript)
RUN npm ci

# Copy source and config
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# ============================================
# Stage 2: Production with Puppeteer/Chrome
# ============================================
FROM ghcr.io/puppeteer/puppeteer:latest

# Switch to root to set up the app
USER root

WORKDIR /app

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Copy package files and install production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Create logs directory and set ownership
RUN mkdir -p logs && chown -R pptruser:pptruser /app

# Switch back to non-root user for security
USER pptruser

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose health check port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Run the application
CMD ["node", "dist/index.js"]
