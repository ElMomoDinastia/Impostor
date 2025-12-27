# Use Puppeteer's official image with Chrome pre-installed
FROM ghcr.io/puppeteer/puppeteer:latest

# Switch to root to set up the app
USER root

# Set working directory
WORKDIR /app

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Copy package files first (for better caching)
COPY package*.json ./

# Install dependencies (production only to reduce image size)
RUN npm ci --omit=dev

# Copy source files
COPY tsconfig.json ./

# We need typescript for build, install it temporarily
RUN npm install -g typescript

# Copy and build
COPY src ./src
RUN tsc

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
