# Puppeteer browser container for Molbot
FROM node:20-alpine

LABEL maintainer="molbot"
LABEL description="Headless browser automation for AI agents using Puppeteer"

# Install required dependencies for Chromium on Alpine
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    wget

# Install Puppeteer
RUN npm install -g puppeteer

# Create workspace directory
RUN mkdir -p /workspace

WORKDIR /workspace

# Expose HTTP wrapper port
EXPOSE 9222

# Copy wrapper.js HTTP server
COPY puppeteer-wrapper/wrapper.js /usr/local/lib/puppeteer-wrapper/

# Health check using the HTTP wrapper
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget --quiet --tries=1 --timeout=5 http://localhost:9222/health || exit 1

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Start HTTP wrapper server
CMD ["node", "/usr/local/lib/puppeteer-wrapper/wrapper.js"]
