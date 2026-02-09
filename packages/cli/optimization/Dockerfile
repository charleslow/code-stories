FROM node:22-slim

# Install git and curl (needed for commit hash, repo cloning, and cert download)
RUN apt-get update && apt-get install -y git curl ca-certificates && rm -rf /var/lib/apt/lists/*

# Avoid Cloudflare SSL issues
RUN curl -fsS -o /usr/local/share/ca-certificates/Cloudflare_CA.crt \
    "https://seed-general-public-files.s3.ap-southeast-1.amazonaws.com/seed-cloudflare-root-certs/Cloudflare_CA.pem" \
    && update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

# Install Claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Set up working directory
WORKDIR /app

# Copy the CLI package
COPY package.json ./
RUN npm install

COPY index.js ./
RUN chmod +x index.js

# Copy optimization files
COPY optimization/ ./optimization/

# Initialize a git repo so the CLI can get a commit hash
RUN git config --global user.email "optimizer@code-stories" && \
    git config --global user.name "Optimizer" && \
    git config --system --add safe.directory /app && \
    git config --system --add safe.directory '*' && \
    git init && git add -A && git commit -m "init" --allow-empty

# Create non-root user (claude CLI refuses --dangerously-skip-permissions as root)
RUN useradd -m -s /bin/bash coder

# Create stories output directory and set ownership
RUN mkdir -p stories && chown -R coder:coder /app

# Pre-create claude config dir so volume mounts inherit correct ownership
RUN mkdir -p /home/coder/.claude && chown -R coder:coder /home/coder

USER coder
ENV HOME=/home/coder

ENTRYPOINT ["node", "optimization/optimize.mjs"]
