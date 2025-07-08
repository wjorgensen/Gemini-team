FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install gh -y

# Install Gemini CLI globally
RUN npm install -g @google/gemini-cli

# Create app user (non-root for security)
RUN groupadd -r gemini && useradd -r -g gemini -d /home/gemini -m gemini

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install project dependencies
RUN npm ci --only=production

# Install Playwright browsers
RUN npx playwright install --with-deps

# Copy the built application
COPY dist/ ./dist/
COPY deploy/ ./deploy/

# Create workspace directory with proper permissions
RUN mkdir -p /workspace && chown -R gemini:gemini /workspace

# Create logs directory
RUN mkdir -p /var/log/gemini-factory && chown -R gemini:gemini /var/log/gemini-factory

# Set up git configuration
USER gemini
RUN git config --global user.name "Gemini Coding Factory" \
    && git config --global user.email "gemini-factory@docker.local" \
    && git config --global init.defaultBranch main

# Expose webhook port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV WORKSPACE_ROOT=/workspace
ENV PORT=3000
ENV PLAYWRIGHT_BROWSERS_PATH=/home/gemini/.cache/ms-playwright

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Default command
CMD ["node", "dist/server.js"] 